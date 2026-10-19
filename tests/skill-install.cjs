'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),cli=process.env.BLUEPRINT_SKILLS_CLI;
if(!cli||!fs.existsSync(cli))throw new Error('Set BLUEPRINT_SKILLS_CLI to the reviewed skills@1.7.4 bin/cli.mjs.');
const base=fs.mkdtempSync(path.join(process.env.BLUEPRINT_SKILL_TEST_ROOT||os.tmpdir(),'blueprint-installer-'));
const env={...process.env,DISABLE_TELEMETRY:'1'};
function files(dir,prefix=''){return fs.readdirSync(path.join(dir,prefix),{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(dir,path.join(prefix,e.name)):[path.join(prefix,e.name)]).sort();}
try {
 const listed=execFileSync(process.execPath,[cli,'add',root,'--list'],{cwd:base,env,timeout:45000}).toString();assert.match(listed,/browser-task-recovery/);
 const output=execFileSync(process.execPath,[cli,'add',root,'--skill','browser-task-recovery','--agent','codex','--copy','--yes'],{cwd:base,env,timeout:45000}).toString();assert.match(output,/Installed 1 skill/);
 const source=path.join(root,'skills/browser-task-recovery'),installed=path.join(base,'.agents/skills/browser-task-recovery');assert.deepEqual(files(installed),files(source));
 for(const f of files(source)){assert.equal(fs.lstatSync(path.join(installed,f)).isSymbolicLink(),false);assert.deepEqual(fs.readFileSync(path.join(installed,f)),fs.readFileSync(path.join(source,f)),f);}
 const actual=execFileSync(process.execPath,[path.join(installed,'scripts/assemble.cjs'),'content'],{cwd:base});const expected=execFileSync(process.execPath,['scripts/assemble.cjs','content','--stdout'],{cwd:root});assert.deepEqual(actual,expected);
 const result={captured_at:new Date().toISOString(),installer:'skills@1.7.4',source:'local working tree',agent_target:'codex',scope:'isolated project',method:'copy',files:files(installed).length,exact_resource_parity:true,installed_helper_matches_cli:true,telemetry:'disabled; no directory-install count claimed',live_agent_selection:'not tested',global_configuration:'not changed'};
 const out=path.join(root,'runs/skill-install-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
} finally {fs.rmSync(base,{recursive:true,force:true});}
