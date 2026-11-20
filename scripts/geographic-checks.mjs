import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import proj4 from 'proj4';
import { PNG } from 'pngjs';
import { fromFile } from 'geotiff';
import { sourcePaths,readParquet } from './inspect.mjs';
const root=resolve(import.meta.dirname,'..'),json=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const [map,registry,audit,geo]=await Promise.all([readParquet(sourcePaths.map),readParquet(sourcePaths.registry),json('reports/study-audit.json'),json('public/data/geo.json')]);
const records=new Map(map.map((r,i)=>[r.CELL_ID,{...r,index:i}])),locations=new Map(registry.map(r=>[r.CELL_ID,r]));
const packed=await readFile(resolve(root,'public/data/study.bin')),terrain=await readFile(resolve(root,'public/data/terrain.bin')),projection=proj4('EPSG:4326',audit.crs);
const pair=['Borneo1k_175_-167','Borneo1k_176_-167'];assert.equal(records.get(pair[0]).STATE,'Sarawak');assert.equal(records.get(pair[1]).STATE,'Sabah');assert.equal(Number(records.get(pair[1]).GRID_COL)-Number(records.get(pair[0]).GRID_COL),1);assert.equal(records.get(pair[0]).GRID_ROW,records.get(pair[1]).GRID_ROW);
const selectedIDs=[audit.samples.sabah.CELL_ID,audit.samples.sarawak.CELL_ID,...pair,audit.samples.coast.CELL_ID,audit.samples.missing.CELL_ID,audit.samples.ineligible.CELL_ID,audit.samples.partial.CELL_ID];
const sourceSamples=selectedIDs.map(id=>{const r=records.get(id),l=locations.get(id),o=r.index*64;assert.equal(`Borneo1k_${packed.readInt16LE(o)}_${packed.readInt16LE(o+2)}`,id);for(const[j,k]of['FOREST_AT_RISK_HA','RISK_PRIORITY_PERCENTILE','WARNING_SELECTION_FRACTION'].entries()){const actual=packed.readDoubleLE(o+8+j*8);assert.ok(r[k]==null?Number.isNaN(actual):Object.is(actual,r[k]));}return{id,state:r.STATE,longitude:l.LONGITUDE,latitude:l.LATITUDE,areaHa:r.FOREST_AT_RISK_HA,percentile:r.RISK_PRIORITY_PERCENTILE,selectionFraction:r.WARNING_SELECTION_FRACTION,status:r.MAP_DATA_STATUS,sourceValuesIdentical:true};});
const tileCache=new Map();
async function heightPixel(gx,gy){const x=Math.floor(gx/256),y=Math.floor(gy/256),key=`${x}-${y}`;if(!tileCache.has(key))tileCache.set(key,PNG.sync.read(await readFile(resolve(root,`data/raw/terrain/8-${key}.png`))));const p=tileCache.get(key),o=((gy-y*256)*256+gx-x*256)*4;return p.data[o]*256+p.data[o+1]+p.data[o+2]/256-32768;}
const terrainChecks=[];
for(const id of selectedIDs.slice(0,5)){const l=locations.get(id),b=geo.bounds,w=geo.terrain.width,h=geo.terrain.height;const ix=Math.round((l.X_LAEA_M-b[0])/(b[2]-b[0])*(w-1)),iy=Math.round((b[3]-l.Y_LAEA_M)/(b[3]-b[1])*(h-1)),x=b[0]+ix/(w-1)*(b[2]-b[0]),y=b[3]-iy/(h-1)*(b[3]-b[1]),[lon,lat]=projection.inverse([x,y]);const px=(lon+180)/360*256*256-.5,py=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*256*256-.5,fx=Math.floor(px),fy=Math.floor(py),dx=px-fx,dy=py-fy;
 const raw=(await heightPixel(fx,fy))*(1-dx)*(1-dy)+(await heightPixel(fx+1,fy))*dx*(1-dy)+(await heightPixel(fx,fy+1))*(1-dx)*dy+(await heightPixel(fx+1,fy+1))*dx*dy,expected=Math.fround(raw),actual=terrain.readFloatLE((iy*w+ix)*4);assert.equal(actual,expected);terrainChecks.push({nearCell:id,gridNode:[ix,iy],longitude:lon,latitude:lat,decodedSourceMetres:expected,preparedMetres:actual,exactFloat32Match:true});
}
const forestChecks=[];
for(const [latName,lonName,points]of[['N10','E100',[[109.8,1.5]]],['N10','E110',[[116.5,5.5],[112.3,2.5],[115.6,4.5],[114.6,4.5]]],['N0','E110',[[114,-1]]]]){
 const file=resolve(root,`data/raw/JRC_TMF_AnnualChange_v1_2018_${latName}_${lonName}.tif`),tiff=await fromFile(file);
 try{const image=await tiff.getImage(),w=image.getWidth(),h=image.getHeight(),bb=image.getBoundingBox(),meta=JSON.parse(await readFile(file+'.aggregate8.json','utf8')),aggregate=await readFile(file+'.aggregate8.bin');assert.equal(image.getSamplesPerPixel(),1);assert.equal(image.getGeoKeys().GeographicTypeGeoKey,4326);
  for(const[lon,lat]of points){const col=Math.floor((lon-bb[0])/(bb[2]-bb[0])*w/8),row=Math.floor((bb[3]-lat)/(bb[3]-bb[1])*h/8),x=col*8,y=row*8,endX=Math.min(w,x+8),endY=Math.min(h,y+8),r=await image.readRasters({window:[x,y,endX,endY],interleave:true}),counts=[0,0,0,0],hist={};for(const c of r){assert.ok(c>=0&&c<=6);hist[c]=(hist[c]||0)+1;if(c===1)counts[0]++;if(c===2)counts[1]++;if(c===4)counts[2]++;if(c>=1&&c<=6)counts[3]++;}const expected=counts.map(n=>Math.round(n/r.length*255)),o=(row*meta.width+col)*4,actual=[...aggregate.subarray(o,o+4)];assert.deepEqual(actual,expected);forestChecks.push({tile:`${latName}_${lonName}`,longitude:lon,latitude:lat,sourcePixelWindow:[x,y,endX,endY],rawClasses:hist,rgbaClassFractions:actual,categoryCountsIdentical:true});}
 }finally{await tiff.close();}
}
const report={time:new Date().toISOString(),boundaryPair:pair,sourceSamples,terrainChecks,forestChecks,interpretation:'These checks verify selected source-to-resource values and coordinate relationships. They do not independently establish model performance, pixel classification accuracy, or exact destination-pixel forest areas.'};
await writeFile(resolve(root,'reports/geographic-verification.json'),JSON.stringify(report,(_,v)=>typeof v==='number'&&!Number.isFinite(v)?null:v,2));console.log(JSON.stringify({samples:sourceSamples.length,terrainSourceChecks:terrainChecks.length,forestBlockChecks:forestChecks.length,allPassed:true},null,2));
