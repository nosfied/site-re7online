import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/campaigns/page.tsx"), "utf8");
const inboxSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/inbox/page.tsx"), "utf8");
const appShellSource = fs.readFileSync(path.join(process.cwd(), "src/components/app/AppShell.tsx"), "utf8");
const campaignDraftsSource = fs.readFileSync(path.join(process.cwd(), "src/lib/campaignDrafts.ts"), "utf8");
const campaignReusePreviewSource = fs.readFileSync(path.join(process.cwd(), "src/lib/campaignReusePreview.ts"), "utf8");
const campaignResultEvidenceSource = fs.readFileSync(path.join(process.cwd(), "src/lib/campaignResultEvidence.ts"), "utf8");
const appUxLabelsSource = fs.readFileSync(path.join(process.cwd(), "src/lib/appUxLabels.ts"), "utf8");
const campaignBatchPanelSource = fs.readFileSync(path.join(process.cwd(), "src/components/app/CampaignBatchPanel.tsx"), "utf8");

test("campaign center exposes persisted lifecycle tabs", () => {
  assert.ok(pageSource.includes('{ id: "sending", label: "Enviando" }'));
  assert.ok(pageSource.includes('{ id: "scheduled", label: "Agendadas" }'));
  assert.ok(pageSource.includes('{ id: "completed", label: "Concluídas" }'));
  assert.ok(pageSource.includes('case "sending":'));
  assert.ok(pageSource.includes('case "scheduled":'));
});

test("campaign list, detail and batch preserve terminal lifecycle before operational warnings", () => {
  assert.ok((pageSource.match(/getCampaignPresentationLabel\(/g) ?? []).length >= 2);
  assert.ok(pageSource.includes("getCampaignTerminalDetailLabel(campaign)"));
  assert.ok(pageSource.includes("getCampaignOperationalWarning(campaign)"));
  assert.ok(pageSource.includes("Alerta operacional separado"));
  assert.ok(campaignBatchPanelSource.includes("getCampaignPresentationLabel(chunk)"));
  assert.ok(campaignBatchPanelSource.includes("getCampaignOperationalWarning(chunk)"));
  assert.ok(!campaignBatchPanelSource.includes("getCampaignExecutionLabel(chunk.executionState?.state) ??"));
});

test("campaigns require supervisor or admin in app navigation and direct page access", () => {
  const campaignsNavBlock = appShellSource.slice(
    appShellSource.indexOf('href: "/app/campaigns"') - 120,
    appShellSource.indexOf('href: "/app/crm"')
  );
  assert.ok(campaignsNavBlock.includes('feature: "campaigns"'));
  assert.ok(campaignsNavBlock.includes('minRole: "SUPERVISOR"'));
  assert.ok(pageSource.includes('type CampaignAccessState = "checking" | "allowed" | "denied"'));
  assert.ok(pageSource.includes("function canManageCampaigns(session: AppSession)"));
  assert.ok(pageSource.includes('setCampaignAccess("denied")'));
  assert.ok(pageSource.includes('setCampaignAccess("allowed")'));
  assert.ok(pageSource.includes('if (!session || campaignAccess !== "allowed") return;'));
  assert.ok(pageSource.includes("Sem permissão para campanhas"));
  const initialLoadEffect = pageSource.slice(
    pageSource.indexOf("Promise.all(["),
    pageSource.indexOf("fetchAppCrmStatuses(session)")
  );
  assert.ok(initialLoadEffect.includes("refreshCampaigns(session, requestedCampaignId)"));
  assert.ok(initialLoadEffect.includes("refreshTemplates(session)"));
  assert.ok(initialLoadEffect.includes("fetchAppCampaignReturnDestinations(session)"));
  assert.ok(pageSource.includes('if (!session || campaignAccess !== "allowed" || !selectedCampaignId)'));
  assert.ok(pageSource.includes('if (!session || campaignAccess !== "allowed" || !shouldPoll) return;'));
  assert.ok(pageSource.includes("campaignSessionRef.current !== activeSession"));
  assert.ok(pageSource.includes("campaignRelations.current!.readDetail(campaignId)"));
  assert.ok(pageSource.includes("detail.campaign.clientId !== activeSession.user.clientId"));
  assert.ok(pageSource.includes("refreshCampaignDetail(session, selectedCampaignId)"));
});

test("campaign progress modal observes backend state and can be closed", () => {
  assert.ok(pageSource.includes("campaigns.some(shouldRefreshCampaign)"));
  assert.ok(pageSource.includes("if (cancelled || inFlight) return;"));
  assert.equal((pageSource.match(/window\.setInterval/g) ?? []).length, 1);
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

test("inbox template offer uses tenant readiness instead of conversation provider", () => {
  assert.ok(inboxSource.includes("const inboxTemplatesAvailable = usableInboxTemplates.length > 0;"));
  assert.ok(inboxSource.includes("const inboxTemplateActionAvailable = templatesLoading || inboxTemplatesAvailable || Boolean(templateError);"));
  assert.ok(inboxSource.includes("inboxTemplateActionAvailable"));
  assert.ok(inboxSource.includes("const [templatesLoaded, setTemplatesLoaded] = useState(false);"));
  assert.ok(inboxSource.includes("setTemplatesLoaded(true);"));
  assert.ok(inboxSource.includes("templatesLoaded || templatesLoading"));
  assert.ok(inboxSource.includes("void loadInboxTemplates();"));
  assert.ok(inboxSource.includes("templatesSessionKeyRef"));
  assert.ok(inboxSource.includes("setTemplateItems([]);"));
  assert.ok(inboxSource.includes("const [windowNowMs, setWindowNowMs] = useState(() => Date.now());"));
  assert.ok(inboxSource.includes("setWindowNowMs(Date.now())"));
  assert.ok(inboxSource.includes("isConversationFreeformWindowOpen(selectedConversation, windowNowMs)"));
  assert.ok(!inboxSource.includes('item?.provider !== "web_session"'));
  assert.ok(!inboxSource.includes('Assuma a conversa para enviar modelo.'));
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

test("new draft identity wins before detail and delayed list reconciliation", () => {
  const start = pageSource.indexOf("const handleCreateDraftFromAudience = async () => {");
  const end = pageSource.indexOf("const buildAudienceSplitFiltersPayload", start);
  assert.ok(start >= 0 && end > start);
  const block = pageSource.slice(start, end);

  const persisted = block.indexOf("const created = await createAppCampaignDraft(session");
  const identity = block.indexOf("const createdCampaignId = created.campaign.id;");
  const owner = block.indexOf("createdDraftDetailOwnerRef.current = createdCampaignId;");
  const selected = block.indexOf("setSelectedCampaignId(createdCampaignId);");
  const modal = block.indexOf("setDetailModalOpen(true);");
  const detail = block.indexOf("await refreshCampaignDetail(session, createdCampaignId);");
  const list = block.indexOf("void refreshCampaigns(session, createdCampaignId).catch");
  const finish = block.indexOf("await finishCreatedDraft(created);");

  assert.ok(persisted >= 0);
  assert.ok(identity >= 0);
  assert.ok(identity < owner);
  assert.ok(owner < selected);
  assert.ok(selected < modal);
  assert.ok(modal < detail);
  assert.ok(detail < list);
  assert.ok(persisted < finish);
  assert.ok(block.includes("selectedIdRef.current === createdCampaignId"));
  assert.ok(block.includes("campaignSessionRef.current === session"));
  assert.ok(block.includes('"O novo rascunho foi salvo e selecionado, mas o detalhe ainda não pôde ser carregado.'));
  assert.ok(pageSource.includes("if (createdDraftDetailOwnerRef.current === selectedCampaignId)"));
  assert.ok(pageSource.includes("detail.campaign.id !== campaignId || detail.campaign.clientId !== activeSession.user.clientId"));
  assert.ok(!block.includes("await refreshCampaigns(session, created.campaign.id)"));
  assert.ok(!block.includes("setSelectedCampaign(detail.campaign)"));
});

test("static audience draft is resolved server-side and never from the visible page", () => {
  const start = pageSource.indexOf("const handleCreateDraftFromAudience = async () => {");
  const end = pageSource.indexOf("const buildAudienceSplitFiltersPayload", start);
  assert.ok(start >= 0 && end > start);
  const block = pageSource.slice(start, end);

  assert.ok(block.includes("await previewAppCampaignDraftSplit(session, selectionPayload.value)"));
  assert.ok(block.includes('mode: "STATIC_FILTER"'));
  assert.ok(block.includes("filters: selectionPayload.value.filters ?? {}"));
  assert.ok(block.includes("audienceSignature: resolvedAudience.plan.audienceSignature"));
  assert.ok(block.includes("resolvedAudience.plan.draftCount > 1"));
  assert.ok(block.includes("setAudienceSplitPlan(resolvedAudience.plan)"));
  assert.ok(block.includes("selectedLeadIds: []"));
  assert.ok(!block.includes("audienceEligibleItems.map"));
  assert.ok(pageSource.includes("audiencePreview.summary.eligible === 0"));
  assert.ok(pageSource.includes("audiencePreview.summary.eligible} contato(s) elegível(is) da audiência integral"));
  assert.ok(block.includes("requestId: creationRequestId"));
  assert.ok(block.includes("recoverAppCampaignDraftCreation(session, creationRequestId)"));
  assert.ok(block.includes("Criação em confirmação"));
  assert.ok(block.includes("const pending = audienceDraftCreationRef.current"));
  assert.ok(block.includes("loadPendingAppCampaignDraftCreation(session)"));
  assert.ok(block.includes("savePendingAppCampaignDraftCreation(session"));
  assert.ok(block.includes("clearPendingAppCampaignDraftCreation(session)"));
  assert.ok(block.indexOf("recoverAppCampaignDraftCreation(session, pending.id)") < block.indexOf("previewAppCampaignDraftSplit(session"));
  assert.ok(block.includes("createAppCampaignDraft(session, pending.payload)"));
  assert.ok(block.includes("isCampaignDraftCreationOutcomeUncertain(typed)"));
});

test("campaign audience and draft recipient lists search server-side and append unique pages", () => {
  assert.ok(pageSource.includes("fetchAppCampaignDraftRecipients(session, campaignId"));
  assert.ok(pageSource.includes("mergeCampaignRecipientPages(previous.items, response.items)"));
  assert.ok(pageSource.includes("Exibindo {audiencePreview.items.length} de {audiencePreview.pagination.total}"));
  assert.ok(pageSource.includes("Exibindo {campaignAudienceSummaryItems.length} de {draftRecipientPage?.pagination.total"));
  assert.ok(pageSource.includes("Buscar em todos os destinatários"));
  assert.ok(pageSource.includes('append: true'));
  assert.ok(!pageSource.includes("void loadAudiencePreview(Math.max(audiencePage - 1, 1))"));
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
  assert.ok(pageSource.includes("buildCampaignReuseState(sourceCampaign, options)"));
  assert.ok(pageSource.includes("buildAudiencePreviewFromCampaignResults"));
  assert.ok(pageSource.includes("buildAudiencePreviewFromDraftSeed"));
  assert.ok(pageSource.includes('setActiveTab("create")'));
});

test("campaign reuse hydrates static preview from current CRM contacts without expanding selection", () => {
  assert.ok(pageSource.includes("buildHydratedAudiencePreviewFromDraftSeed"));
  assert.ok(pageSource.includes("buildHydratedCampaignReusePreview({"));
  assert.ok(pageSource.includes("audienceRequestGenerationRef.current += 1;\n    const reuseGeneration = audienceRequestGenerationRef.current;\n    let sourceCampaign = campaign;"));
  assert.ok(pageSource.includes("const detail = await getAppCampaign(session, campaign.id);\n        if (audienceRequestGenerationRef.current !== reuseGeneration) return;"));
  assert.ok(pageSource.includes("} catch (err) {\n        if (audienceRequestGenerationRef.current !== reuseGeneration) return;"));
  assert.ok(pageSource.includes("resetCampaignComposer({ preserveAudienceGeneration: true })"));
  assert.ok(pageSource.includes("fetchContactDetail: async (leadId) => (await fetchAppCrmContactDetail(activeSession, leadId)).item"));
  assert.ok(pageSource.includes("resolveBlockedReason: resolveAudienceBlockedReasonFromCrmContact"));
  assert.ok(campaignReusePreviewSource.includes("CAMPAIGN_REUSE_PREVIEW_CONCURRENCY = 4"));
  assert.ok(campaignReusePreviewSource.includes("mapWithConcurrency(leadIds, CAMPAIGN_REUSE_PREVIEW_CONCURRENCY"));
  assert.ok(campaignReusePreviewSource.includes("leadIds.map((leadId) => itemsByLeadId.get(leadId))"));
  assert.ok(campaignReusePreviewSource.includes("blockedReason: copy.reason"));
  assert.ok(campaignReusePreviewSource.includes('case "not_found":'));
  assert.ok(campaignReusePreviewSource.includes('case "unauthorized":'));
  assert.ok(campaignReusePreviewSource.includes('case "network":'));
  assert.ok(pageSource.includes("getAudienceCrmStatusDisplay(item)"));
  assert.ok(campaignReusePreviewSource.includes('if (item.crmStatusLabel || item.crmStatus) return item.crmStatusLabel || item.crmStatus;'));
  assert.ok(campaignReusePreviewSource.includes('return "Sem situação";'));
  assert.ok(pageSource.includes('Atualizando dados atuais dos contatos selecionados...'));
  assert.ok(pageSource.includes('campaignReusePreviewState === "loading"'));
  assert.ok(pageSource.includes('if (campaignReusePreviewState === "loading")'));
  assert.ok(pageSource.includes('"Não foi possível atualizar os dados atuais dos contatos. A seleção original foi preservada para revisão."'));
  assert.ok(pageSource.includes('if (audienceRequestGenerationRef.current !== reuseGeneration || !result) return;'));
  assert.ok(pageSource.includes('if (audienceRequestGenerationRef.current !== reuseGeneration) return;'));
  assert.ok(pageSource.includes('setCampaignReusePreviewState("idle")'));
  assert.ok(!pageSource.includes('crmStatus: "",\n      crmStatusLabel: "",\n      channel: "whatsapp",\n      phoneDisplay: recipients[index] ?? leadId,\n      identifierDisplay: recipients[index] ?? leadId,\n      activeOptOut: false,\n      isAnonymized: false,\n      hasValidWhatsappIdentity: true,\n      lastConversationIdentity: null,\n      lastProtocol: null,\n      importedSource: `Reuso da campanha ${campaign.name || campaign.id}`,\n      updatedAt: campaign.updatedAt,\n      eligible: true'));
  assert.ok(!pageSource.includes('item.crmStatusLabel || item.crmStatus || "Sem situação"'));
});

test("campaign reuse toast and shared composer controls keep owner-visible polish", () => {
  assert.ok(pageSource.includes('type CampaignToastTone = "success" | "warning" | "error" | "info" | "reuse"'));
  assert.ok(pageSource.includes('case "reuse":'));
  assert.ok(pageSource.includes("border-cyan-300/45 bg-cyan-950/95 text-cyan-50"));
  assert.ok(pageSource.includes('warning ? "warning" : "reuse"'));
  assert.ok(pageSource.includes("const campaignComposerControlClasses ="));
  assert.ok(pageSource.includes("theme-select h-10 w-full min-w-0 rounded-md"));
  assert.equal(pageSource.match(/className="flex min-h-5 items-center justify-between gap-2 text-white\/70"/g)?.length ?? 0, 2);
  assert.ok(pageSource.includes("Identificação interna para localizar este rascunho."));
  assert.ok(pageSource.includes("Selecione o modelo aprovado usado nesta campanha."));
  assert.ok(pageSource.includes("getMetaTemplateCategoryUxLabel(selectedTemplateEffectiveCategory || selectedTemplate.category)"));
  assert.ok(!pageSource.includes("Categoria na Meta:"));
  assert.equal(pageSource.match(/className=\{campaignComposerControlClasses\}/g)?.length ?? 0, 2);
  assert.ok(pageSource.includes("TemplateMediaFileInput"));
});

test("campaign media guidance is responsive, replaces instructions and resets on selection changes", () => {
  assert.ok(pageSource.includes("CampaignMediaGuidance"));
  assert.ok(pageSource.includes("compact={Boolean(form.templateMediaAssetId || uploadingTemplateMedia || inspectingTemplateMedia)}"));
  assert.ok(pageSource.includes("expanded={templateMediaGuidanceExpanded}"));
  assert.ok(pageSource.includes("onToggle={() => setTemplateMediaGuidanceExpanded((current) => !current)}"));
  assert.ok((pageSource.match(/setTemplateMediaGuidanceExpanded\(false\)/g) ?? []).length >= 3);
  assert.ok(pageSource.includes('lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]'));
  assert.ok(pageSource.includes('className="min-w-0 self-start break-words'));
  assert.ok(pageSource.indexOf("<TemplateMediaInspectionPanel") < pageSource.indexOf("<CampaignMediaGuidance"));
});

test("campaign media is preserved across every composer path without automatic sends", () => {
  assert.ok(pageSource.includes('selectedTemplateHeaderType !== "NONE"'));
  assert.ok(pageSource.includes("templateMediaUploadGenerationRef.current"));
  assert.ok(pageSource.includes("generation !== templateMediaUploadGenerationRef.current"));
  assert.ok(pageSource.includes("deleteAppTemplateMedia(session, uploaded.asset.id)"));
  assert.ok(pageSource.includes("draftSeed?.templateMedia?.assetId ?? sourceCampaign.templateMedia?.assetId"));
  assert.ok(pageSource.includes('...(form.templateMediaAssetId ? { templateMediaAssetId: form.templateMediaAssetId } : {})'));
  assert.ok((pageSource.match(/templateMediaAssetId: form\.templateMediaAssetId/g) ?? []).length >= 5);
  assert.ok(pageSource.includes("createAppCampaignDraftFromCsv(session"));
  assert.ok(pageSource.includes("createAppCampaignDraftSplit(session"));
  assert.ok(pageSource.includes("scheduleAppCampaignDraft(session"));
  assert.ok(pageSource.includes("sendAppCampaignTest(session"));
  assert.ok(!pageSource.includes('fetch("/agent-api/app/campaigns/import"'));
});

test("CRM CSV and manual previews compose the selected media header with the filled body", () => {
  assert.equal(pageSource.match(/<CampaignMessagePreview/g)?.length ?? 0, 3);
  for (const prop of ["headerType={selectedTemplateHeaderType}", "mediaUrl={templateMediaPreviewUrl}", "mediaLoading={loadingTemplateMediaPreview}", "mediaError={templateMediaPreviewError}"]) {
    assert.equal(pageSource.split(prop).length - 1, 3, `missing integrated preview prop ${prop}`);
  }
  assert.ok(pageSource.includes("content={templatePreview}"));
  assert.ok(pageSource.includes("content={csvTemplatePreview}"));
  assert.ok(pageSource.includes("content={manualTemplatePreview}"));
});

test("campaign selects use theme-aware colors in light and dark modes", () => {
  assert.ok(pageSource.includes('const DARK_SELECT_CLASS =\n  "theme-select'));
  assert.ok(pageSource.includes('const DARK_RESULT_SELECT_CLASS =\n  "theme-select'));
  assert.ok(!pageSource.includes("[&>option]:bg-slate-950"));
  assert.ok(!pageSource.includes("[&>option]:text-white"));
  assert.ok(pageSource.includes("text-white/75\">Envio manual"));
  assert.ok(pageSource.includes("text-white\">Envio imediato manual (avançado)"));
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

test("campaign audience split is explicit and creates only static numbered drafts", () => {
  assert.ok(pageSource.includes("createAppCampaignDraftSplit"));
  assert.ok(pageSource.includes("previewAppCampaignDraftSplit"));
  assert.ok(pageSource.includes("Audiência acima de 1.000 destinatários"));
  assert.ok(pageSource.includes("O rascunho atual usa apenas a prévia carregada."));
  assert.ok(pageSource.includes("Preparar divisão"));
  assert.ok(pageSource.includes("Criar ${audienceSplitPlan.draftCount} rascunho(s)"));
  assert.ok(pageSource.includes('splitMode: audienceRecipientMode === "DYNAMIC_CRM_FILTER" ? "DYNAMIC_FILTER_AS_STATIC"'));
  assert.ok(pageSource.includes("Novos contatos futuros não entram automaticamente nesses rascunhos."));
  assert.ok(pageSource.includes("audienceSignature: audienceSplitPlan.audienceSignature"));
  assert.ok(pageSource.includes("requestId: audienceSplitRequestId"));
  assert.ok(pageSource.includes("Nenhuma mensagem será enviada ou agendada."));
});

test("campaign detail exposes batch group progress without bypassing tenant queue", () => {
  const batchSource = fs.readFileSync(path.join(process.cwd(), "src/components/app/CampaignBatchPanel.tsx"), "utf8");
  assert.ok(pageSource.includes("<CampaignBatchPanel"));
  for (const action of ["Pausar conjunto", "Retomar conjunto", "Cancelar conjunto"]) assert.ok(pageSource.includes(action));
  assert.ok(pageSource.includes('handleCampaignBatchAction("pause")'));
  assert.ok(batchSource.includes("props.renderActions()"));
  assert.ok(batchSource.includes("props.queueLabel(chunk.queueStatus, chunk.queuePosition)"));
  assert.ok(batchSource.includes("Abrir lote por ID"));
  assert.ok(campaignDraftsSource.includes("Este tenant já tem uma campanha em execução. Aguarde a fila liberar antes de testar ou iniciar outro envio."));
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
  assert.ok(pageSource.includes("getStatusClasses(selectedCampaign.status)"));
  assert.ok(pageSource.includes("getCampaignPresentationLabel(selectedCampaign)"));
  assert.ok(pageSource.includes('label="Nova campanha com filtrados"'));
  assert.ok(pageSource.includes('icon="＋"'));
  assert.ok(!pageSource.includes('label="Nova campanha com filtrados"\\n                            icon="↺"'));
});

test("campaign test send uses only recipient number and lets backend resolve variables", () => {
  assert.ok(pageSource.includes("selectedCampaignTestVariableLabels"));
  assert.ok(pageSource.includes("O teste usa dados de um destinatário da campanha e envia somente ao número informado."));
  assert.ok(pageSource.includes("sendAppCampaignTest(session, selectedCampaign.id, waId)"));
  assert.match(pageSource, /disabled=\{[^}]*testingCampaign \|\| !testRecipientInput\.trim\(\)\}/);
  const testHandler = pageSource.slice(pageSource.indexOf("const handleTestSendCampaign = async"), pageSource.indexOf("const handleReuseCampaign"));
  assert.ok(testHandler.indexOf("await ensureCampaignOperationsAvailable()") < testHandler.indexOf("sendAppCampaignTest(session"));
  assert.ok(!pageSource.includes("testVariableValues"));
  assert.ok(!pageSource.includes("campaignTestVariablesIncomplete"));
  assert.ok(!pageSource.includes("Valor usado apenas no teste"));
});

test("campaign detail layout keeps status badge actions progress and pending audience aligned", () => {
  assert.ok(!pageSource.includes("<p className=\"text-[11px] uppercase tracking-wide text-white/60\">Situação</p>"));
  assert.ok(pageSource.includes("Rascunho — envio ainda não iniciado"));
  assert.ok(!pageSource.includes("Rascunho pronto — clique em Enviar para iniciar"));
  assert.ok(pageSource.includes("max-h-[300px] overflow-auto"));
  assert.ok(pageSource.includes("Destinatários do rascunho"));
  assert.ok(pageSource.includes("Destinatários agendados"));
  assert.ok(!pageSource.includes("Destinatários processados"));
  assert.ok(!pageSource.includes("selectedCampaign.draftReview.summary.requested"));
  assert.ok(!pageSource.includes("selectedCampaign.draftReview.summary.duplicatesRemoved"));
  assert.ok(!pageSource.includes("selectedCampaign.draftReview.summary.blockedByReason.map"));
  assert.ok(!pageSource.includes("Mapeamento de variáveis"));
  assert.ok(!pageSource.includes("Nenhuma situação detalhada da Meta disponível ainda para esta campanha."));
  assert.ok(!pageSource.includes("formatRelativeTime(selectedCampaign.updatedAt)"));
  assert.ok(!pageSource.includes("formatRelativeTime(selectedCampaign.createdAt)"));
  assert.ok(pageSource.includes('id="campaign-schedule-at"'));
  assert.ok(pageSource.includes("hasCampaignResultEvidence(item, selectedCampaign?.status)"));
  assert.ok(pageSource.includes("getCampaignResultEvidenceLabel(item) ?? getMetaStatusLabel(item.status)"));
  assert.ok(campaignResultEvidenceSource.includes('item.nonBillingReason === "missing_individual_history"'));
  assert.ok(campaignResultEvidenceSource.includes('typeof item.pricingBillable === "boolean"'));
  assert.ok(!campaignResultEvidenceSource.includes('pricingBillable !== null'));
  assert.ok(pageSource.includes("hasRealCampaignResultItems ? ("));
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



test("campaign admission denial preserves media already stored by another admitted operation", () => {
  const start = pageSource.indexOf("const handleClosedCampaignAttempt =");
  const end = pageSource.indexOf("const stored = loadAppSession()", start);
  const handler = pageSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.ok(handler.includes("setCampaignOperationsOpen(false)"));
  assert.ok(!handler.includes("deleteAppTemplateMedia"));
  assert.ok(!handler.includes("discardUnpersistedTemplateMedia"));
});

test("campaign detail leads with identity and shows audience only while pending", () => {
  const detailStart = pageSource.indexOf('{selectedCampaign ? (');
  const identity = pageSource.indexOf('<span className="text-white/70">Nome:</span>', detailStart);
  const totals = pageSource.indexOf('>Total</p>', detailStart);
  assert.ok(detailStart >= 0 && identity > detailStart && totals > identity);
  assert.ok(pageSource.includes('const campaignAudienceSummaryItems = useMemo'));
  assert.ok(pageSource.includes('selectedCampaign.status !== "draft" && selectedCampaign.status !== "scheduled"'));
  assert.ok(pageSource.includes('"Destinatários agendados"'));
  assert.ok(pageSource.includes('"Destinatários do rascunho"'));
  assert.ok(!pageSource.includes('"Destinatários processados"'));
  assert.ok(pageSource.includes("draftRecipientPage?.items ?? []"));
  assert.ok(!pageSource.includes("campaignResultItems.flatMap"));
  assert.ok(!pageSource.includes("Este tenant executa somente uma campanha ou lote por vez."));
});

test("campaign surfaces never expose the raw completed status", () => {
  assert.ok(pageSource.includes('if (queue.status === "completed") return "Concluída";'));
  assert.ok(pageSource.includes("getCampaignQueueStatusLabel(selectedCampaign.executionQueue.status"));
  assert.ok(!pageSource.includes("getCampaignQueueLabel(selectedCampaign) ?? selectedCampaign.executionQueue.status"));
  assert.ok(appUxLabelsSource.includes('case "completed":\n      return "Concluída";'));
});

