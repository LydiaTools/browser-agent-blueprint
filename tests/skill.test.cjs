'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), {execFileSync,spawnSync} = require('node:child_process');
const root = path.resolve(__dirname,'..'), skill = path.join(root,'skills/browser-task-recovery'), manifest = require('../manifest.json');

test('copied skill resources and license remain exact original bytes',()=>{
  for(const file of [...manifest.modules,'integrations/muse.txt','integrations/grok.txt','integrations/codex.txt','workflows/cloud_browser.txt','workflows/content_entry.txt','workflows/data_validation.txt','workflows/social_ops.txt']) assert.deepEqual(fs.readFileSync(path.join(skill,'references',file)),fs.readFileSync(path.join(root,file)),file);
  assert.deepEqual(fs.readFileSync(path.join(skill,'references/manifest.json')),fs.readFileSync(path.join(root,'manifest.json')));
  assert.deepEqual(fs.readFileSync(path.join(skill,'LICENSE')),fs.readFileSync(path.join(root,'LICENSE')));
});
test('standalone skill copied away from the repo assembles all six CLI profiles and optional additions',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'blueprint-skill-'));
  try {
    const installed=path.join(temp,'isolated-project/.agents/skills/browser-task-recovery');fs.cpSync(skill,installed,{recursive:true});
    for(const name of Object.keys(manifest.profiles)) {
      const actual=execFileSync(process.execPath,[path.join(installed,'scripts/assemble.cjs'),name],{cwd:temp});
      const expected=execFileSync(process.execPath,['scripts/assemble.cjs',name,'--stdout'],{cwd:root});assert.deepEqual(actual,expected,name);
    }
    const actual=execFileSync(process.execPath,[path.join(installed,'scripts/assemble.cjs'),'content','--integration','codex','--workflow','content_entry'],{cwd:temp});
    const expected=execFileSync(process.execPath,['scripts/assemble.cjs','content','--stdout'],{cwd:root}).toString()+'\n'+fs.readFileSync(path.join(root,'integrations/codex.txt'),'utf8')+'\n'+fs.readFileSync(path.join(root,'workflows/content_entry.txt'),'utf8');assert.equal(actual.toString(),expected);
    assert.equal(fs.readdirSync(temp).length,1,'helper must not emit dist or AGENTS files');
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
});
test('invalid installed-skill selections fail with no partial profile stdout',()=>{
  for(const args of [['__proto__'],['content','--integration','../../private'],['social','--workflow','unknown'],['long','--workflow','social_ops','--workflow','content_entry']]) {
    const result=spawnSync(process.execPath,[path.join(skill,'scripts/assemble.cjs'),...args]);assert.equal(result.status,2);assert.equal(result.stdout.length,0);
  }
});
