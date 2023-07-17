import { Packet, Dataset, Table, PacketField } from '../common/types';
import { FilterSet } from './filters';
import { FilterType } from './filterTypes';
import { PacketStore } from './packetStore';
import { FrontendOptions, buildFrontendOptions } from '../options';
import { StateTriple } from '../common/state';
import * as events from '../common/events';
import { inflateObject, yieldJoin } from '../common/lib';

/** Set of active filters and groups. */
export class View {
  /** List of current filters (including groups) */
  filters: FilterSet;
  storage: PacketStore;
  lastRefresh = 0;
  refreshInterval = 300;

  // the current view - mapping of time => (datafield => total)
  datasets: Dataset[] = [];
  _currentTime = 0;
  options: FrontendOptions;

  /** Temporary holding spot for table packets, to prevent GC */
  table: Table|undefined;

  constructor(options?: FrontendOptions) {
    this.options = options ?? buildFrontendOptions({});
    this.storage = new PacketStore(this.options);
    this.filters = new FilterSet(this.storage);

    // this.updateCallback = () => updateCallback(
    //   this._currentTime - this.options.duration - this.options._msPerBucket,
    //   this._currentTime - this.options._msPerBucket);
  }

  /** Generate a new series of datasets and merge it with the graph datasets */
  reindex() {
    this.datasets.length = 0;
    this.datasets.push(...this.storage.render(this.filters));
    this.sendChartData(false);
  }

  /** Adds a grouping. */
  addGroup(key: string) {
    this.filters.addGroup(key);
    this.reindex();
  }

  /** Remove a grouping */
  removeGroup(key: string) {
    this.filters.removeGroup(key);
    this.reindex();
  }

  /** Adds a particular filter, initiated by user.  */
  addFilter(key: string, type: FilterType | string, value: string) {
    if (typeof type === 'string') {
      const lookup = FilterType.get(type);
      if (lookup === undefined) {
        console.error(`Unknown filter type: ${type}`);
        return;
      }
      type = lookup;
    }
    this.filters.addFilter(key, type, value);
    this.reindex();
  }

  /** Removes a particular filter, initiated by user. */
  removeFilter(key: string, type: FilterType | string, value: string) {
    if (typeof type === 'string') {
      const lookup = FilterType.get(type);
      if (lookup === undefined) {
        console.error(`Unknown filter type: ${type}`);
        return;
      }
      type = lookup;
    }
    this.filters.removeFilter(key, type, value);
    this.reindex();
  }

  /** Garbage collect datasets (and then reaquest storage to do so also) */
  trim(now: number) {
    const ms = now - this.options.duration - 2 * this.options._msPerBucket;
    for (const dataset of this.datasets) {
      let i = 0;
      for (const pt of dataset.data) {
        i += 1;
        if (pt[0] >= ms) break;
      }
      dataset.data.splice(0, i - 1);
    }
    this.storage.trim(ms);
  }

  /** Adds a packet to both index and current view. */
  addPacket(packet: Packet, now: number | undefined = undefined) {
    if (now === undefined) now = new Date().getTime();
    this.storage.addPacket(packet, this.filters);
    const bucket = this.storage.bucket(packet.header.ms);

    if (this._currentTime === 0) {
      this._currentTime = bucket;
    } else if (this._currentTime != bucket) {
      // check for trimming
      this._currentTime = bucket;
      this.trim(now);
    }

    if (this.filters.isFiltered(packet)) {
      this.maybeRefresh(now);
      return;
    }

    const label = this.filters.getPacketGroupingString(packet);
    let found = false;
    for (const dataset of this.datasets) {
      if (dataset.label == label) {
        found = true;
        if (dataset.data.length > 0 && dataset.data[dataset.data.length - 1][0] == bucket) {
          dataset.data[dataset.data.length - 1][1] += 1;
        } else {
          dataset.data.push([bucket, 1]);
        }
        break;
      }
    }

    if (found === false) {
      this.datasets.push({ label, data: [[bucket, 1 ]], });
    }
    this.maybeRefresh(now);
  }

  sendChartData(isPartial: boolean) {
    const datasets: [string, [number, number][]][] = [];
    for (const ds of this.datasets) {
      const pts: [number, number][] = [];
      datasets.push([ds.label as string, pts]);
      if (isPartial) {
        const start = Math.max(0, ds.data.length - 2);
        for (var i=start; i < ds.data.length; i++) {
          let pt = ds.data[i];
          pts.push(ds.data[i]);
        }
      } else {
        pts.push(...ds.data);
      }
    }
    events.CHART_DATA.emit({
      startTime: this._currentTime - this.options.duration - this.options._msPerBucket,
      endTime: this._currentTime - this.options._msPerBucket,
      isPartial,
      datasets
    });
  }

  /** Send an update to the graph if its been long enough. */
  maybeRefresh(now: number) {
    if (now - this.lastRefresh > this.refreshInterval) {
      this.lastRefresh = now;
      this.sendChartData(true);
    }
  }

  findFields(searchTerm: string) {
    const results: string[] = [];
    const terms = searchTerm.split(' ');

    for (const field of this.getFields()) {
      if (terms.every(t=> field.indexOf(t) !== -1)) {
        results.push(field);
        if (results.length === this.options.searchResults) break;
      }
    }
    return results;
  }

  /** Returns observed fields. */
  *getFields() {
    yield* this.storage.getFields();
  }

  getGroups(): string[] {
    return [...this.filters.getGroups().map(item => item.searchParam)];
  }

  getGroupMapping() {
    return new Map(this.filters.getGroups().map(item => {
      return [item.searchParam, [...item.getFields()]];
    }));
  }

  getFilterItems() {
    return this.filters.getItems();
  }

  *getFilteredPayloads() {
    for (const packet of this.storage.packets) {
      if (!this.filters.isFiltered(packet)) {
        yield packet.payload;
      }
    }
  }

  /** Get a packet payload - used for packet dialog popup */
  getPayload(packetId: number) {
    return {
      packetId: packetId,
      payload: (this.storage.packetIds.get(packetId) ?? this.table?.packets?.get(packetId))?.payload,
      params: this.getParams(),
    };
  }

  /** Returns a string json-array of filtered packet payloads  */
  getPayloads() {
    const buffer = [];
    for (const packet of this.storage.packets) {
      if (!this.filters.isFiltered(packet)) {
        buffer.push(JSON.stringify(inflateObject<PacketField>(packet.payload)));
      }
    }
    // TODO: evaluate if ArrayBuffer would be more performant/needed
    return `[${buffer.join(',')}]`;
  }

  /** Return a list of search-param to fields pairings */
  getParams() {
    const params: [string, string[]][] = [];
    for (const [param, filterItem] of this.getFilterItems()) {
      params.push([param, Array.from(filterItem.getFields())]);
    }
    return params;
  }

  getAggregateTable(): Table {
    const table = this.storage.tabulateAggregate(this.filters);
    table.params = this.getParams();
    return table;
  }

  getPacketTable(limit: number): Table {
    const table = this.storage.tabulateUnaggregated(this.filters, limit);
    table.params = this.getParams();
    this.table = Object.assign({}, table);
    table.packets = undefined;
    return table;
  }

  setOptions(options: FrontendOptions) {
    this.options = options;
    this.storage.updateOptions(options);
  }

  mergeFilterState(state: StateTriple[]) {
    this.filters.mergeFromState(state);
    this.reindex();
  }
}
