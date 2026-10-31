'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { chromium } = require('playwright');

// Entire experiment uses a new browser and synthetic values on a loopback server.
async function runExperiment() {
  const server = http.createServer((req, res) => {
    if (req.url === '/whoami') {
      const cookie = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('demo_role='));
      res.writeHead(200, {'content-type':'application/json','cache-control':'no-store'});
      return res.end(JSON.stringify({role:cookie ? cookie.slice('demo_role='.length) : null}));
    }
    if (req.url === '/') {
      res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      return res.end('<!doctype html><title>Disposable session fixture</title><h1>Local synthetic fixture</h1>');
    }
    res.writeHead(404);res.end();
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({headless:true,...(process.env.BLUEPRINT_BROWSER_CHANNEL?{channel:process.env.BLUEPRINT_BROWSER_CHANNEL}:{})});
    const shared = await browser.newContext(), separate = await browser.newContext();
    for (const context of [shared,separate]) await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      return url.origin===origin?route.continue():route.abort();
    });
    const pageA=await shared.newPage(), pageB=await shared.newPage(), pageC=await separate.newPage();
    await Promise.all([pageA.goto(origin),pageB.goto(origin),pageC.goto(origin)]);
    const writeRole = (page,role)=>page.evaluate(role=>{
      document.cookie=`demo_role=${role}; path=/; SameSite=Strict`;
      localStorage.setItem('demo_role',role);
    },role);
    const readRole = page=>page.evaluate(async()=>({
      localStorage:localStorage.getItem('demo_role'),
      server:(await (await fetch('/whoami',{cache:'no-store'})).json()).role
    }));

    await writeRole(pageA,'agent_a');
    const sameContextBefore=await readRole(pageB), separateBefore=await readRole(pageC);
    assert.deepEqual(sameContextBefore,{localStorage:'agent_a',server:'agent_a'});
    assert.deepEqual(separateBefore,{localStorage:null,server:null});
    await writeRole(pageC,'agent_c');
    const sameContextAfter=await readRole(pageA), separateAfter=await readRole(pageC);
    assert.deepEqual(sameContextAfter,{localStorage:'agent_a',server:'agent_a'});
    assert.deepEqual(separateAfter,{localStorage:'agent_c',server:'agent_c'});

    return {status:'passed',fixture:'synthetic loopback HTTP origin',observations:{
      same_context_second_tab:sameContextBefore,
      separate_context_before:separateBefore,
      original_after_separate_write:sameContextAfter,
      separate_context_after:separateAfter
    },scope:'Local Playwright Chromium contexts only; no real accounts, named browser agents, remote browser adapters, or production sites tested.'};
  } finally {
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
if(require.main===module)runExperiment().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
module.exports={runExperiment};
