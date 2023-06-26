/**
 * A packet-specific implementation of a Trie.
 */
import { Packet } from './lib';
import { FilterItem, FilterSet } from './filters';
import { FrontendOptions } from '../../options';
import { TrieRoot } from './trie';

/** Contains a mapping from fields to packets within a Trie */
export class FieldContainer extends TrieRoot<number> {
  constructor(options: FrontendOptions) {
    super({
      collapseArrays: options.collapseArrays,
      searchPrefixes: options.searchPrefixes
    });
  }

  /** On a new trie node creation, test if it matches a known filter */
  linkFieldToFilter(tempRoot: TrieRoot<number>, filters: FilterSet) {
    for (const [searchTerm, item] of filters.getItems()) {
      tempRoot.find(searchTerm).forEach(trie => item.addField(trie));
    }
  }

  /** Add fields from a packet to the trie, and associated trie nodes with filters */
  addPacket(packet: Packet, filters: FilterSet) {
    Object.keys(packet.payload).forEach(field => {
      const trie = this.addNode(field, (tempRoot) => {
        this.linkFieldToFilter(tempRoot, filters)
      });
      trie.values.add(packet.header.id);
    });
  }

  /** Apply a filter to the trie, associating the results */
  addFilter(filter: FilterItem) {
    this.find(filter.searchParam).forEach(field => {
      filter.addField(field);
    });
  }

  /** Update options */
  updateFrontendOptions(options: FrontendOptions) {
    this.options = options;
    this.updateOptions({
      collapseArrays: options.collapseArrays,
      searchPrefixes: options.searchPrefixes
    });
  }
}
