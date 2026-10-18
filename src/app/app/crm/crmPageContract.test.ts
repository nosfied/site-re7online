import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/crm/page.tsx"), "utf8");
const campaignsPageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/campaigns/page.tsx"), "utf8");

test("CRM contacts list exposes compact campaign relationship summary", () => {
  assert.ok(pageSource.includes("Campanhas"));
  assert.ok(pageSource.includes("item.campaignRelationship"));
  assert.ok(pageSource.includes("campaign.campaignCount"));
  assert.ok(pageSource.includes("campaign.latestCampaignName"));
  assert.ok(pageSource.includes("campaign.latestCampaignAt"));
  assert.ok(pageSource.includes("campaign.latestRecipientStatus"));
  assert.ok(pageSource.includes("Sem campanhas"));
});

test("CRM contact detail exposes on-demand campaign history", () => {
  assert.ok(pageSource.includes("detail?.campaignRelationshipHistory?.items"));
  assert.ok(pageSource.includes('<DetailSection title="Histórico">'));
  assert.ok(pageSource.includes("Campanhas relacionadas"));
  assert.ok(pageSource.includes("CampaignHistoryRow"));
  assert.ok(pageSource.includes("Nenhuma campanha vinculada a este contato."));
  assert.ok(pageSource.includes("Há mais registros. Abra campanhas para consultar o histórico completo."));
});

test("CRM campaign relationship reuses the departments expandable row pattern", () => {
  assert.ok(pageSource.includes("theme-list-row theme-list-row-even overflow-hidden rounded-xl border"));
  assert.ok(pageSource.includes("departments-settings-department-header grid"));
  assert.ok(pageSource.includes("grid-cols-[minmax(0,1fr)_auto]"));
  assert.ok(pageSource.includes("expand-row-action-slot"));
  assert.ok(pageSource.includes("grid h-8 w-8 place-items-center rounded-full border"));
  assert.ok(pageSource.includes('aria-expanded={campaignsExpanded}'));
  assert.ok(pageSource.includes("aria-controls={`contact-campaign-panel-${item.leadId}`}"));
  assert.ok(pageSource.includes("departments-settings-department-body grid gap-2 bg-black/10 px-3 py-3 md:px-4"));
  assert.ok(pageSource.includes("›"));
});

test("CRM row actions expose open, privacy and delete without row edit action", () => {
  const rowBlock = pageSource.slice(
    pageSource.indexOf("function CrmContactRow"),
    pageSource.indexOf("function CampaignHistoryRow")
  );
  assert.ok(pageSource.includes("aria-label={ariaLabel ?? label}"));
  assert.ok(rowBlock.includes('label="Abrir contato"'));
  assert.ok(rowBlock.includes('label="Privacidade"'));
  assert.ok(rowBlock.includes('ariaLabel="Gerenciar privacidade do contato"'));
  assert.ok(rowBlock.includes('icon="🔒"'));
  assert.ok(rowBlock.includes('label="Retirar da operação"'));
  assert.ok(!rowBlock.includes('label="Excluir contato"'));
  assert.ok(rowBlock.includes("onClick={() => onOpenDetail(item)}"));
  assert.ok(rowBlock.includes("onClick={() => onOpenPrivacy(item)}"));
  assert.ok(rowBlock.includes("onClick={() => onDelete(item)}"));
  assert.ok(!rowBlock.includes("disabled={!item.contactId}"));
  assert.ok(!rowBlock.includes("disabled={!item.hasConversation"));
  assert.ok(!rowBlock.includes("disabled={!item.conversationsCount"));
  assert.ok(rowBlock.includes("disabled={!canDelete || item.isOperationallyExcluded}"));
  assert.ok(!rowBlock.includes('label="Editar cadastro"'));
  assert.ok(pageSource.includes("requestContactExclusion"));
  assert.ok(pageSource.includes("router.push(`/app/settings/privacy?${query}`);"));
  assert.ok(pageSource.includes("contactId=${encodeURIComponent(item.contactId)}"));
  assert.ok(pageSource.includes("leadId=${encodeURIComponent(item.leadId)}"));
  assert.ok(pageSource.includes("Retirar este contato da operação?"));
  assert.ok(pageSource.includes("event.stopPropagation();"));
  assert.ok(!pageSource.includes("border-red-300/30 bg-red-500/10 p-3"));
});

test("CRM manual contact modal uses shared app error labels for invalid phone", () => {
  const modalBlock = pageSource.slice(
    pageSource.indexOf("function CreateContactModal"),
    pageSource.indexOf("function ContactDetailPanel")
  );
  assert.ok(modalBlock.includes('normalizeAppErrorMessage(typed, "Não foi possível salvar o contato.")'));
  assert.ok(pageSource.includes("getAppErrorUxMessage"));
  assert.ok(!modalBlock.includes("normalizeCrmWhatsappIdentity"));
  assert.ok(!modalBlock.includes("normalizeCrmContactInput"));
  assert.ok(!modalBlock.includes("invalid_phone"));
});

test("CRM contact exclusion with active conversation shows actionable user copy", () => {
  assert.ok(pageSource.includes("function isActiveConversationExclusionError"));
  assert.ok(pageSource.includes("active_conversation_exists"));
  assert.ok(pageSource.includes("hidden_active_conversation_exists"));
  assert.ok(pageSource.includes("Este contato tem um atendimento ativo vinculado."));
  assert.ok(pageSource.includes("Finalize ou retire esse atendimento da operação antes de retirar o contato."));
  assert.ok(pageSource.includes("O contato não foi alterado."));
  assert.ok(pageSource.includes("getContactExclusionErrorMessage(typed, blockingConversation)"));
  assert.ok(!pageSource.includes('normalizeAppErrorMessage(error, "Não foi possível retirar o contato da operação.")'));
  assert.ok(pageSource.includes("Não foi possível concluir a retirada. Atualize a lista e tente novamente."));
});

test("CRM contact exclusion does not report mutation failure when only list refresh fails", () => {
  assert.ok(pageSource.includes("await excludeAppCrmContactFromOperation(session, leadId);"));
  assert.ok(pageSource.includes("setError(null);"));
  assert.ok(pageSource.includes("Contato retirado da operação. O histórico foi preservado."));
  assert.ok(pageSource.includes("Contato retirado da operação. Atualize a página se a lista não refletir a alteração."));
  assert.ok(pageSource.includes("try {\n        await loadContacts(session, page);"));
});

test("CRM contact detail opens only Inbox-projectable historical conversations", () => {
  const detailBlock = pageSource.slice(
    pageSource.indexOf('<DetailSection title="Atendimento">'),
    pageSource.indexOf('</DetailSection>', pageSource.indexOf('<DetailSection title="Atendimento">'))
  );
  assert.ok(detailBlock.includes("conversation.canOpenInInbox ? ("));
  assert.ok(detailBlock.includes('label="Abrir conversa na caixa de entrada"'));
  assert.ok(detailBlock.includes("onOpenInbox(conversation.conversationIdentity)"));
});

test("CRM CSV import modal uses one secondary action per import state", () => {
  const importBlock = pageSource.slice(
    pageSource.indexOf("function CsvImportModal"),
    pageSource.indexOf("export default function AppCrmContactsPage")
  );
  assert.ok(importBlock.includes('{reportVisible ? "Fechar" : "Cancelar"}'));
  assert.ok(importBlock.includes('aria-label={reportVisible ? "Fechar importação" : "Cancelar importação"}'));
  assert.ok(!importBlock.includes("Cancelar importação\n                </button>"));
  assert.ok(!importBlock.includes("resetImportState"));
});

test("CRM detail keeps close navigation and edit semantics without detail delete", () => {
  const detailStart = pageSource.indexOf('<aside');
  const shellBlock = pageSource.slice(
    detailStart,
    pageSource.indexOf('<div className="min-h-0 overflow-y-auto', detailStart)
  );
  const headerBlock = shellBlock.slice(shellBlock.indexOf('<header className="theme-surface-strong'));
  assert.ok(shellBlock.includes('aria-label="Fechar"'));
  assert.ok(shellBlock.includes("absolute right-3 top-3 z-10"));
  assert.ok(headerBlock.includes('label={editingBasics ? "Cancelar edicao" : "Editar dados"}'));
  assert.ok(!headerBlock.includes("Retirar da operação"));
  assert.ok(!headerBlock.includes('variant="destructive"'));
  assert.ok(!headerBlock.includes('aria-label="Fechar"'));
});

test("CRM campaign relationship labels hide raw internal status codes", () => {
  assert.ok(pageSource.includes('return "Entregue"'));
  assert.ok(pageSource.includes('return "Lida"'));
  assert.ok(pageSource.includes('return "Falhou"'));
  assert.ok(pageSource.includes('return "Bloqueada por opt-out"'));
  assert.ok(pageSource.includes('return "Conflito de contato"'));
  assert.ok(pageSource.includes('return "Ignorada"'));
});

test("CRM campaign history links to the existing campaign detail surface", () => {
  assert.ok(pageSource.includes("campaign.campaignHref"));
  assert.ok(pageSource.includes("Abrir campanha"));
  assert.ok(campaignsPageSource.includes('new URLSearchParams(window.location.search).get("campaignId")'));
  assert.ok(campaignsPageSource.includes("openCampaignDetail(requestedCampaignId)"));
  assert.ok(campaignsPageSource.includes("setDetailModalOpen(true)"));
  assert.ok(campaignsPageSource.includes('current === "create" ? "all" : current'));
  assert.ok(!campaignsPageSource.includes('setActiveTab("create");\n  }, [openCampaignDetail'));
});

test("CRM contacts campaign relationship keeps financial values out of customer UX", () => {
  for (const forbidden of ["R$", "USD", "provider cost", "Meta rate", "contract price", "billing amount"]) {
    assert.ok(!pageSource.includes(forbidden), `CRM page still contains ${forbidden}`);
  }
});

test("CRM campaign relationship remains responsive in list and detail", () => {
  assert.ok(pageSource.includes("overflow-x-auto"));
  assert.ok(pageSource.includes("min-w-[1280px]"));
  assert.ok(pageSource.includes("md:grid-cols-[1fr_auto] md:items-center"));
  assert.ok(pageSource.includes("max-h-[calc(100vh-2rem)]"));
});

test("CRM CSV import requires preview before confirmation and locks duplicate preview actions", () => {
  const modalBlock = pageSource.slice(
    pageSource.indexOf("function CsvImportModal"),
    pageSource.indexOf("export default function AppCrmContactsPage")
  );
  assert.ok(modalBlock.includes("Selecione o arquivo e gere a prévia antes de confirmar a importação."));
  assert.ok(modalBlock.includes("const previewReady = Boolean(preview && !reportVisible);"));
  assert.ok(modalBlock.includes("const previewMappingDirty = Boolean(preview && !reportVisible && previewMappingKey !== mappingKey);"));
  assert.ok(modalBlock.includes("Boolean(preview) && !previewMappingDirty"));
  assert.ok(modalBlock.includes("previewMappingDirty || preview.readyToImport === 0"));
  assert.ok(modalBlock.includes("{(inspection || preview) && !reportVisible ? ("));
  assert.ok(modalBlock.includes("Confirmar importação"));
  assert.ok(modalBlock.includes('{reportVisible ? "Fechar" : "Cancelar"}'));
  assert.ok(!modalBlock.includes("Cancelar importação\n                </button>"));
});

test("CRM CSV import hides cancel and import actions after completed summary", () => {
  const modalBlock = pageSource.slice(
    pageSource.indexOf("function CsvImportModal"),
    pageSource.indexOf("export default function AppCrmContactsPage")
  );
  assert.ok(modalBlock.includes("const reportVisible = Boolean(summary);"));
  assert.ok(modalBlock.includes("!reportVisible ? (\n                <button"));
  assert.ok(modalBlock.includes("const previewReady = Boolean(preview && !reportVisible);"));
  assert.ok(modalBlock.includes("{previewReady ? ("));
  assert.ok(modalBlock.includes('{reportVisible ? "Fechar" : "Cancelar"}'));
  assert.ok(!modalBlock.includes("resetImportState"));
});

test("CRM CSV import can refresh preview after column mapping changes", () => {
  const modalBlock = pageSource.slice(
    pageSource.indexOf("function CsvImportModal"),
    pageSource.indexOf("export default function AppCrmContactsPage")
  );
  assert.ok(modalBlock.includes("const [inspection, setInspection] = useState"));
  assert.ok(modalBlock.includes("const [inspectLoading, setInspectLoading] = useState(false);"));
  assert.ok(modalBlock.includes("onInspect({ csvText: nextCsvText })"));
  assert.ok(modalBlock.includes("const headers = inspection?.headers ?? preview?.headers ?? [];"));
  assert.ok(modalBlock.includes("Selecione a coluna que contém o telefone para gerar a prévia."));
  assert.ok(modalBlock.includes("setLocalError(\"Selecione a coluna que contém o telefone.\");"));
  assert.ok(modalBlock.includes("!phoneColumn.trim()"));
  assert.ok(modalBlock.includes("const [previewMappingKey, setPreviewMappingKey] = useState(\"\");"));
  assert.ok(modalBlock.includes("const [mappingTouched, setMappingTouched]"));
  assert.ok(modalBlock.includes("const buildMappedColumn = (field: CsvMappingField, value: string)"));
  assert.ok(modalBlock.includes("const mappingKey = JSON.stringify(mapping);"));
  assert.ok(modalBlock.includes("setPreviewMappingKey(getMappingKey({"));
  assert.ok(modalBlock.includes("phoneColumn: nextPhoneColumn || (mappingTouched.phoneColumn ? null : undefined)"));
  assert.ok(modalBlock.includes("nameColumn: nextNameColumn || (mappingTouched.nameColumn ? null : undefined)"));
  assert.ok(modalBlock.includes("crmSituationColumn: nextCrmSituationColumn || (mappingTouched.crmSituationColumn ? null : undefined)"));
  assert.ok(modalBlock.includes("companyColumn: nextCompanyColumn || (mappingTouched.companyColumn ? null : undefined)"));
  assert.ok(modalBlock.includes("cityColumn: nextCityColumn || (mappingTouched.cityColumn ? null : undefined)"));
  assert.ok(modalBlock.includes("emailColumn: nextEmailColumn || (mappingTouched.emailColumn ? null : undefined)"));
  assert.ok(modalBlock.includes("serviceColumn: nextServiceColumn || (mappingTouched.serviceColumn ? null : undefined)"));
  assert.ok(modalBlock.includes("updatePhoneColumn(event.target.value)"));
  assert.ok(modalBlock.includes("updateNameColumn(event.target.value)"));
  assert.ok(modalBlock.includes("updateCrmSituationColumn(event.target.value)"));
  assert.ok(modalBlock.includes("updateCompanyColumn(event.target.value)"));
  assert.ok(modalBlock.includes("updateCityColumn(event.target.value)"));
  assert.ok(modalBlock.includes("updateEmailColumn(event.target.value)"));
  assert.ok(modalBlock.includes("updateServiceColumn(event.target.value)"));
  assert.ok(modalBlock.includes("As colunas foram alteradas. Atualize a prévia antes de confirmar a importação."));
  assert.ok(modalBlock.includes('previewMappingDirty ? "Atualizar prévia" : "Pré-visualizar"'));
  assert.ok(modalBlock.includes("previewMappingDirty || preview.readyToImport === 0"));
  assert.ok(modalBlock.includes("setPreviewMappingKey(\"\");"));
  assert.ok(modalBlock.includes("if (requestSeq !== previewRequestSeq.current) return;"));
  assert.ok(modalBlock.includes("inspectLoading || previewLoading || importLoading"));
});

test("CRM CSV import auto-matches optional columns without making them required", () => {
  const modalBlock = pageSource.slice(
    pageSource.indexOf("function CsvImportModal"),
    pageSource.indexOf("export default function AppCrmContactsPage")
  );
  assert.ok(modalBlock.includes("return mappingTouched[field] ? null : undefined;"));
  assert.ok(modalBlock.includes("resetColumnMapping();"));
  assert.ok(modalBlock.includes("!mappingTouched.phoneColumn"));
  assert.ok(modalBlock.includes("!mappingTouched.nameColumn"));
  assert.ok(modalBlock.includes("!mappingTouched.crmSituationColumn"));
  assert.ok(modalBlock.includes("!mappingTouched.companyColumn"));
  assert.ok(modalBlock.includes("!mappingTouched.cityColumn"));
  assert.ok(modalBlock.includes("!mappingTouched.emailColumn"));
  assert.ok(modalBlock.includes("!mappingTouched.serviceColumn"));
  assert.ok(modalBlock.includes("setColumnTouched(\"phoneColumn\")"));
  assert.ok(modalBlock.includes("setColumnTouched(\"crmSituationColumn\")"));
  assert.ok(modalBlock.includes("<option value=\"\">Preservar/default</option>"));
});

test("CRM CSV import uses campaign-style preview/report tables and localized result labels", () => {
  const modalBlock = pageSource.slice(
    pageSource.indexOf("function CsvImportModal"),
    pageSource.indexOf("export default function AppCrmContactsPage")
  );
  assert.ok(pageSource.includes('return "Criar"'));
  assert.ok(pageSource.includes('return "Atualizar"'));
  assert.ok(pageSource.includes('return "Sem alteração"'));
  assert.ok(pageSource.includes('return "Fora da operação"'));
  assert.ok(pageSource.includes('return "Já associado"'));
  assert.ok(modalBlock.includes('className="w-full min-w-[900px] text-left text-sm"'));
  assert.ok(modalBlock.includes("getCrmImportOperationLabel(row.operation)"));
  assert.ok(modalBlock.includes("row.fieldsToUpdate?.length ? row.fieldsToUpdate.join(\", \") : \"-\""));
  assert.ok(modalBlock.includes("getCrmImportIssueCodeLabel(error.code, error.reason)"));
  assert.ok(modalBlock.includes("error.normalizedPhoneDisplay ?? error.normalizedPhone ?? error.inputPhone ?? error.phoneDisplay"));
  assert.ok(!modalBlock.includes("{row.operation}</td>"));
  assert.ok(!modalBlock.includes("Arquivo selecionado:"));
});

test("CRM contacts expose progress and scroll every preview row returned by the API", () => {
  const modalBlock = pageSource.slice(
    pageSource.indexOf("function CsvImportModal"),
    pageSource.indexOf("export default function AppCrmContactsPage")
  );
  assert.ok(pageSource.includes("Carregando página {page}..."));
  assert.ok(pageSource.includes('role="status" aria-live="polite"'));
  assert.ok(pageSource.includes("aria-busy={loading}"));
  assert.ok(modalBlock.includes("Lendo e analisando o arquivo..."));
  assert.ok(modalBlock.includes("max-h-[360px] overflow-auto"));
  assert.ok(modalBlock.includes("max-h-[420px] overflow-auto"));
  assert.ok(modalBlock.includes("sticky top-0 z-10"));
  assert.ok(modalBlock.includes("{rows.map((error) => ("));
  assert.ok(modalBlock.includes("{preview.rows.map((row) => ("));
  assert.ok(!modalBlock.includes("rows.slice(0, 8)"));
  assert.ok(!modalBlock.includes("preview.rows.slice(0, 8)"));
  assert.ok(modalBlock.includes("A tabela e o CSV baixado contêm somente as ocorrências exibidas acima."));
  assert.ok(modalBlock.includes("Ela não consulta se o número possui conta no WhatsApp."));
  assert.ok(modalBlock.includes('className="grid gap-3 sm:grid-cols-2"'));
  assert.ok(modalBlock.includes('className="grid min-w-0 gap-1.5 text-sm"'));
  assert.ok(modalBlock.includes('className="theme-input h-10 w-full min-w-0'));
});

