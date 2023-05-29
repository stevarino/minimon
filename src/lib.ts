
/** A Map object with a preset default (enable with getOrCreate) */
export class DefaultMap<K, V> extends Map<K,V> {
  callback: (arg?: any) => V;

  constructor(callback: (arg?: any) => V, iterable?: Iterable<readonly [K, V]> | null | undefined) {
    super(iterable)
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

/** An object field's key, represented by parts. */
class Key {
  parts: Array<string>
  constructor(...parts: Array<string>) {
    this.parts = parts;
  }

  createChild(part: string): Key {
    return new Key(...this.parts, part);
  }

  toString(): string {
    return this.parts.join('.');
  }
}

/** Generates a series of [key: val] values from a flattened json object */
export function* flatten(params: unknown, filters?: Array<string>) {
  function* _filter(path: Key, key: string, val: unknown, filters: Array<Array<string>>): Generator<[Key, string]> {
    const newFilters = [];
    for (const f of filters) {
      if (f.length == 1 && f[0] == key) return;
      const newF = f.slice();
      const last = newF.pop();
      if (last == key) newFilters.push(newF);
    }
    yield* _flatten(path.createChild(key), val, newFilters);
  }

  function* _flatten(path: Key, target: unknown, filters: Array<Array<string>>): Generator<[Key, string]> {
    let i = 0;
    if (Array.isArray(target)) {
      for (const item of target) {
        if (typeof(item) === 'number') {
          // assuming this is a tuple
          yield [path, JSON.stringify(target)];
          return;
        }
        yield* _filter(path, String(i++), item, filters);
      }
      return;
    }
    switch(typeof(target)) {
      case 'string':
        yield [path, target];
        break;
      case 'number':
      case 'bigint':
        yield [path, String(target)];
        break;
      case 'object':
        for (const [key, val] of Object.entries(target as object)) {
          yield* _filter(path, key, val, filters);
        }
        break;
      default:
        throw new Error('Unrecognized object type: ' + typeof(target));
    }
  }
  filters = filters || [];
  let revFilters = filters.map(f => {
    const a = f.split('.')
    a.reverse();
    return a;
  })

  for (const [key, val] of _flatten(new Key(), params, revFilters)) {
    yield [key.toString(), val];
  }
}

/** Flatten a json object, without the outermost brackets. */
export function* flattenBody(params: unknown, filters?: Array<string>) {
  let gen = flatten(params, filters);
  let sep = ''
  while (true) {
    const { value, done } = gen.next();
    if (done) break;
    yield `${sep}"${value[0]}":${JSON.stringify(value[1])}`;
    sep = ','
  }
}

/** Converts an object into a streamed, stringified, flat object. */
export function* flattenString(params: unknown, filters?: Array<string>) {
  yield '{';
  yield* flattenBody(params, filters);
  yield '}';
}

/** Appends a length to the end of a stream of values. */
export function* yieldWithSize(gen: Iterable<string>) {
  let total = 0;
  for (const str of gen) {
    total += str.length;
    yield str;
  }
  yield `,"_sz":${total}`;
}

export function* yieldArray(arr: Iterable<object>) {
  yield '[';
  let first = true;
  for (const item of arr) {
    if (!first) {
      yield ',';
    } else {
      first = false;
    }
    yield JSON.stringify(item);
  }
  yield ']';
}

const tokenPattern = /[.\[\]]/
const isNum = /^\d+$/

/** Convert a flattened object into a deeply nested object */
export function inflateObject(obj: {[key: string]: string}) {
  const output = {};
  Object.entries(obj).forEach(([key, val]) => {
    let target: {[key: string]: unknown} = output;
    const tokens = key.split(tokenPattern).filter((v) => v.length > 0);
    // console.log('tokens: ', tokens)
    for (let i=0; i<tokens.length - 1; i++) {
      const token = tokens[i];
      if (target[token] === undefined) {
        target[token] = {};
      }
      target = target[token] as {[key: string]: unknown};
    }
    target[tokens[tokens.length-1]] = val;
  });

  /** Convert any array-like objects into arrays */
  function _check(target: object|string): object|Array<unknown>|string {
    if (typeof target === 'string') {
      return target;
    }
    const entries = Object.entries(target);
    // console.log('foo: ', target, entries);
    if (isNum.test(entries[0][0])) {
      const arr: Array<unknown> = [];
      entries.forEach(([k, v]) => {
        arr[Number(k)] = _check(v);
      });
      return arr;
    }
    const obj: {[key: string]: unknown} = {};
    entries.forEach(([k, v]) => {
      // @ts-ignore
      obj[k] = _check(v);
    })
    return obj;
  }

  return _check(output);
}

export function selector(selector: string, callback: (el: HTMLElement) => void) {
  const el = document.querySelector(selector);
  if (el !== null) {
    callback(el as HTMLElement);
    return true;
  }
  console.error(`Unable to find selector: "${selector}`);
}

export function formatBytes(bytes: number, decimals = 2) {
  // https://stackoverflow.com/a/18650828
  if (!+bytes) return '0B'
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}
