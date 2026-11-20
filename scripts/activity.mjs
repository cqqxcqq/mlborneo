import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { readParquet,sourcePaths } from './inspect.mjs';
const root=resolve(import.meta.dirname,'..');
export async function prepareActivity(outDir=resolve(root,'public/data'),reportDir=resolve(root,'reports')){
 const [rows,packed,meta]=await Promise.all([readParquet(sourcePaths.map),readFile(resolve(outDir,'study.bin')),readFile(resolve(outDir,'study-meta.json'),'utf8').then(JSON.parse)]);
 const binary=Buffer.alloc(rows.length*8),g=meta.grid,png=new PNG({width:g.width,height:g.height});
 const blocks=new Map(),stateTotals={},stateAvailable={},distribution=[0,0,0,0,0];let available=0,missing=0,total=0,eligibleTotal=0,positive=0,maxCell=0;
 for(let i=0;i<rows.length;i++){
  const r=rows[i],col=Number(r.GRID_COL),row=Number(r.GRID_ROW),n=r.CONVERSION_NEXT_2YR_HA;
  assert.equal(`Borneo1k_${packed.readInt16LE(i*64)}_${packed.readInt16LE(i*64+2)}`,r.CELL_ID);
  assert.equal(Number.isFinite(n),r.MODEL_ROW_PRESENT);
  const known=Number.isFinite(n);binary.writeDoubleLE(known?n:NaN,i*8);const p=((row-g.minRow)*g.width+col-g.minCol)*4;
  const bin=!known||n===0?0:n<1?1:n<5?2:n<20?3:4;png.data[p]=bin;png.data[p+1]=known?255:0;png.data[p+3]=255;
  if(!known){missing++;continue;}
  assert.ok(n>=0&&n<=r.FOREST_AT_RISK_HA+1e-8);available++;total+=n;if(r.ELIGIBLE_2018)eligibleTotal+=n;if(n>0)positive++;maxCell=Math.max(maxCell,n);distribution[bin]++;
  stateTotals[r.STATE]=(stateTotals[r.STATE]||0)+n;stateAvailable[r.STATE]=(stateAvailable[r.STATE]||0)+1;
  const key=`${r.STATE}|${r.SPATIAL_BLOCK_ID}`;if(!blocks.has(key))blocks.set(key,{state:r.STATE,block:r.SPATIAL_BLOCK_ID,areaHa:0,knownCells:0,cells:[],peak:null});
  const b=blocks.get(key);b.areaHa+=n;b.knownCells++;b.cells.push([col,row]);if(!b.peak||n>b.peak.CONVERSION_NEXT_2YR_HA)b.peak=r;
 }
 const callouts=['Sabah','Sarawak'].map(state=>{
  const b=[...blocks.values()].filter(b=>b.state===state).sort((a,c)=>c.areaHa-a.areaHa)[0],peak=b.peak,set=new Set(b.cells.map(([c,r])=>`${c},${r}`)),outline=[];
  for(const[c,r]of b.cells){const x=c*1000,y=-r*1000;if(!set.has(`${c-1},${r}`))outline.push([x,y,x,y-1000]);if(!set.has(`${c+1},${r}`))outline.push([x+1000,y,x+1000,y-1000]);if(!set.has(`${c},${r-1}`))outline.push([x,y,x+1000,y]);if(!set.has(`${c},${r+1}`))outline.push([x,y-1000,x+1000,y-1000]);}
  const index=rows.indexOf(peak);return{state:b.state,block:b.block,areaHa:b.areaHa,knownCells:b.knownCells,anchorCellId:peak.CELL_ID,x:Number(peak.GRID_COL)*1000+500,y:-Number(peak.GRID_ROW)*1000-500,longitude:packed.readDoubleLE(index*64+32),latitude:packed.readDoubleLE(index*64+40),outline};
 });
 for(let i=0;i<rows.length;i++){const actual=binary.readDoubleLE(i*8),n=rows[i].CONVERSION_NEXT_2YR_HA;assert.ok(Number.isFinite(n)?actual===n:Number.isNaN(actual));}
 const activity={type:'Observed permanent forest conversion',period:[2019,2020],baselineYear:2018,sourceColumn:'CONVERSION_NEXT_2YR_HA',source:'04_final_figure_package_v2_editorial/source_tables/final_map_source_2018.parquet',count:rows.length,availableCells:available,missingCells:missing,positiveCells:positive,totalHa:total,eligibleOnlyTotalHa:eligibleTotal,maxCellHa:maxCell,stateTotals,stateAvailable,distribution,bins:[{lower:0,upper:1,label:'<1 ha',colour:'#DAC9AA'},{lower:1,upper:5,label:'1–5 ha',colour:'#CFA16C'},{lower:5,upper:20,label:'5–20 ha',colour:'#B9713F'},{lower:20,upper:null,label:'≥20 ha',colour:'#9E472D'}],callouts,interpretation:'Recorded two-year permanent forest conversion in available 2018 study rows, including rows below the model eligibility threshold. This is an observed outcome, not predicted priority, loss probability, a live event feed, or evidence of a specific cause. Missing outcomes remain missing. Brunei is geographic context only. Callouts show the largest observed-conversion 50km study block within each state, with anchors on actual source cells; block sums are not point event amounts.'};
 await mkdir(reportDir,{recursive:true});await writeFile(resolve(outDir,'activity.bin'),binary);await writeFile(resolve(outDir,'activity.png'),PNG.sync.write(png));await writeFile(resolve(outDir,'activity.json'),JSON.stringify(activity));await writeFile(resolve(reportDir,'activity-audit.json'),JSON.stringify({...activity,allPackedValuesMatchSource:true},null,2));
 console.log(`Observed conversion: ${available} available / ${missing} missing cells; ${total} ha in2019–2020; all values checked.`);return activity;
}
if(process.argv[1]?.endsWith('activity.mjs'))await prepareActivity();
