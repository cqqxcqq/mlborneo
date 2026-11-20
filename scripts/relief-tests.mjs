import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),shots=resolve(root,'.impeccable/review/relief');await mkdir(shots,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],samples=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>window.__MLBORNEO__?.ready);await page.waitForTimeout(600);
const key=async k=>{await page.locator('main').focus();await page.keyboard.press(k);await page.waitForTimeout(200);};
await key('Space');await key('r');await page.screenshot({path:resolve(shots,'default.png')});
for(let i=1;i<=3;i++){await page.mouse.move(450,500);await page.mouse.down();await page.mouse.move(450+1080/.35/4,500,{steps:40});await page.mouse.up();await page.waitForTimeout(150);await page.screenshot({path:resolve(shots,`quarter-${i}.png`)});}
await key('r');await key('Space');
for(let i=0;i<8;i++){
 await key('l');await page.waitForTimeout(1100);await key('l');await page.waitForTimeout(1100);
 const d=await page.evaluate(()=>window.__MLBORNEO__.diagnostics);samples.push({cycle:i+1,geometries:d.geometries,textures:d.textures,programs:d.programs,triangles:d.triangles});
}
assert.ok(samples.every(s=>s.geometries===samples[0].geometries&&s.textures===samples[0].textures&&s.programs===samples[0].programs),'Resources did not return to a stable count after quality switches');
const g=JSON.parse(await readFile(resolve(root,'public/data/display-scope.json'),'utf8'));
let wallTriangles=0;for(const f of g.features.filter(f=>f.kind==='land'))for(const ring of f.rings)for(let j=0;j<ring.length;j++){const a=ring[j],b=ring[(j+1)%ring.length];wallTriangles+=2*Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1500);}
const report={at:new Date().toISOString(),purpose:'Physical terrain shell and static single-light shadow',samples,stableAfterEightQualityRoundTrips:true,wallTriangles,initialSurfaceTriangles:131072,initialTrianglesWithPlinth:131072+wallTriangles+4,detailedTrianglesWithPlinth:524288+wallTriangles+4,errors,longRunTest:false};
await browser.close();await writeFile(resolve(root,'reports/browser-relief.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));assert.equal(errors.length,0);
