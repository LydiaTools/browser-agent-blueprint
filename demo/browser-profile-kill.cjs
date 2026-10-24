'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { chromium } = require('playwright');

const key = 'blueprint-synthetic-record';
const root = path.resolve(__dirname, '..');
const scope = 'A synthetic localStorage Save acknowledgement followed by SIGKILL of the owned Chromium browser process, then a fresh browser on the same disposable profile after its helpers exit. No storageState import/export. Not a kill inside setItem, power loss, a durability guarantee, or an exactly-once result.';
const hash = value => createHash('sha256').update(value).digest('hex');

async function runExperiment() {
 if (!['darwin', 'linux'].includes(process.platform))
  throw new Error('This owned-process-group SIGKILL experiment requires macOS or Linux.');
 const executable = process.env.BLUEPRINT_BROWSER_EXECUTABLE || chromium.executablePath();
 if (!fs.existsSync(executable)) throw new Error('Install Playwright Chromium or set BLUEPRINT_BROWSER_EXECUTABLE.');
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-browser-kill-'));
 const html = fs.readFileSync(path.join(__dirname, 'fixture.html'));
 const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); }
  else if (req.url === '/analytics-consent.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(''); }
  else { res.writeHead(404); res.end(); }
 });
 const report = { schema_version: 1, started_at: new Date().toISOString(), platform: process.platform,
  node: process.version, status: 'running', cases: [], scope };
 const active = new Set();
 let failure;
 async function waitExit(running) {
  let timer;
  try {
   return await Promise.race([running.exited, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Browser exit timed out.')), 15000);
   })]);
  } finally { clearTimeout(timer); }
 }
 async function waitHelpers(running) {
  const deadline = Date.now() + 3000;
  for (;;) {
   const rows = execFileSync('ps', ['-axo', 'pid=,pgid=,stat='], { encoding: 'utf8' }).trim().split('\n');
   const live = rows.map(row => row.trim().split(/\s+/)).filter(([, group, state]) =>
    Number(group) === running.child.pid && !state.startsWith('Z'));
   if (!live.length) return;
   if (Date.now() >= deadline) throw new Error('Owned browser helpers did not exit; stop before profile reuse.');
   await delay(25);
  }
 }
 try {
  await new Promise((resolve, reject) => {
   server.once('error', reject); server.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;

  async function start(profile) {
   fs.mkdirSync(profile, { recursive: true });
   fs.rmSync(path.join(profile, 'DevToolsActivePort'), { force: true });
   const log = fs.openSync(path.join(profile, 'experiment-stderr.txt'), 'a', 0o600);
   const child = spawn(executable, ['--headless=new', '--no-sandbox', '--no-first-run',
    '--disable-default-apps', '--disable-background-networking', '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
   { detached: true, stdio: ['ignore', 'ignore', log] });
   fs.closeSync(log);
   const running = { child, profile, spawnError: null, exit: null };
   running.exited = new Promise(resolve => {
    child.once('exit', (code, signal) => { running.exit = { code, signal }; resolve(running.exit); });
    child.once('error', error => { running.spawnError = error; resolve({ error: error.message }); });
   });
   active.add(running);
   const deadline = Date.now() + 25000;
   let endpoint;
   while (Date.now() < deadline) {
    if (running.spawnError) throw running.spawnError;
    if (running.exit) throw new Error('Owned browser exited before its debugging endpoint opened.');
    try {
     const [port, suffix] = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
     if (/^\d+$/.test(port) && suffix?.startsWith('/devtools/browser/')) {
      endpoint = `ws://127.0.0.1:${port}${suffix}`; break;
     }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await delay(25);
   }
   if (!endpoint) throw new Error('Owned browser debugging endpoint timed out.');
   const command = execFileSync('ps', ['-p', String(child.pid), '-o', 'pgid=,command='], { encoding: 'utf8' }).trim();
   assert.equal(Number(command.split(/\s+/)[0]), child.pid, 'Browser must lead its own process group.');
   assert.ok(command.includes(`--user-data-dir=${profile}`), 'Only the disposable profile may be controlled.');
   running.owned = true;
   running.browser = await chromium.connectOverCDP(endpoint, { timeout: 15000 });
   running.version = running.browser.version(); report.browser = running.version;
   const context = running.browser.contexts()[0];
   context.setDefaultTimeout(10000);
   await context.route('**/*', route => new URL(route.request().url()).origin === origin
    ? route.continue() : route.abort());
   running.page = await context.newPage();
   await running.page.setViewportSize({ width: 1200, height: 760 });
   await running.page.goto(origin);
   return running;
  }

  async function stop(running, kill) {
   assert.equal(running.owned, true);
   assert.equal(running.child.exitCode, null);
   assert.equal(running.child.signalCode, null);
   const signalAt = process.hrtime.bigint();
   if (kill) assert.equal(running.child.kill('SIGKILL'), true);
   else {
    const session = await running.browser.newBrowserCDPSession();
    await session.send('Browser.close').catch(error => {
     if (!/closed|disconnected/i.test(error.message)) throw error;
    });
   }
   const exited = await waitExit(running);
   if (kill) assert.deepEqual(exited, { code: null, signal: 'SIGKILL' });
   else assert.deepEqual(exited, { code: 0, signal: null });
   // Do not signal a group again after its browser exits: macOS may retain zombies.
   await waitHelpers(running);
   active.delete(running);
   return { ...exited, signal_at: signalAt, helpers_exited: true };
  }

  async function save(running, title) {
   const raw = await running.page.evaluate(({ key, title }) => {
    document.querySelector('#title').value = title;
    document.querySelector('#body').value = 'Original local browser-crash fixture.';
    document.querySelector('#save').click();
    return localStorage.getItem(key);
   }, { key, title });
   const acknowledgedAt = process.hrtime.bigint();
   assert.equal(JSON.parse(raw)?.title, title, 'The actual Save handler must acknowledge this title.');
   return { raw, acknowledged_at: acknowledgedAt, pid: running.child.pid };
  }

  const plans = [
   { id: 'clean-close', prior: false, save: true, kill: false },
   { id: 'kill-before-save', prior: false, save: false, kill: true },
   { id: 'kill-after-save-new', prior: false, save: true, kill: true },
   ...[1, 2, 3].map(trial => ({ id: `kill-after-save-update-${trial}`, prior: true, save: true, kill: true }))
  ];
  for (const plan of plans) {
   const profile = path.join(temp, plan.id);
   let priorRaw = null, seedPid = null, seedExit = null;
   if (plan.prior) {
    const seed = await start(profile); seedPid = seed.child.pid;
    priorRaw = (await save(seed, 'Seed version 1')).raw;
    const exited = await stop(seed, false); seedExit = { code: exited.code, signal: exited.signal };
   }
   const writer = await start(profile);
   assert.equal(await writer.page.evaluate(k => localStorage.getItem(k), key), priorRaw);
   const acknowledged = plan.save ? await save(writer, 'Acknowledged version 2') : null;
   const exited = await stop(writer, plan.kill);
   const reader = await start(profile);
   assert.equal(reader.version, writer.version);
   const restored = await reader.page.evaluate(k => localStorage.getItem(k), key);
   const displayedCount = Number(await reader.page.locator('#save-count').innerText());
   assert.notEqual(reader.child.pid, writer.child.pid);
   let restoredRecord = null, parseError = null;
   try { restoredRecord = restored === null ? null : JSON.parse(restored); }
   catch { parseError = 'Restored value is invalid JSON.'; }
   const outcome = parseError ? 'invalid-json' : restored === null ? 'missing' : restored === acknowledged?.raw
    ? 'acknowledged-version' : restored === priorRaw ? 'prior-version' : 'unexpected-value';
   let screenshot = null;
   if (plan.id === 'kill-after-save-update-1') {
    screenshot = 'runs/browser-profile-kill-recovered.png';
    fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
    await reader.page.screenshot({ path: path.join(root, screenshot), fullPage: true });
   }
   report.cases.push({ id: plan.id, prior_clean_save: plan.prior, seed_pid: seedPid, seed_exit: seedExit,
    writer_pid: writer.child.pid, writer_exit: { code: exited.code, signal: exited.signal },
    owned_profile_verified: writer.owned && reader.owned, writer_helpers_exited_before_reuse: exited.helpers_exited,
    boundary: plan.save ? 'after-save-acknowledgement' : 'before-save',
    acknowledgement_to_sigkill_ms: plan.kill && acknowledged ? Number(exited.signal_at - acknowledged.acknowledged_at) / 1e6 : null,
    acknowledged_sha256: acknowledged ? hash(acknowledged.raw) : null,
    prior_sha256: priorRaw === null ? null : hash(priorRaw),
    fresh_browser_pid: reader.child.pid, restored_sha256: restored === null ? null : hash(restored),
    outcome, displayed_save_count: displayedCount, reader_save_calls: 0,
    restored_record: restoredRecord, parse_error: parseError, screenshot });
   await stop(reader, false);
   if (!plan.kill) assert.equal(outcome, 'acknowledged-version');
   if (!plan.save) assert.equal(outcome, 'missing');
   assert.notEqual(outcome, 'unexpected-value', 'Inspect an unexpected complete or corrupt value.');
   assert.notEqual(outcome, 'invalid-json', 'Inspect the corrupted restored value.');
   console.log(`${plan.id}: ${outcome}`);
  }
  report.status = 'observed';
 } catch (error) { failure = error; report.status = 'failed'; report.error = error.message; }
 finally {
  const cleanupErrors = [];
  for (const running of active) {
   if (!running.child.pid) continue;
   try {
    if (!running.exit) { running.child.kill('SIGKILL'); await waitExit(running); }
    await waitHelpers(running);
   } catch (error) { cleanupErrors.push(error.message); failure ||= error; }
  }
  server.closeAllConnections();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  if (!cleanupErrors.length) {
   try { fs.rmSync(temp, { recursive: true, force: true }); }
   catch (error) { cleanupErrors.push(error.message); failure ||= error; }
  }
  if (cleanupErrors.length) { report.status = 'failed'; report.cleanup_errors = cleanupErrors; }
  report.temporary_profiles_cleaned = !fs.existsSync(temp);
  report.completed_at = new Date().toISOString();
  const destination = path.join(root, 'runs/browser-profile-kill.json');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
 }
 if (failure) throw failure;
 return report;
}

if (require.main === module) runExperiment().then(report => {
 console.log(`Recorded ${report.cases.length} browser-profile cases; see runs/browser-profile-kill.json.`);
}).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { runExperiment };
