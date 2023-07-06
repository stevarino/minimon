/**
 * Filter Classes/Definitions - Overall class structure:
 * 
 * FilterSet
 *   - FilterItem[]
 *       - isGrouped
 *       - Filter[]
 *          - FilterType
 *          - testValue
 *       - FieldTrie[]
 *           - field
 */

import { DefaultMap, globToRegex, isEmptyObject } from "../../lib";
import { Trie } from "./trie";
import { Packet, ROOT, NULL } from "./lib"
import { PacketStore } from './packetStore';
import { State } from "../page/common";
import { difference } from "../../setLib";


/** Function signature for tests used internally in filters. */
type testSig = (val: string|undefined, testVal: string|RegExp) => boolean;
/** Mapping of searchTerm to value, or searchTerm to set of field = value, for a packet */
export type Grouping = {[searchTerm: string]: {[field: string]: string}};

/** represents an abstract test case */
export class FilterType {
  static types: FilterType[] = [];

  /** Display label (i.e. "==") */
  label: string;
  /** Returns true if filter conditions met */
  check: testSig;

  constructor(label: string, check: testSig) {
    this.label = label;
    this.check = check;
    FilterType.types.push(this);
  }

  toJSON() {
    return this.label;
  }

  static forEach(callback: (type: FilterType) => void) {
    this.types.forEach((type) => callback(type))
  }

  static get(op: string): FilterType {
    for (const t of FilterType.types) {
      if (t.label === op) {
        return t;
      }
    }
    throw new Error(`Unrecognized filter: "${op}"`);
  }
}

export class REType extends FilterType {};

export const EQUALS = new FilterType('==', (v, t) => v === t || (v === undefined && t === NULL));
export const NOT_EQUALS = new FilterType('!=', (v, t) => v !== t && (v !== undefined || t !== NULL));
export const MATCHES = new REType('~',  (v, t) => v !== undefined && (t as RegExp).test(v));
export const NOT_MATCHES = new REType('!~', (v, t) => v !== undefined && !(t as RegExp).test(v));

/** Union of a filter-type and a test value provided by the user */
export class Filter {
  static _id = 0;

  id: number;
  type: FilterType;
  testValue: string | RegExp;
  stringValue: string;

  constructor(type: FilterType, testValue: string) {
    this.id = Filter._id++;
    this.type = type;
    this.stringValue = testValue;
    if (type instanceof REType) {
      this.testValue = new RegExp(testValue);
    } else {
      this.testValue = testValue;
    }
  }
}

/** Contains a set of Fields (via FieldTrie) and set of Filters to match against */
export class FilterItem {
  searchParam: string;

  regex: RegExp | undefined = undefined;
  filters: Filter[] = [];
  _fields: Trie<number>[] = [];
  _isGrouped = false;

  constructor(key: string) {
    this.searchParam = key;
    if (key.indexOf('*') > -1) {
      this.regex = globToRegex(key, '.');
    }
  }

  toJSON() {
    return this.filters.map(f => {
      return { op: f.type.label, testValue: f.stringValue }
    })
  }

  /** Determine if this item is safe to remove, and if so, clean up references. */
  safeToRemove() {
    if (this.filters.length === 0 && !this._isGrouped) {
      this._fields.length = 0;
      return true;
    }
    return false;
  }

  addFilter(filter: Filter) {
    this.filters.push(filter);
  }

  removeFilter(type: FilterType, value: string): boolean {
    let ids: number[] = [];
    this.filters.forEach((filter, i) => {
        if (filter.type == type && String(filter.testValue) == value) {
        ids.push(i);
      }
    });
    ids.reverse().forEach(i => this.filters.splice(i, 1));
    return this.safeToRemove();
  }

  addField(field: Trie<number>) {
    this._fields.push(field);
  }

  *getFields() {
    const removed = [];
    for(let i=0; i<this._fields.length; i++) {
      const field = this._fields[i];
      if (field.parent === null) {
        removed.push(i);
      } else {
        for (const f of field.getPaths()) {
          if ((this.regex !== undefined && this.regex?.test(f))
              || (this.regex === undefined && this.searchParam == f)) {
            yield f;
          }
        }
      }
    }
    for (let i=removed.length-1; i >= 0; i--) {
      this._fields.splice(i, 1);
    }
  }

  setGroup() {
    this._isGrouped = true;
  }

  unsetGroup() {
    this._isGrouped = false;
    return this.safeToRemove();
  }

  isGroup() {
    return this._isGrouped;
  }
}

/** A grouping of filter items */
export class FilterSet {
  items: Map<string, FilterItem> = new Map();
  packetStore: PacketStore;
  
  constructor(indexes: PacketStore) {
    this.packetStore = indexes;
  }

  toJSON() {
    const obj: {[key: string]: {op: string, testValue: string}[]} = {};
    this.items.forEach((fi, key) => {
      obj[key] = [];
      if (fi._isGrouped) {
        obj[key].push({op: '*', testValue: ''});
      }
      obj[key].push(...fi.toJSON());
    }); 
    return obj;
  }

  getGroups(): FilterItem[] {
    const groups: FilterItem[] = [];
    for (const [_, item] of this.items) {
      if (item.isGroup()) {
        groups.push(item);
      }
    }
    return groups;
  }

  /** Returns the values of a set of groups for a packet. */
  getPacketGrouping(packet: Packet, groups?: FilterItem[]): Grouping {
    if (groups === undefined) {
      groups = this.getGroups();
    }
    if (groups.length === 0) {
      return {};
    }

    const groupedFields: Grouping = {};
    for (const item of groups) {
      const matchedFields: {[field: string]: string} = {}
      for (const field of item.getFields()) {
        if (item.regex == undefined || item.regex.test(field)) {
          matchedFields[field] = packet.payload[field] ?? NULL;
        }
      }
      groupedFields[item.searchParam] = matchedFields;
    };
    return groupedFields;
  }

  /** Return a stringified version of getPacketGrouping (or NULL if no groups) */
  getPacketGroupingString(packet: Packet, groups?: FilterItem[]): string {
    const groupings = this.getPacketGrouping(packet, groups);
    if (isEmptyObject(groupings)) return ROOT;
    // TODO: Figure out a more efficient way to do this. Registry? Symbols?
    return JSON.stringify(groupings);
  }

  /**
   * Test if a packet should be filtered (returns true if filtered).
   * 
   * If any Filter for a filterset fails, the packet is filtered.
   * */
  isFiltered(packet: Packet) {
    for (const [key, items] of this.items) {
      for (const filter of items.filters) {
        let keep = false;
        for (const field of items.getFields()) {
          if (filter.type.check(packet.payload[field] as string|undefined, filter.testValue)) {
            keep = true;
            break;
          }
        }
        // a Filter was not met, packet is filtered
        if (!keep) {
          return true;
        }
      }
    }
    // all FilterItems were met, packet is not filtered
    return false;
  }

  /** Run a series of filters, returning true if packet passes, false if not */
  _runPredicates(conditions: Filter[], value: string|undefined): boolean {
    for (const filter of conditions) {
      if (!filter.type.check(value, filter.testValue)) {
        return false;
      }
    }
    return true;
  }

  /** Add a grouping */
  addGroup(key: string) {
    this.getOrCreateItem(key).setGroup();
  }

  /** Remove a grouping */
  removeGroup(param: string): boolean {
    if (this.getOrCreateItem(param).unsetGroup()) {
      this.items.delete(param);
      return true;
    }
    return false;
  }

  getOrCreateItem(param: string): FilterItem {
    let item = this.items.get(param)
    if (item === undefined) {
      item = new FilterItem(param);
      this.items.set(param, item);
      this.packetStore.addFilter(item);
    }
    return item;
  }

  /** Adds a particular filter, initiated by user.  */
  addFilter(key: string, type: FilterType, value: string) {
    let parsedValue: string|RegExp = value;
    if (type === MATCHES || type === NOT_MATCHES) {
      parsedValue = RegExp(value);
    }
    this.getOrCreateItem(key).addFilter(new Filter(type, value));
  }

  /** Removes a particular filter, initiated by user. */
  removeFilter(key: string, type: FilterType, value: string): boolean {
    const item = this.items.get(key);
    if (item === undefined) {
      console.error('Unknown filter key: ', key);
      return false;
    }
    if (item.removeFilter(type, value)) {
      this.items.delete(key);
      return true;
    }
    return false;
  }

  *getItems(): IterableIterator<[param: string, item: FilterItem]> {
    for (const item of this.items) {
      yield item;
    }
  }

  mergeFromState(state: State[]) {
    const updates = new DefaultMap<string, Set<string>>(() => new Set()); 
    const updateLookup = new Map<string, State>();
    const newParams = new Set<string>();
    state.forEach(s => {
      const str = `${s.param} ${s.op} ${s.value}`;
      updates.getOrCreate(s.param).value.add(str);
      newParams.add(s.param);
      updateLookup.set(str, s)
    });

    const toRemove: string[] = [];
    this.items.forEach((item, key) => {
      const update = updates.get(key);
      if (update === undefined) {
        // delete FilterItem
        toRemove.push(key);
      } else {
        // merge FilterItem
        const existing = new Set<string>();
        const existingMap = new Map<string, Filter>();
        item.filters.forEach(f => {
          const str = `${key} ${f.type.label} ${f.testValue.toString()}`;
          existing.add(str);
          existingMap.set(str, f);
        });
        if (item.isGroup()) {
          existing.add(`${key} * `);
        }

        // filters in update but not in current
        difference(update, existing).forEach((update) => {
          const state = updateLookup.get(update) as State;
          if (state.op === '*') {
            item.setGroup();
          } else {
            item.addFilter(new Filter(FilterType.get(state.op), state.value));
          }
        });
        // filters in current but not in update
        difference(existing, update).forEach((update) => {
          if (update.endsWith(' * ')) {
            item.unsetGroup();
          } else {
            const filter = existingMap.get(update);
            if (filter === undefined) {
              console.error("Unable to lookup filter:  ", update);
              return;
            }
            item.removeFilter(filter.type, String(filter.testValue));
          }
        })
      }
    });

    difference(newParams, new Set(this.items.keys())).forEach(item => {
      // add new FilterItem
      const fi = this.getOrCreateItem(item);
      updates.get(item)?.forEach(update => {
        const state = updateLookup.get(update);
        if (state === undefined) {
          console.error('Unable to find update: ', update);
          return;
        }
        if (state.op === '*') {
          fi.setGroup();
        } else {
          fi.addFilter(new Filter(FilterType.get(state.op), state.value));
        }
      });
    });
    toRemove.forEach(k => this.items.delete(k));
  }
}
