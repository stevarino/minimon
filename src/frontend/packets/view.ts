
import { Dataset, Packet } from './lib';
import { FilterSet, FilterType } from './filters';
import { PacketStore, Table } from './packetStore';
import { FrontendOptions, buildFrontendOptions } from '../../options';
import { State } from '../page/common';

interface CHART_DATA {
  datasets: Dataset[], 
  labels: string[]
}

/** Set of active filters and groups. */
export class View {
  /** List of current filters (including groups) */
  filters: FilterSet;
  storage: PacketStore;
  updateCallback: () => void;
  lastRefresh = 0;
  refreshInterval = 300;

  // the current view - mapping of time => (datafield => total)
  chartData: CHART_DATA;
  _currentTime = 0;
  options: FrontendOptions;

  constructor(chartData: CHART_DATA, updateCallback: (min: number, max: number) => void, options?: FrontendOptions) {
    this.chartData = chartData;

    this.options = options ?? buildFrontendOptions({});
    this.storage = new PacketStore(this.options);
    this.filters = new FilterSet(this.storage);

    this.updateCallback = () => updateCallback(
      this._currentTime - this.options.duration - this.options._msPerBucket,
      this._currentTime - this.options._msPerBucket);
  }

  /** Generate a new series of datasets and merge it with the graph datasets */
  reindex() {
    this.chartData.datasets.length = 0;
    this.chartData.labels.length = 0;
    const newData = this.storage.render(this.filters).forEach(ds => {
      this.chartData.datasets.push(ds);
      this.chartData.labels.push(ds.label);
    });
    this.updateCallback();
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

  /** Garbage collect chartData (and then reaquest storage to do so also) */
  trim(now: number) {
    const ms = now - this.options.duration - 2 * this.options._msPerBucket;
    for (const dataset of this.chartData.datasets) {
      let i = 0;
      for (const pt of dataset.data) {
        i += 1;
        if (pt.x >= ms) break;
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
    for (const dataset of this.chartData.datasets) {
      if (dataset.label == label) {
        found = true;
        if (dataset.data.length > 0 && dataset.data[dataset.data.length - 1].x == bucket) {
          dataset.data[dataset.data.length - 1].y += 1;
        } else {
          dataset.data.push({ x: bucket, y: 1 });
        }
        break;
      }
    }

    if (found === false) {
      this.chartData.datasets.push({ label, data: [{ x: bucket, y: 1 }], });
      this.chartData.labels.push(label);
      this.refresh(now);
    } else {
      this.maybeRefresh(now);
    }
  }

  refresh(now: number) {
    this.lastRefresh = now;
    this.updateCallback();
  }

  /** Send an update to the graph if its been long enough. */
  maybeRefresh(now: number) {
    if (now - this.lastRefresh > this.refreshInterval) {
      this.refresh(now);
    }
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

  *getPackets() {
    for (const packet of this.storage.packets) {
      if (!this.filters.isFiltered(packet)) {
        yield packet.payload;
      }
    }
  }

  getAggregateTable(): Table {
    return this.storage.tabulateAggregate(this.filters);
  }

  getPacketTable(limit: number): Table {
    return this.storage.tabulateUnaggregated(this.filters, limit);
  }

  setOptions(options: FrontendOptions) {
    this.options = options;
    this.storage.updateOptions(options);
  }

  mergeFilterState(state: State[]) {
    this.filters.mergeFromState(state);
    this.reindex();
  }
}
