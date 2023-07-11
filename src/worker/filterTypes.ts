import { NULL } from "../common/lib";

/** Function signature for tests used internally in filters. */
type testSig = (val: string|undefined, testVal: string|RegExp) => boolean;

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
    this.types.forEach((type) => callback(type));
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

export class REType extends FilterType {}

export const EQUALS = new FilterType('==', (v, t) => v === t || (v === undefined && t === NULL));
export const NOT_EQUALS = new FilterType('!=', (v, t) => v !== t && (v !== undefined || t !== NULL));
export const MATCHES = new REType('~',  (v, t) => v !== undefined && (t as RegExp).test(v));
export const NOT_MATCHES = new REType('!~', (v, t) => v !== undefined && !(t as RegExp).test(v));
