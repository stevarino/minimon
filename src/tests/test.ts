import test from 'ava';
import *  as lib from '../common';

test('serialize', t => {
  const obj = {foo: [{a: 1}, {b: 2}]};
  const arr = Array.from(lib.flattenSync(obj));
  t.deepEqual(arr, [['foo.0.a', '1'], ['foo.1.b', '2']]);
});

test('serialize-tuple', t => {
  const obj = {foo: {a: [0,1,2]}};
  const str = Array.from(lib.flattenSync(obj));
  t.deepEqual(str, [['foo.a', '[0,1,2]']]);
});


test('serialize-stringify', t => {
  const obj = {foo: [{a: 1}, {b: 2}]};
  const str = Array.from(lib.flattenString(obj)).join('');
  t.deepEqual(str, '{"foo.0.a":"1","foo.1.b":"2"}');
});

test('serlialize-filter-sync', t => {
  const obj = {foo: { bar: 2, baz: 3}};
  const arr = Array.from(lib.flattenSync(obj, ['foo.bar']));
  t.deepEqual(arr, [['foo.bar', lib.NULL], ['foo.baz', '3']]);
});

test('serlialize-filter', async t => {
  const obj = {foo: { bar: 2, baz: 3}};
  const arr: string[][] = [];
  for await (const field of lib.flatten(obj, ['foo.bar'])) {
    arr.push(field);
  }
  t.deepEqual(arr, [['foo.bar', lib.NULL], ['foo.baz', '3']]);
});

test('inflateObject', t => {
  t.deepEqual(
    lib.inflateObject({'foo': 'bar'}),
    {'foo': 'bar'}
  );
  
  t.deepEqual(
    lib.inflateObject({'foo.bar': 'baz'}),
    {'foo': {'bar': 'baz'}}
  );
  
  t.deepEqual(
    lib.inflateObject({'foo[0]': 'baz'}),
    {'foo': ['baz']}
  );
  
  t.deepEqual(
    lib.inflateObject({'foo[0]': 'bar', 'foo[1]': 'baz'}),
    {'foo': ['bar', 'baz']}
  );
  
  t.deepEqual(
    lib.inflateObject({'foo[0]bar': 'baz'}),
    {'foo': [{'bar': 'baz'}]}
  );
});