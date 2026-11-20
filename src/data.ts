import { project, unproject } from './geo';
import type { Bounds } from './geo';
export interface StudyMeta{count:number;stride:number;states:string[];statuses:string[];splits:string[];grid:{minCol:number;maxCol:number;minRow:number;maxRow:number;width:number;height:number};year:number;sampleIDs:Record<string,string>;counts:Record<string,number>;partialSelection:{id:string;fraction:number};}
export interface Feature{name:string;kind:'land'|'admin';rings:number[][][];}
export interface GeoMeta{bounds:Bounds;viewBounds?:Bounds;terrain:{width:number;height:number;file:string;status:string};forest:{status:string;desktop:string;low:string;message?:string};land:{desktop:string;low:string};features:Feature[];sources:unknown[];}
export interface Cell{index:number;id:string;col:number;row:number;state:string;status:string;split:string;area:number;percentile:number;fraction:number;lon:number;lat:number;year:number;selectedArea:number;}
export type Selection={kind:'cell';cell:Cell}|{kind:'outside';lon:number;lat:number}|null;
export interface ChangeArea{state:string;block:string;areaHa:number;knownCells:number;anchorCellId:string;x:number;y:number;longitude:number;latitude:number;outline:[number,number,number,number][];}
export interface ActivityMeta{type:string;period:[number,number];count:number;availableCells:number;missingCells:number;totalHa:number;stateTotals:Record<string,number>;callouts:ChangeArea[];bins:{lower:number;upper:number|null;label:string;colour:string}[];interpretation:string;}
export interface MapData{meta:StudyMeta;geo:GeoMeta;terrain:Float32Array|null;activity:ActivityMeta|null;issues:string[];}
export interface ResearchData{study:StudyData;conversion:Float64Array|null;}
export type DataBundle=MapData&ResearchData;
export class StudyData {
 view:DataView; lookup:Int32Array; byId:Map<string,number>;
 constructor(public meta:StudyMeta, public buffer:ArrayBuffer){
  if(buffer.byteLength!==meta.count*meta.stride)throw Error('Research data size does not match its manifest.');
  this.view=new DataView(buffer);this.lookup=new Int32Array(meta.grid.width*meta.grid.height).fill(-1);this.byId=new Map();
  for(let i=0;i<meta.count;i++){const c=this.cell(i);this.lookup[(c.row-meta.grid.minRow)*meta.grid.width+c.col-meta.grid.minCol]=i;this.byId.set(c.id,i);}
 }
 cell(i:number):Cell{const o=i*this.meta.stride,v=this.view,col=v.getInt16(o,true),row=v.getInt16(o+2,true);return {index:i,id:`Borneo1k_${col}_${row}`,col,row,state:this.meta.states[v.getUint8(o+4)],status:this.meta.statuses[v.getUint8(o+5)],split:this.meta.splits[v.getUint8(o+7)],area:v.getFloat64(o+8,true),percentile:v.getFloat64(o+16,true),fraction:v.getFloat64(o+24,true),lon:v.getFloat64(o+32,true),lat:v.getFloat64(o+40,true),year:v.getFloat64(o+48,true),selectedArea:v.getFloat64(o+56,true)};}
 atProjected(x:number,y:number){const col=Math.floor(x/1000),row=Math.floor(-y/1000),g=this.meta.grid;if(col<g.minCol||col>g.maxCol||row<g.minRow||row>g.maxRow)return null;const i=this.lookup[(row-g.minRow)*g.width+col-g.minCol];return i<0?null:this.cell(i);}
 atLonLat(lon:number,lat:number){return this.atProjected(...project(lon,lat));}
 find(id:string){const i=this.byId.get(id.trim());return i===undefined?null:this.cell(i);}
}
export async function fetchJSON<T>(file:string):Promise<T>{const r=await fetch(`./data/${file}`);if(!r.ok)throw Error(`${file} unavailable (${r.status}).`);return r.json();}
async function binary(file:string){const r=await fetch(`./data/${file}`);if(!r.ok)throw Error(`${file} unavailable (${r.status}).`);return r.arrayBuffer();}
export async function loadMapData():Promise<MapData>{
 const geography=fetchJSON<GeoMeta>('geo.json');
 const elevation=geography.then(async geo=>{
  const buffer=await binary(geo.terrain.file);
  if(buffer.byteLength!==geo.terrain.width*geo.terrain.height*4)throw Error('Terrain grid is incomplete.');
  return new Float32Array(buffer);
 }).then(terrain=>({terrain,issue:null}),err=>({terrain:null,issue:String(err)}));
 const [meta,geo,scope,activity,{terrain,issue}]=await Promise.all([
  fetchJSON<StudyMeta>('study-meta.json'),geography,
  fetchJSON<Pick<GeoMeta,'viewBounds'|'land'|'features'>>('display-scope.json'),
  fetchJSON<ActivityMeta>('activity.json').catch(()=>null),elevation
 ]);
 Object.assign(geo,scope);
 const issues:string[]=[];
 if(!activity||activity.count!==meta.count)issues.push('Observed conversion metadata unavailable.');
 if(issue)issues.push(issue);
 return {meta,geo,terrain,activity:activity?.count===meta.count?activity:null,issues};
}
export async function loadResearchData(map:MapData):Promise<ResearchData>{
 const [buffer,outcomes]=await Promise.all([binary('study.bin'),map.activity?binary('activity.bin').catch(()=>null):null]);
 return {study:new StudyData(map.meta,buffer),conversion:outcomes?.byteLength===map.meta.count*8?new Float64Array(outcomes):null};
}
export async function loadData():Promise<DataBundle>{
 const map=await loadMapData();
 return {...map,...await loadResearchData(map)};
}
export function terrainHeight(data:MapData,x:number,y:number){if(!data.terrain)return 0;const b=data.geo.bounds,w=data.geo.terrain.width,h=data.geo.terrain.height;const fx=Math.max(0,Math.min(w-1,(x-b[0])/(b[2]-b[0])*(w-1))),fy=Math.max(0,Math.min(h-1,(b[3]-y)/(b[3]-b[1])*(h-1)));const ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy;const val=(xx:number,yy:number)=>Math.max(0,data.terrain![Math.min(h-1,yy)*w+Math.min(w-1,xx)]);return (val(ix,iy)*(1-tx)*(1-ty)+val(ix+1,iy)*tx*(1-ty)+val(ix,iy+1)*(1-tx)*ty+val(ix+1,iy+1)*tx*ty)/1000*12;}
export function toWorld(data:MapData,x:number,y:number):[number,number,number]{const b=data.geo.bounds;return[(x-(b[0]+b[2])/2)/1000,terrainHeight(data,x,y),((b[1]+b[3])/2-y)/1000];}
export function fromWorld(data:MapData,x:number,z:number){const b=data.geo.bounds;return [x*1000+(b[0]+b[2])/2,(b[1]+b[3])/2-z*1000] as const;}
export function selectAt(data:Pick<ResearchData,'study'>,x:number,y:number,land:boolean):Selection{const [lon,lat]=unproject(x,y);const cell=data.study.atLonLat(lon,lat);if(cell)return{kind:'cell',cell};return land?{kind:'outside',lon,lat}:null;}
