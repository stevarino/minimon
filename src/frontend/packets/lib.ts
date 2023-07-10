export * as CJS from '../chartJS'

export const ROOT = 'Total';
export const NULL = '␀';

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
}

/** Represents a graph line, with a label and a series of {x, y} points */
export interface Dataset {
  label: string;
  data: {x: any, y: any}[];
}
