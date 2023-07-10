# Squiggly Lines

A light-weight monitoring platform for rapid debugging. Think Prometheus meets WireShark.

Designed as a proxy library for json-like packets, runs a local web server to forward packets to an HTML client for inspection and visualiztion. Allows fro dynamic grouping/filtering to discover trends.

See stevarino/bedrock-squiggles for a complete example.

## Assumptions

 - JSON-like packet structure.
 - All values are treated internally as strings.
 - Array items share a schema (can be disabled in options).

## Installation

```
npm install squiggly-lines
```

## Configuration

```
const squiggles = require('squiggly-lines');

// see src/options.ts
const webServer = new squiggles.Server({
  server: { port: 8080 },
  frontend: { title: 'My Squiggles Server' },
});

packetSrc.on(packet: object => {
  // call jsonEvent() for each packet object
  webServer.jsonEvent(packet)
});
```
