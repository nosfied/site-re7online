import fs from "node:fs/promises";
import path from "node:path";
import { getPrisma } from "../db.js";
import { getTemplateMediaRoot, removeUnreferencedTemplateMedia } from "./templateMediaStorage.js";

export type TemplateMediaCleanupResult = {
  dryRun: boolean;
  examined: number;
  eligible: number;
  removed: number;
  skippedReferenced: number;
  failed: number;
};

export async function cleanupOrphanTemplateMedia(params: {
  dryRun: boolean;
  olderThan: Date;
  clientId?: string;
}): Promise<TemplateMediaCleanupResult> {
  const prisma = getPrisma();
  const candidates = await prisma.templateMediaAsset.findMany({
    where: {
      ...(params.clientId ? { clientId: params.clientId } : {}),
      state: "stored",
      createdAt: { lt: params.olderThan },
      templates: { none: {} },
      templateRequests: { none: {} },
      campaigns: { none: {} },
    },
    select: { id: true, clientId: true, storageKey: true },
    orderBy: [{ clientId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const result: TemplateMediaCleanupResult = {
    dryRun: params.dryRun,
    examined: candidates.length,
    eligible: candidates.length,
    removed: 0,
    skippedReferenced: 0,
    failed: 0,
  };
  if (params.dryRun) return result;

  for (const candidate of candidates) {
    try {
      const claimed = await prisma.templateMediaAsset.updateMany({
        where: {
          id: candidate.id,
          clientId: candidate.clientId,
          state: "stored",
          templates: { none: {} },
          templateRequests: { none: {} },
          campaigns: { none: {} },
        },
        data: { state: "cleanup_pending" },
      });
      if (claimed.count !== 1) {
        result.skippedReferenced += 1;
        continue;
      }
      const observed = await prisma.templateMediaAsset.findFirst({
        where: { id: candidate.id, clientId: candidate.clientId },
        select: { _count: { select: { templates: true, templateRequests: true, campaigns: true } } },
      });
      if (!observed || observed._count.templates || observed._count.templateRequests || observed._count.campaigns) {
        await prisma.templateMediaAsset.updateMany({
          where: { id: candidate.id, clientId: candidate.clientId, state: "cleanup_pending" },
          data: { state: "stored" },
        });
        result.skippedReferenced += 1;
        continue;
      }
      const root = getTemplateMediaRoot();
      const absolute = path.resolve(root, candidate.storageKey);
      const stats = await fs.lstat(absolute).catch(() => null);
      if (stats?.isSymbolicLink()) throw new Error("symlink_denied");
      await removeUnreferencedTemplateMedia(candidate.storageKey);
      await prisma.templateMediaAsset.updateMany({
        where: { id: candidate.id, clientId: candidate.clientId, state: "cleanup_pending" },
        data: { state: "deleted" },
      });
      result.removed += 1;
    } catch {
      result.failed += 1;
      await prisma.templateMediaAsset.updateMany({
        where: { id: candidate.id, clientId: candidate.clientId, state: "cleanup_pending" },
        data: { state: "cleanup_failed" },
      }).catch(() => undefined);
    }
  }
  return result;
}
