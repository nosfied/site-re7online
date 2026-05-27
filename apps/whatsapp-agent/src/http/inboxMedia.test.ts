import assert from "node:assert/strict";
import test from "node:test";
import { buildInboxMessageMedia, extractRawMediaId } from "./inboxMedia.js";

test("buildInboxMessageMedia monta shape esperado para document", () => {
  const media = buildInboxMessageMedia({
    type: "DOCUMENT",
    rawPayload: {
      id: "wamid.document.1",
      type: "document",
      media: {
        mediaId: "media-document-1",
        mimeType: "application/pdf",
        fileName: "peticao.pdf",
        caption: "anexo principal",
      },
    },
    downloadUrl: "/app/conversation/5511/messages/wamid.document.1/media",
  });

  assert.deepEqual(media, {
    kind: "document",
    mimeType: "application/pdf",
    fileName: "peticao.pdf",
    caption: "anexo principal",
    hasDownload: true,
    downloadUrl: "/app/conversation/5511/messages/wamid.document.1/media",
  });
});

test("extractRawMediaId retorna null quando payload nao tem midia", () => {
  assert.equal(extractRawMediaId({ id: "wamid.text.1", type: "text" }), null);
});
