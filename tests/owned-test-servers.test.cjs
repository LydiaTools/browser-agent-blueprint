'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');

test('closing one cooperative test server leaves its peer running', { timeout: 20000 }, async () => {
  const run = promisify(execFile);
  const { stdout } = await run(process.execPath, [path.join(__dirname, '../demo/owned-test-servers.cjs')]);
  const result = JSON.parse(stdout);
  assert.equal(result.same_executable, true);
  assert.deepEqual(result.before, { a: 'responding', b: 'responding' });
  assert.deepEqual(result.after_closing_a, { a: 'not responding', b: 'responding' });
  assert.equal(result.cleanup, 'both cooperative test servers exited normally');
});
