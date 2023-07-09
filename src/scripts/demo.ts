/**
 * Run a demo stream.
 */

import { Server } from '..';
import { demoOptions } from '../frontend/page/frontendDemo';
import { runDemo } from '../lib';

const server = new Server({server: {port: 8080}, frontend: demoOptions()});

runDemo((packet) => server.jsonEvent(packet));

['SIGINT', 'SIGQUIT', 'SIGTERM'].forEach(signal => {
  process.on(signal, function() {
    console.info('Caught', signal);
    server.close();
    process.exit();
  });
});
