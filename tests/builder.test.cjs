'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const core = require('../builder/core.js');
const root = path.resolve(__dirname, '..');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'builder/source-data.js'),'utf8'), context);
const data = context.window.BlueprintSources;

test('all six browser profiles exactly match the existing CLI output', () => {
  for (const profile of Object.keys(data.profiles)) {
    const result = core.compose(data,profile);
    const cli = execFileSync(process.execPath,['scripts/assemble.cjs',profile,'--stdout'],{cwd:root});
    assert.equal(Buffer.from(result.text).compare(cli),0,profile);
    assert.equal(result.bytes,cli.length);
  }
});
test('every bundled source is the exact tracked text, including line endings', () => {
  for(const [name,text] of Object.entries(data.files)) assert.equal(text,fs.readFileSync(path.join(root,name),'utf8'),name);
});
test('optional contracts are appended once in an explicit stable order', () => {
  const result=core.compose(data,'content','codex','content_entry');
  const cli=execFileSync(process.execPath,['scripts/assemble.cjs','content','--stdout'],{cwd:root}).toString();
  assert.equal(result.text,cli+'\n'+data.files['integrations/codex.txt']+'\n'+data.files['workflows/content_entry.txt']);
  assert.equal(new Set(result.files).size,result.files.length);
  assert.equal(result.filename,'blueprint-content-codex-content_entry.txt');
});
test('unknown profiles, inherited keys and arbitrary paths cannot select instructions', () => {
  for(const args of [['__proto__'],['missing'],['minimal','../../secret'],['minimal','none','social_ops.txt']]) assert.throws(()=>core.compose(data,...args));
});
