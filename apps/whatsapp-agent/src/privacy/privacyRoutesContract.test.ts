import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const routesSource = fs.readFileSync(path.join(process.cwd(), "src/http/routes.ts"), "utf8");
const crmReadModelSource = fs.readFileSync(path.join(process.cwd(), "src/crm/crmContactsReadModel.ts"), "utf8");

test("privacy subject search is admin-only and reuses CRM read model for active and excluded subjects", () => {
  const block = routesSource.slice(
    routesSource.indexOf('pathname === "/app/privacy/subjects/search"'),
    routesSource.indexOf("const subjectPrivacyMatch")
  );

  assert.ok(block.includes("isAdminRole(clientAuth.role)"));
  assert.ok(block.includes("buildCrmContactsPayload"));
  assert.ok(block.includes('operationalStatus: "active"'));
  assert.ok(block.includes('operationalStatus: "excluded"'));
  assert.ok(block.includes("includeAnonymized: true"));
  assert.ok(block.includes("return Boolean(item.contactId || item.leadId);"));
});

test("privacy subject resolve accepts CRM Lead target without materializing Contact", () => {
  const start = routesSource.indexOf('"/app/privacy/subjects/resolve"');
  const end = routesSource.indexOf("const subjectPrivacyMatch", start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const block = routesSource.slice(start, end);
  assert.ok(block.length > 0);

  assert.ok(block.includes("isAdminRole(clientAuth.role)"));
  assert.ok(block.includes('req.method === "POST"'));
  assert.ok(block.includes("let item = payload?.item ?? null"));
  assert.ok(block.includes("let contactId = item?.contactId ?? null"));
  assert.ok(block.includes("where: { id: resolvedLeadId, tenantId: client.id }"));
  assert.ok(block.includes("json(res, 200, { ok: true, contactId, leadId: item.leadId, item })"));
  assert.equal(block.includes("upsertCrmContact"), false);
  assert.ok(block.includes('error: "subject_not_found"'));
});

test("privacy subject preview and anonymize support Lead target without changing RBAC", () => {
  const start = routesSource.indexOf("const subjectPrivacyMatch");
  const end = routesSource.indexOf('logger.error({ event: "privacy.subject.error"', start);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const block = routesSource.slice(start, end);

  assert.ok(block.includes("isAdminRole(clientAuth.role)"));
  assert.ok(block.includes('const targetType = query.target === "lead" ? "lead" : "contact";'));
  assert.ok(block.includes('targetType === "lead" ? { leadId: subjectId } : { contactId: subjectId }'));
  assert.ok(block.includes("previewDataSubjectAnonymization(prisma"));
  assert.ok(block.includes("anonymizeDataSubject(prisma"));
});

test("CRM privacy shortcut resolution accepts current and legacy WhatsApp identity hashes", () => {
  assert.ok(crmReadModelSource.includes("hashWhatsAppExternalUser"));
  assert.ok(crmReadModelSource.includes("function buildExternalUserHashCandidates"));
  assert.ok(crmReadModelSource.includes("buildCrmWhatsappExternalUserHash(key)"));
  assert.ok(crmReadModelSource.includes("hashWhatsAppExternalUser(key)"));
  assert.ok(crmReadModelSource.includes("`hash:${hashWhatsAppExternalUser(key)}`"));
  assert.ok(crmReadModelSource.includes("const identityHashes = buildExternalUserHashCandidates(identityKeys);"));
  assert.ok(crmReadModelSource.includes("...buildExternalUserHashCandidates(seedIdentityKeys)"));
});

test("privacy subject preview exposes a human-readable subject label", () => {
  const serviceSource = fs.readFileSync(path.join(process.cwd(), "src/privacy/privacyRetentionService.ts"), "utf8");

  assert.ok(serviceSource.includes("displayName: graph.contact?.name ?? graph.subjectLead?.name ?? null"));
  assert.ok(serviceSource.includes("phoneDisplay"));
  assert.ok(serviceSource.includes("const subjectWaId = graph.contact?.waId ?? graph.subjectLead?.waIdCanonical"));
});
