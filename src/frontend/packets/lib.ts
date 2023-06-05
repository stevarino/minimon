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

/** Options with optional settings */
export interface Options {
  duration?: number | undefined;
  buckets?: number | undefined;
}

/** Options with defaults applied */
export interface FinalOptions extends Options {
  duration: number;
  buckets: number;

  msPerBucket: number;
}

/** Merge objects but not overwriting with undefined. Returns a copy. */
export function optionsWithDefaults(options: Options) {
  const final: FinalOptions = {
    duration: 300_000,
    buckets: 300,

    msPerBucket: 0,
  };
  for (const [k, v] of Object.entries(options)) {
    if (v !== undefined) {
      // @ts-ignore
      final[k] = v;
    }
  }
  updateOptions(final);
  return final;
}

/** Update calculated options values */
export function updateOptions(options: FinalOptions) {
  options.msPerBucket = options.duration / options.buckets;
}

/** Represents a graph line, with a label and a series of {x, y} points */
export interface Dataset {
  label: string;
  data: {x: any, y: any}[];
}