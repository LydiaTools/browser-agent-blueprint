'use strict';

// This optional integration experiment starts its own browser and localhost fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { chromium } = require('playwright');
const exec = promisify(execFile);

async function main() {
  const [node, cli] = process.argv.slice(2);
  if (!node || !cli || !path.isAbsolute(node) || !path.isAbsolute(cli)) {
    throw new Error('Provide absolute paths to Node 24+ and agent-browser/bin/agent-browser.js');
  }
  if (process.platform === 'win32') throw new Error('This optional integration has only been tested on macOS.');
  const temp = fs.mkdtempSync(path.join('/tmp', 'blueprint-ab-'));
  const config = path.join(temp, 'config.json');
  fs.writeFileSync(config, '{}');
  const env = { PATH: process.env.PATH, LANG: 'en_US.UTF-8', TMPDIR: os.tmpdir(),
    AGENT_BROWSER_SOCKET_DIR: temp, AGENT_BROWSER_NAMESPACE: 'blueprint-isolation', AGENT_BROWSER_CONFIG: config };
  const sessions = [], observations = {};
  let server, context, port, cleanupFailed = false;
  async function call(session, args, expectFailure = false) {
    const argv = [cli, '--config', config, '--session', session, '--cdp', String(port), '--pin-tab', '--json', ...args];
    try {
      const output = await exec(node, argv, { env, timeout: 25000, maxBuffer: 1024 * 1024 });
      if (expectFailure) throw new Error('Expected the pinned-tab command to fail');
      const result = JSON.parse(output.stdout);
      assert.equal(result.success, true);
      return result;
    } catch (error) {
      if (expectFailure && error.stdout && Number.isInteger(error.code) && error.code !== 0) {
        const result = JSON.parse(error.stdout);
        assert.equal(result.success, false);
        return result;
      }
      throw error;
    }
  }
  try {
    const version = (await exec(node, [cli, '--version'], { env, timeout: 10000 })).stdout.trim();
    if (version !== 'agent-browser 0.41.0') throw new Error(`Expected agent-browser 0.41.0; received ${version}`);
    server = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end('<!doctype html><title>Disposable browser fixture</title><p>Synthetic local test</p>');
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    context = await chromium.launchPersistentContext(path.join(temp, 'profile'), {
      headless: true,
      ...(process.env.BLUEPRINT_BROWSER_CHANNEL ? { channel: process.env.BLUEPRINT_BROWSER_CHANNEL } : {}),
      args: ['--remote-debugging-port=0', '--disable-background-networking', '--disable-component-update', '--disable-sync']
    });
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    const portFile = path.join(temp, 'profile', 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await new Promise(resolve => setTimeout(resolve, 100));
    port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    assert.ok(port > 0, 'Disposable Chrome debugging port unavailable');
    const suffix = Date.now().toString(36), a = `a-${suffix}`, b = `b-${suffix}`;
    sessions.push(a); await call(a, ['open', `${base}/a`]);
    sessions.push(b); await call(b, ['open', `${base}/b`]);
    const first = await call(a, ['get', 'url']), second = await call(b, ['get', 'url']);
    assert.equal(first.data.url, `${base}/a`);
    assert.equal(second.data.url, `${base}/b`);
    observations.pinned_tabs_retained_their_urls = true;
    await call(a, ['eval', "document.cookie='demo_role=agent_a; path=/';localStorage.setItem('demo_role','agent_a'); 'ok'"]);
    const read = await call(b, ['eval', "JSON.stringify({cookie:document.cookie,local:localStorage.getItem('demo_role')})"]);
    assert.deepEqual(JSON.parse(read.data.result), { cookie: 'demo_role=agent_a', local: 'agent_a' });
    observations.second_tab_saw_cookie_and_local_storage = true;
    const page = context.pages().find(item => item.url() === `${base}/a`);
    assert.ok(page, 'Pinned tab A was not found in the disposable browser');
    await page.close();
    const gone = await call(a, ['get', 'url'], true);
    assert.equal(gone.code, 'tab_gone');
    observations.closed_pinned_tab_reported_tab_gone = true;
  } finally {
    for (const session of sessions) {
      try { await exec(node, [cli, '--config', config, '--session', session, 'close'], { env, timeout: 8000 }); }
      catch (error) { cleanupFailed = true; console.error(`Could not close disposable session ${session}: ${error.message}`); }
    }
    if (context) await context.close();
    if (server) await new Promise(resolve => server.close(resolve));
    if (!cleanupFailed) fs.rmSync(temp, { recursive: true, force: true });
    else console.error(`Temporary files retained at ${temp}`);
  }
  if (cleanupFailed) throw new Error('Disposable session cleanup failed');
  console.log(JSON.stringify({ status: 'passed', agent_browser: '0.41.0', observations,
    scope: 'One local synthetic fixture and a new browser profile; no real login or production site.' }, null, 2));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
