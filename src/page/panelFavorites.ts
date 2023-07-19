
import { changeState, setState } from './stateManager';
import { Events, State, Symbols, createButton, htmlElement, querySelector } from '../common';

Events.OPTIONS.addListener((options) => {
  const favEl = querySelector('#favorites');
  favEl.innerHTML = '';
  options.favorites.forEach(f => {
    favEl.append(
      htmlElement('span', {innerText: f.name}),
      createButton(Symbols.SWAP_VERT,
        'Overwrite filters with this filter group.',
        (e) => setState(State.create(f.filters))),
      createButton(Symbols.MERGE,
        'Merge current filters with this filter group.',
        (e) => changeState(State.create(f.filters))),
    );
  })
});
