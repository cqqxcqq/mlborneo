import {useEffect,useState,useRef,useImperativeHandle,forwardRef} from 'react';
import type {DataBundle,Selection} from './data';
import {selectAt} from './data';
import {project} from './geo';
import {labels} from './labels';
import {makeFlatSurfaces,isLand} from './surfaces';
import type {Surfaces} from './surfaces';
import type {MapHandle} from './Map3D';
import type {MapViewState,ViewMode} from './view';
import s from './App.module.css';
interface Props{data:DataBundle;forest:boolean;priority:boolean;change:boolean;rotating:boolean;selection:Selection;onSelect:(s:Selection)=>void;onReady:()=>void;viewMode:ViewMode;restoreView?:MapViewState;}
export default forwardRef<MapHandle,Props>(function FlatMap({data,forest,priority,change,rotating,selection,onSelect,onReady,restoreView},ref){
 const [surfaces,setSurfaces]=useState<Surfaces|null>(null),[error,setError]=useState(''),[zoom,setZoom]=useState(restoreView?.mode==='flat'?restoreView.zoom:1),svg=useRef<SVGSVGElement>(null),mapGroup=useRef<SVGGElement>(null),start=useRef<{x:number;y:number;moved:boolean}|null>(null);
 const b=data.geo.bounds,w=b[2]-b[0],h=b[3]-b[1],g=data.study.meta.grid,frame=data.geo.viewBounds||b,diameter=Math.hypot(frame[2]-frame[0],frame[3]-frame[1])*1.06,cx=(frame[0]+frame[2])/2,cy=-(frame[1]+frame[3])/2;
 const snapshot=():MapViewState=>({mode:'flat',zoom,center:[cx,cy],extent:diameter,time:svg.current?.getCurrentTime()||0});
 useEffect(()=>{let alive=true;makeFlatSurfaces(data).then(v=>{if(alive){setSurfaces(v);onReady();}}).catch(e=>{if(alive)setError(String(e));});return()=>{alive=false;};},[data]);
 useEffect(()=>{svg.current?.setCurrentTime(restoreView?.mode==='flat'?restoreView.time||0:0);},[]);
 useEffect(()=>{if(rotating)svg.current?.unpauseAnimations();else svg.current?.pauseAnimations();},[rotating]);
 useEffect(()=>{if(window.__MLBORNEO__)window.__MLBORNEO__.diagnostics={mode:'flat',renders:0,triangles:0,geometries:0,textures:0,programs:0,camera:snapshot(),frameTimes:[],renderer:'SVG'};},[zoom,surfaces]);
 useImperativeHandle(ref,()=>({reset:()=>{setZoom(1);svg.current?.setCurrentTime(0);},top:()=>{},zoom:f=>setZoom(z=>Math.max(.8,Math.min(3,z*f))),snapshot,restore:v=>{setZoom(v.zoom);svg.current?.setCurrentTime(v.time||0);}}),[zoom,diameter,cx,cy]);
 const path=(rings:number[][][])=>rings.map(r=>r.map(([x,y],i)=>`${i?'L':'M'}${x},${-y}`).join(' ')+'Z').join(' ');
 return <div className={s.flatWrap} data-testid="flat-map">
 {!surfaces&&<p className={s.mapLoading} role="status">{error||'Preparing the flat map…'}</p>}
 <svg ref={svg} className={s.flatMap} viewBox={[cx-diameter/zoom/2,cy-diameter/zoom/2,diameter/zoom,diameter/zoom].join(' ')} role="img" aria-label="Flat research map"
 onPointerDown={e=>{start.current={x:e.clientX,y:e.clientY,moved:false};}} onPointerMove={e=>{if(start.current&&Math.hypot(e.clientX-start.current.x,e.clientY-start.current.y)>5)start.current.moved=true;}} onPointerCancel={()=>{start.current=null;}}
 onPointerUp={e=>{const a=start.current;start.current=null;if(!surfaces||!a||a.moved||Math.hypot(e.clientX-a.x,e.clientY-a.y)>5)return;const p=svg.current!.createSVGPoint();p.x=e.clientX;p.y=e.clientY;const v=p.matrixTransform(mapGroup.current!.getScreenCTM()!.inverse());onSelect(selectAt(data,v.x,-v.y,isLand(data,surfaces.land,v.x,-v.y)));}}>
 <g ref={mapGroup}>{<animateTransform attributeName="transform" type="rotate" values={`-12 ${cx} ${cy};12 ${cx} ${cy};-12 ${cx} ${cy}`} dur="100s" repeatCount="indefinite"/>}
 {surfaces?<><image href={forest&&surfaces.forest?surfaces.forest:surfaces.base} x={b[0]} y={-b[3]} width={w} height={h}/>{priority&&<image href={surfaces.priority} x={g.minCol*1000} y={g.minRow*1000} width={g.width*1000} height={g.height*1000} style={{imageRendering:'pixelated'}}/>}{change&&surfaces.activity&&<image href={surfaces.activity} x={g.minCol*1000} y={g.minRow*1000} width={g.width*1000} height={g.height*1000} style={{imageRendering:'pixelated'}}/>}</>:data.geo.features.filter(f=>f.kind==='land').map((f,i)=><path key={i} d={path(f.rings)} fill="#B9C5B9"/>)}
 {data.geo.features.map((f,i)=><path key={i} d={path(f.rings)} fill="none" stroke="#657460" strokeWidth={650}/>)}
 {labels.map(l=>{const[x,y]=project(l.lon,l.lat);return <g key={l.text} transform={`translate(${x} ${-y})`}><g><animateTransform attributeName="transform" type="rotate" values="12;-12;12" dur="100s" repeatCount="indefinite"/><text textAnchor="middle" className={s.mapLabel} style={{fontSize:19000,letterSpacing:1800}}>{l.text}</text></g></g>;})}
 {selection?.kind==='cell'&&<circle aria-hidden="true" cx={(selection.cell.col+.5)*1000} cy={(selection.cell.row+.5)*1000} r={diameter/zoom*.012} fill="none" stroke="#FCF7E8" strokeWidth={3} vectorEffect="non-scaling-stroke"/>}
 {selection?.kind==='cell'&&<rect data-testid="cell-boundary" x={selection.cell.col*1000} y={selection.cell.row*1000} width={1000} height={1000} fill="none" stroke="#202D27" strokeWidth={2} vectorEffect="non-scaling-stroke"/>}
 </g></svg></div>;
});
