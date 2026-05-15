import test from "node:test";
import assert from "node:assert/strict";
import {
  buildWhatsAppBackfillRiskByTenant,
  buildConversationIdentityKeys,
  buildWhatsAppBackfillDryRunReport,
  hashWhatsAppExternalUser,
  maskWhatsAppId,
  simulateWhatsAppBackfillRecord,
  type WhatsAppBackfillClient,
  type WhatsAppBackfillRecord,
} from "./whatsappBackfillDryRun.js";

const clients: WhatsAppBackfillClient[] = [
  { id: "tenant-1", clientKey: "tenant-one", phoneNumberIds: ["phone-1"] },
  { id: "tenant-2", clientKey: "tenant-two", phoneNumberIds: ["phone-a", "phone-b"] },
  { id: "tenant-3", clientKey: "tenant-three", phoneNumberIds: [], tenantConfigMetaPhoneNumberId: "phone-config" },
  { id: "tenant-4", clientKey: "missing-phone", phoneNumberIds: [] },
];

test("hashWhatsAppExternalUser is stable and masking hides raw waId", () => {
  const first = hashWhatsAppExternalUser("558499049614");
  const second = hashWhatsAppExternalUser("558499049614");

  assert.equal(first, second);
  assert.equal(first.length, 16);
  assert.equal(maskWhatsAppId("558499049614"), `hash:${first}`);
  assert.equal(maskWhatsAppId(""), null);
});

test("simulateWhatsAppBackfillRecord resolves direct phoneNumberId", () => {
  const result = simulateWhatsAppBackfillRecord(
    {
      model: "conversations",
      id: "conv-1",
      clientId: "tenant-1",
      waId: "558400000001",
      phoneNumberId: "phone-direct",
    },
    clients[0]
  );

  assert.equal(result.simulation.channel, "whatsapp");
  assert.equal(result.simulation.provider, "meta");
  assert.equal(result.simulation.channelAccountId, "phone-direct");
  assert.deepEqual(result.risks, []);
});

test("missing channelAccountId is detected when tenant has no resolvable phone", () => {
  const result = simulateWhatsAppBackfillRecord(
    {
      model: "runtimeStates",
      id: "runtime-1",
      clientId: "tenant-missing-phone",
      waId: "558400000002",
    },
    { id: "tenant-missing-phone", clientKey: "missing-phone", phoneNumberIds: [] }
  );

  assert.equal(result.simulation.channelAccountId, null);
  assert.equal(result.risks[0]?.type, "missing_channel_account_id");
  assert.equal(JSON.stringify(result).includes("558400000002"), false);
});

test("tenant config metaPhoneNumberId resolves when WaPhoneNumber is missing", () => {
  const result = simulateWhatsAppBackfillRecord(
    {
      model: "leads",
      id: "lead-config",
      clientId: "tenant-3",
      waId: "558400000099",
    },
    clients[2]
  );

  assert.equal(result.simulation.channelAccountId, "phone-config");
  assert.equal(result.risks.length, 0);
});

test("multiple possible channel accounts are detected", () => {
  const result = simulateWhatsAppBackfillRecord(
    {
      model: "leads",
      id: "lead-1",
      clientId: "tenant-2",
      waId: "558400000003",
    },
    clients[1]
  );

  assert.equal(result.risks[0]?.type, "multiple_channel_accounts");
});

test("report detects messages without matching conversation identity", () => {
  const conversation: WhatsAppBackfillRecord = {
    model: "conversations",
    id: "conv-1",
    clientId: "tenant-1",
    waId: "558400000010",
    phoneNumberId: "phone-1",
  };
  const report = buildWhatsAppBackfillDryRunReport({
    clients,
    conversationIdentityKeys: buildConversationIdentityKeys([conversation], clients),
    includeSamples: true,
    records: {
      conversations: [conversation],
      runtimeStates: [],
      inboundMessages: [
        {
          model: "inboundMessages",
          id: "in-1",
          clientId: "tenant-1",
          waId: "558400000011",
          phoneNumberId: "phone-1",
        },
      ],
      outboundMessages: [],
      leads: [],
      contacts: [],
    },
  });

  assert.equal(report.risks.messageWithoutConversation, 1);
  assert.equal(report.conflicts[0]?.type, "message_without_conversation");
});

test("report does not expose raw waId in JSON", () => {
  const rawWaId = "558499999999";
  const report = buildWhatsAppBackfillDryRunReport({
    clients,
    includeSamples: true,
    records: {
      conversations: [
        {
          model: "conversations",
          id: "conv-raw",
          clientId: "tenant-1",
          waId: rawWaId,
          phoneNumberId: "phone-1",
        },
      ],
      runtimeStates: [],
      inboundMessages: [],
      outboundMessages: [],
      leads: [],
      contacts: [],
    },
  });

  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes(rawWaId), false);
  assert.equal(serialized.includes("hash:"), true);
  assert.equal(report.samples[0]?.action, "would_backfill");
});

test("risk report groups missing channel account by tenant and model", () => {
  const report = buildWhatsAppBackfillDryRunReport({
    clients,
    includeRiskReport: true,
    records: {
      conversations: [],
      runtimeStates: [
        {
          model: "runtimeStates",
          id: "runtime-risk",
          clientId: "tenant-4",
          clientKey: "missing-phone",
          waId: "558400000012",
        },
      ],
      inboundMessages: [],
      outboundMessages: [],
      leads: [
        {
          model: "leads",
          id: "lead-risk",
          clientId: "tenant-4",
          clientKey: "missing-phone",
          waId: "558400000013",
        },
      ],
      contacts: [],
    },
  });

  const missingPhoneTenant = report.riskByTenant?.find((tenant) => tenant.tenantKey === "missing-phone");
  assert.ok(missingPhoneTenant);
  assert.equal(missingPhoneTenant.models.runtimeStates?.missingChannelAccountId, 1);
  assert.equal(missingPhoneTenant.models.leads?.missingChannelAccountId, 1);
  assert.equal(
    missingPhoneTenant.recommendation,
    "configure_wa_phone_number_or_tenant_meta_phone_number_id"
  );
  assert.equal(missingPhoneTenant.channelAccountResolution, "missing");
  assert.ok(missingPhoneTenant.warnings.includes("tenant_without_resolvable_channel_account"));
  assert.equal(JSON.stringify(report).includes("558400000012"), false);
});

test("risk report detects tenant with multiple phone numbers", () => {
  const result = simulateWhatsAppBackfillRecord(
    {
      model: "runtimeStates",
      id: "runtime-multiple",
      clientId: "tenant-2",
      waId: "558400000014",
    },
    clients[1]
  );
  const grouped = buildWhatsAppBackfillRiskByTenant(clients, result.risks);
  const tenantTwo = grouped.find((tenant) => tenant.tenantKey === "tenant-two");

  assert.equal(result.risks[0]?.type, "multiple_channel_accounts");
  assert.equal(tenantTwo?.recommendation, "choose_canonical_wa_phone_number");
  assert.equal(tenantTwo?.channelAccountResolution, "multiple_wa_phone_numbers");
  assert.ok(tenantTwo?.warnings.includes("multiple_wa_phone_numbers"));
  assert.equal(JSON.stringify(grouped).includes("phone-a"), false);
  assert.equal(JSON.stringify(grouped).includes("phone-b"), false);
});

test("risk report flags tenant config metaPhoneNumberId fallback without WaPhoneNumber", () => {
  const grouped = buildWhatsAppBackfillRiskByTenant(clients, []);
  const tenantThree = grouped.find((tenant) => tenant.tenantKey === "tenant-three");

  assert.ok(tenantThree);
  assert.equal(tenantThree.channelAccountResolution, "tenant_config_meta_phone_number_id");
  assert.equal(tenantThree.recommendation, "no_action_required");
  assert.ok(tenantThree.warnings.includes("tenant_without_wa_phone_number"));
  assert.ok(tenantThree.warnings.includes("tenant_config_meta_phone_number_id_without_wa_phone_number"));
  assert.equal(JSON.stringify(tenantThree).includes("phone-config"), false);
});
