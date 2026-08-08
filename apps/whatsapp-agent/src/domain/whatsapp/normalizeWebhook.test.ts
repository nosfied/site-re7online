import assert from "node:assert/strict";
import test from "node:test";
import { normalizeWebhook } from "./normalizeWebhook.js";

test("normalizeWebhook preserva messages[].id como messageId para text e audio", () => {
  const result = normalizeWebhook({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: "wamid.text.context",
                  from: "5511999999999",
                  timestamp: "1776816000",
                  type: "text",
                  text: { body: "texto de teste" },
                },
                {
                  id: "wamid.audio.context",
                  from: "5511999999999",
                  timestamp: "1776816001",
                  type: "audio",
                  audio: {
                    id: "media-audio-context",
                    mime_type: "audio/ogg",
                    sha256: "audio-sha",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.messages.length, 2);
  const textMessage = result.messages[0]!;
  const audioMessage = result.messages[1]!;
  assert.equal(textMessage.type, "text");
  assert.equal(textMessage.messageId, "wamid.text.context");
  assert.equal(textMessage.raw?.id, "wamid.text.context");
  assert.equal(audioMessage.type, "audio");
  assert.equal(audioMessage.messageId, "wamid.audio.context");
  assert.equal(audioMessage.raw?.id, "wamid.audio.context");
  const audioMedia = audioMessage.raw?.media as Record<string, unknown> | undefined;
  assert.equal(audioMedia?.mediaId, "media-audio-context");
});

test("normalizeWebhook extrai metadados de image", () => {
  const result = normalizeWebhook({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: "wamid.image.1",
                  from: "5511999999999",
                  timestamp: "1776816000",
                  type: "image",
                  image: {
                    id: "media-image-1",
                    mime_type: "image/jpeg",
                    caption: "contrato assinado",
                    sha256: "abc123",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.messages.length, 1);
  assert.deepEqual(result.messages[0]?.raw, {
    id: "wamid.image.1",
    type: "image",
    media: {
      mediaId: "media-image-1",
      mimeType: "image/jpeg",
      caption: "contrato assinado",
      sha256: "abc123",
    },
  });
});

test("normalizeWebhook extrai nome do perfil WhatsApp quando disponivel", () => {
  const result = normalizeWebhook({
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [
                {
                  wa_id: "5511999999999",
                  profile: { name: "Maria Cliente" },
                },
              ],
              messages: [
                {
                  id: "wamid.text.1",
                  from: "5511999999999",
                  timestamp: "1776816000",
                  type: "text",
                  text: { body: "oi" },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.messages[0]?.profileName, "Maria Cliente");
});

test("normalizeWebhook extrai fileName e caption de document", () => {
  const result = normalizeWebhook({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: "wamid.document.1",
                  from: "5511888888888",
                  timestamp: "1776816000",
                  type: "document",
                  document: {
                    id: "media-document-1",
                    mime_type: "application/pdf",
                    filename: "peticao.pdf",
                    caption: "segue o pdf",
                    sha256: "def456",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.deepEqual(result.messages[0]?.raw, {
    id: "wamid.document.1",
    type: "document",
    media: {
      mediaId: "media-document-1",
      mimeType: "application/pdf",
      fileName: "peticao.pdf",
      caption: "segue o pdf",
      sha256: "def456",
    },
  });
});

test("normalizeWebhook extrai metadados de location", () => {
  const result = normalizeWebhook({
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  id: "wamid.location.1",
                  from: "5511777777777",
                  timestamp: "1776816000",
                  type: "location",
                  location: {
                    latitude: -27.3435,
                    longitude: -51.6112,
                    name: "SIMAE Capinzal",
                    address: "Rua Domingos Omizollo, 447",
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.messages[0]?.type, "location");
  assert.deepEqual(result.messages[0]?.raw, {
    id: "wamid.location.1",
    type: "location",
    location: {
      latitude: -27.3435,
      longitude: -51.6112,
      name: "SIMAE Capinzal",
      address: "Rua Domingos Omizollo, 447",
    },
  });
});
