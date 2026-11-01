import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import http from 'node:http';
import os from 'node:os';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// These are optional external packages, installed outside this repository.
const deps = process.env.DEVTOOLS_DEPS_DIR;
const chrome = process.env.DEVTOOLS_CHROME;
const tempParent = process.env.DEVTOOLS_TEST_DIR || os.tmpdir();
if (!deps || !isAbsolute(deps) || !chrome || !isAbsolute(chrome) || !isAbsolute(tempParent)) {
  throw new Error('Set absolute DEVTOOLS_DEPS_DIR and DEVTOOLS_CHROME; DEVTOOLS_TEST_DIR, if set, must also be absolute.');
}
const packagePath = join(deps, 'node_modules/chrome-devtools-mcp/package.json');
const packageInfo = JSON.parse(await readFile(packagePath, 'utf8'));
if (packageInfo.version !== '1.12.0') throw new Error('Install the pinned chrome-devtools-mcp@1.12.0 as documented.');
const sdkInfo = JSON.parse(await readFile(join(deps, 'node_modules/@modelcontextprotocol/sdk/package.json'), 'utf8'));
if (sdkInfo.version !== '1.32.2') throw new Error('Install the pinned @modelcontextprotocol/sdk@1.32.2 as documented.');
const requireFromDeps = createRequire(join(deps, 'package.json'));
const { Client } = await import(pathToFileURL(requireFromDeps.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
const { StdioClientTransport } = await import(pathToFileURL(requireFromDeps.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
const browserVersion = execFileSync(chrome, ['--version'], {encoding:'utf8', timeout:5000}).trim();
const root = await mkdtemp(join(tempParent, 'blueprint-devtools-'));
const clients = [];
const server = http.createServer((req, res) => {
  if (req.url === '/state') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({cookie:req.headers.cookie ?? ''}));
  } else {
    res.setHeader('content-type', 'text/html');
    res.end('<!doctype html><title>Synthetic isolation fixture</title><h1>Synthetic isolation fixture</h1>');
  }
});
let listening = false;
try {
  await new Promise((resolve, reject) => {server.once('error', reject); server.listen(0, '127.0.0.1', resolve);});
  listening = true;
  const url = `http://127.0.0.1:${server.address().port}/`;
  const cli = join(deps, 'node_modules/chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js');
  async function connect(profile) {
    const env = {...process.env, CHROME_DEVTOOLS_MCP_NO_CONFIG_DISCOVERY:'1'};
    const transport = new StdioClientTransport({command:process.execPath,args:[cli,'--headless','--no-usage-statistics','--no-performance-crux','--executablePath='+chrome,'--userDataDir='+profile],env,stderr:'pipe'});
    // Drain server diagnostics without logging paths, environment, or page data.
    transport.stderr?.resume();
    const client = new Client({name:'blueprint-disposable-isolation',version:'0.1.0'});
    clients.push(client);
    await client.connect(transport);
    return client;
  }
  async function open(client) {
    const result = await client.callTool({name:'new_page',arguments:{url}},undefined,{timeout:20000});
    const text = result.content?.map((part)=>part.text ?? '').join('\n') ?? '';
    if (result.isError) return {error:text};
    const match = text.match(/(?:^|\n)(\d+):[^\n]*\[selected\]/);
    if (!match) throw new Error('Could not identify the selected synthetic page.');
    return {pageId:Number(match[1])};
  }
  async function evaluate(client, pageId, fn) {
    const result = await client.callTool({name:'evaluate_script',arguments:{pageId,function:fn}},undefined,{timeout:10000});
    if (result.isError) throw new Error('MCP evaluation failed.');
    const text = result.content?.map((part)=>part.text ?? '').join('\n') ?? '';
    const match = text.match(/```json\n([\s\S]*?)\n```/);
    if (!match) throw new Error('MCP evaluation did not return JSON.');
    return JSON.parse(match[1]);
  }
  const profileA = join(root, 'profile-a');
  const a = await connect(profileA);
  const pageA = await open(a);
  assert.ok(pageA.pageId, 'The first disposable browser must launch.');
  const setA = await evaluate(a,pageA.pageId,"async () => { document.cookie='role=agent_a;path=/'; localStorage.setItem('role','agent_a'); return {local:localStorage.getItem('role'),server:(await (await fetch('/state')).json()).cookie}; }");
  assert.deepEqual(setA,{local:'agent_a',server:'role=agent_a'});
  const conflict = await connect(profileA);
  const same = await open(conflict);
  assert.ok(same.error && /browser is already running/i.test(same.error), 'Expected a locked-profile error, not a different startup failure.');
  const b = await connect(join(root, 'profile-b'));
  const pageB = await open(b);
  assert.ok(pageB.pageId, 'The second disposable browser must launch.');
  const beforeB = await evaluate(b,pageB.pageId,"async () => ({local:localStorage.getItem('role'),server:(await (await fetch('/state')).json()).cookie})");
  assert.deepEqual(beforeB,{local:null,server:''});
  const setB = await evaluate(b,pageB.pageId,"async () => { document.cookie='role=agent_b;path=/'; localStorage.setItem('role','agent_b'); return {local:localStorage.getItem('role'),server:(await (await fetch('/state')).json()).cookie}; }");
  assert.deepEqual(setB,{local:'agent_b',server:'role=agent_b'});
  const afterA = await evaluate(a,pageA.pageId,"async () => ({local:localStorage.getItem('role'),server:(await (await fetch('/state')).json()).cookie})");
  assert.deepEqual(afterA,setA);
  console.log(JSON.stringify({adapter:'chrome-devtools-mcp 1.12.0',browser:browserVersion,profile_conflict:'second launch rejected: browser already running',separate_profiles:{first:setA,second_before:beforeB,second_after:setB,first_after:afterA},fixture:'synthetic loopback; no real accounts'},null,2));
} finally {
  await Promise.allSettled(clients.map((client)=>client.close()));
  if (listening) await new Promise((resolve)=>server.close(resolve));
  await rm(root,{recursive:true,force:true});
}
