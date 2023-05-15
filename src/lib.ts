
/** A Map object with a preset default (enable with getOrCreate) */
export class DefaultMap<K, V> extends Map<K,V> {
  callback: () => V;

  constructor(callback: () => V, iterable?: Iterable<readonly [K, V]> | null | undefined) {
    super(iterable)
    this.callback = callback;
  }

  getOrCreate(key: K): [V, boolean] {
    let created = false;
    let val: V|undefined = super.get(key);
    if (val === undefined) {
      created = true;
      val = this.callback();
      this.set(key, val);
    }
    return [val, created];
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
export function* yieldWithSum(gen: Iterable<string>) {
  let total = 0;
  for (const str of gen) {
    total += str.length;
    yield str;
  }
  yield `,"_length":${total}`
}
