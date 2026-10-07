import assert from "node:assert/strict";
import test from "node:test";
import {
  CampaignComposerDirtySnapshot,
  isCampaignComposerDirty,
} from "./campaignComposerLifecycle";

function pristine(): CampaignComposerDirtySnapshot {
  return {
    form: {
      name: "",
      templateId: "",
      templateName: "",
      templateVariables: [],
      templateParamsInput: "",
      templateVariableMappings: [],
      recipientsInput: "",
      returnDestinationType: "human_department",
      returnDepartmentId: "",
      returnFlowId: "",
    },
    audienceFilters: {
      q: "",
      status: "",
      channel: "all",
      hasConversation: "all",
      optOut: "all",
    },
    hasAudiencePreview: false,
    csv: {
      text: "",
      fileName: "",
      headers: [],
      phoneColumn: "",
      nameColumn: "",
      crmSituationColumn: "",
      variableColumns: {},
      hasPreview: false,
      hasImportReport: false,
    },
  };
}

test("empty campaign composer is pristine", () => {
  assert.equal(isCampaignComposerDirty(pristine()), false);
});

test("campaign name marks composer dirty", () => {
  const state = pristine();
  state.form.name = "Campanha nova";
  assert.equal(isCampaignComposerDirty(state), true);
});

test("template, variables and manual recipients mark composer dirty", () => {
  for (const mutate of [
    (state: CampaignComposerDirtySnapshot) => { state.form.templateId = "template-1"; },
    (state: CampaignComposerDirtySnapshot) => { state.form.templateVariables = ["Maria"]; },
    (state: CampaignComposerDirtySnapshot) => {
      state.form.templateVariableMappings = [{ source: "fixed", value: "Maria", fallback: "" }];
    },
    (state: CampaignComposerDirtySnapshot) => { state.form.recipientsInput = "5511999999999"; },
  ]) {
    const state = pristine();
    mutate(state);
    assert.equal(isCampaignComposerDirty(state), true);
  }
});

test("audience filters and preview mark composer dirty", () => {
  const filtered = pristine();
  filtered.audienceFilters.status = "QUALIFICADO";
  assert.equal(isCampaignComposerDirty(filtered), true);

  const previewed = pristine();
  previewed.hasAudiencePreview = true;
  assert.equal(isCampaignComposerDirty(previewed), true);
});

test("CSV file, mapping, preview and report mark composer dirty", () => {
  for (const mutate of [
    (state: CampaignComposerDirtySnapshot) => { state.csv.text = "telefone,nome"; },
    (state: CampaignComposerDirtySnapshot) => { state.csv.phoneColumn = "telefone"; },
    (state: CampaignComposerDirtySnapshot) => { state.csv.variableColumns = { "1": "nome" }; },
    (state: CampaignComposerDirtySnapshot) => { state.csv.hasPreview = true; },
    (state: CampaignComposerDirtySnapshot) => { state.csv.hasImportReport = true; },
  ]) {
    const state = pristine();
    mutate(state);
    assert.equal(isCampaignComposerDirty(state), true);
  }
});

test("department, flow and destination mode mark composer dirty", () => {
  for (const mutate of [
    (state: CampaignComposerDirtySnapshot) => { state.form.returnDepartmentId = "department-1"; },
    (state: CampaignComposerDirtySnapshot) => { state.form.returnFlowId = "flow-1"; },
    (state: CampaignComposerDirtySnapshot) => { state.form.returnDestinationType = "automated_flow"; },
  ]) {
    const state = pristine();
    mutate(state);
    assert.equal(isCampaignComposerDirty(state), true);
  }
});

test("composer schedule alone is dirty and its reset is pristine", () => {
  const snapshot = pristine();
  snapshot.scheduleInput = "2026-10-07T12:40";
  assert.equal(isCampaignComposerDirty(snapshot), true);
  snapshot.scheduleInput = "";
  assert.equal(isCampaignComposerDirty(snapshot), false);
});
