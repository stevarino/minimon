/**
 * Filter Classes/Definitions - Overall class structure:
 * 
 * FilterSet
 *   - FilterItem[]
 *       - Filter[]
 *          - FilterType
 *          - testValue
 *       - FieldTrie[]
 *           - field
 */

import { FieldTrie } from "./fieldTrie";
import { Packet, ROOT, NULL } from "./lib"
import { PacketStore } from './packetStore';


type testSig = (val: string|undefined, testVal: string|RegExp) => boolean;
type FilterTriple = {param: string, type: FilterType, value: string};

/** represents an abstract test case */
export class FilterType {
  static types: FilterType[] = [];

  label: string;
  check: testSig;

  constructor(label: string, check: testSig) {
    this.label = label;
    this.check = check;
    FilterType.types.push(this);
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

export const EQUALS = new FilterType('==', (v, t) => v === t);
export const NOT_EQUALS = new FilterType('!=', (v, t) => v !== t);
export const MATCHES = new REType('~',  (v, t) => v !== undefined && (t as RegExp).test(v));
export const NOT_MATCHES = new REType('!~', (v, t) => v !== undefined && !(t as RegExp).test(v));

/** Union of a filter-type and a test value provided by the user */
export class Filter {
  static _id = 0;

  id: number;
  type: FilterType;
  testValue: string | RegExp;

  constructor(type: FilterType, testValue: string) {
    this.id = Filter._id++;
    this.type = type;
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
  filters: Filter[] = [];
  _fields: FieldTrie[] = [];
  _isGrouped = false;

  constructor(key: string) {
    this.searchParam = key;
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
      if (filter.type == type && filter.testValue == value) {
        ids.push(i);
      }
    });
    for (let i=ids.length - 1; i >= 0; i--) {
      this.filters.splice(i, 1);
    }
    return this.safeToRemove();
  }

  addField(field: FieldTrie) {
    this._fields.push(field);
  }

  *getFields(): IterableIterator<string> {
    const removed = [];
    for(let i=0; i<this._fields.length; i++) {
      const field = this._fields[i];
      if (field.parent === null) {
        removed.push(i);
      } else if (field.field !== undefined) {
        yield field.field;
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

  getGroups(): FilterItem[] {
    const groups: FilterItem[] = [];
    for (const [param, item] of this.items) {
      if (item.isGroup()) {
        groups.push(item);
      }
    }
    return groups;
  }

  /** Returns the values of a set of groups for a packet. */
  getPacketGrouping(packet: Packet, groups?: FilterItem[]): string {
    if (groups === undefined) {
      groups = [];
      this.items.forEach(item => {
        if (item.isGroup()) {
          groups?.push(item)
        }
      })
    }
    if (groups.length === 0) {
      return ROOT;
    }

    const fields: Map<string, string> = new Map();
    for (const item of groups) {
      for (const field of item.getFields()) {
        fields.set(field, (packet.payload[field] ?? NULL) as string);
      }
    };
    return new URLSearchParams(Object.fromEntries(fields)).toString();
  }

  /** Test if a packet should be filtered (returns true if filtered) */
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
        if (!keep) {
          return true;
        }
      }
    }
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
}
