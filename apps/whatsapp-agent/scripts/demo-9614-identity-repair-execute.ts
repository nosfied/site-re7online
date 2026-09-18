#!/usr/bin/env tsx
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { PrismaClient } from "@prisma/client";
import {
  buildDemo9614RepairPlan,
  DEMO_9614_SECONDARY_ARCHIVED_WA_ID,
  DEMO_9614_TARGETS,
  isDemo9614SecondaryNeutralized,
  stableHash,
} from "../src/identity/demo9614RepairPlanner.js";
import { databaseTarget, loadEnv, loadGraph, writeSnapshotPackage } from "./demo-9614-identity-repair-dry-run.js";

const OWNER_TOKEN = "demo-9614-owner-authorized-20260918";

type Options = {
  execute: boolean;
  json: boolean;
  snapshotDir: string | null;
  ownerToken: string | null;
};

function parseArgs(argv: string[]): Options {
  const options: Options = { execute: false, json: false, snapshotDir: null, ownerToken: null };
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    switch (current) {
      case "--execute":
        options.execute = true;
        break;
      case "--json":
        options.json = true;
        break;
      case "--snapshot-dir":
        if (!next || next.startsWith("--")) throw new Error("--snapshot-dir exige um valor");
        options.snapshotDir = next;
        index += 1;
        break;
      case "--owner-token":
        if (!next || next.startsWith("--")) throw new Error("--owner-token exige um valor");
        options.ownerToken = next;
        index += 1;
        break;
      default:
        throw new Error(`flag nao reconhecida: ${current}`);
    }
  }
  if (!options.execute) throw new Error("Repair real exige --execute.");
  if (options.ownerToken !== OWNER_TOKEN) throw new Error("Repair real exige owner token explicito.");
  if (!options.snapshotDir) throw new Error("Repair real exige --snapshot-dir.");
  return options;
}

function graphHash(graph: Awaited<ReturnType<typeof loadGraph>>) {
  return {
    graph: stableHash({
      client: graph.client,
      contacts: graph.contacts,
      leads: graph.leads,
      identities: graph.identities,
      openConversations: graph.openConversations,
      openRuntimeStates: graph.openRuntimeStates,
      campaign: graph.campaign,
      campaign9614OutboundCount: graph.campaign9614OutboundCount,
      campaign9614ProviderCallCount: graph.campaign9614ProviderCallCount,
      campaign9614BillingCount: graph.campaign9614BillingCount,
      campaign9614ImportBlockedCount: graph.campaign9614ImportBlockedCount,
      consentRecords: graph.consentRecords,
      effectiveOptOut: graph.effectiveOptOut,
    }),
    snapshots: stableHash(graph.snapshots),
  };
}

async function writeRepairArtifact(snapshotDir: string, name: string, value: unknown) {
  await fs.mkdir(snapshotDir, { recursive: true });
  const target = path.join(snapshotDir, name);
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return { path: target, sha256: stableHash(value) };
}

function assertPostRepairState(postGraph: Awaited<ReturnType<typeof loadGraph>>) {
  const t = DEMO_9614_TARGETS;
  const postPlan = buildDemo9614RepairPlan(postGraph);
  const metaIdentity = postGraph.identities.find((identity) => identity.id === t.metaIdentityId);
  const secondaryContact = postGraph.contacts.find((contact) => contact.id === t.secondaryContactId);
  if (!postPlan.ok) throw new Error(`post-repair planner blockers: ${postPlan.blockers.join(",")}`);
  if (metaIdentity?.contactId !== t.primaryContactId) throw new Error("post-repair Meta identity owner is not primary");
  if (!isDemo9614SecondaryNeutralized(secondaryContact)) throw new Error("post-repair secondary contact is not neutralized");
  if (postPlan.runtimeImpact !== "NOOP") throw new Error(`unexpected post-repair runtime impact: ${postPlan.runtimeImpact}`);
  if (postPlan.liveSelectors.includes("secondary_contact_identity_selectors")) {
    throw new Error("post-repair secondary contact still has live selectors");
  }
  if (postPlan.liveSelectors.includes("meta_contact_channel_identity")) {
    throw new Error("post-repair Meta identity still points at secondary contact");
  }
  return postPlan;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  loadEnv();
  const prisma = new PrismaClient();
  const generatedAt = new Date().toISOString();
  try {
    const preGraph = await loadGraph(prisma);
    const prePlan = buildDemo9614RepairPlan(preGraph);
    const preReport = {
      generatedAt,
      phase: "pre-repair",
      databaseTarget: databaseTarget(),
      targets: DEMO_9614_TARGETS,
      ok: prePlan.ok,
      blockers: prePlan.blockers,
      runtimeImpact: prePlan.runtimeImpact,
      liveSelectors: prePlan.liveSelectors,
      liveReferencesToRelink: prePlan.liveReferencesToRelink,
      plannedActions: prePlan.plannedActions,
      expectedFinal: prePlan.expectedFinal,
      eligibility: prePlan.eligibility,
      graphCounts: {
        contacts: preGraph.contacts.length,
        leads: preGraph.leads.length,
        channelIdentities: preGraph.identities.length,
        openConversations: preGraph.openConversations.length,
        openRuntimeStates: preGraph.openRuntimeStates.length,
        consentRecords: preGraph.consentRecords,
      },
      campaignChecks: {
        campaign9614OutboundCount: preGraph.campaign9614OutboundCount,
        campaign9614ProviderCallCount: preGraph.campaign9614ProviderCallCount,
        campaign9614BillingCount: preGraph.campaign9614BillingCount,
        campaign9614ImportBlockedCount: preGraph.campaign9614ImportBlockedCount,
      },
      entities: {
        primaryContact: prePlan.primaryContact,
        primaryLead: prePlan.primaryLead,
        secondaryContact: prePlan.secondaryContact,
        secondaryLead: prePlan.secondaryLead,
        metaIdentity: prePlan.metaIdentity,
      },
      snapshots: preGraph.snapshots,
      hashes: graphHash(preGraph),
    };
    const preArtifact = await writeRepairArtifact(options.snapshotDir!, "demo-9614-pre-repair-snapshot.json", preReport);
    await writeSnapshotPackage(path.join(options.snapshotDir!, "dry-run"), { ...preReport, dryRun: true });

    if (!prePlan.ok) throw new Error(`pre-repair blockers: ${prePlan.blockers.join(",")}`);
    if (prePlan.runtimeImpact !== "NOOP") throw new Error(`unexpected pre-repair runtime impact: ${prePlan.runtimeImpact}`);

    const txResult = await prisma.$transaction(
      async (tx) => {
        const currentGraph = await loadGraph(tx as unknown as PrismaClient);
        const currentPlan = buildDemo9614RepairPlan(currentGraph);
        if (!currentPlan.ok) throw new Error(`transaction revalidation blockers: ${currentPlan.blockers.join(",")}`);
        if (currentPlan.runtimeImpact !== "NOOP") {
          throw new Error(`transaction revalidation runtime impact: ${currentPlan.runtimeImpact}`);
        }

        const archivedCollision = await tx.contact.findFirst({
          where: {
            clientId: currentGraph.client.id,
            waId: DEMO_9614_SECONDARY_ARCHIVED_WA_ID,
            id: { not: DEMO_9614_TARGETS.secondaryContactId },
          },
          select: { id: true },
        });
        if (archivedCollision) throw new Error(`archived selector collision: ${archivedCollision.id}`);

        const mutations: string[] = [];
        if (currentPlan.metaIdentity?.contactId !== DEMO_9614_TARGETS.primaryContactId) {
          if (currentPlan.metaIdentity?.contactId !== DEMO_9614_TARGETS.secondaryContactId) {
            throw new Error("Meta identity is not on expected secondary contact");
          }
          await tx.contactChannelIdentity.update({
            where: { id: DEMO_9614_TARGETS.metaIdentityId },
            data: { contactId: DEMO_9614_TARGETS.primaryContactId },
          });
          mutations.push("meta_identity_moved_to_primary");
        }

        if (!isDemo9614SecondaryNeutralized(currentPlan.secondaryContact)) {
          await tx.contact.update({
            where: { id: DEMO_9614_TARGETS.secondaryContactId },
            data: {
              waId: DEMO_9614_SECONDARY_ARCHIVED_WA_ID,
              channel: null,
              provider: null,
              channelAccountId: null,
              externalUserHash: null,
              externalUserRef: null,
              legacyWaId: null,
              operationallyExcludedAt: new Date(),
            },
          });
          mutations.push("secondary_contact_selectors_neutralized");
        }

        const postGraph = await loadGraph(tx as unknown as PrismaClient);
        const postPlan = assertPostRepairState(postGraph);
        return {
          mutations,
          postGraph,
          postPlan,
          hashes: graphHash(postGraph),
        };
      },
      { maxWait: 10_000, timeout: 30_000 }
    );

    const postReport = {
      generatedAt: new Date().toISOString(),
      phase: "post-repair",
      databaseTarget: databaseTarget(),
      targets: DEMO_9614_TARGETS,
      transaction: "COMMITTED",
      mutations: txResult.mutations,
      ok: txResult.postPlan.ok,
      blockers: txResult.postPlan.blockers,
      runtimeImpact: txResult.postPlan.runtimeImpact,
      liveSelectors: txResult.postPlan.liveSelectors,
      plannedActions: txResult.postPlan.plannedActions,
      expectedFinal: txResult.postPlan.expectedFinal,
      eligibility: txResult.postPlan.eligibility,
      graphCounts: {
        contacts: txResult.postGraph.contacts.length,
        leads: txResult.postGraph.leads.length,
        channelIdentities: txResult.postGraph.identities.length,
        openConversations: txResult.postGraph.openConversations.length,
        openRuntimeStates: txResult.postGraph.openRuntimeStates.length,
        consentRecords: txResult.postGraph.consentRecords,
      },
      campaignChecks: {
        campaign9614OutboundCount: txResult.postGraph.campaign9614OutboundCount,
        campaign9614ProviderCallCount: txResult.postGraph.campaign9614ProviderCallCount,
        campaign9614BillingCount: txResult.postGraph.campaign9614BillingCount,
        campaign9614ImportBlockedCount: txResult.postGraph.campaign9614ImportBlockedCount,
      },
      snapshots: txResult.postGraph.snapshots,
      hashes: txResult.hashes,
    };
    const postArtifact = await writeRepairArtifact(options.snapshotDir!, "demo-9614-post-repair-snapshot.json", postReport);
    const manifest = {
      generatedAt: postReport.generatedAt,
      transaction: "COMMITTED",
      preArtifact,
      postArtifact,
      preSnapshotHash: preArtifact.sha256,
      postSnapshotHash: postArtifact.sha256,
      mutations: txResult.mutations,
      providerCalls: 0,
      resend: false,
      appDeploy: false,
      pm2Reload: false,
    };
    const manifestArtifact = await writeRepairArtifact(options.snapshotDir!, "demo-9614-repair-manifest.json", manifest);
    const report = { preArtifact, postArtifact, manifestArtifact, manifest, postReport };
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("DEMO 9614 identity repair execution");
      console.log("transaction: COMMITTED");
      console.log(`mutations: ${txResult.mutations.join(",") || "noop"}`);
      console.log(`preSnapshot: ${preArtifact.path}`);
      console.log(`postSnapshot: ${postArtifact.path}`);
      console.log(`manifest: ${manifestArtifact.path}`);
      console.log(`eligibility: ${txResult.postPlan.eligibility.overall}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
