import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
const project=resolve(import.meta.dirname,'..');
export async function prepareScope(outDir=resolve(project,'public/data')){
 const geo=JSON.parse(await readFile(resolve(outDir,'geo.json'),'utf8'));
 const names=['Sabah','Sarawak','Labuan','Temburong','Brunei-Muara','Tutong','Belait'];
 const admin=geo.features.filter(f=>f.kind==='admin'&&names.includes(f.name));
 if(!admin.some(f=>f.name==='Sabah')||!admin.some(f=>f.name==='Sarawak')||!admin.some(f=>f.name==='Belait'))throw Error('Verified Sabah, Sarawak and Brunei context boundaries are missing.');
 const bounds=geo.bounds;
 const land={};
 for(const edge of[4096,2048]){const width=Math.round(edge*(bounds[2]-bounds[0])/(bounds[3]-bounds[1])),height=edge,png=new PNG({width,height});for(let i=3;i<png.data.length;i+=4)png.data[i]=255;
  for(const feature of admin){const pixels=new Uint8Array(width*height);
   for(const ring of feature.rings){let minY=Infinity,maxY=-Infinity;for(const p of ring){minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);}const y0=Math.max(0,Math.floor((bounds[3]-maxY)/(bounds[3]-bounds[1])*height)),y1=Math.min(height-1,Math.ceil((bounds[3]-minY)/(bounds[3]-bounds[1])*height));
    for(let y=y0;y<=y1;y++){const py=bounds[3]-(y+.5)/height*(bounds[3]-bounds[1]),xs=[];for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];if((a[1]>py)!==(b[1]>py))xs.push(a[0]+(py-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((a,b)=>a-b);for(let k=0;k+1<xs.length;k+=2){const x0=Math.max(0,Math.ceil((xs[k]-bounds[0])/(bounds[2]-bounds[0])*width-.5)),x1=Math.min(width-1,Math.floor((xs[k+1]-bounds[0])/(bounds[2]-bounds[0])*width-.5));for(let x=x0;x<=x1;x++)pixels[y*width+x]^=255;}}
   }
   for(let p=0;p<pixels.length;p++)if(pixels[p])png.data[p*4]=255;
  }
  const file=`land-scope-${edge}.png`;await writeFile(resolve(outDir,file),PNG.sync.write(png));land[edge===4096?'desktop':'low']=file;
 }
 const scope={name:'Sabah, Sarawak and Brunei',viewBounds:[-506000,-247000,594000,493000],land,features:[{name:'Sabah, Sarawak and Brunei',kind:'land',rings:admin.flatMap(f=>f.rings)},...admin],processing:'Display-context mask is the union of verified Natural Earth Sabah, Sarawak, Labuan and Brunei admin polygons. Indonesian context is hidden at user request. Frozen study cells are not clipped, reranked or changed. Resource-coordinate bounds remain the original LAEA bounds; only camera framing and background context change.'};
 await writeFile(resolve(outDir,'display-scope.json'),JSON.stringify(scope));console.log('Display scope: Sabah, Sarawak and Brunei; original research unchanged.');return scope;
}
if(process.argv[1]?.endsWith('scope.mjs'))await prepareScope();
