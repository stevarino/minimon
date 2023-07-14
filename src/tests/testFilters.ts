import test from 'ava';
import { FilterSet } from '../worker/filters';
import { FilterType } from '../worker/filterTypes';
import { PacketStore } from '../worker/packetStore'
import { State } from '../common/state';

function getFilterSet() {
  return new FilterSet(new PacketStore());
}

test('AddFilterFromState', t => {
  const filters = getFilterSet();
  const states = State.create([['foo', '==', 'bar']]);
  filters.mergeFromState(states);
  t.deepEqual(filters.toJSON(), {foo: [{op: '==', testValue: 'bar'}]});
});

test('RemoveFilterFromState', t => {
  const filters = getFilterSet();
  filters.addFilter('foo', FilterType.get('=='), 'bar');
  filters.addFilter('foo', FilterType.get('=='), 'baz');
  const states = State.create([['foo', '==', 'bar']]);
  filters.mergeFromState(states);
  t.deepEqual(filters.toJSON(), {foo: [{op: '==', testValue: 'bar'}]});
});

test('ClearFilterFromState', t => {
  const filters = getFilterSet();
  filters.addFilter('foo', FilterType.get('=='), 'bar');
  filters.addFilter('foo', FilterType.get('=='), 'baz');
  filters.mergeFromState([]);
  t.deepEqual(filters.toJSON(), {});
});

test('AddGroupFromState', t => {
  const filters = getFilterSet();
  filters.mergeFromState(State.create([['foo', '*', '']]));
  t.deepEqual(filters.toJSON(), {foo: [{op: '*', testValue: ''}]});
});

test('AddGroupToPrexistingFromState', t => {
  const filters = getFilterSet();
  filters.addFilter('foo', FilterType.get('=='), 'bar');
  filters.mergeFromState(State.create([
    ['foo', '==', 'bar'],
    ['foo', '*', ''],
  ]));
  t.deepEqual(filters.toJSON(), {foo: [
    {op: '*', testValue: ''},
    {op: '==', testValue: 'bar'},
  ]});
});

test('RemoveGroupToPrexistingFromState', t => {
  const filters = getFilterSet();
  filters.addFilter('foo', FilterType.get('=='), 'bar');
  filters.addGroup('foo');
  filters.mergeFromState(State.create([
    ['foo', '==', 'bar'],
  ]));
  t.deepEqual(filters.toJSON(), {foo: [
    {op: '==', testValue: 'bar'},
  ]});
});
