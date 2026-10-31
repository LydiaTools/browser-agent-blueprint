'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.BLUEPRINT_PLAYWRIGHT || 'playwright');

(async () => {
  const html = fs.readFileSync(path.join(__dirname, '../demo/lost-reply.html'));
  const server = http.createServer((req, res) => {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'}).end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({channel: process.env.BLUEPRINT_BROWSER_CHANNEL || undefined, headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 1365, height: 900}});
    const errors = [], external = [];
    let requests = 0;
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', r => { requests++; if (/^https?:/.test(r.url()) && !r.url().startsWith(origin + '/')) external.push(r.url()); });
    await page.goto(origin + '/demo/lost-reply.html');
    const initialRequests = requests;
    assert.equal(await page.locator('#count').innerText(), 'Not checked');
    await page.locator('#save').click();
    assert.equal(await page.locator('#count').innerText(), 'Not checked');
    await page.locator('#read').click();
    assert.equal(await page.locator('#count').innerText(), '1');
    assert.match(await page.locator('#status').innerText(), /No second save/);
    await page.locator('#reset').click();
    await page.locator('#save').click();
    await page.locator('#retry').click();
    assert.equal(await page.locator('#count').innerText(), 'Not checked');
    await page.locator('#read').click();
    assert.equal(await page.locator('#count').innerText(), '2');
    assert.match(await page.locator('#status').innerText(), /two saves/);
    await page.locator('#language').click();
    assert.equal(await page.locator('#count').innerText(), '2');
    assert.equal(await page.locator('#status').innerText(), '回读发现保存了两次。');
    assert.match(await page.locator('#case').getAttribute('href'), /zh-CN/);
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('#reset').click();
    await page.locator('#save').click();
    await page.locator('#read').click();
    assert.equal(await page.locator('#count').innerText(), '1');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(requests, initialRequests, 'Simulation actions must not make network requests');
    await page.reload();
    assert.equal(await page.locator('#count').innerText(), '尚未核对');
    const offline = await browser.newContext({offline: true});
    try {
      const filePage = await offline.newPage();
      await filePage.goto(pathToFileURL(path.join(__dirname, '../demo/lost-reply.html')).href);
      await filePage.locator('#language').click();
      await filePage.locator('#save').click();
      await filePage.locator('#read').click();
      assert.equal(await filePage.locator('#count').innerText(), '1');
      assert.equal(await filePage.locator('#status').innerText(), '回读找到记录，不需要再次保存。');
    } finally { await offline.close(); }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log('Lost-reply simulation: both paths, language, reset, reload, mobile and offline file passed.');
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
