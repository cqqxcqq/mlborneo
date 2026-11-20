import { readFile,readdir,stat,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import proj4 from 'proj4';
import { project,unproject } from '../src/geo.ts';
import { sourcePaths } from './inspect.mjs';
import { PNG } from 'pngjs';
const base=resolve(import.meta.dirname,'..'),out=resolve(base,'public/data');
const readJSON=async p=>JSON.parse(await readFile(p,'utf8'));
const meta=await readJSON(resolve(out,'study-meta.json')),audit=await readJSON(resolve(base,'reports/study-audit.json')),geo=await readJSON(resolve(out,'geo.json'));
const buffer=await readFile(resolve(out,'study.bin'));
const priorityTexture=PNG.sync.read(await readFile(resolve(out,'study.png')));let partialTextureCells=0;
assert.equal(meta.count,197756);assert.equal(buffer.length,meta.count*64);assert.equal(audit.unmatched,0);assert.equal(audit.maxGridErrorM,0);assert.ok(audit.maxCoordinateErrorM<.01);assert.ok(Math.abs(audit.warningFraction-.1)<1e-12);
for(const [k,path]of Object.entries(sourcePaths)){assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'),audit.sources[k].sha256,`Original research changed: ${k}`);}
const transform=proj4('EPSG:4326',audit.crs);let maxProjectionErrorM=0,maxRoundtripErrorDegrees=0;
for(let i=0;i<meta.count;i++){const o=i*64,lon=buffer.readDoubleLE(o+32),lat=buffer.readDoubleLE(o+40),xy=project(lon,lat),ref=transform.forward([lon,lat]),ll=unproject(...xy);maxProjectionErrorM=Math.max(maxProjectionErrorM,Math.hypot(xy[0]-ref[0],xy[1]-ref[1]));maxRoundtripErrorDegrees=Math.max(maxRoundtripErrorDegrees,Math.hypot(ll[0]-lon,ll[1]-lat));const col=buffer.readInt16LE(o),row=buffer.readInt16LE(o+2);assert.equal(Math.floor(xy[0]/1000),col);assert.equal(Math.floor(-xy[1]/1000),row);const p=((row-meta.grid.minRow)*meta.grid.width+col-meta.grid.minCol)*4,percentile=buffer.readDoubleLE(o+16),fraction=buffer.readDoubleLE(o+24);assert.equal(priorityTexture.data[p],Number.isFinite(percentile)?Math.round(percentile*2.55):0);assert.equal(priorityTexture.data[p+1],buffer[o+5]+1);assert.equal(priorityTexture.data[p+2],fraction===1?255:fraction>0?128:0);assert.equal(priorityTexture.data[p+3],255);if(priorityTexture.data[p+2]===128)partialTextureCells++;}
assert.equal(partialTextureCells,1);
assert.ok(maxProjectionErrorM<1e-5);assert.ok(maxRoundtripErrorDegrees<1e-10);
for(const [name,r]of Object.entries(audit.samples)){const o=r.index*64;assert.equal(buffer.readInt16LE(o),r.GRID_COL,name);assert.equal(buffer.readInt16LE(o+2),r.GRID_ROW,name);for(const [j,k]of ['FOREST_AT_RISK_HA','RISK_PRIORITY_PERCENTILE','WARNING_SELECTION_FRACTION','LONGITUDE','LATITUDE','PREDICTION_YEAR','WARNING_SELECTED_AREA_HA'].entries()){const expected=r[k];const actual=buffer.readDoubleLE(o+8+j*8);assert.ok(expected===null?Number.isNaN(actual):actual===expected,`${name}: ${k}`);}}
const resources=[];for(const name of await readdir(out)){const p=resolve(out,name),s=await stat(p);if(s.isFile())resources.push({file:name,bytes:s.size});}
assert.equal(geo.terrain.status,'ready','Real terrain is unavailable');assert.equal(geo.forest.status,'ready','The requested 2018 forest resource is unavailable');
const terrain=await readFile(resolve(out,geo.terrain.file));assert.equal(terrain.length,geo.terrain.width*geo.terrain.height*4);
const displayScope=await readJSON(resolve(out,'display-scope.json'));assert.ok(displayScope.features.every(f=>!String(f.name).includes('Kalimantan')));assert.ok(displayScope.features.some(f=>f.name==='Sabah'));assert.ok(displayScope.features.some(f=>f.name==='Sarawak'));
for(const file of[displayScope.land.desktop,displayScope.land.low])assert.ok((await stat(resolve(out,file))).size>0);
const scopePixels=PNG.sync.read(await readFile(resolve(out,displayScope.land.desktop)));const kk=project(114.6,-.85),kx=Math.floor((kk[0]-geo.bounds[0])/(geo.bounds[2]-geo.bounds[0])*scopePixels.width),ky=Math.floor((geo.bounds[3]-kk[1])/(geo.bounds[3]-geo.bounds[1])*scopePixels.height);assert.equal(scopePixels.data[(ky*scopePixels.width+kx)*4],0,'Indonesian background must remain hidden');
for(const file of[geo.land.desktop,geo.land.low,geo.forest.desktop,geo.forest.low])assert.ok((await stat(resolve(out,file))).size>0);
const mask=PNG.sync.read(await readFile(resolve(out,geo.land.desktop)));let contextCoastCells=0,contextCoastSelected=0,coastSampleID='';const b=geo.bounds;
for(let i=0;i<meta.count;i++){const o=i*64,c=buffer.readInt16LE(o),r=buffer.readInt16LE(o+2),x=Math.floor(((c+.5)*1000-b[0])/(b[2]-b[0])*mask.width),y=Math.floor((b[3]+(r+.5)*1000)/(b[3]-b[1])*mask.height);if(mask.data[(y*mask.width+x)*4]<128){contextCoastCells++;if(buffer.readDoubleLE(o+24)>0){contextCoastSelected++;coastSampleID||=`Borneo1k_${c}_${r}`;}}}
const result={executedAt:new Date().toISOString(),originalResearchHashesMatch:true,allCellsProjectedAndQueried:true,count:meta.count,maxProjectionErrorM,maxRoundtripErrorDegrees,sourceSampleChecks:Object.keys(audit.samples),contextCoastCells,contextCoastSelected,coastSampleID,contextCoastPolicy:'Neither Natural Earth nor JRC masks or reselects research cells. Research lookup precedes context-land lookup; shader keeps source-grid cells outside the land mask.',resources,totalBytes:resources.reduce((a,b)=>a+b.bytes,0),triangles:{desktopInitial:256*256*2,desktopDetail:512*512*2,lowInitial:192*192*2,lowDetail:320*320*2}};
await writeFile(resolve(base,'reports/check-data.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
