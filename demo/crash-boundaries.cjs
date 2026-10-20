'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { fork } = require('node:child_process');
const { chromium } = require('playwright');

const key = 'blueprint-synthetic-record';
const root = path.resolve(__dirname, '..');

async function worker() {
 const mode = process.argv[3];
 const { BLUEPRINT_BOUNDARY_WS: ws, BLUEPRINT_BOUNDARY_ORIGIN: origin,
  BLUEPRINT_BOUNDARY_SNAPSHOT: snapshot, BLUEPRINT_BOUNDARY_STAGE: stage } = process.env;
 const browser = await chromium.connect(ws);
 const context = await browser.newContext(mode === 'read' && fs.existsSync(snapshot)
  ? { storageState: snapshot } : {});
 context.setDefaultTimeout(10000);
 await context.route('**/*', route => new URL(route.request().url()).origin === origin
  ? route.continue() : route.abort());
 const page = await context.newPage();
 await page.goto(origin);
 if (mode === 'save') {
  await page.getByLabel('Record title').fill(`Boundary: ${stage}`);
  await page.getByLabel('Approved body').fill('Synthetic crash-boundary record.');
  await page.locator('#save').click();
  await page.reload();
  const record = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
  assert.equal(record.id, 'fixture-001');
  assert.equal(record.saves, 1);
  if (stage === 'after-export') {
   const state = await context.storageState();
   fs.writeFileSync(snapshot, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  }
  process.send({ phase: 'ready-for-kill', pid: process.pid, record,
   snapshot_exists: fs.existsSync(snapshot), save_calls: 1 });
  // The parent sends SIGKILL here: no browser/context cleanup or normal exit.
  await new Promise(() => {});
 } else {
  const record = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
  process.send({ phase: 'read-back', pid: process.pid, record,
   displayed_save_count: Number(await page.locator('#save-count').innerText()), save_calls: 0 });
  await context.close();
  await browser.close();
  process.disconnect();
 }
}

function messageFrom(child, phase) {
 return new Promise((resolve, reject) => {
  const timer = setTimeout(() => finish(new Error(`Worker timed out before ${phase}`)), 25000);
  const exited = () => finish(new Error(`Worker exited before ${phase}`));
  const received = value => { if (value.phase === phase) finish(null, value); };
  function finish(error, value) {
   clearTimeout(timer); child.off('message', received); child.off('exit', exited);
   error ? reject(error) : resolve(value);
  }
  child.on('message', received); child.once('exit', exited);
 });
}

function exitOf(child) {
 return new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
}

async function main() {
 if (process.platform === 'win32') throw new Error('This SIGKILL experiment requires macOS or Linux.');
 const started = new Date().toISOString();
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-crash-'));
 const html = fs.readFileSync(path.join(__dirname, 'fixture.html'));
 const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); }
  else if (req.url === '/analytics-consent.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(''); }
  else { res.writeHead(404); res.end(); }
 });
 await new Promise((resolve, reject) => {
  server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
 });
 const origin = `http://127.0.0.1:${server.address().port}`;
 let browserServer;
 const children = new Set(), cases = [];
 let browserVersion;
 try {
  browserServer = await chromium.launchServer({ headless: true,
   ...(process.env.BLUEPRINT_BROWSER_CHANNEL ? { channel: process.env.BLUEPRINT_BROWSER_CHANNEL } : {}) });
  const inspect = await chromium.connect(browserServer.wsEndpoint());
  browserVersion = inspect.version(); await inspect.close();
  for (const stage of ['before-export', 'after-export']) {
   const snapshot = path.join(temp, `${stage}.json`);
   const spawn = mode => {
    const child = fork(__filename, ['--worker', mode], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
     env: { ...process.env, BLUEPRINT_BOUNDARY_WS: browserServer.wsEndpoint(),
      BLUEPRINT_BOUNDARY_ORIGIN: origin, BLUEPRINT_BOUNDARY_SNAPSHOT: snapshot,
      BLUEPRINT_BOUNDARY_STAGE: stage } });
    child.stderr.resume(); children.add(child); child.once('exit', () => children.delete(child));
    return child;
   };
   const first = spawn('save');
   const saved = await messageFrom(first, 'ready-for-kill');
   assert.equal(saved.snapshot_exists, stage === 'after-export');
   const killed = exitOf(first);
   assert.equal(first.kill('SIGKILL'), true);
   const firstExit = await killed;
   assert.deepEqual(firstExit, { code: null, signal: 'SIGKILL' });
   const second = spawn('read');
   const secondExit = exitOf(second);
   const restored = await messageFrom(second, 'read-back');
   assert.deepEqual(await secondExit, { code: 0, signal: null });
   assert.notEqual(saved.pid, restored.pid);
   assert.equal(restored.save_calls, 0);
   assert.equal(restored.displayed_save_count, stage === 'after-export' ? 1 : 0);
   if (stage === 'after-export') assert.deepEqual(restored.record, saved.record);
   else assert.equal(restored.record, null);
   cases.push({ boundary: stage, first_process: saved, first_exit: firstExit,
    fresh_process: restored, expected_restored_records: stage === 'after-export' ? 1 : 0, passed: true });
  }
 } finally {
  await Promise.all([...children].map(child => {
   const exited = exitOf(child); child.kill('SIGKILL'); return exited;
  }));
  if (browserServer) await browserServer.close();
  await new Promise(resolve => server.close(resolve));
  fs.rmSync(temp, { recursive: true, force: true });
 }
 const report = { started_at: started, completed_at: new Date().toISOString(),
  platform: process.platform, node: process.version, browser: browserVersion,
  status: 'passed', cases, temporary_profiles_and_snapshots_cleaned: true,
  scope: 'SIGKILL of the Node worker around explicit synthetic localStorage export; fresh isolated context restoration. Not browser disk-flush, browser-process death, power loss, checkpoint-ledger consistency, or live-model testing.' };
 fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
 fs.writeFileSync(path.join(root, 'runs/crash-boundaries.json'), JSON.stringify(report, null, 2) + '\n');
 console.log(JSON.stringify(report, null, 2));
}

if (process.argv[2] === '--worker') worker().catch(error => { console.error(error.message); process.exit(1); });
else main().catch(error => { console.error(error.message); process.exitCode = 1; });
