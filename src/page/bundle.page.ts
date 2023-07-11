import { querySelector } from '../common/lib';
import * as events from '../common/events';
import './graph';
import './panelFavorites';
import './panelFilters';
import './panelTable';
import './state';

declare global {
  var WORKER: Worker;
}

window.WORKER = new Worker('worker.bundle.js');
events.registerWorker(window.WORKER);

events.SAMPLES.addListener(update => {
  querySelector('#pps').innerText = update.pps;
  querySelector('#bps').innerText = update.bps;
})

events.OPTIONS.addListener((options) => {
  console.info('Initializing Options');
  querySelector('#header h1').innerText = options.title;
  document.title = options.title;
  querySelector('#customInfo').innerHTML = options.about ?? '';
});
