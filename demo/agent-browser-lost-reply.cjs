'use strict';

// A local fault-injection experiment. It owns its temporary sessions and server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const exec = promisify(execFile);

async function experiment(node, cli, browser, expectedVersion, expectedRequests) {
  // Short socket paths are important on macOS. Never use an existing session.
  const root = fs.mkdtempSync('/tmp/blueprint-reply-');
  const config = path.join(root, 'config.json');
  fs.writeFileSync(config, '{}');
  const session = 'synthetic', namespace = 'local';
  const env = {
    PATH: path.dirname(node) + path.delimiter + (process.env.PATH || ''),
    LANG: 'en_US.UTF-8', TMPDIR: os.tmpdir(),
    AGENT_BROWSER_SOCKET_DIR: root, AGENT_BROWSER_NAMESPACE: namespace,
    AGENT_BROWSER_CONFIG: config, AGENT_BROWSER_EXECUTABLE_PATH: browser,
    AGENT_BROWSER_IDLE_TIMEOUT_MS: '90000'
  };
  const call = (...args) => exec(node, [cli, '--config', config, '--session', session,
    '--allowed-domains', '127.0.0.1', '--json', ...args],
  {env, timeout: 35000, maxBuffer: 1024 * 1024});
  let saves = 0, clickRequests = 0, server, proxy, socket, originalSocket;
  let sessionOpened = false, socketMoved = false, cleanupOK = true;
  const connections = new Set();
  try {
    const version = (await exec(node, [cli, '--version'], {env, timeout: 10000})).stdout.trim();
    assert.equal(version, `agent-browser ${expectedVersion}`);
    server = http.createServer((req, res) => {
      if (req.method === 'POST' && req.url === '/save') { saves++; res.end('saved'); return; }
      if (req.method !== 'GET' || req.url !== '/') { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><title>Synthetic save</title><button id="save" onclick="fetch(\'/save\',{method:\'POST\'})">Save</button>');
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const opened = await call('open', `http://127.0.0.1:${server.address().port}/`);
    sessionOpened = true;
    assert.equal(JSON.parse(opened.stdout).success, true);

    socket = path.join(root, 'namespaces', namespace, 'run', `${session}.sock`);
    originalSocket = socket + '.real';
    fs.renameSync(socket, originalSocket);
    socketMoved = true;
    proxy = net.createServer(client => {
      const target = net.connect(originalSocket);
      connections.add(client); connections.add(target);
      client.on('close', () => connections.delete(client));
      target.on('close', () => connections.delete(target));
      let pending = '', dropReply = false;
      client.on('data', chunk => {
        pending += chunk.toString('utf8');
        let index;
        while ((index = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, index + 1); pending = pending.slice(index + 1);
          const command = JSON.parse(line);
          if (command.action === 'click') { dropReply = true; clickRequests++; }
          target.write(line);
        }
      });
      target.on('data', chunk => {
        if (dropReply) { client.destroy(); target.destroy(); }
        else client.write(chunk);
      });
      client.on('end', () => target.end()); target.on('end', () => client.end());
      client.on('error', () => target.destroy()); target.on('error', () => client.destroy());
    });
    await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(socket, resolve); });
    let result;
    try {
      await call('click', '#save');
      throw new Error('Expected the interrupted click to report an error.');
    } catch (error) {
      if (!Number.isInteger(error.code) || error.code === 0 || !error.stdout) throw error;
      result = JSON.parse(error.stdout);
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(result.success, false);
    assert.equal(clickRequests, expectedRequests, 'Unexpected CLI request count');
    assert.equal(saves, expectedRequests, 'Unexpected synthetic server save count');
    if (expectedVersion === '0.41.0') assert.equal(result.code, 'outcome_unknown');
    console.log(JSON.stringify({version: expectedVersion, click_requests: clickRequests,
      synthetic_saves: saves, error_code: result.code || null}));
  } finally {
    for (const connection of connections) connection.destroy();
    if (proxy && proxy.listening) await new Promise(resolve => proxy.close(resolve));
    if (socketMoved) {
      try { if (fs.existsSync(socket)) fs.unlinkSync(socket); fs.renameSync(originalSocket, socket); }
      catch (error) { cleanupOK = false; console.error(`Socket cleanup failed: ${error.message}`); }
    }
    if (sessionOpened && cleanupOK) {
      try { await call('close'); }
      catch (error) { cleanupOK = false; console.error(`Created session did not close: ${error.message}`); }
    }
    if (server) await new Promise(resolve => server.close(resolve));
    if (cleanupOK && sessionOpened) fs.rmSync(root, {recursive: true, force: true});
    else console.error(`Temporary files retained for inspection: ${root}`);
  }
  if (!cleanupOK) throw new Error('Cleanup was incomplete.');
}

async function main() {
  const [node, oldCLI, newCLI, browser] = process.argv.slice(2);
  if (process.platform !== 'darwin' || ![node, oldCLI, newCLI, browser].every(p => p && path.isAbsolute(p))) {
    throw new Error('On macOS provide absolute paths: Node 24+, agent-browser 0.38.2 CLI, agent-browser 0.41.0 CLI, Chrome.');
  }
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Run this script with Node 24+.');
  await experiment(node, oldCLI, browser, '0.38.2', 5);
  await experiment(node, newCLI, browser, '0.41.0', 1);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
