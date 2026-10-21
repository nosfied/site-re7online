import { cleanupOrphanTemplateMedia } from "../src/templates/templateMediaCleanup.js";
import { getPrisma } from "../src/db.js";

function parseArgs(argv: string[]) {
  const apply = argv.includes("--apply");
  const ageIndex = argv.indexOf("--older-than-hours");
  const tenantIndex = argv.indexOf("--client-id");
  const hours = Number.parseInt(ageIndex >= 0 ? argv[ageIndex + 1] ?? "" : "168", 10);
  if (!Number.isFinite(hours) || hours < 24) throw new Error("older_than_hours_must_be_at_least_24");
  const clientId = tenantIndex >= 0 ? String(argv[tenantIndex + 1] ?? "").trim() : undefined;
  if (tenantIndex >= 0 && !clientId) throw new Error("client_id_missing");
  return { apply, hours, clientId };
}

const args = parseArgs(process.argv.slice(2));
const result = await cleanupOrphanTemplateMedia({
  dryRun: !args.apply,
  olderThan: new Date(Date.now() - args.hours * 60 * 60 * 1000),
  clientId: args.clientId,
});
process.stdout.write(`${JSON.stringify({ event: "template_media_cleanup", ...result })}\n`);
await getPrisma().$disconnect();
if (result.failed > 0) process.exitCode = 1;
