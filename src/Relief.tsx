import {useEffect,useMemo} from 'react';
import {useThree} from '@react-three/fiber';
import {BufferGeometry,Float32BufferAttribute,MeshDepthMaterial,RGBADepthPacking,DoubleSide,PlaneGeometry,ShaderMaterial,Color} from 'three';
import type {Texture} from 'three';
import type {MapData} from './data';
import {toWorld} from './data';

// This thickness is a display plinth, not measured geology or extra elevation.
export const plinthBottom=-26;
export function buildSides(data:MapData,surface:BufferGeometry){
 const b=data.geo.bounds,vertices=surface.getAttribute('position'),segments=Math.round(Math.sqrt(vertices.count))-1,positions:number[]=[],colours:number[]=[];
 const point=(x:number,y:number)=>{
  const gx=Math.max(0,Math.min(segments-1e-6,(x-b[0])/(b[2]-b[0])*segments)),gy=Math.max(0,Math.min(segments-1e-6,(b[3]-y)/(b[3]-b[1])*segments));
  const ix=Math.floor(gx),iy=Math.floor(gy),u=gx-ix,v=gy-iy,i=iy*(segments+1)+ix;
  const a=vertices.getY(i),c=vertices.getY(i+segments+1),d=vertices.getY(i+segments+2),e=vertices.getY(i+1);
  const p=toWorld(data,x,y);p[1]=u+v<=1?a+(e-a)*u+(c-a)*v:d+(c-d)*(1-u)+(e-d)*(1-v);return p;
 };
 const top=new Color('#A5B29A'),base=new Color('#677B65');
 for(const feature of data.geo.features.filter(f=>f.kind==='land'))for(const ring of feature.rings){
  for(let j=0;j<ring.length;j++){
   const a=ring[j],b=ring[(j+1)%ring.length],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/1500);
   for(let k=0;k<steps;k++){
    const at=(t:number)=>point(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t),p=at(k/steps),q=at((k+1)/steps),pb=[p[0],plinthBottom,p[2]],qb=[q[0],plinthBottom,q[2]];
    for(const [v,c]of[[p,top],[pb,base],[q,top],[q,top],[pb,base],[qb,base]] as const){positions.push(...v);colours.push(c.r,c.g,c.b);}
   }
  }
 }
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setAttribute('color',new Float32BufferAttribute(colours,3));g.computeVertexNormals();return g;
}

// Share the exact visible-surface mask with the shadow depth pass: a rectangular
// terrain grid must never cast a rectangular shadow over the cut-out coastline.
export function makeTerrainDepth(uniforms:ShaderMaterial['uniforms']){
 const depth=new MeshDepthMaterial({depthPacking:RGBADepthPacking});
 depth.onBeforeCompile=shader=>{
  for(const key of['landMap','studyMap','bounds','studyBounds','showPriority','showChange'])shader.uniforms[key]=uniforms[key];
  shader.vertexShader='varying vec2 reliefUv;\n'+shader.vertexShader.replace('#include <uv_vertex>','#include <uv_vertex>\nreliefUv=uv;');
  shader.fragmentShader='varying vec2 reliefUv;uniform sampler2D landMap;uniform sampler2D studyMap;uniform vec4 bounds;uniform vec4 studyBounds;uniform float showPriority;uniform float showChange;\n'+shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
   vec2 xy=mix(bounds.xy,bounds.zw,reliefUv);vec2 suv=(xy-studyBounds.xy)/(studyBounds.zw-studyBounds.xy);
   bool within=all(greaterThanEqual(suv,vec2(0.)))&&all(lessThanEqual(suv,vec2(1.)));
   bool inside=within&&texture2D(studyMap,suv).g>.001;
   if(texture2D(landMap,reliefUv).r<.25&&!(inside&&(showPriority>.5||showChange>.5)))discard;`);
 };
 return depth;
}

export default function Relief({data,surface,land,priority,change}:{data:MapData;surface:BufferGeometry;land:Texture;priority:boolean;change:boolean}){
 const {gl,invalidate}=useThree();
 const sides=useMemo(()=>buildSides(data,surface),[data,surface]);
 const bottom=useMemo(()=>{const b=data.geo.bounds;return new PlaneGeometry((b[2]-b[0])/1000,(b[3]-b[1])/1000).rotateX(-Math.PI/2);},[data]);
 const bottomMaterial=useMemo(()=>new ShaderMaterial({side:DoubleSide,uniforms:{landMap:{value:land}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D landMap;varying vec2 vUv;void main(){if(texture2D(landMap,vUv).r<.25)discard;gl_FragColor=vec4(.32,.40,.31,1.);}'}),[land]);
 useEffect(()=>()=>{sides.dispose();},[sides]);
 useEffect(()=>()=>{bottom.dispose();},[bottom]);
 useEffect(()=>()=>bottomMaterial.dispose(),[bottomMaterial]);
 useEffect(()=>{gl.shadowMap.autoUpdate=false;gl.shadowMap.needsUpdate=true;invalidate();},[surface,land,priority,change,gl,invalidate]);
 return <>
  <ambientLight intensity={1.25}/>
  <directionalLight position={[-650,1000,-450]} intensity={2} castShadow shadow-mapSize={[2048,2048]} shadow-camera-left={-950} shadow-camera-right={950} shadow-camera-top={950} shadow-camera-bottom={-950} shadow-camera-near={1} shadow-camera-far={3000} shadow-bias={-.00015} shadow-normalBias={.7} shadow-radius={3}/>
  <mesh geometry={sides} castShadow><meshStandardMaterial vertexColors side={DoubleSide} roughness={1}/></mesh>
  <mesh geometry={bottom} material={bottomMaterial} position-y={plinthBottom}/>
  <mesh rotation-x={-Math.PI/2} position-y={plinthBottom-.8} receiveShadow><planeGeometry args={[3000,3000]}/><shadowMaterial color="#344430" opacity={.22} depthWrite={false}/></mesh>
 </>;
}
