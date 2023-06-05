
import { DefaultMap } from "../../lib";
import { Dataset, Packet, Options, FinalOptions, optionsWithDefaults, NULL } from "./lib";
import { FilterItem, FilterSet } from "./filters";
import { FieldTrieRoot } from './fieldTrie'

export interface Table {
  headers: string[];
  rows: string[][];
  packets: Map<number, Packet>;
}

/**
 * Map of packet keys to ValueIndexes (packet values => packet ids).
 * 
 * Intended as the primary datastore.
 */
export class PacketStore {
  // _normalizationPattern = /\.\d+/
  // _tokenSplit = /\]\[|\[|\]|\./

  // masterIndex: Map<number, Packet> = new Map();
  packets: Packet[] = [];
  options: FinalOptions;
  packetIds = new Map<number, Packet>();

  // /** observed packet fields */
  // fields: Set<string> = new Set();
  // normalizedFields: DefaultMap<string, Set<string>> = new DefaultMap(() => new Set<string>());

  // /** foo.bar.baz[0][1]blah => [foo, bar, baz, 0, 1, blah] */
  // fieldTokens: DefaultMap<string, string[]> = new DefaultMap(
  //   (field: string) => this.tokenizeField(field));

  root = new FieldTrieRoot();


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
  addPacket(packet: Packet, filters: FilterSet): void {
    this.packets.push(packet);
    this.packetIds.set(packet.header.id, packet);

    for (const key in packet.payload) {
      // this.fields.add(key);
      this.root.addPacket(packet, filters);
      // let norm = this.normalizeField(key);
      // this.normalizedFields.getOrCreate(norm).value.add(key);
      // this.fieldTokens.getOrCreate(key);
      // this.fields.add(norm);
    }
  }

  addFilter(item: FilterItem) {
    this.root.addFilter(item);
  }

  // tokenizeField(field: string) {
  //   return field.replace(/\]$/, '').split(this._tokenSplit);
  // }

  // normalizeField(field: string) {
  //   return field.replace(this._normalizationPattern, '[*]').replace('].', ']');
  // }

  // /** Given a field (with possible wildcards), return all known matching fields. */
  // findFields(search: string) {
    
  //   // const norm = this.normalizeField(search);
  //   // const tokens = this.tokenizeField(search);
  //   // let fields = this.normalizedFields.get(norm);
  //   if (fields === undefined) {
  //     console.error(`Normalized field not found: "${norm}" ("${search}")`);
  //     return [search];
  //   }
  //   if (fields.has(search)) {
  //     return [search];
  //   }
  //   const results: string[] = [];
  //   fields.forEach(field => {
  //     const fieldTokens = this.fieldTokens.getOrCreate(field).value;
  //     let isMatch = true;
  //     for (let i=0; i<tokens.length; i++) {
  //       const token = tokens[i];
  //       if (token !== '*' && token !== fieldTokens[i]) {
  //         isMatch = false;
  //         break;
  //       }
  //     }
  //     if (isMatch) {
  //       results.push(field);
  //     }
  //   });
  //   return results;
  // }

  /** Remove all values < ms. */
  trim(ms: number) {
    let i = 0;
    const packets: number[] = [];
    for (const packet of this.packets) {
      i += 1;
      if (packet.header.ms >= ms) break;
      this.packetIds.delete(packet.header.id);
    }
    this.packets.splice(0, i - 1);
  }

  /**
   * Returns a new series of datasets (graph lines consisting of a label and
   * a series of x/y points).
   */
  render(filters: FilterSet|undefined=undefined): Dataset[] {
    const datasets: Dataset[] = [];
    
    if (filters === undefined) filters = new FilterSet(this);
    const groups = filters.getGroups();

    class XYMap extends DefaultMap<number,number> {};
    const datasetMap = new DefaultMap<string, XYMap>(() => new XYMap(() => 0));
    for (const packet of this.packets) {
      if (filters.isFiltered(packet)) continue;
      let grp = filters.getPacketGrouping(packet, groups);
      let dm = datasetMap.getOrCreate(grp).value;
      const packet_x = this.bucket(packet.header.ms);
      dm.set(packet_x, (dm.getOrCreate(packet_x).value) + 1);
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

  /** Return data in an aggregated (grouped) manner */
  tabulateAggregate(filters: FilterSet): Table {
    const groups = filters.getGroups();
    const fields: string[] = [];
    for (const [_, item] of filters.getItems()) {
      fields.push(...item.getFields())
    }
    const headers = ['_cnt', '_sz', ...fields];
    const packets = new Map<number, Packet>();

    const rowMap = new DefaultMap<string, {cnt: number, size: number}>(() => {
      return {cnt: 0, size: 0};
    });

    for (const packet of this.packets) {
      if (filters.isFiltered(packet)) continue;
      packets.set(packet.header.id, packet);
      const grp = filters.getPacketGrouping(packet, groups);
      const row = rowMap.getOrCreate(grp).value;
      row.cnt += 1;
      row.size += packet.header.size as number;
    }
    const rows: string[][] = [];
    rowMap.forEach((size, key) => {
      const entries = new URLSearchParams(key);
      rows.push([
        String(size.cnt),
        String(size.size),
        ...fields.map(f => entries.get(f) ?? NULL),
      ]);
    });
    return {
      headers: headers,
      rows: rows,
      packets: packets,
    }
  }

  tabulateUnaggregated(filters: FilterSet, limit: number): Table {
    const fields: string[] = [];
    for (const [param, item] of filters.getItems()) {
      fields.push(...item.getFields());
    }
    const headers = ['_id', '_sz', ...fields];
    const rows: string[][] = [];
    const packets = new Map<number, Packet>();
    if (limit === 0) {
      limit = this.packets.length;
    }
    for (let i = 0; i < this.packets.length; i++) {
      const packet = this.packets[this.packets.length - 1 - i];
      if (filters.isFiltered(packet)) continue;
      if (limit-- === 0) break;
      packets.set(packet.header.id, packet);
      rows.push([
        String(packet.header.id),
        String(packet.header.size),
        ...fields.map(f => String(packet.payload[f] ?? NULL)),
      ]);
    }
    return {
      headers: headers,
      rows: rows,
      packets: packets,
    }
  }

  // denormalize(field: string): Set<string> {
  //   return this.normalizedFields.get(field) ?? new Set(field);
  // }
  
  getFields(): string[] {
    return Array.from(this.root.getFields());
  }
}
