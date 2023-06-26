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

/** A Map object with a preset default (enable with getOrCreate) */
export class DefaultWeakMap<K extends object, V> extends WeakMap<K,V> {
  callback: (arg?: any) => V;

  constructor(callback: (arg?: any) => V, entries?: readonly [K, V][] | null | undefined) {
    super(entries)
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
  filters = filters || [];
  let revFilters = filters.map(f => {
    const a = f.split('.')
    a.reverse();
    return a;
  })

  for (const [key, val] of flattenRecursive(new Key(), params, revFilters)) {
    yield [key.toString(), val];
  }
}

function* flattenFilter(path: Key, key: string, val: unknown, filters: string[][]): Generator<[Key, string]> {
  const newFilters = [];
  for (const filter of filters) {
    if (filter.length === 1 && (filter[0] == key || filter[0] === '*' || filter[0] === '**')) return;
    const newFilter = filter.slice();
    const last = newFilter.pop();
    if (last === key || last === '*') newFilters.push(newFilter);
    if (last === '**') {
      newFilters.push(newFilter);
      const recursiveFilter = newFilter.slice();
      recursiveFilter.push('**');
      newFilters.push(recursiveFilter);
    }
  }
  yield* flattenRecursive(path.createChild(key), val, newFilters);
}

function* flattenRecursive(path: Key, target: unknown, filters: string[][]): Generator<[Key, string]> {
  let i = 0;
  if (Array.isArray(target)) {
    for (const item of target) {
      if (typeof(item) === 'number') {
        // assuming this is a tuple
        yield [path, JSON.stringify(target)];
        return;
      }
      yield* flattenFilter(path, String(i++), item, filters);
    }
    return;
  }
  switch(typeof(target)) {
    case 'string':
      yield [path, target];
      break;
    case 'number':
    case 'bigint':
    case 'boolean':
    case 'undefined':
      yield [path, String(target)];
      break;
    case 'object':
      for (const [key, val] of Object.entries(target as object)) {
        yield* flattenFilter(path, key, val, filters);
      }
      break;
    default:
      throw new Error('Unrecognized object type: ' + typeof(target));
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

/** Calls document.querySelector, raising an exception on not found. */
export function querySelector<T extends HTMLElement = HTMLElement>(selector: string) {
  const el = document.querySelector<T>(selector);
  if (el !== null) return el;
  throw new Error(`Unable to find selector: "${selector}`);
}

/** Converts a number into binary-based byte string */
export function formatBytes(bytes: number, decimals = 2) {
  // https://stackoverflow.com/a/18650828
  if (!+bytes) return '0B'
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
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

/** Builds a regex-escape function, skipping provided characters */
export function regexEscaper(skip: string='') {
  const escapeBrackets = (s: string) => s.replace(']', '\\]').replace('[', '\\[');
  const skipRe = new RegExp(`[${escapeBrackets(skip)}]`);
  const chars = escapeBrackets('.+*?^$()[]{}|'.replace(skipRe, ''));
  const charsRe = new RegExp(`[${chars}]`)
  return (str: string) => str.replace(charsRe, c => '\\' + c);
}

/** Escapes standard regex characters */
export const regexEscape = regexEscaper();
/** Escapes regex characters except for "*" */
const globRegexEscape = regexEscaper('*');

/** Converts a glob pattern (* and ** wildcards) to a Regex */
export function globToRegex(glob: string, sep: string) {
  const escaped = globRegexEscape(glob);
  // replace * with [^{sep}] and ** with .*
  const wildcards = escaped.split('**').map(s => s.replace('*', `[^${sep}]+`)).join('.*');
  return new RegExp(`^${wildcards}$`);
}

/** Test if an object is indeed empty */
export function isEmptyObject(obj: any) {
  // https://stackoverflow.com/a/59787784
  for(var i in obj) { return false; }
  return true;
}

/** Creates an HTML document text node */
export function htmlText(t: string) {
  return document.createTextNode(t);
}

type ElementAttributes = {
  href?: string,
  title?: string,

  innerText?: string,
  innerHTML?: string,
  classList?: string[],
  dataset?: {[key: string]: string}
  style?: {[key: string]: string}
  onClick?: (e: MouseEvent)=>any,
}
export function htmlElement(tagName: string, attrs?: ElementAttributes, ...children: Node[]) {
  const el = document.createElement(tagName);
  for (const [attr, val] of Object.entries(attrs ?? {})) {
    switch(attr) {
      case 'innerText': el.innerText = val as string; break;
      case 'innerHTML': el.innerHTML = val as string; break;
      case 'classList': (val as string[]).forEach(c => el.classList.add(c)); break
      case 'dataset':
        for (const [k, v] of Object.entries(val)) {
          el.dataset[k] = v as string;
        }
        break;
      case 'style':
        for (const [k, v] of Object.entries(val)) {
          el.style.setProperty(k, v);
        }
        break;
      case 'onClick': el.addEventListener('click', val as (e: Event) => any); break;
      default: el.setAttribute(attr, val as string);
    }
  }
  children.forEach(c => el.appendChild(c));
  return el;
}

export function runDemo(publisher: (packet: object) => void) {
  class FlipFlop {
    frequency: number;
    offset: number;
    count: number;
    fast: number;
    slow: number;
  
    constructor(frequency: number, offset: number, count: number, fast: number, slow: number) {
      this.frequency = frequency
      this.offset = offset
      this.count = count;
      this.fast = fast;
      this.slow = slow;
      this.tick();
    }
  
    tick() {
      const now = new Date().getTime();
      const x = (now - this.offset) % this.frequency / this.frequency;
      let timeout = this.fast;
      if (x > 0.5) timeout = this.slow;
      const dice: string[] = [];
      for (let i=0; i<4*Math.random(); i++) {
        dice.push(String(Math.floor(Math.random() * 6 + 1)))
      }
      for (let index=0; index<this.count; index++) {
        publisher({
          slow: this.slow,
          fast: this.fast,
          offset: this.offset,
          frequency: this.frequency,
          isfast: x < 0.5,
          index,
          dice
        });
      }
      setTimeout(() => this.tick(), timeout);
    }
  }
  
  new FlipFlop(78_000, 0, 3, 100, 300);
  new FlipFlop(45_000, 10_0000, 5, 50, 500);
  new FlipFlop(37_000, 5_0000, 1, 50, 300);
  new FlipFlop(24_000, 15_0000, 3, 100, 500);  
}
