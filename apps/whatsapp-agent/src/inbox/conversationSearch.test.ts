import assert from "node:assert/strict";
import test from "node:test";
import {
  inboxConversationMatchesSearch,
  normalizeInboxConversationSearch,
  normalizeInboxPhoneSearch,
  normalizeInboxProtocolSearch,
} from "./conversationSearch.js";

const item = {
  protocol: "CVT-A1B2C3D4E5F6",
  leadName: "Mária Júlia",
  leadPhone: "+55 (81) 99999-3209",
  waId: "5581999993209",
  waIdCanonical: "5581999993209",
  id: "7e4d93d4-8d31-4b0d-a751-729537a74f39",
  lastMessage: { bodyText: "Última mensagem" },
};

test("inbox search normalizes accents, case and phone punctuation", () => {
  assert.equal(normalizeInboxConversationSearch("  MÁRIA  "), "maria");
  assert.equal(normalizeInboxPhoneSearch("+55 (81) 99999-3209"), "5581999993209");
  assert(inboxConversationMatchesSearch(item, "maria julia"));
  assert(inboxConversationMatchesSearch(item, "(81) 99999-3209"));
});

test("protocol search accepts complete and partial forms", () => {
  assert.equal(normalizeInboxProtocolSearch("Protocolo CVT-a1b2-c3d4"), "A1B2C3D4");
  assert(inboxConversationMatchesSearch(item, "CVT-A1B2C3D4E5F6"));
  assert(inboxConversationMatchesSearch(item, "c3d4e5"));
  assert.equal(inboxConversationMatchesSearch(item, "not-found"), false);
});

