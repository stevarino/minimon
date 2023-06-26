/**
 * Run a demo stream.
 */

import { Server } from '..';
import { runDemo } from '../lib';

const server = new Server({server: {port: 8080}});

runDemo((packet) => server.jsonEvent(packet));

['SIGINT', 'SIGQUIT', 'SIGTERM'].forEach(signal => {
  process.on(signal, function() {
    console.log("Caught", signal);
    server.close();
    process.exit();
  });
});
