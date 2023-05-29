import { selector, formatBytes } from '../../lib';

export const sample: {ms: number, size: number}[] = [];

/** time (in ms) to sample packets */
const SAMPLE_TIME = 3_000;
const REFRESH_RATE = 500;

export function calculateRate() {
  let start = 0;
  let end = 0;
  let now = new Date().getTime();
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
  selector('#pps', (el) => el.innerText = `${pps} Pps`)

  let bps = '0.0 B';
  if (cnt !== 0) {
    bps = formatBytes(size / (end - start) * 1000);
  }
  selector('#bps', (el) => el.innerText = `${bps}ps`)
  setTimeout(calculateRate, REFRESH_RATE);
}

calculateRate();