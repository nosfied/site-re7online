import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/settings/privacy/page.tsx"), "utf8");
const apiSource = fs.readFileSync(path.join(process.cwd(), "src/lib/appClientApi.ts"), "utf8");

test("Privacy subject flow accepts CRM shortcut preselection without direct anonymization", () => {
  assert.ok(pageSource.includes('params.get("contactId")'));
  assert.ok(pageSource.includes('params.get("leadId")'));
  assert.ok(pageSource.includes("setSubjectContactId(queryContactId)"));
  assert.ok(pageSource.includes("resolveAppPrivacySubjectFromCrmLead"));
  assert.ok(pageSource.includes("setSubjectContactId(response.contactId ?? \"\")"));
  assert.ok(pageSource.includes("setSubjectLeadId(response.leadId)"));
  assert.ok(pageSource.includes("function buildSubjectDisplayLabel"));
  assert.ok(pageSource.includes("function buildSubjectPreviewDisplayLabel"));
  assert.ok(pageSource.includes('contact.displayName || contact.phoneDisplay || "Contato selecionado"'));
  assert.ok(pageSource.includes('subject.displayName || subject.phoneDisplay || "Contato selecionado"'));
  assert.ok(pageSource.includes('setSelectedSubjectLabel("Carregando contato...")'));
  assert.ok(pageSource.includes("setSelectedSubjectLabel(buildSubjectPreviewDisplayLabel(response.subject))"));
  assert.ok(pageSource.includes("setSubjectSearch(\"\")"));
  assert.ok(pageSource.includes("setSubjectResults([])"));
  assert.ok(pageSource.includes("setSelectedSubjectLabel(\"\")"));
  assert.ok(pageSource.includes("setSubjectContactId(\"\")"));
  assert.ok(pageSource.includes("setSubjectLeadId(\"\")"));
  assert.ok(pageSource.includes("setSubjectPreview(null)"));
  assert.ok(apiSource.includes("displayName: string | null"));
  assert.ok(apiSource.includes("phoneDisplay: string | null"));
  assert.ok(!pageSource.includes("Contato selecionado pelo CRM"));
  assert.ok(!pageSource.includes("setSelectedSubjectLabel(response.item.displayName || response.item.identifierDisplay"));
  assert.ok(!pageSource.includes("contact.displayName || contact.identifierDisplay || contact.phoneDisplay"));
  assert.ok(pageSource.includes("setSubjectFromShortcut(true)"));
  assert.ok(pageSource.includes("void handleSubjectPreview();"));
  assert.ok(pageSource.includes("Preparando..."));
  assert.ok(!pageSource.includes("Pré-visualizar anonimização"));
  assert.ok(!pageSource.includes("Pré-visualização do titular gerada"));
  assert.ok(!pageSource.includes("sem PII direta"));
  assert.ok(pageSource.includes("Resumo da anonimização"));
  assert.ok(pageSource.includes("subjectContactId || subjectLeadId ? ("));
  assert.ok(pageSource.includes("Titular selecionado:"));
  assert.ok(pageSource.includes("ANONIMIZAR TITULAR"));
  assert.ok(apiSource.includes('method: "POST"'));
  assert.ok(apiSource.includes("export type AppPrivacySubjectTarget"));
  assert.ok(apiSource.includes('?target=lead'));
  assert.ok(apiSource.includes("buildAppPrivacySubjectPath(target, \"preview\")"));
  assert.ok(apiSource.includes("buildAppPrivacySubjectPath(target, \"anonymize\")"));
  assert.ok(!pageSource.includes("subjectPreview.actions.map"));
  assert.ok(!pageSource.includes("subjectPreview.fieldsToAnonymize.map"));
  assert.ok(!pageSource.includes("subjectPreview.historicalObjectsPreserved.map"));
  assert.ok(!pageSource.includes("Contato: {subjectPreview.subject.contactId}"));
  assert.ok(!pageSource.includes("Referência interna"));
  assert.ok(!pageSource.includes("handleSubjectAnonymize();"));
});

test("Privacy subject search uses governance endpoint and shows derived statuses", () => {
  assert.ok(pageSource.includes("searchAppPrivacySubjects"));
  assert.ok(apiSource.includes("/app/privacy/subjects/search"));
  assert.ok(pageSource.includes("Boolean(item.contactId || item.leadId)"));
  assert.ok(pageSource.includes("subjectResults.map"));
  assert.ok(pageSource.includes("Selecionar"));
});

test("Privacy subject UI distinguishes verified completion from durable cleanup pending", () => {
  assert.ok(apiSource.includes('outcome: "verified"'));
  assert.ok(apiSource.includes('outcome: "runtime_cleanup_pending"'));
  assert.ok(apiSource.includes('response.status === 200'));
  assert.ok(apiSource.includes('response.status === 202'));
  assert.ok(apiSource.includes('payload.committed === true'));
  assert.ok(apiSource.includes('isPrivacySubjectCleanup(payload.cleanup, "verified")'));
  assert.ok(apiSource.includes('isPrivacySubjectCleanup(payload.cleanup, "pending")'));
  assert.ok(apiSource.includes('errorCode = "privacy_result_inconclusive"'));
  assert.ok(pageSource.includes('feedback.kind === "runtime_cleanup_pending"'));
  assert.ok(pageSource.includes("Anonimização confirmada. Limpeza de runtime pendente."));
  assert.ok(pageSource.includes("Retomar limpeza pendente"));
  assert.ok(pageSource.includes("Ela não inicia uma nova anonimização."));
  assert.ok(pageSource.includes("Resolva o estado pendente desta operação antes de selecionar outro titular."));
  assert.ok(pageSource.includes("Resolva o estado pendente desta operação antes de buscar outro titular."));
  assert.ok(pageSource.includes("subjectCleanupPending || subjectResultInconclusive"));
  assert.ok(pageSource.includes("Resultado da operação inconclusivo."));
  assert.ok(pageSource.includes("Verifique administrativamente o estado do titular antes de continuar."));
  assert.ok(pageSource.includes('setSuccess(feedback.message)'));
  assert.ok(!pageSource.includes('setSuccess("Titular anonimizado. O formulário foi limpo para uma nova operação.")'));
});

test("Privacy subject UI keeps strong confirmation and explicit safe denials", () => {
  assert.ok(pageSource.includes('subjectConfirmation !== "ANONIMIZAR TITULAR"'));
  assert.ok(pageSource.includes('error.errorCode === "concurrent_subject_change"'));
  assert.ok(pageSource.includes('error.errorCode === "storage_profile_unproven"'));
  assert.ok(pageSource.includes('error.errorCode === "privacy_cleanup_encryption_key_unavailable"'));
  assert.ok(pageSource.includes('error.errorCode === "privacy_result_inconclusive" || error.status === 0'));
  assert.ok(pageSource.includes("Não repita a anonimização sem verificar o estado do titular."));
});
