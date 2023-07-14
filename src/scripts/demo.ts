/**
 * Run a demo stream.
 */

import { Server } from '..';
import { demoOptions } from '../page/frontendDemo';
import { runDemo } from '../common/lib';

const server = new Server({server: {port: 8080}, frontend: demoOptions()});

runDemo(async (packet) => { server.jsonEvent(packet) });

['SIGINT', 'SIGQUIT', 'SIGTERM'].forEach(signal => {
  process.on(signal, function() {
    console.info('Caught', signal);
    server.close();
    process.exit();
  });
});
