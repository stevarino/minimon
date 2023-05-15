/**
 * Copies files during build.
 */

import * as path from 'path';
import * as fs from 'fs';

const packages = {
  'accessible-autocomplete': 'node_modules/accessible-autocomplete/dist'
}

var root =path.resolve(__dirname, '..', '..');
var input = path.resolve(root, 'static');
var output = path.resolve(root, 'dist', 'static')
fs.readdirSync(input).forEach(f => {
  console.log('Copying ', f);
  fs.copyFileSync(path.resolve(input, f), path.resolve(output, f))
})

for (const [name, src] of Object.entries(packages)) {
  fs.readdirSync(path.resolve(root, src)).forEach(f => {
    if (fs.lstatSync(path.resolve(root, src, f)).isDirectory()) {
      return;
    }
    console.log('Copying ', f);
    if (!fs.existsSync(path.resolve(output, name))) {
      fs.mkdirSync(path.resolve(output, name));
    }
    fs.copyFileSync(path.resolve(root, src, f), path.resolve(output, name, f))
  });
}
