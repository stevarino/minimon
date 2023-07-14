import * as events from '../common/events'
import { View } from './view';
import { networkInit as networkInit } from './network';

events.workerInit();

export const VIEW = new View();

events.FIELDS_REQ.addListener(searchTerm => {
  events.FIELDS_RES.emit(VIEW.findFields(searchTerm));
});

events.STATE.addListener(state => {
  VIEW.mergeFilterState(state);
});

events.OPTIONS.addListener(options => {
  VIEW.setOptions(options);
});

events.TABLE_AGG_REQ.addListener(() => {
  events.TABLE_AGG_RES.emit(VIEW.getAggregateTable());
});

events.TABLE_PACKET_REQ.addListener(limit => {
  events.TABLE_PACKET_RES.emit(VIEW.getPacketTable(limit));
});

events.PACKETS_REQ.addListener(() => {
  events.PACKETS_RES.emit(VIEW.getPayloads());
});

events.PACKET_REQ.addListener(packetId => {
  events.PACKET_RES.emit([packetId, VIEW.getPayload(packetId)]);
});

networkInit();
