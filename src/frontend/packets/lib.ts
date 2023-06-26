export const ROOT = 'Total'
export const NULL = '␀'

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
  payload: {
    [key: string]: string;
  }
}

/** Represents a graph line, with a label and a series of {x, y} points */
export interface Dataset {
  label: string;
  data: {x: any, y: any}[];
}
