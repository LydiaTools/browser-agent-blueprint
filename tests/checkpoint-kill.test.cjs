'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { runExperiment } = require('../demo/checkpoint-kill.cjs');

test('fresh processes read the published checkpoint after seven real SIGKILL boundaries',
 { skip: process.platform === 'win32', timeout: 45000 }, async () => {
  const report = await runExperiment();
  assert.equal(report.status, 'passed');
  assert.deepEqual(report.cases.map(row => [row.boundary, row.prior_checkpoint,
   row.fresh_reader.accepted, row.fresh_reader.revision ?? null]), [
   ['direct-overwrite', true, false, null],
   ['partial-temp-write', true, true, 1],
   ['after-file-fsync', true, true, 1],
   ['after-rename', true, true, 2],
   ['partial-temp-write', false, false, null],
   ['after-file-fsync', false, false, null],
   ['after-rename', false, true, 2]
  ]);
  assert.equal(report.temporary_files_cleaned, true);
  const out = path.join(__dirname, '../runs/checkpoint-kill.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
 });
