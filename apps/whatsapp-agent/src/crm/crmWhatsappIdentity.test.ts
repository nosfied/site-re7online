import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCrmWhatsappIdentityCandidates,
  normalizeCrmWhatsappIdentity,
} from "./crmWhatsappIdentity.js";

test("CRM WhatsApp identity normalizes current Brazilian mobile inputs without requiring country code", () => {
  for (const input of ["84951957784", "5584951957784", "+55 84 95195-7784", "(84) 95195-7784"]) {
    const identity = normalizeCrmWhatsappIdentity(input);
    assert.equal(identity?.crmCanonicalPhone, "5584951957784");
    assert.deepEqual(identity?.providerCandidates, ["5584951957784", "558451957784"]);
  }
});

test("CRM WhatsApp identity preserves fixed-style Brazilian numbers and only emits mobile candidate as alias", () => {
  const identity = normalizeCrmWhatsappIdentity("84 3195-7784");
  assert.equal(identity?.crmCanonicalPhone, "558431957784");
  assert.deepEqual(identity?.providerCandidates, ["558431957784", "5584931957784"]);
});

test("CRM WhatsApp identity does not blindly add or remove Brazilian ninth digit", () => {
  assert.equal(normalizeCrmWhatsappIdentity("55 84 5195-7784")?.crmCanonicalPhone, "558451957784");
  assert.equal(normalizeCrmWhatsappIdentity("55 84 95195-7784")?.crmCanonicalPhone, "5584951957784");
});

test("CRM WhatsApp identity distinguishes DDD 55 from Brazilian country code", () => {
  assert.equal(normalizeCrmWhatsappIdentity("55 99140-0002")?.crmCanonicalPhone, "5555991400002");
  assert.equal(normalizeCrmWhatsappIdentity("55 55 99140-0002")?.crmCanonicalPhone, "5555991400002");
});

test("CRM WhatsApp identity candidates include stored domestic legacy records and E.164 aliases", () => {
  assert.deepEqual(
    buildCrmWhatsappIdentityCandidates(["84951957784"]),
    ["84951957784", "5584951957784", "558451957784", "8451957784"]
  );
});
