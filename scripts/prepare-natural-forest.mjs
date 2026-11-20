import {FOREST_WALK_SPEED} from '../src/forestMotion.ts';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {BufferGeometry,Float32BufferAttribute,Vector3} from 'three';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'public/forest-natural'),raw=resolve(root,'data/raw/natural-forest');
await mkdir(resolve(out,'textures'),{recursive:true});await mkdir(resolve(out,'models'),{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),acquisition=JSON.parse((await readFile(resolve(raw,'acquisition.json'),'utf8')).replace(/^\uFEFF/,''));
const textures={};
async function texture(name,size,crop=[0,0,1,1]){
 const bytes=await readFile(resolve(raw,`${name}.png`));assert.equal(sha(bytes),acquisition.files.find(f=>f.file===`${name}.png`).sha256);
 const source=PNG.sync.read(bytes),p=new PNG({width:size,height:size});
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const sx=Math.min(source.width-1,Math.floor((crop[0]+(x+.5)/size*(crop[2]-crop[0]))*source.width)),sy=Math.min(source.height-1,Math.floor((crop[1]+(y+.5)/size*(crop[3]-crop[1]))*source.height));
  source.data.copy(p.data,(y*size+x)*4,(sy*source.width+sx)*4,(sy*source.width+sx)*4+4);
 }
 const data=PNG.sync.write(p),file=`textures/${name}.png`;await writeFile(resolve(out,file),data);textures[name]={file,bytes:data.length,sha256:sha(data),size,source:`${name}.png`,crop};
}
for(const n of ['bark-color','bark-normal','bark-arm'])await texture(n,512,[.55,.10,.73,.40]);
for(const n of ['ground-color','ground-normal','ground-arm'])await texture(n,n==='ground-color'?1024:512);
const leafColour=PNG.sync.read(await readFile(resolve(raw,'leaf-color.png'))),leafAlpha=PNG.sync.read(await readFile(resolve(raw,'leaf-alpha.png'))),atlas=new PNG({width:512,height:512}),regions=[[.155,0,.35,.42],[.50,.03,.67,.40],[.205,.57,.395,1],[.415,.59,.585,1]];
for(let k=0;k<4;k++)for(let y=0;y<256;y++)for(let x=0;x<256;x++){
 const c=regions[k],sx=Math.min(leafColour.width-1,Math.floor((c[0]+(x+.5)/256*(c[2]-c[0]))*leafColour.width)),sy=Math.min(leafColour.height-1,Math.floor((c[1]+(y+.5)/256*(c[3]-c[1]))*leafColour.height)),s=(sy*leafColour.width+sx)*4,d=(((k>>1)*256+y)*512+(k%2)*256+x)*4;
 atlas.data[d]=leafColour.data[s];atlas.data[d+1]=leafColour.data[s+1];atlas.data[d+2]=leafColour.data[s+2];atlas.data[d+3]=leafAlpha.data[s];
}
const leafData=PNG.sync.write(atlas);await writeFile(resolve(out,'textures/leaf-atlas.png'),leafData);textures.leaf={file:'textures/leaf-atlas.png',bytes:leafData.length,sha256:sha(leafData),size:512,source:['leaf-color.png','leaf-alpha.png'],regions};

function random(seed){return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
function part(){return{p:[],uv:[],i:[]};}
function tube(g,points,radii,sides){
 const offset=g.p.length/3;const baseU=new Vector3(0,0,1).cross(points.at(-1).clone().sub(points[0]).normalize()).normalize();let distance=0;
 for(let j=0;j<points.length;j++){
  const tangent=points[Math.min(j+1,points.length-1)].clone().sub(points[Math.max(j-1,0)]).normalize(),u=baseU.clone().addScaledVector(tangent,-baseU.dot(tangent)).normalize(),v=tangent.clone().cross(u).normalize();
  if(j>0)distance+=points[j].distanceTo(points[j-1]);for(let k=0;k<=sides;k++){const angle=k/sides*Math.PI*2,p=points[j].clone().addScaledVector(u,Math.cos(angle)*radii[j]).addScaledVector(v,Math.sin(angle)*radii[j]);g.p.push(...p.toArray());g.uv.push(k/sides,distance/2.5);}
 }
 for(let j=0;j<points.length-1;j++)for(let k=0;k<sides;k++){const a=offset+j*(sides+1)+k,b=a+sides+1;g.i.push(a,a+1,b,a+1,b+1,b);}
}
function leaf(g,position,w,h,az,tilt,variant,fold){
 const forward=new Vector3(Math.cos(az),0,Math.sin(az)),up=new Vector3(-Math.sin(az)*Math.sin(tilt),Math.cos(tilt),Math.cos(az)*Math.sin(tilt)),base=g.p.length/3;
 const coords=[[-.5,0],[.5,0],[.5,1],[-.5,1]],uv=[[0,1],[1,1],[1,0],[0,0]],ox=variant%2*.5,oy=(variant>>1)*.5;
 coords.forEach(([x,y],i)=>{const p=position.clone().addScaledVector(forward,x*w).addScaledVector(up,(y-.5)*h);g.p.push(...p.toArray());g.uv.push(ox+.004+uv[i][0]*.492,oy+.004+uv[i][1]*.492);});
 if(fold){const p=position.clone().addScaledVector(new Vector3().crossVectors(forward,up),w*.14);g.p.push(...p.toArray());g.uv.push(ox+.25,oy+.25);g.i.push(base,base+1,base+4,base+1,base+2,base+4,base+2,base+3,base+4,base+3,base,base+4);}else g.i.push(base,base+1,base+2,base,base+2,base+3);
}
function tree(kind,lod){
 const bark=part(),leaves=part(),rng=random(23091+kind*817),height=kind?16:14.5,sides=[12,6,4][lod],segments=[13,8,5][lod],trunk=[];
 for(let i=0;i<=segments;i++){const t=i/segments;trunk.push(new Vector3(Math.sin(t*2+kind)*t*.55,t*height,Math.sin(t*3)*t*.36));}
 tube(bark,trunk,trunk.map((_,i)=>{const t=i/segments;return(.46*(1-t)+.04)*(i===0?1.7:1);}),sides);
 if(lod===0){
  for(let root=0;root<5;root++){
   const angle=root*2.399+kind, x=Math.cos(angle),z=Math.sin(angle);
   tube(bark,[new Vector3(.24*x,1.0,.24*z),new Vector3(.76*x,.25,.76*z),new Vector3((1.18+.12*(root%3))*x,.025,(1.18+.12*(root%3))*z)],[.28,.145,.022],5);
  }
 }
 const ends=[];
 for(let b=0;b<13;b++){
  const angle=b*2.399+kind*.7,start=trunk[Math.floor((.30+b/13*.51)*segments)].clone(),length=2.5+rng()*2.4,tip=start.clone().add(new Vector3(Math.cos(angle)*length,2+rng()*2.3,Math.sin(angle)*length)),mid=start.clone().lerp(tip,.5).add(new Vector3(0,-.4,0));
  tube(bark,[start,mid,tip],[.17*(1-b/19),.095,.018],Math.max(4,sides-2));ends.push(tip);
  if(lod===0)for(let q=0;q<2;q++){const a=angle+(q?1:-1)*.7,twig=tip.clone().add(new Vector3(Math.cos(a)*1.2,.45+rng(),Math.sin(a)*1.2));tube(bark,[mid.clone().lerp(tip,.65),twig],[.045,.008],4);ends.push(twig);}
 }
 const count=[1100,420,110][lod];
 // All LODs use deterministic canopy clusters. These are authored art positions, not a botanical survey.
 for(let i=0;i<count;i++){const center=ends[i%ends.length],a=rng()*Math.PI*2,r=Math.sqrt(rng())*1.45,p=center.clone().add(new Vector3(Math.cos(a)*r,(rng()-.4)*1.8,Math.sin(a)*r)),scale=[1,1.45,2.3][lod];leaf(leaves,p,(.29+rng()*.22)*scale,(.5+rng()*.4)*scale,rng()*Math.PI*2,(rng()-.5)*1.9,i%4,lod===0);}
 return[bark,leaves];
}
async function glb(file,parts){
 const chunks=[],bufferViews=[],accessors=[],meshes=[];let length=0;
 const accessor=(array,type,componentType,min,max)=>{const b=Buffer.from(array.buffer,array.byteOffset,array.byteLength),id=bufferViews.length;bufferViews.push({buffer:0,byteOffset:length,byteLength:b.length});chunks.push(b);length+=b.length;const index=accessors.length;accessors.push({bufferView:id,componentType,count:array.length/({VEC3:3,VEC2:2,SCALAR:1}[type]),type,...(min?{min,max}:{} )});return index;};
 for(let k=0;k<parts.length;k++){
  const a=parts[k],g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(a.p,3));g.setAttribute('uv',new Float32BufferAttribute(a.uv,2));g.setIndex(a.i);g.computeVertexNormals();g.computeBoundingBox();
  const position=accessor(g.attributes.position.array,'VEC3',5126,g.boundingBox.min.toArray(),g.boundingBox.max.toArray()),normal=accessor(g.attributes.normal.array,'VEC3',5126),uv=accessor(g.attributes.uv.array,'VEC2',5126),indices=accessor(new Uint32Array(a.i),'SCALAR',5125);
  meshes.push({name:k===0&&parts.length>1?'bark':'leaf',primitives:[{attributes:{POSITION:position,NORMAL:normal,TEXCOORD_0:uv},indices,material:k===0&&parts.length>1?0:1}]});g.dispose();
 }
 const json={asset:{version:'2.0',generator:'MLBorneo authored illustrative tree; CC0 photographic textures assigned separately'},scene:0,scenes:[{nodes:meshes.map((_,i)=>i)}],nodes:meshes.map((_,i)=>({mesh:i})),meshes,materials:[{name:'bark'},{name:'leaf',doubleSided:true}],buffers:[{byteLength:length}],bufferViews,accessors};
 let j=Buffer.from(JSON.stringify(json));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);const bin=Buffer.concat(chunks),header=Buffer.alloc(20),binHeader=Buffer.alloc(8);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+j.length+bin.length,8);header.writeUInt32LE(j.length,12);header.writeUInt32LE(0x4e4f534a,16);binHeader.writeUInt32LE(bin.length);binHeader.writeUInt32LE(0x004e4942,4);const data=Buffer.concat([header,j,binHeader,bin]);await writeFile(resolve(out,file),data);return{file,bytes:data.length,sha256:sha(data),triangles:parts.reduce((n,p)=>n+p.i.length/3,0)};
}
const models=[];for(let kind=0;kind<2;kind++)for(let lod=0;lod<3;lod++)models.push({...await glb(`models/tree-${kind}-${lod}.glb`,tree(kind,lod)),kind,lod,radius:.7});
const shrub=part(),sr=random(127);
for(let frond=0;frond<8;frond++){
 const heading=frond*2.399,length=.48+sr()*.63;
 for(let pair=1;pair<=6;pair++){
  const t=pair/7,reach=t*length,y=.06+Math.sin(t*2.25)*(.39+length*.23);
  for(const side of [-1,1]){
   const angle=heading+side*.81,width=.14*(1.2-t);
   const position=new Vector3(Math.cos(heading)*reach+Math.cos(angle)*width,y,Math.sin(heading)*reach+Math.sin(angle)*width);
   leaf(shrub,position,.12*(1.2-t),.29*(1.2-t),angle,1.0+sr()*.45,(pair+frond)%4,false);
  }
 }
}
const understory=await glb('models/understory.glb',[shrub]);
const rng=random(194718),trees=[{x:0,z:-9},{x:-10,z:-9},{x:10,z:-8}].map((p,i)=>({...p,id:`tree-${i}`,model:i%2,rotation:i*.8,scale:1,radius:.7}));
while(trees.length<160){const x=rng()*150-75,z=rng()*150-75;if(Math.hypot(x,z)<6||trees.some(t=>Math.hypot(t.x-x,t.z-z)<8))continue;const i=trees.length;trees.push({id:`tree-${i}`,x,z,model:i%2,rotation:rng()*Math.PI*2,scale:.9+rng()*.2,radius:.7});}
const old=JSON.parse(await readFile(resolve(root,'public/forest/manifest.json'),'utf8')),layout={seed:194718,version:2,trees,shrubs:old.layout.shrubs,walkBounds:[-25,-25,25,25],eyeHeight:1.65,speed:FOREST_WALK_SPEED};
// Independently check routes from the spawn to the reading ring of each learning tree.
function reachable(count,target){const q=[[0,0]],seen=new Set(['0,0']);while(q.length){const[x,z]=q.shift();if(Math.hypot(x-target.x,z-target.z)<2.9)return true;for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=z+dz,key=`${a},${b}`;if(Math.abs(a)>25||Math.abs(b)>25||seen.has(key)||trees.slice(0,count).some(t=>Math.hypot(a-t.x,b-t.z)<t.radius*t.scale+.35))continue;seen.add(key);q.push([a,b]);}}return false;}
for(const count of[8,80,160])for(const t of trees.slice(0,3))assert.ok(reachable(count,t));
const manifest={version:2,title:'Illustrative broadleaf forest',authored:'Deterministic lightweight branch geometry and photographed leaf cutouts, not measured Borneo vegetation.',models,understory,textures,layout,layoutSha256:sha(Buffer.from(JSON.stringify(layout))),learning:[{treeId:'tree-0',noteId:'habitat'},{treeId:'tree-1',noteId:'carbon'},{treeId:'tree-2',noteId:'monitoring'}],sources:acquisition,densityMetric:'FOREST_AT_RISK_HA / 100; artistic density only',routeChecks:{treeCounts:[8,80,160],allThreeReachable:true}};
const resources=[...models,understory,...Object.values(textures)];manifest.resourceBytes=resources.reduce((n,f)=>n+f.bytes,0);assert.ok(manifest.resourceBytes<8*1024*1024);await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest));await writeFile(resolve(out,'LICENSE.txt'),'Authored geometry: MLBorneo project.\nPhotographic textures: Poly Haven / Rob Tuytel and Rico Cilliers, CC0-1.0.\nhttps://polyhaven.com/license\nhttps://polyhaven.com/a/island_tree_01\nhttps://polyhaven.com/a/brown_mud_leaves_01\nIllustrative assets; no botanical or geographic measurements.\n');
await writeFile(resolve(root,'reports/natural-forest-assets.json'),JSON.stringify(manifest,null,2));console.log(JSON.stringify({bytes:manifest.resourceBytes,models:models.map(m=>({kind:m.kind,lod:m.lod,triangles:m.triangles})),routes:manifest.routeChecks},null,2));
