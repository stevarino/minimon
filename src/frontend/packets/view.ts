
import { DefaultMap } from "../../lib";
import { Dataset, Packet, Options, FinalOptions, optionsWithDefaults, NULL, ROOT } from "./lib";
import { FILTER, Filters } from "./filters";

/** packet field value to set of packet-id's */
export type Values = DefaultMap<string, Set<number>>;

/**
 * Map of packet keys to ValueIndexes (packet values => packet ids).
 * 
 * Intended as the primary datastore.
 */
export class IndexStore {
  // masterIndex: Map<number, Packet> = new Map();
  packets: Packet[] = [];
  options: FinalOptions;

  /** observed packet fields */
  fields: Set<string> = new Set();

  constructor(options: Options={}) {
    this.options = optionsWithDefaults(options);
  }

  /** Converts a ms timestamp to a left-aligned bucket value. */
  bucket(ms: number): number {
    return Math.floor(Math.floor(ms / this.options.msPerBucket) * this.options.msPerBucket);
  }

  /**
   * Adds a packet to all indexes. 
   * 
   * NOTE: Assumes packets come in order.
   */
  addPacket(packet: Packet): void {
    this.packets.push(packet);

    for (const key in packet) {
      if (key !== '_ms' && key != '_length') {
        this.fields.add(key);
      }
    }
  }

  /** Remove all values < ms. */
  trim(ms: number) {
    let i = 0;
    for (const packet of this.packets) {
      i += 1;
      if (packet._ms >= ms) break;
    }
    this.packets.splice(0, i - 1);
  }

  /**
   * Returns a new series of datasets (graph lines consisting of a label and
   * a series of x/y points).
   */
  render(filters: Filters|undefined=undefined): Dataset[] {
    const datasets: Dataset[] = [];
    
    if (filters === undefined) filters = new Filters();
    const groups = filters.getGroups();

    class XYMap extends DefaultMap<number,number> {};
    const datasetMap = new DefaultMap<string, XYMap>(() => new XYMap(() => 0));
    for (const packet of this.packets) {
      if (filters.isFiltered(packet)) continue;
      let grp = filters.getPacketGrouping(packet, groups);
      let dm = datasetMap.getOrCreate(grp)[0];
      const packet_x = this.bucket(packet._ms);
      dm.set(packet_x, (dm.getOrCreate(packet_x)[0]) + 1);
    }

    for (const [label, pts] of datasetMap) {
      const data: { x:number, y:number }[] = [];
      pts.forEach((y, x) => {
        data.push({ x, y });
      });
      datasets.push({ label, data })
    }
    return datasets;
  }
}

/** Set of active filters and groups. */
export class View {
  /** List of current filters (including groups) */
  filters = new Filters();
  indexes: IndexStore;
  updateCallback: ()=> void;
  lastRefresh = 0;
  refreshInterval = 300;

  // the current view - mapping of time => (datafield => total)
  chartData: Dataset[];
  _currentTime: number = 0;
  options: FinalOptions;

  constructor(chartData: Dataset[], updateCallback: (min: number, max: number)=> void, options: Options = {}) {
    this.indexes = new IndexStore();
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
  addFilter(key: string, type: FILTER.Type|string, value: string) {
    if (typeof type === 'string') {
      const lookup = FILTER.Type.map.get(Number(type));
      if (lookup === undefined) {
        console.error(`Unknown filter type: ${type}`);
        return;
      }
      type = lookup;
    }
    if (!type.hasValue) {
      value = NULL;
    }
    this.filters.addFilter(key, type, value);
    this.reindex();
  }

  /** Removes a particular filter, initiated by user. */
  removeFilter(key: string, type: FILTER.Type|string, value: string) {
    if (typeof type === 'string') {
      const lookup = FILTER.Type.map.get(Number(type));
      if (lookup === undefined) {
        console.error(`Unknown filter type: ${type}`);
        return;
      }
      type = lookup;
    }
    if (!type.hasValue) {
      value = NULL;
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
      this.filters.addFilter(key, FILTER.EQUALS, val)
      this.filters.removeFilter(key, FILTER.GROUP, NULL)
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

  /** Adds a packet to both index and current view. */
  addPacket(packet: Packet, now: number|undefined=undefined) {
    if (now === undefined) now = new Date().getTime();
    this.indexes.addPacket(packet);
    const bucket = this.indexes.bucket(packet._ms);

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
    return Array.from(this.indexes.fields).sort((a: string, b: string) => {
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
    return [...this.filters.getGroups()];
  }

  getFilters() {
    return this.filters.getFilters();
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
}