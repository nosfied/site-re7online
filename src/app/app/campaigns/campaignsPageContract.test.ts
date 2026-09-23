import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/campaigns/page.tsx"), "utf8");
const inboxSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/inbox/page.tsx"), "utf8");
const appShellSource = fs.readFileSync(path.join(process.cwd(), "src/components/app/AppShell.tsx"), "utf8");
const campaignDraftsSource = fs.readFileSync(path.join(process.cwd(), "src/lib/campaignDrafts.ts"), "utf8");

test("campaign center exposes persisted lifecycle tabs", () => {
  assert.ok(pageSource.includes('{ id: "sending", label: "Enviando" }'));
  assert.ok(pageSource.includes('{ id: "scheduled", label: "Agendadas" }'));
  assert.ok(pageSource.includes('{ id: "completed", label: "Concluídas" }'));
  assert.ok(pageSource.includes('case "sending":'));
  assert.ok(pageSource.includes('case "scheduled":'));
});

test("campaign progress modal observes backend state and can be closed", () => {
  assert.ok(pageSource.includes('selectedCampaign?.status !== "sending"'));
  assert.ok(pageSource.includes("refreshCampaignDetail(session, selectedCampaignId)"));
  assert.ok(pageSource.includes("refreshCampaigns(session, selectedCampaignId)"));
  assert.ok(pageSource.includes('onClick={() => setDetailModalOpen(false)}'));
  assert.ok(pageSource.includes('setActiveTab("sending")'));
  assert.ok(!pageSource.includes("startCampaignRun("));
});

test("customer campaign and inbox surfaces do not render financial estimates", () => {
  for (const forbidden of ["formatUsd", "CostPreviewCard", "Unitário estimado", "Total estimado", "formatBillingValue"]) {
    assert.ok(!pageSource.includes(forbidden), `campaign page still contains ${forbidden}`);
  }
  for (const forbidden of ["formatMetaUsd", "InboxCostPreview", "Unitário:", "Estimado:"]) {
    assert.ok(!inboxSource.includes(forbidden), `inbox page still contains ${forbidden}`);
  }
  assert.ok(!inboxSource.includes("A cobrança depende da categoria"));
  assert.ok(!inboxSource.includes("Mensagem pronta é enviada como texto comum. A cobrança depende"));
});

test("campaign destination remains department-only in standard flow", () => {
  assert.ok(pageSource.includes('<span className="text-white/70">Setor</span>'));
  assert.ok(pageSource.includes('type: "human_department"'));
  assert.ok(!pageSource.includes("Selecionar fila"));
  assert.ok(!pageSource.includes("returnQueueId"));
});

test("campaign result renders explicit blocked and skipped recipient states", () => {
  assert.ok(pageSource.includes('case "blocked":'));
  assert.ok(pageSource.includes('return "Bloqueada"'));
  assert.ok(pageSource.includes('return "Bloqueada para envios ativos"'));
  assert.ok(pageSource.includes('case "skipped":'));
  assert.ok(pageSource.includes('return "Ignorada"'));
});

test("campaign detail result shows full recipient phone for authorized users", () => {
  assert.ok(pageSource.includes('return digits || value || "-";'));
  assert.ok(!pageSource.includes('`${digits.slice(0, 4)}****${digits.slice(-4)}`'));
});

test("campaign confidence treats mixed success and failure as partial delivery", () => {
  assert.ok(pageSource.includes("const hasSuccessfulDeliverySignal = deliveredOrRead > 0;"));
  assert.ok(pageSource.includes("failed >= totalRecipients && !hasSuccessfulDeliverySignal"));
});

test("campaign detail distinguishes technical failures from blocked recipients", () => {
  assert.ok(pageSource.includes("Falhas técnicas"));
  assert.ok(pageSource.includes("selectedCampaign.blockedCount"));
});

test("campaign composer has one complete discard lifecycle", () => {
  assert.ok(pageSource.includes("const resetCampaignComposer = useCallback"));
  assert.ok(pageSource.includes("setForm(EMPTY_FORM)"));
  assert.ok(pageSource.includes("setAudienceFilters(EMPTY_AUDIENCE_FILTERS)"));
  assert.ok(pageSource.includes('setCsvText("")'));
  assert.ok(pageSource.includes("setCsvPreview(null)"));
  assert.ok(pageSource.includes("setExpandedCreationPanel(null)"));
  assert.ok(pageSource.includes("setFormError(null)"));
  assert.ok(pageSource.includes("setToast(null)"));
});

test("campaign tab navigation discards only after dirty confirmation", () => {
  assert.ok(pageSource.includes("const handleCampaignTabChange = useCallback"));
  assert.ok(pageSource.includes('activeTab === "create" && !confirmComposerDiscard()'));
  assert.ok(pageSource.includes("As informações desta campanha que ainda não foram salvas serão removidas."));
});

test("explicit draft persistence and running campaign controls remain separate from composer discard", () => {
  assert.ok(pageSource.includes("createAppCampaignDraft(session"));
  assert.ok(pageSource.includes("createAppCampaignDraftFromCsv(session"));
  assert.ok(pageSource.includes("sendAppCampaignDraft(session"));
  assert.ok(pageSource.includes("scheduleAppCampaignDraft(session"));
  assert.ok(pageSource.includes("setDetailModalOpen(false)"));
});

test("campaign result detail exposes status, CRM situation and text filters", () => {
  assert.ok(pageSource.includes("const [resultStatusFilter, setResultStatusFilter]"));
  assert.ok(pageSource.includes("const [resultCrmStatusFilter, setResultCrmStatusFilter]"));
  assert.ok(pageSource.includes("const [resultSearch, setResultSearch]"));
  assert.ok(pageSource.includes("const filteredCampaignResultItems = useMemo"));
  assert.ok(pageSource.includes('resultStatusFilter === "blocked"'));
  assert.ok(pageSource.includes("item.crmStatus !== resultCrmStatusFilter"));
  assert.ok(pageSource.includes("item.contactName"));
  assert.ok(pageSource.includes("item.phoneDisplay"));
  assert.ok(pageSource.includes("{filteredCampaignResultItems.length} de {campaignResultItems.length} destinatário(s)"));
});

test("campaign result filtered actions only operate on the visible result set", () => {
  assert.ok(pageSource.includes("const handleCopyFilteredResults"));
  assert.ok(pageSource.includes("filteredCampaignResultItems.map((item)"));
  assert.ok(pageSource.includes('const header = "Nome\\tTelefone\\tSituação CRM\\tResultado\\tEntrega\\tErro"'));
  assert.ok(pageSource.includes("const handleReuseFilteredResults"));
  assert.ok(pageSource.includes("applyCampaignReuse(selectedCampaign, {"));
  assert.ok(pageSource.includes('mode: "filtered_results"'));
  assert.ok(pageSource.includes("buildCampaignReuseState(campaign, options)"));
  assert.ok(pageSource.includes("buildAudiencePreviewFromCampaignResults"));
  assert.ok(pageSource.includes("buildAudiencePreviewFromDraftSeed"));
  assert.ok(pageSource.includes('setActiveTab("create")'));
});

test("campaign reuse toast and shared composer controls keep owner-visible polish", () => {
  assert.ok(pageSource.includes('type CampaignToastTone = "success" | "warning" | "error" | "info" | "reuse"'));
  assert.ok(pageSource.includes('case "reuse":'));
  assert.ok(pageSource.includes("border-cyan-300/45 bg-cyan-950/95 text-cyan-50"));
  assert.ok(pageSource.includes('warning ? "warning" : "reuse"'));
  assert.ok(pageSource.includes("const campaignComposerControlClasses ="));
  assert.ok(pageSource.includes("h-10 w-full min-w-0 rounded-md border border-white/20"));
  assert.ok(pageSource.includes('className="flex min-h-5 items-center justify-between gap-2 text-white/70"'));
  assert.ok(pageSource.includes('className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/70"'));
  assert.ok(pageSource.includes("getMetaTemplateCategoryUxLabel(selectedTemplateEffectiveCategory || selectedTemplate.category)"));
  assert.ok(!pageSource.includes("Categoria na Meta:"));
  assert.equal(pageSource.match(/className=\{campaignComposerControlClasses\}/g)?.length ?? 0, 2);
});

test("campaign detail deep link reuses list detail navigation instead of composer", () => {
  assert.ok(pageSource.includes("const openCampaignDetail = useCallback((campaignId: string) => {"));
  assert.ok(pageSource.includes("setSelectedCampaignId(campaignId);"));
  assert.ok(pageSource.includes("setDetailModalOpen(true);"));
  assert.ok(pageSource.includes('setActiveTab((current) => (current === "create" ? "all" : current));'));
  assert.ok(pageSource.includes("openCampaignDetail(requestedCampaignId);"));
  assert.ok(pageSource.includes("openCampaignDetail(campaign.id);"));
  const detailHelper = pageSource.slice(
    pageSource.indexOf("const openCampaignDetail"),
    pageSource.indexOf("useEffect(() => {\n    setCurrentPage")
  );
  assert.ok(!detailHelper.includes('setActiveTab("create")'));
  assert.ok(!detailHelper.includes("handleReuseCampaign"));
}
);

test("campaign creation exposes dynamic CRM-filter scheduling without freezing preview recipients", () => {
  assert.ok(pageSource.includes('type RecipientSelectionMode = "STATIC_RECIPIENTS" | "DYNAMIC_CRM_FILTER"'));
  assert.ok(pageSource.includes("Filtro dinâmico do CRM"));
  assert.ok(pageSource.includes("Os destinatários finais serão definidos no momento do envio."));
  assert.ok(pageSource.includes("Gerar estimativa"));
  assert.ok(pageSource.includes("Agendar filtro dinâmico"));
  assert.ok(pageSource.includes('q: dynamicPreview ? "" : audienceFilters.q'));
  assert.ok(pageSource.includes("channel: dynamicPreview ? null"));
  assert.ok(pageSource.includes('disabled={audienceRecipientMode === "DYNAMIC_CRM_FILTER"}'));
  assert.ok(pageSource.includes('campaign.selectionMode === "DYNAMIC_CRM_FILTER"'));
  assert.ok(pageSource.includes('selectionMode: "DYNAMIC_CRM_FILTER"'));
  assert.ok(pageSource.includes("dynamicFilter: { version: 1, crmBusinessStatusId }"));
  assert.ok(pageSource.includes("selectedLeadIds: []"));
  assert.ok(pageSource.includes("scheduleAppCampaignDraft(session, created.campaign.id, scheduledAt.toISOString())"));
});

test("campaign CRM audience panel uses neutral administrative tone", () => {
  const audienceBlock = pageSource.slice(
    pageSource.indexOf(">Audiência CRM<") - 1200,
    pageSource.indexOf("id=\"campaign-creation-panel-audience\"")
  );
  assert.ok(audienceBlock.includes("border border-white/15 bg-white/[0.045]"));
  assert.ok(audienceBlock.includes("focus:ring-re7-sky/60"));
  assert.ok(!audienceBlock.includes("emerald"));
});

test("campaign CSV import uses generic contact and field mapping", () => {
  assert.ok(pageSource.includes("csvPhoneColumn"));
  assert.ok(pageSource.includes("CSV_GENERIC_FIELD_COUNT = 10"));
  assert.ok(pageSource.includes("csvGenericFieldColumns"));
  assert.ok(pageSource.includes("<span className=\"text-white/70\">Contato</span>"));
  assert.ok(pageSource.includes("1. Mapear colunas do CSV"));
  assert.ok(pageSource.includes("2. Preencher variáveis da mensagem"));
  assert.ok(pageSource.includes("field.label"));
  assert.ok(pageSource.includes("contactColumn: csvPhoneColumn"));
  assert.ok(pageSource.includes("genericFieldColumns"));
  assert.ok(pageSource.includes("mappedCsvGenericFields.map"));
  assert.ok(pageSource.includes("updateCsvGenericFieldColumn"));
  assert.ok(pageSource.includes("detectCsvPhoneColumn(headers)"));
  assert.ok(pageSource.includes("previous && headers.includes(previous) ? previous : detectedPhoneColumn"));
  assert.ok(pageSource.includes("csvVariableMappingIncomplete"));
  assert.ok(pageSource.includes("Vincule cada variável do modelo a um campo mapeado do CSV."));
});

test("campaign CSV preview renders ready blocked and error rows in one reportable table", () => {
  assert.ok(pageSource.includes("csvPreview.recipients.length > 0 || csvPreview.errors.length > 0"));
  assert.ok(pageSource.includes("csvPreview.recipients.slice(0, 8).map"));
  assert.ok(pageSource.includes("csvPreview.errors.slice(0, Math.max(0, 8 - csvPreview.recipients.slice(0, 8).length)).map"));
  assert.ok(pageSource.includes("Pronto"));
  assert.ok(pageSource.includes("Bloqueado"));
  assert.ok(pageSource.includes("Linha"));
  assert.ok(pageSource.includes("Contato"));
  assert.ok(pageSource.includes("Motivo"));
  assert.ok(pageSource.includes("handleCopyCsvImportReport"));
  assert.ok(pageSource.includes("handleCopyCsvPreviewBlocks"));
  assert.ok(pageSource.includes("handleDownloadCsvImportReport"));
  assert.ok(pageSource.includes("Copiar erros e bloqueios"));
  assert.ok(pageSource.includes("Copiar relatório"));
  assert.ok(pageSource.includes("Baixar relatório CSV"));
});

test("campaign detail uses localized block reasons and distinct refresh/reuse icons", () => {
  assert.ok(campaignDraftsSource.includes('opt_out: "Contato bloqueado para envios ativos"'));
  assert.ok(campaignDraftsSource.includes('contact_operationally_excluded: "Contato excluído da operação"'));
  assert.ok(campaignDraftsSource.includes('invalid_identity: "Número/identidade inválida para envio"'));
  assert.ok(campaignDraftsSource.includes('missing_contact: "Contato atual não localizado"'));
  assert.ok(campaignDraftsSource.includes('no_eligible_recipients: "Nenhum destinatário está elegível para esta campanha."'));
  assert.ok(campaignDraftsSource.includes('template_variables_required: "Preencha todas as variáveis obrigatórias do modelo antes de enviar."'));
  assert.ok(pageSource.includes('label={refreshingDetail ? "Atualizando detalhe" : "Atualizar detalhe"}'));
  assert.ok(pageSource.includes('icon={refreshingDetail ? "…" : "↺"}'));
  assert.ok(pageSource.includes('label="Nova campanha com filtrados"'));
  assert.ok(pageSource.includes('icon="＋"'));
  assert.ok(!pageSource.includes('label="Nova campanha com filtrados"\\n                            icon="↺"'));
});

test("campaign test send requires explicit variables for variable templates", () => {
  assert.ok(pageSource.includes("testVariableValues"));
  assert.ok(pageSource.includes("selectedCampaignTestVariableLabels"));
  assert.ok(pageSource.includes("Variável {{"));
  assert.ok(pageSource.includes("Object.fromEntries("));
  assert.ok(pageSource.includes("sendAppCampaignTest(session, selectedCampaign.id, waId, variables)"));
  assert.ok(pageSource.includes("campaignTestVariablesIncomplete"));
  assert.ok(pageSource.includes("disabled={testingCampaign || !testRecipientInput.trim() || campaignTestVariablesIncomplete}"));
});

test("campaign actions use the compact Inbox action-button language", () => {
  assert.ok(pageSource.includes("function ActionIconButton"));
  assert.ok(pageSource.includes("flex h-9 w-9 items-center justify-center rounded-xl border text-base transition"));
  assert.ok(pageSource.includes("border-[#d4c7b5] bg-white/70 text-slate-800 hover:bg-white"));
  assert.ok(pageSource.includes("border-emerald-500/25 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"));
  assert.ok(pageSource.includes("border-red-500/25 bg-red-50 text-red-900 hover:bg-red-100"));
  assert.ok(pageSource.includes("disabled:cursor-not-allowed disabled:opacity-50"));
});

test("app shell keeps mobile title and content below the variable-height navigation", () => {
  assert.ok(appShellSource.includes("relative z-50 mx-auto w-full"));
  assert.ok(appShellSource.includes("sm:fixed sm:left-4"));
  assert.ok(appShellSource.includes('"hidden sm:block sm:h-[244px]'));
});
