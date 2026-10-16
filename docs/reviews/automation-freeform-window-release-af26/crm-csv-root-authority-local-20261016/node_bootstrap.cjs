'use strict';
// Future ROOT-OWNED Node launcher, executed as deploy. No preparation require().
const cp = require('node:child_process'), vm = require('node:vm');
const path = require('node:path'), crypto = require('node:crypto');
const PY = '/usr/local/libexec/re7/recovery-launch.py';
const allowedBuiltins = new Set(['fs','path','assert','crypto','child_process','os','util','url','buffer','http','https']);
function deny(ok, why) { if (!ok) throw Error(why); }
function run(entry, args, transport = (command, options) => cp.execFileSync('/usr/bin/python3', ['-I','-S',PY,...command], options)) {
  const read = () => JSON.parse(transport(['node-snapshot',entry], {encoding:'utf8'}));
  const snap = read(), cache = new Map();
  if(args[0]==='--authority-correlation'){deny(JSON.stringify(JSON.parse(args[1]))===JSON.stringify(snap.identity)&&args[2]==='--','node_authority_replaced');args=args.slice(3);}
  function fresh() { const now=read();deny(JSON.stringify(now.identity)===JSON.stringify(snap.identity),'node_authority_replaced'); }
  const children = Object.assign({}, cp, {
    execFileSync(command, argv, options) {
      fresh();
      // Canonical execution-check.cjs invokes Python baseline_contract.py.
      if (command === '/usr/bin/python3' && Array.isArray(argv) && argv[0].startsWith(snap.root + '/') && argv[0].endsWith('.py')) {
        const target=path.relative(snap.root,argv[0]);
        deny(snap.manifest.entries[target], 'node_python_child_not_entry');
        deny(Object.values(snap.manifest.imports[entry] || {}).includes(target) ||
             Object.keys(snap.manifest.imports).some(k=>Object.values(snap.manifest.imports[k]).includes(target)), 'node_python_child_undeclared');
        return transport(['python',target,'--authority-correlation',JSON.stringify(snap.identity),'--',...argv.slice(1)],options);
      }
      deny(!['python','python3','node'].includes(path.basename(command)), 'node_child_bypass');
      return cp.execFileSync(command,argv,options); // existing OS effects; rehearsals must intercept them
    }
  });
  for(const method of ['exec','execSync','execFile','spawn','spawnSync','fork'])children[method]=()=>{throw Error('node_child_transport_unsupported:'+method);};
  function load(file) {
    fresh();if(cache.has(file))return cache.get(file).exports;
    const row=snap.manifest.files[file];deny(row && snap.files[file], 'node_dependency_missing');
    const raw=Buffer.from(snap.files[file],'base64');
    deny(crypto.createHash('sha256').update(raw).digest('hex')===row.sha256,'node_source_hash');
    if(row.language==='json')return JSON.parse(raw.toString('utf8'));
    deny(row.language==='commonjs','node_language');
    const m={exports:{}};cache.set(file,m);
    function checkedRequire(name) {
      const core=name.startsWith('node:')?name.slice(5):name;
      if(allowedBuiltins.has(core))return core==='child_process'?children:require('node:'+core);
      const target=(snap.manifest.imports[file]||{})[name];
      deny(target,'node_import_undeclared:'+name);return load(target);
    }
    const fn=vm.runInThisContext('(function(exports,require,module,__filename,__dirname){'+raw.toString('utf8')+'\n})',{filename:path.join(snap.root,file)});
    globalThis.__re7Authority={root:snap.root,identity:snap.identity};
    fn(m.exports,checkedRequire,m,path.join(snap.root,file),path.dirname(path.join(snap.root,file)));
    return m.exports;
  }
  const old=process.argv;process.argv=[process.execPath,path.join(snap.root,entry),...args];
  try{return load(entry);}finally{process.argv=old;}
}
module.exports={run};
if(require.main===module)run(process.argv[2],process.argv.slice(3));
