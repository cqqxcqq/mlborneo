import {chromium} from 'playwright';
import {readFile,stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),directory=resolve(root,'release/portable-check-20261027');
const manifest=JSON.parse(await readFile(resolve(directory,'build-manifest.json'),'utf8'));
const packageJson=JSON.parse(await readFile(resolve(directory,'package.json'),'utf8'));
assert.equal(packageJson.dependencies,undefined);assert.equal(await stat(resolve(directory,'node_modules')).then(()=>true,()=>false),false);
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']}),context=await browser.newContext({viewport:{width:1920,height:1080}}),p=await context.newPage(),errors=[];let externalRequests=0;
await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
p.on('pageerror',e=>errors.push(e.message));
const ready=mode=>p.waitForFunction(m=>window.__MLBORNEO__?.ready&&window.__MLBORNEO__.viewMode===m,mode,{timeout:90000});
await p.goto('http://127.0.0.1:4174/');await ready('overview');
let resources=0;
for(const[name,value]of Object.entries(manifest.files).filter(([name])=>name.startsWith('dist/'))){const response=await context.request.get(`http://127.0.0.1:4174/${name.slice(5)}`);assert.equal(response.status(),200,name);const data=await response.body();assert.equal(createHash('sha256').update(data).digest('hex'),value.sha256,name);resources++;}
await p.getByRole('button',{name:'Surprise me',exact:true}).click();await ready('forest');await p.waitForTimeout(200);assert.ok(await p.evaluate(()=>window.__MLBORNEO__.forest.treeCount>0));assert.equal(externalRequests,0);assert.deepEqual(errors,[]);
await browser.close();const inputHashes=Object.fromEntries(Object.entries(manifest.files).filter(([name])=>name.startsWith('dist/')).map(([name,value])=>[name.slice(5),value.sha256]));const report={at:new Date().toISOString(),directory:'release/portable-check-20261027',dependenciesRequired:false,allServedResourceHashesMatch:true,resources,offlineBrowserFlow:'overview → cell → forest',externalRequests,errors,pass:true,inputHashes};await writeFile(resolve(root,'reports/portable-check.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,inputHashes:undefined},null,2));

