import {forwardRef,lazy,Suspense,useEffect,useLayoutEffect,useMemo,useRef,useState,useImperativeHandle} from 'react';
import {Canvas,useThree,useFrame,type ThreeEvent} from '@react-three/fiber';
import {OrbitControls} from '@react-three/drei';
import {BufferGeometry,Float32BufferAttribute,Uint32BufferAttribute,ShaderMaterial,TextureLoader,DataTexture,RGBAFormat,NearestFilter,LinearFilter,NoColorSpace,Vector3,LineBasicMaterial} from 'three';
import type {Texture,OrthographicCamera} from 'three';
import type {OrbitControls as OrbitImpl} from 'three-stdlib';
import type {Cell,MapData,Selection,StudyData} from './data';
import {toWorld,fromWorld} from './data';
import type {ForestInput,MapViewState,ViewMode} from './view';
import {project} from './geo';
import {labels} from './labels';
import {imagePixels,isLand} from './surfaces';
import {vertex,fragment} from './mapMaterial';
import Relief,{makeTerrainDepth} from './Relief';
import s from './App.module.css';
const ForestScene=lazy(()=>import('./NaturalForestScene'));
export interface MapHandle{reset:()=>void;top:()=>void;zoom:(factor:number)=>void;snapshot:()=>MapViewState|undefined;restore:(state:MapViewState)=>void;focusCell?:(cell:Cell,onComplete?:()=>void)=>void;cancelFocus?:()=>void;}
export interface Diagnostics{mode:string;renders:number;triangles:number;geometries:number;textures:number;programs:number;camera:unknown;frameTimes:number[];renderer:string;calls?:number;}
declare global{interface Window{__MLBORNEO__?:{diagnostics:Diagnostics|null;selection:string|null;ready:boolean;stage?:string;chosenCase?:string|null;viewMode?:ViewMode;forest?:{position:number[];yaw:number;pitch:number;bounds:number[];treeCount:number;renderedTrees:number;layoutSha256?:string;walking:boolean};layers?:{forest:boolean;priority:boolean;change?:boolean;rotating?:boolean;flat:boolean;low:boolean};};}}
interface Props{data:MapData;tourOrbit:boolean;onTourOrbitComplete:()=>void;study?:StudyData;pendingPoint:[number,number]|null;onMapPoint:(x:number,y:number,land:boolean)=>void;forest:boolean;priority:boolean;change:boolean;rotating:boolean;low:boolean;selection:Selection;onSelect:(s:Selection)=>void;onFailure:(message:string)=>void;onReady:()=>void;viewMode:ViewMode;restoreView?:MapViewState;forestInput:React.RefObject<ForestInput>;forestCommand:number;forestAreaHa:number;reading:boolean;wind:boolean;reducedMotion:boolean;clearingButton:React.RefObject<HTMLButtonElement|null>;onStation:(station:'canopy'|'clearing'|null)=>void;onCanopyView:(looking:boolean)=>void;noteButtons:React.RefObject<(HTMLButtonElement|null)[]>;onOpenNote:(id:string)=>void;onForestFailure:(message:string)=>void;}
type Gesture={x:number;y:number;moved:boolean}|null;
function buildGeometry(data:MapData,segments:number,b:number[]){
 const positions=[],uv=[],indices=[],full=data.geo.bounds;
 for(let y=0;y<=segments;y++)for(let x=0;x<=segments;x++){const px=b[0]+x/segments*(b[2]-b[0]),py=b[3]-y/segments*(b[3]-b[1]);const w=toWorld(data,px,py);positions.push(...w);uv.push((px-full[0])/(full[2]-full[0]),(py-full[1])/(full[3]-full[1]));}
 for(let y=0;y<segments;y++)for(let x=0;x<segments;x++){const i=y*(segments+1)+x;indices.push(i,i+segments+1,i+1,i+1,i+segments+1,i+segments+2);}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.setIndex(new Uint32BufferAttribute(indices,1));g.computeVertexNormals();return g;
}
function GeoScene({data,forest,priority,change,rotating,tourOrbit,onTourOrbitComplete,low,selection,study,pendingPoint,onMapPoint,onFailure,onReady,viewMode,restoreView,camera,api,labelNodes,marker,gesture}:{camera:OrthographicCamera;api:React.RefObject<MapHandle|null>;labelNodes:React.RefObject<(HTMLSpanElement|null)[]>;marker:React.RefObject<HTMLSpanElement|null>;gesture:React.RefObject<Gesture>}&Props){
 const {gl,size,invalidate,set}=useThree(),controls=useRef<OrbitImpl>(null),[textures,setTextures]=useState<Texture[]|null>(null),landPixels=useRef<ImageData|null>(null),[detailed,setDetailed]=useState(false),lastFit=useRef<number|null>(null),interacting=useRef(false),sway=useRef(0),tourAngle=useRef(0),orbitStart=useRef<{target:Vector3;polar:number;zoom:number}|null>(null),offset=useRef(new Vector3()),up=useMemo(()=>new Vector3(0,1,0),[]);
 useEffect(()=>{tourAngle.current=0;orbitStart.current=null;invalidate();},[tourOrbit,invalidate]);
 const framing=data.geo.viewBounds||data.geo.bounds;
 const target=useMemo(()=>{const p=toWorld(data,(framing[0]+framing[2])/2,(framing[1]+framing[3])/2);return new Vector3(p[0],0,p[2]);},[data]);
 const diameter=Math.hypot(framing[2]-framing[0],framing[3]-framing[1])/1000,fit=Math.min(size.width/diameter,size.height/(diameter+70))*(size.width<600?1.08:1.28);
 const geometry=useMemo(()=>buildGeometry(data,detailed?(low?320:512):(low?192:256),data.geo.bounds),[data,detailed,low]);
 useEffect(()=>()=>geometry.dispose(),[geometry]);
 const focus=useRef<{elapsed:number;duration:number;from:Vector3;to:Vector3;offset:Vector3;zoom:number;endZoom:number;onComplete?:()=>void}|null>(null);
 const selected=useMemo(()=>pendingPoint?new Vector3(...toWorld(data,...pendingPoint)):selection?.kind==='cell'?new Vector3(...toWorld(data,(selection.cell.col+.5)*1000,-(selection.cell.row+.5)*1000)):null,[data,selection,pendingPoint]);
 const snapshot=():MapViewState=>({mode:'3d',referenceFit:fit,viewport:[size.width,size.height],position:camera.position.toArray(),zoom:camera.zoom,target:controls.current?.target.toArray()||target.toArray()});
 const apply=(v?:MapViewState)=>{if(v?.mode==='3d'&&v.position&&v.target){camera.position.fromArray(v.position);controls.current?.target.fromArray(v.target);camera.zoom=v.referenceFit?v.zoom/v.referenceFit*fit:v.zoom;}else{camera.position.copy(target).add(new Vector3(0,1350,1132.785));controls.current?.target.copy(target);camera.zoom=fit;}camera.left=-size.width/2;camera.right=size.width/2;camera.top=size.height/2;camera.bottom=-size.height/2;camera.updateProjectionMatrix();controls.current?.update();invalidate();};
 useLayoutEffect(()=>{set({camera});const ratio=lastFit.current?camera.zoom/lastFit.current:1;if(lastFit.current===null)apply(restoreView);else{camera.left=-size.width/2;camera.right=size.width/2;camera.top=size.height/2;camera.bottom=-size.height/2;camera.zoom=fit*ratio;camera.updateProjectionMatrix();controls.current?.update();}lastFit.current=fit;invalidate();},[camera,fit,target]);
 useImperativeHandle(api,()=>({reset:()=>apply(),top:()=>{camera.position.copy(target).add(new Vector3(0,1750,.01));controls.current?.update();invalidate();},zoom:f=>{camera.zoom=Math.max(fit*.8,Math.min(fit*3,camera.zoom*f));camera.updateProjectionMatrix();controls.current?.update();invalidate();},snapshot,restore:v=>apply(v),cancelFocus:()=>{focus.current=null;},focusCell:(cell,onComplete)=>{
  if(!controls.current)return;
  const to=new Vector3(...toWorld(data,(cell.col+.5)*1000,-(cell.row+.5)*1000));
  const from=controls.current.target.clone();
  focus.current={elapsed:0,duration:onComplete?1.55:.4,from,to:onComplete?to:from.clone().lerp(to,.6),offset:camera.position.clone().sub(from),zoom:camera.zoom,endZoom:onComplete?fit*2.4:Math.min(camera.zoom*1.28,fit*3),onComplete};invalidate();
 }}),[camera,fit,target,size]);
 useEffect(()=>{let alive=true,committed=false;const created:Texture[]=[],loader=new TextureLoader();const load=async(file:string)=>{const t=await loader.loadAsync(`./data/${file}`);created.push(t);t.colorSpace=NoColorSpace;t.minFilter=LinearFilter;t.magFilter=LinearFilter;t.generateMipmaps=false;if(!alive)t.dispose();return t;};const blank=()=>{const t=new DataTexture(new Uint8Array([0,0,0,0]),1,1,RGBAFormat);created.push(t);t.needsUpdate=true;return t;};
 Promise.all([load(data.geo.land.low),data.geo.forest.status==='ready'?load(data.geo.forest.low).catch(()=>blank()):Promise.resolve(blank()),load('study.png'),data.activity?load('activity.png'):Promise.resolve(blank()),imagePixels(data.geo.land.low)]).then(([land,forest,study,outcome,pixels])=>{if(!alive)return;for(const t of[study,outcome]){t.minFilter=NearestFilter;t.magFilter=NearestFilter;}landPixels.current=pixels;committed=true;setTextures([land,forest,study,outcome]);onReady();invalidate();}).catch(e=>{if(alive)onFailure(`3D resources unavailable: ${String(e)}`);});return()=>{alive=false;if(!committed)created.forEach(t=>t.dispose());};},[data,low]);
 useEffect(()=>()=>textures?.forEach(t=>t.dispose()),[textures]);
 const material=useMemo(()=>{if(!textures)return null;const g=data.meta.grid;return new ShaderMaterial({vertexShader:vertex,fragmentShader:fragment,transparent:true,toneMapped:false,uniforms:{landMap:{value:textures[0]},forestMap:{value:textures[1]},studyMap:{value:textures[2]},changeMap:{value:textures[3]},bounds:{value:data.geo.bounds},studyBounds:{value:[g.minCol*1000,-(g.maxRow+1)*1000,(g.maxCol+1)*1000,-g.minRow*1000]},studySize:{value:[g.width,g.height]},showForest:{value:forest?1:0},showPriority:{value:priority?1:0},showChange:{value:change?1:0}}});},[textures,data]);
 useEffect(()=>{
  if(!material||!textures||!detailed||low||data.geo.forest.status!=='ready')return;
  let active=true;
  let high:Texture|undefined;
  new TextureLoader().loadAsync(`./data/${data.geo.forest.desktop}`).then(texture=>{
   if(!active){texture.dispose();return;}
   high=texture;high.colorSpace=NoColorSpace;high.minFilter=LinearFilter;high.magFilter=LinearFilter;high.generateMipmaps=false;
   material.uniforms.forestMap.value=high;invalidate();
  }).catch(()=>{});
  return()=>{active=false;material.uniforms.forestMap.value=textures[1];high?.dispose();};
 },[material,textures,detailed,low,data.geo.forest,invalidate]);
 const depth=useMemo(()=>material?makeTerrainDepth(material.uniforms):null,[material]);
 useEffect(()=>()=>{material?.dispose();depth?.dispose();},[material,depth]);
 useEffect(()=>{if(material){material.uniforms.showForest.value=forest?1:0;material.uniforms.showPriority.value=priority?1:0;material.uniforms.showChange.value=change?1:0;invalidate();}},[forest,priority,change,material,invalidate]);
 const boundaries=useMemo(()=>{const coords:number[]=[];for(const f of data.geo.features)for(const ring of f.rings)for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];if(Math.hypot(b[0]-a[0],b[1]-a[1])>30000)continue;for(const p of[a,b]){const w=toWorld(data,p[0],p[1]);w[1]+=.16;coords.push(...w);}}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(coords,3));return g;},[data]);
 const lineMaterial=useMemo(()=>new LineBasicMaterial({color:'#657460',transparent:true,opacity:.55}),[]);
 const selectedGeometry=useMemo(()=>{const coords:number[]=[];if(selection?.kind==='cell'){const c=selection.cell,points=[[c.col*1000,-c.row*1000],[(c.col+1)*1000,-c.row*1000],[(c.col+1)*1000,-(c.row+1)*1000],[c.col*1000,-(c.row+1)*1000],[c.col*1000,-c.row*1000]];for(let i=1;i<points.length;i++)for(let j=0;j<=32;j++){const t=j/32,p=toWorld(data,points[i-1][0]*(1-t)+points[i][0]*t,points[i-1][1]*(1-t)+points[i][1]*t);p[1]+=.003;coords.push(...p);}}const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(coords,3));return g;},[data,selection]);
 const selectedMaterial=useMemo(()=>new LineBasicMaterial({color:'#202D27',transparent:true,opacity:1,depthTest:false,depthWrite:false}),[]);
 useEffect(()=>()=>boundaries.dispose(),[boundaries]);useEffect(()=>()=>selectedGeometry.dispose(),[selectedGeometry]);useEffect(()=>()=>lineMaterial.dispose(),[lineMaterial]);useEffect(()=>()=>selectedMaterial.dispose(),[selectedMaterial]);
 const labelPositions=useMemo(()=>labels.map(l=>{const[x,y]=project(l.lon,l.lat),p=toWorld(data,x,y);p[1]+=2;return new Vector3(...p);}),[data]);
 const renders=useRef(0),times=useRef<number[]>([]),lastReport=useRef(0);
 useFrame((_,delta)=>{renders.current++;
 if(focus.current&&controls.current&&!document.hidden){
  const f=focus.current;
  f.elapsed+=Math.min(delta,.1);
  const t=Math.min(1,f.elapsed/f.duration),ease=t*t*(3-2*t);
  controls.current.target.copy(f.from).lerp(f.to,ease);
  camera.position.copy(controls.current.target).add(f.offset);
  camera.zoom=f.zoom+(f.endZoom-f.zoom)*ease;
  camera.updateProjectionMatrix();controls.current.update();
  if(t===1&&f.elapsed>=f.duration+(f.onComplete?.55:0)){focus.current=null;f.onComplete?.();}else invalidate();
 }
 if(tourOrbit&&!document.hidden&&controls.current&&tourAngle.current<2*Math.PI){
  const angle=Math.min(2*Math.PI-tourAngle.current,Math.min(delta,.1)*2*Math.PI/12);
  tourAngle.current+=angle;
  const orbit=controls.current;
  const start=orbitStart.current??={target:orbit.target.clone(),polar:orbit.getPolarAngle(),zoom:camera.zoom};
  const blend=Math.min(1,tourAngle.current/.5);
  const ease=blend*blend*(3-2*blend);
  offset.current.copy(camera.position).sub(orbit.target).applyAxisAngle(up,angle);
  const radius=offset.current.length(),polar=start.polar+(38*Math.PI/180-start.polar)*ease;
  offset.current.set(Math.sin(orbit.getAzimuthalAngle()+angle)*radius*Math.sin(polar),radius*Math.cos(polar),Math.cos(orbit.getAzimuthalAngle()+angle)*radius*Math.sin(polar));
  orbit.target.copy(start.target).lerp(target,ease);
  camera.position.copy(orbit.target).add(offset.current);
  camera.zoom=start.zoom+(fit*.89-start.zoom)*ease;
  camera.updateProjectionMatrix();orbit.update();
  if(tourAngle.current>=2*Math.PI)onTourOrbitComplete();else invalidate();
 }else if(!tourOrbit&&viewMode==='overview'&&rotating&&!document.hidden){if(!interacting.current&&controls.current){const prior=sway.current;sway.current+=Math.min(delta,.1)*2*Math.PI/100;offset.current.copy(camera.position).sub(controls.current.target).applyAxisAngle(up,(Math.sin(sway.current)-Math.sin(prior))*.22);camera.position.copy(controls.current.target).add(offset.current);controls.current.update();}invalidate();}camera.updateMatrixWorld();
 if(marker.current&&selected){const v=selected.clone().project(camera);marker.current.style.transform=`translate3d(${(v.x+1)*size.width/2}px,${(1-v.y)*size.height/2}px,0) translate(-50%, -50%)`;marker.current.style.visibility=Math.abs(v.x)<.99&&Math.abs(v.y)<.99?'visible':'hidden';}
 labelPositions.forEach((p,i)=>{const el=labelNodes.current[i];if(!el)return;const v=p.clone().project(camera);el.style.transform=`translate3d(${(v.x+1)*size.width/2}px,${(1-v.y)*size.height/2}px,0) translate(-50%,-50%)`;el.style.visibility=Math.abs(v.x)>1.1||Math.abs(v.y)>1.1?'hidden':'visible';});
 const now=performance.now();times.current.push(now);if(times.current.length>1800)times.current.shift();if(now-lastReport.current<90&&rotating)return;lastReport.current=now;const view={...snapshot(),polar:controls.current?.getPolarAngle(),azimuth:controls.current?.getAzimuthalAngle(),samples:Object.fromEntries(Object.entries(study?.meta.sampleIDs??{}).map(([key,id])=>{const c=study!.find(id)!,p=new Vector3(...toWorld(data,(c.col+.5)*1000,-(c.row+.5)*1000)).project(camera);return[key,{x:(p.x+1)*size.width/2,y:(1-p.y)*size.height/2}];}))};queueMicrotask(()=>{if(window.__MLBORNEO__)window.__MLBORNEO__.diagnostics={mode:'3d',renders:renders.current,triangles:gl.info.render.triangles,calls:gl.info.render.calls,geometries:gl.info.memory.geometries,textures:gl.info.memory.textures,programs:gl.info.programs?.length||0,camera:view,frameTimes:times.current,renderer:gl.getContext().getParameter(gl.getContext().RENDERER)};});});
 useEffect(()=>{const visible=()=>invalidate();document.addEventListener('visibilitychange',visible);return()=>document.removeEventListener('visibilitychange',visible);},[invalidate]);
 const pick=(e:ThreeEvent<PointerEvent>)=>{const start=gesture.current;gesture.current=null;e.stopPropagation();if(viewMode!=='overview'||!start||start.moved||Math.hypot(e.nativeEvent.clientX-start.x,e.nativeEvent.clientY-start.y)>5||!landPixels.current)return;const[x,y]=fromWorld(data,e.point.x,e.point.z);onMapPoint(x,y,isLand(data,landPixels.current,x,y));};
 return <>
 <OrbitControls ref={controls} camera={camera} enablePan={false} enableDamping={false} minPolarAngle={10*Math.PI/180} maxPolarAngle={40*Math.PI/180} minZoom={fit*.8} maxZoom={fit*3} rotateSpeed={.35} zoomSpeed={.7} onChange={()=>{setDetailed(camera.zoom/fit>1.65);invalidate();}} onStart={()=>{interacting.current=true;}} onEnd={()=>{interacting.current=false;invalidate();}}/>
 {material&&depth&&<mesh geometry={geometry} material={material} customDepthMaterial={depth} castShadow onPointerUp={pick}/>}
 {textures&&<Relief data={data} surface={geometry} land={textures[0]} priority={priority} change={change}/>}
 <lineSegments geometry={boundaries} material={lineMaterial}/>{selection?.kind==='cell'&&<lineLoop geometry={selectedGeometry} material={selectedMaterial} renderOrder={12}/>}
 </>;
}
function ContextStatus({onFailure}:{onFailure:(message:string)=>void}){const {gl}=useThree(),callback=useRef(onFailure);callback.current=onFailure;useEffect(()=>{const canvas=gl.domElement;const lost=(e:Event)=>{e.preventDefault();callback.current('WebGL was interrupted. Showing the flat map.');};canvas.addEventListener('webglcontextlost',lost);return()=>canvas.removeEventListener('webglcontextlost',lost);},[gl]);return null;}
export default forwardRef<MapHandle,Props>(function Map3D(props,ref){const currentProps=useRef(props);currentProps.current=props;const api=useRef<MapHandle|null>(null),labelNodes=useRef<(HTMLSpanElement|null)[]>([]),gesture=useRef<Gesture>(null),marker=useRef<HTMLSpanElement>(null),[mapCamera,setMapCamera]=useState<OrthographicCamera|null>(null);
 useImperativeHandle(ref,()=>({reset:()=>api.current?.reset(),top:()=>api.current?.top(),zoom:f=>api.current?.zoom(f),snapshot:()=>api.current?.snapshot(),restore:v=>api.current?.restore(v),focusCell:(cell,onComplete)=>api.current?.focusCell?.(cell,onComplete),cancelFocus:()=>api.current?.cancelFocus?.()}),[]);
 return <div className={s.map3dWrap} onPointerDownCapture={e=>{gesture.current={x:e.clientX,y:e.clientY,moved:false};}} onPointerMoveCapture={e=>{const g=gesture.current;if(g&&Math.hypot(e.clientX-g.x,e.clientY-g.y)>5)g.moved=true;}} onPointerCancel={()=>{gesture.current=null;}}>
 <Canvas shadows orthographic frameloop="demand" dpr={[1,1.5]} camera={{position:[0,1350,1132.785],near:1,far:5000,zoom:1}} gl={{antialias:true,alpha:true,powerPreference:'high-performance'}} onCreated={({gl,camera})=>{gl.setClearColor('#E8ECE8',1);setMapCamera(camera as OrthographicCamera);}} onPointerMissed={()=>{if(props.viewMode==='overview'&&!gesture.current?.moved)props.onSelect(null);gesture.current=null;}} style={{touchAction:'none'}} aria-label={props.viewMode==='forest'?'Illustrative forest. Drag to look; use WASD or arrow keys to move.':'Geographic research map. Drag to tilt; scroll to zoom; select a research grid.'}>
 <ContextStatus onFailure={props.onFailure}/>{props.viewMode==='forest'?<Suspense fallback={null}><ForestScene input={props.forestInput} command={props.forestCommand} low={props.low} areaHa={props.forestAreaHa} reading={props.reading} wind={props.wind} reducedMotion={props.reducedMotion} clearingButton={props.clearingButton} onStation={props.onStation} onCanopyView={props.onCanopyView} noteButtons={props.noteButtons} onOpenNote={props.onOpenNote} onReady={props.onReady} onFailure={props.onForestFailure}/></Suspense>:mapCamera&&<GeoScene key={props.viewMode} {...props} camera={mapCamera} api={api} labelNodes={labelNodes} marker={marker} gesture={gesture}/>}
 </Canvas>
 {props.viewMode==='overview'&&<div className={s.labelsLayer}>{labels.map((l,i)=><span key={l.text} ref={el=>{labelNodes.current[i]=el;}} className={s.mapLabel}>{l.text}</span>)}{(props.pendingPoint||props.selection?.kind==='cell')&&<span ref={marker} className={s.mapPin} aria-hidden="true"/>}</div>}
 </div>;
});
