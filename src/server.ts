import { hrtime } from 'node:process';
import { IncomingMessage, ServerResponse, createServer } from "node:http";
import * as path from 'node:path';

import * as lib from './lib';
import { Options, PartialOptions, buildOptions } from './options';

const serveStatic = require('serve-static');
const finalhandler = require('finalhandler');

export interface EventOptions {
  filters?: string[],
}

export class Server {
  listeners: Set<ServerResponse>;
  responseId: number = 0;
  packetId: number = 0;
  options: Options;

  constructor(options?: PartialOptions) {
    const fileServer = serveStatic(path.resolve(__dirname, 'static'), {
      index: ['index.html', 'index.htm']
    });
    this.listeners = new Set<ServerResponse>();
    this.options = buildOptions(options ?? {});

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      console.info(req.url);
      switch (req.url) {
        case '/packets':
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache'
          });
          res.flushHeaders();
          this.listeners.add(res);
          this.write('options', JSON.stringify(this.options.frontend));
          break;
        default:
          fileServer(req, res, finalhandler(req, res));
      }
    });
    server.listen(this.options.server.port);
    console.info(`Web server running on port ${this.options.server.port}`);
  }

  /** Converts a json document into a stremed event. */
  async jsonEvent(packet: unknown, options?: EventOptions, fieldCallback?: (key:string, val: string) => void): Promise<{us: number, size: number, warnings: string[]}> {
    const packetId = this.packetId++;
    let fieldCnt = 0;
    let size = 0;
    const hrt = hrtime();
    const warnings = [];

    const header = {
      id: packetId,
      ms: new Date().getTime(),
    }

    const filters = [
      ...(this.options.server.jsonFilters ?? []),
      ...(options?.filters ?? []),
    ];
    const headPacket = JSON.stringify(header);
    this.write('head', headPacket);
    size += headPacket.length;
    for (const [key, val] of lib.flatten(packet, filters)) {
      fieldCnt += 1;
      if (val.length > (this.options.server.highFieldSizeWarn as number)) {
        warnings.push(`Long value length: ${key} / ${val.length}`);
      }
      this.write('body', `${packetId}:${key}:${val}`);
      size += key.length;
      size += val.length;
      if (fieldCallback !== undefined) {
        fieldCallback(key, val);
      }
    }
    this.write('done', `${packetId}:${fieldCnt}`);
    if (fieldCnt > (this.options.server.highFieldCountWarn as number)) {
      warnings.push(`High field count: ${fieldCnt}`);
    }
    const us = hrtime(hrt);
    return {
      size, warnings,
      us: us[0] * 1e9 + us[1],
    };
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

  write(event: string, str: Buffer|string) {
    this.responseId += 1;
    this.perListener(async r => {
      r.write(`id: ${this.responseId}\nevent: ${event}\ndata: `)
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
