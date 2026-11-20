import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {readParquet,sourcePaths} from './inspect.mjs';
const root=resolve(import.meta.dirname,'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function prepareExperience(check=false){
 const [rows,packed,outcomes,source,registry]=await Promise.all([readParquet(sourcePaths.map),readFile(resolve(root,'public/data/study.bin')),readFile(resolve(root,'public/data/activity.bin')),readFile(sourcePaths.map),readFile(sourcePaths.registry)]);
 const index=new Map();for(let i=0;i<packed.length/64;i++)index.set(`Borneo1k_${packed.readInt16LE(i*64)}_${packed.readInt16LE(i*64+2)}`,i);
 const cases=['B50_-5_1','B50_2_0'].map((block,k)=>{
  const members=rows.filter(r=>r.SPATIAL_BLOCK_ID===block&&r.STATE==='Sarawak'&&r.MAP_DATA_STATUS==='ELIGIBLE_PREDICTED');
  assert.ok(members.length>500);let risk=0,allocated=0,converted=0,x=0,y=0;
  const cells=members.map(r=>{const i=index.get(r.CELL_ID);assert.notEqual(i,undefined);const o=i*64;assert.equal(packed[o+5],0);assert.equal(packed.readDoubleLE(o+8),r.FOREST_AT_RISK_HA);assert.equal(packed.readDoubleLE(o+56),r.WARNING_SELECTED_AREA_HA);assert.equal(outcomes.readDoubleLE(i*8),r.CONVERSION_NEXT_2YR_HA);assert.ok(Number.isFinite(r.CONVERSION_NEXT_2YR_HA));risk+=r.FOREST_AT_RISK_HA;allocated+=r.WARNING_SELECTED_AREA_HA;converted+=r.CONVERSION_NEXT_2YR_HA;const col=packed.readInt16LE(o),row=packed.readInt16LE(o+2);x+=col*1000+500;y+=-row*1000-500;return{id:r.CELL_ID,col,row};});
  x/=cells.length;y/=cells.length;const anchor=cells.reduce((a,b)=>Math.hypot(a.col*1000+500-x,-a.row*1000-500-y)<Math.hypot(b.col*1000+500-x,-b.row*1000-500-y)?a:b);
  const set=new Set(cells.map(c=>`${c.col},${c.row}`)),outline=[];for(const{col:c,row:r}of cells){const x=c*1000,y=-r*1000;if(!set.has(`${c-1},${r}`))outline.push([x,y,x,y-1000]);if(!set.has(`${c+1},${r}`))outline.push([x+1000,y,x+1000,y-1000]);if(!set.has(`${c},${r-1}`))outline.push([x,y,x+1000,y]);if(!set.has(`${c},${r+1}`))outline.push([x,y-1000,x+1000,y-1000]);}
  return{id:k===0?'A':'B',block,state:'Sarawak',cellIds:cells.map(c=>c.id),x:anchor.col*1000+500,y:-anchor.row*1000-500,outline,riskHa:risk,allocatedHa:allocated,allocatedFraction:allocated/risk,conversionHa:converted};
 });
 const resource={version:1,baselineYear:2018,outcomeYears:[2019,2020],cohort:'ELIGIBLE_PREDICTED',selectionRule:'Fixed Sarawak blocks with similar 2018 eligible forest-at-risk area and contrasting frozen allocation; outcomes were not used to choose the pair.',studySha256:sha(packed),outcomeSha256:sha(outcomes),sourceSha256:sha(source),registrySha256:sha(registry),cases};
 assert.ok(Math.abs(cases[0].riskHa-cases[1].riskHa)/Math.max(...cases.map(c=>c.riskHa))<.05);
 const file=resolve(root,'public/data/experience.json');if(check)assert.equal(await readFile(file,'utf8'),JSON.stringify(resource));else await writeFile(file,JSON.stringify(resource));
 const report={at:new Date().toISOString(),allMembersAndValuesVerifiedAgainstSource:true,sourceBlockField:'SPATIAL_BLOCK_ID',sameEligibleCohort:true,selectionDoesNotUseOutcomes:true,sha256:sha(Buffer.from(JSON.stringify(resource))),cases:cases.map(({cellIds,outline,...c})=>({...c,cells:cellIds.length,outlineSegments:outline.length}))};
 await writeFile(resolve(root,'reports/experience-checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));return resource;
}
if(process.argv[1]?.endsWith('experience.mjs'))await prepareExperience(process.argv.includes('--check'));
