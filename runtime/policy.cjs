'use strict';
// Example host controls for this fixed local fixture, not a general browser sandbox.
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

class PolicyError extends Error {}
const TYPES = new Set(['read', 'fill', 'save_draft', 'publish']);
function digest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function gate(action, scope, ledger) {
  if (!scope || typeof scope.origin !== 'string' || typeof scope.account !== 'string' ||
      !Array.isArray(scope.allowed) || !Array.isArray(scope.highRisk) ||
      !Number.isSafeInteger(scope.maxWrites) || scope.maxWrites < 0 ||
      !Number.isSafeInteger(scope.batchThreshold) || scope.batchThreshold < 1 ||
      !Number.isFinite(scope.expiresAt)) throw new PolicyError('Invalid trusted scope');
  if (!action || !TYPES.has(action.kind)) throw new PolicyError('Unknown action');
  if (!Number.isSafeInteger(action.count) || action.count < 1) throw new PolicyError('Invalid affected count');
  if (action.origin !== scope.origin || action.account !== scope.account) throw new PolicyError('Scope mismatch');
  if (!scope.allowed.includes(action.kind)) throw new PolicyError('Action outside trusted scope');
  if (Date.now() > scope.expiresAt) throw new PolicyError('Scope expired');
  const writing = action.kind !== 'read';
  const ambiguous = Object.values(ledger).some(x => ['DISPATCHED','UNKNOWN'].includes(x.status));
  if (writing && ambiguous) throw new PolicyError('Reconcile uncertain write first');
  // A reservation remains consumed after an uncertain write, including on resume.
  const reserved = Object.values(ledger).reduce((n,x) => n + (x.reservedWrites || 0),0);
  const next = reserved + (writing ? action.count : 0);
  if (writing && next > scope.maxWrites) throw new PolicyError('Cumulative write budget exhausted');
  const high = action.kind === 'publish' || (writing && next >= scope.batchThreshold);
  if (high && (!scope.highRisk || !scope.highRisk.includes(action.kind))) {
    throw new PolicyError('High-risk scope missing; preview before mutation');
  }
  return { level: high ? 'R2' : writing ? 'R1' : 'R0',
    warning: high ? 'Bounded high-risk action: ' + action.kind + ', count=' + action.count : null };
}

function bindOperation(action, ledger) {
  const hasId = Object.hasOwn(action, 'operation_id');
  const hasHash = Object.hasOwn(action, 'payload_sha256');
  if (!hasId && !hasHash) return;
  if (typeof action.operation_id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(action.operation_id) ||
      typeof action.payload_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(action.payload_sha256))
    throw new PolicyError('Operation ID and payload SHA-256 must be supplied together');
  for (const entry of Object.values(ledger)) {
    if (entry.action?.kind === 'read' || entry.action?.operation_id !== action.operation_id) continue;
    if (entry.action.payload_sha256 !== action.payload_sha256 || entry.action.origin !== action.origin || entry.action.account !== action.account)
      throw new PolicyError('Operation binding changed');
    if (entry.status !== 'ABSENT') throw new PolicyError('Operation already recorded; reconcile before a new attempt');
  }
}

class Controller {
  constructor(scope, ledger = {}, { persist } = {}) {
    if (persist !== undefined && typeof persist !== 'function') throw new PolicyError('Invalid persistence callback');
    this.scope = scope; this.ledger = structuredClone(ledger); this.persist = persist;
    this.busy = false; this.persistenceFailed = false;
  }
  async #checkpoint() {
    if (!this.persist) return;
    try { await this.persist(structuredClone(this.ledger)); }
    catch {
      this.persistenceFailed = true;
      throw new PolicyError('Checkpoint persistence failed; stop and reload verified task state');
    }
  }
  #enter() {
    if (!this.persist) return;
    if (this.persistenceFailed) throw new PolicyError('Persistence failed; reload verified task state');
    if (this.busy) throw new PolicyError('Persisted controller calls must be sequential');
    this.busy = true;
  }
  async run(id, action, execute, verify) {
    this.#enter();
    try { return await this.#runAction(id, action, execute, verify); }
    finally { this.busy = false; }
  }
  async #runAction(id, action, execute, verify) {
    if (typeof id !== 'string' || !id || ['__proto__','constructor','prototype'].includes(id))
      throw new PolicyError('Invalid action ID');
    if (Object.hasOwn(this.ledger, id)) throw new PolicyError('Action ID already used; reconcile or choose a new ID');
    const decision = gate(action, this.scope, this.ledger);
    if (action.kind !== 'read') bindOperation(action, this.ledger);
    const entry = { action: structuredClone(action), status: 'PLANNED',
      reservedWrites: action.kind === 'read' ? 0 : action.count, decision };
    this.ledger[id] = entry;
    // The configured host callback must flush before execute can reach the target.
    entry.status = 'DISPATCHED';
    await this.#checkpoint();
    try {
      const result = await execute();
      if (!(await verify(result))) throw new Error('Postcondition mismatch');
      entry.status = 'CONFIRMED';
      await this.#checkpoint();
      return result;
    } catch (error) {
      if (this.persistenceFailed) throw error;
      entry.status = action.kind === 'read' ? 'FAILED' : 'UNKNOWN';
      entry.error = 'Execution or verification failed'; // Do not persist raw tool errors.
      await this.#checkpoint();
      throw error;
    }
  }
  reconcile(id, present) {
    if (this.persist) throw new PolicyError('Use await reconcileAndPersist for a persisted controller');
    this.#markReconciled(id, present);
  }
  async reconcileAndPersist(id, present) {
    this.#enter();
    try { this.#markReconciled(id, present); await this.#checkpoint(); }
    finally { this.busy = false; }
  }
  #markReconciled(id, present) {
    const entry = this.ledger[id];
    if (!entry || !['UNKNOWN','DISPATCHED'].includes(entry.status) || typeof present !== 'boolean')
      throw new PolicyError('Invalid reconciliation');
    entry.status = present ? 'CONFIRMED' : 'ABSENT';
    // Reservation is deliberately retained. A new attempt needs a new ID and budget.
  }
}
async function retryRead(operation, { retries = 3, wait = ms => new Promise(r => setTimeout(r,ms)),
  classify = error => error.code, random = Math.random } = {}) {
  if (!Number.isInteger(retries) || retries < 0 || retries > 3) throw new PolicyError('Invalid read retry budget');
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      if (classify(error) !== 'F2' || attempt >= retries) throw error;
      await wait(Math.min(4000, 250 * 2 ** attempt) + Math.floor(random() * 100));
    }
  }
}
function validateState(state) {
  if (!state || state.schema_version !== 1 || typeof state.task_id !== 'string' ||
      !Number.isInteger(state.revision) || state.revision < 1 || typeof state.objective !== 'string' ||
      !['PAUSED','DONE'].includes(state.status) || !state.ledger || typeof state.ledger !== 'object' ||
      !Array.isArray(state.module_ids) || !Number.isInteger(state.retry_count) || state.retry_count < 0 ||
      typeof state.next_safe_action !== 'string') throw new PolicyError('Invalid checkpoint schema');
  for (const e of Object.values(state.ledger)) {
    if (!e || !['PLANNED','DISPATCHED','CONFIRMED','UNKNOWN','FAILED','ABSENT'].includes(e.status) ||
        !Number.isInteger(e.reservedWrites) || e.reservedWrites < 0 || !e.action ||
        !TYPES.has(e.action.kind)) throw new PolicyError('Invalid checkpoint ledger');
  }
}
function writeCheckpoint(file, state) {
  validateState(state);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const envelope = { sha256: digest(state), state };
  const temporary = file + '.' + randomUUID() + '.tmp';
  try {
    const fd = fs.openSync(temporary, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(envelope, null, 2) + '\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temporary,file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return readCheckpoint(file, state.task_id);
}
function readCheckpoint(file, taskId) {
  const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!envelope || envelope.sha256 !== digest(envelope.state)) throw new PolicyError('Checkpoint integrity mismatch');
  validateState(envelope.state);
  if (envelope.state.task_id !== taskId) throw new PolicyError('Checkpoint task mismatch');
  return envelope.state;
}
module.exports = { Controller, gate, PolicyError, retryRead, writeCheckpoint, readCheckpoint, digest };
