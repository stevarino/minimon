import test from 'ava';
import * as setLib from '../common/sets';

test('union', t => {
  const a = new Set([1,2,3]);
  const b = new Set([1,2,5,6]);
  const c = setLib.union(a,b);
  t.deepEqual(c, new Set([1,2,3,5,6]));
});

test('unionUpdate', t => {
  const a = new Set([1,2,3]);
  const b = new Set([1,2,5,6]);
  setLib.unionUpdate(a,b);
  t.deepEqual(a, new Set([1,2,3,5,6]));
});

test('intersection', t => {
  const a = new Set([1,2,3]);
  const b = new Set([1,2,5,6]);
  const c = setLib.intersection(a,b);
  t.deepEqual(c, new Set([1,2]));
});

test('intersectionUpdate', t => {
  const a = new Set([1,2,3]);
  const b = new Set([1,2,5,6]);
  setLib.intersectionUpdate(a,b);
  t.deepEqual(a, new Set([1,2]));
});

test('difference', t => {
  const a = new Set([1,2,3]);
  const b = new Set([1,2,5,6]);
  t.deepEqual(
    setLib.difference(a,b),
    new Set([3]));
  t.deepEqual(
    setLib.difference(b,a),
    new Set([5,6]));
});

test('differenceUpdate', t => {
  const a = new Set([1,2,3]);
  const b = new Set([1,2,5,6]);
  setLib.differenceUpdate(a,b);
  t.deepEqual(a, new Set([3]));
});
