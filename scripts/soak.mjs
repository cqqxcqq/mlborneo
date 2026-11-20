import { chromium } from 'playwright';
import { mkdir,writeFile,readFile,readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const base=resolve(import.meta.dirname,'..');await mkdir(resolve(base,'reports'),{recursive:true});
const durationMinutes=Number(process.env.SOAK_MINUTES||60),cycleSeconds=Number(process.env.SOAK_CYCLE_SECONDS||20);
if(durationMinutes<60)console.warn('Short diagnostic run: does not satisfy the 60-minute requirement.');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});
let externalRequests=0;await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():(externalRequests++,r.abort()));
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(()=>window.__MLBORNEO__?.ready,{},{timeout:90000});await page.waitForTimeout(1500);
const session=await context.newCDPSession(page);await session.send('Performance.enable');await session.send('HeapProfiler.collectGarbage');
const hashes=async()=>{const out={};for(const dir of['data','assets'])for(const file of await readdir(resolve(base,'dist',dir))){const key=`${dir}/${file}`;out[key]=createHash('sha256').update(await readFile(resolve(base,'dist',key))).digest('hex');}return out;};
const inputHashes=await hashes(),renderer=await page.evaluate(()=>window.__MLBORNEO__.diagnostics?.renderer),samples=[],start=Date.now();let cycles=0;
const metrics=async()=>{const d=await page.evaluate(()=>window.__MLBORNEO__.diagnostics),performance=await session.send('Performance.getMetrics');const m=Object.fromEntries(performance.metrics.map(x=>[x.name,x.value])),t=d?.frameTimes||[];return{elapsedSeconds:(Date.now()-start)/1000,cycle:cycles,geometries:d?.geometries,textures:d?.textures,programs:d?.programs,triangles:d?.triangles,renders:d?.renders,azimuth:d?.camera?.azimuth,recentFPS:t.length>60?(t.length-1)/((t.at(-1)-t[0])/1000):null,jsHeapUsed:m.JSHeapUsedSize,jsHeapTotal:m.JSHeapTotalSize,nodes:m.Nodes,eventListeners:m.JSEventListeners};};
const persist=async(complete=false)=>{const outputHashes=complete?await hashes():null;const report={startedAt:new Date(start).toISOString(),updatedAt:new Date().toISOString(),durationMinutes,elapsedSeconds:(Date.now()-start)/1000,complete,cycles,profile:'two-area choice, both reveals, exploration, quality and flat transitions; sampled in rotating choose stage',viewport:{width:1920,height:1080},browser:browser.version(),renderer,externalRequests,errors,inputHashes,resourcesUnchanged:outputHashes?JSON.stringify(inputHashes)===JSON.stringify(outputHashes):null,samples};await writeFile(resolve(base,'reports/soak.json'),JSON.stringify(report,null,2));};
samples.push(await metrics());await persist();console.log(`Soak started at ${new Date(start).toISOString()} for ${durationMinutes} minutes.`);
try{
 while(Date.now()-start<durationMinutes*60000){const began=Date.now();cycles++;
  await page.getByRole('button',{name:cycles%2?'Choose area A':'Choose area B',exact:true}).click();
  await page.getByRole('button',{name:'Reveal observed change'}).click();
  await page.getByRole('button',{name:'Explore map',exact:true}).click();
  await page.locator('main').focus();await page.keyboard.press('p');await page.keyboard.press('c');
  if(cycles%9===0){for(let i=0;i<3;i++)await page.keyboard.press('+');await page.waitForTimeout(350);await page.keyboard.press('r');}
  if(cycles%15===0){await page.keyboard.press('m');await page.waitForFunction(()=>window.__MLBORNEO__?.layers?.flat&&window.__MLBORNEO__?.ready);await page.keyboard.press('m');await page.waitForFunction(()=>!window.__MLBORNEO__?.layers?.flat&&window.__MLBORNEO__?.ready);}
  if(cycles%12===0){await page.keyboard.press('l');await page.waitForTimeout(900);await page.keyboard.press('l');await page.waitForTimeout(900);}
  await page.getByRole('button',{name:'Try the two-area choice again'}).click();await page.waitForTimeout(250);if(cycles%3===0){samples.push(await metrics());await persist();console.log(`Soak ${(Date.now()-start)/60000|0} min; cycle ${cycles}; geometry ${samples.at(-1).geometries}, textures ${samples.at(-1).textures}`);}
  const remaining=Math.min(cycleSeconds*1000-(Date.now()-began),durationMinutes*60000-(Date.now()-start));if(remaining>0)await page.waitForTimeout(remaining);
 }
 await session.send('HeapProfiler.collectGarbage');samples.push({...await metrics(),afterForcedGC:true});await persist(true);console.log(`Soak complete: ${cycles} cycles, ${(Date.now()-start)/1000}s, ${errors.length} page errors.`);
}catch(e){errors.push(e.stack);await persist(false);throw e;}finally{await context.close();await browser.close();}
