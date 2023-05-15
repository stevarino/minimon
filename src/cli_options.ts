
const {program } = require('commander');

program
  .option('-s,--server', 'Server address', 'localhost:19132')
  .option('-r,--relay', 'Relay address', '0.0.0.0:19134')
  .option('--server_version <version>')
  .option('-w,--web_port <number>', 'Web Server Port', '8080')
  .parse();

const options = program.opts();

export { options };
