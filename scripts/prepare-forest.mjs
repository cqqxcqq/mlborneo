import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {unzipSync} from 'fflate';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),raw=resolve(root,'data/raw/kenney_nature-kit.zip'),out=resolve(root,'public/forest');
const url='https://kenney.nl/media/pages/assets/nature-kit/37ac38a37b-1677698939/kenney_nature-kit.zip';
const sha=b=>createHash('sha256').update(b).digest('hex');
await mkdir(out,{recursive:true});
let archive;try{archive=await readFile(raw);}catch{const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Nature asset download: ${response.status}`);archive=Buffer.from(await response.arrayBuffer());await writeFile(raw,archive);}
const files=unzipSync(archive),license=Buffer.from(files['License.txt']);assert.ok(license.toString().includes('Creative Commons Zero, CC0'));
const models=[];for(const[name,height]of[['tree_detailed',18],['tree_default',14],['tree_fat',16],['plant_bushDetailed',1.6],['plant_bushSmall',.8]]){
 const bytes=Buffer.from(files[`Models/GLTF format/${name}.glb`]),json=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
 assert.ok(!(json.images||[]).some(i=>i.uri&&!i.uri.startsWith('data:')),'Unexpected external texture');
 assert.ok(!(json.buffers||[]).some(i=>i.uri&&!i.uri.startsWith('data:')),'Unexpected external buffer');
 let triangles=0,parts=0;for(const m of json.meshes)for(const p of m.primitives){parts++;if(json.materials[p.material]?.name==='_defaultMat')continue;triangles+=(p.indices!==undefined?json.accessors[p.indices].count:json.accessors[p.attributes.POSITION].count)/3;}
 await writeFile(resolve(out,`${name}.glb`),bytes);models.push({name,file:`${name}.glb`,bytes:bytes.length,sha256:sha(bytes),height,triangles,parts,externalDependencies:0});
}
let seed=194718;const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const trees=[];for(let attempt=0;trees.length<160&&attempt<100000;attempt++){const x=random()*150-75,z=random()*150-75;if(Math.hypot(x,z)<6||trees.some(t=>Math.hypot(t.x-x,t.z-z)<8))continue;trees.push({x,z,model:trees.length%3,rotation:random()*Math.PI*2,scale:.9+random()*.2,radius:.55});}assert.equal(trees.length,160);
const shrubs=[];while(shrubs.length<64){const x=random()*150-75,z=random()*150-75;if(Math.hypot(x,z)<4)continue;shrubs.push({x,z,model:3+shrubs.length%2,rotation:random()*Math.PI*2,scale:.85+random()*.3});}
const layout={seed:194718,trees,shrubs,walkBounds:[-25,-25,25,25],eyeHeight:1.65,speed:1.5,playerRadius:.3};
let acquiredAt=new Date().toISOString();try{const previous=JSON.parse(await readFile(resolve(out,'manifest.json'),'utf8'));if(previous.archiveSha256===sha(archive))acquiredAt=previous.acquiredAt;}catch{}
const manifest={version:1,title:'Illustrative forest',source:'Kenney Nature Kit 2.1',url:'https://kenney.nl/assets/nature-kit',downloadUrl:url,acquiredAt,archiveSha256:sha(archive),license:'CC0-1.0',licenseFile:'LICENSE.txt',models,layout,layoutSha256:sha(Buffer.from(JSON.stringify(layout))),densityEncoding:{metric:'FOREST_AT_RISK_HA',referenceAreaHa:100,treeFormula:'round(160 * areaHa / 100)',shrubFormula:'round(64 * areaHa / 100)',treeCountsMeasured:false,protectedArea:false},processing:'Only five original GLB models extracted. Runtime normalizes illustrative height and 70% horizontal tree scale, recolours nonmetallic foliage/bark, removes the default ground quad, welds vertices and applies one Loop subdivision to foliage. Trunk collision radii are derived from normalized bark geometry. Fixed base positions; the active prefix scales artistically with 2018 FOREST_AT_RISK_HA, never with priority, allocation or observed change. Ground is illustrative and flat; no measured tree locations, heights, counts, species or protected-area claim.',totalAssetBytes:models.reduce((s,m)=>s+m.bytes,0)+license.length};
await writeFile(resolve(out,'LICENSE.txt'),license);await writeFile(resolve(out,'manifest.json'),JSON.stringify(manifest));await writeFile(resolve(root,'reports/forest-assets.json'),JSON.stringify({...manifest,layout:{...layout,trees:trees.length,shrubs:shrubs.length}},null,2));console.log(JSON.stringify({models,trees:trees.length,shrubs:shrubs.length,bytes:manifest.totalAssetBytes,layoutSha256:manifest.layoutSha256},null,2));
