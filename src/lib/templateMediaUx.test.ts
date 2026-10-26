import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CampaignMediaGuidance from "../components/app/CampaignMediaGuidance";
import TemplateMediaInspectionPanel from "../components/app/TemplateMediaInspectionPanel";
import TemplateMessageComposition from "../components/app/TemplateMessageComposition";
import {
  TEMPLATE_IMAGE_MAX_BYTES,
  TEMPLATE_VIDEO_MAX_BYTES,
  TemplateMediaInspectionCoordinator,
  TemplateMediaInspectionSurface,
  buildTemplateMediaMetadata,
  inspectTemplateMediaBlob,
  sanitizeTemplateMediaFileName,
  takeTemplateMediaFileAndReset,
  validateTemplateMediaFile,
} from "./templateMediaUx";
import { sortCatalogItems, sortTemplates } from "./templateCatalogOrdering";
import {
  getAdminTemplateRequestActionState,
  isAdminTemplateRequestSubmittable,
  isAdminTemplateRequestSyncable,
} from "./templateRequestActions";

const file = (name: string, type: string, size: number) => ({ name, type, size });

function successfulSurface(kind: "IMAGE" | "VIDEO") {
  const state = { revoked: [] as string[], cleared: 0, sourceCleared: false };
  const element: Record<string, unknown> = {
    naturalWidth: 1200,
    naturalHeight: 628,
    videoWidth: 720,
    videoHeight: 1280,
    duration: 4.25,
    onload: null,
    onloadedmetadata: null,
    onerror: null,
    pause() {},
    removeAttribute(name: string) {
      if (name === "src") {
        state.sourceCleared = true;
        element.naturalWidth = 0;
        element.naturalHeight = 0;
        element.videoWidth = 0;
        element.videoHeight = 0;
        element.duration = Number.NaN;
      }
    },
    load() {},
  };
  Object.defineProperty(element, "src", {
    get: () => "blob:test",
    set: (value: string) => {
      if (!value) state.sourceCleared = true;
      else queueMicrotask(() => {
        const handler = kind === "IMAGE" ? element.onload : element.onloadedmetadata;
        if (typeof handler === "function") handler();
      });
    },
  });
  const surface: TemplateMediaInspectionSurface = {
    createObjectURL: () => "blob:test",
    revokeObjectURL: (url) => state.revoked.push(url),
    createImage: () => element as never,
    createVideo: () => element as never,
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: (handle) => { state.cleared += 1; globalThis.clearTimeout(handle); },
  };
  return { surface, state };
}

test("frontend uses conservative decimal boundaries", () => {
  assert.equal(TEMPLATE_IMAGE_MAX_BYTES, 5_000_000);
  assert.equal(TEMPLATE_VIDEO_MAX_BYTES, 16_000_000);
  assert.equal(validateTemplateMediaFile(file("imagem.jpg", "image/jpeg", 5_000_000), "IMAGE"), null);
  assert.match(validateTemplateMediaFile(file("imagem.jpg", "image/jpeg", 5_000_001), "IMAGE")!, /excede/);
  assert.equal(validateTemplateMediaFile(file("video.mp4", "video/mp4", 16_000_000), "VIDEO"), null);
  assert.match(validateTemplateMediaFile(file("video.mp4", "video/mp4", 16_000_001), "VIDEO")!, /excede/);
});

test("frontend rejects empty, MIME, extension and kind mismatches with specific messages", () => {
  assert.match(validateTemplateMediaFile(file("imagem.png", "image/png", 0), "IMAGE")!, /vazio/);
  assert.match(validateTemplateMediaFile(file("imagem.gif", "image/gif", 100), "IMAGE")!, /JPEG ou PNG/);
  assert.match(validateTemplateMediaFile(file("imagem.mp4", "image/jpeg", 100), "IMAGE")!, /extensão/);
  assert.match(validateTemplateMediaFile(file("video.3gp", "video/mp4", 100), "VIDEO")!, /não corresponde/);
});

test("file inspection and WhatsApp composition are separate behavioral surfaces", () => {
  const metadata = buildTemplateMediaMetadata(file("campanha.jpg", "image/jpeg", 1234) as File, 1200, 628, null);
  const inspection = renderToStaticMarkup(React.createElement(TemplateMediaInspectionPanel, { kind: "IMAGE", url: "blob:image", metadata }));
  assert.match(inspection, /Arquivo completo — sem corte/);
  assert.match(inspection, /campanha\.jpg/);
  assert.match(inspection, /1200/);

  for (const kind of ["IMAGE", "VIDEO"] as const) {
    const composition = renderToStaticMarkup(React.createElement(TemplateMessageComposition, {
      body: "Olá Maria, seu protocolo é 42.", headerType: kind, mediaUrl: `blob:${kind}`, emptyText: "vazio",
    }));
    assert(composition.indexOf("Cabeçalho") < composition.indexOf("Olá Maria"));
    assert.doesNotMatch(composition, /Arquivo completo|campanha\.jpg|Dimensões|Proporção|<details/);
    assert.match(composition, kind === "IMAGE" ? /<img/ : /<video/);
    assert.match(composition, /apresentação pode variar/);
  }
});

test("campaign media guidance replaces its primary instructions with a collapsed disclosure after selection", () => {
  const beforeSelection = renderToStaticMarkup(React.createElement(CampaignMediaGuidance, {
    kind: "IMAGE", compact: false, expanded: false, onToggle() {},
  }));
  assert.match(beforeSelection, /data-campaign-media-guidance="primary"/);
  assert.match(beforeSelection, /Requisitos obrigatórios/);
  assert.match(beforeSelection, /5\.00 MB/);
  assert.doesNotMatch(beforeSelection, /aria-expanded/);

  for (const kind of ["IMAGE", "VIDEO"] as const) {
    const selected = renderToStaticMarkup(React.createElement(CampaignMediaGuidance, {
      kind, compact: true, expanded: false, onToggle() {},
    }));
    assert.match(selected, /data-campaign-media-guidance="compact"/);
    assert.match(selected, /aria-expanded="false"/);
    assert.match(selected, /Formatos, tamanho e recomendações/);
    assert.doesNotMatch(selected, /Requisitos obrigatórios/);
  }
});

test("campaign media guidance can be expanded and hidden again for image and video", () => {
  for (const [kind, expected] of [["IMAGE", "5.00 MB"], ["VIDEO", "16.00 MB"]] as const) {
    const expanded = renderToStaticMarkup(React.createElement(CampaignMediaGuidance, {
      kind, compact: true, expanded: true, onToggle() {},
    }));
    assert.match(expanded, /aria-expanded="true"/);
    assert.match(expanded, /Requisitos obrigatórios/);
    assert.match(expanded, new RegExp(expected));
    assert.match(expanded, /Ocultar/);

    const hiddenAgain = renderToStaticMarkup(React.createElement(CampaignMediaGuidance, {
      kind, compact: true, expanded: false, onToggle() {},
    }));
    assert.doesNotMatch(hiddenAgain, /Requisitos obrigatórios/);
    assert.match(hiddenAgain, /Ver/);
  }
});

test("CRM, CSV and manual previews render filled variables with media before BODY", () => {
  const scenarios = [
    ["CRM", "Olá Ana, setor Turismo"],
    ["CSV", "Olá Bruno, protocolo 123"],
    ["manual", "Olá Carla, atendimento confirmado"],
  ];
  for (const kind of ["IMAGE", "VIDEO"] as const) {
    for (const [mode, body] of scenarios) {
      const html = renderToStaticMarkup(React.createElement(TemplateMessageComposition, {
        body, headerType: kind, mediaUrl: `blob:${mode}-${kind}`, emptyText: "vazio",
      }));
      const mediaTag = kind === "IMAGE" ? "<img" : "<video";
      assert(html.indexOf(mediaTag) < html.indexOf(body), `${mode}/${kind} must render its header before BODY`);
      assert.match(html, new RegExp(body));
    }
  }
});

test("persisted blobs reconstruct available image and video metadata and always clean resources", async () => {
  for (const kind of ["IMAGE", "VIDEO"] as const) {
    const { surface, state } = successfulSurface(kind);
    const blob = new Blob(["media"], { type: kind === "IMAGE" ? "image/png" : "video/mp4" });
    const metadata = await inspectTemplateMediaBlob(blob, kind, { surface, fileName: kind === "IMAGE" ? "persistida.png" : null });
    assert.equal(metadata.sizeBytes, 5);
    assert.equal(metadata.mimeType, blob.type);
    assert.equal(metadata.fileName, kind === "IMAGE" ? "persistida.png" : null);
    assert.equal(metadata.width, kind === "IMAGE" ? 1200 : 720);
    assert.equal(metadata.durationSeconds, kind === "VIDEO" ? 4.25 : null);
    assert.deepEqual(state.revoked, ["blob:test"]);
    assert.equal(state.sourceCleared, true);
    assert.equal(state.cleared, 1);
  }
});

test("inspection timeout and cancellation remove handlers, clear source and revoke Blob URL", async () => {
  const never = successfulSurface("IMAGE");
  never.surface.createImage = () => ({ src: "", onload: null, onerror: null, naturalWidth: 0, naturalHeight: 0, removeAttribute() { never.state.sourceCleared = true; } }) as never;
  await assert.rejects(inspectTemplateMediaBlob(new Blob(["x"], { type: "image/png" }), "IMAGE", { surface: never.surface, timeoutMs: 2 }), /tempo limite/);
  assert.deepEqual(never.state.revoked, ["blob:test"]);
  assert.equal(never.state.sourceCleared, true);

  const cancelled = successfulSurface("VIDEO");
  cancelled.surface.createVideo = never.surface.createImage;
  const controller = new AbortController();
  const pending = inspectTemplateMediaBlob(new Blob(["x"], { type: "video/mp4" }), "VIDEO", { surface: cancelled.surface, signal: controller.signal, timeoutMs: 1000 });
  controller.abort();
  await assert.rejects(pending, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  assert.deepEqual(cancelled.state.revoked, ["blob:test"]);
});

test("rapid replacement and unmount cancel the prior inspection and preserve only the current token", () => {
  const coordinator = new TemplateMediaInspectionCoordinator();
  const first = coordinator.begin();
  const second = coordinator.begin();
  assert.equal(first.signal.aborted, true);
  assert.equal(coordinator.isCurrent(first.generation), false);
  assert.equal(coordinator.isCurrent(second.generation), true);
  coordinator.cancel();
  assert.equal(second.signal.aborted, true);
  assert.equal(coordinator.isCurrent(second.generation), false);
});

test("native input resets after capture so the same file can be selected again", () => {
  const selected = file("igual.png", "image/png", 100) as File;
  const input = { files: [selected] as unknown as FileList, value: "C:\\fakepath\\igual.png" };
  assert.equal(takeTemplateMediaFileAndReset(input), selected);
  assert.equal(input.value, "");
  input.files = [selected] as unknown as FileList;
  input.value = "C:\\fakepath\\igual.png";
  assert.equal(takeTemplateMediaFileAndReset(input), selected);
  assert.equal(input.value, "");
});

test("metadata warning is advisory and visible media UX is Brazilian Portuguese", () => {
  const vertical = buildTemplateMediaMetadata(file("vídeo.mp4", "video/mp4", 4321) as File, 720, 1280, 4.25);
  assert.equal(vertical.ratioWarning, true);
  assert.equal(vertical.durationSeconds, 4.25);
  assert.equal(sanitizeTemplateMediaFileName("../../mídia final?.png"), "mídia final_.png");
  const requirements = fs.readFileSync(path.join(process.cwd(), "src/components/app/TemplateMediaRequirements.tsx"), "utf8");
  assert(!requirements.match(/\b(header|preview|loading|requirements)\b/i));
});

test("submission_unknown permite sincronizar sem permitir uma nova submissão", () => {
  assert.equal(isAdminTemplateRequestSyncable("submission_unknown"), true);
  assert.equal(isAdminTemplateRequestSubmittable("submission_unknown"), false);
  assert.deepEqual(getAdminTemplateRequestActionState("submission_unknown", false), {
    submitDisabled: true,
    syncDisabled: false,
  });
});

test("uma operação administrativa em andamento bloqueia submissão e sincronização", () => {
  assert.deepEqual(getAdminTemplateRequestActionState("internal_approved", true), {
    submitDisabled: true,
    syncDisabled: true,
  });
  assert.deepEqual(getAdminTemplateRequestActionState("submitted_to_meta", true), {
    submitDisabled: true,
    syncDisabled: true,
  });
});

test("templates usam createdAt DESC e ID como desempate, ignorando updatedAt", () => {
  const items = [
    { id: "template-b", createdAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-10-24T20:00:00.000Z" },
    { id: "template-c", createdAt: "2026-10-22T10:00:00.000Z", updatedAt: "2026-10-22T10:00:00.000Z" },
    { id: "template-a", createdAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-10-25T20:00:00.000Z" },
  ];
  assert.deepEqual(sortTemplates(items).map((item) => item.id), ["template-c", "template-a", "template-b"]);
});

test("catálogo mantém a posição quando uma sincronização altera apenas updatedAt", () => {
  const items = [
    { id: "template-b", createdAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-10-24T20:00:00.000Z" },
    { id: "template-c", createdAt: "2026-10-22T10:00:00.000Z", updatedAt: "2026-10-22T10:00:00.000Z" },
    { id: "template-a", createdAt: "2026-10-20T10:00:00.000Z", updatedAt: "2026-10-25T20:00:00.000Z" },
  ];
  const before = sortCatalogItems(items).map((item) => item.id);
  const synchronized = items.map((item) =>
    item.id === "template-b" ? { ...item, updatedAt: "2027-01-01T00:00:00.000Z" } : item
  );
  assert.deepEqual(sortCatalogItems(synchronized).map((item) => item.id), before);
});
