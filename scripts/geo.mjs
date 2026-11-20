import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import proj4 from 'proj4';
import { unzipSync } from 'fflate';
import * as shapefile from 'shapefile';
import { fromFile } from 'geotiff';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CRS = '+proj=laea +lat_0=3 +lon_0=114 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs';
const projection = proj4('EPSG:4326', CRS);
const DEFAULT_BOUNDS = [-620000, -850000, 650000, 520000];
const now = () => new Date().toISOString();
const hash = b => createHash('sha256').update(b).digest('hex');
const exists = async f => { try { return (await fs.stat(f)).isFile(); } catch { return false; } };
async function cached(url, file, journal) {
  if (await exists(file)) return fs.readFile(file);
  const r = await fetch(url, { signal: AbortSignal.timeout(900000) });
  if (!r.ok) throw Error(`Download ${r.status}: ${url}`);
  const chunks=[];let received=0,last=Date.now();console.log(`Receiving ${path.basename(file)} (${r.headers.get('content-length')||'unknown'} bytes)`);
  for await(const chunk of r.body){chunks.push(Buffer.from(chunk));received+=chunk.length;if(Date.now()-last>20000){console.log(`Receiving ${path.basename(file)}: ${received} bytes`);last=Date.now();}}
  const b = Buffer.concat(chunks,received);
  if (!b.length) throw Error(`Empty download: ${url}`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file + '.partial', b); await fs.rename(file + '.partial', file);
  journal.push({url, file:path.relative(ROOT,file).replaceAll('\\','/'), acquired:now(), bytes:b.length, sha256:hash(b), disposition:r.headers.get('content-disposition')});
  console.log(`Downloaded ${path.basename(file)} (${b.length} bytes)`);
  return b;
}
async function batch(items, fn, concurrency=6) {
  let next=0; await Promise.all(Array.from({length:Math.min(concurrency,items.length)}, async()=>{while(next<items.length){const i=next++;await fn(items[i],i);}}));
}
function inside(x,y,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
const polygons = geometry => geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
function bbox(ring){const b=[Infinity,Infinity,-Infinity,-Infinity];for(const p of ring){b[0]=Math.min(b[0],p[0]);b[1]=Math.min(b[1],p[1]);b[2]=Math.max(b[2],p[0]);b[3]=Math.max(b[3],p[1]);}return b;}
function intersects(a,b){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
function simplify(ring,tolerance=90){
  if(ring.length<5)return ring;
  const sq=tolerance*tolerance,keep=new Uint8Array(ring.length);keep[0]=keep[ring.length-1]=1;const stack=[[0,ring.length-1]];
  while(stack.length){const[a,b]=stack.pop();const p=ring[a],q=ring[b],dx=q[0]-p[0],dy=q[1]-p[1],len=dx*dx+dy*dy;let best=sq,idx=-1;
    for(let i=a+1;i<b;i++){const r=ring[i];const t=len?Math.max(0,Math.min(1,((r[0]-p[0])*dx+(r[1]-p[1])*dy)/len)):0;const d=(r[0]-p[0]-t*dx)**2+(r[1]-p[1]-t*dy)**2;if(d>best){best=d;idx=i;}}
    if(idx>=0){keep[idx]=1;stack.push([a,idx],[idx,b]);}
  }return ring.filter((_,i)=>keep[i]);
}
function projectedRing(ring){return simplify(ring.map(p=>projection.forward(p).map(v=>Math.round(v*10)/10)));}
async function readZip(buffer){const z=unzipSync(buffer),shp=Object.keys(z).find(k=>k.endsWith('.shp')),dbf=Object.keys(z).find(k=>k.endsWith('.dbf'));if(!shp||!dbf)throw Error('Invalid Natural Earth archive');const a=z[shp],b=z[dbf];return shapefile.read(a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength),b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength));}
function rasterLand(rings,w,h,bounds){
  const png=new PNG({width:w,height:h});for(let i=3;i<png.data.length;i+=4)png.data[i]=255;
  for(const ring of rings){const bb=bbox(ring),y0=Math.max(0,Math.floor((bounds[3]-bb[3])/(bounds[3]-bounds[1])*h)),y1=Math.min(h-1,Math.ceil((bounds[3]-bb[1])/(bounds[3]-bounds[1])*h));
    for(let y=y0;y<=y1;y++){const py=bounds[3]-(y+.5)/h*(bounds[3]-bounds[1]),xs=[];for(let i=1;i<ring.length;i++){const a=ring[i-1],b=ring[i];if((a[1]>py)!==(b[1]>py))xs.push(a[0]+(py-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((a,b)=>a-b);
      for(let k=0;k+1<xs.length;k+=2){const x0=Math.max(0,Math.ceil((xs[k]-bounds[0])/(bounds[2]-bounds[0])*w-.5)),x1=Math.min(w-1,Math.floor((xs[k+1]-bounds[0])/(bounds[2]-bounds[0])*w-.5));for(let x=x0;x<=x1;x++)png.data[(y*w+x)*4]^=255;}
    }
  }return png;
}
function dims(edge,b){const width=Math.round(edge*(b[2]-b[0])/(b[3]-b[1]));return[width,edge];}
async function naturalEarth(rawDir,outDir,bounds,journal){
  const [landRaw,adminRaw]=await Promise.all([
    cached('https://naturalearth.s3.amazonaws.com/10m_physical/ne_10m_land.zip',path.join(rawDir,'ne_10m_land.zip'),journal),
    cached('https://naturalearth.s3.amazonaws.com/10m_cultural/ne_10m_admin_1_states_provinces.zip',path.join(rawDir,'ne_10m_admin_1_states_provinces.zip'),journal)
  ]);
  const [land,admin]=await Promise.all([readZip(landRaw),readZip(adminRaw)]);
  const all=land.features.flatMap(f=>polygons(f.geometry));
  const main=all.find(p=>inside(114,0,p[0]));if(!main)throw Error('Borneo main-island polygon missing from Natural Earth');
  const coast=main[0],mainB=bbox(coast),candidates=all.filter(p=>intersects(bbox(p[0]),[mainB[0]-.4,mainB[1]-.4,mainB[2]+.4,mainB[3]+.4]));
  const retained=candidates.filter(p=>p===main||p[0].some((q,qi)=>qi%Math.max(1,Math.floor(p[0].length/12))===0&&coast.some((c,ci)=>ci%3===0&&Math.hypot(c[0]-q[0],c[1]-q[1])<.35)));
  const landRings=retained.flatMap(p=>p.map(projectedRing));
  const features=[{name:'Borneo and adjacent coastal islands',kind:'land',rings:landRings}];
  for(const f of admin.features){const p=f.properties;if(!['MYS','IDN','BRN'].includes(p.adm0_a3))continue;const pp=polygons(f.geometry).filter(p=>intersects(bbox(p[0]),mainB));if(!pp.length)continue;
    const name=String(p.name_en||p.name||p.name_local).replaceAll('\0','').trim();
    if(!['Sabah','Sarawak','Labuan','Brunei-Muara','Belait','Tutong','Temburong','Kalimantan Barat','Kalimantan Tengah','Kalimantan Selatan','Kalimantan Timur','Kalimantan Utara','West Kalimantan','Central Kalimantan','South Kalimantan','East Kalimantan','North Kalimantan'].includes(name)&&!String(name).includes('Kalimantan'))continue;
    features.push({name,kind:'admin',rings:pp.flatMap(p=>p.map(projectedRing))});
  }
  const resources={};for(const edge of[4096,2048]){const[w,h]=dims(edge,bounds),png=rasterLand(landRings,w,h,bounds),filename=`land-${edge}.png`;await fs.writeFile(path.join(outDir,filename),PNG.sync.write(png));resources[edge===4096?'desktop':'low']=filename;}
  return{features,land:resources,retainedPolygons:retained.length};
}
const tileX=(lon,z)=>(lon+180)/360*2**z;
const tileY=(lat,z)=>(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z;
async function terrain(rawDir,outDir,bounds,journal){
  const z=8,samples=[];for(let j=0;j<=10;j++)for(let i=0;i<=10;i++)samples.push(projection.inverse([bounds[0]+i/10*(bounds[2]-bounds[0]),bounds[1]+j/10*(bounds[3]-bounds[1])]));
  const minTX=Math.floor(Math.min(...samples.map(p=>tileX(p[0],z)))),maxTX=Math.floor(Math.max(...samples.map(p=>tileX(p[0],z)))),minTY=Math.floor(Math.min(...samples.map(p=>tileY(p[1],z)))),maxTY=Math.floor(Math.max(...samples.map(p=>tileY(p[1],z))));
  const tiles=[];for(let y=minTY;y<=maxTY;y++)for(let x=minTX;x<=maxTX;x++)tiles.push([x,y]);const decoded=new Map();
  await batch(tiles,async([x,y])=>{const raw=await cached(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,path.join(rawDir,'terrain',`${z}-${x}-${y}.png`),journal);const p=PNG.sync.read(raw);if(p.width!==256||p.height!==256)throw Error('Unexpected Terrarium dimensions');const a=new Float32Array(256*256);for(let i=0;i<a.length;i++){const o=i*4;a[i]=p.data[o]*256+p.data[o+1]+p.data[o+2]/256-32768;}decoded.set(`${x}/${y}`,a);},8);
  const get=(x,y)=>{const tx=Math.floor(x/256),ty=Math.floor(y/256),p=decoded.get(`${tx}/${ty}`);if(!p)throw Error(`Elevation tile missing ${tx}/${ty}`);return p[(y-ty*256)*256+x-tx*256];};
  const w=513,h=513,a=Buffer.alloc(w*h*4);let min=Infinity,max=-Infinity;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const ll=projection.inverse([bounds[0]+x/(w-1)*(bounds[2]-bounds[0]),bounds[3]-y/(h-1)*(bounds[3]-bounds[1])]);const px=tileX(ll[0],z)*256-.5,py=tileY(ll[1],z)*256-.5,ix=Math.floor(px),iy=Math.floor(py),dx=px-ix,dy=py-iy;const v=get(ix,iy)*(1-dx)*(1-dy)+get(ix+1,iy)*dx*(1-dy)+get(ix,iy+1)*(1-dx)*dy+get(ix+1,iy+1)*dx*dy;min=Math.min(min,v);max=Math.max(max,v);a.writeFloatLE(v,(y*w+x)*4);}
  await fs.writeFile(path.join(outDir,'terrain.bin'),a);return{width:w,height:h,file:'terrain.bin',status:'ready',tileZoom:z,tileCount:tiles.length,minElevationMetres:min,maxElevationMetres:max,sha256:hash(a),encoding:'float32 little endian; north-to-south rows; metres above sea level; negative sea elevations retained; renderer clamps sea to zero'};
}

// Categorical aggregation: raw 1/2/4 membership is counted before any interpolation.
// Each 8x8 source block is converted into class proportions (1,2,4,published category).
// Display integration samples proportions, never raw categorical identifiers.
export async function aggregateForest(file){
  const cacheFile=file+'.aggregate8.bin',metaFile=file+'.aggregate8.json';
  if(await exists(cacheFile)&&await exists(metaFile)){const meta=JSON.parse(await fs.readFile(metaFile,'utf8'));return{...meta,data:new Uint8Array(await fs.readFile(cacheFile))};}
  const tiff=await fromFile(file);try{const image=await tiff.getImage();const w=image.getWidth(),h=image.getHeight(),bb=image.getBoundingBox(),n=image.getSamplesPerPixel();if(n!==1)throw Error('Expected a single-year single-band AnnualChange TIFF');
    const f=8,aw=Math.ceil(w/f),ah=Math.ceil(h/f),data=new Uint8Array(aw*ah*4),hist=Array(256).fill(0);const chunk=128;
    for(let yy=0;yy<h;yy+=chunk){const end=Math.min(h,yy+chunk),r=await image.readRasters({window:[0,yy,w,end],interleave:true});
      for(let by=yy;by<end;by+=f){const bh=Math.min(f,h-by),cy=Math.floor(by/f);for(let bx=0;bx<w;bx+=f){const bw=Math.min(f,w-bx),counts=[0,0,0,0];for(let dy=0;dy<bh;dy++)for(let dx=0;dx<bw;dx++){const c=r[(by-yy+dy)*w+bx+dx];hist[c]++;if(c===1)counts[0]++;else if(c===2)counts[1]++;else if(c===4)counts[2]++;if(c>=1&&c<=6)counts[3]++;}const o=(cy*aw+Math.floor(bx/f))*4;for(let k=0;k<4;k++)data[o+k]=Math.round(255*counts[k]/(bw*bh));}}
      if(yy%2048===0)console.log(`Forest ${path.basename(file)} ${Math.round(100*yy/h)}%`);
    }
    const nonzero=hist.map((n,c)=>({class:c,count:n})).filter(x=>x.count);if(nonzero.some(x=>x.class>6))throw Error('AnnualChange has unexpected categorical values');
    const meta={width:aw,height:ah,bounds:bb,rawWidth:w,rawHeight:h,classes:nonzero,geokeys:image.getGeoKeys()};await fs.writeFile(cacheFile,data);await fs.writeFile(metaFile,JSON.stringify(meta));return{...meta,data};
  }finally{await tiff.close();}
}
async function forest(rawDir,outDir,bounds,journal){
  const definitions=[['N10','E100'],['N10','E110'],['N0','E100'],['N0','E110']],tiles=[];
  const cachedFiles=await Promise.all(definitions.map(([lat,lon])=>exists(path.join(rawDir,`JRC_TMF_AnnualChange_v1_2018_${lat}_${lon}.tif`))));
  let evidence;
  if(cachedFiles.every(Boolean)){
    evidence=await fs.readFile(path.join(rawDir,'jrc-v2025-data-page.html'),'utf8');
    for(const[lat,lon]of definitions){const file=path.join(rawDir,`JRC_TMF_AnnualChange_v1_2018_${lat}_${lon}.tif`),relative=path.relative(ROOT,file).replaceAll('\\','/'),entry=journal.findLast(j=>j.file===relative);if(!entry||entry.sha256!==hash(await fs.readFile(file)))throw Error(`Cached JRC source hash is unverified: ${relative}`);}
  }else{
    const url='https://forobs.jrc.ec.europa.eu/TMF/data',r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('Cannot verify current JRC product version before downloading.');evidence=await r.text();
    const name=`jrc-download-proof-${new Date().toISOString().replaceAll(':','-')}.html`,file=path.join(rawDir,name);await fs.writeFile(file,evidence);journal.push({url,file:path.relative(ROOT,file).replaceAll('\\','/'),acquired:now(),bytes:Buffer.byteLength(evidence),sha256:hash(Buffer.from(evidence)),role:'Official product version at download time'});
  }
  const version=evidence.match(/projects\/JRC\/TMF\/v1_(\d{4})\/AnnualChanges/);
  if(version?.[1]!=='2025')throw Error('Official JRC version evidence does not identify v1_2025 AnnualChanges. Refusing to relabel a different release.');
  // Full TIFFs are cached locally so reruns are reproducible without network.
  await batch(definitions,async([lat,lon])=>{const name=`JRC_TMF_AnnualChange_v1_2018_${lat}_${lon}.tif`,file=path.join(rawDir,name);const url=`https://ies-ows.jrc.ec.europa.eu/iforce/tmf_v1/download.py?type=tile&dataset=AnnualChange_2018&lat=${lat}&lon=${lon}`;await cached(url,file,journal);},4);
  for(const[lat,lon]of definitions){const name=`JRC_TMF_AnnualChange_v1_2018_${lat}_${lon}.tif`,tile=await aggregateForest(path.join(rawDir,name));tiles.push(tile);console.log(`Forest aggregated ${name}: ${tile.rawWidth} x ${tile.rawHeight}`);}
  const resources={},[w,h]=dims(4096,bounds),png=new PNG({width:w,height:h});
  // A geographical mesh accelerates inverse projection only. It does not interpolate classes.
  const steps=512,mesh=new Float64Array((steps+1)*(steps+1)*2);
  for(let j=0;j<=steps;j++)for(let i=0;i<=steps;i++){const p=projection.inverse([bounds[0]+i/steps*(bounds[2]-bounds[0]),bounds[3]-j/steps*(bounds[3]-bounds[1])]),o=(j*(steps+1)+i)*2;mesh[o]=p[0];mesh[o+1]=p[1];}
  let maxMeshErrorM=0;for(let j=0;j<16;j++)for(let i=0;i<16;i++){const u=(i+.37)/16,v=(j+.61)/16,a=inverseMesh(u,v),b=projection.inverse([bounds[0]+u*(bounds[2]-bounds[0]),bounds[3]-v*(bounds[3]-bounds[1])]);maxMeshErrorM=Math.max(maxMeshErrorM,Math.hypot((a[0]-b[0])*111320*Math.cos(b[1]*Math.PI/180),(a[1]-b[1])*110574));}
  function inverseMesh(u,v){const fx=Math.max(0,Math.min(steps-1e-7,u*steps)),fy=Math.max(0,Math.min(steps-1e-7,v*steps)),ix=Math.floor(fx),iy=Math.floor(fy),dx=fx-ix,dy=fy-iy,o=(iy*(steps+1)+ix)*2,st=(steps+1)*2,r=[];for(let k=0;k<2;k++)r.push(mesh[o+k]*(1-dx)*(1-dy)+mesh[o+2+k]*dx*(1-dy)+mesh[o+st+k]*(1-dx)*dy+mesh[o+st+2+k]*dx*dy);return r;}
  for(let y=0;y<h;y++){for(let x=0;x<w;x++){const counts=[0,0,0,0],a=inverseMesh(x/w,y/h),b=inverseMesh((x+1)/w,y/h),c=inverseMesh(x/w,(y+1)/h),d=inverseMesh((x+1)/w,(y+1)/h);
    for(let sy=0;sy<4;sy++)for(let sx=0;sx<4;sx++){const tx=(sx+.5)/4,ty=(sy+.5)/4,lon=a[0]*(1-tx)*(1-ty)+b[0]*tx*(1-ty)+c[0]*(1-tx)*ty+d[0]*tx*ty,lat=a[1]*(1-tx)*(1-ty)+b[1]*tx*(1-ty)+c[1]*(1-tx)*ty+d[1]*tx*ty;const t=tiles[lat>=0?(lon>=110?1:0):(lon>=110?3:2)];if(lon<t.bounds[0]||lon>=t.bounds[2]||lat<t.bounds[1]||lat>=t.bounds[3])continue;const ix=Math.min(t.width-1,Math.floor((lon-t.bounds[0])/(t.bounds[2]-t.bounds[0])*t.rawWidth/8)),iy=Math.min(t.height-1,Math.floor((t.bounds[3]-lat)/(t.bounds[3]-t.bounds[1])*t.rawHeight/8)),o=(iy*t.width+ix)*4;for(let k=0;k<4;k++)counts[k]+=t.data[o+k];}
    const o=(y*w+x)*4;for(let k=0;k<4;k++)png.data[o+k]=Math.round(counts[k]/16);
  }if(y%1024===0)console.log(`Area sample forest4096: ${y}/${h}`);}
  await fs.writeFile(path.join(outDir,'forest-4096.png'),PNG.sync.write(png));resources.desktop='forest-4096.png';
  // Exact box averaging of the high-resolution display fractions for the low tier.
  const[lw,lh]=dims(2048,bounds),low=new PNG({width:lw,height:lh});for(let y=0;y<lh;y++)for(let x=0;x<lw;x++){const x0=x*w/lw,x1=(x+1)*w/lw,y0=y*h/lh,y1=(y+1)*h/lh,counts=[0,0,0,0];for(let yy=Math.floor(y0);yy<Math.ceil(y1);yy++)for(let xx=Math.floor(x0);xx<Math.ceil(x1);xx++){const weight=(Math.min(xx+1,x1)-Math.max(xx,x0))*(Math.min(yy+1,y1)-Math.max(yy,y0)),o=(yy*w+xx)*4;for(let k=0;k<4;k++)counts[k]+=png.data[o+k]*weight;}const o=(y*lw+x)*4;for(let k=0;k<4;k++)low.data[o+k]=Math.round(counts[k]/((x1-x0)*(y1-y0)));}await fs.writeFile(path.join(outDir,'forest-2048.png'),PNG.sync.write(low));resources.low='forest-2048.png';
  return{status:'ready',...resources,version:'JRC TMF v1_2025',year:2018,classes:{1:'Undisturbed tropical moist forest',2:'Degraded tropical moist forest',3:'Deforested land',4:'Forest regrowth',5:'Permanent and seasonal water',6:'Other land cover including no data and non-TMF cover'},encoding:'RGBA: class1 proportion, class2 proportion, class4 proportion, class1..6 published-category coverage proportion; byte/255. Alpha is NOT a valid-observation rate; class6 includes no-data.',aggregation:'Display pixel fraction approximation: each original discrete pixel is classified first and counted in 8x8 source blocks. Each4096 display pixel integrates16 stratified locations over those class-fraction blocks; a512x512 inverse-coordinate mesh is bilinearly interpolated, with no interpolation of raw class identifiers. The2048 tier is an exact area-weighted box average of4096 display fractions. Native30m classification is not changed or used to modify model data. Pixel-count fractions used within small8x8 blocks.',inverseMeshCheckMaxErrorMetres:maxMeshErrorM,limitation:'Class6 combines other land cover and no data in the published AnnualChange product; these cannot be separated. Forest is a retrospective reconstruction, independent of frozen model scores and warning allocation. The texture is a display approximation, not an analytical forest-area raster.',sourceTiles:tiles.map(t=>({bounds:t.bounds,width:t.rawWidth,height:t.rawHeight,geokeys:t.geokeys,classes:t.classes}))};
}

export async function prepareGeo({outDir=path.join(ROOT,'public','data'),rawDir=path.join(ROOT,'data','raw'),project=ROOT,bounds=DEFAULT_BOUNDS}={}){
  await fs.mkdir(outDir,{recursive:true});await fs.mkdir(rawDir,{recursive:true});await fs.mkdir(path.join(project,'reports'),{recursive:true});const journalFile=path.join(rawDir,'acquisition.json');let journal=[];try{journal=JSON.parse(await fs.readFile(journalFile,'utf8'));}catch{}
  const sources=[
    {name:'Mapzen Terrain Tiles / Terrarium',url:'https://registry.opendata.aws/terrain-tiles/',format:'https://github.com/tilezen/joerd/blob/master/docs/formats.md',attribution:'Terrain Tiles by Mapzen, hosted on AWS. SRTM/GMTED2010 terrain courtesy of the U.S. Geological Survey; global ETOPO1 terrain courtesy of NOAA. Full source terms: https://github.com/tilezen/joerd/blob/master/docs/attribution.md',processing:'Terrarium raw RGB decoded by R*256+G+B/256-32768. No colour correction. Reprojected to WGS84 ellipsoidal LAEA, centre114E/3N; bilinear elevation sampling; local Float32 grid.'},
    {name:'Natural Earth 1:10m land and admin-1',version:'5.1.1',url:'https://www.naturalearthdata.com/downloads/',license:'Public domain',attribution:'Made with Natural Earth.',processing:'Select Borneo main island by contains(114E,0N), retain coastal islands within 0.35 degrees of source coast; reproject to LAEA; simplify at90m; rasterize using even-odd rings. Administrative outlines are geographical context only.'},
    {name:'JRC Tropical Moist Forest Annual Change',version:'v1_2025',year:2018,url:'https://forobs.jrc.ec.europa.eu/TMF/data',guide:'https://forobs.jrc.ec.europa.eu/TMF/download/TMF_DataUsersGuide.pdf',attribution:'European Commission, Joint Research Centre (JRC), Tropical Moist Forest dataset, v1_2025. Vancutsem et al. (2021), Long-term (1990–2019) monitoring of forest cover changes in the humid tropics, Science Advances 7:eabe1603.',license:'Free of charge without restriction of use; acknowledge JRC dataset and journal article.',processing:'Single-year AnnualChange_2018 downloads from current v1_2025 official download interface; official Annual Change classes1..6 (guide pp10–11), forest classes1/2/4. Later historical reconstruction, not an input available in2018. Never intersects or changes frozen study selection.'}
  ];
  let meta;try{const ne=await naturalEarth(rawDir,outDir,bounds,journal);console.log(`Natural Earth ready: ${ne.features.length} features`);const elev=await terrain(rawDir,outDir,bounds,journal);meta={bounds,crs:CRS,terrain:elev,land:ne.land,features:ne.features,forest:{status:'unavailable',desktop:'forest-4096.png',low:'forest-2048.png',message:'The JRC 2018 historical forest surface is still being prepared.'},sources};await fs.writeFile(path.join(outDir,'geo.json'),JSON.stringify(meta));await fs.writeFile(journalFile,JSON.stringify(journal,null,2));console.log('GEO_BASE_READY');
    if(!process.argv.includes('--base-only')){try{meta.forest=await forest(rawDir,outDir,bounds,journal);}catch(e){meta.forest.message=`2018 JRC forest surface unavailable: ${e.message}`;console.error(e);}}
    for(const name of['jrc-v2025-data-page.html','TMF_DataUsersGuide.pdf','terrain-attribution.md','terrain-formats.md']){const file=path.join(rawDir,name);if(await exists(file)&&!journal.some(j=>j.file===path.relative(ROOT,file).replaceAll('\\','/'))){const b=await fs.readFile(file);const stat=await fs.stat(file);journal.push({file:path.relative(ROOT,file).replaceAll('\\','/'),acquired:stat.mtime.toISOString(),bytes:b.length,sha256:hash(b),role:'Saved official source documentation'});}}
    await fs.writeFile(path.join(outDir,'geo.json'),JSON.stringify(meta));
    await fs.writeFile(path.join(outDir,'sources.json'),JSON.stringify({generated:now(),bounds,crs:CRS,sources,downloads:journal},null,2));
    await fs.writeFile(path.join(project,'reports','external-data.json'),JSON.stringify({generated:now(),bounds,crs:CRS,terrain:meta.terrain,forest:meta.forest,land:meta.land,sources,downloads:journal},null,2));return meta;
  }finally{await fs.writeFile(journalFile,JSON.stringify(journal,null,2));}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))prepareGeo().then(g=>console.log(`GEO_COMPLETE terrain=${g.terrain.status} forest=${g.forest.status}`)).catch(e=>{console.error(e);process.exitCode=1;});
