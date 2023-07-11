
import { changeState, setState } from './state';
import * as events from '../common/events';
import * as state from '../common/state';
import { createButton, htmlElement, querySelector } from '../common/lib';

events.OPTIONS.addListener((options) => {
  const favEl = querySelector('#favorites');
  favEl.innerHTML = '';
  options.favorites.forEach(f => {
    favEl.append(
      htmlElement('span', {innerText: f.name}),
      createButton('swap_vert', 'Overwrite filters with this filter group.',
        (e) => setState(state.State.create(f.filters))),
      createButton('merge', 'Merge current filters with this filter group.',
        (e) => changeState(state.State.create(f.filters))),
    );
  })
});
