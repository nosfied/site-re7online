import { getPrisma } from "../../db.js";
import {
  getRunningCampaignPromiseForTests,
  setCampaignRunnerAfterUncertaintyCommitForTests,
  startCampaignRun,
} from "../campaignRunner.js";
import { claimNextCampaignExecutionJob } from "../campaignExecutionQueue.js";

if (process.env.NODE_ENV === "production") throw new Error("test_fixture_forbidden");
const clientId = process.env.CRASH_FIXTURE_CLIENT_ID!;
const clientKey = process.env.CRASH_FIXTURE_CLIENT_KEY!;
const campaignId = process.env.CRASH_FIXTURE_CAMPAIGN_ID!;
const templateName = process.env.CRASH_FIXTURE_TEMPLATE_NAME!;
const parsedRecipients = JSON.parse(process.env.CRASH_FIXTURE_RECIPIENTS ?? "null") as unknown;
const crashPosition = Number(process.env.CRASH_FIXTURE_CRASH_POSITION);
if (![clientId, clientKey, campaignId, templateName].every(Boolean) || !Array.isArray(parsedRecipients) ||
  !parsedRecipients.every(recipient => typeof recipient === "string") || !Number.isSafeInteger(crashPosition) || crashPosition < 1) {
  throw new Error("crash_fixture_scope_missing");
}
const recipients = parsedRecipients as string[];

const db = getPrisma();
let providerCalls = 0;
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.startsWith("https://graph.facebook.com/")) throw new Error("crash_fixture_unexpected_external_call");
  providerCalls += 1;
  await db.event.create({ data: {
    clientId, messageId: `campaign.${campaignId}.${providerCalls}`, eventName: "synthetic.provider.call",
    payloadJson: { providerCalls: 1, position: providerCalls },
  } });
  throw new Error("synthetic_connection_lost_after_write");
}) as typeof fetch;

async function main() {
  setCampaignRunnerAfterUncertaintyCommitForTests(async () => {
    const committed = await db.event.count({ where: { clientId, eventName: "campaign.message.submission_uncertain_preserved",
      messageId: { startsWith: `campaign.${campaignId}.` } } });
    if (committed !== crashPosition) return;
    process.kill(process.pid, "SIGKILL");
    await new Promise<never>(() => undefined);
  });
  const executionJob = await claimNextCampaignExecutionJob();
  if (!executionJob || executionJob.campaignId !== campaignId || executionJob.clientId !== clientId) {
    throw new Error("crash_fixture_job_not_claimed");
  }
  startCampaignRun({
    clientId, clientKey, campaignId, name: "Crash after uncertainty commit",
    templateName, waIds: recipients, executionJob,
  });
  await getRunningCampaignPromiseForTests(campaignId);
  throw new Error("crash_fixture_did_not_terminate");
}
void main();
