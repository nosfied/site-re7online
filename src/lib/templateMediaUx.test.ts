import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  TEMPLATE_IMAGE_MAX_BYTES,
  TEMPLATE_VIDEO_MAX_BYTES,
  buildTemplateMediaMetadata,
  sanitizeTemplateMediaFileName,
  validateTemplateMediaFile,
} from "./templateMediaUx";

const file = (name: string, type: string, size: number) => ({ name, type, size });

test("frontend uses decimal Meta size boundaries", () => {
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

test("metadata exposes dimensions, duration and a non-blocking ratio warning", () => {
  const horizontal = buildTemplateMediaMetadata(file("../campanha.jpg", "image/jpeg", 1234) as File, 1200, 628, null);
  assert.equal(horizontal.ratioWarning, false);
  assert.equal(horizontal.fileName, "campanha.jpg");
  const vertical = buildTemplateMediaMetadata(file("video.mp4", "video/mp4", 4321) as File, 720, 1280, 4.25);
  assert.equal(vertical.ratioWarning, true);
  assert.equal(vertical.durationSeconds, 4.25);
  const square = buildTemplateMediaMetadata(file("quadrada.png", "image/png", 2222) as File, 1080, 1080, null);
  assert.equal(square.ratioWarning, true);
});

test("templates and campaigns share requirements and an uncropped authenticated preview", () => {
  const root = process.cwd();
  const preview = fs.readFileSync(path.join(root, "src/components/app/TemplateMediaPreview.tsx"), "utf8");
  const requirements = fs.readFileSync(path.join(root, "src/components/app/TemplateMediaRequirements.tsx"), "utf8");
  const fileInput = fs.readFileSync(path.join(root, "src/components/app/TemplateMediaFileInput.tsx"), "utf8");
  const templates = fs.readFileSync(path.join(root, "src/app/app/templates/page.tsx"), "utf8");
  const campaigns = fs.readFileSync(path.join(root, "src/app/app/campaigns/page.tsx"), "utf8");
  assert(preview.includes("object-contain"));
  assert(!preview.includes("object-cover"));
  assert(preview.includes("Arquivo completo — sem corte"));
  assert(preview.includes("Simulação visual no WhatsApp"));
  assert(preview.includes("Carregando prévia autenticada"));
  assert(preview.includes('role="alert"'));
  assert(requirements.includes("Requisitos obrigatórios"));
  assert(requirements.includes("Recomendação visual"));
  assert(fileInput.includes("Selecionar arquivo"));
  assert(fileInput.includes("Nenhum arquivo selecionado"));
  for (const page of [templates, campaigns]) {
    assert(page.includes("TemplateMediaRequirements"));
    assert(page.includes("TemplateMediaPreview"));
    assert(page.includes("inspectTemplateMediaFile"));
    assert(page.includes("URL.revokeObjectURL"));
  }
  assert(templates.includes("mediaInspectionGenerationRef"));
  assert(campaigns.includes("templateMediaUploadGenerationRef"));
});

test("visible media UX is written in Brazilian Portuguese", () => {
  const requirements = fs.readFileSync(path.join(process.cwd(), "src/components/app/TemplateMediaRequirements.tsx"), "utf8");
  assert(requirements.includes("Cabeçalho") === false);
  assert(!requirements.match(/\b(header|preview|loading|requirements)\b/i));
  assert.equal(sanitizeTemplateMediaFileName("../../mídia final?.png"), "mídia final_.png");
});
