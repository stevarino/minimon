
import { Dataset, Packet, Options, FinalOptions, optionsWithDefaults, NULL, ROOT } from "./lib";
import { EQUALS, FilterSet, FilterType } from "./filters";
import { PacketStore, Table } from "./packetStore";

/** Set of active filters and groups. */
export class View {
  /** List of current filters (including groups) */
  filters: FilterSet;
  indexes: PacketStore;
  updateCallback: ()=> void;
  lastRefresh = 0;
  refreshInterval = 300;

  // the current view - mapping of time => (datafield => total)
  chartData: Dataset[];
  _currentTime: number = 0;
  options: FinalOptions;

  constructor(chartData: Dataset[], updateCallback: (min: number, max: number)=> void, options: Options = {}) {
    this.indexes = new PacketStore();
    this.filters = new FilterSet(this.indexes);
    this.chartData = chartData;
    this.options = optionsWithDefaults(options);
    this.updateCallback = () => updateCallback(
      this._currentTime - this.options.duration - this.options.msPerBucket,
      this._currentTime - this.options.msPerBucket);
  }

  /** Generate a new series of datasets and merge it with the graph datasets */
  reindex() {
    const newData = this.indexes.render(this.filters);
    this.chartData.length = 0;
    for (const dataset of newData) {
      this.chartData.push(dataset);
    }
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
  addFilter(key: string, type: FilterType|string, value: string) {
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
  removeFilter(key: string, type: FilterType|string, value: string) {
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

  /**
   * Sets a series of filters, based on a graph tooltip link.
   * 
   * @param filter URLSearchParams encoded filters 'foo=bar&baz=1'
   */
  applyFilterSet(filter: string) {
    const params = Array.from(new URLSearchParams(filter));
    params.forEach(([key, val]) => {
      this.filters.addFilter(key, EQUALS, val);
      this.filters.removeGroup(key);
    });
    this.reindex();
  }

  trim(now: number) {
    const ms = now - this.options.duration - 2 * this.options.msPerBucket;
    for (const dataset of this.chartData) {
      let i = 0;
      for (const pt of dataset.data) {
        i += 1;
        if (pt.x >= ms) break;
      }
      dataset.data.splice(0, i - 1);
    }
    this.indexes.trim(ms);
  }

  onPacket(packetData: string, callback?: (packet: Packet) => void) {
    const packet: Packet = JSON.parse(packetData);
    packet.header.size = packetData.length;
    if (callback !== undefined) {
      callback(packet);
    }
    this.addPacket(packet);
  }

  /** Adds a packet to both index and current view. */
  addPacket(packet: Packet, now: number|undefined=undefined) {
    if (now === undefined) now = new Date().getTime();
    this.indexes.addPacket(packet, this.filters);
    const bucket = this.indexes.bucket(packet.header.ms);

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

    const label = this.filters.getPacketGrouping(packet);
    let found = false;
    for (const dataset of this.chartData) {
      if (dataset.label == label) {
        found = true;
        if (dataset.data.length > 0 && dataset.data[dataset.data.length-1].x == bucket) {
          dataset.data[dataset.data.length-1].y += 1;
        } else {
          dataset.data.push({x: bucket, y: 1});
        }
        break;
      }
    }

    if (found === false) {
      this.chartData.push({ label, data: [{x: bucket, y: 1}], })
    }
    this.maybeRefresh(now);
  }

  /** Send an update to the graph if its been long enough. */
  maybeRefresh(now: number) {
    if (now - this.lastRefresh > this.refreshInterval) {
      this.lastRefresh = now;
      this.updateCallback();
    }
  }

  /** Returns observed fields. */
  getFields(): string[] {
    const fields = this.indexes.getFields();
    return Array.from(fields).sort((a: string, b: string) => {
      if (a.startsWith('_') && !b.startsWith('_')) {
        return -1;
      }
      if (b.startsWith('_') && !a.startsWith('_')) {
        return 1;
      }
      return a < b ? -1 : 1;
    });
  }

  getGroups(): string[] {
    return [...this.filters.getGroups().map(item => item.searchParam)];
  }

  getFilterItems() {
    return this.filters.getItems();
  }

  getPackets()  {
    const packets = [];
    for (const packet of this.indexes.packets) {
      if (!this.filters.isFiltered(packet)) {
        packets.push(packet);
      }
    }
    return packets;
  }

  getTabularPackets(limit: number): Table {
    if (this.getGroups().length === 0) {
      return this.indexes.tabulateUnaggregated(this.filters, limit);
    }
    return this.indexes.tabulateAggregate(this.filters);
  }
}
