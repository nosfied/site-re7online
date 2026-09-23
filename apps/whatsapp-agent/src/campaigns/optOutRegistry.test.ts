import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTACT_OPT_OUT_RECORDED_EVENT,
  CONTACT_OPT_OUT_REVOKED_EVENT,
  getActiveOptOutsForRecipients,
} from "./optOutRegistry.js";

function prismaWithEvents(events: Array<{
  waId: string | null;
  waIdCanonical: string | null;
  eventName: string;
  createdAt: Date;
}>) {
  return {
    event: {
      findMany: async (args: {
        where: {
          OR?: Array<{ waIdCanonical?: { in: string[] }; waId?: { in: string[] } }>;
        };
      }) => {
        const canonicalLookup = new Set(args.where.OR?.[0]?.waIdCanonical?.in ?? []);
        const rawLookup = new Set(args.where.OR?.[1]?.waId?.in ?? []);
        return events.filter((event) => {
          return (
            (event.waIdCanonical ? canonicalLookup.has(event.waIdCanonical) : false) ||
            (event.waId ? rawLookup.has(event.waId) : false)
          );
        });
      },
    },
  };
}

test("opt-out blocks Brazilian 12/13 digit aliases", async () => {
  const active = await getActiveOptOutsForRecipients(prismaWithEvents([
    {
      waId: "5511949806683",
      waIdCanonical: "5511949806683",
      eventName: CONTACT_OPT_OUT_RECORDED_EVENT,
      createdAt: new Date("2026-09-23T10:00:00.000Z"),
    },
  ]) as never, {
    clientId: "tenant",
    waIds: ["551149806683"],
  });

  assert.equal(active.has("551149806683"), true);

  const reverse = await getActiveOptOutsForRecipients(prismaWithEvents([
    {
      waId: "551149806683",
      waIdCanonical: "551149806683",
      eventName: CONTACT_OPT_OUT_RECORDED_EVENT,
      createdAt: new Date("2026-09-23T10:00:00.000Z"),
    },
  ]) as never, {
    clientId: "tenant",
    waIds: ["5511949806683"],
  });

  assert.equal(reverse.has("5511949806683"), true);
});

test("opt-out revocation on alias shape wins by latest event", async () => {
  const revoked = await getActiveOptOutsForRecipients(prismaWithEvents([
    {
      waId: "5511949806683",
      waIdCanonical: "5511949806683",
      eventName: CONTACT_OPT_OUT_RECORDED_EVENT,
      createdAt: new Date("2026-09-23T10:00:00.000Z"),
    },
    {
      waId: "551149806683",
      waIdCanonical: "551149806683",
      eventName: CONTACT_OPT_OUT_REVOKED_EVENT,
      createdAt: new Date("2026-09-23T10:05:00.000Z"),
    },
  ]) as never, {
    clientId: "tenant",
    waIds: ["5511949806683"],
  });

  assert.equal(revoked.has("5511949806683"), false);

  const recordedAgain = await getActiveOptOutsForRecipients(prismaWithEvents([
    {
      waId: "551149806683",
      waIdCanonical: "551149806683",
      eventName: CONTACT_OPT_OUT_REVOKED_EVENT,
      createdAt: new Date("2026-09-23T10:00:00.000Z"),
    },
    {
      waId: "5511949806683",
      waIdCanonical: "5511949806683",
      eventName: CONTACT_OPT_OUT_RECORDED_EVENT,
      createdAt: new Date("2026-09-23T10:05:00.000Z"),
    },
  ]) as never, {
    clientId: "tenant",
    waIds: ["551149806683"],
  });

  assert.equal(recordedAgain.has("551149806683"), true);
});
