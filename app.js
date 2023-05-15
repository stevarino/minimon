
const { Web } = require('./build/web');
const { Relay } = require('./build/relay');
const { options } = require('./build/options');

let web = new Web(options.web);
let relay = new Relay(options.relay, options.server, options.server_version)
relay.writeTo(web);
