'use strict';

// Two fresh, independently launched agent-browser sessions. No existing browser,
// profile, credentials, or non-loopback page is used.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);

async function main() {
  const [node, cli, browser] = process.argv.slice(2);
  if (![node, cli, browser].every(value => value && path.isAbsolute(value))) {
    throw new Error('Provide absolute paths to Node 24+, agent-browser.js, and a Chrome/Chromium executable');
  }
  if (process.platform !== 'darwin') throw new Error('This integration has only been tested on macOS.');
  // Short paths avoid macOS Unix-domain socket path length limits.
  const temp = fs.mkdtempSync('/tmp/blueprint-independent-');
  const config = path.join(temp, 'config.json');
  fs.writeFileSync(config, '{}');
  const suffix = crypto.randomBytes(6).toString('hex');
  const first = `a-${suffix}`, second = `b-${suffix}`;
  const env = {
    PATH: process.env.PATH, LANG: 'en_US.UTF-8', TMPDIR: temp,
    AGENT_BROWSER_SOCKET_DIR: temp, AGENT_BROWSER_NAMESPACE: `blueprint-${suffix}`,
    AGENT_BROWSER_CONFIG: config, AGENT_BROWSER_EXECUTABLE_PATH: browser,
    AGENT_BROWSER_IDLE_TIMEOUT_MS: '120000'
  };
  const sessions = new Set();
  let server, cleanupFailed = false;
  async function call(session, args) {
    const argv = [cli, '--config', config, '--session', session, '--allowed-domains', '127.0.0.1', '--json', ...args];
    const output = await exec(node, argv, { env, timeout: 30000, maxBuffer: 1024 * 1024 });
    const result = JSON.parse(output.stdout);
    assert.equal(result.success, true);
    return result;
  }
  async function read(session) {
    const result = await call(session, ['eval', "JSON.stringify({cookie:document.cookie,local:localStorage.getItem('demo_role')})"]);
    return JSON.parse(result.data.result);
  }
  try {
    const version = (await exec(node, [cli, '--version'], { env, timeout: 10000 })).stdout.trim();
    if (version !== 'agent-browser 0.41.0') throw new Error(`Expected agent-browser 0.41.0; received ${version}`);
    server = http.createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end('<!doctype html><title>Independent session fixture</title><p>Synthetic local test</p>');
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    sessions.add(first); await call(first, ['open', `${origin}/a`]);
    sessions.add(second); await call(second, ['open', `${origin}/b`]);
    await call(first, ['eval', "document.cookie='demo_role=first; path=/';localStorage.setItem('demo_role','first'); 'ok'"]);
    assert.deepEqual(await read(second), { cookie: '', local: null });
    await call(second, ['eval', "document.cookie='demo_role=second; path=/';localStorage.setItem('demo_role','second'); 'ok'"]);
    assert.deepEqual(await read(first), { cookie: 'demo_role=first', local: 'first' });
    await call(first, ['close']); sessions.delete(first);
    assert.deepEqual(await read(second), { cookie: 'demo_role=second', local: 'second' });
  } finally {
    for (const session of sessions) {
      try { await call(session, ['close']); }
      catch (error) { cleanupFailed = true; console.error(`Could not close disposable session ${session}: ${error.message}`); }
    }
    if (server) await new Promise(resolve => server.close(resolve));
    if (!cleanupFailed) fs.rmSync(temp, { recursive: true, force: true });
    else console.error(`Temporary files retained at ${temp}`);
  }
  if (cleanupFailed) throw new Error('Disposable session cleanup failed');
  console.log(JSON.stringify({ status: 'passed', agent_browser: '0.41.0', observations: {
    second_session_empty_after_first_write: true,
    first_unchanged_after_second_write: true,
    second_session_works_after_first_closed: true
  }, scope: 'Two freshly launched sessions and one synthetic loopback fixture; no existing browser or login.' }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
