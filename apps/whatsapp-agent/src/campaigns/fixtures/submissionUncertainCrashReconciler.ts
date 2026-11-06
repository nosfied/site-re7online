import { getPrisma } from "../../db.js";
import {
  applySubmissionUncertain,
  dryRunSubmissionUncertain,
  verifySubmissionUncertain,
  type SubmissionUncertainBindings,
} from "../campaignSubmissionUncertainReconciliation.js";

if (process.env.NODE_ENV === "production") throw new Error("test_fixture_forbidden");
const parsedBindings = JSON.parse(process.env.CRASH_FIXTURE_BINDINGS ?? "null") as SubmissionUncertainBindings | null;
if (!parsedBindings) throw new Error("crash_fixture_bindings_missing");
const bindings: SubmissionUncertainBindings = parsedBindings;

async function main() {
  const db = getPrisma();
  try {
    const dryRun = await dryRunSubmissionUncertain(db, bindings);
    if (dryRun.alreadyApplied) throw new Error("crash_fixture_unexpected_prior_receipt");
    const applied = await applySubmissionUncertain(db, bindings, dryRun.planHash);
    const verified = await verifySubmissionUncertain(db, bindings);
    process.stdout.write(`CRASH_RECONCILIATION_RESULT=${JSON.stringify({
      planHash: dryRun.planHash,
      providerCalls: dryRun.plan.providerCalls,
      originalProviderCalls: dryRun.plan.originalProviderCalls,
      existingDispositionEventId: dryRun.plan.existingDispositionEventId,
      receiptId: applied.receiptId,
      interruptedParent: verified.interruptedParent,
    })}\n`);
  } finally {
    await db.$disconnect();
  }
}
void main();
