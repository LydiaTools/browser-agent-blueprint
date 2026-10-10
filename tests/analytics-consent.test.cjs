'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
let server;
let browser;
let baseUrl;

test.before(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const requestPath = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
    const file = path.resolve(root, `.${requestPath}`);
    if (!file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, content) => {
      if (error) {
        response.writeHead(404).end();
        return;
      }
      const type = path.extname(file) === '.js' ? 'text/javascript' : 'text/html';
      response.writeHead(200, { 'content-type': `${type}; charset=utf-8` }).end(content);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://lydiatools.github.io:${server.address().port}`;
  const launchOptions = {
    headless: true,
    args: ['--no-proxy-server', '--host-resolver-rules=MAP lydiatools.github.io 127.0.0.1']
  };
  if (process.env.BLUEPRINT_BROWSER_CHANNEL) launchOptions.channel = process.env.BLUEPRINT_BROWSER_CHANNEL;
  browser = await chromium.launch(launchOptions);
});

test.after(async () => {
  await browser?.close();
  await new Promise(resolve => server?.close(resolve));
});

test('analytics waits for consent, keeps fixture content local, and stops after rejection', async () => {
  const context = await browser.newContext();
  const blockedRequests = [];
  await context.route('https://**/*', async route => {
    blockedRequests.push(route.request().url());
    await route.abort();
  });
  const page = await context.newPage();
  const title = 'Synthetic title must remain local 9174';
  const body = 'Synthetic body must remain local 2048';
  await page.goto(`${baseUrl}/demo/fixture.html?utm_source=github&utm_medium=referral&utm_campaign=lydiatools_profile&utm_content=browser_agent_demo&utm_term=private-search&private=omit#private-fragment`);

  assert.equal(await page.locator('#lydia-analytics-consent').isVisible(), true);
  await page.locator('#title').fill(title);
  await page.locator('#body').fill(body);
  await page.getByRole('button', { name: 'Save draft' }).click();
  assert.equal(blockedRequests.length, 0);
  assert.equal(await page.evaluate(() => window.dataLayer === undefined), true);

  await page.getByRole('button', { name: 'Allow analytics' }).click();
  await page.waitForFunction(() => window.__lydiaAnalyticsActive === true);
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.evaluate(() => {
    const link = document.createElement('a');
    link.href = 'https://github.com/LydiaTools/browser-agent-blueprint?token=must-not-be-sent';
    link.addEventListener('click', event => event.preventDefault(), { once: true });
    document.body.append(link);
    link.click();
    link.remove();
  });

  let calls = await page.evaluate(() => window.dataLayer.map(entry => Array.from(entry)));
  const pageView = calls.find(entry => entry[0] === 'event' && entry[1] === 'page_view');
  const verifiedSave = calls.find(entry => entry[0] === 'event' && entry[1] === 'demo_save_verified');
  const githubClick = calls.find(entry => entry[0] === 'event' && entry[1] === 'github_outbound_click');
  assert.ok(pageView);
  assert.equal(pageView[2].page_location, `${baseUrl}/demo/fixture.html?utm_source=github&utm_medium=referral&utm_campaign=lydiatools_profile&utm_content=browser_agent_demo`);
  assert.deepEqual(verifiedSave, ['event', 'demo_save_verified']);
  assert.deepEqual(githubClick, ['event', 'github_outbound_click', { github_path: '/LydiaTools/browser-agent-blueprint' }]);
  assert.equal(JSON.stringify(calls).includes(title), false);
  assert.equal(JSON.stringify(calls).includes(body), false);
  assert.equal(JSON.stringify(calls).includes('must-not-be-sent'), false);
  assert.equal(blockedRequests.length, 1);
  assert.match(blockedRequests[0], /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-M5XZDV1PE7$/);

  await page.getByRole('button', { name: 'Privacy settings' }).click();
  await page.getByRole('button', { name: 'Reject' }).click();
  assert.equal(await page.evaluate(() => window.__lydiaAnalyticsActive), false);
  await page.getByRole('button', { name: 'Save draft' }).click();
  calls = await page.evaluate(() => window.dataLayer.map(entry => Array.from(entry)));
  assert.equal(calls.filter(entry => entry[0] === 'event' && entry[1] === 'demo_save_verified').length, 1);
  await context.close();
});

test('a saved rejection persists across project pages and never loads Google code', async () => {
  const context = await browser.newContext();
  const blockedRequests = [];
  await context.route('https://**/*', async route => {
    blockedRequests.push(route.request().url());
    await route.abort();
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/demo/`);
  await page.getByRole('button', { name: 'Reject' }).click();
  assert.equal(await page.locator('#lydia-analytics-consent').isVisible(), false);
  await page.goto(`${baseUrl}/`);
  assert.equal(await page.locator('#lydia-analytics-consent').isVisible(), false);
  assert.equal(await page.evaluate(() => window.__lydiaAnalyticsActive || false), false);
  assert.equal(blockedRequests.length, 0);
  await context.close();
});
