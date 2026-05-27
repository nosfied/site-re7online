import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TARGET_NAME = "Atendimento Geral";
const TARGET_SLUG = "atendimento-geral";
const TARGET_QUEUE_NAME = "Fila Geral";
const LEGACY_NAMES = new Set(["Atendimento"]);
const LEGACY_SLUGS = new Set(["atendimento"]);
const LEGACY_NAME_PREFIX = "Departamento legado";
const LEGACY_SLUG_PREFIX = "departamento-legado";

function archivedName(id) {
  return `Departamento legado ${id.slice(-8)}`;
}

function archivedSlug(id) {
  return `departamento-legado-${id.slice(-8)}`;
}

async function normalizeClient(client) {
  const target = await prisma.department.upsert({
    where: { clientId_slug: { clientId: client.id, slug: TARGET_SLUG } },
    update: { name: TARGET_NAME, isActive: true },
    create: { clientId: client.id, name: TARGET_NAME, slug: TARGET_SLUG, isActive: true },
    select: { id: true },
  });

  const targetQueue = await prisma.queue.upsert({
    where: {
      clientId_departmentId_name: {
        clientId: client.id,
        departmentId: target.id,
        name: TARGET_QUEUE_NAME,
      },
    },
    update: {},
    create: { clientId: client.id, departmentId: target.id, name: TARGET_QUEUE_NAME },
    select: { id: true },
  });

  const legacyDepartments = await prisma.department.findMany({
    where: {
      clientId: client.id,
      id: { not: target.id },
      OR: [
        { name: { in: Array.from(LEGACY_NAMES) } },
        { slug: { in: Array.from(LEGACY_SLUGS) } },
        { name: { startsWith: LEGACY_NAME_PREFIX } },
        { slug: { startsWith: LEGACY_SLUG_PREFIX } },
        { isActive: false },
      ],
    },
    select: { id: true, name: true, slug: true },
  });

  let conversations = 0;
  let runtimeStates = 0;
  let users = 0;
  let runtimeQueues = 0;
  let deactivated = 0;
  let deleted = 0;

  for (const legacy of legacyDepartments) {
    const legacyQueues = await prisma.queue.findMany({
      where: { clientId: client.id, departmentId: legacy.id },
      select: { id: true },
    });
    const legacyQueueIds = legacyQueues.map((queue) => queue.id);

    const [conversationResult, runtimeResult, runtimeQueueResult, userResult] =
      await prisma.$transaction([
        prisma.conversation.updateMany({
          where: { clientId: client.id, departmentId: legacy.id },
          data: { departmentId: target.id },
        }),
        prisma.conversationRuntimeState.updateMany({
          where: { clientId: client.id, departmentId: legacy.id },
          data: { departmentId: target.id, queueId: targetQueue.id },
        }),
        legacyQueueIds.length
          ? prisma.conversationRuntimeState.updateMany({
              where: { clientId: client.id, queueId: { in: legacyQueueIds } },
              data: { queueId: targetQueue.id },
            })
          : prisma.conversationRuntimeState.updateMany({
              where: { id: "__no_runtime_state__" },
              data: { queueId: targetQueue.id },
            }),
        prisma.user.updateMany({
          where: { clientId: client.id, departmentId: legacy.id },
          data: { departmentId: target.id },
        }),
      ]);

    const departmentResult = await prisma.department.updateMany({
      where: { id: legacy.id, clientId: client.id },
      data: {
        isActive: false,
        name: archivedName(legacy.id),
        slug: archivedSlug(legacy.id),
      },
    });
    const deleteResult = await prisma.department.deleteMany({
      where: { id: legacy.id, clientId: client.id },
    });

    conversations += conversationResult.count;
    runtimeStates += runtimeResult.count;
    users += userResult.count;
    runtimeQueues += runtimeQueueResult.count;
    deactivated += departmentResult.count;
    deleted += deleteResult.count;
  }

  return {
    clientKey: client.clientKey,
    targetDepartmentId: target.id,
    legacyDepartments: legacyDepartments.length,
    conversations,
    runtimeStates,
    users,
    runtimeQueues,
    deactivated,
    deleted,
  };
}

async function main() {
  const clientKey = process.env.CLIENT_KEY?.trim();
  const clients = await prisma.client.findMany({
    where: clientKey ? { clientKey } : {},
    select: { id: true, clientKey: true },
    orderBy: { clientKey: "asc" },
  });
  const results = [];
  for (const client of clients) {
    results.push(await normalizeClient(client));
  }
  console.log(JSON.stringify({ event: "department.normalize.completed", results }, null, 2));
}

main()
  .catch((error) => {
    console.error(JSON.stringify({ event: "department.normalize.failed", error: error.message }));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
