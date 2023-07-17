
import { DefaultMap, Packet, Dataset, NULL, ROOT, Table, TABLE_COLUMNS, Grouping } from '../common/types';
import { FilterItem, FilterSet } from './filters';
import { FieldContainer } from './fieldContainer';
import { buildFrontendOptions, FrontendOptions } from '../options';

/**
 * Interface for packet data, provides bulk rendering and management functions.
 */
export class PacketStore {
  packets: Packet[] = [];
  options: FrontendOptions;
  packetIds = new Map<number, Packet>();

  root: FieldContainer;

  constructor(options?: FrontendOptions) {
    const opts = options ?? buildFrontendOptions({});
    this.options = opts;
    this.root = new FieldContainer(opts);
  }

  /** Converts a ms timestamp to a left-aligned bucket value. */
  bucket(ms: number): number {
    return Math.floor(Math.floor(ms / this.options._msPerBucket) * this.options._msPerBucket);
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
      this.root.addPacket(packet, filters);
    }
  }

  addFilter(item: FilterItem) {
    this.root.addFilter(item);
  }

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
  render(filters?: FilterSet): Dataset[] {
    const datasets: Dataset[] = [];
    
    if (filters === undefined) filters = new FilterSet(this);
    const groups = filters.getGroups();

    class XYMap extends DefaultMap<number,number> {}
    const datasetMap = new DefaultMap<string, XYMap>(() => new XYMap(() => 0));
    for (const packet of this.packets) {
      if (filters.isFiltered(packet)) continue;
      const grp = filters.getPacketGroupingString(packet, groups);
      const dm = datasetMap.getOrCreate(grp).value;
      const packet_x = this.bucket(packet.header.ms);
      dm.set(packet_x, (dm.getOrCreate(packet_x).value) + 1);
    }

    for (const [label, pts] of datasetMap) {
      const data: [ x:number, y:number ][] = Array.from(pts);
      datasets.push({ label, data });
    }
    return datasets;
  }

  /** Return data in an aggregated (grouped) manner */
  tabulateAggregate(filters: FilterSet): Table {
    const groups = filters.getGroups();
    const fields: string[] = [];
    for (const [_, item] of filters.getItems()) {
      fields.push(...item.getFields());
    }
    const headers = [TABLE_COLUMNS.COUNT, TABLE_COLUMNS.SIZE, ...fields];
    const packets = new Map<number, Packet>();

    /** packet-grouping to packet count and size (each grouping is one row) */
    const rowMap = new DefaultMap<string, {cnt: number, size: number}>(() => {
      return {cnt: 0, size: 0};
    });

    for (const packet of this.packets) {
      if (filters.isFiltered(packet)) continue;
      packets.set(packet.header.id, packet);
      const grp = filters.getPacketGroupingString(packet, groups);
      const row = rowMap.getOrCreate(grp).value;
      row.cnt += 1;
      row.size += packet.header.size;
    }
    const rows: string[][] = [];
    rowMap.forEach((size, key) => {
      if (key === ROOT) {
        rows.push([
          String(size.cnt), 
          String(size.size),
        ]);
        return;
      }
      const entries: Grouping = JSON.parse(key);
      rows.push([
        String(size.cnt),
        String(size.size),
        ...fields.map(f => {
          // non-wildcard search - 1:1 searchTerm to field
          if (entries[f] !== undefined) {
            return (entries[f][f]) ?? NULL;
          }
          for (const [_, fieldVals] of Object.entries(entries)) {
            if (typeof fieldVals === 'object' && fieldVals[f] !== undefined) {
              return fieldVals[f];
            }
          }
          return NULL;
        }),
      ]);
    });
    return {
      headers: headers,
      rows: rows,
      packets: packets,
    };
  }

  tabulateUnaggregated(filters: FilterSet, limit: number): Table {
    const fields: string[] = [];
    for (const [_, item] of filters.getItems()) {
      fields.push(...item.getFields());
    }
    const headers = [TABLE_COLUMNS.ID, TABLE_COLUMNS.SIZE, ...fields];
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
        ...fields.map(f => packet.payload[f].value),
      ]);
    }
    return { headers, rows, packets, };
  }

  getFields(): string[] {
    return Array.from(this.root.getPaths());
  }

  updateOptions(options: FrontendOptions) {
    this.options = options;
    this.root.updateOptions(options);
  }
}
