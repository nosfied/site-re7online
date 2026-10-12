// Bounded, tenant-scoped READ ONLY fingerprints; no identity materialization or provider.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {PrismaClient}=require(process.env.RE7_API_CWD+'/node_modules/@prisma/client');
const db=new PrismaClient({log:[]}),clientId='10a98bf4-1587-43e8-83d4-e3a48c5d79d9',childId='94b5805b-5c6d-4c89-b047-959209261c21';
global.fetch=()=>{throw Error('provider_forbidden')};global.setInterval=()=>{throw Error('scheduler_forbidden')};
const hash=x=>crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex');
(async()=>{const data=await db.$transaction(async tx=>{
 await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8s'");await tx.$executeRawUnsafe("SET LOCAL lock_timeout='1s'");
 const result={};
 for(const[model,where]of[['contact',{clientId}],['lead',{tenantId:clientId}],['conversation',{clientId}],['conversationRuntimeState',{clientId}]]){
  const n=await tx[model].count({where});assert(n<=1000,'bounded_crm_scope_exceeded');const rows=await tx[model].findMany({where,orderBy:{id:'asc'},take:1001});assert.equal(rows.length,n);result[model]={count:n,sha256:hash(rows)};
 }
 const events=await tx.event.findMany({where:{clientId,messageId:{startsWith:'campaign.'+childId+'.'},eventName:{in:['meta.usage.estimated','meta.usage.updated','billing.active_message.recovery_disposition','campaign.crm.historical_disposition','campaign.accepted_delivery.reconciled']}},orderBy:{id:'asc'},take:101});assert(events.length<=100,'bounded_event_scope_exceeded');result.usageDispositionReceipt={count:events.length,sha256:hash(events)};
 const outs=await tx.outboundMessage.findMany({where:{clientId,messageId:{startsWith:'campaign.'+childId+'.'}},orderBy:{id:'asc'},take:12});assert.equal(outs.length,6);result.outbounds={count:outs.length,sha256:hash(outs)};
 return result;
},{isolationLevel:'RepeatableRead',timeout:20000,maxWait:2000});process.stdout.write(JSON.stringify({result:'PROTECTED_DATA_FINGERPRINT_READ_ONLY',data})+'\n')})().catch(e=>{process.stderr.write(JSON.stringify({errorClass:e.name,code:e.code||null})+'\n');process.exitCode=1}).finally(()=>db.$disconnect());
