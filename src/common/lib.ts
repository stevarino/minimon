export const NULL = '␀'

/** An object field's key, represented by parts. */
class Key {
  parts: Array<string>;
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

/** Takes an array of json-path like strings (dot-seperated) and reverses them. */
function generateReversesFilters(filters?: Array<string>) {
  const revFilters: string[][] = [];
  for (const f of filters ?? []) {
    const fa = f.split('.');
    fa.reverse();
    revFilters.push(fa);
  }
  return revFilters;
}

/** Given a set of path-relative filters, returns the next set of filters or null if a bingo. */
function filterPop(filters: string[][], key: string) {
  const newFilters = [];
  for (const filter of filters) {
    if (filter.length === 1 && (filter[0] == key || filter[0] === '*' || filter[0] === '**')) {
      return null;
    }
    const newFilter = filter.slice();
    const last = newFilter.pop() as string;
    if (last === key || last === '*') newFilters.push(newFilter);
    if (last === '**') {
      newFilters.push(newFilter);
      const recursiveFilter = newFilter.slice();
      recursiveFilter.push('**');
      newFilters.push(recursiveFilter);
    }
  }
  return newFilters;
}

/** Generates a series of [key: val] values from a flattened json object */
export async function* flatten(params: unknown, filters?: Array<string>) {
  const generator = flattenRecursive(new Key(), params, generateReversesFilters(filters));
  for await (const [key, val] of generator) {
    yield [key.toString(), val];
  }
}

/** Generates a series of [key: val] values from a flattened json object */
export function* flattenSync(params: unknown, filters?: Array<string>) {
  const generator = flattenRecursiveSync(new Key(), params, generateReversesFilters(filters));
  for (const [key, val] of generator) {
    yield [key.toString(), val];
  }
}

/** Updates the path-relative filters, yields NULL on filtered item, and then continues */
async function* flattenFilter(path: Key, key: string, val: unknown, filters: string[][]): AsyncGenerator<[Key, string]> {
  const newFilters = filterPop(filters, key);
  if (newFilters === null) {
    yield [path.createChild(key), NULL];
    return;
  }
  yield* await flattenRecursive(path.createChild(key), val, newFilters);
}

/** Updates the path-relative filters, yields NULL on filtered item, and then continues */
function* flattenFilterSync(path: Key, key: string, val: unknown, filters: string[][]): Generator<[Key, string]> {
  const newFilters = filterPop(filters, key);
  if (newFilters === null) {
    yield [path.createChild(key), NULL];
    return;
  }
  yield* flattenRecursiveSync(path.createChild(key), val, newFilters);
}

/** Attempts to return a scalar value tuple, or null if a compound value */
function getValue(path: Key, target: unknown): [type: string, tuple: [Key, string]|null] {
  const targetType = Array.isArray(target) ? 'array' : typeof(target);

  switch(targetType) {
  case 'array':
    for (const item of target as unknown[]) {
      if (typeof(item) === 'number') {
        // assuming a number[] tuple
        return [targetType, [path, JSON.stringify(target)]];
      }
      return [targetType, null];
    }
  case 'string':
    return [targetType, [path, `"${target}"`]];
  case 'number':
  case 'bigint':
  case 'boolean':
  case 'undefined':
    return [targetType, [path, String(target)]];
  case 'object':
    return [targetType, null]
  default:
    throw new Error('Unrecognized object type: ' + targetType);
  }
}

/** Yields a [Key, value] pair or continues to iterate through the object. */
async function* flattenRecursive(path: Key, target: unknown, filters: string[][]): AsyncGenerator<[Key, string]> {
  const [objType, tuple] = getValue(path, target);
  if (tuple !== null) {
    yield tuple;
  } else if (objType === 'array') {
    let i = 0;
    for (const item of target as unknown[]) {
      yield* flattenFilter(path, String(i++), item, filters);
    }
  } else if (objType === 'object') {
    for (const [key, val] of Object.entries(target as object)) {
      yield* flattenFilter(path, key, val, filters);
    }
  }
}

/** Yields a [Key, value] pair or continues to iterate through the object. */
function* flattenRecursiveSync(path: Key, target: unknown, filters: string[][]): Generator<[Key, string]> {
  const [objType, tuple] = getValue(path, target);
  if (tuple !== null) {
    yield tuple;
  } else if (objType === 'array') {
    let i = 0;
    for (const item of target as unknown[]) {
      yield* flattenFilterSync(path, String(i++), item, filters);
    }
  } else if (objType === 'object') {
    for (const [key, val] of Object.entries(target as object)) {
      yield* flattenFilterSync(path, key, val, filters);
    }
  }
}

/** Flatten a json object, without the outermost brackets. */
export function* flattenBody(params: unknown, filters?: Array<string>) {
  let sep = '';
  for (const value of flattenSync(params, filters)) {
    yield `${sep}"${value[0]}":${JSON.stringify(value[1])}`;
    sep = ',';
  }
}

/** Converts an object into a streamed, stringified, flat object. */
export function* flattenString(params: unknown, filters?: Array<string>) {
  yield '{';
  yield* flattenBody(params, filters);
  yield '}';
}

/** Joins a sequence similar to str.join(), but returns it as an iterator */
export function* yieldJoin(iter: Iterable<string>, glue: string) {
  let first = true;
  for (const item of iter) {
    if (!first) {
      yield ',';
    } else {
      first = false;
    }
    yield item;
  }
}

/** Applies a function to each item  */
export function* yieldMap<T,U>(iter: Iterable<T>, callback: (arg: T) => U) {
  for (const item of iter) {
    yield callback(item);
  }
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

const tokenPattern = /[.\[\]]/;
const isNum = /^\d+$/;

/** Convert a flattened object into a deeply nested object */
export function inflateObject<T = string>(obj: {[key: string]: T}) {
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
  function _check(target: object|string): object|Array<unknown>|string|T {
    if (typeof target === 'string') {
      return target;
    }
    if (target.constructor.name !== 'Object') {
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
    });
    return obj;
  }

  return _check(output);
}

export function overwriteObject(obj: {[path: string]: unknown}, settings: {[path: string]: unknown}) {
  for (const [path, val] of Object.entries(settings)) {
    let target = obj;
    const paths = path.split('.').reverse();
    while (paths.length > 1) {
      const part = paths.pop() as string;
      if (target[part] === undefined) {
        target[part] = {};
      }
      target = target[part] as {[path: string]: unknown};
    }
    target[paths[0]] = val;
  }
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
  if (!+bytes) return '0B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/** Builds a regex-escape function, skipping provided characters */
export function regexEscaper(skip='') {
  const escapeBrackets = (s: string) => s.replace(']', '\\]').replace('[', '\\[');
  const skipRe = new RegExp(`[${escapeBrackets(skip)}]`);
  const chars = escapeBrackets('.+*?^$()[]{}|'.replace(skipRe, ''));
  const charsRe = new RegExp(`[${chars}]`);
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
  for(const i in obj) { return false; }
  return true;
}

/** Creates an HTML document text node */
export function htmlText(t: string) {
  return document.createTextNode(t);
}

type ElementAttributes = {
  href?: string,
  title?: string,
  download?: string,

  innerText?: string,
  innerHTML?: string,
  classList?: string[],
  dataset?: {[key: string]: string}
  style?: {[key: string]: string}
  onClick?: (e: MouseEvent)=>any,
  onMouseEnter?: (e: MouseEvent) => any,
  onMouseLeave?: (e: MouseEvent) => any,
}

export function htmlElement(tagName: string, attrs?: ElementAttributes, ...children: Node[]) {
  const el = document.createElement(tagName);
  for (const [attr, val] of Object.entries(attrs ?? {})) {
    switch(attr) {
    case 'download': (el as HTMLAnchorElement).download = val as string; break;
    case 'innerText': el.innerText = val as string; break;
    case 'innerHTML': el.innerHTML = val as string; break;
    case 'classList': (val as string[]).forEach(c => el.classList.add(c)); break;
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
    case 'onMouseEnter': el.addEventListener('mouseenter', val as (e: Event) => any); break;
    case 'onMouseLeave': el.addEventListener('mouseleave', val as (e: Event) => any); break;
    default: el.setAttribute(attr, val as string);
    }
  }
  children.forEach(c => el.appendChild(c));
  return el;
}

const buttonState = new WeakMap<HTMLElement, any>();

export function createButton<T = object>(icon: string, title: string, onClick: (e: MouseEvent, state: T) => any, state?: T) {
  const el = htmlElement('button', { 
    onClick: (e) => {
      const state = buttonState.get(e.target as HTMLElement);
      if (state === undefined) {
        console.error('Unable to find button state: ', e.target);
      } else {
        onClick(e, state as T);
      }
    },
    title, 
    innerText: icon,
    classList: ['material-symbols-outlined'],
  });
  buttonState.set(el, state ?? {});
  return el;
}

export function runDemo(publisher: (packet: object) => Promise<void>) {
  class FlipFlop {
    frequency: number;
    offset: number;
    count: number;
    fast: number;
    slow: number;
  
    constructor(frequency: number, offset: number, count: number, fast: number, slow: number) {
      this.frequency = frequency;
      this.offset = offset;
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
      for (let i=0; i<2*Math.random(); i++) {
        dice.push(String(Math.floor(Math.random() * 6 + 1)));
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
