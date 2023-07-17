/** State is used to describe the union of filters and grouping */

import { regexEscape } from './lib';

export type StateTriple = [string, string, string|string[]];

export class State {
  param: string;
  op: string;
  value: string;
  passedValue: string|string[];

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

  toString() {
    return JSON.stringify(this);
  }

  equals(other: State) {
    return this.param === other.param && this.op === other.op && this.value === other.value;
  }

  /** Bulk create state objects */
  static create(states: StateTriple[]): State[] {
    return states.map(s => new State(...s));
  }

  static fromGroupings(groupings: {[param: string]: {[field: string]: string}}) {
    const stateSet: State[][] = [
      [],  // [field == value ...]
      [],  // [field != value ...]
      [],  // [param ~ values]
      [],  // [param !~ values]
    ];
    const values: string[] = [];
    Object.entries(groupings).forEach(([param, fields]) => {
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

  static fromField(field: string, value: string, params: string[]) {
    const stateSet: State[][] = [];
    stateSet.push(  
      [new State(field, '==', value), new State(field, '!*', ''), 
        ...params.map(p => new State(p, '!*', ''))],
      [new State(field, '!=', value)],
    );
    params.forEach(param => {
      if (param !== field) {
        stateSet.push(
          [new State(param, '==', value), new State(param, '!*', '')],
          [new State(param, '!=', value)],
        );
      }
      stateSet.push([new State(param, '*', '')]);
    });
    return stateSet;
  }

  static fromParam(param: string, fieldValues: {[key: string]: string}) {
    const stateSet: State[][] = [];
    const values: string[] = [];
    Object.entries(fieldValues).forEach(([field, value]) => {
      values.push(value);
      if (param !== field || values.length === 1) {
        stateSet.push(
          [new State(field, '==', value), new State(param, '!*', '')],
          [new State(field, '!=', value)],
        );
        if (field !== param) {
          stateSet.push(
            [new State(param, '==', value), new State(param, '!*', '')],
            [new State(param, '!=', value)],
          );
        }
      }
    });
    if (values.length !== 1) {
      stateSet.push(
        [new State(param, '~', values), new State(param, '!*', '')],
        [new State(param, '!~', values)],
      );
    }
    return stateSet;
  }
  

  static fromArray(filters: [param: string, op: string, value: string|string[]][][]) {
    return filters.map(f => State.create(f));
  }
}