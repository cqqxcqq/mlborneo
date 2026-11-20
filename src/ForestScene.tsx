import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {Box3,BufferGeometry,Color,Fog,InstancedMesh,Mesh,MeshStandardMaterial,Object3D,PerspectiveCamera,Vector3} from 'three';
import type {DirectionalLight,Material} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {mergeVertices} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {stepForestPosition} from './forestMotion';
import {softenFoliage} from './softenFoliage';
import {forestDensity,illustrativeCount} from './forestDensity';
import type {ForestInput} from './view';

interface Instance{x:number;z:number;model:number;rotation:number;scale:number;radius?:number;}
interface Manifest{version:number;models:{name:string;file:string;height:number;sha256:string}[];layout:{trees:Instance[];shrubs:Instance[]};layoutSha256:string;}
interface Part{geometry:BufferGeometry;tone:'leaf'|'bark'|'bush';model:number;}
interface Loaded{manifest:Manifest;parts:Part[];trunks:{x:number;z:number;radius:number}[];}
const names=['tree_detailed','tree_default','tree_fat','plant_bushDetailed','plant_bushSmall'];
async function loadModels(signal:AbortSignal):Promise<Loaded>{
 const response=await fetch('./forest/manifest.json',{signal});if(!response.ok)throw Error('Forest model manifest is missing.');const manifest:Manifest=await response.json();
 if(manifest.version!==1||manifest.models.length!==5||manifest.layout.trees.length!==160)throw Error('Forest asset manifest is invalid.');
 for(const t of [...manifest.layout.trees,...manifest.layout.shrubs])if(![t.x,t.z,t.rotation,t.scale,t.model].every(Number.isFinite)||Math.abs(t.x)>75||Math.abs(t.z)>75||t.scale<.5||t.scale>1.5||!Number.isInteger(t.model)||t.model<0||t.model>4)throw Error('Forest layout is invalid.');
 const loader=new GLTFLoader(),parts:Part[]=[];
 try{for(let i=0;i<manifest.models.length;i++){
  const m=manifest.models[i];if(m.file!==`${names[i]}.glb`)throw Error('Forest asset file is invalid.');
  const r=await fetch(`./forest/${m.file}`,{signal});if(!r.ok)throw Error(`Forest model unavailable: ${m.name}`);const bytes=await r.arrayBuffer();
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==m.sha256)throw Error('Forest model checksum failed.');
  const gltf=await loader.parseAsync(bytes,'./forest/');gltf.scene.updateMatrixWorld(true);const box=new Box3().setFromObject(gltf.scene),center=box.getCenter(new Vector3()),scale=m.height/(box.max.y-box.min.y);
  gltf.scene.traverse(node=>{if(!(node instanceof Mesh))return;const materials=Array.isArray(node.material)?node.material:[node.material];
   // Each Kenney primitive is one mesh. The untextured default floor quad is not a tree part.
   if(!materials.some((mat:Material)=>mat.name==='_defaultMat')){
    let g=node.geometry.clone().applyMatrix4(node.matrixWorld);g.translate(-center.x,-box.min.y,-center.z);g.scale(scale*(i<3?.7:1),scale,scale*(i<3?.7:1));g.deleteAttribute('normal');g.deleteAttribute('uv');const smooth=mergeVertices(g);g.dispose();g=smooth;g.computeVertexNormals();
    const tone=materials.some((mat:Material)=>/wood/i.test(mat.name))?'bark':i>=3?'bush':'leaf';if(tone==='leaf'){const rounded=softenFoliage(g);g.dispose();g=rounded;}parts.push({geometry:g,tone,model:i});
   }
   node.geometry.dispose();materials.forEach((mat:Material)=>mat.dispose());
  });
 }}catch(e){parts.forEach(p=>p.geometry.dispose());throw e;}const radii=[.4,.4,.4];for(const part of parts.filter(p=>p.tone==='bark')){const a=part.geometry.getAttribute('position');for(let i=0;i<a.count;i++)if(a.getY(i)<2.3)radii[part.model]=Math.max(radii[part.model],Math.hypot(a.getX(i),a.getZ(i)));}return{manifest,parts,trunks:manifest.layout.trees.map(t=>({x:t.x,z:t.z,radius:radii[t.model]*t.scale}))};
}
function Batch({part,instances,material}:{part:Part;instances:Instance[];material:MeshStandardMaterial}){
 const mesh=useMemo(()=>{const m=new InstancedMesh(part.geometry,material,instances.length),obj=new Object3D();instances.forEach((t,i)=>{obj.position.set(t.x,0,t.z);obj.rotation.set(0,t.rotation,0);obj.scale.setScalar(t.scale);obj.updateMatrix();m.setMatrixAt(i,obj.matrix);});m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();m.castShadow=true;m.receiveShadow=true;return m;},[part,instances,material]);
 useEffect(()=>()=>{mesh.dispose();},[mesh]);return <primitive object={mesh} dispose={null}/>;
}
export default function ForestScene({input,low,areaHa,onReady,onFailure,command}:{input:React.RefObject<ForestInput>;low:boolean;areaHa:number;onReady:()=>void;onFailure:(s:string)=>void;command:number}){
 const {gl,scene,size,set,invalidate}=useThree(),camera=useMemo(()=>new PerspectiveCamera(60,1,.1,100),[]),light=useRef<DirectionalLight>(null);
 const [loaded,setLoaded]=useState<Loaded|null>(null),pose=useRef({position:[0,0] as [number,number],yaw:0,pitch:0}),keys=useRef(new Set<string>()),drag=useRef<{id:number;x:number;y:number}|null>(null),lastReset=useRef(0),renders=useRef(0),times=useRef<number[]>([]),lastReport=useRef(0);
 const palette=useMemo(()=>({leaf:new MeshStandardMaterial({color:'#486B43',roughness:1,metalness:0}),bark:new MeshStandardMaterial({color:'#66513A',roughness:1,metalness:0}),bush:new MeshStandardMaterial({color:'#3D5D36',roughness:1,metalness:0})}),[]);
 useEffect(()=>()=>Object.values(palette).forEach(m=>m.dispose()),[palette]);
 useLayoutEffect(()=>{const previous=scene.background,previousFog=scene.fog;camera.position.set(0,1.65,0);camera.rotation.order='YXZ';scene.background=new Color('#C8D1BF');scene.fog=new Fog('#C8D1BF',30,60);set({camera});gl.shadowMap.autoUpdate=false;gl.shadowMap.needsUpdate=true;invalidate();return()=>{scene.background=previous;scene.fog=previousFog;};},[camera,scene,gl,set,invalidate]);
 useEffect(()=>{camera.aspect=size.width/size.height;camera.updateProjectionMatrix();invalidate();},[camera,size,invalidate]);
 useEffect(()=>{let alive=true;const abort=new AbortController();loadModels(abort.signal).then(v=>{if(!alive){v.parts.forEach(p=>p.geometry.dispose());return;}setLoaded(v);gl.shadowMap.needsUpdate=true;invalidate();onReady();}).catch(e=>{if(alive)onFailure(String(e));});return()=>{alive=false;abort.abort();};},[]);
 useEffect(()=>()=>loaded?.parts.forEach(p=>p.geometry.dispose()),[loaded]);
 useEffect(()=>{const current=light.current;return()=>current?.shadow.dispose();},[]);
 useEffect(()=>{invalidate();},[command,invalidate]);
 const density=forestDensity(areaHa)??0,treeCount=illustrativeCount(loaded?.manifest.layout.trees.length||0,density);
 const colliders=useMemo(()=>loaded?.trunks.slice(0,treeCount)||[],[loaded,treeCount]);
 const startYaw=useMemo(()=>{const nearest=colliders.reduce<(typeof colliders)[number]|null>((a,t)=>!a||Math.hypot(t.x,t.z)<Math.hypot(a.x,a.z)?t:a,null);return nearest?Math.atan2(-nearest.x,-nearest.z):0;},[colliders]);
 useEffect(()=>{if(loaded){pose.current={position:[0,0],yaw:startYaw,pitch:0};invalidate();}},[loaded,startYaw,treeCount,invalidate]);
 const populations=useMemo(()=>{if(!loaded)return[];const all=[...loaded.manifest.layout.trees.slice(0,treeCount),...loaded.manifest.layout.shrubs.slice(0,illustrativeCount(loaded.manifest.layout.shrubs.length,density))];return names.map((_,i)=>all.filter((t,j)=>t.model===i&&(!low||Math.abs(t.x)<28&&Math.abs(t.z)<28||j%2===0)));},[loaded,low,treeCount,density]);
 useEffect(()=>{const canvas=gl.domElement;canvas.tabIndex=0;canvas.focus({preventScroll:true});const clear=()=>{keys.current.clear();drag.current=null;input.current.forward=0;input.current.side=0;input.current.lookX=0;input.current.lookY=0;};
  const keydown=(e:KeyboardEvent)=>{if(e.target instanceof HTMLElement&&(e.target.matches('input,textarea,select')||e.target.isContentEditable))return;const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){e.preventDefault();keys.current.add(k);invalidate();}};
  const keyup=(e:KeyboardEvent)=>{keys.current.delete(e.key.toLowerCase());};
  const down=(e:PointerEvent)=>{if(e.button!==0&&e.pointerType==='mouse')return;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY};};
  const move=(e:PointerEvent)=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;pose.current.yaw-=(e.clientX-d.x)*.004;pose.current.pitch=Math.max(-1.25,Math.min(1.25,pose.current.pitch-(e.clientY-d.y)*.003));d.x=e.clientX;d.y=e.clientY;invalidate();};
  const up=()=>{drag.current=null;};const visible=()=>{if(document.hidden)clear();};
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',visible);canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',clear);
  return()=>{clear();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visible);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',clear);};
 },[gl,input,invalidate]);
 useEffect(()=>{gl.shadowMap.needsUpdate=true;invalidate();},[populations,gl,invalidate]);
 useFrame((_,delta)=>{
  renders.current++;const p=pose.current,k=keys.current;const control=input.current;
  if(control.reset!==lastReset.current){lastReset.current=control.reset;p.position=[0,0];p.yaw=startYaw;p.pitch=0;}
  const forward=Math.max(-1,Math.min(1,control.forward+Number(k.has('w')||k.has('arrowup'))-Number(k.has('s')||k.has('arrowdown')))),side=Math.max(-1,Math.min(1,control.side+Number(k.has('d')||k.has('arrowright'))-Number(k.has('a')||k.has('arrowleft'))));
  const moving=!!loaded&&!document.hidden&&(forward!==0||side!==0);
  if(moving)p.position=stepForestPosition(p.position,forward,side,p.yaw,delta,colliders);
  camera.position.set(p.position[0],1.65,p.position[1]);camera.rotation.set(p.pitch,p.yaw,0,'YXZ');camera.updateMatrixWorld();if(moving)invalidate();
  const now=performance.now();times.current.push(now);if(times.current.length>1800)times.current.shift();if(now-lastReport.current<90&&moving)return;lastReport.current=now;
  queueMicrotask(()=>{const w=window.__MLBORNEO__;if(!w)return;Object.assign(w,{forest:{position:[...p.position],yaw:p.yaw,pitch:p.pitch,bounds:[-25,-25,25,25],treeCount,areaHa,densityFraction:density,renderedTrees:populations.slice(0,3).reduce((s,v)=>s+v.length,0),layoutSha256:loaded?.manifest.layoutSha256,walking:moving}});w.diagnostics={mode:'forest',renders:renders.current,triangles:gl.info.render.triangles,calls:gl.info.render.calls,geometries:gl.info.memory.geometries,textures:gl.info.memory.textures,programs:gl.info.programs?.length||0,camera:{position:camera.position.toArray(),yaw:p.yaw,pitch:p.pitch},frameTimes:times.current,renderer:gl.getContext().getParameter(gl.getContext().RENDERER)};});
 });
 return <>
  <ambientLight intensity={.45} color="#E1E6D1"/>
  <hemisphereLight args={['#E6EBCF','#655F42',2]}/>
  <directionalLight ref={light} position={[-35,65,25]} intensity={2.2} castShadow shadow-mapSize={[low?1024:2048,low?1024:2048]} shadow-camera-left={-80} shadow-camera-right={80} shadow-camera-top={80} shadow-camera-bottom={-80} shadow-camera-near={1} shadow-camera-far={180} shadow-normalBias={.12} shadow-bias={-.00015}/>
  <mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[240,240]}/><meshStandardMaterial color="#817D5A" roughness={1}/></mesh>
  {loaded?.parts.map((part,i)=><Batch key={i} part={part} instances={populations[part.model]} material={palette[part.tone]}/>)}
 </>;
}
