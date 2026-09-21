import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const sourcePath = fs.existsSync(path.join(process.cwd(), "src/crm/crmContactsReadModel.ts"))
  ? path.join(process.cwd(), "src/crm/crmContactsReadModel.ts")
  : path.join(process.cwd(), "apps/whatsapp-agent/src/crm/crmContactsReadModel.ts");
const source = fs.readFileSync(sourcePath, "utf8");

test("CRM contact origin is derived from canonical provenance evidence", () => {
  assert.ok(source.includes("CRM_CONTACT_CREATED_EVENT"));
  assert.ok(source.includes("CONTACT_PROVENANCE_EVENT_NAMES"));
  assert.ok(source.includes('source === "crm_manual"'));
  assert.ok(source.includes("CONTACT_ORIGIN_MANUAL"));
  assert.ok(source.includes('source === "crm_import"'));
  assert.ok(source.includes("CONTACT_ORIGIN_CSV"));
  assert.ok(source.includes("CONTACT_ORIGIN_CAMPAIGN"));
  assert.ok(source.includes("CONTACT_ORIGIN_CONVERSATION"));
  assert.ok(source.includes("CONTACT_ORIGIN_SYSTEM"));
  assert.ok(source.includes("CONTACT_ORIGIN_UNKNOWN"));
  assert.ok(source.includes("buildContactOriginLabel({"));
  assert.ok(!source.includes("model ContactOrigin"));
});

test("CRM Inbox action uses only human-Inbox-projectable conversations", () => {
  assert.ok(source.includes('import { shouldProjectConversationToHumanInbox } from "../inbox/messageVisibility.js";'));
  assert.ok(source.includes("function isHumanInboxProjectableConversation"));
  assert.ok(source.includes("shouldProjectConversationToHumanInbox({"));
  assert.ok(source.includes("const lastInboxConversation ="));
  assert.ok(source.includes("const latestInboxConversation ="));
  assert.ok(source.includes("canOpenInInbox"));
  assert.ok(source.includes("const canOpenInInbox = isHumanInboxProjectableConversation(conversation, runtime);"));
  assert.ok(source.includes("lastConversationId: lastInboxConversation?.id ?? null"));
  assert.ok(source.includes("lastConversationIdentity: lastInboxConversation ? getIdentityKey(lastInboxConversation) : null"));
  assert.ok(source.includes("conversationsCount: conversationSummary.count"));
  assert.ok(source.includes("hasConversation: hasConversationValue"));
  assert.ok(!source.includes("lastConversationId: lastConversation?.id ?? null"));
  assert.ok(!source.includes("lastConversationIdentity: lastConversation ? getIdentityKey(lastConversation) : null"));
});
