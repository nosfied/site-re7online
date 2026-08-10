import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { TrainingContentStatus, TrainingContentType } from "@prisma/client";
import {
  createTrainingContentAdmin,
  deleteTrainingContentAdmin,
  listTrainingContentAdmin,
  replaceTrainingContentFileAdmin,
  resolveTrainingContentFromDb,
  serializeTrainingCatalogFromDb,
  TrainingContentError,
} from "./trainingContentAdmin.js";

type Row = {
  id: string;
  contentId: string;
  type: TrainingContentType;
  title: string;
  description: string | null;
  category: string;
  sortOrder: number;
  status: TrainingContentStatus;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  downloadable: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function createPrismaMock() {
  const rows: Row[] = [];
  return {
    rows,
    prisma: {
      trainingContent: {
        findUnique: async ({ where }: { where: { id?: string; contentId?: string } }) =>
          rows.find((row) => (where.id ? row.id === where.id : row.contentId === where.contentId)) ?? null,
        findMany: async ({ where }: { where?: { status?: TrainingContentStatus } } = {}) =>
          rows
            .filter((row) => !where?.status || row.status === where.status)
            .sort((a, b) => a.category.localeCompare(b.category) || a.sortOrder - b.sortOrder || a.title.localeCompare(b.title)),
        create: async ({ data }: { data: Partial<Row> }) => {
          const now = new Date();
          const row: Row = {
            id: `training-${rows.length + 1}`,
            contentId: String(data.contentId),
            type: data.type as TrainingContentType,
            title: String(data.title),
            description: data.description ?? null,
            category: String(data.category),
            sortOrder: Number(data.sortOrder ?? 0),
            status: data.status as TrainingContentStatus,
            storageKey: String(data.storageKey),
            originalFilename: String(data.originalFilename),
            mimeType: String(data.mimeType),
            sizeBytes: Number(data.sizeBytes),
            downloadable: Boolean(data.downloadable),
            publishedAt: data.publishedAt ?? null,
            createdAt: now,
            updatedAt: now,
          };
          rows.push(row);
          return row;
        },
        update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
          const index = rows.findIndex((row) => row.id === where.id);
          assert.notEqual(index, -1);
          rows[index] = { ...rows[index], ...data, updatedAt: new Date() } as Row;
          return rows[index];
        },
        delete: async ({ where }: { where: { id: string } }) => {
          const index = rows.findIndex((row) => row.id === where.id);
          assert.notEqual(index, -1);
          return rows.splice(index, 1)[0];
        },
      },
    },
  };
}

async function withTrainingRoot(fn: (root: string) => Promise<void>) {
  const previous = process.env.TRAINING_CONTENT_ROOT;
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "training-content-"));
  process.env.TRAINING_CONTENT_ROOT = root;
  try {
    await fn(root);
  } finally {
    process.env.TRAINING_CONTENT_ROOT = previous;
    await fs.rm(root, { recursive: true, force: true });
  }
}

const pdfFile = {
  fileName: "guia.pdf",
  mimeType: "application/pdf",
  content: Buffer.from("%PDF-1.4\nconteudo"),
};

test("createTrainingContentAdmin stores PDF and published catalog exposes sanitized item", async () => {
  await withTrainingRoot(async () => {
    const { prisma } = createPrismaMock();
    const created = await createTrainingContentAdmin(prisma as any, {
      title: "Guia do operador",
      category: "Caixa de entrada",
      type: "PDF",
      sortOrder: "3",
      status: "PUBLISHED",
      downloadable: "true",
    }, pdfFile);

    assert.equal(created.item.status, "PUBLISHED");
    assert.equal(created.item.contentId, "guia-do-operador");
    assert.equal((created.item as Record<string, unknown>).storageKey, undefined);

    const catalog = await serializeTrainingCatalogFromDb(prisma as any);
    assert.equal(catalog.sections.length, 1);
    assert.equal(catalog.sections[0]?.items[0]?.contentId, "guia-do-operador");
    assert.equal("storageKey" in (catalog.sections[0]?.items[0] ?? {}), false);
  });
});

test("draft content does not appear and cannot be served through app resolver", async () => {
  await withTrainingRoot(async () => {
    const { prisma } = createPrismaMock();
    const created = await createTrainingContentAdmin(prisma as any, {
      title: "Rascunho interno",
      category: "Primeiros passos",
      type: "PDF",
      status: "DRAFT",
    }, pdfFile);

    const catalog = await serializeTrainingCatalogFromDb(prisma as any);
    assert.equal(catalog.sections.length, 0);
    await assert.rejects(
      () => resolveTrainingContentFromDb({ prisma: prisma as any, contentId: created.item.contentId }),
      (error: unknown) => error instanceof TrainingContentError && error.status === 404
    );
  });
});

test("invalid MIME or magic bytes are rejected", async () => {
  await withTrainingRoot(async () => {
    const { prisma } = createPrismaMock();
    await assert.rejects(
      () => createTrainingContentAdmin(prisma as any, {
        title: "Arquivo falso",
        category: "Relatórios",
        type: "PDF",
      }, {
        fileName: "fake.pdf",
        mimeType: "application/pdf",
        content: Buffer.from("not a pdf"),
      }),
      (error: unknown) => error instanceof TrainingContentError && error.code === "training_file_invalid"
    );
  });
});

test("replace and delete keep metadata functional and remove records", async () => {
  await withTrainingRoot(async () => {
    const { prisma, rows } = createPrismaMock();
    const created = await createTrainingContentAdmin(prisma as any, {
      title: "Guia para substituir",
      category: "Configurações",
      type: "PDF",
      status: "PUBLISHED",
    }, pdfFile);
    const beforeStorageKey = rows[0]?.storageKey;
    const replaced = await replaceTrainingContentFileAdmin(prisma as any, created.item.id, {
      fileName: "novo.pdf",
      mimeType: "application/pdf",
      content: Buffer.from("%PDF-1.7\nnovo"),
    });
    assert.notEqual(rows[0]?.storageKey, beforeStorageKey);
    assert.equal(replaced.item.originalFilename, "novo.pdf");

    const listed = await listTrainingContentAdmin(prisma as any);
    assert.equal(listed.items.length, 1);
    await deleteTrainingContentAdmin(prisma as any, created.item.id);
    assert.equal(rows.length, 0);
  });
});
