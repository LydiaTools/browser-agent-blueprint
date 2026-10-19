'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = require('../manifest.json');
const skill = path.join(root, 'skills/browser-task-recovery');
const names = [...manifest.modules, 'integrations/muse.txt', 'integrations/grok.txt', 'integrations/codex.txt', 'workflows/cloud_browser.txt', 'workflows/content_entry.txt', 'workflows/data_validation.txt', 'workflows/social_ops.txt'];
if (new Set(names).size !== 19 || names.some(p => !/^(prompts|integrations|workflows)\/[a-z0-9_]+\.txt$/.test(p))) throw new Error('Unexpected skill source allowlist.');
for (const file of names) {
  const output = path.join(skill, 'references', file);
  fs.mkdirSync(path.dirname(output), {recursive: true});
  fs.copyFileSync(path.join(root, file), output);
}
fs.copyFileSync(path.join(root, 'manifest.json'), path.join(skill, 'references/manifest.json'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(skill, 'LICENSE'));
console.log('Packaged 19 original sources, their manifest and MIT notice into the self-contained skill.');
