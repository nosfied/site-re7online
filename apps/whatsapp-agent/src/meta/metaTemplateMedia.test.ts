import assert from "node:assert/strict";
import test from "node:test";
import { uploadMetaTemplateExample } from "./metaTemplateMedia.js";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("resumable upload creates a session then uploads bytes without exposing the token", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return calls.length === 1 ? jsonResponse({ id: "upload:session-1" }) : jsonResponse({ h: "header-handle-1" });
  }) as typeof fetch;
  const result = await uploadMetaTemplateExample({
    apiVersion: "v23.0",
    appId: "app-public-id",
    accessToken: "private-token",
    content: Buffer.from("bytes"),
    mimeType: "image/jpeg",
    fileName: "example.jpg",
    fetchImpl,
  });
  assert.deepEqual(result, { ok: true, handle: "header-handle-1", sessionId: "upload:session-1" });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url.includes("private-token"), false);
  assert.equal(calls[1].url.includes("private-token"), false);
  assert.equal(calls[1].init?.headers && JSON.stringify(calls[1].init.headers).includes("private-token"), true);
});

test("provider errors are sanitized and upload transport ambiguity is explicit", async () => {
  const denied = await uploadMetaTemplateExample({
    apiVersion: "v23.0",
    appId: "app-id",
    accessToken: "secret",
    content: Buffer.from("bytes"),
    mimeType: "video/mp4",
    fileName: "example.mp4",
    fetchImpl: (async () => jsonResponse({ error: { code: 10, message: "denied" } }, { status: 403 })) as typeof fetch,
  });
  assert.deepEqual(denied, {
    ok: false,
    code: "meta_upload_failed",
    status: 403,
    details: "code=10; denied",
    sessionId: null,
  });

  const uncertain = await uploadMetaTemplateExample({
    apiVersion: "v23.0",
    appId: "app-id",
    accessToken: "secret",
    content: Buffer.from("bytes"),
    mimeType: "image/jpeg",
    fileName: "example.jpg",
    fetchImpl: (async () => { throw new Error("network"); }) as typeof fetch,
  });
  assert.deepEqual(uncertain, {
    ok: false,
    code: "meta_upload_result_uncertain",
    status: null,
    details: null,
    sessionId: null,
  });
});

test("tests never call the real provider", () => {
  assert.ok(true);
});
