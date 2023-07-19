import { htmlElement, htmlText, Symbols, State, Events } from '../common';
import { changeState } from './stateManager';

/** Reference for all dropdowns currently rendered */
const EL_TO_DROPDOWNS = new WeakMap<Element, State[][]>();

/** Reference for dropdown items currently activated */
const EL_TO_DROPDOWN_ITEM = new WeakMap<Element, State[]>();

/** Dropdown element */
const DROPDOWNS: HTMLElement[] = [];

let STATES = new Set<string>();

Events.STATE.addListener(states => {
  STATES.clear();
  for (const s of states) {
    STATES.add(JSON.stringify(s));
  }
});

export function filterWidget(node: HTMLElement|Text|string, stateSet: State[][]) {
  if (typeof node === 'string') {
    node = htmlText(node);
  }
  const el = htmlElement(
    'div', { classList: ['filter_dropdown'], onClick: showFiltersList },
    htmlElement('div', {classList: ['filter_item']}, node),
    htmlElement('span', {
      innerText: Symbols.KEYBOARD_ARROW_DOWN,
      classList: ['material-symbols-outlined', 'filter_arrow']
    })
  );
  EL_TO_DROPDOWNS.set(el, stateSet);
  return el;
}

/** Checks if any group of states is alrady in our set states */
function removeActiveStates(stateSet: State[][]) {
  const indexes = [];
  for (const [i, states] of stateSet.entries()) {
    let found = states.map(s => STATES.has(JSON.stringify(s)));
    if (found.reduce((pv, cv) => pv && cv)) indexes.push(i);
  }
  indexes.reverse();
  for (const i of indexes) stateSet.splice(i, 1);
}

function makeFilterDropdownItem(states: State[]) {
  const action = states[0];
  let innerText: string;
  if (action.op === '*') {
    innerText = `Group by ${action.param}`;
  } else {
    innerText = action.toJSON().join(' ');
  }
  if (states.length > 1) {
    innerText += ' ...';
  }
  const el = htmlElement('div', { innerText, onClick: dropdownClick, });
  EL_TO_DROPDOWN_ITEM.set(el, states);
  return el;
}

function showFiltersList(e: MouseEvent) {
  e.stopPropagation();
  const el = (e.target as HTMLElement|null)?.closest<HTMLDivElement>('.filter_dropdown') ?? null;
  if (el === null) {
    console.error('unable to find filter_dropdown', e);
    return;
  }
  createDropdown(el);
}

function dropdownClick(e: MouseEvent) {
  removeDropdowns();
  e.stopPropagation();
  const el = e.target as HTMLElement;
  const states = EL_TO_DROPDOWN_ITEM.get(el);
  if (states === undefined) {
    console.error('Unable to find filter action for dropdown: ', el);
    return;
  }
  changeState(states, []);
}

function createDropdown(el: HTMLElement) {
  removeDropdowns();
  const stateSet = EL_TO_DROPDOWNS.get(el);
  if (stateSet === undefined) {
    console.error('Unable to locate dropdown for element: ', el);
    return;
  }
  removeActiveStates(stateSet);

  const parent = el.closest('dialog') ?? document.body;
  let parentBB: {left: number, top: number} = parent.tagName === 'BODY'
    ? {top: 0, left: 0} : parent.getBoundingClientRect();

  const dd = htmlElement('div', {classList: ['filter_dropdown_items']});
  parent.appendChild(dd);
  DROPDOWNS.push(dd);

  const bb = el.getBoundingClientRect();
  stateSet.forEach(f => dd.append(makeFilterDropdownItem(f)));
  dd.style.top = String(bb.top - parentBB.top);
  dd.style.minWidth = String(bb.width);
  dd.style.display = 'block';
  dd.style.left = String(bb.left - parentBB.left);
}

function removeDropdowns() {
  DROPDOWNS.forEach(dd => {
    dd.style.display = 'none';
    dd.parentElement?.removeChild(dd);
  });
  DROPDOWNS.length = 0;
}

document.body.addEventListener('click', removeDropdowns);
