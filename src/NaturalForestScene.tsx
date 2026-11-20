import {useEffect,useLayoutEffect,useMemo,useRef,useState} from 'react';
import {useFrame,useThree} from '@react-three/fiber';
import {BufferGeometry,Color,DoubleSide,Fog,InstancedMesh,Mesh,MeshStandardMaterial,Object3D,PerspectiveCamera,RepeatWrapping,SRGBColorSpace,TextureLoader,Vector3} from 'three';
import type {DirectionalLight,Texture} from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {forestDensity,illustrativeCount} from './forestDensity';
import {FOREST_WALK_SPEED,stepForestPosition} from './forestMotion';
import {forestApproach} from './forestApproach';
import {addForestWind} from './forestWind';
import type {ForestInput} from './view';

interface Tree{id:string;x:number;z:number;model:number;rotation:number;scale:number;radius:number;}
interface Resource{file:string;sha256:string;kind?:number;lod?:number;}
interface Manifest{version:number;layout:{trees:Tree[];shrubs:Tree[]};layoutSha256:string;models:Resource[];understory:Resource;textures:Record<string,Resource>;learning:{treeId:string;noteId:string}[];}
interface Part{geometry:BufferGeometry;tone:string;kind:number;lod:number;}
interface Loaded{manifest:Manifest;parts:Part[];textures:Record<string,Texture>;materials:Record<string,MeshStandardMaterial>;dispose:()=>void;}
type Station='canopy'|'clearing'|null;
const clearing:[number,number]=[3.3,-12];
const clearingHeading=.29;
const foregroundPlants:Tree[]=[[-3.7,-3],[-4.6,-4.3],[3.8,-4.8],[4.5,-5.7],[-2.6,-10.7],[5.6,-9.7],[5.2,-13.8],[-2,-14.3]].map(([x,z],i)=>({id:'fern-'+i,x,z,model:2,rotation:i*2.39,scale:.68+(i%3)*.25,radius:0}));
interface Props{wind:boolean;reducedMotion:boolean;clearingButton:React.RefObject<HTMLButtonElement|null>;onStation:(station:Station)=>void;onCanopyView:(view:boolean)=>void;input:React.RefObject<ForestInput>;low:boolean;areaHa:number;reading:boolean;command:number;noteButtons:React.RefObject<(HTMLButtonElement|null)[]>;onOpenNote:(id:string)=>void;onReady:()=>void;onFailure:(message:string)=>void;}
async function assets(signal:AbortSignal,windTime:{value:number}):Promise<Loaded>{
 const response=await fetch('./forest-natural/manifest.json',{signal});if(!response.ok)throw Error('Natural forest manifest unavailable.');const manifest:Manifest=await response.json();
 if(manifest.version!==2||manifest.layout.trees.length!==160||manifest.models.length!==6)throw Error('Natural forest manifest is invalid.');
 const parts:Part[]=[],textures:Record<string,Texture>={},materials:Record<string,MeshStandardMaterial>={};
 const dispose=()=>{parts.forEach(p=>p.geometry.dispose());Object.values(textures).forEach(t=>t.dispose());Object.values(materials).forEach(m=>m.dispose());};
 const bytes=async(r:Resource)=>{const res=await fetch(`./forest-natural/${r.file}`,{signal});if(!res.ok)throw Error(`Forest resource unavailable: ${r.file}`);const data=await res.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==r.sha256)throw Error(`Forest resource checksum failed: ${r.file}`);return data;};
 try{
  for(const[key,resource]of Object.entries(manifest.textures)){
   const data=await bytes(resource);if(signal.aborted)throw Error('Forest loading cancelled.');const url=URL.createObjectURL(new Blob([data],{type:'image/png'}));let t:Texture;
   try{t=await new TextureLoader().loadAsync(url);}finally{URL.revokeObjectURL(url);}
   textures[key]=t!;if(key.includes('color')||key==='leaf')t!.colorSpace=SRGBColorSpace;if(key!=='leaf'){t!.wrapS=t!.wrapT=RepeatWrapping;}t!.anisotropy=4;
  }
  materials.bark=new MeshStandardMaterial({map:textures['bark-color'],normalMap:textures['bark-normal'],roughnessMap:textures['bark-arm'],roughness:1,metalness:0,color:'#EEE4D0'});materials.bark.normalScale.set(.25,.25);
  materials.leaf=new MeshStandardMaterial({map:textures.leaf,alphaTest:.42,side:DoubleSide,color:'#E4EACF',roughness:.88,metalness:0});
  addForestWind(materials.leaf,windTime);
  materials.ground=new MeshStandardMaterial({map:textures['ground-color'],normalMap:textures['ground-normal'],roughnessMap:textures['ground-arm'],color:'#AFB496',roughness:1,metalness:0});materials.ground.normalScale.set(.5,.5);
  for(const key of ['ground-color','ground-normal','ground-arm'])textures[key].repeat.set(59,59);
  const loader=new GLTFLoader();for(const resource of [...manifest.models,manifest.understory]){
   const gltf=await loader.parseAsync(await bytes(resource),'');gltf.scene.updateMatrixWorld(true);
   gltf.scene.traverse(node=>{if(!(node instanceof Mesh))return;parts.push({geometry:node.geometry.clone().applyMatrix4(node.matrixWorld),tone:node.name.startsWith('bark')?'bark':'leaf',kind:resource.kind??2,lod:resource.lod??0});node.geometry.dispose();(Array.isArray(node.material)?node.material:[node.material]).forEach(m=>m.dispose());});
  }
  return{manifest,parts,textures,materials,dispose};
 }catch(error){dispose();throw error;}
}
function Batch({part,instances,material,cast=true}:{part:Part;instances:Tree[];material:MeshStandardMaterial;cast?:boolean}){
 const mesh=useMemo(()=>{const m=new InstancedMesh(part.geometry,material,instances.length),o=new Object3D();for(let i=0;i<instances.length;i++){const t=instances[i];o.position.set(t.x,0,t.z);o.rotation.set(0,t.rotation,0);o.scale.setScalar(t.scale);o.updateMatrix();m.setMatrixAt(i,o.matrix);if(part.tone==='leaf')m.setColorAt(i,new Color().setHSL(.21+.035*Math.sin(t.x),.12+.05*Math.cos(t.z),.84+.095*Math.cos(t.x+t.z)));}m.computeBoundingSphere();m.castShadow=cast;m.receiveShadow=true;return m;},[part,instances,material,cast]);useEffect(()=>()=>{mesh.dispose();},[mesh]);return <primitive object={mesh} dispose={null}/>;
}
export default function NaturalForestScene({input,low,areaHa,reading,command,wind,reducedMotion,clearingButton,onStation,onCanopyView,noteButtons,onOpenNote,onReady,onFailure}:Props){
 const {gl,scene,size,set,invalidate}=useThree(),camera=useMemo(()=>new PerspectiveCamera(60,1,.1,125),[]),light=useRef<DirectionalLight>(null),[loaded,setLoaded]=useState<Loaded|null>(null);
 const pose=useRef({position:[0,0] as [number,number],yaw:0,pitch:0}),keys=useRef(new Set<string>()),drag=useRef<{id:number;x:number;y:number}|null>(null),lastReset=useRef(0),renders=useRef(0),lastReport=useRef(0),times=useRef<number[]>([]),readingRef=useRef(reading),callbacks=useRef({onOpenNote,onReady,onFailure}),nearest=useRef<string|null>(null),clearRef=useRef(()=>{});
 const windTime=useRef({value:0}).current;
 const lastAction=useRef<ForestInput['action']>(undefined);
 const route=useRef<[number,number][]>([]),lookTarget=useRef<number|null>(null);
 const activeStation=useRef<Station>(null),lookingUp=useRef(false);
 const clearingPoint=useMemo(()=>new Vector3(clearing[0],1.15,clearing[1]),[]);
 readingRef.current=reading;callbacks.current={onOpenNote,onReady,onFailure};
 const density=forestDensity(areaHa)??0,treeCount=illustrativeCount(160,density),trees=useMemo(()=>loaded?.manifest.layout.trees.slice(0,treeCount)||[],[loaded,treeCount]);
 const populations=useMemo(()=>{if(!loaded)return[];return loaded.parts.map(p=>p.kind===2?[...foregroundPlants,...loaded.manifest.layout.shrubs.slice(0,illustrativeCount(64,density)).filter((_,i)=>!low||i%2===0)]:trees.filter(t=>{const distance=Math.hypot(t.x,t.z),lod=distance<18?(low?1:0):distance<38?1:2;return t.model===p.kind&&lod===p.lod;}));},[loaded,trees,density,low]);
 const colliders=useMemo(()=>trees.map(t=>({x:t.x,z:t.z,radius:t.radius*t.scale})),[trees]);
 const anchors=useMemo(()=>loaded?loaded.manifest.learning.map((n,i)=>{const t=trees.find(t=>t.id===n.treeId);if(!t)return null;const direction=new Vector3(-t.x,0,-t.z).normalize();return{...n,index:i,tree:t,point:new Vector3(t.x,1.65,t.z).addScaledVector(direction,t.radius*t.scale+.05),direction};}):[],[loaded,trees]);
 useLayoutEffect(()=>{const background=scene.background,fog=scene.fog;scene.background=new Color('#C7D1C4');scene.fog=new Fog('#C7D1C4',26,97);camera.position.set(0,1.65,0);camera.rotation.order='YXZ';set({camera});gl.shadowMap.autoUpdate=false;gl.shadowMap.needsUpdate=true;invalidate();return()=>{scene.background=background;scene.fog=fog;};},[scene,camera,set,gl,invalidate]);
 useEffect(()=>{camera.aspect=size.width/size.height;camera.updateProjectionMatrix();invalidate();},[camera,size,invalidate]);
 useEffect(()=>{let active=true;const abort=new AbortController();assets(abort.signal,windTime).then(value=>{if(!active){value.dispose();return;}setLoaded(value);invalidate();callbacks.current.onReady();}).catch(e=>{if(active)callbacks.current.onFailure(String(e));});return()=>{active=false;abort.abort();};},[invalidate,windTime]);
 useEffect(()=>()=>loaded?.dispose(),[loaded]);useEffect(()=>{const shadow=light.current?.shadow;return()=>shadow?.dispose();},[]);
 useEffect(()=>{gl.shadowMap.needsUpdate=true;invalidate();},[loaded,treeCount,low,gl,invalidate]);
 useEffect(()=>{
  if(!loaded||!wind||reading){invalidate();return;}
  let previous=performance.now();
  const timer=window.setInterval(()=>{
   const now=performance.now();
   if(!document.hidden){windTime.value+=Math.min(.07,(now-previous)/1000);invalidate();}
   previous=now;
  },33);
  return()=>window.clearInterval(timer);
 },[loaded,wind,reading,windTime,invalidate]);
 useEffect(()=>{if(reducedMotion){windTime.value=0;invalidate();}},[reducedMotion,windTime,invalidate]);
 useEffect(()=>{if(reading)clearRef.current();invalidate();},[reading,command,invalidate]);
 useEffect(()=>{const canvas=gl.domElement;canvas.tabIndex=0;canvas.focus({preventScroll:true});
  const clear=()=>{input.current.action=undefined;keys.current.clear();drag.current=null;input.current.forward=input.current.side=input.current.lookX=input.current.lookY=0;};clearRef.current=clear;
  const keydown=(e:KeyboardEvent)=>{if(readingRef.current||e.target instanceof HTMLElement&&(e.target.closest('input,textarea,select,[data-note-panel]')||e.target.isContentEditable))return;const key=e.key.toLowerCase();if(key==='e'&&nearest.current&&!e.repeat){e.preventDefault();clear();callbacks.current.onOpenNote(nearest.current);return;}if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){if(e.repeat)return;e.preventDefault();input.current.action=undefined;keys.current.add(key);invalidate();}};
  const keyup=(e:KeyboardEvent)=>keys.current.delete(e.key.toLowerCase());
  const down=(e:PointerEvent)=>{if(readingRef.current||e.pointerType==='mouse'&&e.button!==0)return;input.current.action=undefined;canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY};};
  const move=(e:PointerEvent)=>{const d=drag.current;if(readingRef.current||!d||d.id!==e.pointerId)return;pose.current.yaw-=(e.clientX-d.x)*.004;pose.current.pitch=Math.max(-1.2,Math.min(1.2,pose.current.pitch-(e.clientY-d.y)*.003));d.x=e.clientX;d.y=e.clientY;invalidate();};
  const up=()=>{drag.current=null;};const visible=()=>{if(document.hidden)clear();else invalidate();};
  window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clear);document.addEventListener('visibilitychange',visible);canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',clear);
  return()=>{clear();window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visible);canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',clear);};
 },[gl,input,invalidate]);
 useFrame((_,delta)=>{
  renders.current++;const p=pose.current,k=keys.current,c=input.current;if(c.reset!==lastReset.current){lastReset.current=c.reset;p.position=[0,0];p.yaw=0;p.pitch=0;lookingUp.current=false;onCanopyView(false);clearRef.current();}
  const forward=Math.max(-1,Math.min(1,c.forward+Number(k.has('w')||k.has('arrowup'))-Number(k.has('s')||k.has('arrowdown')))),side=Math.max(-1,Math.min(1,c.side+Number(k.has('d')||k.has('arrowright'))-Number(k.has('a')||k.has('arrowleft'))));
  if(c.action!==lastAction.current){
   lastAction.current=c.action;
   route.current=[];
   lookTarget.current=null;
   if(c.action?.kind==='lookUp'){
    const tree=trees[0];
    if(tree&&!lookingUp.current)p.yaw=Math.atan2(p.position[0]-tree.x,p.position[1]-tree.z);
    lookingUp.current=!lookingUp.current;
    onCanopyView(lookingUp.current);
    lookTarget.current=lookingUp.current?1.08:0;
   }
   if(c.action?.kind==='approach'){
    const anchor=anchors.find(a=>a?.noteId===c.action?.noteId);
    const destination:[number,number]|undefined=c.action.noteId==='clearing'?clearing:
     anchor?[anchor.point.x+anchor.direction.x*1.65,anchor.point.z+anchor.direction.z*1.65]:undefined;
    if(destination){
     route.current=forestApproach(p.position,destination,colliders);
     if(route.current.length&&reducedMotion){
      p.position=[...destination];
      p.pitch=0;
      if(c.action.noteId==='clearing')p.yaw=clearingHeading;
      route.current=[];
     }
     if(anchor&&reducedMotion)p.yaw=Math.atan2(p.position[0]-anchor.tree.x,p.position[1]-anchor.tree.z);
    }
   }
  }
  if(lookTarget.current!==null){
   const adjust=lookTarget.current-p.pitch;
   if(reducedMotion||Math.abs(adjust)<.012){p.pitch=lookTarget.current;lookTarget.current=null;}
   else{p.pitch+=adjust*Math.min(1,Math.max(delta,1/120)*8);invalidate();}
  }
  const waypoint=route.current[0];
  if(waypoint&&!readingRef.current&&!document.hidden){
   const dx=waypoint[0]-p.position[0],dz=waypoint[1]-p.position[1],distance=Math.hypot(dx,dz);
   const direction=Math.atan2(-dx,-dz),turn=direction-p.yaw;
   if(distance<.09){
    route.current.shift();
    if(!route.current.length){
     const tree=anchors.find(a=>a?.noteId===c.action?.noteId)?.tree;
     if(tree)p.yaw=Math.atan2(p.position[0]-tree.x,p.position[1]-tree.z);
     else if(c.action?.noteId==='clearing')p.yaw=clearingHeading;
    }
   }else{
    p.yaw+=Math.atan2(Math.sin(turn),Math.cos(turn))*Math.min(1,delta*7);
    p.pitch*=1-Math.min(1,delta*5);
    p.position=stepForestPosition(p.position,1,0,direction,Math.min(delta,distance/FOREST_WALK_SPEED),colliders);
   }
   invalidate();
  }
  const moving=!!loaded&&!readingRef.current&&!document.hidden&&(!!forward||!!side);if(moving)p.position=stepForestPosition(p.position,forward,side,p.yaw,delta,colliders);
  const edge=document.querySelector<HTMLElement>('[data-walk-boundary]');if(edge)edge.hidden=Math.max(Math.abs(p.position[0]),Math.abs(p.position[1]))<24.8;camera.position.set(p.position[0],1.65,p.position[1]);camera.rotation.set(p.pitch,p.yaw,0,'YXZ');camera.updateMatrixWorld();if(moving)invalidate();
  const byClearing=Math.hypot(p.position[0]-clearing[0],p.position[1]-clearing[1])<1.2;
  const tree=trees[0],byCanopy=!!tree&&Math.hypot(p.position[0]-tree.x,p.position[1]-tree.z)<3.3;
  const station=byClearing?'clearing':byCanopy?'canopy':null;
  if(activeStation.current!==station){activeStation.current=station;onStation(station);}
  if(clearingButton.current){
   const pin=clearingPoint.clone().project(camera);
   const projected=pin.z>0&&pin.z<1&&Math.abs(pin.x)<.69&&Math.abs(pin.y)<.69;
   const button=clearingButton.current;
   button.hidden=!loaded||byClearing||!!waypoint||readingRef.current||lookingUp.current;
   button.dataset.projected=String(projected);
   button.style.transform='';
   if(projected)button.style.transform='translate3d('+((pin.x+1)*size.width/2)+'px,'+((1-pin.y)*size.height/2+34)+'px,0) translate(-50%,-50%)';
  }
  const visible=anchors.filter(a=>{if(!a||readingRef.current||waypoint)return false;const v=a.point.clone().project(camera),distance=Math.hypot(p.position[0]-a.tree.x,p.position[1]-a.tree.z)-a.tree.radius*a.tree.scale;
   if(distance>9||v.z>1||Math.abs(v.x)>.96||Math.abs(v.y)>.94||a.direction.dot(new Vector3(p.position[0]-a.tree.x,0,p.position[1]-a.tree.z).normalize())<.15)return false;
   const dx=a.point.x-p.position[0],dz=a.point.z-p.position[1],d2=dx*dx+dz*dz;
   return!colliders.some(t=>{if(t.x===a.tree.x&&t.z===a.tree.z)return false;const u=((t.x-p.position[0])*dx+(t.z-p.position[1])*dz)/d2;return u>0&&u<.96&&Math.hypot(t.x-p.position[0]-u*dx,t.z-p.position[1]-u*dz)<t.radius;});
  }).sort((a,b)=>a!.point.distanceToSquared(camera.position)-b!.point.distanceToSquared(camera.position));
  const active=visible[0];nearest.current=null;noteButtons.current.forEach((el,i)=>{if(!el)return;const a=active?.index===i?active:null;el.style.visibility=a?'visible':'hidden';if(!a){el.disabled=true;return;}const v=a.point.clone().project(camera),near=Math.hypot(p.position[0]-a.tree.x,p.position[1]-a.tree.z)-a.tree.radius*a.tree.scale<=2.6;el.style.transform=`translate3d(${(v.x+1)*size.width/2}px,${(1-v.y)*size.height/2}px,0) translate(-50%,-50%)`;el.disabled=false;el.dataset.near=String(near);el.setAttribute('aria-label',(near?'Read note: ':'Walk closer: ')+el.querySelector('span')?.textContent);if(near)nearest.current=a.noteId;});
  const now=performance.now();times.current.push(now);if(times.current.length>1800)times.current.shift();if(now-lastReport.current<90&&(moving||waypoint||wind))return;lastReport.current=now;
  queueMicrotask(()=>{const w=window.__MLBORNEO__;if(!w)return;Object.assign(w,{forest:{position:[...p.position],yaw:p.yaw,pitch:p.pitch,bounds:[-25,-25,25,25],treeCount,areaHa,densityFraction:density,renderedTrees:loaded?treeCount:0,layoutSha256:loaded?.manifest.layoutSha256,walking:moving||!!waypoint,windTime:windTime.value,station,nearbyNoteId:nearest.current,reading:readingRef.current,learningTrees:anchors.filter(Boolean).map(a=>({id:a!.noteId,x:a!.tree.x,z:a!.tree.z}))}});w.diagnostics={mode:'forest',renders:renders.current,triangles:gl.info.render.triangles,calls:gl.info.render.calls,geometries:gl.info.memory.geometries,textures:gl.info.memory.textures,programs:gl.info.programs?.length||0,camera:{position:camera.position.toArray(),yaw:p.yaw,pitch:p.pitch},frameTimes:times.current,renderer:gl.getContext().getParameter(gl.getContext().RENDERER)};});
 });
 return <>
  <ambientLight intensity={.35} color="#DBE1CB"/><hemisphereLight args={['#D8E1D0','#A3A58C',2.4]}/>
  <directionalLight ref={light} position={[-28,55,20]} intensity={1.8} castShadow shadow-mapSize={[low?1024:2048,low?1024:2048]} shadow-camera-left={-60} shadow-camera-right={60} shadow-camera-top={60} shadow-camera-bottom={-60} shadow-camera-near={1} shadow-camera-far={160} shadow-normalBias={.035} shadow-bias={-.00008}/>
  {loaded&&<><mesh rotation-x={-Math.PI/2} receiveShadow><planeGeometry args={[240,240]}/><primitive object={loaded.materials.ground} attach="material" dispose={null}/></mesh>
   {loaded.parts.map((part,i)=><Batch key={i} part={part} instances={populations[i]} material={loaded.materials[part.tone]} cast={part.kind!==2}/>)}</>}
  {anchors.map(a=>a&&<mesh key={a.noteId} position={a.point} rotation-y={Math.atan2(a.direction.x,a.direction.z)} castShadow><planeGeometry args={[.43,.5]}/><meshStandardMaterial color="#F0DDA0" roughness={1}/></mesh>)}
 </>;
}
