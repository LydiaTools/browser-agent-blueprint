'use strict';
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { Controller, PolicyError, retryRead, writeCheckpoint, readCheckpoint } = require('../runtime/policy.cjs');
const root = path.resolve(__dirname,'..');
const runDir = path.join(root,'runs');
const taskId = 'synthetic-content-demo';
const origin = 'http://127.0.0.1:4179';
const checkpointFile = path.join(runDir,'checkpoint.json');
const storageFile = path.join(runDir,'synthetic-browser-state.json');
const contract = () => ({origin,account:'fixture-account',allowed:['read','fill','save_draft'],
  maxWrites:10,batchThreshold:5,highRisk:[],expiresAt:Date.now()+60000});
const action = (kind,count=1) => ({kind,count,origin,account:'fixture-account'});
const phaseIndex = process.argv.indexOf('--phase');
const phase = phaseIndex < 0 ? 'all' : process.argv[phaseIndex+1];
if (!['all','prepare','resume'].includes(phase)) throw new Error('Phase must be all, prepare or resume');
async function serve(){
 const html = fs.readFileSync(path.join(__dirname,'fixture.html'));
 const server=http.createServer((req,res)=>{
  if(req.url!=='/'){res.writeHead(404);return res.end('Not found');}
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4179,'127.0.0.1',resolve);});
 return server;
}
async function main(){
 fs.mkdirSync(runDir,{recursive:true});
 const server=await serve();
 let browser;
 try{
  browser=await chromium.launch({headless:true,...(process.env.BLUEPRINT_BROWSER_CHANNEL?{channel:process.env.BLUEPRINT_BROWSER_CHANNEL}:{})});
  const context=await browser.newContext({
   viewport:{width:1200,height:760},
   ...(phase==='resume'?{storageState:storageFile}:{})
  });
  // This demo never accesses external sites. All test operations use fixed selectors.
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   return url.origin===origin?route.continue():route.abort();
  });
  const page=await context.newPage();
  let controller;
  if(phase==='resume'){
   const state=readCheckpoint(checkpointFile,taskId);
   controller=new Controller(contract(),state.ledger);
   // Restore synthetic state only. Never put a real logged-in session in this file.
   await controller.run('resume-read',action('read'),()=>page.goto(origin),()=>page.locator('#saved-title').innerText().then(t=>t==='Verified demo draft'));
   assert.equal(await page.locator('#save-count').innerText(),'1');
   const before=JSON.stringify(controller.ledger);
   await assert.rejects(controller.run('save-1',action('save_draft'),()=>page.locator('#save').click(),()=>true),PolicyError);
   assert.equal(JSON.stringify(controller.ledger),before);
   console.log('PASS cross-process checkpoint resume; saved record not replayed');
   await page.screenshot({path:path.join(runDir,'resume.png'),fullPage:true});
   writeCheckpoint(checkpointFile,{...state,revision:state.revision+1,status:'DONE',ledger:controller.ledger,next_safe_action:'none'});
   await context.close();
   return;
  }
  controller=new Controller(contract());
  await controller.run('navigate',action('read'),()=>page.goto(origin),()=>page.title().then(t=>t.includes('Blueprint')));
  await controller.run('title-1',action('fill'),()=>page.getByLabel('Record title').fill('Verified demo draft'),()=>page.getByLabel('Record title').inputValue().then(t=>t==='Verified demo draft'));
  await controller.run('body-1',action('fill'),()=>page.getByLabel('Approved body').fill('Original content. Local fixture. No external account.'),()=>page.getByLabel('Approved body').inputValue().then(t=>t==='Original content. Local fixture. No external account.'));
  await controller.run('save-1',action('save_draft'),()=>page.locator('#save').click(),()=>page.locator('#saved-title').innerText().then(t=>t==='Verified demo draft'));
  await controller.run('verify-1',action('read'),()=>page.reload(),async()=>(
   await page.locator('#saved-title').innerText())==='Verified demo draft' &&
   (await page.locator('#saved-body').innerText())==='Original content. Local fixture. No external account.' &&
   (await page.locator('#save-count').innerText())==='1');
  console.log('PASS save then reload: title, body and count verified');
  await assert.rejects(controller.run('batch-1',action('save_draft',5),()=>{throw new Error('Must not run');},()=>true),PolicyError);
  assert.equal(await page.locator('#save-count').innerText(),'1');
  console.log('PASS high-risk batch blocked before dispatch');
  await controller.run('injection-read',action('read'),()=>page.locator('#untrusted').innerText(),t=>t.includes('publish all'));
  await assert.rejects(controller.run('injected-publish',action('publish'),()=>{throw new Error('Must not run');},()=>true),PolicyError);
  console.log('PASS page instruction grants no host authority (deterministic test)');
  if(phase==='all'){
   const unknown=new Controller(contract());
   await assert.rejects(unknown.run('uncertain-save',action('save_draft'),async()=>{
    await page.locator('#save').click();
    throw new Error('Injected loss of acknowledgement after actual save');
   },()=>true));
   await assert.rejects(unknown.run('duplicate-save',action('save_draft'),()=>page.locator('#save').click(),()=>true),PolicyError);
   await unknown.run('reconcile-read',action('read'),()=>page.reload(),()=>page.locator('#save-count').innerText().then(n=>n==='2'));
   unknown.reconcile('uncertain-save',true);
   assert.equal(unknown.ledger['uncertain-save'].status,'CONFIRMED');
   console.log('PASS uncertain save reconciled; no automatic write retry');
   let attempts=0;
   await retryRead(async()=>{
    attempts++;
    if(attempts===1){const e=new Error('Injected read interruption');e.code='F2';throw e;}
    return controller.run('retry-read',action('read'),()=>page.locator('#saved-title').innerText(),t=>t==='Verified demo draft');
   });
   assert.equal(attempts,2);
   console.log('PASS bounded transient read retry');
  }
  await controller.run('screenshot',action('read'),()=>page.screenshot({path:path.join(runDir,'desktop.png'),fullPage:true}),buf=>buf.length>0);
  const syntheticState=await controller.run('export-synthetic-state',action('read'),()=>context.storageState(),s=>Array.isArray(s.origins));
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},storageState:syntheticState});
  await mobileContext.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const mobilePage=await mobileContext.newPage();
  await controller.run('mobile-navigate',action('read'),()=>mobilePage.goto(origin),()=>mobilePage.locator('#saved-title').innerText().then(t=>t==='Verified demo draft'));
  await controller.run('mobile-screenshot',action('read'),()=>mobilePage.screenshot({path:path.join(runDir,'mobile.png'),fullPage:true}),buf=>buf.length>0);
  await mobileContext.close();
  const state={schema_version:1,task_id:taskId,revision:1,status:'PAUSED',written_at:new Date().toISOString(),
   objective:'Save and verify the synthetic draft',success_criteria:['fresh read matches approved text'],
   trusted_scope_reference:'demo/run.cjs:contract',ledger:controller.ledger,module_ids:['00','01','02','03','04','05','06','07','08','09','10'],
   retry_count:0,next_safe_action:'restore synthetic browser state; verify record; do not save again',
   evidence:['runs/desktop.png','runs/mobile.png'],wake_condition:'manual demo:resume command'};
  writeCheckpoint(checkpointFile,state);
  await context.storageState({path:storageFile});
  fs.chmodSync(storageFile,0o600);
  console.log('PASS external checkpoint write + verified readback');
  console.log('PAUSED: process exits; npm run demo:resume restores the prepare run');
  if(phase==='all')console.log('NOTE: demo:prepare + demo:resume is the separate-process test; this run had 2 intentional saves.');
  await context.close();
 }finally{
  if(browser)await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
