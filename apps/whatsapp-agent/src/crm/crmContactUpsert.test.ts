import assert from "node:assert/strict";
import test from "node:test";
import { previewCrmContactCsvImport } from "./crmContactUpsert.js";

test("CRM CSV preview blocks operationally excluded contacts without creating duplicates", async () => {
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

  const preview = await previewCrmContactCsvImport(prisma as never, {
    clientId: "client_a",
    csvText: "phone,name\n5584951957784,Ediane\n",
    mapping: { phoneColumn: "phone", nameColumn: "name" },
  });

  assert.equal(preview.validRows, 1);
  assert.equal(preview.excludedContacts, 1);
  assert.equal(preview.readyToImport, 0);
  assert.equal(preview.sampleErrors[0]?.reason, "excluded_contact");
  assert.equal(preview.sampleErrors[0]?.label, "Contato excluído da operação");
});
