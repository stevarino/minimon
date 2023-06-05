import { IncomingMessage, ServerResponse, createServer } from "http";
import * as path from 'path';
import * as lib from './lib';
import { Blob } from 'node:buffer';

const serveStatic = require('serve-static');
const finalhandler = require('finalhandler');

export interface ServerOptions {
  port: number;
  jsonFilters?: string[];
}

export interface EventOptions {
  filters?: string[],
}

export class Server {
  listeners: Set<ServerResponse>;
  responseId: number = 0;
  packetId: number = 0;
  options: ServerOptions;

  constructor(options: ServerOptions) {
    const fileServer = serveStatic(path.resolve(__dirname, 'static'), {
      index: ['index.html', 'index.htm']
    });
    this.listeners = new Set<ServerResponse>();
    options.jsonFilters = options.jsonFilters ?? [];
    this.options = options;

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      console.log(req.url);
      switch (req.url) {
        case '/packets':
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache'
          });
          res.flushHeaders();
          this.listeners.add(res);
          break;
        default:
          fileServer(req, res, finalhandler(req, res));
      }
    });
    server.listen(options.port);
    console.log(`Web server running on port ${options.port}`);
  }

  /**
   * Converts a json document into a stremed event.
   * 
   * @param packet object to be json-ified
   * @param addSize whether or not to add a size field to it
   */
  async jsonEvent(packet: unknown, options?: EventOptions) {
    const header = {header: {
      id: this.packetId++,
      ms: new Date().getTime(),
    }}
    const filters = [
      ...(this.options.jsonFilters ?? []),
      ...(options?.filters ?? []),
    ];
    const buffer = Buffer.from(await new Blob([
      JSON.stringify(header).slice(0, -1),
      ',"payload": {',
      ...lib.flattenBody(packet, filters),
      '}}'
    ]).arrayBuffer());
    this.write(buffer);
  }

  /**
   * @param {perResponseCallback} func
   */
  perListener(func: (res: ServerResponse) => void): void {
    let deadResponses: Set<ServerResponse> = new Set();
    this.listeners.forEach((r) => {
      if (r.writable) {
        func(r);
      }
      if (!r.writable) {
        deadResponses.add(r);
      }
    });
    deadResponses.forEach(r => {
      this.listeners.delete(r);
    });
  }


  write(str: Buffer|string) {
    this.responseId += 1;
    this.perListener(async r => {
      r.write(`id: ${this.responseId}\nevent: packet\ndata: `)
      r.write(str);
      r.write('\n\n')
    });
  }

  /**
   * Close all listening responses.
   */
  close() {
    this.perListener(r => {
      r.write(']');
      r.end();
    });
  }
}

module.exports = { Server };
