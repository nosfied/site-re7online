import crypto from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { confirmCrmContactCsvImport, crmImportOutcome, CrmContactUpsertError, CRM_CONTACT_CREATED_EVENT,
  CRM_CONTACT_IMPORT_SUMMARY_EVENT, upsertCrmContactInTransaction, type CrmImportOutcome } from "./crmContactUpsert.js";

export const IMPORT_EVENTS = { started: "crm.contact.import.started", classified: "crm.contact.import.classified",
  row: "crm.contact.import.row", finished: "crm.contact.import.finished", uncertain: "crm.contact.import.uncertain" } as const;
type Params = Parameters<typeof confirmCrmContactCsvImport>[1] & { operationId: string };
type Summary = Awaited<ReturnType<typeof confirmCrmContactCsvImport>>;
export class CrmImportOperationError extends Error {
  constructor(public code: string, public status: number, public operationId?: string) { super(code); }
}
export function validateImportOperationId(id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(id))
    throw new CrmImportOperationError("invalid_import_operation_id", 400);
}
const key = (clientId: string, operationId: string) => ({ clientId, requestId: operationId });
const event = (db: Prisma.TransactionClient | PrismaClient, clientId: string, operationId: string, eventName: string, payload: object) =>
  db.event.create({ data: { ...key(clientId, operationId), eventName, payloadJson: payload as Prisma.InputJsonValue } });
export async function readCrmImportOperation(db: PrismaClient, clientId: string, operationId: string, now = new Date()) {
  validateImportOperationId(operationId);
  const events = await db.event.findMany({ where: { clientId, OR: [
    { requestId: operationId }, { eventName: IMPORT_EVENTS.row, requestId: { startsWith: operationId + ":" } }],
    eventName: { in: Object.values(IMPORT_EVENTS) } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const start = events.find(e => e.eventName === IMPORT_EVENTS.started);
  if (!start) return { ok: true as const, operationId, status: "UNKNOWN" as const, reason: "operation_not_observed", progress: null, summary: null };
  const finished = events.find(e => e.eventName === IMPORT_EVENTS.finished);
  const classification = events.find(e => e.eventName === IMPORT_EVENTS.classified)?.payloadJson as Record<string, number> | undefined;
  const counts: Record<string, number> = { created: 0, updated: 0, unchanged: 0, failed: 0 };
  for (const e of events.filter(e => e.eventName === IMPORT_EVENTS.row)) {
    const p = e.payloadJson as { outcome: string }; counts[p.outcome] = (counts[p.outcome] ?? 0) + 1;
  }
  const processed = events.filter(e => e.eventName === IMPORT_EVENTS.row).length;
  const latest = events[events.length - 1].createdAt;
  const uncertain = events.some(e => e.eventName === IMPORT_EVENTS.uncertain) || now.getTime() - latest.getTime() > 120_000;
  const end = finished?.payloadJson as { status: "COMPLETED" | "FAILED"; summary?: Summary; failureCode?: string } | undefined;
  return { ok: true as const, operationId, status: end?.status ?? (uncertain ? "UNKNOWN" as const : "PROCESSING" as const),
    reason: end?.failureCode ?? (uncertain ? "completion_not_proven" : null),
    progress: { classification: classification ?? null, processed, counts }, summary: end?.summary ?? null };
}
export async function executeCrmImportOperation(db: PrismaClient, params: Params) {
  validateImportOperationId(params.operationId);
  const inputHash = crypto.createHash("sha256").update(JSON.stringify({ csvText: params.csvText,
    mapping: Object.fromEntries(Object.entries(params.mapping ?? {}).sort(([a], [b]) => a.localeCompare(b))) })).digest("hex");
  const admitted = await db.$transaction(async tx => {
    // Serialize admission per tenant, including different operation IDs. No automatic transaction replay.
    const [lock] = await tx.$queryRaw<Array<{ locked: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${"crm-csv:" + params.clientId},0)) AS locked`;
    if (!lock.locked) throw new CrmImportOperationError("import_admission_busy", 409);
    const prior = await tx.event.findFirst({ where: { ...key(params.clientId, params.operationId), eventName: IMPORT_EVENTS.started } });
    if (prior) {
      if ((prior.payloadJson as { inputHash: string }).inputHash !== inputHash) throw new CrmImportOperationError("import_operation_payload_mismatch",409);
      return false;
    }
    const unfinished = await tx.$queryRaw<Array<{ requestId: string }>>`SELECT s."requestId" FROM "Event" s
      WHERE s."clientId"=${params.clientId}::uuid AND s."eventName"=${IMPORT_EVENTS.started}
      AND NOT EXISTS (SELECT 1 FROM "Event" f WHERE f."clientId"=s."clientId" AND f."requestId"=s."requestId" AND f."eventName"=${IMPORT_EVENTS.finished}) LIMIT 1`;
    if (unfinished.length) throw new CrmImportOperationError("import_unresolved",409,unfinished[0].requestId);
    await event(tx,params.clientId,params.operationId,IMPORT_EVENTS.started,{ actorUserId: params.actorUserId, inputHash, version: 1 });
    return true;
  }, { maxWait: 1000, timeout: 5000 });
  if (!admitted) return readCrmImportOperation(db,params.clientId,params.operationId);
  const recordRow = (tx: Prisma.TransactionClient | PrismaClient, rowNumber: number, outcome: CrmImportOutcome) =>
    event(tx,params.clientId,`${params.operationId}:${rowNumber}`,IMPORT_EVENTS.row,{ operationId: params.operationId, rowNumber, outcome });
  try {
    const summary = await confirmCrmContactCsvImport(db,{ ...params, requestId: params.operationId, operationHooks: {
      classified: counts => event(db,params.clientId,params.operationId,IMPORT_EVENTS.classified,counts).then(() => {}),
      upsert: (input, rowNumber) => db.$transaction(async tx => {
        const result = await upsertCrmContactInTransaction(tx,input);
        await tx.event.create({ data: { clientId: params.clientId, eventName: CRM_CONTACT_CREATED_EVENT,
          requestId: `${CRM_CONTACT_CREATED_EVENT}:${result.leadId}:${input.requestId}`, waId: result.waId, waIdCanonical: result.waIdCanonical,
          payloadJson: { contactId: result.contactId, leadId: result.leadId, actorUserId: params.actorUserId, source: "crm_import",
            createdContact: result.createdContact, createdLead: result.createdLead, promotedProvisional: false,
            waIdLast4: result.waIdCanonical.slice(-4), waIdLength: result.waIdCanonical.length } } });
        await recordRow(tx,rowNumber,crmImportOutcome(input,result));
        return result;
      }, { maxWait: 1000, timeout: 10000 }),
      rejected: (rowNumber,outcome) => recordRow(db,rowNumber,outcome).then(() => {}),
    } });
    // A durable recovery receipt needs counts/row reasons, not a second copy of CSV identities.
    const receiptSummary = { ...summary, errors: summary.errors.slice(0,200).map(e => ({
      rowNumber: e.rowNumber, reason: e.reason, code: e.code, label: e.label, phoneDisplay: null,
    })), truncatedErrors: summary.truncatedErrors || summary.errors.length > 200 };
    await db.$transaction(async tx => {
      await event(tx,params.clientId,params.operationId,CRM_CONTACT_IMPORT_SUMMARY_EVENT,{ ...receiptSummary, actorUserId: params.actorUserId,
        operationId: params.operationId, source: "crm_import", eligible: summary.readyToImport });
      await event(tx,params.clientId,params.operationId,IMPORT_EVENTS.finished,{ status: "COMPLETED", summary: receiptSummary });
    });
  } catch (error) {
    // A validation exception escapes only before row execution. Other failures may be commit-uncertain.
    const classified = await db.event.findFirst({ where: { ...key(params.clientId,params.operationId), eventName: IMPORT_EVENTS.classified } });
    const provenNoRows = !classified && error instanceof CrmContactUpsertError;
    try { await event(db,params.clientId,params.operationId,provenNoRows ? IMPORT_EVENTS.finished : IMPORT_EVENTS.uncertain,
      provenNoRows ? { status: "FAILED", failureCode: error.code } : { reason: "completion_not_proven" }); } catch { /* Never replay a potentially committed write. */ }
  }
  return readCrmImportOperation(db,params.clientId,params.operationId);
}
