# Squiggly Lines

A light-weight monitoring platform with features similar to Prometheus.

Designed as a proxy library for json-like packets, runs a local web server to forward packets to an HTML client for inspection and visualiztion.

## Assumptions

 - JSON-like packet structure.
 - All values are string-like (TODO: make this less impactful).
 - Array items share a schema (can be disabled in options).
