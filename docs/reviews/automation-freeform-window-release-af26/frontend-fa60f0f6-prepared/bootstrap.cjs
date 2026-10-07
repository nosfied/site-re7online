const fs = require('node:fs');
const v = JSON.parse(fs.readFileSync(process.argv[2]));
process.on('disconnect',()=>process.exit(0));
process.once('message', msg => {
  if (msg.go !== v.nonce) throw Error('release_nonce');
  process.argv = [process.execPath,v.entry,...v.args];
  require(v.entry);
});
process.send({boot:v.nonce,pid:process.pid});
