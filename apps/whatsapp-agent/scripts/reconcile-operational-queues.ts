import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const INTERNAL_QUEUE_NAME = "Atendimento interno";

type ExplicitMapping = {
  tenant: string;
  departmentId: string;
  queueId: string;
  class: "EXACTLY_ONE" | "MULTI_AUDITED" | "MULTI_OWNER";
};

type InternalQueueDecision = {
  tenant: string;
  departmentId: string;
  queueId: string;
};

const explicitMappings: ExplicitMapping[] = [
  { tenant: "cra-pr", departmentId: "cmtkhhxnm00094spnwswq75im", queueId: "cmtkhhxnt000b4spntn9xifdu", class: "EXACTLY_ONE" },
  { tenant: "cra-pr", departmentId: "cmtkhhxnd00054spnyrxt59nk", queueId: "cmtkhhxng00074spna1hrvyqb", class: "EXACTLY_ONE" },
  { tenant: "cra-pr", departmentId: "cmtkhhxof000l4spnjnv4zhjv", queueId: "cmtkhhxoi000n4spnqvm6b037", class: "EXACTLY_ONE" },
  { tenant: "cra-pr", departmentId: "cmtkhhxmp00014spndfwba4hx", queueId: "cmtkhhxmx00034spnqvvk5mzu", class: "EXACTLY_ONE" },
  { tenant: "cra-pr", departmentId: "cmtkhhxny000d4spn745xsxz2", queueId: "cmtkhhxo1000f4spn2b04jiu1", class: "EXACTLY_ONE" },
  { tenant: "cra-pr", departmentId: "cmtkhhxo8000h4spnacgwu9na", queueId: "cmtkhhxob000j4spnpfcb6ken", class: "EXACTLY_ONE" },
  { tenant: "demo-converta", departmentId: "cmtg2g0zs00154sjgd1kez3iv", queueId: "cmtg2g10000174sjgmir39vno", class: "EXACTLY_ONE" },
  { tenant: "demo-converta", departmentId: "cmsj6g59q00014sts2bxg49mv", queueId: "cmsj6g5a900074stsl4gchsoy", class: "EXACTLY_ONE" },
  { tenant: "demo-converta", departmentId: "cmtg2g0x2000l4sjg3voybk97", queueId: "cmtg2g0x7000n4sjg5bysxh7j", class: "EXACTLY_ONE" },
  { tenant: "demo-converta", departmentId: "cmtg2g13q002t4sjg9yjqagfy", queueId: "cmtg2g13w002v4sjgy1y39adx", class: "EXACTLY_ONE" },
  { tenant: "demo-converta", departmentId: "cmtg2g115001p4sjgo9cke0ny", queueId: "cmtg2g11c001r4sjgy9iw36dh", class: "EXACTLY_ONE" },
  { tenant: "demo-converta", departmentId: "cmsiwk1ob00054sdzvi98cer7", queueId: "cmsiwk1ov000b4sdzfl4hzdnz", class: "EXACTLY_ONE" },
  { tenant: "demo-converta", departmentId: "cmtg2g12h00294sjg07ynh2bi", queueId: "cmtg2g12q002b4sjgigsskidm", class: "EXACTLY_ONE" },
  { tenant: "demo-prefeitura", departmentId: "cmookf7yo000d4sqbpjfvjtab", queueId: "cmookf7yt000f4sqb2nv5bpn8", class: "EXACTLY_ONE" },
  { tenant: "demo-prefeitura", departmentId: "cmookf7x100014sqbfkcm1p7l", queueId: "cmookf7x900034sqbhwln4djp", class: "EXACTLY_ONE" },
  { tenant: "demo-prefeitura", departmentId: "cmookf7xq00094sqbzoomc70m", queueId: "cmookf7yc000b4sqbk8gd67dc", class: "EXACTLY_ONE" },
  { tenant: "justa-advocacia", departmentId: "cmo1qz67k00014sk5okuix9o0", queueId: "cmomr3num00034sn9pgx40i80", class: "EXACTLY_ONE" },
  { tenant: "justa-advocacia", departmentId: "cmo1rgltu00714sdygpa6e6v1", queueId: "cmomuz2tx00vr4szzfrd6q4rg", class: "EXACTLY_ONE" },
  { tenant: "lab-websession", departmentId: "cmsokokqb00034sr72sp9ixmc", queueId: "cmsokokqm00054sr7pnnz0cms", class: "EXACTLY_ONE" },
  { tenant: "lab-websession", departmentId: "cmsqrqwgn00014sefgmxywqab", queueId: "cmsqrqwif000b4sefspvxsv14", class: "EXACTLY_ONE" },
  { tenant: "lab-websession", departmentId: "cmsqrqwhx00074seflnzwgyfp", queueId: "cmsqrqwig000f4sef6zlmnslm", class: "EXACTLY_ONE" },
  { tenant: "lab-websession", departmentId: "cmsqrqwi300094sefenozvber", queueId: "cmsqrqwig000h4sefuoqv2mvu", class: "EXACTLY_ONE" },
  { tenant: "lab-websession", departmentId: "cmsqrqwhm00034sefbhr9ovpi", queueId: "cmsqrqwig000e4sef31uffn2h", class: "EXACTLY_ONE" },
  { tenant: "lab-websession", departmentId: "cmsqf1fj400034soy3n7q5tbj", queueId: "cmsqf1fja00054soyavk5qh3r", class: "EXACTLY_ONE" },
  { tenant: "loadtest-prefeitura", departmentId: "cmqv1x7ji008l4sqyqs0raioe", queueId: "cmqv1x7jp008n4sqyluzn9gtp", class: "EXACTLY_ONE" },
  { tenant: "loadtest-prefeitura", departmentId: "cmqux039e00034sgkl29lkevh", queueId: "cmqux039n00054sgkg2xkpxmm", class: "EXACTLY_ONE" },
  { tenant: "loadtest-prefeitura", departmentId: "cmqux03a200074sgkc1t8am8a", queueId: "cmqux03a700094sgks3so693y", class: "EXACTLY_ONE" },
  { tenant: "re7online", departmentId: "dept-default-f65561583ba04bc79569fb1fe800a34e", queueId: "queue-default-f65561583ba04bc79569fb1fe800a34e", class: "EXACTLY_ONE" },
  { tenant: "re7online", departmentId: "cmon3stsz000h4s8oa0l7iwvj", queueId: "cmon3stt6000j4s8o1fahynjz", class: "EXACTLY_ONE" },
  { tenant: "re7online", departmentId: "cmonjramt00u34sx94vixz7b2", queueId: "cmsyof9y1000x4s57fl0subqr", class: "EXACTLY_ONE" },
  { tenant: "secult-pe", departmentId: "cmsrfhct800034swiil3xt1nc", queueId: "cmsrfhctu000e4swic1fkrdpk", class: "EXACTLY_ONE" },
  { tenant: "secult-pe", departmentId: "cmsrfhct100014swipssy6qv7", queueId: "cmsrfhcte00074swi2uyctgmf", class: "EXACTLY_ONE" },
  { tenant: "syer-rodrigues", departmentId: "cmtoek1lh000d4s5wypu422ip", queueId: "cmtoekafy00014s4lg41vs5i0", class: "EXACTLY_ONE" },
  { tenant: "tendencia-modas", departmentId: "cmondp3ai00014szjxmoynmgx", queueId: "cmonezwil00034sdo4o6n13p8", class: "EXACTLY_ONE" },
  { tenant: "demo-prefeitura", departmentId: "cmookf7xi00054sqboc22ram4", queueId: "cmookf7xl00074sqbtwwbi02j", class: "MULTI_AUDITED" },
  { tenant: "re7online", departmentId: "cmraqfcme00054sis0ow5af4z", queueId: "cmraqfcmj00074siskfe5j2lh", class: "MULTI_AUDITED" },
  { tenant: "secult-pe", departmentId: "cmsrfhcta00054swi5uyqdl23", queueId: "cmsrfhcu2000l4swiyjsxpdg1", class: "MULTI_AUDITED" },
  { tenant: "demo-converta", departmentId: "cmsiwk1o100014sdzl5cqd2ki", queueId: "cmsiyb2k200n94sdpu5khkee0", class: "MULTI_AUDITED" },
  { tenant: "demo-converta", departmentId: "cmsukc3vh00014s9pscq8i7iv", queueId: "cmsukc3w400074s9pw9rv1yxi", class: "MULTI_AUDITED" },
  { tenant: "demo-converta", departmentId: "cmsukc3vv00054s9p0pem6gh8", queueId: "cmsukc3wf000b4s9psxgb1ju0", class: "MULTI_AUDITED" },
  { tenant: "demo-converta", departmentId: "cmtg2g0u800014sjgjjeud8tp", queueId: "cmtg2g0uo00034sjgh37pwiy1", class: "MULTI_AUDITED" },
  { tenant: "demo-converta", departmentId: "cmsukc3vp00034s9pyfwbv7av", queueId: "cmsukc3wa00094s9pa16davow", class: "MULTI_OWNER" },
  { tenant: "re7online", departmentId: "cmraqfcly00014sisaysk2j9e", queueId: "cmraqfcm800034sisboqazhtv", class: "MULTI_OWNER" },
  { tenant: "re7online", departmentId: "cmraqfcmn00094sisicjhc2l0", queueId: "cmraqfcms000b4sis8s9wbqzs", class: "MULTI_OWNER" },
];

const internalQueueDecisions: InternalQueueDecision[] = [
  {
    tenant: "demo-converta",
    departmentId: "cmu1no78102cf4sxsndoqtemc",
    queueId: "queue-operational-cmu1no78102cf4sxsndoqtemc",
  },
  {
    tenant: "lab-websession",
    departmentId: "cmsqrqwhp00054sefz4tgu5j1",
    queueId: "queue-operational-cmsqrqwhp00054sefz4tgu5j1",
  },
];

const inactiveNullAllowed = new Set([
  "cmo1qz68f00074sk58rz1v3f3",
  "cmo1qz68400054sk521uffji4",
  "cmo1qz67w00034sk565lvi4mh",
  "cmondp3b700074szj0ftn8rjo",
  "cmondp3az00054szjt8eapjas",
  "cmondp3as00034szjagqsq16p",
  "cmt2zla8g000f4sne6ehs0uio",
  "cmsiwk1o800034sdzdhd603l7",
]);

const dryRun = process.argv.includes("--dry-run");
const plannedPointers = new Map<string, string>();
const plannedInternalQueueIds = new Set<string>();

function assertUniqueIds() {
  const departmentIds = new Set<string>();
  for (const mapping of [...explicitMappings, ...internalQueueDecisions]) {
    if (departmentIds.has(mapping.departmentId)) {
      throw new Error(`duplicate_department_mapping:${mapping.departmentId}`);
    }
    departmentIds.add(mapping.departmentId);
  }
}

async function loadClient(tx: Prisma.TransactionClient, tenant: string) {
  const client = await tx.client.findUnique({
    where: { clientKey: tenant },
    select: { id: true, clientKey: true },
  });
  if (!client) throw new Error(`client_not_found:${tenant}`);
  return client;
}

async function loadDepartment(tx: Prisma.TransactionClient, params: { clientId: string; departmentId: string }) {
  const department = await tx.department.findFirst({
    where: { id: params.departmentId, clientId: params.clientId },
    select: { id: true, clientId: true, isActive: true, operationalQueueId: true },
  });
  if (!department) throw new Error(`department_not_found:${params.departmentId}`);
  return department;
}

async function validateQueue(
  tx: Prisma.TransactionClient,
  params: { clientId: string; departmentId: string; queueId: string }
) {
  const queue = await tx.queue.findFirst({
    where: { id: params.queueId, clientId: params.clientId },
    select: { id: true, clientId: true, departmentId: true },
  });
  if (!queue) throw new Error(`queue_not_found:${params.queueId}`);
  if (queue.departmentId !== params.departmentId) {
    throw new Error(`queue_department_mismatch:${params.queueId}:${queue.departmentId}:${params.departmentId}`);
  }
  return queue;
}

async function reconcileExplicitMappings(tx: Prisma.TransactionClient) {
  const result = { updated: 0, noop: 0 };
  for (const mapping of explicitMappings) {
    const client = await loadClient(tx, mapping.tenant);
    const department = await loadDepartment(tx, {
      clientId: client.id,
      departmentId: mapping.departmentId,
    });
    await validateQueue(tx, {
      clientId: client.id,
      departmentId: department.id,
      queueId: mapping.queueId,
    });
    if (department.operationalQueueId === mapping.queueId) {
      result.noop += 1;
      continue;
    }
    if (department.operationalQueueId && department.operationalQueueId !== mapping.queueId) {
      throw new Error(
        `unexpected_existing_operational_queue:${mapping.departmentId}:${department.operationalQueueId}:${mapping.queueId}`
      );
    }
    if (!dryRun) {
      await tx.department.update({
        where: { id: department.id },
        data: { operationalQueueId: mapping.queueId },
      });
    }
    plannedPointers.set(department.id, mapping.queueId);
    result.updated += 1;
  }
  return result;
}

async function reconcileInternalQueues(tx: Prisma.TransactionClient) {
  const result = { created: 0, linked: 0, noop: 0 };
  for (const decision of internalQueueDecisions) {
    const client = await loadClient(tx, decision.tenant);
    const department = await loadDepartment(tx, {
      clientId: client.id,
      departmentId: decision.departmentId,
    });
    if (!department.isActive) throw new Error(`internal_queue_department_inactive:${department.id}`);
    const existingQueue = await tx.queue.findUnique({
      where: { id: decision.queueId },
      select: { id: true, clientId: true, departmentId: true },
    });
    if (existingQueue) {
      if (existingQueue.clientId !== client.id || existingQueue.departmentId !== department.id) {
        throw new Error(`internal_queue_identity_mismatch:${decision.queueId}`);
      }
    } else if (!dryRun) {
      await tx.queue.create({
        data: {
          id: decision.queueId,
          clientId: client.id,
          departmentId: department.id,
          name: INTERNAL_QUEUE_NAME,
        },
      });
      result.created += 1;
    } else {
      plannedInternalQueueIds.add(decision.queueId);
      result.created += 1;
    }
    if (department.operationalQueueId === decision.queueId) {
      result.noop += 1;
      continue;
    }
    if (department.operationalQueueId && department.operationalQueueId !== decision.queueId) {
      throw new Error(
        `unexpected_existing_operational_queue:${department.id}:${department.operationalQueueId}:${decision.queueId}`
      );
    }
    if (!dryRun) {
      await tx.department.update({
        where: { id: department.id },
        data: { operationalQueueId: decision.queueId },
      });
    }
    plannedPointers.set(department.id, decision.queueId);
    result.linked += 1;
  }
  return result;
}

async function validateFinalState(tx: Prisma.TransactionClient) {
  const departments = await tx.department.findMany({
    select: {
      id: true,
      clientId: true,
      isActive: true,
      operationalQueueId: true,
      operationalQueue: {
        select: { id: true, clientId: true, departmentId: true },
      },
    },
  });
  const withEffectivePointers = departments.map((department) => ({
    ...department,
    effectiveOperationalQueueId: department.operationalQueueId ?? plannedPointers.get(department.id) ?? null,
  }));
  const activeUnresolved = withEffectivePointers.filter(
    (department) => department.isActive && !department.effectiveOperationalQueueId
  );
  const invalidPointers = departments.filter(
    (department) =>
      department.operationalQueueId &&
      (!department.operationalQueue ||
        department.operationalQueue.clientId !== department.clientId ||
        department.operationalQueue.departmentId !== department.id)
  );
  const missingPlannedInternalQueue = Array.from(plannedInternalQueueIds).filter(
    (queueId) => !Array.from(plannedPointers.values()).includes(queueId)
  );
  const inactiveUnexpected = withEffectivePointers.filter(
    (department) =>
      !department.isActive && !department.effectiveOperationalQueueId && !inactiveNullAllowed.has(department.id)
  );
  if (activeUnresolved.length > 0) {
    throw new Error(`active_unresolved:${activeUnresolved.map((department) => department.id).join(",")}`);
  }
  if (invalidPointers.length > 0) {
    throw new Error(`invalid_operational_queue_pointer:${invalidPointers.map((department) => department.id).join(",")}`);
  }
  if (missingPlannedInternalQueue.length > 0) {
    throw new Error(`planned_internal_queue_unlinked:${missingPlannedInternalQueue.join(",")}`);
  }
  if (inactiveUnexpected.length > 0) {
    throw new Error(`unexpected_inactive_null:${inactiveUnexpected.map((department) => department.id).join(",")}`);
  }
  return {
    totalDepartments: departments.length,
    activeResolved: withEffectivePointers.filter(
      (department) => department.isActive && department.effectiveOperationalQueueId
    ).length,
    inactiveNull: withEffectivePointers.filter(
      (department) => !department.isActive && !department.effectiveOperationalQueueId
    ).length,
    inactiveWithQueue: withEffectivePointers.filter(
      (department) => !department.isActive && department.effectiveOperationalQueueId
    ).length,
    activeUnresolved: activeUnresolved.length,
  };
}

async function main() {
  assertUniqueIds();
  const result = await prisma.$transaction(
    async (tx) => {
      const explicit = await reconcileExplicitMappings(tx);
      const internal = await reconcileInternalQueues(tx);
      const finalState = await validateFinalState(tx);
      return {
        dryRun,
        expected: {
          explicitMappings: explicitMappings.length,
          exactlyOne: explicitMappings.filter((mapping) => mapping.class === "EXACTLY_ONE").length,
          multiAudited: explicitMappings.filter((mapping) => mapping.class === "MULTI_AUDITED").length,
          multiOwner: explicitMappings.filter((mapping) => mapping.class === "MULTI_OWNER").length,
          internalQueues: internalQueueDecisions.length,
          inactiveNullAllowed: inactiveNullAllowed.size,
        },
        explicit,
        internal,
        finalState,
      };
    },
    { timeout: 30_000 }
  );
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
