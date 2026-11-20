import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { sourcePaths,readParquet } from './inspect.mjs';
const root=resolve(import.meta.dirname,'..'),out=resolve(root,'public/data');
const [rows,binary,packed,meta,audit,texture]=await Promise.all([readParquet(sourcePaths.map),readFile(resolve(out,'activity.bin')),readFile(resolve(out,'study.bin')),readFile(resolve(out,'activity.json'),'utf8').then(JSON.parse),readFile(resolve(root,'reports/study-audit.json'),'utf8').then(JSON.parse),readFile(resolve(out,'activity.png')).then(b=>PNG.sync.read(b))]);
assert.equal(createHash('sha256').update(await readFile(sourcePaths.map)).digest('hex'),audit.sources.map.sha256);assert.equal(binary.length,rows.length*8);
let total=0,known=0,missing=0,positive=0;const states={},blocks=new Map();
for(let i=0;i<rows.length;i++){const r=rows[i],n=r.CONVERSION_NEXT_2YR_HA,v=binary.readDoubleLE(i*8),col=Number(r.GRID_COL),row=Number(r.GRID_ROW);assert.equal(`Borneo1k_${packed.readInt16LE(i*64)}_${packed.readInt16LE(i*64+2)}`,r.CELL_ID);const p=((row+483)*1080+col+496)*4;const valid=Number.isFinite(n);assert.ok(valid?v===n:Number.isNaN(v));const bin=!valid||n===0?0:n<1?1:n<5?2:n<20?3:4;assert.equal(texture.data[p],bin);assert.equal(texture.data[p+1],valid?255:0);assert.equal(texture.data[p+3],255);if(valid){known++;total+=n;if(n>0)positive++;states[r.STATE]=(states[r.STATE]||0)+n;const key=`${r.STATE}|${r.SPATIAL_BLOCK_ID}`;blocks.set(key,(blocks.get(key)||0)+n);}else missing++;}
assert.equal(known,meta.availableCells);assert.equal(missing,meta.missingCells);assert.equal(positive,meta.positiveCells);assert.equal(total,meta.totalHa);assert.deepEqual(states,meta.stateTotals);
for(const c of meta.callouts){const key=`${c.state}|${c.block}`;assert.equal(c.areaHa,blocks.get(key));const maximum=Math.max(...[...blocks].filter(([key])=>key.startsWith(c.state+'|')).map(([,n])=>n));assert.equal(c.areaHa,maximum);const i=rows.findIndex(r=>r.CELL_ID===c.anchorCellId);assert.equal(c.x,Number(rows[i].GRID_COL)*1000+500);assert.equal(c.y,-Number(rows[i].GRID_ROW)*1000-500);assert.equal(c.longitude,packed.readDoubleLE(i*64+32));assert.equal(c.latitude,packed.readDoubleLE(i*64+40));}
const report={at:new Date().toISOString(),allSourceValuesIdentical:true,allDisplayBinsVerified:true,originalResearchHashUnchanged:true,totalCells:rows.length,known,missing,positive,totalHa:total,stateTotals:states,callouts:meta.callouts.map(({state,block,areaHa,anchorCellId})=>({state,block,areaHa,anchorCellId}))};await writeFile(resolve(root,'reports/activity-checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
