import assert from "node:assert/strict";
import test from "node:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPrivateCampaignSeedFields, readPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";

const keys = ["CAMPAIGN_SEED_WRITE_EPOCH", "CAMPAIGN_SEED_SECRET", "CAMPAIGN_SEED_HISTORICAL_SECRET",
  "CAMPAIGN_SEED_HISTORICAL_POLICY_FILE", "CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256", "CHANNEL_ACCOUNT_SECRET_KEY", "APP_AUTH_SECRET"];
const hash = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
test("canonical seed reader/writer: scoped immutable historical read and dedicated epoch write", () => {
  const before = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "re7-seed-epoch-"));
  try {
    for (const k of keys) delete process.env[k];
    const old = "synthetic-historical-key-".repeat(3), next = "synthetic-dedicated-key-".repeat(3);
    process.env.CHANNEL_ACCOUNT_SECRET_KEY = old;
    const historical = buildPrivateCampaignSeedFields({clientId:"tenant-a",waIds:["5541999990001"]});
    const original = JSON.stringify(historical), originalHash = hash(original);
    process.env.CAMPAIGN_SEED_WRITE_EPOCH = "epoch2";
    process.env.CAMPAIGN_SEED_SECRET = next;
    process.env.CAMPAIGN_SEED_HISTORICAL_SECRET = old;
    const file = path.join(folder, "allowlist.json");
    const policy = {version:1,expiresAt:Date.now()+60000,keySha256:hash(old),entries:[{
      clientId:"tenant-a",eventId:"event-original",field:"recipientsCiphertext",
      ciphertextSha256:hash(historical.recipientsCiphertext as string),payloadSha256:originalHash,
    }]};
    const setPolicy = (p: unknown) => {const raw=JSON.stringify(p);fs.writeFileSync(file,raw,{mode:0o600});process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256=hash(raw);};
    setPolicy(policy);process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_FILE=file;
    assert.deepEqual(readPrivateCampaignSeedFields(historical,{clientId:"tenant-a"}).recipients,["5541999990001"]);
    assert.equal(hash(JSON.stringify(historical)),originalHash);
    assert.throws(()=>readPrivateCampaignSeedFields(historical,{clientId:"tenant-b"}),/not_authorized/);
    assert.throws(()=>readPrivateCampaignSeedFields(historical),/context_missing/);
    assert.throws(()=>readPrivateCampaignSeedFields({...historical,campaignId:"invented"},{clientId:"tenant-a"}),/not_authorized/);
    const fresh = buildPrivateCampaignSeedFields({clientId:"tenant-a",waIds:["5541999990002"],componentsByWaId:{"5541999990002":[{type:"body",parameters:[{type:"text",text:"synthetic"}]}]}});
    assert.equal((fresh.recipientsCiphertext as string).startsWith("v2:"),true);
    assert.deepEqual(readPrivateCampaignSeedFields(fresh,{clientId:"tenant-a"}).recipients,["5541999990002"]);
    assert.throws(()=>readPrivateCampaignSeedFields(fresh,{clientId:"tenant-b"}),/binding_denied/);
    assert.throws(()=>readPrivateCampaignSeedFields({...fresh,componentsByWaIdCiphertext:fresh.recipientsCiphertext},{clientId:"tenant-a"}),/authentication_denied/);
    process.env.CAMPAIGN_SEED_SECRET = old;
    assert.throws(()=>readPrivateCampaignSeedFields(fresh,{clientId:"tenant-a"}),/dedicated_key_reused/);
    process.env.CAMPAIGN_SEED_SECRET = next;
    assert.throws(()=>readPrivateCampaignSeedFields({...historical,recipients:["plaintext"]},{clientId:"tenant-a"}),/fallback_denied/);
    setPolicy({...policy,expiresAt:Date.now()-1});
    assert.throws(()=>readPrivateCampaignSeedFields(historical,{clientId:"tenant-a"}),/expired_or_invalid/);
    assert.throws(()=>buildPrivateCampaignSeedFields({clientId:"tenant-a",waIds:[]}),/expired_or_invalid/);
    assert.deepEqual(readPrivateCampaignSeedFields(fresh,{clientId:"tenant-a"}).recipients,["5541999990002"]);
    setPolicy(policy);process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_SHA256="0".repeat(64);
    assert.throws(()=>readPrivateCampaignSeedFields(historical,{clientId:"tenant-a"}),/integrity_denied/);
    setPolicy(policy);fs.chmodSync(file,0o644);
    assert.throws(()=>readPrivateCampaignSeedFields(historical,{clientId:"tenant-a"}),/permissions_denied/);
    fs.chmodSync(file,0o600);
    setPolicy({...policy,entries:[...policy.entries,...policy.entries]});
    assert.throws(()=>readPrivateCampaignSeedFields(historical,{clientId:"tenant-a"}),/not_authorized/);
    setPolicy({...policy,entries:[null]});
    assert.throws(()=>readPrivateCampaignSeedFields(historical,{clientId:"tenant-a"}),/entry_invalid/);
    setPolicy(policy);
    const originalGetUid = process.getuid;
    try {
      process.getuid = () => -1;
      assert.throws(()=>readPrivateCampaignSeedFields(historical,{clientId:"tenant-a"}),/permissions_denied/);
    } finally { process.getuid = originalGetUid; }
    const link=path.join(folder,"policy-link.json");fs.symlinkSync(file,link);
    process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_FILE=link;
    assert.throws(()=>readPrivateCampaignSeedFields(historical,{clientId:"tenant-a"}),/symlink_denied/);
    process.env.CAMPAIGN_SEED_HISTORICAL_POLICY_FILE=file;
    delete process.env.CAMPAIGN_SEED_SECRET;
    assert.throws(()=>buildPrivateCampaignSeedFields({clientId:"tenant-a",waIds:[]}),/dedicated_key_missing/);
    assert.equal(hash(JSON.stringify(historical)),originalHash);
  } finally {
    for (const k of keys) {if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
    fs.rmSync(folder,{recursive:true,force:true});
  }
});
