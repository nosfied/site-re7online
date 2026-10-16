/* Local proof: actual PM2 6.0.14 source up to verifyConfs; no daemon/start.
 * The canonical PM2 parser and file read are unmodified. External YAML package
 * is a throwing stub (unused); verifyConfs captures its actual received apps.
 * Everything after that boundary (normalization/IPC/daemon/OS) is NOT tested.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const Common = {};
const suppliedRequire = name => {
  if (name === 'js-yaml') return {load(){throw Error('YAML not part of contract');}};
  return require(name);
};
suppliedRequire.resolve = require.resolve;
suppliedRequire.cache = require.cache;
new Function('Common','require','path',fs.readFileSync(path.join(__dirname,'vendor/Common-config.excerpt.cjs'),'utf8'))(Common,suppliedRequire,path);
let result;
const stop = {};
Common.verifyConfs = apps => {result = apps;throw stop;};
Common.printError = () => {};
Common.retErr = error => error;
const prefix = fs.readFileSync(path.join(__dirname,'vendor/API-startJson.prefix.txt'),'utf8');
const method = vm.runInThisContext('(function(Common,fs,path,debug,conf){return ({'+prefix+'\n}})._startJson})', {filename:'actual-PM2-6.0.14-consumer'})(Common,fs,path,()=>{}, {PREFIX_MSG_ERR:'',ERROR_EXIT:1});
try {
  method.call({cwd:process.cwd(),exitCli(){throw Error('PM2 parse denied');}},process.argv[2],{only:process.argv[3]},'restartProcessId');
} catch(e) { if(e !== stop) throw e; }
if (!result) throw Error('PM2 consume boundary not reached');
// This file is used only on synthetic configurations. Production output must
// never print apps/env. Python tests consume it in memory, no private evidence.
process.stdout.write(JSON.stringify(result));
