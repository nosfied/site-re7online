import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import {
  buildMonthlyReceptiveSessionCsv,
  buildMonthlyReceptiveSessionCsvFileName,
  buildMonthlyReceptiveSessionReport,
  parseReceptiveSessionUnitPrice,
} from "./receptiveSessionReport.js";
import { RECEPTIVE_SESSION_EVENT_TYPE, RECEPTIVE_SESSION_METER_VERSION } from "./receptiveSessionMeter.js";

type FakeEvent = {
  id: string;
  requestId: string | null;
  messageId: string | null;
  waIdCanonical: string | null;
  eventName: string;
  payloadJson: Prisma.JsonValue;
  createdAt: Date;
};

function event(id: string, startedAt: string, payload: Partial<Record<string, unknown>> = {}): FakeEvent {
  return {
    id,
    requestId: `request-${id}`,
    messageId: `inbound-${id}`,
    waIdCanonical: "5581999990000",
    eventName: RECEPTIVE_SESSION_EVENT_TYPE,
    createdAt: new Date(startedAt),
    payloadJson: {
      billingType: "receptive_session",
      channel: "whatsapp",
      provider: "meta_cloud",
      sessionStartedAt: startedAt,
      sessionEndsAt: new Date(new Date(startedAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      sourceInboundMessageId: `inbound-${id}`,
      providerMessageId: `wamid-${id}`,
      waIdMasked: "***0000",
      meterVersion: RECEPTIVE_SESSION_METER_VERSION,
      ...payload,
    },
  };
}

function fakePrisma(events: FakeEvent[]) {
  return {
    event: {
      async findMany(args: { where: Record<string, unknown>; orderBy: { createdAt: "asc" | "desc" } }) {
        const where = args.where as { eventName?: string; createdAt?: { gte?: Date; lt?: Date } };
        return events
          .filter((item) => {
            if (where.eventName && item.eventName !== where.eventName) return false;
            if (where.createdAt?.gte && item.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lt && item.createdAt >= where.createdAt.lt) return false;
            return true;
          })
          .sort((a, b) =>
            args.orderBy.createdAt === "asc"
              ? a.createdAt.getTime() - b.createdAt.getTime()
              : b.createdAt.getTime() - a.createdAt.getTime()
          );
      },
    },
  };
}

test("monthly receptive session report attributes sessions by session start month", async () => {
  const report = await buildMonthlyReceptiveSessionReport({
    prisma: fakePrisma([
      event("aug-last", "2026-08-31T23:50:00.000Z"),
      event("sep-first", "2026-09-01T00:10:00.000Z"),
    ]),
    clientId: "tenant-1",
    tenantKey: "cra-pr",
    tenantName: "CRA PR",
    month: "2026-08",
    now: new Date("2026-09-02T00:00:00.000Z"),
    unitPrice: "0,005",
    currency: "BRL",
  });

  assert.equal(report.ok, true);
  assert.equal(report.reportType, "receptive_sessions_monthly");
  assert.equal(report.summary.sessionCount, 1);
  assert.equal(report.unitPrice, 0.005);
  assert.equal(report.total, 0.005);
  assert.equal(report.rows[0]?.sessionStartedAt, "2026-08-31T23:50:00.000Z");
  assert.equal(JSON.stringify(report).includes("5581999990000"), false);
});

test("monthly receptive session CSV exports audit evidence and summary", async () => {
  const report = await buildMonthlyReceptiveSessionReport({
    prisma: fakePrisma([event("one", "2026-08-10T10:00:00.000Z")]),
    clientId: "tenant-1",
    tenantKey: "Tenant Key!",
    month: "2026-08",
    unitPrice: 0.005,
  });
  const csv = buildMonthlyReceptiveSessionCsv(report);

  assert.match(csv, /^sessionStartedAt,sessionEndsAt,channel,provider,maskedContact,sourceInboundMessageId,providerMessageId,meterVersion,unitPrice,currency\n/);
  assert.match(csv, /2026-08-10T10:00:00.000Z/);
  assert.match(csv, /SUMMARY,2026-08,sessionCount,1,total,0.005,,/);
  assert.equal(csv.includes("5581999990000"), false);
  assert.equal(buildMonthlyReceptiveSessionCsvFileName({ tenantKey: "Tenant Key!", month: "2026-08" }), "receptive-sessions-tenant-key-2026-08.csv");
});

test("unit price parsing is optional and not hardcoded", () => {
  assert.equal(parseReceptiveSessionUnitPrice(null), null);
  assert.equal(parseReceptiveSessionUnitPrice(""), null);
  assert.equal(parseReceptiveSessionUnitPrice("0,005"), 0.005);
  assert.equal(parseReceptiveSessionUnitPrice("invalid"), null);
});
