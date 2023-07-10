import { htmlElement, htmlText, querySelector } from '../../lib';
import { State } from './common';
import { changeState } from './state';

/** Reference for all dropdowns currently rendered */
const EL_TO_DROPDOWNS = new WeakMap<Element, State[][]>();

/** Reference for dropdown items currently activated */
const EL_TO_DROPDOWN_ITEM = new WeakMap<Element, State[]>();

/** Dropdown element */
const DROPDOWN_EL = querySelector('#filterDropdown');

function makeFilterDropdownItem(states: State[]) {
  const action = states[0];
  const el = htmlElement('div', {
    innerText: `${action.param} ${action.op} ${action.displayValue()}${states.length > 1 ? ' ...' : ''}`,
    onClick: dropdownClick,
  });
  EL_TO_DROPDOWN_ITEM.set(el, states);
  return el;
}

export function filterWidget(node: HTMLElement|Text|string, filters: State[][]) {
  if (typeof node === 'string') {
    node = htmlText(node);
  }
  const el = htmlElement(
    'div', { classList: ['filter_dropdown'], onClick: showFiltersList },
    htmlElement('div', {classList: ['filter_item']}, node),
    htmlElement('span', {
      innerText: 'keyboard_arrow_down',
      // innerText: 'more_vert',
      classList: ['material-symbols-outlined', 'filter_arrow']
    })
  );
  EL_TO_DROPDOWNS.set(el, filters);
  return el;
}

export function filtersFromParam(param: string, fieldValues: {[key: string]: string}) {
  const stateSet: State[][] = [];
  const values: string[] = [];
  Object.entries(fieldValues).forEach(([field, value]) => {
    values.push(value);
    if (param !== field || values.length === 1) {
      stateSet.push(
        [ new State(field, '==', value), new State(param, '!*', ''), ],
        [ new State(field, '!=', value) ],
      );
      if (field !== param) {
        stateSet.push(
          [ new State(param, '==', value), new State(param, '!*', ''), ],
          [ new State(param, '!=', value) ],
        );
      }
    }
  });
  if (values.length !== 1) {
    stateSet.push(
      [ new State(param, '~', values), new State(param, '!*', ''), ],
      [ new State(param, '!~', values) ],
    );
  }
  return stateSet;
}

export function filtersFromGrouping(grouping: {[param: string]: {[field: string]: string}}) {
  const stateSet: State[][] = [
    [],  // [field == value ...]
    [],  // [field != value ...]
    [],  // [param ~ values]
    [],  // [param !~ values]
  ];
  const values: string[] = [];
  Object.entries(grouping).forEach(([param, fields]) => {
    Object.entries(fields).forEach(([field, value]) => {
      values.push(value);
      stateSet[0].push(
        new State(field, '==', value),
        new State(field, '!*', ''));
      stateSet[1].push(new State(field, '!=', value));
    });
    stateSet[0].push(new State(param, '!*', ''));
    stateSet[2].push(
      new State(param, '~', values),
      new State(param, '!*', ''));
    stateSet[3].push(new State(param, '!~', values));
  });
  return stateSet;
}


export function filtersFromField(field: string, value: string, params: string[]) {
  const filters: State[][] = [];
  filters.push(  
    [ new State(field, '==', value), new State(field, '!*', ''), 
      ...params.map(p => new State(p, '!*', '')) ],
    [ new State(field, '!=', value) ],
  );
  params.forEach(param => {
    if (param !== field) {
      filters.push(
        [ new State(param, '==', value), new State(param, '!*', '') ],
        [ new State(param, '!=', value) ],
      );
    }
  });
  return filters;
}

export function filtersFromArray(filters: [param: string, op: string, value: string|string[]][][]) {
  return filters.map(f => State.create(f));
}

function showFiltersList(e: MouseEvent) {
  e.stopPropagation();
  const el = (e.target as HTMLElement|null)?.closest('.filter_dropdown') ?? null;
  if (el === null) {
    console.error('unable to find filter_dropdown', e);
    return;
  }
  const filters = EL_TO_DROPDOWNS.get(el);
  if (filters === undefined) {
    console.error('Unable to locate dropdown for element: ', el);
  }

  const bb = el.getBoundingClientRect();
  const dd = DROPDOWN_EL;

  dd.innerHTML = '';
  filters?.forEach(f => dd.append(makeFilterDropdownItem(f)));
  dd.style.top = String(bb.top);
  dd.style.minWidth = String(bb.width);
  dd.style.display = 'block';
  dd.style.left = String(bb.left);
}

function dropdownClick(e: MouseEvent) {
  e.stopPropagation();
  const el = e.target as HTMLElement;
  const states = EL_TO_DROPDOWN_ITEM.get(el);
  if (states === undefined) {
    console.error('Unable to find filter action for dropdown: ', el);
    return;
  }
  changeState(states, []);
}

document.body.addEventListener('click', (e) => {
  DROPDOWN_EL.style.display = 'none';
  DROPDOWN_EL.innerHTML = '';
});
