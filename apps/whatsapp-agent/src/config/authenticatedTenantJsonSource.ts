import crypto from "node:crypto";
import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type { TenantConfig } from "./tenantConfig.js";

export async function readAuthenticatedTenantJsonSource(params: {
  source: string;
  expectedSha256: string;
}): Promise<Record<string, TenantConfig>> {
  if (!path.isAbsolute(params.source)) throw new Error("source_must_be_absolute");
  if (!/^[a-f0-9]{64}$/i.test(params.expectedSha256)) throw new Error("expected_source_sha256_required");
  const before = await fs.lstat(params.source);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("source_not_regular");
  if (before.uid !== process.getuid?.()) throw new Error("source_owner_mismatch");
  if ((before.mode & 0o022) !== 0) throw new Error("source_permissions_insecure");
  const handle = await fs.open(params.source, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error("source_identity_changed");
    }
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size ||
        after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
      throw new Error("source_changed_during_read");
    }
    const actual = crypto.createHash("sha256").update(bytes).digest("hex");
    if (actual !== params.expectedSha256.toLowerCase()) throw new Error("source_sha256_mismatch");
    const parsed = JSON.parse(bytes.toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("source_invalid_shape");
    return parsed as Record<string, TenantConfig>;
  } finally {
    await handle.close();
  }
}
