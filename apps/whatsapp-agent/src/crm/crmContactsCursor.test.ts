import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { CrmContactsCursorError, selectCrmContactsPage } from "./crmContactsReadModel.js";

function row(index: number) {
  return {
    id: `lead-${String(index).padStart(4, "0")}`,
    updatedAt: new Date(`2026-10-20T12:${String(59 - Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`),
    createdAt: new Date(`2026-10-19T12:00:${String(index % 60).padStart(2, "0")}.000Z`),
  };
}

function reader(pageRows: ReturnType<typeof row>[], total = 620) {
  const queries: Prisma.Sql[] = [];
  return {
    queries,
    prisma: {
      $queryRaw: async (query: Prisma.Sql) => {
        queries.push(query);
        return query.strings.join(" ").includes("count(*)") ? [{ total: BigInt(total) }] : pageRows;
      },
    },
  };
}

test("keyset page reads limit plus one, emits an opaque filter-bound cursor, and preserves exact totals", async () => {
  const firstReader = reader(Array.from({ length: 51 }, (_, index) => row(index)));
  const first = await selectCrmContactsPage(firstReader.prisma as never, {
    clientId: "00000000-0000-0000-0000-000000000001",
    query: { page: 1, limit: 50, operationalStatus: "active" },
    includeAnonymized: false,
  });
  assert.equal(first.rows.length, 50);
  assert.equal(first.total, 620);
  assert.equal(first.hasNextPage, true);
  assert.ok(first.nextCursor);
  const cursorBody = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(cursorBody).sort(), ["createdAt", "filterHash", "id", "page", "updatedAt", "v"]);
  assert.equal(
    firstReader.queries[0].values[firstReader.queries[0].values.length - 1],
    51
  );
  assert.match(firstReader.queries[0].strings.join(" "), /tenantId/);

  const secondReader = reader(Array.from({ length: 50 }, (_, index) => row(index + 50)));
  const second = await selectCrmContactsPage(secondReader.prisma as never, {
    clientId: "00000000-0000-0000-0000-000000000001",
    query: { page: 2, limit: 50, cursor: first.nextCursor, operationalStatus: "active" },
    includeAnonymized: false,
  });
  assert.equal(second.page, 2);
  assert.equal(second.hasPreviousPage, true);
  assert.match(secondReader.queries[0].strings.join(" "), /updatedAt/);

  await assert.rejects(
    selectCrmContactsPage(reader([]).prisma as never, {
      clientId: "00000000-0000-0000-0000-000000000001",
      query: { page: 2, limit: 50, cursor: first.nextCursor, q: "changed" },
      includeAnonymized: false,
    }),
    CrmContactsCursorError
  );
});

test("malformed cursors and offset-only requests fail closed", async () => {
  await assert.rejects(
    selectCrmContactsPage(reader([]).prisma as never, {
      clientId: "00000000-0000-0000-0000-000000000001",
      query: { page: 2, limit: 50 },
      includeAnonymized: false,
    }),
    CrmContactsCursorError
  );
  await assert.rejects(
    selectCrmContactsPage(reader([]).prisma as never, {
      clientId: "00000000-0000-0000-0000-000000000001",
      query: { page: 2, limit: 50, cursor: "not-json" },
      includeAnonymized: false,
    }),
    CrmContactsCursorError
  );
});
