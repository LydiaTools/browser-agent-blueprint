'use strict';
const fs = require('node:fs');
const manifest = require('../manifest.json');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
console.log(JSON.stringify({
  prompt_modules: manifest.modules.length,
  workflow_templates: fs.readdirSync(path.join(root, 'workflows')).filter(f => f.endsWith('.txt')).length,
  integration_contracts: fs.readdirSync(path.join(root, 'integrations')).filter(f => f.endsWith('.txt')).length,
  prompt_lines: manifest.modules.reduce((n, p) => n + fs.readFileSync(path.join(root, p), 'utf8').trimEnd().split('\n').length, 0),
  profiles: Object.fromEntries(Object.entries(manifest.profiles).map(([name, ids]) => [name, {
    modules: ids.length,
    utf8_bytes: ids.reduce((n,id) => n + Buffer.byteLength(fs.readFileSync(path.join(root,manifest.modules[id]))), Math.max(0,ids.length-1))
  }]))
}, null, 2));
