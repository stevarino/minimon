
import { changeState, setState } from './state';
import * as common from './common';
import { createButton, htmlElement, querySelector } from '../../lib';

common.OPTIONS.addListener((options) => {
  console.log(options);
  const favEl = querySelector('#favorites');
  favEl.innerHTML = '';
  options.favorites.forEach(f => {
    favEl.append(
      htmlElement('span', {innerText: f.name}),
      createButton('swap_vert', 'Overwrite filters with this filter group.',
        (e) => setState(common.State.create(f.filters))),
      createButton('merge', 'Merge current filters with this filter group.',
        (e) => changeState(common.State.create(f.filters))),
    );
  })
});
