import assert from "node:assert/strict";
import test from "node:test";
import { uploadMetaTemplateExample } from "./metaTemplateMedia.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const base = {
  apiVersion: "v23.0",
  appId: "app-public-id",
  accessToken: "private-token",
  content: Buffer.from("bytes"),
  mimeType: "video/mp4",
  fileName: "example.mp4",
};

test("resumable upload follows the documented session and binary protocol", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const sessionId = "upload:fixture-session?sig=fixture-signature";
  const result = await uploadMetaTemplateExample({
    ...base,
    fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return calls.length === 1 ? jsonResponse({ id: sessionId }) : jsonResponse({ h: "private-media-handle" });
    }) as typeof fetch,
  });

  assert.deepEqual(result, { ok: true, handle: "private-media-handle" });
  assert.equal(calls.length, 2);
  const createUrl = new URL(calls[0].url);
  assert.equal(createUrl.pathname, "/v23.0/app-public-id/uploads");
  assert.equal(createUrl.searchParams.get("file_length"), "5");
  assert.equal(createUrl.searchParams.get("file_type"), "video/mp4");
  assert.equal(createUrl.searchParams.get("file_name"), "example.mp4");
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer private-token");

  const uploadUrl = new URL(calls[1].url);
  const uploadPath = uploadUrl.pathname.split("/");
  assert.equal(decodeURIComponent(uploadPath[uploadPath.length - 1] ?? ""), sessionId);
  assert.equal(uploadUrl.search, "");
  assert.equal((calls[1].init?.headers as Record<string, string>).Authorization, "OAuth private-token");
  assert.equal((calls[1].init?.headers as Record<string, string>).file_offset, "0");
  assert.equal(calls[1].init?.body instanceof Uint8Array, true);
});

test("session creation refusal preserves only the structured safe diagnosis", async () => {
  const result = await uploadMetaTemplateExample({
    ...base,
    fetchImpl: (async () => jsonResponse({
      error: {
        code: 190,
        error_subcode: 460,
        type: "OAuthException",
        fbtrace_id: "safe-trace",
        message: "Token access_token=private-token rejected at https://secret.invalid/path upload:private-session verylongsecret012345678901234567890123456789",
      },
    }, 401)) as typeof fetch,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.diagnostic, {
    stage: "session_creation",
    httpStatus: 401,
    code: "190",
    subcode: "460",
    type: "OAuthException",
    traceId: "safe-trace",
    message: "Token access_token=[removido] rejected at [URL removida] [sessao removida] [identificador removido]",
  });
  const serialized = JSON.stringify(result);
  for (const forbidden of ["private-token", "secret.invalid", "private-session", "verylongsecret"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("binary refusal is distinguished from session creation", async () => {
  let call = 0;
  const result = await uploadMetaTemplateExample({
    ...base,
    fetchImpl: (async () => {
      call += 1;
      return call === 1
        ? jsonResponse({ id: "upload:session" })
        : jsonResponse({ error: { code: 10, error_subcode: 99, type: "OAuthException", message: "binary denied", fbtrace_id: "trace-two" } }, 403);
    }) as typeof fetch,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "meta_upload_failed");
  assert.deepEqual(result.diagnostic, {
    stage: "binary_upload",
    httpStatus: 403,
    code: "10",
    subcode: "99",
    type: "OAuthException",
    traceId: "trace-two",
    message: "binary denied",
  });
});

test("empty, invalid and interrupted responses identify validation and read stages", async () => {
  const cases: Array<{ response: Response; stage: string; code: string }> = [
    { response: new Response("", { status: 200 }), stage: "session_response_validation", code: "meta_upload_invalid_response" },
    { response: new Response("not-json", { status: 200 }), stage: "session_response_validation", code: "meta_upload_invalid_response" },
    {
      response: { ok: true, status: 200, text: async () => { throw new Error("interrupted"); } } as unknown as Response,
      stage: "session_response_read",
      code: "meta_upload_result_uncertain",
    },
  ];
  for (const item of cases) {
    const result = await uploadMetaTemplateExample({ ...base, fetchImpl: (async () => item.response) as typeof fetch });
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.code, item.code);
    assert.equal(result.diagnostic.stage, item.stage);
  }
});

test("missing session and media identifiers are diagnosed at response validation", async () => {
  const missingSession = await uploadMetaTemplateExample({
    ...base,
    fetchImpl: (async () => jsonResponse({ accepted: true })) as typeof fetch,
  });
  assert.equal(missingSession.ok, false);
  if (!missingSession.ok) assert.equal(missingSession.diagnostic.stage, "session_response_validation");

  let call = 0;
  const missingHandle = await uploadMetaTemplateExample({
    ...base,
    fetchImpl: (async () => {
      call += 1;
      return call === 1 ? jsonResponse({ id: "upload:session" }) : jsonResponse({ accepted: true });
    }) as typeof fetch,
  });
  assert.equal(missingHandle.ok, false);
  if (!missingHandle.ok) assert.equal(missingHandle.diagnostic.stage, "binary_response_validation");
});

test("binary empty, invalid and interrupted responses preserve their exact stage", async () => {
  const binaryResponses: Array<{ response: Response; stage: string; code: string }> = [
    { response: new Response("", { status: 200 }), stage: "binary_response_validation", code: "meta_upload_invalid_response" },
    { response: new Response("not-json", { status: 200 }), stage: "binary_response_validation", code: "meta_upload_invalid_response" },
    {
      response: { ok: true, status: 200, text: async () => { throw new Error("interrupted"); } } as unknown as Response,
      stage: "binary_response_read",
      code: "meta_upload_result_uncertain",
    },
  ];
  for (const item of binaryResponses) {
    let call = 0;
    const result = await uploadMetaTemplateExample({
      ...base,
      fetchImpl: (async () => {
        call += 1;
        return call === 1 ? jsonResponse({ id: "upload:session" }) : item.response;
      }) as typeof fetch,
    });
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(result.code, item.code);
    assert.equal(result.diagnostic.stage, item.stage);
  }
});

test("transport timeout is uncertain and diagnostics remain isolated", async () => {
  const timeout = await uploadMetaTemplateExample({
    ...base,
    timeoutMs: 5,
    fetchImpl: ((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })) as typeof fetch,
  });
  assert.equal(timeout.ok, false);
  if (!timeout.ok) {
    assert.equal(timeout.code, "meta_upload_result_uncertain");
    assert.equal(timeout.diagnostic.stage, "session_creation");
  }

  let timeoutCall = 0;
  const binaryTimeout = await uploadMetaTemplateExample({
    ...base,
    timeoutMs: 5,
    fetchImpl: ((_: RequestInfo | URL, init?: RequestInit) => {
      timeoutCall += 1;
      if (timeoutCall === 1) return Promise.resolve(jsonResponse({ id: "upload:session" }));
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    }) as typeof fetch,
  });
  assert.equal(binaryTimeout.ok, false);
  if (!binaryTimeout.ok) {
    assert.equal(binaryTimeout.code, "meta_upload_result_uncertain");
    assert.equal(binaryTimeout.diagnostic.stage, "binary_upload");
  }

  const [tenantA, tenantB] = await Promise.all([
    uploadMetaTemplateExample({ ...base, appId: "tenant-a", fetchImpl: (async () => jsonResponse({ error: { code: 10, message: "tenant A" } }, 400)) as typeof fetch }),
    uploadMetaTemplateExample({ ...base, appId: "tenant-b", fetchImpl: (async () => jsonResponse({ error: { code: 20, message: "tenant B" } }, 400)) as typeof fetch }),
  ]);
  assert.equal(tenantA.ok, false);
  assert.equal(tenantB.ok, false);
  if (!tenantA.ok && !tenantB.ok) {
    assert.equal(tenantA.diagnostic.code, "10");
    assert.equal(tenantB.diagnostic.code, "20");
  }
});
