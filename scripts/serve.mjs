import { createServer } from 'node:http';
import { readFile,stat } from 'node:fs/promises';
import { resolve,extname,sep } from 'node:path';
import { gzipSync } from 'node:zlib';
const root=resolve(import.meta.dirname,'../dist');
const args=process.argv.slice(2);const port=Number(args[args.indexOf('--port')+1])||4173;
const host=args.includes('--lan')?'0.0.0.0':'127.0.0.1';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.bin':'application/octet-stream','.svg':'image/svg+xml','.ico':'image/x-icon'};
try{await stat(resolve(root,'index.html'));}catch{console.error('Build the exhibition first: npm run build');process.exit(1);}
const cache=new Map();
const server=createServer(async(req,res)=>{try{
 const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=resolve(root,`.${path==='/'?'/index.html':path}`);
 if(!file.startsWith(root+sep)){res.writeHead(403);res.end();return;}
 const info=await stat(file);let entry=cache.get(file);if(!entry||entry.mtime!==info.mtimeMs){const data=await readFile(file),ext=extname(file),compress=data.length>1024&&['.html','.js','.css','.json','.bin'].includes(ext);entry={data,gz:compress?gzipSync(data):null,type:mime[ext]||'application/octet-stream',mtime:info.mtimeMs};cache.set(file,entry);}
 const zipped=entry.gz&&/\bgzip\b/.test(req.headers['accept-encoding']||'');const data=zipped?entry.gz:entry.data;
 res.writeHead(200,{'Content-Type':entry.type,'Content-Length':data.length,'Cache-Control':'no-cache','Vary':'Accept-Encoding','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' data: blob:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self'; font-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'",...(zipped?{'Content-Encoding':'gzip'}:{})});res.end(req.method==='HEAD'?undefined:data);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500,{'Content-Type':'text/plain'});res.end(e.code==='ENOENT'?'Local resource not found.':'Local service error.');}});
server.listen(port,host,()=>console.log(`MLBorneo exhibition: http://127.0.0.1:${port}\nServing the production build. Keep this terminal open. Ctrl+C stops the service.`));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
