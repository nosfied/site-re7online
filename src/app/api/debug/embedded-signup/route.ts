import { appendFile } from "node:fs/promises";

export const runtime = "nodejs";

const DEBUG_LOG_PATH = "/tmp/re7-embedded-signup-events.log";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const line = JSON.stringify({
      receivedAt: new Date().toISOString(),
      body,
    });
    await appendFile(DEBUG_LOG_PATH, `${line}\n`, "utf8");
    console.log("[embedded-signup-debug]", line);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[embedded-signup-debug] persist failed", error);
    return Response.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
