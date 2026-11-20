import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),shots=resolve(root,'.impeccable/review/map-only');await mkdir(shots,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
const result={at:new Date().toISOString(),checks:[],viewports:[],performance:[],errors:[],externalRequests:0};
await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(result.externalRequests++,r.abort()));
const p=await context.newPage();p.on('pageerror',e=>result.errors.push(e.message));
const ready=async(page=p)=>page.waitForFunction(()=>window.__MLBORNEO__?.ready,{},{timeout:90000});
const settle=async()=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const key=async k=>{await p.locator('main').focus();await p.keyboard.press(k);await settle();};
const camera=()=>p.evaluate(()=>{const c=window.__MLBORNEO__.diagnostics.camera;return{position:c.position,zoom:c.zoom,target:c.target,polar:c.polar,azimuth:c.azimuth};});
const test=async(name,fn)=>{try{const value=await fn();result.checks.push({name,pass:true,value});console.log('PASS',name);}catch(e){result.checks.push({name,pass:false,error:e.message});console.log('FAIL',name,e.message);}};
for(const[width,height,name]of[[1920,1080,'desktop'],[3840,2160,'4k'],[1366,768,'laptop'],[390,844,'mobile']]){
 await p.setViewportSize({width,height});await p.goto('http://127.0.0.1:4173/');await ready();await p.waitForTimeout(350);
 const layout=await p.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),text:document.body.innerText,controls:document.querySelectorAll('button,input,select,aside,header,footer,h1').length}));
 await p.screenshot({path:resolve(shots,`${name}.png`),fullPage:true});result.viewports.push({width,height,name,layout});
 await test(`map fills ${width}×${height}`,()=>{assert.equal(layout.canvas.x,0);assert.equal(layout.canvas.y,0);assert.equal(layout.canvas.width,width);assert.equal(layout.canvas.height,height);assert.equal(layout.scrollWidth,width);assert.equal(layout.scrollHeight,height);assert.equal(layout.controls,0);assert.ok(!/KALIMANTAN|Research grid|Forest cover|Monitoring priority|MLBorneo/.test(layout.text));});
}
await p.setViewportSize({width:1920,height:1080});await p.goto('http://127.0.0.1:4173/');await ready();await settle();const initial=await camera();
await test('keyboard layers preserve camera',async()=>{for(const k of['f','p','f','p']){await key(k);assert.deepEqual(await camera(),initial);}});
await test('real click still identifies frozen Sabah cell',async()=>{const c=await p.evaluate(()=>window.__MLBORNEO__.diagnostics.camera.samples.sabah);await p.mouse.click(c.x,c.y);await settle();const id=await p.evaluate(()=>window.__MLBORNEO__.selection);assert.ok(id?.startsWith('Borneo1k_'));return id;});
await test('closed-loop drag does not select',async()=>{const id=await p.evaluate(()=>window.__MLBORNEO__.selection);await p.mouse.move(960,540);await p.mouse.down();await p.mouse.move(1080,620,{steps:20});await p.mouse.move(960,540,{steps:20});await p.mouse.up();await settle();assert.equal(await p.evaluate(()=>window.__MLBORNEO__.selection),id);});
await test('reset and zoom bounds',async()=>{await key('r');assert.deepEqual(await camera(),initial);for(let i=0;i<12;i++)await key('+');assert.ok(Math.abs((await camera()).zoom/initial.zoom-3)<1e-8);for(let i=0;i<20;i++)await key('-');assert.ok(Math.abs((await camera()).zoom/initial.zoom-.8)<1e-8);await key('r');});
await test('on-demand rendering remains still',async()=>{await p.waitForTimeout(600);const before=await p.evaluate(()=>window.__MLBORNEO__.diagnostics.renders);await p.waitForTimeout(1800);assert.equal(await p.evaluate(()=>window.__MLBORNEO__.diagnostics.renders),before);});
for(const low of[false,true]){if(low){await key('l');await p.waitForTimeout(1000);}await key('r');const before=await p.evaluate(()=>window.__MLBORNEO__.diagnostics.renders),start=performance.now();await p.mouse.move(960,540);await p.mouse.down();for(let i=0;i<360;i++)await p.mouse.move(960+Math.sin(i/20)*90,540+Math.cos(i/20)*50);await p.mouse.up();await settle();const ms=performance.now()-start,d=await p.evaluate(()=>window.__MLBORNEO__.diagnostics);result.performance.push({profile:low?'low':'desktop',elapsedMs:ms,renderedFrames:d.renders-before,fps:(d.renders-before)/(ms/1000),renderer:d.renderer,triangles:d.triangles,geometries:d.geometries,textures:d.textures});}
await test('flat view retains scoped geography',async()=>{await key('m');await ready();await p.getByTestId('flat-map').waitFor();assert.equal(await p.getByText('KALIMANTAN',{exact:true}).count(),0);await key('f');await key('p');await key('m');await ready();});
await test('offline empty-cache reload',async()=>{const cdp=await context.newCDPSession(p);await cdp.send('Network.clearBrowserCache');await p.reload();await ready();assert.equal(result.externalRequests,0);});
await test('missing elevation uses flat view',async()=>{const q=await context.newPage();await q.route('**/terrain.bin',r=>r.abort());await q.goto('http://127.0.0.1:4173/');await ready(q);await q.getByTestId('flat-map').waitFor();await q.close();});
await test('WebGL unavailable uses flat view',async()=>{const q=await context.newPage();await q.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return String(kind).startsWith('webgl')?null:get.call(this,kind,...args);};});await q.goto('http://127.0.0.1:4173/');await ready(q);await q.getByTestId('flat-map').waitFor();await q.close();});
await context.close();await browser.close();await writeFile(resolve(root,'reports/browser-map-only.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({checks:result.checks,performance:result.performance,errors:result.errors},null,2));if(result.checks.some(c=>!c.pass))process.exitCode=1;
