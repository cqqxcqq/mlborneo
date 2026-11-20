import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'public/forest'),m=JSON.parse(await readFile(resolve(dir,'manifest.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
assert.equal(m.license,'CC0-1.0');assert.ok((await readFile(resolve(dir,'LICENSE.txt'),'utf8')).includes('Creative Commons Zero, CC0'));
assert.equal(m.models.length,5);let bytes=0;for(const model of m.models){const b=await readFile(resolve(dir,model.file));assert.equal(b.length,model.bytes);assert.equal(sha(b),model.sha256);const json=JSON.parse(b.toString('utf8',20,20+b.readUInt32LE(12)));assert.ok(!(json.images||[]).some(i=>i.uri&&!i.uri.startsWith('data:')));assert.ok(!(json.buffers||[]).some(i=>i.uri&&!i.uri.startsWith('data:')));bytes+=b.length;}
assert.equal((await readdir(dir)).filter(f=>f.endsWith('.glb')).length,5);assert.equal(m.layout.trees.length,160);assert.equal(m.layout.shrubs.length,64);assert.equal(sha(Buffer.from(JSON.stringify(m.layout))),m.layoutSha256);assert.ok(m.layout.trees.every(t=>Math.hypot(t.x,t.z)>=6));assert.ok(bytes<8*1024*1024);
assert.equal(m.densityEncoding.metric,'FOREST_AT_RISK_HA');assert.equal(m.densityEncoding.treeCountsMeasured,false);assert.equal(m.densityEncoding.protectedArea,false);
const report={at:new Date().toISOString(),licenseVerified:true,allModelHashesMatch:true,externalDependencies:0,modelBytes:bytes,treeCapacity:160,shrubCapacity:64,layoutSha256:m.layoutSha256,researchDataBinding:m.densityEncoding};await writeFile(resolve(root,'reports/forest-checks.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
