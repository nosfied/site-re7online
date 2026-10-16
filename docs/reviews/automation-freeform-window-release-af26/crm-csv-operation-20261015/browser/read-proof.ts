import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
async function main() {
  const root=process.env.RE7_CSV_REVIEW_ROOT!, lab='/tmp/re7-csv-browser-20261015';
  const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55781');assert.equal(url.pathname,'/retention_lab');
  const {getPrisma}=await import(pathToFileURL(path.join(root,'apps/whatsapp-agent/src/db.ts')).href);const db=getPrisma();
  const results=[];
  for(const name of ['first-fixture.private.json','fixture.private.json']) {
    let raw: string; try { raw=await fs.readFile(path.join(lab,name),'utf8'); } catch(error) { if(name.startsWith('first-')&&(error as NodeJS.ErrnoException).code==='ENOENT') continue; throw error; }
    const {clientId}=JSON.parse(raw);
    const events=await db.event.findMany({where:{clientId,eventName:{startsWith:'crm.contact.import.'}}});
    const count=(n:string)=>events.filter((e:any)=>e.eventName==='crm.contact.import.'+n).length;
    assert.equal(count('started'),1);assert.equal(count('classified'),1);assert.equal(count('row'),2);assert.equal(count('finished'),1);assert.equal(count('uncertain'),0);
    const terminal=events.find((e:any)=>e.eventName==='crm.contact.import.finished')!.payloadJson as any;assert.equal(terminal.status,'COMPLETED');assert.equal(terminal.summary.created,2);assert.equal(terminal.summary.failed,0);
    assert.equal(await db.lead.count({where:{tenantId:clientId,NOT:{waId:{startsWith:'anon:'}}}}),64);
    assert.equal(await db.contact.count({where:{clientId,name:'LegacySynthetic'}}),0);
    results.push({admissions:1,rowReceipts:2,terminalReceipts:1,created:2,failed:0,visibleLeads:64,legacyPostWroteContacts:false});
  }
  await fs.writeFile(path.join(lab,'database-proof.sanitized.json'),JSON.stringify({result:'REAL_DATABASE_BROWSER_SCENARIOS_PASS',scenarios:results},null,2));
  await db.$disconnect();console.log('REAL_DATABASE_BROWSER_SCENARIOS_PASS');
}
void main().catch(e=>{console.error(e);process.exitCode=1});
