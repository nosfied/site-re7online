// Read-only bounded audit. No routes, runner, scheduler, entrypoint or provider.
const fs=require('fs'),crypto=require('crypto');
const cwd=process.env.RE7_API_CWD;const{PrismaClient}=require(cwd+'/node_modules/@prisma/client');
const db=new PrismaClient({log:[]});global.fetch=()=>{throw Error('provider_network_forbidden')};
const seedModule=require(cwd+'/dist/campaigns/campaignSeedPrivacy.js');const identityModule=require(cwd+'/dist/crm/crmWhatsappIdentity.js');
const clientId='10a98bf4-1587-43e8-83d4-e3a48c5d79d9';const parents=['1d7be01c-7545-493d-9be2-e14de005ac5c','44a209f2-fad6-4de5-8521-cd8ab07ae7b0','b019039e-0a89-4a42-9f33-c214323b888f'];
async function bounded(model,where,limit,orderBy={createdAt:'asc'}){const a=await model.findMany({where,take:limit+1,orderBy});if(a.length>limit)throw Error('bounded_query_truncated');return a;}
(async()=>{
 const data=await db.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');await tx.$executeRawUnsafe("SET LOCAL statement_timeout='8000ms'");await tx.$executeRawUnsafe("SET LOCAL lock_timeout='1000ms'");
  const observation=await tx.$queryRawUnsafe("SELECT transaction_timestamp() AS at,current_setting('transaction_read_only') AS read_only,current_setting('transaction_isolation') AS isolation");
  // Explicit parent IDs; find batch links by each campaign's durable relation.
  const parentRows=await bounded(tx.campaign,{clientId,id:{in:parents}},3);
  const batchRows=await bounded(tx.campaignExecutionBatch,{clientId,idempotencyKey:{in:parents.map(x=>`dynamic:${x}`)}},3);
  const links=await bounded(tx.campaignExecutionBatchCampaign,{clientId,batchId:{in:batchRows.map(x=>x.id)}},10,{chunkIndex:'asc'});
  const campaignIds=[...parents,...links.map(x=>x.campaignId)];const campaigns=await bounded(tx.campaign,{clientId,id:{in:campaignIds}},10);
  const events=await bounded(tx.event,{clientId,messageId:{in:campaignIds}},500);
  const decoded=events.filter(e=>['campaign.seed.saved','campaign.dynamic_batch_snapshot.created','campaign.dynamic_snapshot.created'].includes(e.eventName)).map(e=>({eventId:e.id,campaignId:e.messageId,eventName:e.eventName,createdAt:e.createdAt,payloadSha256:crypto.createHash('sha256').update(JSON.stringify(e.payloadJson)).digest('hex'),privateSeed:seedModule.readPrivateCampaignSeedFields(e.payloadJson)}));
  const snapshot=events.find(e=>e.id==='a3429d22-11b2-490b-abc3-67c2fe436875');if(!snapshot||snapshot.payloadJson.eligibleCount!==11||snapshot.payloadJson.matchedCount!==255)throw Error('original_snapshot_drift');
  const original=decoded.find(x=>x.eventId===snapshot.id);if(original.privateSeed.recipients.length!==11)throw Error('snapshot_decoder_incomplete');
  const candidates=identityModule.buildCrmWhatsappIdentityCandidates(original.privateSeed.recipients);
  const blockedIds=snapshot.payloadJson.blocked.map(x=>x.leadId);if(blockedIds.length!==244)throw Error('snapshot_blocked_drift');
  const leads=await bounded(tx.lead,{tenantId:clientId,OR:[{id:{in:blockedIds}},{waId:{in:candidates}},{waIdCanonical:{in:candidates}}]},300);
  const candidateLeads=leads.filter(x=>!blockedIds.includes(x.id));const allIds=candidateLeads.map(x=>x.id);
  const contacts=await bounded(tx.contact,{clientId,OR:[{waId:{in:candidates}},{legacyWaId:{in:candidates}},{externalUserRef:{in:candidates}}]},50);
  const identities=await bounded(tx.contactChannelIdentity,{clientId,OR:[{contactId:{in:contacts.map(x=>x.id)}},{legacyWaId:{in:candidates}},{externalUserRef:{in:candidates}}]},50);
  const origins=await bounded(tx.event,{clientId,eventName:{in:['crm.contact.created','crm.contact.import.summary','crm.contact.updated','crm.contact.status.changed','lead.status.changed']},OR:[{waId:{in:candidates}},{waIdCanonical:{in:candidates}},...allIds.map(id=>({payloadJson:{path:['leadId'],equals:id}}))]},150);
  const notes=await bounded(tx.leadNote,{tenantId:clientId,leadId:{in:allIds}},100);
  const config=await tx.tenantOperationalConfig.findUnique({where:{clientId}});
  const jobs=await bounded(tx.campaignExecutionJob,{clientId,OR:[{campaignId:{in:campaignIds}},{batchId:{in:batchRows.map(x=>x.id)}}]},15);
  const leases=await bounded(tx.tenantCampaignExecutionLease,{clientId},5,{expiresAt:'asc'});
  const outbounds=await bounded(tx.outboundMessage,{clientId,OR:links.map(x=>({messageId:{startsWith:`campaign.${x.campaignId}.`}}))},30);
  const statusCounts=await tx.$queryRawUnsafe('SELECT status,count(*)::int AS count FROM "Lead" WHERE "tenantId"=$1::uuid GROUP BY status ORDER BY status',clientId);
  const eventCounts=await tx.$queryRawUnsafe('SELECT "eventName",count(*)::int AS count FROM "Event" WHERE "clientId"=$1::uuid AND "createdAt">=\'2026-10-09\'::timestamptz AND "createdAt"<\'2026-10-10T15:40:25Z\'::timestamptz AND ("eventName" LIKE \'%preview%\' OR "eventName" LIKE \'%crm%status%\' OR "eventName" LIKE \'%lead%status%\') GROUP BY 1 ORDER BY 1',clientId);
  return{observation,campaigns,batches:batchRows,links,events,decoded,leads,contacts,identities,origins,notes,config,jobs,leases,outbounds,statusCounts,eventCounts,moduleHashes:Object.fromEntries(['dist/campaigns/campaignSeedPrivacy.js','dist/campaigns/campaignRunner.js','dist/campaigns/campaignEligibility.js','dist/campaigns/campaignAudiencePreview.js','dist/crm/crmContactsReadModel.js','dist/crm/crmWhatsappIdentity.js','dist/http/routes.js'].map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(cwd+'/'+n)).digest('hex')]))};
 },{isolationLevel:'RepeatableRead',timeout:30000,maxWait:5000});console.log(JSON.stringify(data));
})().catch(e=>{console.error(e.name+':'+e.code+':'+String(e.message).replace(/(?:postgres(?:ql)?|https?):\/\/[^\s]+/gi,'[redacted-url]'));process.exitCode=1}).finally(()=>db.$disconnect());
