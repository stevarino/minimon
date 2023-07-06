import { EventEmitter } from 'events';
import { regexEscape } from '../../lib';
import { FrontendOptions } from '../../options';

/** State is used to describe the union of filters and grouping */
export class State {
  param: string;
  op: string;
  value: string;
  passedValue: string|string[]

  constructor(param: string, op: string, value: string|string[]) {
    this.param = param;
    this.op = op;
    this.passedValue = value;

    if (Array.isArray(value)) {
      if (op !== '~' && op !== '!~') {
        throw new Error(`Received multiple values for non regex filter: ${[param, op, value]}`);
      }
      this.value = value.map(v => regexEscape(v)).join('|');
    } else {
      this.value = value;
    }
  }

  /** String value for end-user display */
  displayValue() {
    if (Array.isArray(this.passedValue)) {
      if (this.passedValue.length > 1) {
        return `[${this.passedValue[0]}, ...]`;
      } else {
        return JSON.stringify(this.passedValue);
      }
    }
    return this.passedValue;
  }

  /** toJSON serialization support */
  toJSON() {
    return [this.param, this.op, this.value];
  }

  /** Bulk create state objects */
  static create(states: [param: string, op: string, value: string|string[]][]): State[] {
    return states.map(s => new State(...s));
  }
}

export const emitter = new EventEmitter();

function emitterSetup<T>(signal: string) {
  return {
    emit: (arg: T) => {
      emitter.emit(signal, arg);
    },
    addListener: (callback: (data: T) => void) => {
      emitter.addListener(signal, callback);
    }
  }
}

export const STATE = emitterSetup<State[]>('state');
export const OPTIONS = emitterSetup<FrontendOptions>('options');

