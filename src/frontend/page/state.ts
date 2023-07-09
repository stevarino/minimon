import { regexEscape } from '../../lib';
import { difference, intersection } from '../../setLib';
import { FilterType } from '../packets/filters';
import { State, OPTIONS, STATE } from './common';

const FILTER_TYPE_RE = FilterType.types.map(f => regexEscape(f.label)).join('|');
const FILTER_RE = new RegExp(`^(.*?)(${FILTER_TYPE_RE}|\\*)(.*)$`);

export function setState(state: State[]) {
  manager.setState(state);
}

export function changeState(toAdd: State[], toRemove?: State[]) {
  manager.changeState(toAdd, toRemove);
}

window.addEventListener('popstate', (e) => {
  manager.updateFromHash(window.location.hash);
});

interface History {
  pushState(obj: any, title: string, url: string): void;
}

export class StateManager {
  state: State[] = [];
  historyObj: History;

  constructor(historyObj?: History, initialState?: string) {
    this.historyObj = historyObj ?? history;
    OPTIONS.addListener(() => {
      console.info('Initializing state from URL');
      this.updateFromHash(initialState ?? window.location.hash);
    });
  }

  /** Convert a URL-hash change into state change */
  updateFromHash(hash: string) {
    const state: State[] = [];
    hash = hash.startsWith('#') ? hash.slice(1) : hash;
    if (hash === '') {
      return;
    }
    let fail = false;
    const parts = hash.split('&').forEach(h => {
      const match = FILTER_RE.exec(h);
      if (match === null) {
        console.error('Unable to parse filter: ', h);
        fail = true;
        return;
      }
      state.push(new State(
        decodeURIComponent(match[1]),
        match[2],
        decodeURIComponent(match[3])));
    });
    if (fail) return;
    this.state = state;
    this.updateListeners();
  }

  /** Overwrite state. */
  setState(state: State[]) {
    this.state = state;
    this.updateLocation();
    this.updateListeners();
  }

  /** Mutate state while preserving order of preexisting states. */
  changeState(toAdd: State[], toRemove?: State[]) {
    function statesToMap(state: State[]) {
      return new Map(state.map(s => [JSON.stringify(s), s]));
    }
    toRemove = toRemove ?? [];
    const addMap = statesToMap(toAdd);
    const curMap = statesToMap(this.state);

    const addSet = new Set(addMap.keys());
    const curSet = new Set(curMap.keys());

    const addedStates: State[] = [];
    Array.from(difference(addSet, curSet)).forEach(k => {
      const s = addMap.get(k) as State;
      if (s.op === '!*') {
        toRemove?.push(new State(s.param, '*', ''));
      } else {
        addedStates.push(s);
      }
    });

    const filteredStates: State[] = [];
    const remSet = new Set(toRemove.map(s => JSON.stringify(s)));
    const removed = intersection(curSet, remSet);
    curMap.forEach((s, key) => {
      if (!removed.has(key)) {
        filteredStates.push(s);
      }
    });
    this.state.length = 0;
    this.state.push(...filteredStates, ...addedStates);
    this.updateLocation();
    this.updateListeners();
  }

  updateLocation() {
    const hash = this.state.map(s => {
      const param = encodeURIComponent(s.param);
      const value = encodeURIComponent(s.value);
      return `${param}${s.op}${value}`;
    });
    this.historyObj.pushState(null, '', `#${hash.join('&')}`);
  }

  /** Send new state to clients */
  updateListeners() {
    STATE.emit(this.state);
  }
}

const manager = new StateManager();
