import test from 'ava';
import *  as lib from '../lib';

test('serialize', t => {
  let obj = {foo: [{a: 1}, {b: 2}]};
  let arr = Array.from(lib.flatten(obj))
  t.deepEqual(arr, [['foo.0.a', "1"], ['foo.1.b', "2"]]);
});

test('serialize-tuple', t => {
  let obj = {foo: {a: [0,1,2]}};
  let str = Array.from(lib.flatten(obj))
  t.deepEqual(str, [['foo.a', "[0,1,2]"]]);
});


test('serialize-stringify', t => {
  let obj = {foo: [{a: 1}, {b: 2}]};
  let str = Array.from(lib.flattenString(obj)).join('')
  t.deepEqual(str, '{"foo.0.a":"1","foo.1.b":"2"}');
});

test('serlialize-filter', t => {
  let obj = {foo: { bar: 2, baz: 3}};
  let arr = Array.from(lib.flatten(obj, ['foo.bar']));
  t.deepEqual(arr, [['foo.baz', '3']]);
});

