import assert from "node:assert/strict";
import test from "node:test";
import {
  contactOperationalIdentityKeys,
  isOperationallyExcludedContact,
  loadOperationallyExcludedWaIds,
} from "./contactOperationalExclusion.js";

test("contact operational exclusion state comes from Contact.operationallyExcludedAt", async () => {
  const prisma = {
    contact: {
      findMany: async () => [
        {
          waId: "5584951957784",
          externalUserRef: "5584951957784",
          legacyWaId: "5584951957784",
          operationallyExcludedAt: new Date("2026-08-26T10:00:00.000Z"),
        },
      ],
    },
  };

  const excluded = await loadOperationallyExcludedWaIds(prisma, {
    clientId: "client_a",
    waIds: ["5584951957784", "5511951957784"],
  });

  assert.equal(excluded.has("5584951957784"), true);
  assert.equal(excluded.has("5511951957784"), false);
  assert.equal(isOperationallyExcludedContact({ operationallyExcludedAt: null }), false);
  assert.equal(isOperationallyExcludedContact({ operationallyExcludedAt: new Date() }), true);
});

test("contact identity keys use full identities and never phone suffix", () => {
  assert.deepEqual(contactOperationalIdentityKeys({
    waId: "5584951957784",
    externalUserRef: "5584951957784",
    legacyWaId: "5511951957784",
  }), ["5584951957784", "5511951957784"]);
});

test("operational exclusion does not cross-match different DDDs with same final digits", async () => {
  const prisma = {
    contact: {
      findMany: async ({ where }: { where: { OR: Array<Record<string, { in: string[] }>> } }) => {
        const requested = new Set(where.OR.flatMap((clause) => Object.values(clause)[0]?.in ?? []));
        return requested.has("5584951957784")
          ? [
              {
                waId: "5584951957784",
                externalUserRef: "5584951957784",
                legacyWaId: "5584951957784",
                operationallyExcludedAt: new Date("2026-08-26T10:00:00.000Z"),
              },
            ]
          : [];
      },
    },
  };

  const ddd84 = await loadOperationallyExcludedWaIds(prisma, {
    clientId: "client_a",
    waIds: ["5584951957784"],
  });
  const ddd11 = await loadOperationallyExcludedWaIds(prisma, {
    clientId: "client_a",
    waIds: ["5511951957784"],
  });

  assert.equal(ddd84.has("5584951957784"), true);
  assert.equal(ddd11.has("5511951957784"), false);
});

test("event deletion or anonymization cannot change Contact operational exclusion state", async () => {
  const prisma = {
    contact: {
      findMany: async () => [
        {
          waId: "5584951957784",
          externalUserRef: "5584951957784",
          legacyWaId: "5584951957784",
          operationallyExcludedAt: new Date("2026-08-26T10:00:00.000Z"),
        },
      ],
    },
  };

  const excluded = await loadOperationallyExcludedWaIds(prisma, {
    clientId: "client_a",
    waIds: ["5584951957784"],
  });

  assert.equal(excluded.has("5584951957784"), true);
});
