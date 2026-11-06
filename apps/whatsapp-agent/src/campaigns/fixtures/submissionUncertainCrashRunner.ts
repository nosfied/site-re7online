import { getPrisma } from "../../db.js";
import {
  getRunningCampaignPromiseForTests,
  setCampaignRunnerAfterUncertaintyCommitForTests,
  startCampaignRun,
} from "../campaignRunner.js";

if (process.env.NODE_ENV === "production") throw new Error("test_fixture_forbidden");
const clientId = process.env.CRASH_FIXTURE_CLIENT_ID!;
const clientKey = process.env.CRASH_FIXTURE_CLIENT_KEY!;
const campaignId = process.env.CRASH_FIXTURE_CAMPAIGN_ID!;
const templateName = process.env.CRASH_FIXTURE_TEMPLATE_NAME!;
const recipient = process.env.CRASH_FIXTURE_RECIPIENT!;
if (![clientId, clientKey, campaignId, templateName, recipient].every(Boolean)) throw new Error("crash_fixture_scope_missing");

const db = getPrisma();
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (!url.startsWith("https://graph.facebook.com/")) throw new Error("crash_fixture_unexpected_external_call");
  await db.event.create({ data: {
    clientId, messageId: `campaign.${campaignId}.1`, eventName: "synthetic.provider.call",
    payloadJson: { providerCalls: 1 },
  } });
  throw new Error("synthetic_connection_lost_after_write");
}) as typeof fetch;

async function main() {
  setCampaignRunnerAfterUncertaintyCommitForTests(async () => {
    process.kill(process.pid, "SIGKILL");
    await new Promise<never>(() => undefined);
  });
  startCampaignRun({
    clientId, clientKey, campaignId, name: "Crash after uncertainty commit",
    templateName, waIds: [recipient],
  });
  await getRunningCampaignPromiseForTests(campaignId);
  throw new Error("crash_fixture_did_not_terminate");
}
void main();
