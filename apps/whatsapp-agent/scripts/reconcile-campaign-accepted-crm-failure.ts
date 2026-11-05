// Administrative recovery only. Read-only by default; SQL reconciliation and
// ledger acknowledgement require distinct explicit authorizations.
import fs from "node:fs";
import { getPrisma } from "../src/db.js";
import {
  acknowledgeAcceptedCrmFailure,
  applyAcceptedCrmFailure,
  dryRunAcceptedCrmFailure,
  verifyAcceptedCrmFailure,
  type AcceptedCrmFailureBindings,
} from "../src/campaigns/campaignAcceptedCrmFailureReconciliation.js";
import { sanitizeMailDeliveryError } from "../src/mail/canonicalMail.js";

const args = process.argv.slice(2);
const value = (key: string) => args.find((item) => item.startsWith(`${key}=`))?.slice(key.length + 1);
const filename = value("--bindings");
if (!filename) throw new Error("crm_failure_bindings_required");
const bindings = JSON.parse(fs.readFileSync(filename, "utf8")) as AcceptedCrmFailureBindings;
for (const key of ["clientId", "campaignId", "jobId", "runId", "seedEventId", "acceptedEventId", "failedOutboundId", "taskId"] as const) {
  if (typeof bindings[key] !== "string" || !/^[a-f0-9-]{36}$/i.test(bindings[key])) throw new Error(`crm_failure_binding_invalid:${key}`);
}
if (!Number.isInteger(bindings.guardGeneration) || bindings.guardGeneration < 0 || !Number.isInteger(bindings.position) || bindings.position < 1 || bindings.providerErrorCode !== 130497) {
  throw new Error("crm_failure_binding_invalid:ordinal_or_code");
}
const mode = value("--mode") ?? "dry-run";
if (!["dry-run", "apply-sql", "verify-receipt", "ack-task"].includes(mode)) throw new Error("crm_failure_mode_invalid");
if (!["dry-run", "verify-receipt"].includes(mode) && !args.includes("--execute-authorized")) throw new Error("crm_failure_execution_not_authorized");
const db = getPrisma();
try {
  if (mode === "dry-run") {
    const result = await dryRunAcceptedCrmFailure(db, bindings);
    console.log(JSON.stringify(result.alreadyApplied ? result : { alreadyApplied: false, planHash: result.planHash,
      providerCalls: 0, campaignStatusPreserved: result.plan.campaignStatusPreserved,
      sentCountPreserved: result.plan.sentCountPreserved, remainingRecipients: result.plan.remainingRecipients,
      campaignContinuationAuthorized: false }));
  } else if (mode === "apply-sql") {
    const planHash = value("--plan-hash");
    if (!planHash || !/^[a-f0-9]{64}$/.test(planHash)) throw new Error("crm_failure_plan_hash_required");
    console.log(JSON.stringify(await applyAcceptedCrmFailure(db, bindings, planHash)));
  } else if (mode === "verify-receipt") {
    console.log(JSON.stringify(await verifyAcceptedCrmFailure(db, bindings)));
  } else {
    const actor = value("--actor");
    if (!actor) throw new Error("crm_failure_actor_required");
    console.log(JSON.stringify(await acknowledgeAcceptedCrmFailure(db, bindings, actor)));
  }
} catch (error) {
  console.error(sanitizeMailDeliveryError(error)); process.exitCode = 1;
} finally {
  await db.$disconnect();
}
