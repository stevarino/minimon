/**
 * Run a demo stream.
 */

import { Server } from '..';

const server = new Server({port: 8080});

class Timer {
  ticks = 0;
  slow: number;
  fast: number;
  name: string;
  dir: string;
  constructor(slow: number, fast: number, name: string, dir: string) {
    this.slow = slow;
    this.fast = fast;
    this.name = name;
    this.dir = dir;
    this.tick();
  }

  tick() {
    this.ticks += 1;
    let delay = 5;
    if (this.ticks > this.slow) {
      delay = 10 + Math.random() * 50;
    }
    if (this.ticks > this.slow + this.fast) {
      this.ticks = 0;
    }
    const arr = [];
    for (let i=0; i<3; i++) {
      arr.push(Math.round(Math.random() * 5))
    }
    server.jsonEvent({
      _name: this.name,
      _dir: this.dir,
      slow: this.slow,
      fast: this.fast,
      tick: this.ticks,
      xyz: arr,
      rgb: [
        {r: 255, g: 0, b: 0},
        {r: 0, g: 255, b: 0},
        {r: 0, g: 0, b: 255},
      ]
    });
    setTimeout(() => {this.tick();}, delay);
  }
}

new Timer(200, 200, 'test', 'up');
new Timer(500, 500, 'test', 'dn');
new Timer(100, 300, 'test', 'dn');
new Timer(400, 300, 'test', 'dn');


['SIGINT', 'SIGQUIT', 'SIGTERM'].forEach(signal => {
  process.on(signal, function() {
    console.log("Caught", signal);
    server.close();
    process.exit();
  });
});
