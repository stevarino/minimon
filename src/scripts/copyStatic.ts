/**
 * Copies files during build.
 */

import * as path from 'path';
import * as fs from 'fs';

const packages = {
  'accessible-autocomplete': 'node_modules/accessible-autocomplete/dist',
};

const root =path.resolve(__dirname, '..', '..');
const input = path.resolve(root, 'src', 'static');
const output = path.resolve(root, 'dist', 'static');
fs.readdirSync(input).forEach(f => {
  console.info('Copying ', f);
  fs.copyFileSync(path.resolve(input, f), path.resolve(output, f));
});

for (const [name, src] of Object.entries(packages)) {
  if (fs.lstatSync(path.resolve(root, src)).isDirectory()) {
    fs.readdirSync(path.resolve(root, src)).forEach(f => {
      if (fs.lstatSync(path.resolve(root, src, f)).isDirectory()) {
        return;
      }
      console.info('Copying ', f);
      if (!fs.existsSync(path.resolve(output, name))) {
        fs.mkdirSync(path.resolve(output, name));
      }
      fs.copyFileSync(path.resolve(root, src, f), path.resolve(output, name, f));
    });
  } else {
    console.info('Copying ', src);
    if (!fs.existsSync(path.resolve(output, name))) {
      fs.mkdirSync(path.resolve(output, name));
    }
    fs.copyFileSync(path.resolve(root, src), path.resolve(output, name, path.basename(src)));
  }
}
