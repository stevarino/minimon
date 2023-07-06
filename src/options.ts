import { flatten } from './lib';

export type FrontendOptions = {
  /** How long to store packets (300,000ms or 5m) */
  duration: number;
  /** How many buckets to divide packets into (300) */
  buckets: number;
  /** Calculated value - do not set */
  _msPerBucket: number;
  /** Whether to collapse arrays in the field index (true) */
  collapseArrays: boolean;
  /** Max number of fields to return during search */
  searchResults: number;
  /** Search result special prefix characters for sorting */
  searchPrefixes: string[];
  /** Page Title */
  title: string;
  /** About panel html */
  about?: string;
}

export type ServerOptions = {
  /** web server port to listen to */
  port: number;
  /** Optional global packet-field filters */
  jsonFilters: string[];
  /** When to warn when field counts per packet are high (100) */
  highFieldCountWarn: number;
  /** When to warn when field sizes are high in bytes (1024) */
  highFieldSizeWarn: number;
}

export type Options = {
  server: ServerOptions;
  frontend: FrontendOptions;
}

type Partial<T> = {
  [P in keyof T]?: T[P];
};

type PartialFrontendOptions = Partial<FrontendOptions>;

export type PartialOptions = {
  server?: Partial<ServerOptions>;
  frontend?: PartialFrontendOptions;
}

class DefaultSchema<T> {
  defaults: [string, any][];
  paths: string[] = [];
  callbacks: [string[], (options: any) => void][] = [];

  constructor(defaults: [string, any][], updateCallback?: (options: T) => void) {
    this.defaults = defaults;
    if (updateCallback !== undefined) {
      this.callbacks.push([[], updateCallback]);
    }
    const added: [string, any][] = [];
    const removed: number[] = [];
    defaults.forEach(([path, val], i) => {
      if (val instanceof DefaultSchema) {
        removed.push(i);
        for (const [path2, val2] of val.defaults) {
          added.push([`${path}${path.length > 0 ? '.' : ''}${path2}`, val2]);
        }
        for (const [paths, callback] of val.callbacks) {
          this.callbacks.push([path.split('.').concat(paths), callback]);
        }
      } else {
        this.paths.push(path);
      }
    });
    removed.reverse().forEach(i => defaults.splice(i, 1));
    added.forEach(item => {
      defaults.push(item);
      this.paths.push(item[0]);
    });
  }

  apply(options?: any): T {
    const notFound: string[] = [];
    Array.from(flatten(options)).forEach(([key]) => {
      if (this.paths.indexOf(key) === -1) {
        notFound.push(key);
      }
    });
    if (notFound.length > 0) throw new Error(`Unrecognized option[s]: [${notFound.join(', ')}]`);

    for (const [optionPath, value] of this.defaults) {
      const path = optionPath.split('.');
      let target = options;
      path.forEach((part, i) => {
        if (i === path.length - 1) {
          target[part] = target[part] ?? value;
        } else if (target[part] === undefined) {
          target[part] = {};
        }
        target = target[part];
      });
    }
    for (const [path, callback] of this.callbacks) {
      let target = options;
      for (const part of path) {
        target = target[part];
      }
      callback(target);
    }
    return options as T;
  }
}



const frontendSchema = new DefaultSchema<FrontendOptions>([
  ['duration', 300_000],
  ['buckets', 300],
  ['_msPerBucket', 0],
  ['collapseArrays', true],
  ['searchResults', 10],
  ['searchPrefixes', []],
  ['title', 'Squiggly Lines'],
  ['about', undefined],
], (options) => {
  options._msPerBucket = options.duration / options.buckets;
});

const optionsSchema = new DefaultSchema<Options>([
  ['server.port', 8080],
  ['server.jsonFilters', []],
  ['server.highFieldCountWarn', 100],
  ['server.highFieldSizeWarn', 1024],
  ['frontend', frontendSchema],
]);

export function buildOptions(options: PartialOptions) {
  return optionsSchema.apply(options);
}

export function buildFrontendOptions(frontendOptions: PartialFrontendOptions) {
  return frontendSchema.apply(frontendOptions);
}
