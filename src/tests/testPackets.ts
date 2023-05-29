import test from 'ava';
import * as packets from "../frontend/packets";

let _testPacketId = 0;
function getTestPacket(header: {id?: number, ms?: number, size?: number}, payload: {[key: string]: string}): packets.Packet {
  _testPacketId += 1;
  return Object.assign({
    id: _testPacketId,
    ms: 1000,
    size: 0,
    payload: payload,
  }, header ?? {});
}

// https://www.compart.com/en/unicode/U+2400
const NULL_UTF8 = '%E2%90%80';

test('IndexRender', t => {
  const index = new packets.IndexStore();
  index.addPacket(getTestPacket({}, {foo: 'bar'}));
  let view = index.render();
  t.deepEqual(view, [{ label: 'Total', data: [{x: 1000, y: 1}]}]);
});

test('IndexGroups', t => {
  const index = new packets.IndexStore();
  const filters = new packets.Filters();
  index.addPacket(getTestPacket({}, {foo: 'bar'}));
  index.addPacket(getTestPacket({}, {foo: 'baz'}));
  index.addPacket(getTestPacket({}, {foo: 'bar'}));
  filters.addGroup('foo');
  const view = index.render(filters);
  t.deepEqual(view, [
    {label: 'foo=bar', data: [{x: 1000, y: 2}]},
    {label: 'foo=baz', data: [{x: 1000, y: 1}]},
  ]);
});


test('IndexMultiGroups', t => {
  const index = new packets.IndexStore();
  const filters = new packets.Filters();
  index.addPacket(getTestPacket({}, {foo: 'a'}));
  index.addPacket(getTestPacket({}, {foo: 'b', bar: 'c'}));
  index.addPacket(getTestPacket({}, {foo: 'a', bar: 'a'}));
  filters.addGroup('foo');
  filters.addGroup('bar');
  const view = index.render(filters);
  t.deepEqual(view.length, 3);
  t.assert(view.some((r) => r.label == `foo=a&bar=${NULL_UTF8}` && r.data[0].y == 1));
  t.assert(view.some((r) => r.label == 'foo=b&bar=c' && r.data[0].y == 1));
  t.assert(view.some((r) => r.label == 'foo=a&bar=a' && r.data[0].y == 1));
});

test('IndexFilterEqual', t => {
  const index = new packets.IndexStore();
  const filters = new packets.Filters();
  index.addPacket(getTestPacket({}, {foo: 'bar',}));
  index.addPacket(getTestPacket({}, { foo: 'baz',}));
  index.addPacket(getTestPacket({}, { foo: 'bar',}));
  filters.addFilter('foo', packets.FILTER.EQUALS, 'bar');
  let view = index.render(filters);
  t.deepEqual(view, [{ label: 'Total', data: [{x: 1000, y: 2}]}]);
});

test('IndexFilterNotEqual', t => {
  const index = new packets.IndexStore();
  const filters = new packets.Filters();
  index.addPacket(getTestPacket({}, { foo: 'bar',}));
  index.addPacket(getTestPacket({}, { foo: 'baz',}));
  index.addPacket(getTestPacket({}, { foo: 'bar',}));
  filters.addFilter('foo', packets.FILTER.NOT_EQUALS, 'bar');
  let view = index.render(filters);
  t.deepEqual(view, [{ label: 'Total', data: [{x: 1000, y: 1}]}]);
});

test('ViewPacket', t => {
  const dataset: packets.Dataset[] = [];
  const view = new packets.View(dataset, () => {});
  view.addPacket(getTestPacket({}, {}), 1);
  t.is(dataset.length, 1);
  view.addPacket(getTestPacket({}, { _dir: 'awesome'}), 1);
  t.is(dataset.length, 1);
});

test('ViewGroup', t => {
  const dataset: packets.Dataset[] = [];
  const view = new packets.View(dataset, () => {});
  view.addPacket(getTestPacket({}, { foo: 'bar'}), 1);
  view.addPacket(getTestPacket({}, { foo: 'baz'}), 1);
  t.is(dataset.length, 1, JSON.stringify(dataset));
  t.is(dataset[0].data[0].y, 2, JSON.stringify(dataset));
  view.addGroup('foo');
  t.is(dataset.length, 2, JSON.stringify(dataset));
  t.is(dataset[0].data[0].y, 1, JSON.stringify(dataset));
  view.removeGroup('foo');
  t.is(dataset.length, 1, JSON.stringify(dataset));
  t.is(dataset[0].data[0].y, 2, JSON.stringify(dataset));
});


test('ViewManyGroups', t => {
  const dataset: packets.Dataset[] = [];
  const view = new packets.View(dataset, ()=>{});
  view.addPacket(getTestPacket({}, { foo: 'a',}));
  view.addPacket(getTestPacket({}, { foo: 'b', bar: 'c',}));
  view.addPacket(getTestPacket({}, { foo: 'a', bar: 'a',}));
  view.addGroup('foo');
  view.addGroup('bar');
  t.deepEqual(dataset.length, 3);
  t.assert(dataset.some((r) => r.label == `foo=a&bar=${NULL_UTF8}` && r.data[0].y == 1));
  t.assert(dataset.some((r) => r.label == 'foo=b&bar=c' && r.data[0].y == 1));
  t.assert(dataset.some((r) => r.label == 'foo=a&bar=a' && r.data[0].y == 1));
});

test('ViewExpiry', t => {
  const dataset: packets.Dataset[] = [];
  const view = new packets.View(dataset, ()=>{}, { duration: 60_000 });
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
  const dataset: packets.Dataset[] = [];
  const view = new packets.View(dataset, ()=>{});
  view.addPacket(getTestPacket({}, {foo: 'a', bar: 'b'}));
  let fields = new Set(view.getFields());
  t.is(fields.size, 2);
  t.true(fields.has('foo') && fields.has('bar'));
  view.addPacket(getTestPacket({}, {baz: 'c'}));
  fields = new Set(view.getFields());
  t.is(fields.size, 3);
  t.true(fields.has('baz'));
})
