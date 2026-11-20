import type {Trunk} from './forestMotion';

type Point=[number,number];

export function clearForestPath(from:Point,to:Point,trunks:Trunk[]) {
 const dx=to[0]-from[0],dz=to[1]-from[1],length=dx*dx+dz*dz;
 return trunks.every(({x,z,radius})=>{
  const along=length?Math.max(0,Math.min(1,((x-from[0])*dx+(z-from[1])*dz)/length)):0;
  return Math.hypot(x-from[0]-along*dx,z-from[1]-along*dz)>=radius+.32;
 });
}

export function forestApproach(from:Point,to:Point,trunks:Trunk[]):Point[] {
 if(clearForestPath(from,to,trunks))return [to];
 const dx=to[0]-from[0],dz=to[1]-from[1],length=Math.hypot(dx,dz);
 for(const shift of [1.8,-1.8,3.6,-3.6]){
  const via:Point=[(from[0]+to[0])/2-dz/length*shift,(from[1]+to[1])/2+dx/length*shift];
  if(via.every(n=>Math.abs(n)<24.8)&&clearForestPath(from,via,trunks)&&clearForestPath(via,to,trunks))return [via,to];
 }
 return [];
}
