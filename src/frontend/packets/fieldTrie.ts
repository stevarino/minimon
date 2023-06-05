/**
 * FieldTrie - A trie data structure for storing observed fields.
 * 
 * Needed to support wildcard search.
 */

import * as setLib from '../../setLib'
import { BiMap } from '../../lib';
import { Packet } from './lib';
import { FilterItem, FilterSet } from './filters';

export class FieldTrie {
  static map = new Map<string, FieldTrie>();
  parent: FieldTrie | null;
  packets = new Set<number>();
  children = new BiMap<string, FieldTrie>();
  field: string | undefined = undefined;

  constructor(parent: FieldTrie|null) {
    this.parent = parent;
  }

  getOrCreate(path: string[]): FieldTrie {
    if (path.length === 0) {
      return this;
    }
    const child = path.pop() as string;
    let trie = this.children.get(child);
    if(trie === undefined) {
      trie = new FieldTrie(this);
      this.children.set(child, trie);
    }
    return trie.getOrCreate(path);
  }

  /** Recursively find a set of packet id's (NOTE: path is reversed) */
  _find(path: string[], results: FieldTrie[]): void {
    if (path.length === 0) {
      if (this.field !== undefined) {
        results.push(this);
      }
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
    let trie = this.children.get(next);
    if (trie === undefined) {
      return;
    }
    trie._find(rest, results);
  }

  /** Updates an array with all children recursively */
  flatten(tries: FieldTrie[]) {
    this.children.forEach(trie => {
      tries.push(trie);
      trie.flatten(tries);
    });
    return tries;
  }

  /** Remove ids from this trie */
  removeIds(ids: Set<number>) {
    setLib.differenceUpdate(this.packets, ids);
    if (this.packets.size === 0 && this.children.size === 0) {
      const fields: string[] = [];
      if (this.field !== undefined) {
        fields.push(this.field);
      }
      this.parent?.removeChild(this, fields);
    }
  }

  removeChild(trie: FieldTrie|null, fields: string[]) {
    if (trie !== null) {
      if (!this.children.deleteReverse(trie)) {
        console.error('Unable to find child');
        return;
      }
      trie.parent = null;
    }
    let me: FieldTrie|null = null;
    if (this.packets.size === 0 && this.children.size === 0) {
      me = this;
      if (this.field !== undefined) {
        fields.push(this.field);
      }
    }
    this.parent?.removeChild(me, fields);
  }

  removeField(field: string) {
    this.parent?.removeField(field);
  }

  merge(other: FieldTrie) {
    setLib.unionUpdate(this.packets, other.packets);
    other.children.forEach((child, path) => {
      if (this.children.has(path)) {
        this.children.get(path)?.merge(child);
      } else {
        this.children.set(path, child);
        child.parent = this;
      }
    })
  }
}

export class FieldTrieRoot extends FieldTrie {
  _lookup = new Map<string, FieldTrie>();
  _tokenSplit = /\]\[|\[|\]|\./
  constructor() {
    super(null);
  }

  addFilter(filter: FilterItem) {
    this.find(filter.searchParam).forEach(field => {
      filter.addField(field);
    })
  }

  removeField(field: string): void {
    this._lookup.delete(field);
  }

  removeChild(trie: FieldTrie | null, fields: string[]): void {
    super.removeChild(trie, fields);
    fields.forEach(f => this._lookup.delete(f));
  }

  find(search: string): FieldTrie[] {
    const path = search.replace(/\]$/, '').split(this._tokenSplit).reverse();
    const results: FieldTrie[] = [];
    this._find(path, results);
    return results;
  }

  addPacket(packet: Packet, filters: FilterSet) {
    Object.keys(packet.payload).forEach(field => {
      let trie = this._lookup.get(field);
      if (trie === undefined) {
        // create a new root for limited `.find()` calls
        const r = new FieldTrieRoot();
        const path = field.replace(/\]$/, '').split(this._tokenSplit).reverse();
        const trie = r.getOrCreate(path);
        trie.field = field;
        trie.packets.add(packet.header.id);
        for (const [param, item] of filters.getItems()) {
          const results = r.find(param);
          if (results.length > 0) {
            item.addField(trie);
          }
        }
        this._lookup.set(field, trie);
        this.merge(r);
      }
    });
  }

  *getFields(): IterableIterator<string> {
    for (const [field, _] of this._lookup) {
      yield field;
    }
  }
}