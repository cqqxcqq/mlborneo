// WGS84 ellipsoidal LAEA, fixed centre 114°E, 3°N. Checked against proj4 and all registry centres.
const a=6378137, es=0.0066943799901413165, e=Math.sqrt(es), rad=Math.PI/180;
function q(s:number){return (1-es)*(s/(1-es*s*s)-Math.log((1-e*s)/(1+e*s))/(2*e));}
const qp=q(1), rq=Math.sqrt(qp/2), s0=q(Math.sin(3*rad))/qp, c0=Math.sqrt(1-s0*s0);
const d=Math.cos(3*rad)/(Math.sqrt(1-es*Math.sin(3*rad)**2)*rq*c0);
export function project(lon:number,lat:number):[number,number]{
 const lam=(lon-114)*rad,s=q(Math.sin(lat*rad))/qp,c=Math.sqrt(1-s*s),b=Math.sqrt(2/(1+s0*s+c0*c*Math.cos(lam)));
 return [a*rq*d*b*c*Math.sin(lam),a*rq/d*b*(c0*s-s0*c*Math.cos(lam))];
}
export function unproject(xM:number,yM:number):[number,number]{
 const x=xM/a/d,y=yM/a*d,rho=Math.hypot(x,y);if(rho<1e-12)return[114,3];
 const ce=2*Math.asin(rho/(2*rq)),sc=Math.sin(ce),cc=Math.cos(ce),ab=cc*s0+y*sc*c0/rho;
 const lon=114+Math.atan2(x*sc,rho*c0*cc-y*s0*sc)/rad;
 const target=qp*ab;let phi=Math.asin(ab);
 for(let i=0;i<8;i++){const s=Math.sin(phi),derivative=2*(1-es)*Math.cos(phi)/(1-es*s*s)**2;phi+=(target-q(s))/derivative;}
 return[lon,phi/rad];
}
export type Bounds=[number,number,number,number];
export function pointInRing(x:number,y:number,ring:number[][]){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
