'use strict';
// Procedure fragment, not CLI/PM2 API. Input is an already connected, peer-attested
// Unix FD. This code never connects, starts a daemon, binds, retries or resurrects.
const net=require('node:net'),path=require('node:path');
const [base,fdText]=process.argv.slice(2);
if(!base||!/^\d+$/.test(fdText||'')||Number(fdText)<3)throw Error('attested_fd_required');
// Reuse the pinned PM2 RPC codec, without Client.start/executeRemote/API/CLI.
const Req=require(path.join(base,'pm2-axon/lib/sockets/req.js'));
const Client=require(path.join(base,'pm2-axon-rpc/lib/client.js'));
const stream=new net.Socket({fd:Number(fdText),readable:true,writable:true});
const req=new Req();req.set('retry timeout',0);req.set('retry max timeout',0);
let finished=false;
const timer=setTimeout(()=>end(Error('reply_timeout')),5000);
function end(err,rows){
  if(finished)return;finished=true;clearTimeout(timer);req.close();stream.destroy();
  if(err){process.stderr.write('PM2_RPC_DENY_NO_RETRY\n');process.exitCode=1;return;}
  if(!Array.isArray(rows)){process.stderr.write('PM2_RPC_DENY_NO_RETRY\n');process.exitCode=1;return;}
  // Entire result is PRIVATE. Caller must redirect stdout to an exclusive600 file.
  process.stdout.write(JSON.stringify(rows)+'\n');

}
stream.once('error',e=>end(e));stream.once('close',()=>{if(!finished)end(Error('reply_lost'));});
req.once('error',e=>end(e));req.addSocket(stream);
new Client(req).call('getMonitorData',{},(err,rows)=>end(err,rows));
