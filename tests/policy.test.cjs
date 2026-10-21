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
function observation(outcome='present') {return {outcome,source:'synthetic-target-read',reference:'/records?reference=draft-1',
 observed_at:'2026-10-21T00:00:00.000Z',evidence_sha256:'b'.repeat(64)};}
function review(decision='landed') {return {decision,reviewer:'synthetic-reviewer-1',reason:'Compared the independent destination record with the approved draft.',
 reviewed_at:'2026-10-21T00:01:00.000Z'};}
test('allows a scoped read',()=>assert.equal(gate(action('read'),scope(),{}).level,'R0'));
test('blocks mismatched origin',()=>assert.throws(()=>gate({...action(),origin:'https://other.example'},scope(),{}),PolicyError));
test('blocks wrong account',()=>assert.throws(()=>gate({...action(),account:'other'},scope(),{}),PolicyError));
test('rejects unknown action instead of guessing',()=>assert.throws(()=>gate(action('arbitrary_eval'),scope(),{}),PolicyError));
test('rejects evaluate before an action can reach the host executor',async()=>{
 const c=new Controller(scope());let calls=0;
 await assert.rejects(c.run('evaluate',action('evaluate'),async()=>++calls,async()=>true),PolicyError);
 assert.equal(calls,0);assert.deepEqual(c.ledger,{});
});
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
test('awaits persisted DISPATCHED before executing and rejects overlapping calls',async()=>{
 let release; const ready=new Promise(resolve=>{release=resolve;}); let writes=0;
 const snapshots=[];
 const c=new Controller(scope(),{}, {persist:async ledger=>{
  snapshots.push(ledger); if(ledger.once.status==='DISPATCHED') await ready;
 }});
 const pending=c.run('once',action(),async()=>++writes,async()=>true);
 assert.equal(writes,0); assert.equal(snapshots[0].once.status,'DISPATCHED');
 await assert.rejects(c.run('overlap',action(),async()=>++writes,async()=>true),PolicyError);
 release(); await pending; assert.equal(writes,1);
 assert.equal(snapshots[0].once.status,'DISPATCHED');
 assert.equal(snapshots[1].once.status,'CONFIRMED');
});
test('checkpoint failure before dispatch prevents the write and freezes the instance',async()=>{
 let writes=0;
 const c=new Controller(scope(),{}, {persist:()=>{throw new Error('private-storage-detail');}});
 await assert.rejects(c.run('blocked',action(),async()=>++writes,async()=>true),PolicyError);
 await assert.rejects(c.run('later',action(),async()=>++writes,async()=>true),PolicyError);
 assert.equal(writes,0); assert.equal(c.ledger.blocked.status,'DISPATCHED');
 assert.ok(!JSON.stringify(c.ledger).includes('private-storage-detail'));
});
test('actual checkpoint contains intent and reservation before the effect',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blueprint-persist-'));
 try {
  const file=path.join(dir,'checkpoint.json'); let writes=0;
  const c=new Controller(scope(),{}, {persist:ledger=>writeCheckpoint(file,state(ledger))});
  await c.run('stable-action', {...action(),operation_id:'original-operation',payload_sha256:'a'.repeat(64)}, async()=>{
   const saved=readCheckpoint(file,'task-1').ledger['stable-action'];
   assert.equal(saved.status,'DISPATCHED'); assert.equal(saved.reservedWrites,1);
   assert.equal(saved.action.operation_id,'original-operation'); assert.equal(saved.action.payload_sha256,'a'.repeat(64));
   return ++writes;
  },async()=>true);
  const disk=readCheckpoint(file,'task-1');assert.equal(disk.ledger['stable-action'].status,'CONFIRMED');
  const resumed=new Controller(scope(),disk.ledger,{persist:ledger=>writeCheckpoint(file,state(ledger))});
  await assert.rejects(resumed.run('stable-action',action(),async()=>++writes,async()=>true),PolicyError);
  assert.equal(writes,1);
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('lost acknowledgement persists UNKNOWN without raw error content',async()=>{
 let disk;
 const c=new Controller(scope(),{}, {persist:ledger=>{disk=ledger;}});
 await assert.rejects(c.run('unknown',action(),async()=>{throw new Error('secret-tool-error');},async()=>true));
 assert.equal(disk.unknown.status,'UNKNOWN'); assert.ok(!JSON.stringify(disk).includes('secret-tool-error'));
});
test('failed confirmation flush freezes writes even when the effect completed',async()=>{
 let disk;let writes=0;
 const c=new Controller(scope(),{}, {persist:ledger=>{
  if(ledger.once.status==='CONFIRMED') throw new Error('full');
  disk=ledger;
 }});
 await assert.rejects(c.run('once',action(),async()=>++writes,async()=>true),PolicyError);
 assert.equal(writes,1); assert.equal(disk.once.status,'DISPATCHED');
 await assert.rejects(c.run('later',action(),async()=>++writes,async()=>true),PolicyError);
 const recovered=new Controller(scope(),disk,{persist:ledger=>{disk=ledger;}});
 assert.throws(()=>recovered.reconcile('once',true),PolicyError);
 assert.equal(recovered.ledger.once.status,'DISPATCHED');
 await recovered.reconcileAndPersist('once',true);
 assert.equal(disk.once.status,'CONFIRMED'); assert.equal(writes,1);
});
test('failed reconciliation persistence does not permit a new mutation',async()=>{
 let writes=0;
 const ledger={pending:{action:action(),reservedWrites:1,status:'UNKNOWN'}};
 const c=new Controller(scope(),ledger,{persist:()=>{throw new Error('full');}});
 await assert.rejects(c.reconcileAndPersist('pending',false),PolicyError);
 await assert.rejects(c.run('retry',action(),async()=>++writes,async()=>true),PolicyError);
 assert.equal(writes,0);
});
test('human-reviewed recovery requires persistence, exact write binding, and a recorded observation',async()=>{
 assert.throws(()=>new Controller(scope(),{}, {requireHumanReview:true}),PolicyError);
 let disk={};let writes=0;
 const persist=ledger=>{disk=structuredClone(ledger);};
 const c=new Controller(scope(),{}, {persist,requireHumanReview:true});
 await assert.rejects(c.run('missing-binding',action(),async()=>++writes,async()=>true),PolicyError);
 await assert.rejects(c.run('missing-payload-reference',{...action(),operation_id:'stable-operation',payload_sha256:'a'.repeat(64)},
  async()=>++writes,async()=>true),/durable payload reference/);
 assert.equal(writes,0);
 const bound={...action(),operation_id:'stable-operation',payload_sha256:'a'.repeat(64),payload_ref:'approved-input.json'};
 await assert.rejects(c.run('uncertain',bound,async()=>{writes++;throw new Error('synthetic lost acknowledgement');},async()=>true),/synthetic lost acknowledgement/);
 assert.equal(disk.uncertain.status,'UNKNOWN');
 await assert.rejects(c.reconcileAndPersist('uncertain',false),PolicyError);
 await c.recordRecoveryObservation('uncertain',observation('present'));
 assert.equal(disk.uncertain.status,'PENDING_REVIEW');
 const recovered=new Controller(scope(),disk,{persist,requireHumanReview:true});
 assert.throws(()=>new Controller(scope(),disk,{persist}),PolicyError);
 await assert.rejects(recovered.reconcileAndPersist('uncertain',true),PolicyError);
 await assert.rejects(recovered.reviewAndReconcile('uncertain',review('not_landed')),/conflicts/);
 let replayed=false;
 await assert.rejects(recovered.run('new-attempt',bound,async()=>{replayed=true;},async()=>true),PolicyError);
 assert.equal(replayed,false);
 await recovered.reviewAndReconcile('uncertain',review('landed'));
 assert.equal(disk.uncertain.status,'CONFIRMED');
 assert.deepEqual(disk.uncertain.human_reviews.map(x=>x.reviewer),['synthetic-reviewer-1']);
 assert.equal(writes,1);
});
test('not-landed requires a matching absent read and an explicit reviewer decision',async()=>{
 let disk={};let writes=0;
 const persist=ledger=>{disk=structuredClone(ledger);};
 const bound={...action(),operation_id:'stable-operation',payload_sha256:'a'.repeat(64),payload_ref:'approved-input.json'};
 const c=new Controller({...scope(),maxWrites:2},{},{persist,requireHumanReview:true});
 await assert.rejects(c.run('attempt-1',bound,async()=>{writes++;throw new Error('interrupted before target');},async()=>true));
 await c.recordRecoveryObservation('attempt-1',observation('absent'));
 const recovered=new Controller({...scope(),maxWrites:2},disk,{persist,requireHumanReview:true});
 await recovered.reviewAndReconcile('attempt-1',review('not_landed'));
 assert.equal(disk['attempt-1'].status,'ABSENT');
 await assert.rejects(recovered.run('changed-reference',{...bound,payload_ref:'changed-input.json'},async()=>++writes,async()=>true),/Operation binding changed/);
 await recovered.run('attempt-2',bound,async()=>++writes,async()=>true);
 assert.equal(writes,2);
 assert.equal(disk['attempt-2'].reservedWrites,1);
});
test('inconclusive observation stays pending and prevents a write after unresolved review',async()=>{
 let disk={};let writes=0;
 const persist=ledger=>{disk=structuredClone(ledger);};
 const c=new Controller(scope(),{pending:{action:action(),reservedWrites:1,status:'DISPATCHED',requireHumanReview:true}},
   {persist,requireHumanReview:true});
 await c.recordRecoveryObservation('pending',observation('inconclusive'));
 await c.reviewAndReconcile('pending',review('unresolved'));
 assert.equal(disk.pending.status,'PENDING_REVIEW');
 await assert.rejects(c.run('blocked',action(),async()=>++writes,async()=>true),PolicyError);
 assert.equal(writes,0);
});
test('strict checkpoints require a bound write and matching human recovery review',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blueprint-strict-ledger-'));
 try {
 const file=path.join(dir,'checkpoint.json');
 const bound={...action(),operation_id:'stable-operation',payload_sha256:'a'.repeat(64),payload_ref:'approved-input.json'};
 const entry=(status,extra={})=>({action:bound,reservedWrites:1,status,requireHumanReview:true,...extra});
 assert.throws(()=>writeCheckpoint(file,{...state({bad:entry('DISPATCHED',{action:action()})})}),/strict write binding/);
 assert.throws(()=>writeCheckpoint(file,{...state({bad:entry('PENDING_REVIEW')})}),/pending review checkpoint/);
 assert.throws(()=>writeCheckpoint(file,{...state({bad:entry('ABSENT')})}),/matching not_landed review/);
 const observed=observation('absent');
 assert.doesNotThrow(()=>writeCheckpoint(file,{...state({good:entry('ABSENT',{recovery_observations:[{id:'observation-1',...observed}],
  human_reviews:[{id:'review-1',observation_id:'observation-1',...review('not_landed')} ]})})}));
 } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
test('invalid persistence callback is rejected',()=>{
 assert.throws(()=>new Controller(scope(),{}, {persist:true}),PolicyError);
});
test('operation identity cannot bypass a confirmed write with a new action ID',async()=>{
 let writes=0;let disk;
 const bound={...action(),operation_id:'stable-operation',payload_sha256:'a'.repeat(64)};
 const c=new Controller(scope(),{}, {persist:ledger=>{disk=ledger;}});
 await c.run('attempt-1',bound,async()=>++writes,async()=>true);
 const recovered=new Controller(scope(),disk,{persist:()=>{}});
 await assert.rejects(recovered.run('attempt-2',bound,async()=>++writes,async()=>true),PolicyError);
 assert.equal(writes,1);
});
test('ABSENT retry keeps the operation payload binding and consumes another reservation',async()=>{
 let disk;let writes=0;
 const bound={...action(),operation_id:'stable-operation',payload_sha256:'a'.repeat(64)};
 const c=new Controller({...scope(),maxWrites:2},{},{persist:ledger=>{disk=ledger;}});
 await assert.rejects(c.run('attempt-1',bound,async()=>{throw new Error('before target');},async()=>true));
 await c.reconcileAndPersist('attempt-1',false);
 const recovered=new Controller({...scope(),maxWrites:2},disk,{persist:ledger=>{disk=ledger;}});
 await assert.rejects(recovered.run('changed-payload',{...bound,payload_sha256:'b'.repeat(64)},async()=>++writes,async()=>true),PolicyError);
 await recovered.run('attempt-2',bound,async()=>++writes,async()=>true);
 assert.equal(writes,1);assert.equal(Object.values(disk).reduce((sum,e)=>sum+e.reservedWrites,0),2);
});
test('incomplete or malformed operation bindings stop before dispatch',async()=>{
 let writes=0;
 for(const extra of [{operation_id:'stable'}, {payload_sha256:'a'.repeat(64)}, {operation_id:'bad\nid',payload_sha256:'a'.repeat(64)}, {operation_id:'stable',payload_sha256:'not-a-hash'}]){
  const c=new Controller(scope());await assert.rejects(c.run('bad',{...action(),...extra},async()=>++writes,async()=>true),PolicyError);
 }
 assert.equal(writes,0);
});
test('an ABSENT operation cannot be repurposed for another action or count',async()=>{
 let writes=0;
 const bound={...action(),operation_id:'stable-operation',payload_sha256:'a'.repeat(64)};
 const ledger={prior:{action:bound,reservedWrites:1,status:'ABSENT'}};
 for(const changed of [{...bound,kind:'fill'},{...bound,count:2}]){
  const c=new Controller({...scope(),maxWrites:10},ledger);
  await assert.rejects(c.run('repurposed',changed,async()=>++writes,async()=>true),/Operation binding changed/);
 }
 assert.equal(writes,0);
});
test('write-ahead intent is bound to the trusted payload and task context',()=>{
 const {validateIntent}=require('../demo/write-ahead.cjs');
 const {digest}=require('../runtime/policy.cjs');
 const approved={operationId:'original',reference:'draft-1',origin:'http://127.0.0.1:4179',payloadRef:'approved-input.json',payload:{title:'approved'}};
 const saved={bound_origin:approved.origin,bound_account:'synthetic-account',intent:{operation_id:approved.operationId,record_reference:approved.reference,
  payload_ref:'approved-input.json',payload_snapshot:approved.payload,payload_sha256:digest(approved.payload)}};
 assert.doesNotThrow(()=>validateIntent(saved,approved));
 for(const changed of [{...approved,payload:{title:'changed'}},{...approved,operationId:'new'},{...approved,reference:'other'},{...approved,origin:'https://other.example'}])
  assert.throws(()=>validateIntent(saved,changed),PolicyError);
});
test('all profiles include mandatory policies and have no duplicate IDs',()=>{
 const manifest=require('../manifest.json');
 for(const ids of Object.values(manifest.profiles)){
  assert.equal(new Set(ids).size,ids.length);
  for(const id of [0,1,2,3,4,5,8,9])assert.ok(ids.includes(id));
  for(const id of ids)assert.ok(fs.existsSync(path.resolve(__dirname,'..',manifest.modules[id])));
 }
});
