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
  const ambiguous = Object.values(ledger).some(x => ['DISPATCHED','UNKNOWN','PENDING_REVIEW'].includes(x.status));
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
  if (action.payload_ref !== undefined && !boundedText(action.payload_ref, 512))
    throw new PolicyError('Payload reference must be non-empty bounded text');
  for (const entry of Object.values(ledger)) {
    if (entry.action?.kind === 'read' || entry.action?.operation_id !== action.operation_id) continue;
    if (entry.action.payload_sha256 !== action.payload_sha256 || entry.action.origin !== action.origin || entry.action.account !== action.account ||
        entry.action.kind !== action.kind || entry.action.count !== action.count || entry.action.payload_ref !== action.payload_ref)
      throw new PolicyError('Operation binding changed');
    if (entry.status !== 'ABSENT') throw new PolicyError('Operation already recorded; reconcile before a new attempt');
  }
}

class Controller {
  constructor(scope, ledger = {}, { persist, requireHumanReview = false } = {}) {
    if (persist !== undefined && typeof persist !== 'function') throw new PolicyError('Invalid persistence callback');
    if (typeof requireHumanReview !== 'boolean' || (requireHumanReview && !persist))
      throw new PolicyError('Human-reviewed recovery requires durable persistence');
    if (!requireHumanReview && Object.values(ledger).some(entry => entry?.requireHumanReview === true))
      throw new PolicyError('Reload the task with its human-reviewed recovery policy enabled');
    this.scope = scope; this.ledger = structuredClone(ledger); this.persist = persist;
    this.requireHumanReview = requireHumanReview;
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
    if (action.kind !== 'read') {
      if (this.requireHumanReview && (!Object.hasOwn(action, 'operation_id') || !Object.hasOwn(action, 'payload_sha256') ||
          !boundedText(action.payload_ref, 512)))
        throw new PolicyError('Human-reviewed writes require a stable operation ID, exact payload hash, and durable payload reference');
      bindOperation(action, this.ledger);
    }
    const entry = { action: structuredClone(action), status: 'PLANNED',
      reservedWrites: action.kind === 'read' ? 0 : action.count, decision,
      ...(action.kind === 'read' ? {} : { requireHumanReview: this.requireHumanReview }) };
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
    if (this.requireHumanReview || this.ledger[id]?.requireHumanReview)
      throw new PolicyError('Use recordRecoveryObservation and reviewAndReconcile');
    if (this.persist) throw new PolicyError('Use await reconcileAndPersist for a persisted controller');
    this.#markReconciled(id, present);
  }
  async reconcileAndPersist(id, present) {
    if (this.requireHumanReview || this.ledger[id]?.requireHumanReview)
      throw new PolicyError('Use recordRecoveryObservation and reviewAndReconcile');
    this.#enter();
    try { this.#markReconciled(id, present); await this.#checkpoint(); }
    finally { this.busy = false; }
  }
  async recordRecoveryObservation(id, input) {
    this.#enter();
    try {
      const entry = this.ledger[id];
      if (!entry || entry.requireHumanReview !== true || !['DISPATCHED','UNKNOWN','PENDING_REVIEW'].includes(entry.status) ||
          !input || !['present','absent','inconclusive'].includes(input.outcome) ||
          !boundedText(input.source, 120) || !boundedText(input.reference, 512) ||
          !validTimestamp(input.observed_at) || !validHash(input.evidence_sha256))
        throw new PolicyError('Invalid recovery observation');
      const observations = entry.recovery_observations || [];
      if (observations.length >= 100) throw new PolicyError('Recovery observation limit reached');
      const observation = {
        id: `observation-${observations.length + 1}`,
        outcome: input.outcome,
        source: input.source,
        reference: input.reference,
        observed_at: new Date(input.observed_at).toISOString(),
        evidence_sha256: input.evidence_sha256,
      };
      entry.recovery_observations = [...observations, observation];
      entry.status = 'PENDING_REVIEW';
      await this.#checkpoint();
      return structuredClone(observation);
    } finally { this.busy = false; }
  }
  async reviewAndReconcile(id, input) {
    this.#enter();
    try {
      const entry = this.ledger[id];
      const observations = entry?.recovery_observations || [];
      const latest = observations.at(-1);
      if (!entry || entry.requireHumanReview !== true || entry.status !== 'PENDING_REVIEW' || !latest || !input ||
          !['landed','not_landed','unresolved'].includes(input.decision) ||
          !boundedText(input.reviewer, 120) || !boundedText(input.reason, 500) ||
          !validTimestamp(input.reviewed_at))
        throw new PolicyError('Invalid human review');
      if ((input.decision === 'landed' && latest.outcome !== 'present') ||
          (input.decision === 'not_landed' && latest.outcome !== 'absent'))
        throw new PolicyError('Human decision conflicts with the latest destination observation');
      const reviews = entry.human_reviews || [];
      if (reviews.length >= 100) throw new PolicyError('Human review limit reached');
      const review = {
        id: `review-${reviews.length + 1}`,
        observation_id: latest.id,
        decision: input.decision,
        reviewer: input.reviewer,
        reason: input.reason,
        reviewed_at: new Date(input.reviewed_at).toISOString(),
      };
      entry.human_reviews = [...reviews, review];
      if (input.decision === 'landed') entry.status = 'CONFIRMED';
      else if (input.decision === 'not_landed') entry.status = 'ABSENT';
      await this.#checkpoint();
      return structuredClone(review);
    } finally { this.busy = false; }
  }
  #markReconciled(id, present) {
    const entry = this.ledger[id];
    if (!entry || entry.requireHumanReview || !['UNKNOWN','DISPATCHED'].includes(entry.status) || typeof present !== 'boolean')
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
    if (!e || !['PLANNED','DISPATCHED','CONFIRMED','UNKNOWN','PENDING_REVIEW','FAILED','ABSENT'].includes(e.status) ||
        !Number.isInteger(e.reservedWrites) || e.reservedWrites < 0 || !e.action ||
        !TYPES.has(e.action.kind) || (e.requireHumanReview !== undefined && typeof e.requireHumanReview !== 'boolean'))
      throw new PolicyError('Invalid checkpoint ledger');
    if (e.requireHumanReview === true && (e.action.kind === 'read' ||
        typeof e.action.operation_id !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(e.action.operation_id) ||
        !validHash(e.action.payload_sha256) || !boundedText(e.action.payload_ref, 512)))
      throw new PolicyError('Invalid strict write binding');
    if (e.recovery_observations !== undefined && (!Array.isArray(e.recovery_observations) || e.recovery_observations.length > 100 ||
        e.recovery_observations.some((o, i) => !o || o.id !== `observation-${i + 1}` ||
          !['present','absent','inconclusive'].includes(o.outcome) || !boundedText(o.source, 120) ||
          !boundedText(o.reference, 512) || !validTimestamp(o.observed_at) || !validHash(o.evidence_sha256))))
      throw new PolicyError('Invalid recovery observation history');
    if (e.human_reviews !== undefined) {
      if (!Array.isArray(e.human_reviews) || e.human_reviews.length > 100 || e.requireHumanReview !== true ||
          e.human_reviews.some((r, i) => {
            const observation = e.recovery_observations?.find(o => o.id === r?.observation_id);
            return !r || r.id !== `review-${i + 1}` || !observation ||
              !['landed','not_landed','unresolved'].includes(r.decision) ||
              (r.decision === 'landed' && observation.outcome !== 'present') ||
              (r.decision === 'not_landed' && observation.outcome !== 'absent') ||
              !boundedText(r.reviewer, 120) || !boundedText(r.reason, 500) || !validTimestamp(r.reviewed_at);
          })) throw new PolicyError('Invalid human review history');
    }
    if (e.requireHumanReview === true) {
      const observations = e.recovery_observations || [];
      const reviews = e.human_reviews || [];
      const latestObservation = observations.at(-1);
      const latestReview = reviews.at(-1);
      if (e.status === 'PENDING_REVIEW' && (!latestObservation ||
          (latestReview?.observation_id === latestObservation.id && latestReview.decision !== 'unresolved')))
        throw new PolicyError('Invalid pending review checkpoint');
      if (e.status === 'ABSENT' && (latestObservation?.outcome !== 'absent' ||
          latestReview?.observation_id !== latestObservation.id || latestReview.decision !== 'not_landed'))
        throw new PolicyError('ABSENT requires a matching not_landed review');
      if (e.status === 'CONFIRMED' && observations.length > 0 &&
          (latestReview?.observation_id !== latestObservation.id || latestReview.decision !== 'landed'))
        throw new PolicyError('Recovered CONFIRMED requires a matching landed review');
    }
  }
}
function boundedText(value, max) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}
function validTimestamp(value) {
  return typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
}
function validHash(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
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
