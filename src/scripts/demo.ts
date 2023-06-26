/**
 * Run a demo stream.
 */

import { Server } from '..';

const server = new Server({server: {port: 8080}});

class FlipFlop {
  frequency: number;
  offset: number;
  count: number;
  fast: number;
  slow: number;

  constructor(frequency: number, offset: number, count: number, fast: number, slow: number) {
    this.frequency = frequency
    this.offset = offset
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
    for (let i=0; i<4*Math.random(); i++) {
      dice.push(String(Math.floor(Math.random() * 6 + 1)))
    }
    for (let index=0; index<this.count; index++) {
      server.jsonEvent({
        slow: this.slow,
        fast: this.fast,
        offset: this.offset,
        frequency: this.frequency,
        isfast: x < 0.5,
        index,
        dice
      })
    }
    setTimeout(() => this.tick(), timeout);
  }
}

new FlipFlop(78_000, 0, 3, 100, 300);
new FlipFlop(45_000, 10_0000, 5, 50, 500);
new FlipFlop(37_000, 5_0000, 1, 50, 300);
new FlipFlop(24_000, 15_0000, 3, 100, 500);

['SIGINT', 'SIGQUIT', 'SIGTERM'].forEach(signal => {
  process.on(signal, function() {
    console.log("Caught", signal);
    server.close();
    process.exit();
  });
});
