import { flatten } from '../common/lib';
import { buildFrontendOptions } from '../options';

/** Dummy event source for serverless demos */
export class DemoEventSource extends EventTarget {
  // @ts-ignore
  addEventListener(type: string, callback: (event: MessageEvent) => void, options?: boolean | AddEventListenerOptions | undefined): void {
    super.addEventListener(type, callback as EventListenerOrEventListenerObject, options);
  }

  /** convenience method */
  emit(type: string, data: string) {
    this.dispatchEvent(new MessageEvent(type, { data }));
  }
}

/** IS_DEMO = true if URL includes a demo query string (?demo) or on github pages */
export const IS_DEMO = (typeof window !== "undefined" && (
  new URLSearchParams(window.location.search).get('demo') !== null
  || window.location.origin.endsWith('.github.io')));

export function demoOptions() {
  return buildFrontendOptions({
    title: 'Squiggly Lines (Demo)',
    about: `
      <h1>Demo</h1>
      <p>
      This is a demonstration of squiggly lines, running in a serverless mode. The
      data consists of seemingly random data, but can be pieced apart using groupings
      and filters.
      </p>
    `,
    favorites: [
      { name: 'fast & slow', filters: [
        ['fast', '*', ''],
        ['slow', '*', ''],
      ]},
      { name: 'dice.*', filters: [
        ['dice.*', '*', ''],
      ]},
    ]
  });
}

export function demoEventSource() {
  console.info('Running in demo mode.');
  const eventSource = new DemoEventSource();
  let id = 0;
  setTimeout(() => {
    runDemo(async (packet) => {
      const packetId = id++;
      const demo = eventSource as DemoEventSource;
      demo.emit('head', JSON.stringify( { id: packetId, ms: new Date().getTime() } ));
      let fieldCnt = 0;
      for await (const [key, val] of flatten(packet)) {
        fieldCnt += 1;
        demo.emit('body', `${packetId}:${key}:${val}`);
      }
      demo.emit('done', `${packetId}:${fieldCnt}`);
    });
  }, 200);
  return eventSource;
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
