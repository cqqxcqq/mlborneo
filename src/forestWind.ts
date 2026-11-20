import type {MeshStandardMaterial} from 'three';

export function addForestWind(material:MeshStandardMaterial,clock:{value:number}) {
 material.onBeforeCompile=shader=>{
  shader.uniforms.forestWindTime=clock;
  shader.vertexShader='uniform float forestWindTime;\n'+shader.vertexShader.replace(
   '#include <begin_vertex>',
   `#include <begin_vertex>
   #ifdef USE_INSTANCING
    vec3 origin=instanceMatrix[3].xyz;
    float height=smoothstep(0.05,7.0,position.y);
    float gust=sin(forestWindTime*1.25 + origin.x*0.19 + origin.z*0.13);
    float flutter=sin(forestWindTime*3.6 + position.x*1.9 + position.z*2.1);
    float blowing=smoothstep(0.0,0.6,forestWindTime);
    vec3 drift=vec3(0.14*gust+0.035*flutter,0.028*flutter,0.085*gust);
    transformed += transpose(mat3(instanceMatrix))*drift*(0.22+0.78*height)*
      smoothstep(0.05,0.75,position.y)*blowing;
   #endif`
  );
 };
 material.customProgramCacheKey=()=> 'forest-leaf-wind';
}
