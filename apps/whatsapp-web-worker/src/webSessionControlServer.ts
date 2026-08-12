import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { logger } from "../../whatsapp-agent/src/logger/logger.js";
import { getWebSessionQrFromRuntime } from "../../whatsapp-agent/src/web-session/webSessionConnectionRuntime.js";

export type WebSessionControlSendTextParams = {
  clientId: string;
  tenantKey: string;
  accountId: string;
  channelAccountId: string;
  recipientWaId: string;
  text: string;
  replyTo?: WebSessionControlReplyReference | null;
  requestId: string;
};

export type WebSessionControlSendTextResult =
  | { ok: true; externalMessageId: string | null }
  | { ok: false; statusCode: number; error: string; message?: string };

export type WebSessionControlSendMediaParams = {
  clientId: string;
  tenantKey: string;
  accountId: string;
  channelAccountId: string;
  recipientWaId: string;
  mediaPath: string;
  mediaKind: "image" | "audio" | "document" | "video";
  mimeType: string;
  fileName: string | null;
  caption: string | null;
  replyTo?: WebSessionControlReplyReference | null;
  requestId: string;
};

export type WebSessionControlSendMediaResult =
  | { ok: true; externalMessageId: string | null }
  | { ok: false; statusCode: number; error: string; message?: string };

export type WebSessionControlReplyReference = {
  externalMessageId: string;
  remoteJid: string;
  fromMe: boolean;
  messageType: "TEXT" | "IMAGE" | "AUDIO" | "DOCUMENT" | "VIDEO";
  bodyText?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
};

function json(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function hasValidToken(req: IncomingMessage, expectedToken: string | undefined) {
  if (!expectedToken) return true;
  return req.headers.authorization === `Bearer ${expectedToken}`;
}

function getQrAccountId(pathname: string) {
  const match = pathname.match(/^\/web-session\/accounts\/([^/]+)\/qr$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function readJsonBody(req: IncomingMessage, maxBytes = 16_384) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new Error("payload_too_large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function parseSendTextBody(body: Record<string, unknown>): WebSessionControlSendTextParams | null {
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const tenantKey = typeof body.tenantKey === "string" ? body.tenantKey.trim() : "";
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const channelAccountId = typeof body.channelAccountId === "string" ? body.channelAccountId.trim() : "";
  const recipientWaId = typeof body.recipientWaId === "string" ? body.recipientWaId.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const replyTo = parseReplyReference(body.replyTo);
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (!clientId || !tenantKey || !accountId || !channelAccountId || !recipientWaId || !text || !requestId) {
    return null;
  }
  return { clientId, tenantKey, accountId, channelAccountId, recipientWaId, text, replyTo, requestId };
}

function parseSendMediaBody(body: Record<string, unknown>): WebSessionControlSendMediaParams | null {
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const tenantKey = typeof body.tenantKey === "string" ? body.tenantKey.trim() : "";
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const channelAccountId = typeof body.channelAccountId === "string" ? body.channelAccountId.trim() : "";
  const recipientWaId = typeof body.recipientWaId === "string" ? body.recipientWaId.trim() : "";
  const mediaPath = typeof body.mediaPath === "string" ? body.mediaPath.trim() : "";
  const mediaKind = typeof body.mediaKind === "string" ? body.mediaKind.trim() : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim() : "";
  const fileName = typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim() : null;
  const caption = typeof body.caption === "string" && body.caption.trim() ? body.caption.trim() : null;
  const replyTo = parseReplyReference(body.replyTo);
  const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
  if (
    !clientId ||
    !tenantKey ||
    !accountId ||
    !channelAccountId ||
    !recipientWaId ||
    !mediaPath ||
    !mimeType ||
    !requestId ||
    !["image", "audio", "document", "video"].includes(mediaKind)
  ) {
    return null;
  }
  return {
    clientId,
    tenantKey,
    accountId,
    channelAccountId,
    recipientWaId,
    mediaPath,
    mediaKind: mediaKind as WebSessionControlSendMediaParams["mediaKind"],
    mimeType,
    fileName,
    caption,
    replyTo,
    requestId,
  };
}

function parseReplyReference(value: unknown): WebSessionControlReplyReference | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const externalMessageId = typeof record.externalMessageId === "string" ? record.externalMessageId.trim() : "";
  const remoteJid = typeof record.remoteJid === "string" ? record.remoteJid.trim() : "";
  const messageType = typeof record.messageType === "string" ? record.messageType.trim().toUpperCase() : "";
  if (
    !externalMessageId ||
    !remoteJid ||
    !["TEXT", "IMAGE", "AUDIO", "DOCUMENT", "VIDEO"].includes(messageType) ||
    typeof record.fromMe !== "boolean"
  ) {
    return null;
  }
  return {
    externalMessageId,
    remoteJid,
    fromMe: record.fromMe,
    messageType: messageType as WebSessionControlReplyReference["messageType"],
    bodyText: typeof record.bodyText === "string" && record.bodyText.trim() ? record.bodyText.trim().slice(0, 500) : null,
    fileName: typeof record.fileName === "string" && record.fileName.trim() ? record.fileName.trim().slice(0, 180) : null,
    mimeType: typeof record.mimeType === "string" && record.mimeType.trim() ? record.mimeType.trim().slice(0, 120) : null,
  };
}

export function startWebSessionControlServer(params: {
  port: number;
  host?: string;
  token?: string;
  sendText?: (params: WebSessionControlSendTextParams) => Promise<WebSessionControlSendTextResult>;
  sendMedia?: (params: WebSessionControlSendMediaParams) => Promise<WebSessionControlSendMediaResult>;
}) {
  const host = params.host ?? "127.0.0.1";
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
    if (!hasValidToken(req, params.token)) {
      json(res, 401, { ok: false, error: "unauthorized" });
      return;
    }
    if (url.pathname === "/health" && req.method === "GET") {
      json(res, 200, { ok: true });
      return;
    }
    const accountId = req.method === "GET" ? getQrAccountId(url.pathname) : null;
    if (accountId) {
      json(res, 200, { ok: true, qr: getWebSessionQrFromRuntime(accountId) });
      return;
    }
    if (url.pathname === "/web-session/send-text" && req.method === "POST") {
      void (async () => {
        if (!params.sendText) {
          json(res, 503, { ok: false, error: "send_text_unavailable" });
          return;
        }
        let parsed: WebSessionControlSendTextParams | null = null;
        try {
          parsed = parseSendTextBody(await readJsonBody(req));
        } catch {
          json(res, 400, { ok: false, error: "invalid_json" });
          return;
        }
        if (!parsed) {
          json(res, 400, { ok: false, error: "bad_request" });
          return;
        }
        const result = await params.sendText(parsed);
        if (!result.ok) {
          json(res, result.statusCode, { ok: false, error: result.error, message: result.message });
          return;
        }
        json(res, 200, { ok: true, externalMessageId: result.externalMessageId });
      })().catch((error) => {
        logger.error({
          event: "whatsapp.web.worker.control.send_text_error",
          message: error instanceof Error ? error.message : "unknown_error",
        });
        json(res, 500, { ok: false, error: "server_error" });
      });
      return;
    }
    if (url.pathname === "/web-session/send-media" && req.method === "POST") {
      void (async () => {
        if (!params.sendMedia) {
          json(res, 503, { ok: false, error: "send_media_unavailable" });
          return;
        }
        let parsed: WebSessionControlSendMediaParams | null = null;
        try {
          parsed = parseSendMediaBody(await readJsonBody(req, 32_768));
        } catch {
          json(res, 400, { ok: false, error: "invalid_json" });
          return;
        }
        if (!parsed) {
          json(res, 400, { ok: false, error: "bad_request" });
          return;
        }
        const result = await params.sendMedia(parsed);
        if (!result.ok) {
          json(res, result.statusCode, { ok: false, error: result.error, message: result.message });
          return;
        }
        json(res, 200, { ok: true, externalMessageId: result.externalMessageId });
      })().catch((error) => {
        logger.error({
          event: "whatsapp.web.worker.control.send_media_error",
          message: error instanceof Error ? error.message : "unknown_error",
        });
        json(res, 500, { ok: false, error: "server_error" });
      });
      return;
    }
    if (req.method !== "GET" && req.method !== "POST") {
      json(res, 405, { ok: false, error: "method_not_allowed" });
      return;
    }
    if (url.pathname !== "/health") {
      json(res, 404, { ok: false, error: "not_found" });
      return;
    }
    json(res, 405, { ok: false, error: "method_not_allowed" });
  });
  server.listen(params.port, host, () => {
    logger.info({
      event: "whatsapp.web.worker.control.started",
      host,
      port: params.port,
      auth: params.token ? "configured" : "not_configured",
    });
  });
  return server;
}
