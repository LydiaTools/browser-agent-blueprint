'use strict';

// This example starts two cooperative, disposable localhost servers. The
// controller asks each server to exit through its own IPC channel; it never
// discovers or signals processes by PID, executable name, port, or path.
const http = require('node:http');
const { fork } = require('node:child_process');
const assert = require('node:assert/strict');

if (process.argv[2] === '--child') {
  const label = process.argv[3];
  const server = http.createServer((_req, res) => res.end(label));
  let closing = false;
  function close() {
    if (closing) return;
    closing = true;
    server.close(() => {
      if (process.connected) process.disconnect();
    });
  }
  process.on('message', message => { if (message === 'close') close(); });
  process.on('disconnect', close);
  server.listen(0, '127.0.0.1', () => {
    if (process.connected) process.send({ port: server.address().port });
    else close();
  });
} else {
  function start(label) {
    const child = fork(__filename, ['--child', label], {
      stdio: ['ignore', 'ignore', 'inherit', 'ipc']
    });
    const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} did not start`)), 5000);
      child.once('message', message => { clearTimeout(timer); resolve(message.port); });
      child.once('error', err => { clearTimeout(timer); reject(err); });
      exited.then(() => { clearTimeout(timer); reject(new Error(`${label} exited before ready`)); });
    });
    return { child, ready, exited };
  }

  async function stop(server) {
    if (server.child.connected) server.child.send('close');
    const outcome = await Promise.race([
      server.exited,
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error('server did not exit')), 5000);
        server.exited.then(() => clearTimeout(timer));
      })
    ]);
    assert.deepEqual(outcome, { code: 0, signal: null });
  }

  async function read(port) {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200);
    return response.text();
  }

  async function run() {
    const a = start('test-server-a');
    const b = start('test-server-b');
    try {
      const [aPort, bPort] = await Promise.all([a.ready, b.ready]);
      assert.notEqual(aPort, bPort);
      assert.equal(await read(aPort), 'test-server-a');
      assert.equal(await read(bPort), 'test-server-b');
      await stop(a);
      await assert.rejects(read(aPort));
      assert.equal(await read(bPort), 'test-server-b');
      await stop(b);
      console.log(JSON.stringify({
        same_executable: true,
        before: { a: 'responding', b: 'responding' },
        after_closing_a: { a: 'not responding', b: 'responding' },
        cleanup: 'both cooperative test servers exited normally'
      }, null, 2));
    } finally {
      // If an assertion fails, close only the channels created in this run.
      for (const server of [a, b]) if (server.child.connected) server.child.send('close');
      await Promise.all([a.exited, b.exited]);
    }
  }
  run().catch(err => { console.error(err); process.exitCode = 1; });
}
