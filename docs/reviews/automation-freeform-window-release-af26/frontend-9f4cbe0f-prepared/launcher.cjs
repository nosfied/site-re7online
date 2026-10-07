// Window: one application, exit78 disables automatic retry. Permanent: PM2 recovery.
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const requireValue = (ok, code) => { if (!ok) throw Error(code); };
const control = process.env.RE7_FRONT_CONTROL;
let v, record;
function identity(pid) {
  const a = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(/\) (?=[A-Z] )/).at(-1).trim().split(/\s+/);
  requireValue(!['Z','X'].includes(a[0]), 'dead_identity');
  return {pid, ticks:a[19], group:Number(a[2]), session:Number(a[3])};
}
function promoted(original) {
  if (!fs.existsSync(control+'.permanent')) return false;
  const m=JSON.parse(fs.readFileSync(control+'.permanent'));
  requireValue(m.nonce===original.nonce && m.entrySha256===original.entrySha256 && m.buildId===original.buildId && Object.keys(m).length===3,'permanent_binding');
  return true;
}
try {
  const original=JSON.parse(fs.readFileSync(control)); v=original;
  requireValue(process.env.RE7_FRONT_RUN===original.nonce,'run_binding');
  requireValue(fs.readFileSync(path.join(v.release,'.next/BUILD_ID'),'utf8').trim()===v.buildId,'build_binding');
  requireValue(crypto.createHash('sha256').update(fs.readFileSync(v.entry)).digest('hex')===v.entrySha256,'entry_binding');
  let applicationControl=control;
  if (promoted(original)) {
    const observations=JSON.parse(cp.execFileSync('/usr/bin/python3',['-I','-S',path.join(__dirname,'frontend-check.py'),'supervision-preflight',control,String(process.pid)],{timeout:10000,encoding:'utf8'}));
    // A new incarnation never opens/truncates the window journal or a previous run.
    const nonce=crypto.randomBytes(32).toString('hex');
    const root=control+'.runs';fs.mkdirSync(root,{recursive:true,mode:0o700});
    const directory=path.join(root,nonce);fs.mkdirSync(directory,{mode:0o700});
    v={...original,...observations,nonce,journal:path.join(directory,'journal.jsonl')};
    applicationControl=path.join(directory,'control.json');
    fs.writeFileSync(applicationControl,JSON.stringify(v),{flag:'wx',mode:0o600});
    process.env.RE7_FRONT_RUN=nonce;
  }
  record=(event,value={})=>fs.appendFileSync(v.journal,JSON.stringify({event,...value,at:new Date().toISOString(),nonce:v.nonce})+'\n',{mode:0o600});
  fs.writeFileSync(v.journal,'',{flag:'wx',mode:0o600});
  record('parent',identity(process.pid));
  const child=cp.fork(path.join(__dirname,'bootstrap.cjs'),[applicationControl],{
    cwd:v.release,stdio:['ignore','inherit','inherit','ipc'],env:{...process.env,RE7_FRONT_RUN:v.nonce}
  });
  let released=false;
  child.on('message',msg=>{
    try {
      requireValue(!released && msg.boot===v.nonce && msg.pid===child.pid,'child_binding');
      record('application_identity',identity(child.pid));
      record('application_released');released=true;child.send({go:v.nonce});
    } catch(e) { record('launcher_error',{reason:e.message});process.exit(78); }
  });
  child.on('error',e=>{record('child_error',{code:e.code||'unknown'});process.exit(78);});
  child.on('exit',(code,signal)=>{
    record('application_exit',{pid:child.pid,code,signal});
    // Reflect Next death immediately. Only a promoted generation allows PM2 retry.
    try {process.exit(promoted(original)?1:78);} catch(e) {process.exit(78);}
  });
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>process.exit(0));
} catch(e) {
  if(record)record('launcher_error',{reason:e.message});
  console.error('frontend_launcher_denied:'+e.message);
  process.exit(78); // malformed/missing evidence never becomes an automatic retry
}
