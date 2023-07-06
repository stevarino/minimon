/**
 * A generic trie datastructure that supports a json-like path structure and
 * wildcards, allowing for many-to-one mappings.
 */

import * as setLib from '../../setLib'
import { BiMap } from '../../lib';
import { BSTRoot } from './bst';

const numberPattern =  /^\d+$/;
const tokenSplitPattern = /\]\[|\[|\]|\./

export type TrieOptions = {collapseArrays: boolean, searchPrefixes: string[]};

/** A Trie node */
export class Trie<T> {
  parent: Trie<T> | null = null;
  root: TrieRoot<T> | null = null;
  children = new BiMap<string, Trie<T>>();
  path: string | undefined = undefined;
  fields: Set<string> = new Set();
  values = new Set<T>();

  constructor(parent: Trie<T>|null) {
    this.setParent(parent);
  }

  /** Return a FieldTrie given a (reversed) path */
  getOrCreate(path: string[]): Trie<T> {
    if (path.length === 0) {
      return this;
    }
    let child = path.pop() as string;
    let trie = this.children.get(child);
    if(trie === undefined) {
      trie = new Trie(this);
      this.children.set(child, trie);
    }
    return trie.getOrCreate(path);
  }

  /** Recursively find a set of packet id's (NOTE: path is reversed) */
  _find(path: string[], results: Trie<T>[]): void {
    if (path.length === 0) {
      // if (this.fields.size > 0 || this.values.size > 0) {
        results.push(this);
      // }  
      return;
    }
    let next = path[path.length-1];
    let rest = path.slice(0, -1);
    if (next === '*') {
      this.children.forEach(trie => {
        trie._find(rest, results);
      });
      return;
    }
    if (next === '**') {
      this.flatten([]).forEach(trie => {
        trie._find(rest, results);
      });
    }
    this.children.get(next)?._find(rest, results);
  }

  /** Updates an array with all children recursively */
  flatten(tries: Trie<T>[]) {
    this.children.forEach(trie => {
      tries.push(trie);
      trie.flatten(tries);
    });
    return tries;
  }

  /** Returns true if this node is has no fields or children associated with it */
  isSafeToRemove() {
    return this.fields.size === 0 && this.children.size == 0;
  }

  /** Remove ids from this trie */
  remove(other: Trie<T>) {
    setLib.differenceUpdate(this.values, other.values ?? []);
    if (this.isSafeToRemove()) {
      this.parent?.removeChild(this, [...this.fields]);
    }
  }

  /** remove a child and self if empty */
  removeChild(trie: Trie<T>|null, removedFields: string[]) {
    if (trie !== null) {
      if (!this.children.deleteReverse(trie)) {
        console.error('Unable to find child');
        return;
      }
      trie.setParent(null);
    }
    let me: Trie<T>|null = null;
    if (this.isSafeToRemove()) {
      me = this;
      removedFields.push(...this.fields);
    }
    this.parent?.removeChild(me, removedFields);
  }

  /** Recursively merge another Trie tree */
  merge(other: Trie<T>) {
    setLib.unionUpdate(this.fields, other.fields);
    setLib.unionUpdate(this.values, other.values);
    other.children.forEach((child, path) => {
      if (this.children.has(path)) {
        this.children.get(path)?.merge(child);
      } else {
        this.children.set(path, child);
        child.setParent(this);
      }
    });
  }

  /** Set parent and root properties */
  setParent(parent: Trie<T>|null) {
    this.parent = parent;
    this.root = parent?.root ?? null;
  }

  /** Add a non-normalized field */
  addPath(path: string) {
    this.fields.add(path);
    this.root?._lookup?.set(path, this);
  }

  /** Returns non-normalized fields */
  *getPaths() {
    yield* this.fields;
  }

  /** JSON interface for debugging */
  toJSON() {
    const children: {[key: string]: Trie<T>} = {};
    for (const [field, val] of this.children.entries()) {
      children[field] = val;
    }
    return {
      path: this.path,
      fields: [...this.fields],
      values: [...this.values],
      children
    }
  }
}

/** Institutes a trie root with mapping caches */
export class TrieRoot<T> extends Trie<T> {
  options: TrieOptions;
  // mapping of both normalized and non-normalized fields
  _lookup = new Map<string, Trie<T>>();
  // sorted datastructure of normalized fields
  _fieldsBST: BSTRoot<string>;

  constructor(options: TrieOptions) {
    super(null);
    this.options = options;
    this.root = this;
    this._fieldsBST = new BSTRoot<string>((a, b) => {
      if (a === b) return 0;
      for (const prefix of this.options.searchPrefixes) {
        const aP = a.startsWith(prefix);
        const bP = b.startsWith(prefix);
        if (aP && !bP) return -1;
        if (bP && !aP)  return 1;
      }
      return a < b ? -1 : 1;
    });
  }

  /** Remove a child and all gc associated fields */
  removeChild(trie: Trie<T> | null, fields: string[]): void {
    super.removeChild(trie, fields);
    fields.forEach(f => {
      this._lookup.delete(f);
    });
    if (trie?.path ?? false) {
      this._lookup.delete(trie?.path as string);
      this._fieldsBST.remove(trie?.path);
    }
  }

  /** convert a path to a normalized path */
  normalizePath(path: string[]) {
    if (this.options.collapseArrays) {
      path.forEach((val, i) => {
        if (numberPattern.test(val)) path[i] = '*';
      });
    }
  }

  /** Given a search string, return a list of nodes */
  find(search: string): Trie<T>[] {
    const path = search.replace(/\]$/, '').split(tokenSplitPattern).reverse();
    this.normalizePath(path);
    const results: Trie<T>[] = [];
    this._find(path, results);
    return results;
  }

  /** Add a node to the Trie */
  addNode(field: string, onNewBranch: (tempRoot: TrieRoot<T>) => void) {
    const path = field.replace(/\]$/, '').split(tokenSplitPattern).reverse();
    this.normalizePath(path);
    const normalizedField = this.options.collapseArrays ? path.slice().reverse().join('.'): field;
    let trie = this._lookup.get(normalizedField);
    if (trie === undefined) {
      // create a new root for limited `.find()` calls
      const r = new TrieRoot<T>(this.options);
      trie = r.getOrCreate([...path]);
      trie.path = normalizedField;
      onNewBranch(r);
      this._fieldsBST.insert(normalizedField);
      this._lookup.set(normalizedField, trie);
      this.merge(r);
    }
    trie.addPath(field);
    return trie;
  }

  /** Returns normalized, sorted paths */
  *getPaths() {
    yield* this._fieldsBST.getValues();
  }

  updateOptions(options: TrieOptions) {
    this.options = options;
  }
}