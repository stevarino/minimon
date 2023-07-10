import { flatten, runDemo } from '../../lib';
import { buildFrontendOptions } from '../../options';

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
  return eventSource;
}