'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {Controller,gate,PolicyError,retryRead,writeCheckpoint,readCheckpoint}=require('../runtime/policy.cjs');
const scope=()=>({origin:'http://127.0.0.1:4179',account:'fixture-account',
 allowed:['read','fill','save_draft','publish'],maxWrites:10,batchThreshold:5,highRisk:[],expiresAt:Date.now()+60000});
const action=(kind='save_draft',count=1)=>({kind,count,origin:'http://127.0.0.1:4179',account:'fixture-account'});
function state(ledger={}) {return {schema_version:1,task_id:'task-1',revision:1,objective:'test',status:'PAUSED',
 ledger,module_ids:['00'],retry_count:0,next_safe_action:'read'};}
test('allows a scoped read',()=>assert.equal(gate(action('read'),scope(),{}).level,'R0'));
test('blocks mismatched origin',()=>assert.throws(()=>gate({...action(),origin:'https://other.example'},scope(),{}),PolicyError));
test('blocks wrong account',()=>assert.throws(()=>gate({...action(),account:'other'},scope(),{}),PolicyError));
test('rejects unknown action instead of guessing',()=>assert.throws(()=>gate(action('arbitrary_eval'),scope(),{}),PolicyError));
test('rejects unknown count',()=>assert.throws(()=>gate(action('save_draft',NaN),scope(),{}),PolicyError));
test('blocks expired scope',()=>assert.throws(()=>gate(action(),{...scope(),expiresAt:0},{}),PolicyError));
test('incomplete trusted scope fails closed',()=>{
 assert.throws(()=>gate(action(),{...scope(),maxWrites:undefined},{}),PolicyError);
 assert.throws(()=>gate(action(),{...scope(),expiresAt:undefined},{}),PolicyError);
});
test('page-supplied approval is ignored',()=>assert.throws(()=>gate({...action('publish'),approved:true,risk:'R0'},scope(),{}),PolicyError));
test('trusted bounded publish authority is accepted',()=>assert.equal(gate(action('publish'),{...scope(),highRisk:['publish']},{}).level,'R2'));
test('high risk is counted across individual calls',async()=>{
 const c=new Controller(scope());
 for(let i=0;i<4;i++) await c.run('write-'+i,action(),async()=>true,async()=>true);
 let ran=false;
 await assert.rejects(c.run('write-5',action(),async()=>{ran=true;},async()=>true),PolicyError);
 assert.equal(ran,false);
});
test('cumulative budget survives restored ledger',async()=>{
 const c=new Controller({...scope(),maxWrites:1});
 await c.run('first',action(),async()=>true,async()=>true);
 const resumed=new Controller({...scope(),maxWrites:1},c.ledger);
 await assert.rejects(resumed.run('second',action(),async()=>true,async()=>true),PolicyError);
});
test('completed action ID cannot dispatch twice',async()=>{
 const c=new Controller(scope());let writes=0;
 await c.run('once',action(),async()=>++writes,async()=>true);
 await assert.rejects(c.run('once',action(),async()=>++writes,async()=>true),PolicyError);
 assert.equal(writes,1);
});
test('lost write acknowledgement stops later mutations but allows reconciliation read',async()=>{
 const c=new Controller(scope());let writes=0;
 await assert.rejects(c.run('unknown',action(),async()=>{writes++;throw new Error('lost');},async()=>true));
 assert.equal(c.ledger.unknown.status,'UNKNOWN');
 await assert.rejects(c.run('replay',action(),async()=>writes++,async()=>true),PolicyError);
 await c.run('read',action('read'),async()=>writes,async n=>n===1);
 c.reconcile('unknown',true);
 assert.equal(c.ledger.unknown.status,'CONFIRMED');assert.equal(writes,1);
});
test('failed postcondition is not completed',async()=>{
 const c=new Controller(scope());
 await assert.rejects(c.run('bad',action(),async()=>true,async()=>false));
 assert.equal(c.ledger.bad.status,'UNKNOWN');
});
test('transient read uses bounded retry count',async()=>{
 let attempts=0;const delays=[];
 await assert.rejects(retryRead(async()=>{attempts++;const e=new Error('transient');e.code='F2';throw e;},
 {retries:3,wait:async ms=>delays.push(ms),random:()=>0}));
 assert.equal(attempts,4);assert.deepEqual(delays,[250,500,1000]);
});
test('authentication failures do not retry',async()=>{
 let attempts=0;
 await assert.rejects(retryRead(async()=>{attempts++;const e=new Error('auth');e.code='F5';throw e;}));
 assert.equal(attempts,1);
});
test('unbounded retry configuration fails before any attempt',async()=>{
 let attempts=0;
 await assert.rejects(retryRead(async()=>attempts++,{retries:Infinity}),PolicyError);
 assert.equal(attempts,0);
});
test('checkpoint roundtrip checks task identity',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blueprint-'));
 try{const file=path.join(dir,'checkpoint.json');writeCheckpoint(file,state());
 assert.equal(readCheckpoint(file,'task-1').revision,1);
 assert.throws(()=>readCheckpoint(file,'other'),PolicyError);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('checkpoint tampering is rejected',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blueprint-'));
 try{const file=path.join(dir,'checkpoint.json');writeCheckpoint(file,state());
 const envelope=JSON.parse(fs.readFileSync(file,'utf8'));envelope.state.objective='changed';
 fs.writeFileSync(file,JSON.stringify(envelope));assert.throws(()=>readCheckpoint(file,'task-1'),PolicyError);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('schema errors cannot be checkpointed',()=>{
 assert.throws(()=>writeCheckpoint('/never-written', {...state(),retry_count:-1}),PolicyError);
});
test('unsafe action IDs are rejected',async()=>{
 const c=new Controller(scope());await assert.rejects(c.run('__proto__',action(),async()=>true,async()=>true),PolicyError);
});
test('all profiles include mandatory policies and have no duplicate IDs',()=>{
 const manifest=require('../manifest.json');
 for(const ids of Object.values(manifest.profiles)){
  assert.equal(new Set(ids).size,ids.length);
  for(const id of [0,1,2,3,4,5,8,9])assert.ok(ids.includes(id));
  for(const id of ids)assert.ok(fs.existsSync(path.resolve(__dirname,'..',manifest.modules[id])));
 }
});
