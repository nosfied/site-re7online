import crypto from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { buildPrivateCampaignSeedFields } from "./campaignSeedPrivacy.js";
import type { resolveCampaignRecipientImportPlan } from "./campaignRecipientImport.js";

type ImportPlan = Awaited<ReturnType<typeof resolveCampaignRecipientImportPlan>>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

export class CampaignBatchIdempotencyConflict extends Error {
  constructor() { super("campaign_batch_idempotency_conflict"); }
}

/** Persist the already resolved import plan as one unit; never mutate CRM here. */
export async function createCsvCampaignBatch(prisma: PrismaClient, params: {
  clientId: string; actorId: string; requestId: string; name: string;
  templateId: string; templateName: string; payload: unknown;
  returnDestination: Prisma.InputJsonValue; plan: ImportPlan;
  beforeChild?: (index: number) => void | Promise<void>;
}) {
  const key = `csv-group:${params.requestId}`;
  const payloadHash = crypto.createHash("sha256").update(canonicalJson({ operation: "csv-group", tenant: params.clientId, payload: params.payload })).digest("hex");
  return prisma.$transaction(async (tx) => {
    // Same tenant/operation/key is serialized before inspecting its durable result.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${params.clientId}:${key}`}, 0))`;
    const existing = await tx.campaignExecutionBatch.findUnique({
      where: { clientId_idempotencyKey: { clientId: params.clientId, idempotencyKey: key } },
      include: { campaigns: { orderBy: { chunkIndex: "asc" }, include: { campaign: true } } },
    });
    if (existing) {
      const metadata = existing.metadata as Record<string, unknown> | null;
      if (metadata?.payloadHash !== payloadHash) throw new CampaignBatchIdempotencyConflict();
      return { batchId: existing.id, campaigns: existing.campaigns.map((link) => link.campaign), idempotent: true };
    }
    // A legacy result without a content fingerprint cannot safely authorize replay.
    const legacy = await tx.event.findUnique({ where: { clientId_eventName_requestId: {
      clientId: params.clientId, eventName: "campaign.csv_group.created", requestId: `campaign-csv-group:${params.requestId}`,
    } } });
    if (legacy) throw new CampaignBatchIdempotencyConflict();
    const { plan } = params;
    const chunks = Array.from({ length: Math.ceil(plan.acceptedRows.length / 1000) }, (_, i) => plan.acceptedRows.slice(i * 1000, (i + 1) * 1000));
    const batch = await tx.campaignExecutionBatch.create({ data: {
      clientId: params.clientId, name: params.name, sourceMode: "CSV_IMPORT", status: "draft",
      totalRecipients: plan.acceptedRows.length, chunkCount: chunks.length,
      blockedCount: plan.preview.summary.optOutBlocked + plan.preview.summary.invalid + plan.preview.summary.missingRequiredVariables + plan.preview.summary.unresolvedCrmSituations,
      idempotencyKey: key, createdByUserId: params.actorId, metadata: { createdFrom: "campaign_csv_group", payloadHash },
    } });
    const campaigns = [];
    for (const [index, rows] of chunks.entries()) {
      if (process.env.NODE_ENV !== "production") await params.beforeChild?.(index + 1);
      const campaign = await tx.campaign.create({ data: {
        clientId: params.clientId, templateId: params.templateId, templateName: params.templateName,
        name: `${params.name} — ${String(index + 1).padStart(2, "0")}/${String(chunks.length).padStart(2, "0")}`,
        totalRecipients: rows.length, status: "draft",
      } });
      await tx.campaignExecutionBatchCampaign.create({ data: { clientId: params.clientId, batchId: batch.id, campaignId: campaign.id, chunkIndex: index + 1, recipientCount: rows.length, status: "draft" } });
      const recipients = rows.map((row) => row.waIdCanonical);
      const componentsByWaId = Object.fromEntries(recipients.filter((id) => plan.componentsByWaId[id]).map((id) => [id, plan.componentsByWaId[id]]));
      await tx.event.create({ data: {
        clientId: params.clientId, messageId: campaign.id, requestId: `campaign-csv-group-seed:${batch.id}:${index + 1}`, eventName: "campaign.seed.saved",
        payloadJson: { campaignId: campaign.id, templateId: params.templateId, name: campaign.name, templateName: params.templateName,
          ...buildPrivateCampaignSeedFields({ clientId: params.clientId, waIds: recipients, componentsByWaId }),
          manualRecipientInputCount: rows.length, templateParams: [], templateVariableMappings: [],
          returnDestination: params.returnDestination, source: "recipient_import:csv",
          summary: { ...plan.preview.summary, received: rows.length, valid: rows.length, readyToImport: rows.length },
        },
      } });
      await tx.event.create({ data: {
        clientId: params.clientId, messageId: campaign.id, requestId: `campaign-csv-group-import:${batch.id}:${index + 1}`, eventName: "campaign.import.completed",
        payloadJson: { campaignId: campaign.id, source: "csv", actorId: params.actorId, rowCount: rows.length, importedCount: rows.length,
          crmUpsert: { created: 0, updated: 0, unchanged: 0, deferredUntilExecution: true }, timestamp: new Date().toISOString() },
      } });
      campaigns.push(campaign);
    }
    await tx.event.create({ data: {
      clientId: params.clientId, requestId: `campaign-csv-group:${params.requestId}`, eventName: "campaign.csv_group.created",
      payloadJson: { batchId: batch.id, payloadHash, campaignIds: campaigns.map((c) => c.id), chunkSizes: chunks.map((c) => c.length), totalEligible: plan.acceptedRows.length },
    } });
    return { batchId: batch.id, campaigns, idempotent: false };
  }, { timeout: 30_000, maxWait: 30_000 });
}
