'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const manifest = require('../manifest.json');
const profile = process.argv[2] || 'minimal';
const ids = manifest.profiles[profile];
if (!ids) { console.error('Unknown profile: ' + profile); process.exit(2); }
const text = ids.map(id => fs.readFileSync(path.join(root, manifest.modules[id]), 'utf8')).join('\n');
if (process.argv.includes('--stdout')) process.stdout.write(text);
else {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  const output = path.join(root, 'dist', profile + '.txt');
  fs.writeFileSync(output, text, { mode: 0o600 });
  console.log(JSON.stringify({ profile, modules: ids.length, utf8_bytes: Buffer.byteLength(text),
    sha256: crypto.createHash('sha256').update(text).digest('hex'), output }, null, 2));
}
