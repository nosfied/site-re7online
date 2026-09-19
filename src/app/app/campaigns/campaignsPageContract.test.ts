import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const pageSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/campaigns/page.tsx"), "utf8");
const inboxSource = fs.readFileSync(path.join(process.cwd(), "src/app/app/inbox/page.tsx"), "utf8");
const appShellSource = fs.readFileSync(path.join(process.cwd(), "src/components/app/AppShell.tsx"), "utf8");

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
  assert.ok(pageSource.includes('case "skipped":'));
  assert.ok(pageSource.includes('return "Ignorada"'));
});

test("campaign detail result shows full recipient phone for authorized users", () => {
  assert.ok(pageSource.includes('return digits || value || "-";'));
  assert.ok(!pageSource.includes('`${digits.slice(0, 4)}****${digits.slice(-4)}`'));
});

test("campaign confidence treats mixed success and failure as partial delivery", () => {
  assert.ok(pageSource.includes("const hasSuccessfulDeliverySignal = deliveredOrRead > 0 || sent > 0;"));
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
  assert.ok(pageSource.includes("const reusable = filteredCampaignResultItems.filter((item) => item.leadId)"));
  assert.ok(pageSource.includes("const excluded = filteredCampaignResultItems.length - reusable.length"));
  assert.ok(pageSource.includes('reason: "missing_contact"'));
  assert.ok(pageSource.includes("sem contato atual foram excluídos explicitamente"));
  assert.ok(pageSource.includes("setAudiencePreview(syntheticPreview)"));
  assert.ok(pageSource.includes('setActiveTab("create")'));
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
