import {chromium} from 'playwright';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),minutes=Number(process.env.SOAK_MINUTES||60),cycleMs=30000;
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage(),errors=[];let externalRequests=0;
await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const ready=mode=>page.waitForFunction(m=>window.__MLBORNEO__?.ready&&window.__MLBORNEO__.viewMode===m,mode,{timeout:90000});
const hashes=async()=>{const result={};const walk=async(dir,prefix='')=>{for(const entry of(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const key=prefix+entry.name;if(entry.isDirectory())await walk(resolve(dir,entry.name),key+'/');else result[key]=createHash('sha256').update(await readFile(resolve(dir,entry.name))).digest('hex');}};await walk(resolve(root,'dist'));return result;};
await page.goto('http://127.0.0.1:4173/');await ready('overview');await page.getByRole('button',{name:/Explore a forest|Another area/,exact:true}).click();await ready('forest');await page.waitForTimeout(500);
const session=await context.newCDPSession(page);await session.send('Performance.enable');await session.send('HeapProfiler.collectGarbage');
const debug=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2'),e=gl.getExtension('WEBGL_debug_renderer_info');return e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
const inputHashes=await hashes(),start=Date.now(),samples=[];let cycles=0;
const sample=async(afterGC=false)=>{const d=await page.evaluate(()=>window.__MLBORNEO__.diagnostics),performance=await session.send('Performance.getMetrics'),m=Object.fromEntries(performance.metrics.map(x=>[x.name,x.value]));return{elapsedSeconds:(Date.now()-start)/1000,cycles,afterForcedGC:afterGC,geometries:d.geometries,textures:d.textures,programs:d.programs,triangles:d.triangles,calls:d.calls,heap:m.JSHeapUsedSize,nodes:m.Nodes,eventListeners:m.JSEventListeners};};
const persist=async(complete=false)=>{const output=complete?await hashes():null;await writeFile(resolve(root,'reports/forest-soak.json'),JSON.stringify({startedAt:new Date(start).toISOString(),updatedAt:new Date().toISOString(),targetMinutes:minutes,elapsedSeconds:(Date.now()-start)/1000,complete,cycles,profile:'1920x1080 forest walking, drag look and direct overview/forest returns; every tenth cycle uses Surprise me',renderer:debug,externalRequests,errors,inputHashes,resourcesUnchanged:output?JSON.stringify(inputHashes)===JSON.stringify(output):null,samples},null,2));};
samples.push(await sample(true));await persist();console.log(`Forest soak started ${new Date(start).toISOString()}, target ${minutes} minutes.`);
try{while(Date.now()-start<minutes*60000){const began=Date.now();cycles++;
 await page.locator('canvas').focus();await page.keyboard.down(cycles%2?'w':'d');await page.waitForTimeout(8000);await page.keyboard.up(cycles%2?'w':'d');await page.mouse.move(900,450);await page.mouse.down();await page.mouse.move(1050,480,{steps:15});await page.mouse.up();
 await page.getByRole('button',{name:'Back to map',exact:true}).click();await ready('overview');
 if(cycles%10===0)await page.getByRole('button',{name:/Explore a forest|Another area/,exact:true}).click();
 else await page.getByRole('button',{name:'Enter forest illustration',exact:true}).click();
 await ready('forest');await page.waitForTimeout(250);
 if(cycles%2===0){samples.push(await sample());await persist();console.log(`Forest soak ${Math.floor((Date.now()-start)/60000)} min, ${cycles} cycles, g=${samples.at(-1).geometries}, t=${samples.at(-1).textures}`);}
 const remaining=Math.min(cycleMs-(Date.now()-began),minutes*60000-(Date.now()-start));if(remaining>0)await page.waitForTimeout(remaining);
}await session.send('HeapProfiler.collectGarbage');samples.push(await sample(true));await persist(true);console.log(`Forest soak complete: ${cycles} cycles, ${errors.length} errors.`);
}catch(e){errors.push(e.stack);await persist(false);throw e;}finally{await context.close();await browser.close();}
