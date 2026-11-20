import type { DataBundle, MapData } from './data';
export const ocean=[232,236,232],landColour=[183,195,181],forestColour=[47,88,62];
export const lowPriority=[229,212,160],highPriority=[158,89,27];
export const mix=(a:number[],b:number[],t:number)=>a.map((v,i)=>v*(1-t)+b[i]*t);
export function priorityColour(p:number){return mix(lowPriority,highPriority,p/100);}
export async function imagePixels(file:string){const im=new Image();im.src=`./data/${file}`;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height);}
export interface Surfaces{base:string;forest:string|null;priority:string;allocation:string;activity:string|null;land:ImageData;}
function vectorLand(data:DataBundle){const b=data.geo.bounds,c=document.createElement('canvas');c.height=2048;c.width=Math.round(2048*(b[2]-b[0])/(b[3]-b[1]));const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.fillStyle='#FF0000';ctx.beginPath();for(const feature of data.geo.features.filter(f=>f.kind==='land'))for(const ring of feature.rings){ring.forEach(([x,y],i)=>{const px=(x-b[0])/(b[2]-b[0])*c.width,py=(b[3]-y)/(b[3]-b[1])*c.height;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);});ctx.closePath();}ctx.fill('evenodd');return ctx.getImageData(0,0,c.width,c.height);}
export async function makeFlatSurfaces(data:DataBundle):Promise<Surfaces>{
 const [land,forest]=await Promise.all([imagePixels(data.geo.land.low).catch(()=>vectorLand(data)),data.geo.forest.status==='ready'?imagePixels(data.geo.forest.low).catch(()=>null):null]);
 const canvas=document.createElement('canvas');canvas.width=land.width;canvas.height=land.height;const ctx=canvas.getContext('2d')!;const out=ctx.createImageData(land.width,land.height),fout=ctx.createImageData(land.width,land.height);
 const b=data.geo.bounds;
 for(let y=0;y<land.height;y++)for(let x=0;x<land.width;x++){
  const i=(y*land.width+x)*4,mask=land.data[i]/255;if(mask<0.01)continue;
  const px=b[0]+(x+.5)/land.width*(b[2]-b[0]),py=b[3]-(y+.5)/land.height*(b[3]-b[1]);
  const study=data.study.atProjected(px,py),inside=study!==null;
  const base=inside?landColour:mix(landColour,ocean,.18);for(let j=0;j<3;j++)out.data[i+j]=base[j];out.data[i+3]=255*mask;
  if(forest){const fi=(Math.min(forest.height-1,Math.floor(y/land.height*forest.height))*forest.width+Math.min(forest.width-1,Math.floor(x/land.width*forest.width)))*4;const cover=(forest.data[fi]+forest.data[fi+1]+forest.data[fi+2])/255;const col=inside?forestColour:mix(forestColour,[145,163,146],.58);const rgb=mix(base,col,Math.min(1,cover));for(let j=0;j<3;j++)fout.data[i+j]=rgb[j];fout.data[i+3]=255*mask;}
 }
 ctx.putImageData(out,0,0);const base=canvas.toDataURL('image/png');ctx.putImageData(fout,0,0);const forestURL=forest?canvas.toDataURL('image/png'):null;
 const g=data.study.meta.grid;canvas.width=g.width;canvas.height=g.height;const pctx=canvas.getContext('2d')!,p=pctx.createImageData(g.width,g.height);
 for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const index=data.study.lookup[y*g.width+x];if(index<0)continue;const cell=data.study.cell(index),i=(y*g.width+x)*4;let col=cell.status==='ELIGIBLE_PREDICTED'?priorityColour(cell.percentile):cell.status==='NO_2018_MODEL_ROW'?[112,122,119]:[197,202,190];
  if(cell.fraction>0){const edge=x===0||y===0||x===g.width-1||y===g.height-1||[-1,1,-g.width,g.width].some(d=>{const n=data.study.lookup[y*g.width+x+d];return n<0||data.study.cell(n).fraction<=0;});if(edge)col=[108,63,22];}
  for(let j=0;j<3;j++)p.data[i+j]=col[j];p.data[i+3]=cell.status==='ELIGIBLE_PREDICTED'?205:185;
 }
 pctx.putImageData(p,0,0);const priority=canvas.toDataURL('image/png');const allocationPixels=pctx.createImageData(g.width,g.height);for(let i=0;i<data.study.meta.count;i++){const cell=data.study.cell(i);if(cell.fraction<=0)continue;const o=((cell.row-g.minRow)*g.width+cell.col-g.minCol)*4;allocationPixels.data.set([158,89,27,235],o);}pctx.putImageData(allocationPixels,0,0);const allocation=canvas.toDataURL('image/png');let activity=null;
 if(data.conversion&&data.activity){const a=pctx.createImageData(g.width,g.height);for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++){const index=data.study.lookup[y*g.width+x];if(index<0)continue;const v=data.conversion[index],i=(y*g.width+x)*4;const colour=!Number.isFinite(v)?[142,149,141]:v===0?null:v<1?[218,201,170]:v<5?[207,161,108]:v<20?[185,113,63]:[158,71,45];if(!colour)continue;for(let j=0;j<3;j++)a.data[i+j]=colour[j];a.data[i+3]=235;}pctx.putImageData(a,0,0);activity=canvas.toDataURL('image/png');}
 return{base,forest:forestURL,priority,allocation,activity,land};
}
export function isLand(data:MapData,pixels:ImageData,x:number,y:number){const b=data.geo.bounds,u=(x-b[0])/(b[2]-b[0]),v=(b[3]-y)/(b[3]-b[1]);if(u<0||u>1||v<0||v>1)return false;return pixels.data[(Math.min(pixels.height-1,Math.floor(v*pixels.height))*pixels.width+Math.min(pixels.width-1,Math.floor(u*pixels.width)))*4]>127;}
