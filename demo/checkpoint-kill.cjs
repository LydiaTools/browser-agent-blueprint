'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { Controller, PolicyError, writeCheckpoint, readCheckpoint, digest } = require('../runtime/policy.cjs');

const taskId = 'synthetic-checkpoint-kill';
const action = { kind: 'save_draft', count: 1, origin: 'http://127.0.0.1:4179', account: 'fixture-account',
 operation_id: 'synthetic-operation-1', payload_sha256: digest({ title: 'Synthetic draft' }), payload_ref: 'fixture:approved-draft' };
function state(revision) {
 return { schema_version: 1, task_id: taskId, revision, objective: 'Synthetic checkpoint publication test',
  status: 'PAUSED', ledger: { save: { action, status: revision === 1 ? 'DISPATCHED' : 'CONFIRMED',
   reservedWrites: 1, requireHumanReview: true } }, module_ids: ['06_memory'], retry_count: 0,
  next_safe_action: revision === 1 ? 'read target before any replay' : 'none' };
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const envelope = value => JSON.stringify({ sha256: digest(value), state: value }, null, 2) + '\n';

function writer(stage, file) {
 const original = { sync: fs.fsyncSync, rename: fs.renameSync };
 function pause(details) {
  // A dedicated pipe makes the completed filesystem boundary observable before SIGKILL.
  fs.writeSync(3, JSON.stringify({ stage, writer_pid: process.pid, ...details }) + '\n');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
  throw new Error('Kill boundary unexpectedly resumed');
 }
 function partial(fd, text) {
  const bytes = Buffer.from(text);
  const prefix = Math.floor(bytes.length / 2);
  let written = 0;
  while (written < prefix) written += fs.writeSync(fd, bytes, written, prefix - written);
  pause({ bytes_written: written, complete_bytes: bytes.length });
 }
 if (stage === 'direct-overwrite') {
  // Deliberately unsafe comparison: truncate the published file, then write a prefix.
  partial(fs.openSync(file, 'w', 0o600), envelope(state(2)));
 } else {
  if (stage === 'partial-temp-write') fs.writeFileSync = (fd, text) => partial(fd, text);
  if (stage === 'after-file-fsync') fs.fsyncSync = fd => {
   original.sync(fd); pause({ file_fsync_completed: true, rename_completed: false });
  };
  if (stage === 'after-rename') fs.renameSync = (from, to) => {
   original.rename(from, to); pause({ file_fsync_completed: true, rename_completed: true });
  };
  // The original writer's validation, temporary path, fsync, rename and readback stay in use.
  // Only this disposable child intercepts the named filesystem boundary.
  writeCheckpoint(file, state(2));
 }
 throw new Error('Requested kill boundary was not reached');
}

async function reader(file) {
 let restored;
 try { restored = readCheckpoint(file, taskId); }
 catch (error) {
  if (!(error instanceof SyntaxError || error instanceof PolicyError || error.code === 'ENOENT')) throw error;
  return { reader_pid: process.pid, accepted: false, reason: error.code === 'ENOENT' ? 'missing' : 'invalid',
   replay_executor_calls: 0 };
 }
 const scope = { origin: action.origin, account: action.account, allowed: ['save_draft'], highRisk: [],
  maxWrites: 5, batchThreshold: 5, expiresAt: Date.now() + 60000 };
 let executeCalls = 0, persistCalls = 0;
 const controller = new Controller(scope, restored.ledger, { requireHumanReview: true,
  persist: ledger => {
   persistCalls++;
   writeCheckpoint(file, { ...restored, revision: restored.revision + 1, ledger });
  } });
 await assert.rejects(controller.run('new-action-same-operation', action, async () => ++executeCalls, async () => true), PolicyError);
 assert.equal(executeCalls, 0);
 assert.equal(persistCalls, 0);
 return { reader_pid: process.pid, accepted: true, revision: restored.revision,
  ledger_status: restored.ledger.save.status, checksum_verified: true,
  replay_executor_calls: executeCalls, replay_persist_calls: persistCalls };
}

function exitOf(child) {
 if (child.exitCode !== null || child.signalCode !== null)
  return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
 return new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
}
function readyFrom(child) {
 return new Promise((resolve, reject) => {
  let text = '';
  const timer = setTimeout(() => finish(new Error('Writer did not reach its kill boundary')), 10000);
  const exited = () => finish(new Error('Writer exited before its kill boundary'));
  const failed = error => finish(error);
  const data = chunk => {
   text += chunk;
   if (text.length > 4096) return finish(new Error('Unexpected boundary message size'));
   if (text.includes('\n')) {
    try { finish(null, JSON.parse(text.trim())); } catch (error) { finish(error); }
   }
  };
  function finish(error, value) {
   clearTimeout(timer); child.off('exit', exited); child.off('error', failed); child.stdio[3].off('data', data);
   error ? reject(error) : resolve(value);
  }
  child.once('exit', exited); child.once('error', failed); child.stdio[3].on('data', data);
 });
}

async function runExperiment() {
 if (process.platform === 'win32') throw new Error('The SIGKILL experiment requires macOS or Linux.');
 const started = new Date().toISOString();
 const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'blueprint-checkpoint-kill-'));
 const cases = [], children = new Set();
 const specs = [{ stage: 'direct-overwrite', seeded: true },
  ...[true, false].flatMap(seeded => ['partial-temp-write', 'after-file-fsync', 'after-rename'].map(stage => ({ stage, seeded })))];
 try {
  for (const [index, spec] of specs.entries()) {
   const dir = path.join(temp, String(index)); fs.mkdirSync(dir);
   const file = path.join(dir, 'checkpoint.json');
   if (spec.seeded) writeCheckpoint(file, state(1));
   const child = spawn(process.execPath, [__filename, '--writer', spec.stage, file],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe'] });
   children.add(child); child.once('exit', () => children.delete(child));
   let stderr = ''; child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
   let ready;
   try { ready = await readyFrom(child); }
   catch (error) { throw new Error(error.message + (stderr ? ': ' + stderr : '')); }
   assert.equal(ready.stage, spec.stage); assert.equal(ready.writer_pid, child.pid);
   const exited = exitOf(child);
   assert.equal(child.kill('SIGKILL'), true);
   const killed = await exited;
   assert.deepEqual(killed, { code: null, signal: 'SIGKILL' });
   const restored = JSON.parse(execFileSync(process.execPath, [__filename, '--reader', file],
    { encoding: 'utf8', timeout: 10000, maxBuffer: 65536 }));
   assert.notEqual(restored.reader_pid, ready.writer_pid);
   const expectedRevision = spec.stage === 'direct-overwrite' ? null : spec.stage === 'after-rename' ? 2 : spec.seeded ? 1 : null;
   const published = fs.existsSync(file) ? fs.readFileSync(file) : null;
   if (expectedRevision !== null) {
    assert.equal(restored.accepted, true); assert.equal(restored.revision, expectedRevision);
    assert.equal(restored.ledger_status, expectedRevision === 1 ? 'DISPATCHED' : 'CONFIRMED');
    assert.equal(hash(published), hash(envelope(state(expectedRevision))));
   } else {
    assert.equal(restored.accepted, false);
    assert.equal(restored.reason, spec.stage === 'direct-overwrite' ? 'invalid' : 'missing');
   }
   assert.equal(restored.replay_executor_calls, 0);
   const leftovers = fs.readdirSync(dir).filter(name => name.endsWith('.tmp'));
   assert.equal(leftovers.length, ['partial-temp-write', 'after-file-fsync'].includes(spec.stage) ? 1 : 0);
   if (spec.stage.includes('write') || spec.stage === 'direct-overwrite') {
    assert.ok(ready.bytes_written > 0 && ready.bytes_written < ready.complete_bytes);
   }
   cases.push({ boundary: spec.stage, prior_checkpoint: spec.seeded, writer: ready, writer_exit: killed,
    fresh_reader: restored, expected_revision: expectedRevision,
    published_file_sha256: published ? hash(published) : null, unpromoted_temp_files: leftovers.length, passed: true });
  }
 } finally {
  await Promise.all([...children].map(async child => {
   const exited = exitOf(child); child.kill('SIGKILL'); await exited;
  }));
  fs.rmSync(temp, { recursive: true, force: true });
 }
 return { started_at: started, completed_at: new Date().toISOString(), platform: process.platform,
  node: process.version, status: 'passed', cases, temporary_files_cleaned: true,
  scope: 'Deterministic process-kill boundaries of the original writeCheckpoint file writer. A test-only fs.writeFileSync interceptor writes a prefix before SIGKILL. Not a random mid-syscall tear, browser localStorage flush, remote-write test, power loss or exactly-once guarantee.' };
}

if (require.main === module) {
 if (process.argv[2] === '--writer') {
  try { writer(process.argv[3], process.argv[4]); } catch (error) { console.error(error.message); process.exitCode = 1; }
 } else if (process.argv[2] === '--reader') {
  reader(process.argv[3]).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
 } else {
  runExperiment().then(report => {
   const out = path.join(__dirname, '../runs/checkpoint-kill.json');
   fs.mkdirSync(path.dirname(out), { recursive: true });
   fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
   console.log(JSON.stringify(report, null, 2));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
 }
}
module.exports = { runExperiment };
