'use strict';
// Only the already accepted closure26. All CJS/JSON are compiled from one sealed FD.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path').posix;
const frame=JSON.parse(fs.readFileSync(Number(process.argv[1]),'utf8'));
const files=frame.files,cache=new Map(),base='/snapshot/rpc/node_modules';
const builtins=new Set(['net','path','events','url','fs','stream','tty','util','os']);
function resolve(request,parent){
 let p;
 if(request.startsWith('/'))p=request;
 else if(request.startsWith('.'))p=path.resolve(path.dirname(parent),request);
 else {
  const parts=request.split('/'),pkg=parts.shift();
  const root=base+'/'+pkg;
  p=parts.length?root+'/'+parts.join('/'):root+'/'+(JSON.parse(files[root+'/package.json']).main||'index.js');
 }
 p=path.normalize(p);
 for(const n of [p,p+'.js',p+'/index.js'])if(Object.hasOwn(files,n))return n;
 throw Error('undeclared_module');
}
function load(name){
 if(cache.has(name))return cache.get(name).exports;
 if(!Object.hasOwn(files,name))throw Error('undeclared_source');
 const m={exports:{}};cache.set(name,m);
 if(name.endsWith('.json'))m.exports=JSON.parse(files[name]);
 else {
  const req=(r)=>{
   const b=r.replace(/^node:/,'');
   if(builtins.has(b))return require('node:'+b);
   return load(resolve(r,name));
  };
  const fn=vm.runInThisContext('(function(exports,require,module,__filename,__dirname){'+files[name]+'\n})',{filename:name});
  fn(m.exports,req,m,name,path.dirname(name));
 }
 return m.exports;
}
process.argv=['node','/snapshot/pm2_rpc_fd.cjs',base,String(frame.socketFd)];
load('/snapshot/pm2_rpc_fd.cjs');
