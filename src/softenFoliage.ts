import {BufferGeometry,Float32BufferAttribute} from 'three';
// One Loop subdivision pass on welded, untextured foliage. This is art processing,
// independent of every research cell and every scientific value.
export function softenFoliage(source:BufferGeometry){
 const p=source.getAttribute('position'),index=source.getIndex();if(!index)return source.clone();
 const positions:number[][]=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]),neighbors=positions.map(()=>new Set<number>()),edges=new Map<string,{a:number;b:number;opposite:number[];index:number}>();
 const edge=(a:number,b:number,c:number)=>{const key=a<b?`${a},${b}`:`${b},${a}`;let e=edges.get(key);if(!e){e={a:Math.min(a,b),b:Math.max(a,b),opposite:[],index:0};edges.set(key,e);}e.opposite.push(c);neighbors[a].add(b);neighbors[b].add(a);return e;};
 for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2);edge(a,b,c);edge(b,c,a);edge(c,a,b);}
 const boundary=positions.map(()=>[] as number[]);for(const e of edges.values())if(e.opposite.length===1){boundary[e.a].push(e.b);boundary[e.b].push(e.a);}
 const out=positions.map((v,i)=>{const n=[...neighbors[i]],b=boundary[i];if(b.length===2)return v.map((x,k)=>.75*x+.125*(positions[b[0]][k]+positions[b[1]][k]));const beta=n.length===3?3/16:3/(8*Math.max(1,n.length));return v.map((x,k)=>(1-n.length*beta)*x+beta*n.reduce((s,j)=>s+positions[j][k],0));});
 for(const e of edges.values()){e.index=out.length;out.push(e.opposite.length===2?positions[e.a].map((v,k)=>.375*(v+positions[e.b][k])+.125*(positions[e.opposite[0]][k]+positions[e.opposite[1]][k])):positions[e.a].map((v,k)=>(v+positions[e.b][k])/2));}
 const key=(a:number,b:number)=>a<b?`${a},${b}`:`${b},${a}`,triangles:number[]=[];
 for(let i=0;i<index.count;i+=3){const a=index.getX(i),b=index.getX(i+1),c=index.getX(i+2),ab=edges.get(key(a,b))!.index,bc=edges.get(key(b,c))!.index,ca=edges.get(key(c,a))!.index;triangles.push(a,ab,ca,b,bc,ab,c,ca,bc,ab,bc,ca);}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(out.flat(),3));g.setIndex(triangles);g.computeVertexNormals();return g;
}
