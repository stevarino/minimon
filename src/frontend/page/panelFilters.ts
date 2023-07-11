import * as packets from '../worker';
import { querySelector, htmlText, htmlElement, createButton } from '../../lib';
import { changeState } from './state';
import { State } from '../common/state',
import * as events from '../common/events',

function fieldAutocomplete() {
  querySelector('#field_wrapper').innerHTML = '<div id="field_placeholder"></div>';

  // @ts-ignore
  accessibleAutocomplete({
    id: 'field',
    element: querySelector('#field_placeholder'),
    source: (query: string, callback: (results: string[]) => void) => {
      const results: string[] = [];
      const terms = query.split(' ');
      for (const field of window.VIEW.getFields()) {
        if (terms.every(t=> field.indexOf(t) !== -1)) {
          results.push(field);
          if (results.length === window.OPTIONS.searchResults) break;
        }
      }
      callback(results);
    },
    // autoselect: true,
    displayMenu: 'overlay',
    placeholder: 'Field',
    showAllValues: true,
  });
}

querySelector('#filter_form').addEventListener('submit', e=> {
  e.preventDefault();
  const field = querySelector<HTMLInputElement>('#field');
  if (field.value === '') {
    console.info('No field specified');
    return;
  }
  if ((e.submitter as HTMLButtonElement).value === 'Group By') {
    changeState([new State(field.value, '*', '')], []);
  } else {
    changeState([new State(
      field.value,
      querySelector<HTMLSelectElement>('#filter').value,
      querySelector<HTMLInputElement>('#value').value,
    )], []);
  }
  resetFilterForm();
});

function resetFilterForm() {
  const filter = querySelector<HTMLSelectElement>('#filter');
  filter.value = (filter.children[0] as HTMLOptionElement).value;
  querySelector<HTMLInputElement>('#value').value = '';
  fieldAutocomplete();
}

function createFilterListItem(ul: HTMLUListElement, field: string) {
  const li = htmlElement('li', {}, 
    htmlElement('span', {innerText: field, classList: ['isfield']}),
    htmlText(' '),
  );
  ul.appendChild(li);
  return li;
}

events.STATE.addListener((state) => {
  const ul = querySelector<HTMLUListElement>('#active_filters') as HTMLUListElement;
  Array.from(ul.childNodes).forEach(n => ul.removeChild(n));
  state.forEach(s => {
    if (s.op === '*') {
      addGroupItem(ul, s.param);
    } else {
      addFilterItem(ul, s.param, s.op, s.value);
    }
  });
});

function addGroupItem(ul: HTMLUListElement, param: string) {
  const li = createFilterListItem(ul, param);

  li.prepend(
    htmlElement('span', { innerText: 'GROUP BY', classList: ['isFilter'] }),
    htmlText(' '),
  );

  li.append(createButton<{param: string}>('close', 'Remove Grouping', 
    (_, state) => {
      changeState([], [new State(state.param, '*', '')]);
    }, { param }));
}

function addFilterItem(ul: HTMLUListElement, param: string, op: string, value: string) {
  const li = createFilterListItem(ul, param);
  li.append(
    htmlElement('span', {
      classList: ['isfilter'],
      innerText: op,
    }),
    htmlText(' '),
    htmlElement('span', {
      classList: ['isvalue'],
      innerText: value,
    }),
    htmlText(' '),
    createButton<{filter: [string, string, string]}>(
      'close', 'Remove Filter', (e, s) => {
        changeState([], [new State(...s.filter)]);
      }, {filter: [param, op, value]}),
  );
}

packets.FilterType.forEach(filter => {
  const option = document.createElement('option');
  option.innerText = filter.label;
  option.setAttribute('value', filter.label);
  querySelector('#filter').appendChild(option);
});

fieldAutocomplete();