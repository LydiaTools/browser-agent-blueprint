/* MIT - LydiaTools. Self-contained installed-skill helper; stdout only. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../references');
const manifest = require('../references/manifest.json');
const integrations = ['muse', 'grok', 'codex'];
const workflows = ['cloud_browser', 'content_entry', 'data_validation', 'social_ops'];
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--list') {
    console.log(JSON.stringify({module_version: manifest.version, profiles: Object.keys(manifest.profiles), integrations, workflows}, null, 2));
  } else if (args.length === 1 && args[0] === '--help') {
    console.log('node assemble.cjs [profile] [--integration muse|grok|codex] [--workflow cloud_browser|content_entry|data_validation|social_ops]\nnode assemble.cjs --list');
  } else {
    const profile = args.shift() || 'minimal', additions = [], seen = new Set();
    if (!Object.hasOwn(manifest.profiles, profile)) throw new Error('Unknown task profile. Use --list.');
    const options = {};
    while (args.length) {
      const key = args.shift(), value = args.shift();
      if (!['--integration', '--workflow'].includes(key) || seen.has(key) || !value) throw new Error('Use each supported option at most once with a value.');
      seen.add(key); options[key] = value;
    }
    if (options['--integration']) {
      if (!integrations.includes(options['--integration'])) throw new Error('Unknown integration contract.');
      additions.push('integrations/' + options['--integration'] + '.txt');
    }
    if (options['--workflow']) {
      if (!workflows.includes(options['--workflow'])) throw new Error('Unknown workflow template.');
      additions.push('workflows/' + options['--workflow'] + '.txt');
    }
    const files = manifest.profiles[profile].map(id => manifest.modules[id]).concat(additions);
    const texts = files.map(file => {
      if (!/^(prompts|integrations|workflows)\/[a-z0-9_]+\.txt$/.test(file)) throw new Error('Unexpected source path.');
      return fs.readFileSync(path.join(root, file), 'utf8');
    });
    process.stdout.write(texts.join('\n'));
  }
} catch (error) {
  console.error('Browser task recovery: ' + error.message);
  process.exitCode = 2;
}
