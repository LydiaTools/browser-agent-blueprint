'use strict';
// Synthetic comparison. No browser, Codex session, network or real account.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {Controller,PolicyError,writeCheckpoint,readCheckpoint}=require('../runtime/policy.cjs');

const expected='1f19bfef7786e0231c3285153fc2da3d63c4bdb3c62d7dbc77d350389dd98dd9';
const pluginPath=process.env.CONTEXT_CHECKPOINT_HOOK;
if(!pluginPath){console.error('Set CONTEXT_CHECKPOINT_HOOK to the pinned context-checkpoint.cjs file. See docs/compact-handoff.md.');process.exit(2)}
const absolute=path.resolve(pluginPath);
const actual=crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex');
if(actual!==expected){console.error('External hook hash mismatch; no code was loaded.');process.exit(2)}
const compact=require(absolute);
const root=fs.mkdtempSync(path.join(os.tmpdir(),'blueprint-compact-handoff-'));
const workspace=path.join(root,'workspace'),state=path.join(root,'ledger.json'),data=path.join(root,'plugin-state'),transcript=path.join(root,'transcript.jsonl');
fs.mkdirSync(workspace);fs.writeFileSync(transcript,'{"turn":1,"task":"synthetic browser save"}\n');
const env={PATH:process.env.PATH,CONTEXT_CHECKPOINT_DATA_DIR:data,CONTEXT_CHECKPOINT_SIDECAR_EVERY:'0'};
const event=(name,turn='turn-1')=>({session_id:'fixture-session',turn_id:turn,cwd:workspace,transcript_path:transcript,hook_event_name:name,trigger:'auto',model:'synthetic'});
const scope={origin:'http://127.0.0.1:4179',account:'synthetic-account',allowed:['read','save_draft'],maxWrites:10,batchThreshold:5,highRisk:[],expiresAt:Date.now()+60000};
const action={kind:'save_draft',count:1,origin:scope.origin,account:scope.account};
const envelope=ledger=>({schema_version:1,task_id:'synthetic-task',revision:1,objective:'Synthetic save',status:'PAUSED',ledger,module_ids:['00'],retry_count:0,next_safe_action:'read back'});
(async()=>{
 const records=[];
 const first=new Controller(scope,{}, {persist:ledger=>writeCheckpoint(state,envelope(ledger))});
 await assert.rejects(first.run('draft-1',action,async()=>{records.push('draft');throw Error('synthetic lost reply')},async()=>true));
 assert.equal(readCheckpoint(state,'synthetic-task').ledger['draft-1'].status,'UNKNOWN');
 compact.handleHook(event('PreCompact'),env);compact.handleHook(event('PostCompact'),env);
 const semantic=path.join(root,'semantic.json');
 fs.writeFileSync(semantic,JSON.stringify({goal:'Synthetic save',acceptance_criteria:['Read back before retry'],constraints:['No real account'],decisions:[],current_progress:['draft-1 is UNKNOWN'],negative_knowledge:['Do not repeat draft-1'],open_questions:[],next_actions:['Reload and reconcile saved ledger']}));
 const child=spawnSync(process.execPath,[absolute,'semantic','--input',semantic,'--thread-id','fixture-session'],{cwd:workspace,env,encoding:'utf8'});
 assert.equal(child.status,0,child.stderr);
 const output=compact.handleHook({...event('SessionStart'),source:'compact'},env);
 assert(output?.hookSpecificOutput?.additionalContext.includes('Do not repeat draft-1'));
 const recovered=readCheckpoint(state,'synthetic-task');
 const resumed=new Controller(scope,recovered.ledger,{persist:ledger=>writeCheckpoint(state,envelope(ledger))});
 await assert.rejects(resumed.run('new-attempt',action,async()=>records.push('duplicate'),async()=>true),PolicyError);
 assert.deepEqual(records,['draft']);
 await resumed.reconcileAndPersist('draft-1',records.includes('draft'));
 assert.equal(readCheckpoint(state,'synthetic-task').ledger['draft-1'].status,'CONFIRMED');
 const controlRecords=['draft'],unsafe=new Controller(scope,{});
 await unsafe.run('new-attempt',action,async()=>controlRecords.push('duplicate'),async()=>true);
 assert.equal(controlRecords.length,2);
 console.log(JSON.stringify({mode:'synthetic',manualSemanticRestore:true,unknownRetryBlocked:true,
  afterReadback:'CONFIRMED',effectsWithLedger:records.length,emptyLedgerControlEffects:controlRecords.length}));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(root,{recursive:true,force:true}));
