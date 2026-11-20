import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import proj4 from 'proj4';
import { PNG } from 'pngjs';
import { readParquet, sourcePaths } from './inspect.mjs';

export const crs = '+proj=laea +lat_0=3 +lon_0=114 +x_0=0 +y_0=0 +ellps=WGS84 +units=m +no_defs';
export const bounds = [-620000, -850000, 650000, 520000];
export const projection = proj4('EPSG:4326', crs);
export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const finite = Number.isFinite;
const json = (_, v) => typeof v === 'bigint' ? Number(v) : !finite(v) && typeof v === 'number' ? null : v;
function requireThat(ok, message) { if (!ok) throw Error(`Research registration failed: ${message}`); }

export async function prepareStudy(outDir, reportDir) {
  const [map, registry, status] = await Promise.all([readParquet(sourcePaths.map), readParquet(sourcePaths.registry), readFile(sourcePaths.status, 'utf8').then(JSON.parse)]);
  const byID = new Map(registry.map(r => [r.CELL_ID, r]));
  requireThat(byID.size === registry.length && new Set(map.map(r => r.CELL_ID)).size === map.length, 'duplicate CELL_ID');
  requireThat(map.length === status.TOTAL_SPATIAL_CELLS && registry.length === map.length, 'domain count differs from frozen status');
  const grid = { minCol: -496, maxCol: 583, minRow: -483, maxRow: 236, width: 1080, height: 720, stepM: 1000, transform: [1000,0,0,0,-1000,0], centreOffsetM: [500,-500] };
  const statuses = ['ELIGIBLE_PREDICTED', 'MODEL_ROW_BUT_LT5HA', 'NO_2018_MODEL_ROW'];
  const splits = ['DEVELOPMENT', 'STRICT_G0', 'FINAL_BUFFER_10KM'];
  const states = ['Sarawak', 'Sabah'];
  const data = Buffer.alloc(map.length * 64);
  const texture = new PNG({width:grid.width, height:grid.height});
  let maxCoordinateErrorM=0, maxGridErrorM=0, eligible=0, risk=0, warning=0, selected=0;
  const counts = Object.fromEntries(statuses.map(s=>[s,0])); const partial=[]; const gridKeys=new Set();
  const joined=[];
  for (let i=0;i<map.length;i++) {
    const m=map[i], r=byID.get(m.CELL_ID);
    requireThat(r, `unmatched ${m.CELL_ID}`);
    const col=Number(r.GRID_COL), row=Number(r.GRID_ROW);
    requireThat(Number(m.GRID_COL)===col && Number(m.GRID_ROW)===row && m.STATE===r.STATE, `join disagreement ${m.CELL_ID}`);
    requireThat(m.CELL_ID===`Borneo1k_${col}_${row}`, `ID cannot be losslessly reconstructed: ${m.CELL_ID}`);
    const key=`${col},${row}`; requireThat(!gridKeys.has(key),'duplicate grid position'); gridKeys.add(key);
    requireThat(finite(r.LONGITUDE)&&finite(r.LATITUDE)&&finite(r.X_LAEA_M)&&finite(r.Y_LAEA_M),'missing spatial position');
    const xy=projection.forward([r.LONGITUDE,r.LATITUDE]);
    const err=Math.hypot(xy[0]-r.X_LAEA_M,xy[1]-r.Y_LAEA_M); maxCoordinateErrorM=Math.max(maxCoordinateErrorM,err);
    const gridErr=Math.hypot(r.X_LAEA_M-(col*1000+500),r.Y_LAEA_M-(-row*1000-500)); maxGridErrorM=Math.max(maxGridErrorM,gridErr);
    requireThat(err<0.01 && gridErr<0.001, `unverified CRS/transform ${m.CELL_ID}: ${err}m`);
    requireThat(col>=grid.minCol&&col<=grid.maxCol&&row>=grid.minRow&&row<=grid.maxRow, 'unexpected extent');
    const si=statuses.indexOf(m.MAP_DATA_STATUS), st=states.indexOf(m.STATE), sp=splits.indexOf(m.SPLIT_STATUS);
    requireThat(si>=0&&st>=0&&sp>=0,'unknown state/status'); counts[m.MAP_DATA_STATUS]++;
    requireThat(m.MODEL_ROW_PRESENT === (si!==2) && m.ELIGIBLE_2018 === (si===0),'status and flags disagree');
    const f=m.WARNING_SELECTION_FRACTION;
    requireThat(finite(f)&&f>=0&&f<=1,'invalid warning fraction');
    if(si===0){requireThat(finite(m.RISK_PRIORITY_PERCENTILE)&&m.RISK_PRIORITY_PERCENTILE>=0&&m.RISK_PRIORITY_PERCENTILE<=100&&m.FOREST_AT_RISK_HA>=5,'eligible range'); eligible++; risk+=m.FOREST_AT_RISK_HA;}
    else requireThat(!finite(m.RISK_PRIORITY_PERCENTILE)&&f===0,'noneligible score/selection');
    if(si===1) requireThat(m.FOREST_AT_RISK_HA>0&&m.FOREST_AT_RISK_HA<5,'ineligible risk range');
    if(si===2) requireThat(!finite(m.FOREST_AT_RISK_HA),'missing model row risk must stay missing');
    requireThat(si===2 || m.PREDICTION_YEAR===2018,'year mismatch');
    requireThat(Math.abs((si===0 ? m.FOREST_AT_RISK_HA*f : 0)-m.WARNING_SELECTED_AREA_HA)<1e-9,'selected area inconsistent');
    warning+=m.WARNING_SELECTED_AREA_HA;if(f>0)selected++;
    if(f>0&&f<1)partial.push({...m,...r,index:i});
    const off=i*64;
    data.writeInt16LE(col,off);data.writeInt16LE(row,off+2);data.writeUInt8(st,off+4);data.writeUInt8(si,off+5);data.writeUInt8((m.MODEL_ROW_PRESENT?1:0)|(m.ELIGIBLE_2018?2:0),off+6);data.writeUInt8(sp,off+7);
    [m.FOREST_AT_RISK_HA,m.RISK_PRIORITY_PERCENTILE,f,r.LONGITUDE,r.LATITUDE,m.PREDICTION_YEAR,m.WARNING_SELECTED_AREA_HA].forEach((v,j)=>data.writeDoubleLE(v==null?NaN:v,off+8+j*8));
    const p=((row-grid.minRow)*grid.width+col-grid.minCol)*4;
    texture.data[p]=si===0?Math.round(m.RISK_PRIORITY_PERCENTILE*2.55):0;texture.data[p+1]=si+1;texture.data[p+2]=f===1?255:f>0?128:0;texture.data[p+3]=255;
    joined.push({...m,...r,index:i});
  }
  requireThat(Math.abs(warning/risk-0.1)<1e-12,'frozen allocation differs from exact 10% risk area');
  requireThat(partial.length===1,'unexpected partial selection count');
  const nearest=(lon,lat,state)=>joined.filter(r=>!state||r.STATE===state).reduce((a,b)=>Math.hypot(b.LONGITUDE-lon,b.LATITUDE-lat)<Math.hypot(a.LONGITUDE-lon,a.LATITUDE-lat)?b:a);
  const samples = {
    sabah:nearest(116.5,5.5,'Sabah'),sarawak:nearest(112.3,2.5,'Sarawak'),
    sabahSarawakBoundary:nearest(115.5,4.5),coast:nearest(110.2,1.7,'Sarawak'),
    missing:joined.find(r=>r.MAP_DATA_STATUS==='NO_2018_MODEL_ROW'),ineligible:joined.find(r=>r.MAP_DATA_STATUS==='MODEL_ROW_BUT_LT5HA'),partial:partial[0],
  };
  // Every record is checked again against the emitted binary, not just display samples.
  for(const r of joined){const o=r.index*64;for(const [j,k] of ['FOREST_AT_RISK_HA','RISK_PRIORITY_PERCENTILE','WARNING_SELECTION_FRACTION','LONGITUDE','LATITUDE','PREDICTION_YEAR','WARNING_SELECTED_AREA_HA'].entries()){const a=data.readDoubleLE(o+8+j*8),b=r[k];requireThat(Object.is(a,b)||(!finite(a)&&!finite(b)),`binary mismatch ${r.CELL_ID}/${k}`);}}
  await mkdir(outDir,{recursive:true});await mkdir(reportDir,{recursive:true});
  await writeFile(resolve(outDir,'study.bin'),data);await writeFile(resolve(outDir,'study.png'),PNG.sync.write(texture));
  const hashes={};for(const [k,path]of Object.entries(sourcePaths))hashes[k]={path,sha256:sha256(await readFile(path))};
  const audit={time:new Date().toISOString(),sources:hashes,crs,crsEvidence:'phase10_final_scientific_package/06_FIGURES_AND_MAPS/geographic_maps/MAP_CAPTION_AND_PROVENANCE.txt',joinedBy:'CELL_ID',unmatched:0,duplicates:0,total:map.length,eligible,counts,grid,maxCoordinateErrorM,maxGridErrorM,riskAreaHa:risk,warningAreaHa:warning,warningFraction:warning/risk,selectedCells:selected,partialSelectionCells:partial.length,samples,allBinaryValuesVerified:true};
  await writeFile(resolve(reportDir,'study-audit.json'),JSON.stringify(audit,json,2));
  const meta={count:map.length,stride:64,states,statuses,splits,grid,crs,year:2018,sampleIDs:Object.fromEntries(Object.entries(samples).map(([k,r])=>[k,r.CELL_ID])),counts,eligible,riskAreaHa:risk,warningAreaHa:warning,partialSelection:{id:partial[0].CELL_ID,fraction:partial[0].WARNING_SELECTION_FRACTION}};
  await writeFile(resolve(outDir,'study-meta.json'),JSON.stringify(meta,null,2));
  console.log(`Study: ${map.length} cells, CRS error ${maxCoordinateErrorM.toExponential(2)}m, ${partial.length} partial cell, warning fraction ${warning/risk}`);
  return meta;
}
