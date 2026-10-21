import assert from "node:assert/strict";
import test from "node:test";
import {
  assertTemplateMediaCompatibility,
  buildCanonicalTemplateComponents,
  mergeProviderTemplateComponents,
  readCanonicalTemplateComponents,
  withHeaderMediaComponent,
} from "./templateComponents.js";

test("legacy text templates remain canonical and media-free", () => {
  const canonical = readCanonicalTemplateComponents(null, { body: "Olá {{1}}" });
  assert.deepEqual(canonical, {
    version: 1,
    header: { type: "NONE", exampleMediaId: null },
    body: { text: "Olá {{1}}" },
  });
  assert.equal(assertTemplateMediaCompatibility({ headerType: "NONE" }), "NONE");
  assert.throws(
    () => assertTemplateMediaCompatibility({ headerType: "NONE", mediaKind: "IMAGE", mediaAssetId: "asset-a" }),
    /template_media_not_allowed/
  );
});

test("image and video headers require a matching tenant-scoped media reference", () => {
  assert.equal(
    assertTemplateMediaCompatibility({ headerType: "IMAGE", mediaKind: "IMAGE", mediaAssetId: "asset-a" }),
    "IMAGE"
  );
  assert.throws(
    () => assertTemplateMediaCompatibility({ headerType: "VIDEO", mediaKind: "IMAGE", mediaAssetId: "asset-a" }),
    /template_media_kind_mismatch/
  );
  assert.throws(
    () => assertTemplateMediaCompatibility({ headerType: "VIDEO" }),
    /template_media_required/
  );
});

test("provider sync preserves known local media identity on partial responses", () => {
  const current = buildCanonicalTemplateComponents({
    body: "Texto anterior",
    headerType: "IMAGE",
    exampleMediaId: "asset-a",
  });
  const merged = mergeProviderTemplateComponents({
    current,
    fallback: { body: "Texto anterior", headerType: "IMAGE", exampleMediaId: "asset-a" },
    providerComponents: [{ type: "BODY", text: "Texto sincronizado" }],
  });
  assert.equal(merged.header.type, "IMAGE");
  assert.equal(merged.header.exampleMediaId, "asset-a");
  assert.equal(merged.body.text, "Texto sincronizado");
});

test("runtime media header is added once without changing body variables", () => {
  const components = withHeaderMediaComponent(
    [{ type: "body", parameters: [{ type: "text", text: "Maria" }] }],
    { kind: "VIDEO", mediaId: "media-1" }
  );
  assert.deepEqual(components, [
    { type: "header", parameters: [{ type: "video", video: { id: "media-1" } }] },
    { type: "body", parameters: [{ type: "text", text: "Maria" }] },
  ]);
});
