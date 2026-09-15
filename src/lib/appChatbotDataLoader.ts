import type {
  AppAutomationSettings,
  AppChatbotDepartmentItem,
  AppChatbotFlowItem,
  AppChatbotQueueItem,
  AppSession,
} from "./appClientApi";

export type AppChatbotLoadErrorKey = "flows" | "settings" | "resources";

export type AppChatbotLoadResult = {
  flows: AppChatbotFlowItem[] | null;
  settings: AppAutomationSettings | null;
  resources: {
    departments: AppChatbotDepartmentItem[];
    queues: AppChatbotQueueItem[];
  } | null;
  errors: Partial<Record<AppChatbotLoadErrorKey, unknown>>;
};

type AppChatbotLoaderDependencies = {
  fetchFlows: (session: AppSession) => Promise<{ ok: true; count: number; items: AppChatbotFlowItem[] }>;
  fetchSettings: (session: AppSession) => Promise<{ ok: true; tenantId: string; settings: AppAutomationSettings }>;
  fetchResources: (session: AppSession) => Promise<{
    ok: true;
    departments: AppChatbotDepartmentItem[];
    queues: AppChatbotQueueItem[];
  }>;
};

function getRejectedReason(result: PromiseSettledResult<unknown>) {
  return result.status === "rejected" ? result.reason : undefined;
}

export async function loadAppChatbotData(
  session: AppSession,
  dependencies: AppChatbotLoaderDependencies
): Promise<AppChatbotLoadResult> {
  const [flowsResult, settingsResult, resourcesResult] = await Promise.allSettled([
    dependencies.fetchFlows(session),
    dependencies.fetchSettings(session),
    dependencies.fetchResources(session),
  ]);

  return {
    flows: flowsResult.status === "fulfilled" ? flowsResult.value.items : null,
    settings: settingsResult.status === "fulfilled" ? settingsResult.value.settings : null,
    resources:
      resourcesResult.status === "fulfilled"
        ? {
            departments: resourcesResult.value.departments,
            queues: resourcesResult.value.queues,
          }
        : null,
    errors: {
      flows: getRejectedReason(flowsResult),
      settings: getRejectedReason(settingsResult),
      resources: getRejectedReason(resourcesResult),
    },
  };
}
