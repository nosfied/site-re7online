// One pinned pg.Client; private protocol only. No service controls or credentials in argv.
const fs=require('node:fs'),readline=require('node:readline'),{createRequire}=require('node:module');
(async()=>{
 const configuration=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const api=configuration.apps.find(a=>a.name==='re7-whatsapp-agent');
 const worker=configuration.apps.find(a=>a.name==='re7-whatsapp-web-worker');
 const requireWorker=createRequire(worker.cwd+'/package.json');const {Client}=requireWorker('pg');
 const client=new Client({connectionString:api.env.DATABASE_URL,application_name:'re7-cipher-seal-current',connectionTimeoutMillis:5000});
 await client.connect();
 const identity=(await client.query("SELECT json_build_object('database',current_database(),'role',session_user,'databaseOid',(SELECT oid FROM pg_database WHERE datname=current_database()),'serverVersion',current_setting('server_version_num'),'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system())) AS value")).rows[0].value;
 process.stdout.write(JSON.stringify({ready:true,identity})+'\n');
 try{
  for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
   const request=JSON.parse(line);if(typeof request.sql!=='string'||request.sql.length>64*1024*1024)throw Error('protocol_request_denied');
   try{const result=await client.query(request.sql);const results=Array.isArray(result)?result:[result];process.stdout.write(JSON.stringify({ok:true,rows:results.flatMap(r=>r.rows)})+'\n');}
   catch(error){process.stdout.write(JSON.stringify({ok:false,errorClass:error.name,sqlstate:error.code||null})+'\n');break;}
  }
 }finally{await client.end();}
})().catch(error=>{process.stderr.write(JSON.stringify({result:'PINNED_TRANSPORT_DENY',errorClass:error.name})+'\n');process.exitCode=1});
