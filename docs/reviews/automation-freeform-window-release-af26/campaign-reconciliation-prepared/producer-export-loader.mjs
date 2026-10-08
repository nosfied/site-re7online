// Test-only visibility hook. Original scheduling/seed functions and dependencies are unchanged.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const target = new URL('../../../../apps/whatsapp-agent/dist/http/routes.js', import.meta.url).href;
export async function load(url, context, next) {
 const result=await next(url,context);
 if(url!==target)return result;
 const original=fs.readFileSync(fileURLToPath(url));
 if(crypto.createHash('sha256').update(original).digest('hex')!=='eb2271e9a872aa0ab48d760cbf4e30d7780b283d475000e1e608ae6c035f1fb7')throw Error('producer_compiled_hash_drift');
 return {...result,source:original.toString()+'\nexport { scheduleScopedCampaignDraft, persistCampaignDraftSeed };\n'};
}
