import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const p=await browser.newPage({viewport:{width:1920,height:1080}}),report={at:new Date().toISOString(),checks:[],errors:[]};
p.on('pageerror',e=>report.errors.push(e.message));
const ready=mode=>p.waitForFunction(m=>window.__MLBORNEO__?.ready&&window.__MLBORNEO__.viewMode===m,mode,{timeout:90000});
const snap=()=>p.evaluate(()=>JSON.parse(JSON.stringify(window.__MLBORNEO__)));
const tabTo=async(text)=>{for(let i=0;i<30;i++){if(await p.evaluate(t=>document.activeElement?.textContent?.trim()===t||document.activeElement?.getAttribute('aria-label')===t,text))return;await p.keyboard.press('Tab');}throw Error(`Tab did not reach ${text}`);};
const test=async(name,fn)=>{try{report.checks.push({name,pass:true,value:await fn()});console.log('PASS',name);}catch(e){report.checks.push({name,pass:false,error:e.message});console.log('FAIL',name,e.message);}};
await p.goto('http://127.0.0.1:4173/');await ready('overview');
await test('keyboard-only lookup zoom forest and layered Escape with focus return',async()=>{
 await p.locator('main').focus();await tabTo('Find a cell');await p.keyboard.press('Enter');await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.id),'grid-query');await p.keyboard.type('Borneo1k_277_-277');await p.keyboard.press('Enter');await tabTo('Zoom to cell');await p.keyboard.press('Enter');await ready('cell');assert.equal((await snap()).layers.rotating,false);await tabTo('Enter forest illustration');await p.keyboard.press('Enter');await ready('forest');assert.equal((await snap()).diagnostics.camera.position[1],1.65);
 await tabTo('Move forward');await p.keyboard.down('Enter');await p.waitForTimeout(700);await p.keyboard.up('Enter');await p.waitForTimeout(150);const position=(await snap()).forest.position;assert.ok(Math.hypot(...position)>.1);await p.waitForTimeout(250);assert.deepEqual((await snap()).forest.position,position);
 await p.keyboard.press('Escape');await ready('cell');assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Enter forest illustration');await p.keyboard.press('Escape');await ready('overview');assert.equal(await p.evaluate(()=>document.activeElement.textContent),'Zoom to cell');assert.equal((await snap()).selection,'Borneo1k_277_-277');assert.equal((await snap()).layers.rotating,true);
});
await test('arrow-key walking, release and hidden-document stop',async()=>{
 await p.keyboard.press('Enter');await ready('cell');await tabTo('Enter forest illustration');await p.keyboard.press('Enter');await ready('forest');await p.locator('canvas').focus();await p.keyboard.down('ArrowRight');await p.waitForTimeout(700);await p.keyboard.up('ArrowRight');await p.waitForTimeout(150);assert.ok((await snap()).forest.position[0]>.1);
 await p.keyboard.down('ArrowUp');await p.waitForTimeout(200);await p.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});await p.waitForTimeout(150);const at=(await snap()).forest.position;await p.waitForTimeout(400);assert.deepEqual((await snap()).forest.position,at);await p.keyboard.up('ArrowUp');await p.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await p.waitForTimeout(250);assert.deepEqual((await snap()).forest.position,at);
});
await browser.close();await writeFile('reports/browser-forest-input.json',JSON.stringify(report,null,2));if(report.checks.some(c=>!c.pass)||report.errors.length)process.exitCode=1;
