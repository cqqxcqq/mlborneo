export interface Trunk{x:number;z:number;radius:number;}
export const FOREST_WALK_SPEED=3;
export function stepForestPosition(position:[number,number],forward:number,side:number,yaw:number,delta:number,trunks:Trunk[]){
 const length=Math.max(1,Math.hypot(forward,side)),step=Math.min(.05,Math.max(0,delta))*FOREST_WALK_SPEED;
 const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)/length*step,dz=(-Math.cos(yaw)*forward-Math.sin(yaw)*side)/length*step;
 const clamp=(v:number)=>Math.max(-25,Math.min(25,v));
 const blocked=(x:number,z:number)=>trunks.some(t=>Math.hypot(t.x-x,t.z-z)<t.radius+.3);
 let[x,z]=position;const nx=clamp(x+dx);if(!blocked(nx,z))x=nx;const nz=clamp(z+dz);if(!blocked(x,nz))z=nz;
 return[x,z] as [number,number];
}
