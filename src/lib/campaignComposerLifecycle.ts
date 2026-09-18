export type CampaignComposerDirtySnapshot = {
  form: {
    name: string;
    templateId: string;
    templateName: string;
    templateVariables: string[];
    templateParamsInput: string;
    templateVariableMappings: Array<{ source: string; value: string; fallback: string }>;
    recipientsInput: string;
    returnDestinationType: string;
    returnDepartmentId: string;
    returnFlowId: string;
  };
  audienceFilters: {
    q: string;
    status: string;
    channel: string;
    hasConversation: string;
    optOut: string;
  };
  hasAudiencePreview: boolean;
  csv: {
    text: string;
    fileName: string;
    headers: string[];
    phoneColumn: string;
    nameColumn: string;
    crmSituationColumn: string;
    variableColumns: Record<string, string>;
    hasPreview: boolean;
    hasImportReport: boolean;
  };
};

export function isCampaignComposerDirty(snapshot: CampaignComposerDirtySnapshot) {
  const { form, audienceFilters, csv } = snapshot;
  const formIsDirty =
    form.name.trim() !== "" ||
    form.templateId !== "" ||
    form.templateName !== "" ||
    form.templateVariables.some((value) => value.trim() !== "") ||
    form.templateParamsInput.trim() !== "" ||
    form.templateVariableMappings.some(
      (mapping) => mapping.source !== "" || mapping.value.trim() !== "" || mapping.fallback.trim() !== ""
    ) ||
    form.recipientsInput.trim() !== "" ||
    form.returnDestinationType !== "human_department" ||
    form.returnDepartmentId !== "" ||
    form.returnFlowId !== "";
  const audienceIsDirty =
    audienceFilters.q.trim() !== "" ||
    audienceFilters.status !== "" ||
    audienceFilters.channel !== "all" ||
    audienceFilters.hasConversation !== "all" ||
    audienceFilters.optOut !== "all" ||
    snapshot.hasAudiencePreview;
  const csvIsDirty =
    csv.text !== "" ||
    csv.fileName !== "" ||
    csv.headers.length > 0 ||
    csv.phoneColumn !== "" ||
    csv.nameColumn !== "" ||
    csv.crmSituationColumn !== "" ||
    Object.values(csv.variableColumns).some((value) => value !== "") ||
    csv.hasPreview ||
    csv.hasImportReport;
  return formIsDirty || audienceIsDirty || csvIsDirty;
}
