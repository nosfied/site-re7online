#!/usr/bin/env node
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env" });

const prisma = new PrismaClient();
const clientKey = process.argv.includes("--client-key")
  ? process.argv[process.argv.indexOf("--client-key") + 1]
  : "";
const immutablePrivacyAuditEvents = [
  "conversation.deleted",
  "conversation.anonymized",
  "retention.executed",
  "conversation.reactivated_after_retention",
];

function maskPersonalWaId(value) {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 8) return `${digits.slice(0, 4)}******${digits.slice(-4)}`;
  if (raw.length <= 4) return "******";
  return `${raw.slice(0, 2)}******${raw.slice(-2)}`;
}

function buildAnonymizedWaId(conversation) {
  const masked = maskPersonalWaId(conversation.waId);
  return masked.includes("*")
    ? `${masked}:${conversation.id.slice(0, 8)}`
    : `anon:${conversation.id.slice(0, 12)}`;
}

function auditPayload(clientId, retentionDays, cutoff, result) {
  return {
    userId: "system",
    clientId,
    conversationId: null,
    timestamp: new Date().toISOString(),
    action: "retention.executed",
    details: {
      retentionDays,
      cutoff: cutoff.toISOString(),
      action: "soft_delete_anonymize",
      softDeletedConversations: result.softDeletedConversations,
      anonymizedConversations: result.anonymizedConversations,
      source: "script",
    },
  };
}

function conversationWaValues(conversation) {
  return Array.from(new Set([conversation.waId, conversation.waIdCanonical].filter(Boolean)));
}

async function anonymizeAndSoftDeleteConversation(client, conversation) {
  const now = new Date();
  const anonymizedWaId = buildAnonymizedWaId(conversation);
  const anonymizedName = "Usuario Anonimizado";
  const waIds = conversationWaValues(conversation);

  const [conversationUpdate, runtimeStates, inbound, outbound, contacts, leads, events] =
    await prisma.$transaction([
      prisma.conversation.updateMany({
        where: { clientId: client.id, id: conversation.id },
        data: {
          waId: anonymizedWaId,
          waIdCanonical: anonymizedWaId,
          anonymizedAt: now,
          deletedAt: now,
          closedAt: now,
          departmentId: null,
        },
      }),
      prisma.conversationRuntimeState.updateMany({
        where: {
          clientId: client.id,
          OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
        },
        data: {
          waId: anonymizedWaId,
          waIdCanonical: anonymizedWaId,
          conversationKey: `${client.clientKey}:${anonymizedWaId}`,
          answers: {},
          status: "CLOSED",
          closedAt: now,
          assignedUserId: null,
          assignedTo: null,
          assignedAt: null,
          departmentId: null,
          queueId: null,
          handoffStatus: "NONE",
          handoffReleasedAt: now,
          mode: "BOT",
        },
      }),
      prisma.inboundMessage.updateMany({
        where: {
          clientId: client.id,
          OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
        },
        data: {
          waId: anonymizedWaId,
          waIdCanonical: anonymizedWaId,
          bodyText: "[mensagem anonimizada]",
          rawPayload: null,
        },
      }),
      prisma.outboundMessage.updateMany({
        where: {
          clientId: client.id,
          OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
        },
        data: {
          waId: anonymizedWaId,
          waIdCanonical: anonymizedWaId,
          bodyText: "[mensagem anonimizada]",
          errorBody: null,
          rawPayload: null,
        },
      }),
      prisma.contact.updateMany({
        where: { clientId: client.id, waId: { in: waIds } },
        data: { waId: anonymizedWaId, name: anonymizedName },
      }),
      prisma.lead.updateMany({
        where: {
          tenantId: client.id,
          OR: [{ waId: { in: waIds } }, { waIdCanonical: { in: waIds } }],
        },
        data: {
          waId: anonymizedWaId,
          waIdCanonical: anonymizedWaId,
          name: anonymizedName,
          phone: anonymizedWaId,
          city: null,
          service: null,
        },
      }),
      prisma.event.updateMany({
        where: {
          clientId: client.id,
          eventName: { notIn: immutablePrivacyAuditEvents },
          OR: [
            { conversationId: conversation.id },
            { waId: { in: waIds } },
            { waIdCanonical: { in: waIds } },
          ],
        },
        data: {
          waId: anonymizedWaId,
          waIdCanonical: anonymizedWaId,
        },
      }),
    ]);

  return {
    softDeletedConversations: conversationUpdate.count,
    anonymizedConversations: conversationUpdate.count,
    runtimeStates: runtimeStates.count,
    inboundMessages: inbound.count,
    outboundMessages: outbound.count,
    contacts: contacts.count,
    leads: leads.count,
    events: events.count,
  };
}

try {
  const clients = await prisma.client.findMany({
    where: clientKey ? { clientKey } : undefined,
    select: { id: true, clientKey: true },
  });
  for (const client of clients) {
    const retention = await prisma.retentionConfig.upsert({
      where: { clientId: client.id },
      update: {},
      create: { clientId: client.id, retentionDays: 90 },
    });
    const cutoff = new Date(Date.now() - retention.retentionDays * 24 * 60 * 60 * 1000);
    const conversations = await prisma.conversation.findMany({
      where: {
        clientId: client.id,
        deletedAt: null,
        createdAt: { lt: cutoff },
        updatedAt: { lt: cutoff },
        OR: [{ lastInboundAt: null }, { lastInboundAt: { lt: cutoff } }],
        AND: [{ OR: [{ lastOutboundAt: null }, { lastOutboundAt: { lt: cutoff } }] }],
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, waId: true, waIdCanonical: true },
    });

    const result = {
      softDeletedConversations: 0,
      anonymizedConversations: 0,
      runtimeStates: 0,
      inboundMessages: 0,
      outboundMessages: 0,
      contacts: 0,
      leads: 0,
      events: 0,
    };
    for (const conversation of conversations) {
      const item = await anonymizeAndSoftDeleteConversation(client, conversation);
      for (const key of Object.keys(result)) {
        result[key] += item[key] ?? 0;
      }
    }

    const payload = auditPayload(client.id, retention.retentionDays, cutoff, result);
    await prisma.event.create({
      data: {
        clientId: client.id,
        eventName: "retention.executed",
        requestId: `retention-script:${Date.now()}:${client.id}`,
        payloadJson: payload,
      },
    });
    console.log(
      JSON.stringify({
        event: "retention.executed",
        clientKey: client.clientKey,
        retentionDays: retention.retentionDays,
        cutoff: cutoff.toISOString(),
        ...result,
      })
    );
  }
} finally {
  await prisma.$disconnect();
}
