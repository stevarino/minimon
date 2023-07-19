"""
Create a new woff2 file as a subset of material-icons-outlined.woff2 (Google,
Apache-licenced).

Running this is only needed if new symbols are added to HTML/Javascript.

Operates by scanning symbols.ts and index.html for hex-style unicode entries,
and building a font file with just those entries. This results in a 99% file
size reduction which greatly increases page load speed.

Installation and usage:

```
python3 -m venv src/scripts/font-extract/env
source src/scripts/font-extract/env/bin/activate
pip install -r src/scripts/font-extract/requirements.txt

python3 src/scripts/font-extract/font-extract.py
```
"""

import fontTools.subset as subset

import os.path as path
import re
import time

patterns = {
  'common/symbols.ts':  r'\\u\{([0-9A-Fa-f]+)\}',
  'static/index.html': r'&#x([0-9A-Fa-f]+);'
}

src = __file__
while not src.endswith('src'):
  src = path.dirname(src)

infile = path.join(src, 'static', 'material-icons-outlined.woff2')
outfile = path.join(src, 'static', 'subset.woff2')

chars = set()
for filename, pattern in patterns.items():
  with open(path.join(src, filename), 'r') as fp:
    chars.update(re.findall(pattern, fp.read()))
unicodes = subset.parse_unicodes(','.join(chars))
print(f'Generating font file for {len(chars)} glyphs')

options = subset.Options()
with open(infile, 'rb') as fp:
  font = subset.load_font(fp, options, dontLoadGlyphNames=True)
  subsetter = subset.Subsetter(options)
  subsetter.populate(unicodes=unicodes)
  subsetter.subset(font)
  subset.save_font(font, outfile, options)

ts = f'{time.time():.0f}'
patterns = [
  ['static/style.css', r'(url\(subset.woff2)[^)]*', f'\\1?{ts}'],
  ['static/index.html', r'(href="style.css)[^"]*', f'\\1?{ts}'],
]
for filename, find, replace in patterns:
  with open(path.join(src, filename), 'r') as fp:
    file_contents = re.sub(find, replace, fp.read())
  with open(path.join(src, filename), 'w') as fp:
    fp.write(file_contents)
  print('Updated ', filename)
