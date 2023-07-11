import test from 'ava';
import { View } from '../worker/view';
import { PacketStore } from '../worker/packetStore';
import { FilterSet } from '../worker/filters';
import { FilterType } from '../worker/filterTypes';
import { Dataset, Packet, PacketField, NULL  } from '../common/types';
import { buildFrontendOptions, FrontendOptions } from '../options';

let _testPacketId = 0;
function getTestPacket(
  header: {id?: number, ms?: number, size?: number}, 
  payload: {[key: string]: string}
): Packet {
  _testPacketId += 1;
  const payloadObj: {[k: string]: PacketField} = {};
  Object.entries(payload).forEach(([k, v]) => {
    payloadObj[k] = new PacketField(v);
  });
  const packet = {
    header: {
      id: _testPacketId,
      ms: 1000,
      size: 0,
    },
    payload: payloadObj
  };
  Object.assign(packet.header, header ?? {});
  return packet;
}

function getView(dataset: Dataset[], callback?: any, options?: FrontendOptions) {
  return new View();
}

// https://www.compart.com/en/unicode/U+2400
const NULL_UTF8 = '%E2%90%80';

test('IndexRender', t => {
  const store = new PacketStore();
  const filters = new FilterSet(store);
  store.addPacket(getTestPacket({}, {foo: 'bar'}), filters);
  const view = store.render();
  t.deepEqual(view, [{ label: 'Total', data: [{x: 1000, y: 1}]}]);
});

test('IndexGroups', t => {
  const store = new PacketStore();
  const filters = new FilterSet(store);
  store.addPacket(getTestPacket({}, {foo: 'bar'}), filters);
  store.addPacket(getTestPacket({}, {foo: 'baz'}), filters);
  store.addPacket(getTestPacket({}, {foo: 'bar'}), filters);
  filters.addGroup('foo');
  const view = store.render(filters);
  t.deepEqual(view, [
    {label: '{"foo":{"foo":"bar"}}', data: [{x: 1000, y: 2}]},
    {label: '{"foo":{"foo":"baz"}}', data: [{x: 1000, y: 1}]},
  ]);
});


test('IndexMultiGroups', t => {
  const index = new PacketStore();
  const filters = new FilterSet(index);
  index.addPacket(getTestPacket({}, {foo: 'a'}), filters);
  index.addPacket(getTestPacket({}, {foo: 'b', bar: 'c'}), filters);
  index.addPacket(getTestPacket({}, {foo: 'a', bar: 'a'}), filters);
  filters.addGroup('foo');
  filters.addGroup('bar');
  const view = index.render(filters);
  t.deepEqual(view.length, 3);
  const expectedLabels = [
    {foo: {foo: 'a'}, bar: {bar: NULL}},
    {foo: {foo: 'b'}, bar: {bar: 'c'}},
    {foo: {foo: 'a'}, bar: {bar: 'a'}},
  ];
  expectedLabels.forEach(label => {
    t.assert(
      view.some((r) => r.label == JSON.stringify(label) && (r.data[0])[1] == 1),
      `Expected label "${label}", received ${view.map(r => r.label)}`);
  });
});

test('IndexFilterEqual', t => {
  const index = new PacketStore();
  const filters = new FilterSet(index);
  index.addPacket(getTestPacket({}, {foo: 'bar',}), filters);
  index.addPacket(getTestPacket({}, { foo: 'baz',}), filters);
  index.addPacket(getTestPacket({}, { foo: 'bar',}), filters);
  filters.addFilter('foo', FilterType.get('=='), 'bar');
  const view = index.render(filters);
  t.deepEqual(view, [{ label: 'Total', data: [{x: 1000, y: 2}]}]);
});

test('IndexFilterNotEqual', t => {
  const index = new PacketStore();
  const filters = new FilterSet(index);
  index.addPacket(getTestPacket({}, { foo: 'bar',}), filters);
  index.addPacket(getTestPacket({}, { foo: 'baz',}), filters);
  index.addPacket(getTestPacket({}, { foo: 'bar',}), filters);
  filters.addFilter('foo', FilterType.get('!='), 'bar');
  const view = index.render(filters);
  t.deepEqual(view, [{ label: 'Total', data: [{x: 1000, y: 1}]}]);
});

test('ViewPacket', t => {
  const dataset: Dataset[] = [];
  const view = getView(dataset);
  view.addPacket(getTestPacket({}, {}), 1);
  t.is(dataset.length, 1);
  view.addPacket(getTestPacket({}, { _dir: 'awesome'}), 1);
  t.is(dataset.length, 1);
});

test('ViewGroup', t => {
  const dataset: Dataset[] = [];
  const view = getView(dataset);
  view.addPacket(getTestPacket({}, { foo: 'bar'}), 1);
  view.addPacket(getTestPacket({}, { foo: 'baz'}), 1);
  t.is(dataset.length, 1, JSON.stringify(dataset));
  t.is(dataset[0].data[0][1], 2, JSON.stringify(dataset));
  view.addGroup('foo');
  t.is(dataset.length, 2, JSON.stringify(dataset));
  t.is(dataset[0].data[0][1], 1, JSON.stringify(dataset));
  view.removeGroup('foo');
  t.is(dataset.length, 1, JSON.stringify(dataset));
  t.is(dataset[0].data[0][1], 2, JSON.stringify(dataset));
});


test('ViewManyGroups', t => {
  const dataset: Dataset[] = [];
  const view = getView(dataset);
  view.addPacket(getTestPacket({}, { foo: 'a',}));
  view.addPacket(getTestPacket({}, { foo: 'b', bar: 'c',}));
  view.addPacket(getTestPacket({}, { foo: 'a', bar: 'a',}));
  view.addGroup('foo');
  view.addGroup('bar');
  t.deepEqual(dataset.length, 3);
  
  const expectedLabels = [
    {foo: {foo: 'a'}, bar: {bar: NULL}},
    {foo: {foo: 'b'}, bar: {bar: 'c'}},
    {foo: {foo: 'a'}, bar: {bar: 'a'}},
  ];
  expectedLabels.forEach(label => {
    t.assert(
      dataset.some((r) => r.label == JSON.stringify(label) && r.data[0][1] == 1),
      `Expected label "${label}", received ${dataset.map(r => r.label)}`);
  });
});

test('ViewExpiry', t => {
  const dataset: Dataset[] = [];
  const view = getView(dataset, () => {}, buildFrontendOptions({duration: 60_000}));
  for (let i=0; i<10; i++) {
    view.addPacket(getTestPacket({ms: i * 1000}, {}), 1000);
  }
  t.is(dataset[0].data.length, 10, JSON.stringify(dataset[0].data));
  for (let i=0; i<5; i++) {
    view.addPacket(getTestPacket({ms: 300_000 + i * 1000 }, {}), 300_000);
  }
  t.is(dataset[0].data.length, 5, JSON.stringify(dataset[0].data));
});

test('ViewFields', t => {
  const dataset: Dataset[] = [];
  const view = getView(dataset);
  view.addPacket(getTestPacket({}, {foo: 'a', bar: 'b'}));
  let fields = new Set(view.getFields());
  t.is(fields.size, 2);
  t.true(fields.has('foo') && fields.has('bar'));
  view.addPacket(getTestPacket({}, {baz: 'c'}));
  fields = new Set(view.getFields());
  t.is(fields.size, 3);
  t.true(fields.has('baz'));
});
