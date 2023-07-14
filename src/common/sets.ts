/** Values in either lhv or rhv */
export function union<T>(lhv: Set<T>, rhv: Set<T>): Set<T> {
  const set = new Set(lhv);
  unionUpdate(set, rhv);
  return set;
}

/** Update lhv by adding values from rhv */
export function unionUpdate<T>(lhv: Set<T>, rhv: Set<T>): void {
  for (const elem of rhv) {
    lhv.add(elem);
  }
}

/** Values in both lhv and rhv */
export function intersection<T>(lhv: Set<T>, rhv: Set<T>): Set<T> {
  const set = new Set<T>();
  for (const elem of rhv) {
    if (lhv.has(elem)) {
      set.add(elem);
    }
  }
  return set;
}

/** Removes lhv items if not in rhv */
export function intersectionUpdate<T>(lhv: Set<T>, rhv: Set<T>): void {
  for (const elem of lhv) {
    if (!rhv.has(elem)) {
      lhv.delete(elem);
    }
  }
}

/** Values in lhv but not rhv */
export function difference<T>(lhv: Set<T>, rhv: Set<T>): Set<T> {
  const set = new Set<T>(lhv);
  differenceUpdate(set, rhv);
  return set;
}

/** Remove values from lhv if in rhv */
export function differenceUpdate<T>(lhv: Set<T>, rhv: Set<T>) {
  const target = lhv;
  let bigger, smaller;
  if (lhv.size > rhv.size) {
    bigger = lhv;
    smaller = rhv;
  } else {
    bigger = rhv;
    smaller = lhv;
  }
  for (const elem of smaller) {
    if (bigger.has(elem)) {
      target.delete(elem);
    }
  }
}
