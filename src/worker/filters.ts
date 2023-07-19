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

import {
  globToRegex, isEmptyObject, regexEscape, Packet, ROOT, NULL, Grouping,
  StateTriple, Sets } from '../common';
import { FilterType, REType, MATCHES, NOT_MATCHES } from './filterTypes';
import { Trie } from './trie';
import { PacketStore } from './packetStore';


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

  isSatisfied(packet: Packet, field: string) {
    return this.type.check(
      packet.payload[field]?.value as string|undefined,
      this.testValue);
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
      return { op: f.type.label, testValue: f.stringValue };
    });
  }

  toStates(): StateTriple[] {
    const states: StateTriple[] = [];
    for (const f of this.filters) {
      states.push([this.searchParam, f.type.label, f.stringValue])
    }
    if (this.isGroup()) states.push([this.searchParam, '*', '']);
    return states;
  }

  /** Given a packet, returns true if the FilterItem is not met for all applicable fields */
  isFiltered(packet: Packet) {
    for (const filter of this.filters) {
      let satisfied = false;
      // packet is not filtered if filter on any field passes
      for (const field of this.getFields()) {
        if (filter.isSatisfied(packet, field)) {
          satisfied = true;
          break;
        }
      }
      // a Filter was not met, packet is filtered
      if (!satisfied) return true;
    }
    return false;
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
    const ids: number[] = [];
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

  toStates(): StateTriple[] {
    const states: StateTriple[] = [];
    for (const fi of this.items.values()) {
      states.push(...fi.toStates())
    }
    return states;
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
      const matchedFields: {[field: string]: string} = {};
      for (const field of item.getFields()) {
        if (item.regex == undefined || item.regex.test(field)) {
          matchedFields[field] = packet.payload[field]?.value ?? NULL;
        }
      }
      groupedFields[item.searchParam] = matchedFields;
    }
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
    for (const [_, items] of this.items) {
      if (items.isFiltered(packet)) return true;
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
    let item = this.items.get(param);
    if (item === undefined) {
      item = new FilterItem(param);
      this.items.set(param, item);
      this.packetStore.addFilter(item);
    }
    return item;
  }

  /** Adds a particular filter, initiated by user.  */
  addFilter(key: string, type: FilterType|string, value: string|string[]) {
    let parsedValue: string|RegExp
    if (typeof type === 'string') {
      if (type === '*') {
        return this.getOrCreateItem(key).setGroup();
      } else if (type === '!*') {
        if (this.getOrCreateItem(key).unsetGroup()) {
          this.items.delete(key);
        }
        return;
      }
      type = FilterType.get(type);
    }

    if (type === MATCHES || type === NOT_MATCHES) {
      if (Array.isArray(value)) {
        value = value.map(regexEscape).join('|');
      }
      parsedValue = RegExp(value);
    } else {
      if (Array.isArray(value)) {
        throw new Error('Received array for non-regex match');
      }
      parsedValue = value;
    }
    this.getOrCreateItem(key).addFilter(new Filter(type, value));
  }

  /** Removes a particular filter, initiated by user. */
  removeFilter(key: string, type: FilterType|string, value: string|string[]): boolean {
    const item = this.items.get(key);
    if (item === undefined) {
      console.error('Unknown filter key: ', key);
      return false;
    }
    if (typeof type === 'string') {
      if (type === '*') {
        if (item.unsetGroup()) {
          this.items.delete(key);
          return true;
        }
        return false;
      }
      type = FilterType.get(type);
    }

    if (Array.isArray(value)) {
      value = value.map(regexEscape).join('|');
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

  mergeFromState(states: StateTriple[]) {
    const incoming = new Set(states.map(s => JSON.stringify(s)));
    const current = new Set(this.toStates().map(s => JSON.stringify(s)));
    // add filters not currently found
    Sets.difference(incoming, current).forEach((s) => {
      const state: StateTriple = JSON.parse(s);
      this.addFilter(...state)
    });
    Sets.difference(current, incoming).forEach(s => {
      const state: StateTriple = JSON.parse(s);
      this.removeFilter(...state)
    })
  }
}
