import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { getPrisma } from '../db.js';
import { campaignRecipientEligibility, campaignRecipientEligibilityBatch, normalizeCampaignRecipientIdentity } from './campaignEligibility.js';
import { recordContactOptOut } from './optOutRegistry.js';
import { ensureCampaignOutboundCrmAttemptMaterialization } from './campaignOutboundConversation.js';
import { sanitizeMailDeliveryError } from '../mail/canonicalMail.js';

test('identity rejects privacy markers, digitless invalid values and unsupported international E164 while preserving approved Brazilian aliases', () => {
  for (const marker of ['anon:subject:1234567890123', 'HASH:ANON:1234567890123', 'usuario anonimizado', '******12345678901', 'abc1234567890123', '4191202', 'sem-numero']) assert.equal(normalizeCampaignRecipientIdentity(marker), '');
  assert.equal(normalizeCampaignRecipientIdentity('+1 (202) 555-0199'), '');
  assert.equal(normalizeCampaignRecipientIdentity('5541991100901'), '5541991100901');
  assert.equal(normalizeCampaignRecipientIdentity('554191100901'), '554191100901');
});

test('real PostgreSQL: aliases/exclusion/optout/tenant and immutable old pseudo snapshots deny', async () => {
  const db = getPrisma(), clientId = crypto.randomUUID(), otherId = crypto.randomUUID();
  try {
    for (const id of [clientId, otherId]) await db.client.create({ data: { id, clientKey: `eligibility-${id}`, name: 'Synthetic', profile: 'business' } });
    await db.lead.create({ data: { tenantId: clientId, waId: 'anon:subject:1234567890123', waIdCanonical: 'anon:subject:1234567890123', status: 'NURTURE' } });
    assert.equal(await campaignRecipientEligibility(db, clientId, ['1234567890123']), 'anonymized_contact');
    assert.equal(await campaignRecipientEligibility(db, otherId, ['1234567890123']), 'unsupported_international_identity');
    await db.contact.create({ data: { clientId, waId: '554191100901', channel: 'whatsapp', operationallyExcludedAt: new Date() } });
    assert.equal(await campaignRecipientEligibility(db, clientId, ['5541991100901']), 'operationally_excluded_contact');
    assert.equal(await campaignRecipientEligibility(db, otherId, ['5541991100901']), null);
    await recordContactOptOut({ clientId, waId: '5541991100902', source: 'synthetic' });
    assert.equal(await campaignRecipientEligibility(db, clientId, ['554191100902']), 'active_send_blocked');
    assert.equal(await campaignRecipientEligibility(db, clientId, ['5541991100903'], 'instagram'), 'non_whatsapp_channel');
    assert.deepEqual(await campaignRecipientEligibilityBatch(db, clientId, [
      { values: ['sem-numero'] },
      { values: ['1234567890123'] },
      { values: ['5541991100901'] },
      { values: ['554191100902'] },
      { values: ['5541991100903'], channel: 'instagram' },
      { values: ['12025550199'] },
    ]), [
      'invalid_whatsapp_identity',
      'anonymized_contact',
      'operationally_excluded_contact',
      'active_send_blocked',
      'non_whatsapp_channel',
      'unsupported_international_identity',
    ]);
    await assert.rejects(ensureCampaignOutboundCrmAttemptMaterialization(db, { clientId, waId: '4191202', waIdCanonical: '4191202', phoneNumberId: 'synthetic', messageId: 'synthetic-accepted', campaignId: crypto.randomUUID(), campaignRunId: crypto.randomUUID(), templateName: 'synthetic', source: 'campaign' }), /Invalid WhatsApp number/);
    assert.equal(await db.contact.count({ where: { clientId, waId: '4191202' } }), 0);
    assert.equal(sanitizeMailDeliveryError(new Error('invalid_phone Bearer private token=private')), 'invalid_phone Bearer [REDACTED] token=[REDACTED]');
  } finally {
    await db.event.deleteMany({ where: { clientId: { in: [clientId, otherId] } } });
    await db.lead.deleteMany({ where: { tenantId: { in: [clientId, otherId] } } });
    await db.contact.deleteMany({ where: { clientId: { in: [clientId, otherId] } } });
    await db.client.deleteMany({ where: { id: { in: [clientId, otherId] } } });
    await db.$disconnect();
  }
});

test('eligibility change during template prevalidation blocks before fetch', async () => {
  const db = getPrisma(), clientId = crypto.randomUUID(), clientKey = `late-eligibility-${clientId}`;
  const { sendTemplate } = await import('../services/outboundTemplateService.js');
  const originalFetch = globalThis.fetch; let calls = 0;
  try {
    await db.client.create({ data: { id: clientId, clientKey, name: 'Synthetic', profile: 'business', features: { campaigns: true } } });
    await db.template.create({ data: { clientId, name: 'synthetic_final_gate', category: 'UTILITY', status: 'approved', language: 'pt_BR', content: 'Synthetic' } });
    globalThis.fetch = (async () => { calls++; throw new Error('provider_must_not_be_called'); }) as typeof fetch;
    const result = await sendTemplate({ clientId, clientKey, waId: '5541991100951', toE164: '5541991100951', intent: undefined,
      templateName: 'synthetic_final_gate', lang: 'pt_BR', beforeSubmit: async () => {
        await db.contact.create({ data: { clientId, waId: '5541991100951', channel: 'whatsapp', operationallyExcludedAt: new Date() } });
        return campaignRecipientEligibility(db, clientId, ['5541991100951']);
      } });
    assert.equal(result.blockedByEligibility, true); assert.equal(result.errorBody, 'operationally_excluded_contact'); assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; await db.$disconnect(); }
});

test('CSV/manual import plan rejects anonymized input before normalization without creating CRM', async () => {
  const db = getPrisma(), clientId = crypto.randomUUID();
  const { previewCampaignRecipientImport } = await import('./campaignRecipientImport.js');
  try {
    const plan = await previewCampaignRecipientImport(db, { clientId,
      template: { templateId: null, templateName: 'synthetic', category: 'UTILITY', templateContent: 'Synthetic' },
      existingSeed: { recipients: [] }, recipients: [
        { phone: 'anon:subject:5541991100952', rowNumber: 1 },
        { phone: 'hash:anon:5541991100953', rowNumber: 2 },
      ] });
    assert.equal(plan.summary.readyToImport, 0); assert.equal(plan.errors.length, 2);
    assert.ok(plan.errors.every(e => e.reason === 'invalid_whatsapp_identity' && !e.phoneDisplay));
    assert.equal(await db.contact.count({ where: { clientId } }), 0);
    assert.equal(await db.lead.count({ where: { tenantId: clientId } }), 0);
  } finally { await db.$disconnect(); }
});

test('post-acceptance diagnostics retain cause while redacting credentials/URLs/anonymous identity', async () => {
  const { campaignFailureDiagnostic } = await import('./campaignFailureDiagnostic.js');
  const result = campaignFailureDiagnostic(new Error('Invalid WhatsApp number password: "private" https://private.test/?token=private anon:subject:abcdef'));
  assert.match(result.errorMessage, /Invalid WhatsApp number/);
  assert.ok(!result.errorMessage.includes('private'));
  assert.ok(!result.errorMessage.includes('abcdef'));
});
