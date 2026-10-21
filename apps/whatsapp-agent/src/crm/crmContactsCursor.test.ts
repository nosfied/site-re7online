import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { CrmContactsCursorError, selectCrmContactsPage } from "./crmContactsReadModel.js";

function row(index: number) {
  return {
    id: `lead-${String(index).padStart(4, "0")}`,
    updatedAt: new Date(`2026-10-20T12:${String(59 - Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`),
    createdAt: new Date(`2026-10-19T12:00:${String(index % 60).padStart(2, "0")}.000Z`),
    scopeTotal: BigInt(620),
  };
}

function reader(pageRows: ReturnType<typeof row>[], total = 620) {
  const queries: Prisma.Sql[] = [];
  return {
    queries,
    prisma: {
      $queryRaw: async (query: Prisma.Sql) => {
        queries.push(query);
        return pageRows.length > 0
          ? pageRows.map((item) => ({ ...item, scopeTotal: BigInt(total) }))
          : [{ id: null, updatedAt: null, createdAt: null, scopeTotal: BigInt(total) }];
      },
    },
  };
}

const tenantA = "00000000-0000-0000-0000-000000000001";
const tenantB = "00000000-0000-0000-0000-000000000002";

test("keyset sequence reads limit plus one, accepts normalized filters, and preserves three pages", async () => {
  const firstReader = reader(Array.from({ length: 51 }, (_, index) => row(index)));
  const first = await selectCrmContactsPage(firstReader.prisma as never, {
    clientId: tenantA,
    query: { page: 1, limit: 50, q: " Test ", status: "qualified", channel: "WHATSAPP", hasConversation: "1", operationalStatus: "active" },
    includeAnonymized: false,
  });
  assert.equal(first.rows.length, 50);
  assert.equal(first.total, 620);
  assert.equal(firstReader.queries.length, 1);
  assert.equal(first.hasNextPage, true);
  assert.ok(first.nextCursor);
  const cursorBody = JSON.parse(Buffer.from(first.nextCursor, "base64url").toString("utf8")) as Record<string, unknown>;
  assert.deepEqual(Object.keys(cursorBody).sort(), ["contextHash", "createdAt", "id", "page", "updatedAt", "v"]);
  assert.equal(
    firstReader.queries[0].values[firstReader.queries[0].values.length - 1],
    51
  );
  assert.match(firstReader.queries[0].strings.join(" "), /tenantId/);
  assert.match(firstReader.queries[0].strings.join(" "), /contact_alias_facts AS MATERIALIZED/);
  assert.match(firstReader.queries[0].strings.join(" "), /SELECT count\(\*\) AS "scopeTotal" FROM eligible_leads/);
  assert.match(firstReader.queries[0].strings.join(" "), /LEFT JOIN LATERAL/);
  assert.match(
    firstReader.queries[0].strings.join(" "),
    /\) page ON true\s+ORDER BY\s+page\."updatedAt" DESC NULLS LAST,\s+page\."createdAt" DESC NULLS LAST,\s+page\.id ASC NULLS LAST/
  );

  const secondReader = reader(Array.from({ length: 51 }, (_, index) => row(index + 50)));
  const second = await selectCrmContactsPage(secondReader.prisma as never, {
    clientId: tenantA,
    query: { page: 2, limit: 50, cursor: first.nextCursor, q: "Test", status: "QUALIFIED", channel: "whatsapp", hasConversation: true, operationalStatus: "active" },
    includeAnonymized: false,
  });
  assert.equal(second.page, 2);
  assert.equal(second.hasPreviousPage, true);
  assert.match(secondReader.queries[0].strings.join(" "), /updatedAt/);

  assert.ok(second.nextCursor);
  const third = await selectCrmContactsPage(reader(Array.from({ length: 20 }, (_, index) => row(index + 100))).prisma as never, {
    clientId: tenantA,
    query: { page: 3, limit: 50, cursor: second.nextCursor, q: "Test", status: "QUALIFIED", channel: "whatsapp", hasConversation: true, operationalStatus: "active" },
    includeAnonymized: false,
  });
  assert.equal(third.page, 3);
  assert.equal(third.rows.length, 20);
});

test("empty cursor page preserves the exact eligible total without creating a contact", async () => {
  const first = await selectCrmContactsPage(reader(Array.from({ length: 51 }, (_, index) => row(index)), 51).prisma as never, {
    clientId: tenantA,
    query: { page: 1, limit: 50 },
    includeAnonymized: false,
  });
  assert.ok(first.nextCursor);

  const emptyPageReader = reader([], 50);
  const emptyPage = await selectCrmContactsPage(emptyPageReader.prisma as never, {
    clientId: tenantA,
    query: { page: 2, limit: 50, cursor: first.nextCursor },
    includeAnonymized: false,
  });

  assert.equal(emptyPage.page, 2);
  assert.deepEqual(emptyPage.rows, []);
  assert.equal(emptyPage.total, 50);
  assert.equal(emptyPage.hasNextPage, false);
  assert.equal(emptyPage.nextCursor, null);
  assert.equal(emptyPageReader.queries.length, 1);
});

test("cursor context denies cross-tenant, limit, visibility, page and filter changes", async () => {
  const first = await selectCrmContactsPage(reader(Array.from({ length: 51 }, (_, index) => row(index))).prisma as never, {
    clientId: tenantA,
    query: { page: 1, limit: 50, q: "stable", operationalStatus: "active" },
    includeAnonymized: false,
  });
  assert.ok(first.nextCursor);

  for (const changed of [
    { clientId: tenantB, query: { page: 2, limit: 50, cursor: first.nextCursor, q: "stable", operationalStatus: "active" }, includeAnonymized: false },
    { clientId: tenantA, query: { page: 2, limit: 25, cursor: first.nextCursor, q: "stable", operationalStatus: "active" }, includeAnonymized: false },
    { clientId: tenantA, query: { page: 2, limit: 50, cursor: first.nextCursor, q: "stable", operationalStatus: "active" }, includeAnonymized: true },
    { clientId: tenantA, query: { page: 3, limit: 50, cursor: first.nextCursor, q: "stable", operationalStatus: "active" }, includeAnonymized: false },
    { clientId: tenantA, query: { page: 2, limit: 50, cursor: first.nextCursor, q: "changed", operationalStatus: "active" }, includeAnonymized: false },
  ] as const) {
    await assert.rejects(selectCrmContactsPage(reader([]).prisma as never, {
      clientId: changed.clientId,
      query: changed.query,
      includeAnonymized: changed.includeAnonymized,
    }), CrmContactsCursorError);
  }
});

test("malformed cursors and offset-only requests fail closed", async () => {
  await assert.rejects(
    selectCrmContactsPage(reader([]).prisma as never, {
      clientId: tenantA,
      query: { page: 2, limit: 50 },
      includeAnonymized: false,
    }),
    CrmContactsCursorError
  );
  await assert.rejects(
    selectCrmContactsPage(reader([]).prisma as never, {
      clientId: tenantA,
      query: { page: 2, limit: 50, cursor: "not-json" },
      includeAnonymized: false,
    }),
    CrmContactsCursorError
  );
});
