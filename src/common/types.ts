export { State, StateTriple } from './state';

export const ROOT = 'Total';
export const NULL = '␀';

/** A Map object with a preset default (enable with getOrCreate) */
export class DefaultMap<K, V> extends Map<K,V> {
  callback: (arg?: any) => V;

  constructor(callback: (arg?: any) => V, iterable?: Iterable<readonly [K, V]> | null | undefined) {
    super(iterable);
    this.callback = callback;
  }

  getOrCreate(key: K) {
    let created = false;
    let value: V|undefined = super.get(key);
    if (value === undefined) {
      created = true;
      value = this.callback();
      this.set(key, value);
    }
    return { value, created };
  }
}

/** A Map object with a preset default (enable with getOrCreate) */
export class DefaultWeakMap<K extends object, V> extends WeakMap<K,V> {
  callback: (arg?: any) => V;

  constructor(callback: (arg?: any) => V, entries?: readonly [K, V][] | null | undefined) {
    super(entries);
    this.callback = callback;
  }

  getOrCreate(key: K) {
    let created = false;
    let value: V|undefined = super.get(key);
    if (value === undefined) {
      created = true;
      value = this.callback();
      this.set(key, value);
    }
    return { value, created };
  }
}


/** Two way, one-to-one mapping */
export class BiMap<T, U> extends Map<T, U> {
  reverse: Map<U, T>;
  constructor(iterable?: Iterable<readonly [T, U]> | null | undefined) {
    const items = Array.from(iterable ?? []);
    super(items);
    this.reverse = new Map<U, T>(items.map(([t, u]) => [u, t]));
  }

  set(key: T, value: U) {
    this.reverse.set(value, key);
    return super.set(key, value);
  }

  getReverse(key: U) {
    return this.reverse.get(key);
  }

  hasReverse(key: U) {
    return this.reverse.has(key);
  }

  clear() {
    this.reverse.clear();
    super.clear();
  }

  delete(key: T) {
    const val = this.get(key);
    if (val !== undefined) {
      this.reverse.delete(val);
    }
    return super.delete(key);
  }

  deleteReverse(key: U) {
    const val = this.reverse.get(key);
    if (val !== undefined) {
      super.delete(val);
    }
    return this.reverse.delete(key);
  }
}

/**
 * A data packet, assumed to be a set of jsonpath-like string keys and
 * string values (flattened datastructure).
 */
export interface Packet {
  /** metadata */
  header: {
    id: number;
    ms: number;
    size: number;
  }
  /** defined fields */
  payload: Payload
}

export interface Payload {
  [key: string]: PacketField
}

/**  */
export class PacketField {
  value: string;
  isString: boolean;

  constructor(value: string) {
    if (value.startsWith('"')) {
      this.value = value.slice(1, -1);
      this.isString = true;
    } else {
      this.value = value;
      this.isString = false;
    }
  }

  toString() {
    if (this.isString) {
      return `"${this.value}"`;
    }
    if (this.value === NULL) {
      return "null";
    }
    return this.value;
  }

  toJSON() {
    if (this.isString) {
      return this.value;
    }
    if (this.value === NULL || this.value === 'undefined') {
      return null;
    }
    return JSON.parse(this.value);
  }

  static fromJSON(json: {value: string, isString: boolean}) {
    const obj = new PacketField(NULL);
    Object.assign(obj, json);
    return obj;
  }
}

/** Represents a graph line, with a label and a series of {x, y} points */
export interface Dataset {
  label: string;
  data: [x: any, y: any][];
}

/** Represents the data for use in a table display */
export interface Table {
  headers: string[];
  rows: string[][];
  packets?: Map<number, Packet>;
  params?: [string, string[]][];
}

/** Common column names */
export enum TABLE_COLUMNS {
  ID = 'id',
  COUNT = '_cnt',
  SIZE = '_sz',
}
export const KNOWN_COLUMNS = Object.values(TABLE_COLUMNS).map(c => String(c));

/** Mapping of searchTerm to set of field = value, for a packet */
export type Grouping = {[searchTerm: string]: {[field: string]: string}};
