import { querySelector, formatBytes } from '../../lib';
import { Packet, PacketField } from '../worker';
import { FrontendOptions } from '../../options';
import * as common from '../common/events';
import { DemoEventSource, demoEventSource, demoOptions, IS_DEMO } from './frontendDemo';


/** time (in ms) to sample packets */
const SAMPLE_TIME = 3_000;
const REFRESH_RATE = 500;

declare global {
  var OPTIONS: FrontendOptions;
}

common.OPTIONS.addListener((options) => {
  console.info('Initializing Options');
  window.OPTIONS = options;
  window.VIEW.setOptions(options);
  querySelector('#header h1').innerText = options.title;
  document.title = options.title;
  querySelector('#customInfo').innerHTML = options.about ?? '';
});

