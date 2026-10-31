'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const script=path.join(__dirname,'../demo/compact-handoff.cjs');
function run(env){return spawnSync(process.execPath,[script],{env,encoding:'utf8',timeout:15000})}
test('missing or unpinned external hook fails before executing it',()=>{
 const env={...process.env};delete env.CONTEXT_CHECKPOINT_HOOK;
 const missing=run(env);assert.equal(missing.status,2);assert.match(missing.stderr,/Set CONTEXT_CHECKPOINT_HOOK/);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'blueprint-hook-test-'));
 try{const file=path.join(root,'hook.cjs'),sentinel=path.join(root,'executed');fs.writeFileSync(file,`require('node:fs').writeFileSync(${JSON.stringify(sentinel)},'bad')`);
  const wrong=run({...env,CONTEXT_CHECKPOINT_HOOK:file});assert.equal(wrong.status,2);assert.match(wrong.stderr,/hash mismatch/);assert.equal(fs.existsSync(sentinel),false);
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('pinned hook carries synthetic instructions while ledger blocks replay',{skip:!process.env.CONTEXT_CHECKPOINT_HOOK},()=>{
 const result=run(process.env);assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),{mode:'synthetic',manualSemanticRestore:true,unknownRetryBlocked:true,afterReadback:'CONFIRMED',effectsWithLedger:1,emptyLedgerControlEffects:2});
});
