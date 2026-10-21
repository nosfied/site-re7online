import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const routes = fs.readFileSync(path.join(process.cwd(), "src/http/routes.ts"), "utf8");
const outbound = fs.readFileSync(path.join(process.cwd(), "src/services/outboundTemplateService.ts"), "utf8");
const runner = fs.readFileSync(path.join(process.cwd(), "src/campaigns/campaignRunner.ts"), "utf8");
const csvBatch = fs.readFileSync(path.join(process.cwd(), "src/campaigns/campaignCsvBatch.ts"), "utf8");
const storage = fs.readFileSync(path.join(process.cwd(), "src/templates/templateMediaStorage.ts"), "utf8");

test("template media routes are tenant-scoped, role-gated and bounded before storage", () => {
  const upload = routes.slice(
    routes.indexOf('if (req.method === "POST" && pathname === "/app/templates/media")'),
    routes.indexOf('if (req.method === "GET" && /^\\/app\\/templates\\/media')
  );
  assert.ok(upload.includes("requireClientAuth(req, res)"));
  assert.ok(upload.includes("isAdminOrSupervisorRole(clientAuth.role)"));
  assert.ok(upload.includes("clientId: client.id"));
  assert.ok(upload.includes("enforceAppFeature"));
  assert.ok(routes.includes("receivedBytes > maxMultipartBytes"));
  assert.ok(storage.includes("validateTemplateMediaUpload"));
  assert.ok(routes.includes('state: { not: "deleted" }'));
});

test("campaign creation snapshots the same media across manual, CRM, CSV and split flows", () => {
  assert.ok((routes.match(/templateMediaAssetId: templateMedia\.media\?\.assetId/g) ?? []).length >= 2);
  assert.ok((routes.match(/templateMedia: templateMedia\.media/g) ?? []).length >= 5);
  assert.ok(routes.includes("createScopedCampaignDraftSplit"));
  assert.ok(routes.includes("buildCampaignDraftSeedPayload"));
  assert.ok(csvBatch.includes("templateMedia"));
  assert.ok(csvBatch.includes("templateMediaAssetId"));
  assert.ok(runner.includes("media: seed.media ?? extractTemplateMediaReference(campaign.templateMediaSnapshot)"));
});

test("central template sender validates and uploads media after the final eligibility gate", () => {
  assert.ok(outbound.includes("export async function sendTemplate"));
  assert.ok(outbound.includes("assertTemplateMediaCompatibility"));
  assert.ok(outbound.indexOf("await params.beforeSubmit?.()") < outbound.indexOf("await uploadMedia("));
  assert.ok(outbound.includes("id: params.media.assetId, clientId: params.clientId"));
  assert.ok(outbound.includes("asset.sha256 !== params.media.sha256"));
  assert.ok(outbound.includes("withHeaderMediaComponent"));
  assert.equal((outbound.match(/export async function sendTemplate/g) ?? []).length, 1);
});

test("template submission preserves ambiguous upload state and never exposes provider credentials", () => {
  assert.ok(routes.includes('error.code === "meta_template_media_upload_uncertain"'));
  assert.ok(routes.includes('status = uncertain ? "submission_unknown" : "failed"'));
  assert.ok(routes.includes('"submission_unknown"'));
  assert.ok(!routes.includes("WHATSAPP_ACCESS_TOKEN:"));
});
