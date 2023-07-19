import { querySelector, Events } from '../common';
import * as demo from './frontendDemo';
import './graph';
import './panelFavorites';
import './panelFilters';
import './panelTable';
import './stateManager';

declare global {
  var WORKER: Worker;
}

window.WORKER = new Worker('worker.bundle.js');
Events.registerWorker(window.WORKER);

Events.SAMPLES.addListener(update => {
  querySelector('#pps').innerText = update.pps;
  querySelector('#bps').innerText = update.bps;
})

Events.OPTIONS.addListener((options) => {
  console.info('Initializing Options');
  querySelector('#header h1').innerText = options.title;
  document.title = options.title;
  querySelector('#customInfo').innerHTML = options.about ?? '';
});

Events.INIT.emit(demo.IS_DEMO);
