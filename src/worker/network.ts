import { Packet, PacketField } from '../common/types';
import * as events from '../common/events'

import { FrontendOptions } from '../options';
import { DemoEventSource, demoEventSource, demoOptions, IS_DEMO } from '../page/frontendDemo';
import { formatBytes } from '../common/lib';
import { View } from './view';

/** time (in ms) to sample packets */
const SAMPLE_TIME = 3_000;
const REFRESH_RATE = 500;
/** packet samples used for rate calculations */
const sample: {ms: number, size: number}[] = [];
/** partial packets being received */
const inbox: { [key: string]: Packet } = {};

function setOptions(options: FrontendOptions) {
  events.OPTIONS.emit(options);
}

/** Reads string until character is found, returning read string and the following index */
function scan(str: string, needle: string, start: number): [result: string, next: number] {
  const end = str.indexOf(needle, start);
  if (end == -1) {
    return ['', -1];
  }
  return [str.slice(start, end), end+1];
}

/** Update rate displays based on data in sample datastructure */
function calculateRate() {
  let start = 0;
  let end = 0;
  const now = new Date().getTime();
  let cnt = 0;
  let size = 0;
  let trim = 0;
  for (let i=0; i<sample.length; i++) {
    if (sample[i].ms < now - SAMPLE_TIME) {
      trim = i;
      continue;
    }
    if (start == 0) start = sample[i].ms;
    end = sample[i].ms;
    cnt += 1;
    size += sample[i].size;
  }

  sample.splice(0, trim);

  let pps = '0.0';
  if (cnt !== 0) {
    pps = (cnt / (end - start) * 1000).toFixed(1);
  }

  let bps = '0.0 B';
  if (cnt !== 0) {
    bps = formatBytes(size / (end - start) * 1000);
  }
  events.SAMPLES.emit({pps: `${pps} Pps`, bps: `${bps}ps`})
  setTimeout(calculateRate, REFRESH_RATE);
}

/** Initializes Event Emitter and timers */
export function networkInit(view: View) {
  calculateRate();

  let eventSource: EventSource|DemoEventSource|null = null;

  if (!IS_DEMO) {
    eventSource = new EventSource('/packets');
  } else {
    setOptions(demoOptions());
    eventSource = demoEventSource();
  }

  /** Options packet from server to frontend - sent at connection */
  eventSource.addEventListener('options', event => {
    setOptions(JSON.parse(event.data) as FrontendOptions);
  });

  /** Full packet sent (unused currently) */
  eventSource.addEventListener('packet', event => {
    const packet = JSON.parse(event.data);
    sample.push({ ms: packet.header.ms, size: packet.header.size });
    view.addPacket(packet);
  });

  /** Packet header sent, create inbox entry */
  eventSource.addEventListener('head', event => {
    const head: {id: number, ms: number, size: 0} = JSON.parse(event.data);
    head.size = 0;
    inbox[String(head.id)] = {header: head, payload: {}};
  });

  /** Packet field sent, append to inbox entry */
  eventSource.addEventListener('body', event => {
    let name: string, id: string, next: number;
    [id, next] = scan(event.data, ':', 0);
    if (next === -1) {
      console.error('packetBody: invalid packet body message');
      return;
    }
    const packet = inbox[id];
    if (packet === undefined) {
      console.error('packetBody: Could not find packet in inbox');
      return;
    }
    [name, next] = scan(event.data, ':', next);
    const value = event.data.slice(next);
    packet.payload[name] = new PacketField(value);
    packet.header.size += name.length + value.length;
  });

  /** All packet fields for a given packet sent, construct packet and ingest */
  eventSource.addEventListener('done', event => {
    const [id, next] = scan(event.data, ':', 0);
    if (next === -1) {
      console.error('packetDone: invalid packet body message');
      return;
    }
    const packet = inbox[id];
    if (packet === undefined) {
      console.error('packetDone: Could not find packet in inbox');
      return;
    }
    const received = Object.keys(packet.payload).length;
    const expected = Number(event.data.slice(next));
    if (received !== expected) {
      console.error(`Received ${received} items, expected ${expected} items - invalid packet`, packet);
      return;
    }
    delete inbox[id];
    sample.push({ ms: packet.header.ms, size: packet.header.size });
    view.addPacket(packet);
  });
}
