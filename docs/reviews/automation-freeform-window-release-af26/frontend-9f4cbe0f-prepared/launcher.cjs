// Operational launcher, no provider/DB. One application fork per PM2 execution.
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');
const control = process.env.RE7_FRONT_CONTROL;
const v = JSON.parse(fs.readFileSync(control));
const requireValue = (ok, code) => { if (!ok) throw Error(code); };
requireValue(process.env.RE7_FRONT_RUN === v.nonce, 'run_binding');
requireValue(fs.readFileSync(path.join(v.release, '.next/BUILD_ID'), 'utf8').trim() === v.buildId, 'build_binding');
requireValue(crypto.createHash('sha256').update(fs.readFileSync(v.entry)).digest('hex') === v.entrySha256, 'entry_binding');
const record = (event, value = {}) => fs.appendFileSync(v.journal, JSON.stringify({event, ...value, at: new Date().toISOString(), nonce: v.nonce}) + '\n', {mode: 0o600});
function identity(pid) {
  const a = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(/\) (?=[A-Z] )/).at(-1).trim().split(/\s+/);
  requireValue(!['Z','X'].includes(a[0]), 'dead_identity');
  return {pid, ticks:a[19], group:Number(a[2]), session:Number(a[3])};
}
fs.writeFileSync(v.journal, '', {flag:'wx', mode:0o600});
record('parent', identity(process.pid));
const child = cp.fork(path.join(__dirname,'bootstrap.cjs'), [control], {
  cwd:v.release, stdio:['ignore','inherit','inherit','ipc'], env:{...process.env, RE7_FRONT_RUN:v.nonce}
});
child.on('message', msg => {
  requireValue(msg.boot === v.nonce && msg.pid === child.pid, 'child_binding');
  const id = identity(child.pid);
  record('application_identity', id); // persisted before any Next application code
  record('application_released');
  child.send({go:v.nonce});
});
child.on('error', e => record('child_error', {code:e.code || 'unknown'}));
child.on('exit', (code, signal) => record('application_exit', {pid:child.pid,code,signal}));
// Deliberately remain supervised after a child failure: never a second application fork.
setInterval(()=>{}, 1000);
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>process.exit(0));
