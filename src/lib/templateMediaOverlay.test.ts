import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

test("template and campaign media operations use the central tokenized overlay", () => {
  const templates = read("src/app/app/templates/page.tsx");
  const campaigns = read("src/app/app/campaigns/page.tsx");
  const admin = read("src/app/admin/templates/manage/page.tsx");
  for (const source of [templates, campaigns, admin]) {
    assert(source.includes("ScreenProcessingOverlay"));
    assert(source.includes("useScreenProcessingOperations"));
  }
  for (const key of ["template-media-upload", "template-request", "template-sync-all", "campaign-media-upload", "campaign-create", "campaign-schedule", "campaign-test", "campaign-send"]) {
    assert(`${templates}\n${campaigns}`.includes(key), `missing overlay token ${key}`);
  }
  assert(!campaigns.includes('key: "campaign-poll"'), "background polling must not block the screen");
});
