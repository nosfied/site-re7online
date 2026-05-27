import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_RETENTION_DAYS = 7;
const MEDIA_ROOT = path.resolve(process.cwd(), ".data", "media", "outbound");

function log(level, payload) {
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(`${JSON.stringify({ level, ...payload })}\n`);
}

function parseBooleanEnv(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  log("warn", {
    event: "media.cleanup.env_invalid",
    name: "MEDIA_LOCAL_CLEANUP_ENABLED",
    value,
    fallback,
  });
  return fallback;
}

function parseRetentionDays() {
  const raw = process.env.MEDIA_LOCAL_RETENTION_DAYS;
  if (raw === undefined || raw === null || String(raw).trim() === "") return DEFAULT_RETENTION_DAYS;
  const parsed = Number(String(raw).trim());
  if (!Number.isFinite(parsed) || parsed < 1) {
    log("warn", {
      event: "media.cleanup.env_invalid",
      name: "MEDIA_LOCAL_RETENTION_DAYS",
      value: raw,
      fallback: DEFAULT_RETENTION_DAYS,
    });
    return DEFAULT_RETENTION_DAYS;
  }
  return Math.floor(parsed);
}

function assertSafeMediaRoot(baseDir) {
  const normalized = path.normalize(baseDir);
  const expectedSegment = path.join(".data", "media", "outbound");
  if (!normalized.includes(expectedSegment)) {
    throw new Error(`Unsafe media cleanup root: ${baseDir}`);
  }
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function cleanupDirectory(dir, cutoffMs, stats, isRoot = false) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    stats.errors += 1;
    log("error", {
      event: "media.cleanup.dir_failed",
      path: dir,
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      stats.skipped += 1;
      continue;
    }

    if (entry.isDirectory()) {
      await cleanupDirectory(target, cutoffMs, stats);
      continue;
    }

    if (!entry.isFile()) {
      stats.skipped += 1;
      continue;
    }

    stats.totalScanned += 1;
    try {
      const fileStats = await fs.lstat(target);
      if (!fileStats.isFile() || fileStats.mtimeMs >= cutoffMs) continue;
      await fs.unlink(target);
      stats.totalDeleted += 1;
      stats.bytesDeleted += fileStats.size;
    } catch (error) {
      stats.errors += 1;
      log("error", {
        event: "media.cleanup.file_failed",
        path: target,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (isRoot) return;
  try {
    await fs.rmdir(dir);
    stats.emptyDirsDeleted += 1;
  } catch {
    // Directory is not empty or disappeared concurrently; both are acceptable.
  }
}

async function main() {
  const enabled = parseBooleanEnv(process.env.MEDIA_LOCAL_CLEANUP_ENABLED, true);
  const retentionDays = parseRetentionDays();
  const baseDir = MEDIA_ROOT;
  assertSafeMediaRoot(baseDir);

  if (!enabled) {
    log("info", {
      event: "media.cleanup.skipped",
      reason: "disabled",
      retentionDays,
      baseDir,
    });
    return;
  }

  const stats = {
    totalScanned: 0,
    totalDeleted: 0,
    bytesDeleted: 0,
    emptyDirsDeleted: 0,
    skipped: 0,
    errors: 0,
  };

  if (!(await pathExists(baseDir))) {
    log("info", {
      event: "media.cleanup.completed",
      retentionDays,
      baseDir,
      ...stats,
    });
    return;
  }

  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  await cleanupDirectory(baseDir, cutoffMs, stats, true);

  log(stats.errors > 0 ? "warn" : "info", {
    event: "media.cleanup.completed",
    retentionDays,
    baseDir,
    ...stats,
  });

  if (stats.errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  log("error", {
    event: "media.cleanup.failed",
    baseDir: MEDIA_ROOT,
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
