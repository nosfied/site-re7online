import "./bootstrap-env.js";
import "./processHandlers.js";
import { createServer } from "./http/server.js";
import { attachRealtimeWebSocket } from "./realtime/websocket.js";
import { logger } from "./logger/logger.js";
import { getPrisma } from "./db.js";
import { loadTenantsJsonFallback } from "./config/tenantJsonFallback.js";
import { startChatbotInactivityProcessor } from "./chatbot/chatbotInactivityProcessor.js";

async function bootstrap() {
  const { env } = await import("./config/env.js");

  logger.info({
    event: "env.snapshot",
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    nodeEnv: process.env.NODE_ENV ?? "unknown",
    port: env.PORT,
  });
  if (!process.env.DATABASE_URL) {
    logger.error({ event: "env.missing", key: "DATABASE_URL" });
    process.exit(1);
  }

  if (!env.verifyTokenPresent) {
    logger.error({ event: "env.missing", key: "WHATSAPP_VERIFY_TOKEN" });
  }
  if (!env.outboundEnabled) {
    if (!env.accessTokenPresent) {
      logger.error({
        event: "env.missing",
        key: "WHATSAPP_ACCESS_TOKEN",
        note: "outbound_disabled",
      });
    }
    if (!env.phoneNumberIdPresent) {
      logger.error({
        event: "env.missing",
        key: "WHATSAPP_PHONE_NUMBER_ID",
        note: "outbound_disabled",
      });
    }
  }

  try {
    const prisma = getPrisma();
    if (!env.ENABLE_TENANTS_JSON_FALLBACK) {
      const [clientCount, phoneCount] = await Promise.all([
        prisma.client.count(),
        prisma.waPhoneNumber.count(),
      ]);
      logger.info({
        event: "bootstrap.db_authoritative.ready",
        clientCount,
        waPhoneNumberCount: phoneCount,
      });
    } else {
      const tenants = await loadTenantsJsonFallback({
        route: "bootstrap",
        reason: "legacy_tenant_bootstrap_enabled",
      });
    const forcePhoneAssign =
      String(process.env.BOOTSTRAP_FORCE_PHONE_ASSIGN ?? "").toLowerCase() === "true";

    for (const [clientKey, tenant] of Object.entries(tenants)) {
      const client = await prisma.client.upsert({
        where: { clientKey },
        update: { name: tenant.name || clientKey },
        create: { clientKey, name: tenant.name || clientKey },
      });

      const phoneNumberId = (tenant.metaPhoneNumberId ?? "").trim();
      if (!phoneNumberId) {
        logger.warn({
          event: "bootstrap.tenant.skipped",
          tenantId: tenant.id,
          clientKey,
          reason: "missing_phone_number_id",
        });
        continue;
      }

      const existingPhone = await prisma.waPhoneNumber.findUnique({
        where: { phoneNumberId },
        include: {
          client: {
            select: {
              id: true,
              clientKey: true,
            },
          },
        },
      });

      if (!existingPhone) {
        const phone = await prisma.waPhoneNumber.create({
          data: {
            clientId: client.id,
            phoneNumberId,
            display: tenant.displayPhoneNumber?.trim() || phoneNumberId,
          },
        });
        logger.info({
          event: "bootstrap.tenant.ready",
          tenantId: tenant.id,
          clientKey,
          clientId: client.id,
          phoneNumberId: phone.phoneNumberId,
          action: "created",
        });
        continue;
      }

      if (existingPhone.clientId === client.id) {
        const phone = await prisma.waPhoneNumber.update({
          where: { phoneNumberId },
          data: tenant.displayPhoneNumber?.trim()
            ? { display: tenant.displayPhoneNumber.trim() }
            : existingPhone.display?.trim()
              ? {}
              : { display: phoneNumberId },
        });
        logger.info({
          event: "bootstrap.tenant.ready",
          tenantId: tenant.id,
          clientKey,
          clientId: client.id,
          phoneNumberId: phone.phoneNumberId,
          action: "existing",
        });
        continue;
      }

      if (!forcePhoneAssign) {
        logger.warn({
          event: "bootstrap.tenant.conflict",
          tenantId: tenant.id,
          clientKey,
          clientId: client.id,
          phoneNumberId,
          existingClientId: existingPhone.clientId,
          existingClientKey: existingPhone.client?.clientKey ?? null,
          forcePhoneAssign,
        });
        continue;
      }

      const phone = await prisma.waPhoneNumber.update({
        where: { phoneNumberId },
        data: {
          clientId: client.id,
          display: tenant.displayPhoneNumber?.trim() || existingPhone.display || phoneNumberId,
        },
      });
      logger.warn({
        event: "bootstrap.tenant.ready",
        tenantId: tenant.id,
        clientKey,
        clientId: client.id,
        phoneNumberId: phone.phoneNumberId,
        action: "reassigned",
        previousClientId: existingPhone.clientId,
        previousClientKey: existingPhone.client?.clientKey ?? null,
      });
    }
    }
  } catch (error) {
    logger.error({
      event: "bootstrap.tenant.error",
      message: (error as Error).message,
    });
  }

  const server = createServer();
  attachRealtimeWebSocket(server);
  if (String(process.env.CHATBOT_INACTIVITY_PROCESSOR_DISABLED ?? "").toLowerCase() !== "true") {
    startChatbotInactivityProcessor({
      prisma: getPrisma(),
      intervalMs: Number(process.env.CHATBOT_INACTIVITY_PROCESSOR_INTERVAL_MS) || undefined,
    });
    logger.info({ event: "chatbot.inactivity.processor.started" });
  }
  server.listen(env.PORT, () => {
    logger.info({ event: "server.started", port: env.PORT });
  });
}

bootstrap().catch((error) => {
  logger.error({ event: "bootstrap.failed", error: (error as Error).message });
});
