#!/usr/bin/env -S node --import tsx
import process from "node:process";
import { PrismaClient, type Prisma } from "@prisma/client";
import dotenv from "dotenv";
import { validateChatbotFlowDefinition } from "../src/chatbot/chatbotFlow.js";

dotenv.config({ path: ".env" });

type Options = {
  tenant: string;
  preset: "re7online-private-intake";
  execute: boolean;
  json: boolean;
};

type Action = {
  action: string;
  target: string;
  detail: Record<string, unknown>;
};

function fail(message: string): never {
  console.error(`[tenant-intake-flow] FAIL: ${message}`);
  process.exit(1);
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    tenant: "",
    preset: "re7online-private-intake",
    execute: false,
    json: false,
  };

  for (let index = 0; index < argv.length; ) {
    const current = argv[index];
    const next = argv[index + 1];
    const requireValue = (flag: string) => {
      if (!next || next.startsWith("--")) {
        fail(`${flag} exige um valor`);
      }
      return next.trim();
    };

    switch (current) {
      case "--tenant":
        options.tenant = requireValue(current);
        index += 2;
        break;
      case "--preset": {
        const preset = requireValue(current);
        if (preset !== "re7online-private-intake") {
          fail(`preset desconhecido: ${preset}`);
        }
        options.preset = preset;
        index += 2;
        break;
      }
      case "--execute":
        options.execute = true;
        index += 1;
        break;
      case "--dry-run":
        options.execute = false;
        index += 1;
        break;
      case "--json":
        options.json = true;
        index += 1;
        break;
      default:
        fail(`flag não reconhecida: ${current}`);
    }
  }

  if (!options.tenant) {
    fail("--tenant é obrigatório");
  }

  return options;
}

const re7onlinePrivateIntakeDefinition = {
  start: "menu_inicial",
  nodes: {
    menu_inicial: {
      type: "menu",
      text:
        "Olá! Sou o assistente da Re7online. Posso te ajudar com o Converta, demonstração, suporte ou informações para órgãos públicos.",
      tags: ["re7online", "intake"],
      options: [
        {
          label: "Conhecer o Converta",
          next: "converta_visao_geral",
          tags: ["lead", "converta"],
          context: { intent: "learn_converta", service: "converta" },
        },
        {
          label: "Solicitar demonstração / POC",
          next: "perfil_demo",
          tags: ["lead", "demo", "poc"],
          context: { intent: "request_demo", service: "demo_poc" },
        },
        {
          label: "Atendimento para órgão público / licitação",
          next: "perfil_governo",
          tags: ["government", "bid", "public_sector"],
          context: { intent: "public_sector", service: "licitacao" },
        },
        {
          label: "Suporte para cliente",
          next: "perfil_suporte",
          tags: ["support"],
          context: { intent: "support", service: "suporte" },
        },
        {
          label: "Falar com atendimento humano",
          next: "handoff_humano",
          tags: ["human_handoff"],
          context: { intent: "human_handoff" },
        },
      ],
    },
    converta_visao_geral: {
      type: "menu",
      text:
        "O Converta centraliza WhatsApp, Webchat, Messenger e Instagram em um inbox único, com filas, departamentos, relatórios e automação controlada. Qual ponto você quer aprofundar?",
      tags: ["lead", "converta"],
      options: [
        {
          label: "Demonstração do produto",
          next: "perfil_demo",
          tags: ["demo", "poc"],
          context: { interest: "product_demo" },
        },
        {
          label: "Planos e implantação",
          next: "handoff_comercial",
          tags: ["sales"],
          context: { interest: "pricing_implementation" },
        },
        {
          label: "Voltar ao menu inicial",
          next: "menu_inicial",
          tags: ["navigation"],
        },
      ],
    },
    perfil_demo: {
      type: "menu",
      text:
        "Para direcionar a demonstração, selecione o perfil que melhor representa sua necessidade. Se preferir, um consultor continua o atendimento em seguida.",
      tags: ["lead", "qualification"],
      options: [
        {
          label: "Empresa privada",
          next: "necessidade_privada",
          tags: ["business"],
          context: { marketProfile: "business" },
        },
        {
          label: "Órgão público",
          next: "perfil_governo",
          tags: ["government"],
          context: { marketProfile: "government" },
        },
        {
          label: "Quero falar com um consultor",
          next: "handoff_comercial",
          tags: ["human_handoff", "sales"],
        },
      ],
    },
    necessidade_privada: {
      type: "menu",
      text:
        "Qual é a principal necessidade hoje? Essa informação ajuda nossa equipe a preparar uma demonstração mais objetiva.",
      tags: ["lead", "qualification", "business"],
      options: [
        {
          label: "Centralizar canais de atendimento",
          next: "handoff_comercial",
          tags: ["omnichannel"],
          context: { interest: "omnichannel" },
        },
        {
          label: "Automação e chatbot",
          next: "handoff_comercial",
          tags: ["automation", "chatbot"],
          context: { interest: "automation" },
        },
        {
          label: "Relatórios e gestão de equipe",
          next: "handoff_comercial",
          tags: ["analytics", "team_management"],
          context: { interest: "analytics" },
        },
        {
          label: "Ainda não sei",
          next: "handoff_comercial",
          tags: ["needs_discovery"],
          context: { interest: "needs_discovery" },
        },
      ],
    },
    perfil_governo: {
      type: "menu",
      text:
        "Atendemos órgãos públicos com atendimento multicanal, protocolos, filas, relatórios, evidências operacionais e apoio para demonstrações/PoC. Qual é o contexto?",
      tags: ["government", "qualification"],
      options: [
        {
          label: "Edital ou licitação em andamento",
          next: "handoff_governo",
          tags: ["bid", "deadline"],
          context: { publicSectorContext: "bid" },
        },
        {
          label: "Demonstração para órgão público",
          next: "handoff_governo",
          tags: ["public_demo", "poc"],
          context: { publicSectorContext: "demo" },
        },
        {
          label: "Prefeitura, Câmara, SAAE/SIMAE ou autarquia",
          next: "handoff_governo",
          tags: ["public_entity"],
          context: { publicSectorContext: "entity" },
        },
        {
          label: "Voltar ao menu inicial",
          next: "menu_inicial",
          tags: ["navigation"],
        },
      ],
    },
    perfil_suporte: {
      type: "menu",
      text:
        "Para suporte, informe o tipo de situação. Em seguida vamos encaminhar para atendimento humano com o contexto inicial.",
      tags: ["support", "qualification"],
      options: [
        {
          label: "Canal ou mensagem com problema",
          next: "handoff_suporte",
          tags: ["support", "channel_issue"],
          context: { supportType: "channel_issue" },
        },
        {
          label: "Acesso, usuário ou permissão",
          next: "handoff_suporte",
          tags: ["support", "access"],
          context: { supportType: "access" },
        },
        {
          label: "Dúvida de uso",
          next: "handoff_suporte",
          tags: ["support", "how_to"],
          context: { supportType: "how_to" },
        },
        {
          label: "Urgência operacional",
          next: "handoff_suporte",
          tags: ["support", "urgent"],
          context: { supportType: "urgent" },
        },
      ],
    },
    handoff_comercial: {
      type: "handoff",
      text:
        "Perfeito. Vou encaminhar seu atendimento para um consultor da Re7online. Se puder, envie também nome, empresa, segmento, quantidade aproximada de atendentes e melhor canal para retorno.",
      handoffSummary:
        "Lead comercial qualificado pelo fluxo automatizado Re7online. Coletar nome, empresa, segmento, telefone/WhatsApp, interesse principal, quantidade aproximada de atendentes e canal preferido.",
      tags: ["sales", "human_handoff"],
    },
    handoff_governo: {
      type: "handoff",
      text:
        "Vou encaminhar para nosso atendimento especializado em órgãos públicos. Se puder, envie órgão/entidade, município/UF, edital ou contexto, prazo e contato responsável.",
      handoffSummary:
        "Atendimento público/licitação qualificado pelo fluxo automatizado Re7online. Coletar órgão/entidade, município/UF, edital ou contexto, prazo, canais exigidos, contato responsável e necessidade de demonstração/PoC.",
      tags: ["government", "bid", "human_handoff"],
    },
    handoff_suporte: {
      type: "handoff",
      text:
        "Vou encaminhar para suporte. Se puder, envie tenant/empresa, usuário ou contato, canal afetado, descrição curta do problema, urgência e horário aproximado do ocorrido.",
      handoffSummary:
        "Suporte qualificado pelo fluxo automatizado Re7online. Coletar tenant/empresa, usuário/contato, canal afetado, descrição, urgência percebida, evidência e horário aproximado.",
      tags: ["support", "human_handoff"],
    },
    handoff_humano: {
      type: "handoff",
      text: "Tudo bem. Vou encaminhar seu atendimento para uma pessoa da equipe Re7online.",
      handoffSummary: "Visitante solicitou atendimento humano diretamente.",
      tags: ["human_handoff"],
    },
  },
} satisfies Prisma.InputJsonObject;

function getPresetDefinition(options: Options) {
  if (options.preset === "re7online-private-intake") {
    return {
      name: "Re7online Automated Intake",
      definition: re7onlinePrivateIntakeDefinition,
    };
  }
  fail(`preset desconhecido: ${options.preset}`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function output(data: unknown, json: boolean) {
  if (json) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (typeof data === "string") {
    console.log(data);
    return;
  }
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const preset = getPresetDefinition(options);
  const validation = validateChatbotFlowDefinition(preset.definition);
  if (!validation.ok) {
    fail(`preset inválido: ${validation.message}`);
  }

  const prisma = new PrismaClient();
  try {
    const client = await prisma.client.findUnique({
      where: { clientKey: options.tenant },
      select: {
        id: true,
        clientKey: true,
        name: true,
        status: true,
        profile: true,
        features: true,
        chatbotFlows: {
          where: { entryPoint: true },
          select: { id: true, name: true, isActive: true, entryPoint: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
        },
      },
    });

    if (!client) {
      fail(`tenant não encontrado: ${options.tenant}`);
    }

    const existingFlow = await prisma.chatbotFlow.findFirst({
      where: { clientId: client.id, name: preset.name },
      select: { id: true, name: true, isActive: true, entryPoint: true },
    });

    const currentFeatures = asRecord(client.features);
    const nextFeatures = { ...currentFeatures, chatbot: true };
    const activeEntryPointsToDisable = client.chatbotFlows.filter((flow) => flow.id !== existingFlow?.id);
    const actions: Action[] = [];

    if (currentFeatures.chatbot !== true) {
      actions.push({
        action: "update",
        target: "Client.features",
        detail: { tenant: client.clientKey, set: { chatbot: true } },
      });
    }

    if (existingFlow) {
      actions.push({
        action: "update",
        target: "ChatbotFlow",
        detail: {
          id: existingFlow.id,
          name: existingFlow.name,
          isActive: true,
          entryPoint: true,
          definition: "replace_with_preset",
        },
      });
    } else {
      actions.push({
        action: "create",
        target: "ChatbotFlow",
        detail: {
          name: preset.name,
          isActive: true,
          entryPoint: true,
          definition: "preset",
        },
      });
    }

    for (const flow of activeEntryPointsToDisable) {
      actions.push({
        action: "deactivate",
        target: "ChatbotFlow",
        detail: { id: flow.id, name: flow.name, previousIsActive: flow.isActive },
      });
    }

    const report = {
      ok: true,
      mode: options.execute ? "execute" : "dry-run",
      tenant: {
        id: client.id,
        clientKey: client.clientKey,
        name: client.name,
        status: client.status,
        profile: client.profile ?? "business",
      },
      preset: options.preset,
      flowName: preset.name,
      activeEntryPointsBefore: client.chatbotFlows.map((flow) => ({
        id: flow.id,
        name: flow.name,
        isActive: flow.isActive,
        entryPoint: flow.entryPoint,
        updatedAt: flow.updatedAt.toISOString(),
      })),
      actions,
    };

    if (!options.execute) {
      output(report, options.json);
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: client.id },
        data: { features: nextFeatures as Prisma.InputJsonValue },
      });

      let flowId = existingFlow?.id ?? "";
      if (existingFlow) {
        const updated = await tx.chatbotFlow.update({
          where: { id: existingFlow.id },
          data: {
            definition: preset.definition,
            isActive: true,
            entryPoint: true,
          },
          select: { id: true },
        });
        flowId = updated.id;
      } else {
        const created = await tx.chatbotFlow.create({
          data: {
            clientId: client.id,
            name: preset.name,
            definition: preset.definition,
            isActive: true,
            entryPoint: true,
          },
          select: { id: true },
        });
        flowId = created.id;
      }

      if (activeEntryPointsToDisable.length > 0) {
        await tx.chatbotFlow.updateMany({
          where: {
            clientId: client.id,
            id: { not: flowId },
            entryPoint: true,
          },
          data: { isActive: false, entryPoint: false },
        });
      }

      return { flowId };
    });

    output(
      {
        ...report,
        executed: true,
        flowId: result.flowId,
      },
      options.json
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
