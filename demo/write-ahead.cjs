'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {fork}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const assert=require('node:assert/strict');
const {Controller,PolicyError,readCheckpoint,writeCheckpoint,digest}=require('../runtime/policy.cjs');

function validateIntent(state,approved){
 if(!state.intent || state.intent.operation_id!==approved.operationId ||
    state.intent.record_reference!==approved.reference || state.intent.payload_sha256!==digest(approved.payload) ||
    state.bound_origin!==approved.origin || state.bound_account!=='synthetic-account')
  throw new PolicyError('Saved intent does not match trusted operation, payload, origin or account');
}

async function worker(config){
 const {file,approved,phase,artifacts}=config;
 let state=readCheckpoint(file,config.taskId);validateIntent(state,approved);
 const prior=state.ledger['save-1']?.status;
 if((phase==='resume' && !['DISPATCHED','UNKNOWN'].includes(prior)) ||
    (phase==='resume-confirmed' && prior!=='CONFIRMED') || (phase==='retry-absent' && prior!=='ABSENT'))
  throw new PolicyError('Recovery phase does not match saved action state');
 const scope={origin:approved.origin,account:'synthetic-account',allowed:['read','fill','save_draft'],
  highRisk:[],maxWrites:8,batchThreshold:7,expiresAt:Date.now()+60000};
 const action=kind=>({kind,count:1,origin:scope.origin,account:scope.account});
 const controller=new Controller(scope,state.ledger,{persist:async ledger=>{
  validateIntent(state,approved);
  state={...state,revision:state.revision+1,ledger,written_at:new Date().toISOString()};
  writeCheckpoint(file,state);
  if(phase==='before-write' && ledger['save-1']?.status==='DISPATCHED'){
   process.send({phase:'dispatched_flushed'});await new Promise(()=>{});
  }
 }});
 const {chromium}=require('playwright');
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1200,height:760}});
  await context.route('**/*',route=>new URL(route.request().url()).origin===approved.origin?route.continue():route.abort());
  const page=await context.newPage();
  const read=async id=>controller.run(id+'-'+process.pid,action('read'),async()=>{
   await page.goto(approved.origin+'/?reference='+encodeURIComponent(approved.reference));
   await page.waitForFunction(()=>document.querySelector('#status').dataset.readState!=='pending');
   return {state:await page.locator('#status').getAttribute('data-read-state'),count:Number(await page.locator('#count').innerText()),titles:await page.locator('#records li').allTextContents()};
  },row=>row.state==='ready' && Number.isInteger(row.count) && row.titles.length===row.count && row.titles.every(t=>t===approved.payload.title));
  const save=async id=>{
   await controller.run(id+'-fill',action('fill'),()=>page.getByLabel('Draft title').fill(approved.payload.title),()=>page.getByLabel('Draft title').inputValue().then(t=>t===approved.payload.title));
   await controller.run(id,{...action('save_draft'),operation_id:approved.operationId,payload_sha256:digest(approved.payload)},async()=>{
    validateIntent(readCheckpoint(file,config.taskId),approved);
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#count').textContent==='1');
    if(phase==='after-write'){
     process.send({phase:'target_write_observed'});await new Promise(()=>{});
    }
   },()=>page.locator('#count').innerText().then(n=>n==='1'));
  };
  let readback;
  if(phase==='unguarded-control'){
   const initial=await read('control-read');assert.equal(initial.count,0);
   // Deliberate negative control: these two Save clicks bypass the controller.
   await page.getByLabel('Draft title').fill(approved.payload.title);
   for(const count of [1,2]){
    await page.getByRole('button',{name:'Save draft',exact:true}).click();
    await page.waitForFunction(n=>document.querySelector('#count').textContent===String(n),count);
   }
   readback=await read('control-verify');assert.equal(readback.count,2);
  }else if(phase==='resume' || phase==='resume-confirmed'){
   let dispatched=false;
   await assert.rejects(controller.run('blocked-replay',{...action('save_draft'),operation_id:approved.operationId,payload_sha256:digest(approved.payload)},async()=>{dispatched=true;},async()=>true),PolicyError);
   assert.equal(dispatched,false);
   readback=await read('resume-read');
   assert.ok([0,1].includes(readback.count));
   if(phase==='resume')await controller.reconcileAndPersist('save-1',readback.count===1);
   else assert.equal(readback.count,1);
  }else if(phase==='retry-absent'){
   assert.equal(state.ledger['save-1'].status,'ABSENT');
   readback=await read('explicit-retry-read');assert.equal(readback.count,0);
   await save('save-2');readback=await read('explicit-retry-verify');assert.equal(readback.count,1);
  }else{
   const initial=await read('initial-read');assert.equal(initial.count,0);
   await save('save-1');readback=await read('completed-read');assert.equal(readback.count,1);
  }
  await controller.run('evidence-desktop-'+phase,action('read'),()=>page.screenshot({path:path.join(artifacts,phase+'.png'),fullPage:true}),buf=>buf.length>0);
  if(phase==='resume' && readback.count===1){
   await controller.run('evidence-mobile',action('read'),async()=>{
    await page.setViewportSize({width:390,height:844});
    return page.screenshot({path:path.join(artifacts,'resume-mobile.png'),fullPage:true});
   },buf=>buf.length>0);
  }
  const final=readCheckpoint(file,config.taskId);validateIntent(final,approved);
  return {pid:process.pid,phase,readback,operationId:final.intent.operation_id,payloadSha256:final.intent.payload_sha256,
   actionStatus:final.ledger['save-1']?.status,retryActionStatus:final.ledger['save-2']?.status,
   reservedWrites:Object.values(final.ledger).reduce((sum,e)=>sum+e.reservedWrites,0)};
 }finally{await browser.close();}
}

function runWorker(config,stopAt){
 return new Promise((resolve,reject)=>{
  const child=fork(__filename,['--worker'],{stdio:['ignore','pipe','pipe','ipc']});
  let result;let reached=false;let errors='';
  child.stderr.on('data',chunk=>{errors=(errors+chunk.toString()).slice(-2500);});
  child.stdout.on('data',()=>{});
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Synthetic worker deadline exceeded'));},45000);
  child.on('message',message=>{
   if(message.phase==='ready')child.send(config);
   else if(message.phase===stopAt){reached=true;child.kill('SIGKILL');}
   else if(message.phase==='done')result=message.result;
   else if(message.phase==='error')errors=message.message;
  });
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('exit',(code,signal)=>{
   clearTimeout(timer);child.stdout.destroy();child.stderr.destroy();
   if(stopAt && reached && signal==='SIGKILL')resolve({pid:child.pid,signal,stoppedAt:stopAt});
   else if(!stopAt && code===0 && result)resolve(result);
   else reject(new Error('Synthetic worker failed: '+(errors||String(code))));
  });
 });
}

async function main(){
 if(process.platform==='win32')throw new Error('This SIGKILL demo requires a POSIX host; Windows execution is not verified.');
 const root=path.resolve(__dirname,'..');const runDir=path.join(root,'runs','write-ahead-'+Date.now()+'-'+randomUUID());
 fs.mkdirSync(runDir,{recursive:true});const rows=[];const failedReads=new Set();const html=fs.readFileSync(path.join(__dirname,'write-ahead-fixture.html'));
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.method==='GET' && url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(html);}
  if(req.method==='GET' && url.pathname==='/api/records'){
   if(failedReads.has(url.searchParams.get('reference')))return json({error:'Injected read failure'},503);
   return json(rows.filter(row=>row.reference===url.searchParams.get('reference')));
  }
  if(req.method==='POST' && url.pathname==='/api/records'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return json({},413);}
   let row;try{row=JSON.parse(body);}catch{return json({},400);}
   if(typeof row.reference!=='string' || !/^[a-z0-9-]{1,80}$/.test(row.reference) || typeof row.title!=='string' || row.title.length>120)return json({},400);
   // Deliberately no uniqueness constraint: a repeated Save really creates a second row.
   rows.push({reference:row.reference,title:row.title});return json({saved:true});
  }
  return json({},404);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const origin='http://127.0.0.1:'+server.address().port;const results=[];
 try{
  for(const phase of ['before-write','after-write','completed','unguarded-control']){
   const artifacts=path.join(runDir,phase);fs.mkdirSync(artifacts);
   const file=path.join(artifacts,'checkpoint.json');const taskId='write-ahead-'+phase;
   const approved={origin,operationId:randomUUID(),reference:phase+'-'+randomUUID(),payload:{title:'Original synthetic draft: '+phase}};
   const state={schema_version:1,task_id:taskId,revision:1,status:'PAUSED',objective:'Save and reconcile one synthetic draft',
    ledger:{},module_ids:['00','05','06'],retry_count:0,next_safe_action:'read destination before another write',
    bound_origin:origin,bound_account:'synthetic-account',intent:{operation_id:approved.operationId,record_reference:approved.reference,payload_sha256:digest(approved.payload)}};
   // The parent owns this task and launches only one worker at a time.
   const fd=fs.openSync(file,'wx',0o600);fs.closeSync(fd);writeCheckpoint(file,state);
   fs.copyFileSync(file,path.join(artifacts,'initial-checkpoint.json'));
   const config={file,taskId,approved,phase,artifacts};
   const saveTarget=label=>fs.writeFileSync(path.join(artifacts,label+'-target.json'),JSON.stringify(rows.filter(r=>r.reference===approved.reference),null,2)+'\n');
   if(phase==='unguarded-control'){
    const control=await runWorker(config);assert.equal(control.readback.count,2);
    const count=rows.filter(r=>r.reference===approved.reference).length;assert.equal(count,2);
    saveTarget('after-control');results.push({case:phase,worker:control,targetRows:count});continue;
   }
   if(phase==='completed'){
    const done=await runWorker(config);assert.equal(done.readback.count,1);assert.equal(done.actionStatus,'CONFIRMED');
    const resumed=await runWorker({...config,phase:'resume-confirmed'});assert.notEqual(done.pid,resumed.pid);
    assert.equal(resumed.actionStatus,'CONFIRMED');assert.equal(resumed.operationId,approved.operationId);
    const count=rows.filter(r=>r.reference===approved.reference).length;assert.equal(count,1);
    saveTarget('after-resume');results.push({case:phase,worker:done,resumed,targetRows:count});continue;
   }
   const killed=await runWorker(config,phase==='before-write'?'dispatched_flushed':'target_write_observed');
   const disk=readCheckpoint(file,taskId);validateIntent(disk,approved);assert.equal(disk.ledger['save-1'].status,'DISPATCHED');
   fs.copyFileSync(file,path.join(artifacts,'after-kill-checkpoint.json'));saveTarget('after-kill');
   const expected=phase==='before-write'?0:1;const beforeRecovery=rows.filter(r=>r.reference===approved.reference).length;assert.equal(beforeRecovery,expected);
   let failedReadRejected=false;
   if(expected){
    failedReads.add(approved.reference);
    await assert.rejects(runWorker({...config,phase:'resume'}),/Postcondition mismatch/);
    failedReads.delete(approved.reference);
    assert.equal(readCheckpoint(file,taskId).ledger['save-1'].status,'DISPATCHED');
    fs.copyFileSync(file,path.join(artifacts,'after-failed-read-checkpoint.json'));saveTarget('after-failed-read');
    assert.equal(rows.filter(r=>r.reference===approved.reference).length,1);failedReadRejected=true;
   }
   const resumed=await runWorker({...config,phase:'resume'});assert.notEqual(killed.pid,resumed.pid);
   assert.equal(resumed.operationId,approved.operationId);assert.equal(resumed.payloadSha256,digest(approved.payload));
   assert.equal(resumed.readback.count,expected);assert.equal(resumed.actionStatus,expected?'CONFIRMED':'ABSENT');
   assert.equal(rows.filter(r=>r.reference===approved.reference).length,expected);
   fs.copyFileSync(file,path.join(artifacts,'after-resume-checkpoint.json'));saveTarget('after-resume');
   const result={case:phase,killed,beforeRecovery,resumed,targetRowsAfterRecovery:expected,failedReadRejected};
   if(!expected){
    // A distinct explicit retry phase, never an automatic consequence of ABSENT.
    const retry=await runWorker({...config,phase:'retry-absent'});assert.equal(retry.operationId,approved.operationId);
    assert.equal(retry.payloadSha256,digest(approved.payload));assert.equal(retry.readback.count,1);
    assert.equal(retry.retryActionStatus,'CONFIRMED');assert.equal(rows.filter(r=>r.reference===approved.reference).length,1);
    assert.ok(retry.reservedWrites>resumed.reservedWrites);result.explicitRetry=retry;saveTarget('after-explicit-retry');
   }
   results.push(result);
  }
  const report={schema_version:1,captured_at:new Date().toISOString(),results,targetRows:rows,
   scope:'Actual POSIX worker SIGKILL and fresh Playwright browsers against one independently running synthetic local HTTP target. Single task owner, sequential workers; no server-side deduplication, model, social account, power-loss or concurrent-host guarantee.'};
  fs.writeFileSync(path.join(root,'runs','write-ahead-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({report:'runs/write-ahead-report.json',cases:results.map(r=>({case:r.case,targetRows:r.targetRowsAfterRecovery??r.targetRows,explicitRetryRows:r.explicitRetry?.readback.count})),artifacts:runDir},null,2));
 }finally{await new Promise(resolve=>server.close(resolve));}
}

if(require.main===module){
 if(process.argv.includes('--worker')){
  process.once('message',async config=>{
   try{const result=await worker(config);process.send({phase:'done',result},()=>process.disconnect());}
   catch(error){process.exitCode=1;process.send({phase:'error',message:error.message},()=>process.disconnect());}
  });
  process.send({phase:'ready'});
 }else main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports={validateIntent};
