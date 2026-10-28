import assert from "node:assert/strict";
import crypto from "node:crypto";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readAuthenticatedTenantJsonSource } from "./authenticatedTenantJsonSource.js";

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "re7-tenant-source-"));
  const source = path.join(directory, "tenants.json");
  const bytes = Buffer.from(JSON.stringify({ tendencia: { id: "tendencia" } }));
  await writeFile(source, bytes, { mode: 0o600 });
  return {
    directory,
    source,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

test("authenticated tenant source requires absolute stable private regular file and exact hash", async (t) => {
  const item = await fixture();
  t.after(() => rm(item.directory, { recursive: true, force: true }));
  const parsed = await readAuthenticatedTenantJsonSource({ source: item.source, expectedSha256: item.sha256 });
  assert.equal(parsed.tendencia.id, "tendencia");
  await assert.rejects(
    readAuthenticatedTenantJsonSource({ source: item.source, expectedSha256: "0".repeat(64) }),
    /source_sha256_mismatch/
  );
  await chmod(item.source, 0o622);
  await assert.rejects(
    readAuthenticatedTenantJsonSource({ source: item.source, expectedSha256: item.sha256 }),
    /source_permissions_insecure/
  );
});

test("authenticated tenant source denies symlinks", async (t) => {
  const item = await fixture();
  t.after(() => rm(item.directory, { recursive: true, force: true }));
  const link = path.join(item.directory, "tenants-link.json");
  await symlink(item.source, link);
  await assert.rejects(
    readAuthenticatedTenantJsonSource({ source: link, expectedSha256: item.sha256 }),
    /source_not_regular/
  );
});
