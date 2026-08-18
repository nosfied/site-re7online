#!/usr/bin/env -S node --import tsx
import process from "node:process";
import { PrismaClient, type Prisma } from "@prisma/client";
import dotenv from "dotenv";
import { validateChatbotFlowDefinition } from "../src/chatbot/chatbotFlow.js";

dotenv.config({ path: ".env" });

type Options = {
  tenant: string;
  preset: "re7online-private-intake" | "secult-pe-demo-consolidated";
  execute: boolean;
  json: boolean;
};

type Action = {
  action: string;
  target: string;
  detail: Record<string, unknown>;
};

type RoutingTarget = {
  key?: string;
  department: string;
  queue: string;
};

type ResolvedRoutingTarget = RoutingTarget & {
  departmentId: string | null;
  departmentActive: boolean;
  queueId: string | null;
};

const re7onlineRoutingTargets = [
  { department: "Atendimento Geral", queue: "Fila Geral" },
  { department: "Comercial", queue: "Fila Comercial" },
  { department: "Suporte", queue: "Fila Suporte" },
  { department: "Governo e Licitações", queue: "Fila Governo" },
] as const;

const secultDemoRoutingTargets = [
  { key: "general", department: "Dúvidas Gerais - SECULT / PE", queue: "Dúvidas Gerais - SECULT / PE" },
  { key: "fundarpe", department: "Dúvidas Gerais - FUNDARPE", queue: "Dúvidas Gerais - FUNDARPE" },
  {
    key: "technical",
    department: "Dúvidas Técnicas - Plataforma Mapa Cultural",
    queue: "Dúvidas Técnicas - Plataforma Mapa Cultural",
  },
] as const;

function routeByKey(targets: ResolvedRoutingTarget[], key: "general" | "fundarpe" | "technical") {
  const target = targets.find((item) => item.key === key);
  return {
    departmentId: target?.departmentId ?? undefined,
    queueId: target?.queueId ?? undefined,
  };
}

function secultHandoffContext(service: string, department: string, queue: string) {
  return {
    intent: "directed_service",
    servico: service,
    targetDepartment: department,
    targetQueue: queue,
  };
}

function buildSecultDemoConsolidatedDefinition(targets: ResolvedRoutingTarget[] = []) {
  const general = routeByKey(targets, "general");
  const fundarpe = routeByKey(targets, "fundarpe");
  const technical = routeByKey(targets, "technical");
  const generalTarget = secultDemoRoutingTargets.find((item) => item.key === "general")!;
  const fundarpeTarget = secultDemoRoutingTargets.find((item) => item.key === "fundarpe")!;
  const technicalTarget = secultDemoRoutingTargets.find((item) => item.key === "technical")!;
  const invalidText =
    "⚠️ Desculpe, essa opção é inválida. Tente novamente digitando apenas o número correspondente ao seu interesse, tá?";
  const handoffText =
    "Aguarde só mais um pouco, estou te direcionando para um/uma atendente. 😉\n\nPara encerrar o atendimento a qualquer momento, digite: #ENCERRAR#";
  const operatingHoursText =
    "🚨 *Nosso horário de atendimento direcionado é de segunda a sexta, das 8h às 12h e 13h às 17h, de segunda a sexta.*\n\n🚨 *Não operamos através de áudio, vídeo ou ligações*\n\n😁 Digite o número de acordo com o assunto desejado:";

  return {
    metadata: {
      preset: "secult-pe-demo-consolidated",
      sourceOfTruth: "ChatbotFlow",
      closeCommandSource: "TenantOperationalConfig.config.chatbotCloseCommand",
      availabilitySource: "DepartmentBusinessHour",
      protocolSource: "TenantOperationalConfig.config.protocolNotification",
      satisfactionSource: "TenantOperationalConfig.config.satisfactionPolicy",
    },
    start: "consent",
    globalCommands: [{ command: "#", action: "BACK", allowedModes: ["BOT"] }],
    inactivityPolicy: { action: "HANDOFF", timeoutMinutes: 60, resetAfterMinutes: 1440 },
    closedHandoffPolicy: {
      action: "QUEUE_FOR_NEXT_OPEN",
      queuePositionText: "Você é o nº {position} da fila de atendimento.",
      offHoursMessage: "No momento não temos nenhum atendente disponível. Você será atendido no primeiro horário do próximo expediente.",
    },
    nodes: {
      consent: {
        type: "consent",
        purpose: "attendance",
        textVersion: "secult-pe-v1",
        message:
          "Atenção: precisamos de sua autorização para iniciar o atendimento.\nNo Brasil, a LGPD (Lei Geral de Proteção de Dados) exige que se dê autorização para que se possa receber e enviar mensagens por aplicativos de comunicação como o WhatsApp.\n\nVocê autoriza a Secretaria de Cultura de Pernambuco a enviar mensagens, por esse canal para o número de WhatsApp {{contactPhone}}, referentes ao nosso atendimento, comunicados, avisos, informativos, eventos específicos, entre outras oportunidades relacionadas às nossas ações, editais e ao Mapa Cultural de Pernambuco?\n\nDigite, atentamente, apenas a numeração conforme abaixo:\n\n*1* - Sim. Continuar com o atendimento.\nVocê pode revogar essa autorização a qualquer momento. Enviando e-mail para revogar.atendimento@secult.pe.gov.br ele é exclusivo para retirar você da lista de recebimento de mensagens do nosso whatsapp\n*2* - Não. Encerrar o atendimento.\nAo encerrar o atendimento pelo WhatsApp, você pode buscar outros canais para contato, disponíveis no portal www.cultura.pe.com.br\n\nCaso queira autorizar o contato por aqui, fale conosco e responda o questionário novamente",
        acceptOption: "1",
        declineOption: "2",
        invalidText,
        onAccepted: "availability_router",
        onDeclined: "declined",
      },
      declined: {
        type: "text",
        text: "Atendimento encerrado. Caso precise, envie uma nova mensagem e autorize o atendimento.",
      },
      availability_router: {
        type: "menu",
        text: "Direcionando atendimento.",
        showBackCommand: false,
        autoSelectSingleVisibleOption: true,
        fallbackText: invalidText,
        departmentId: general.departmentId,
        options: [
          {
            label: "1 - Atendimento em expediente",
            next: "main_menu",
            ...general,
            visibilityCondition: { departmentAvailability: "OPEN" },
          },
          {
            label: "2 - Atendimento fora de expediente",
            next: "closed_menu",
            ...general,
            visibilityCondition: { departmentAvailability: "CLOSED" },
          },
          {
            label: "3 - Atendimento sem escala disponível",
            next: "closed_menu",
            ...general,
            visibilityCondition: { departmentAvailability: "NO_SCHEDULE" },
          },
        ],
      },
      closed_menu: {
        type: "menu",
        text: operatingHoursText,
        fallbackText: invalidText,
        showBackCommand: false,
        invalidSelectionAction: {
          action: "HANDOFF",
          text: handoffText,
          ...general,
          context: secultHandoffContext("fora_expediente", generalTarget.department, generalTarget.queue),
          handoffSummary: "Atendimento fora de expediente",
        },
        options: [
          { label: "4 - Dúvidas Técnicas - Plataforma Mapa Cultural", next: "mapa_menu" },
          { label: "5 - Fundarpe", next: "fundarpe_menu" },
          { label: "7 - Cultura Viva", next: "cultura_viva_menu" },
        ],
      },
      main_menu: {
        type: "menu",
        text:
          `Seja bem-vindo (a) ao Canal de Atendimento da Secretaria de Cultura de Pernambuco.\nSalve meu contato, beleza? 😁\nAntes de solicitar falar com um/uma atendente, verifique sempre se nas numerações das opções se já encontra a solução para sua questão. Após entrar na fila de atendimento você não poderá retornar para as opções iniciais.\n\nAO DIGITAR # VOCÊ SERÁ ENCAMINHADO PARA O MENU INICIAL OU ANTERIOR.\n\n${operatingHoursText}`,
        fallbackText: invalidText,
        showBackCommand: false,
        options: [
          {
            label: "1 - Dúvidas gerais - PNAB",
            next: "handoff_pnab",
            ...general,
            context: secultHandoffContext("pnab", generalTarget.department, generalTarget.queue),
          },
          {
            label: "2 - Dúvidas Lei Paulo Gustavo - Prestação de Contas",
            next: "handoff_lpg",
            ...general,
            context: secultHandoffContext("lei_paulo_gustavo", generalTarget.department, generalTarget.queue),
          },
          {
            label: "3 - Dúvidas gerais - Outros Editais",
            next: "handoff_outros_editais",
            ...general,
            context: secultHandoffContext("outros_editais", generalTarget.department, generalTarget.queue),
          },
          { label: "4 - Dúvidas Técnicas - Plataforma Mapa Cultural", next: "mapa_menu" },
          { label: "5 - Fundarpe", next: "fundarpe_menu" },
          {
            label: "6 - Agente de Suporte para Busca Ativa",
            next: "handoff_busca_ativa",
            ...general,
            context: secultHandoffContext("busca_ativa", generalTarget.department, generalTarget.queue),
          },
          { label: "7 - Cultura Viva", next: "cultura_viva_menu" },
          {
            label: "8 - Outros",
            next: "handoff_outros",
            ...general,
            context: secultHandoffContext("outros", generalTarget.department, generalTarget.queue),
          },
        ],
      },
      mapa_menu: {
        type: "menu",
        text: "😁 Digite o número de acordo com o assunto desejado:\n\n👉 *4 - Dúvidas Técnicas - Plataforma Mapa Cultural:*",
        fallbackText: invalidText,
        options: [
          { label: "1 - Acesse o Mapa Cultural de Pernambuco", next: "mapa_link" },
          { label: "2 - Tutorial: Cadastro de Agente Cultural", next: "mapa_tutorial" },
          {
            label: "3 - Falar com atendimento técnico",
            next: "mapa_handoff",
            ...technical,
            visibilityCondition: { departmentAvailability: "OPEN" },
            context: secultHandoffContext("mapa_cultural_atendimento", technicalTarget.department, technicalTarget.queue),
          },
        ],
      },
      mapa_link: {
        type: "text",
        text:
          "Mapa Cultural de Pernambuco\nO Mapa Cultural de Pernambuco é uma plataforma livre, gratuita e colaborativa de mapeamento da Secretaria da Cultura do Estado de Pernambuco e da Fundação do Patrimônio Histórico e Artístico de Pernambuco.\n\nClicando no link abaixo você terá acesso à Plataforma do Mapa Cultural de Pernambuco.\n\nClique Aqui 👉 https://www.mapacultural.pe.gov.br/\n\nDigite # e você retornará para as opções anteriores.\nCaso você ainda tenha interesse em outras informações sobre a Plataforma do Mapa Cultural de Pernambuco, digite as numerações que eu te disse anteriormente. Ok? ☺️",
        next: "mapa_menu",
      },
      mapa_tutorial: {
        type: "text",
        text:
          "Clicando no link abaixo você terá acesso ao vídeo tutorial ensinando o passo a passo de como realizar o cadastro de Agente Individual no Mapa Cultural.\n\nClique Aqui 👉 https://www.youtube.com/watch?v=X7cdEEfE5hM\n\nDigite # e você retornará para as opções anteriores.\nCaso você ainda tenha interesse em outras informações sobre o Mapa Cultural de Pernambuco, digite as numerações que eu te disse anteriormente. Ok? ☺️",
        next: "mapa_menu",
      },
      fundarpe_menu: {
        type: "menu",
        text: "😁 Digite o número de acordo com o assunto desejado:\n\n👉 *5 - Fundarpe:*",
        fallbackText: invalidText,
        options: [
          { label: "1 - Contato Fundarpe", next: "fundarpe_contact" },
          {
            label: "2 - Falar com atendimento Fundarpe",
            next: "fundarpe_handoff",
            ...fundarpe,
            context: secultHandoffContext("fundarpe_atendimento", fundarpeTarget.department, fundarpeTarget.queue),
          },
        ],
      },
      fundarpe_contact: {
        type: "text",
        text:
          "*Telefone* (81) 3184-3026 (horário de 9h às 17h, de segunda a sexta-feira)\n*E-mail:* atendimentosic@fundarpe.pe.gov.br",
        next: "fundarpe_menu",
      },
      cultura_viva_menu: {
        type: "menu",
        text: "😁 Digite o número de acordo com o assunto desejado:\n\n👉 *7 - Cultura Viva:*",
        fallbackText: invalidText,
        options: [{ label: "1 - Contatos Cultura Viva", next: "cultura_viva_contact" }],
      },
      cultura_viva_contact: {
        type: "text",
        text:
          "*E-mail:* culturaviva@secult.pe.gov.br e *WhatsApp:* 98494-0511\n(Horário de 08h às 17h, de segunda a sexta-feira)",
        next: "cultura_viva_menu",
      },
      handoff_pnab: { type: "handoff", text: handoffText, ...general },
      handoff_lpg: { type: "handoff", text: handoffText, ...general },
      handoff_outros_editais: { type: "handoff", text: handoffText, ...general },
      handoff_busca_ativa: { type: "handoff", text: handoffText, ...general },
      handoff_outros: { type: "handoff", text: handoffText, ...general },
      fundarpe_handoff: { type: "handoff", text: handoffText, ...fundarpe },
      mapa_handoff: { type: "handoff", text: handoffText, ...technical },
    },
  } satisfies Prisma.InputJsonObject;
}

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
        if (preset !== "re7online-private-intake" && preset !== "secult-pe-demo-consolidated") {
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
  start: "menu_tipo_atendimento",
  nodes: {
    menu_tipo_atendimento: {
      type: "menu",
      text:
        "Olá! Sou o assistente da Re7online.\n\nPara direcionar melhor seu atendimento, escolha uma opção:",
      tags: ["re7online", "intake", "routing"],
      options: [
        {
          label: "Quero conhecer o Converta",
          next: "menu_perfil",
          tags: ["lead", "converta"],
          context: { intent: "learn_converta", service: "converta", relationship: "new_lead" },
        },
        {
          label: "Quero uma apresentação ou proposta",
          next: "menu_perfil",
          tags: ["lead", "demo", "poc"],
          context: { intent: "request_demo", service: "demo_poc", relationship: "new_lead", lead_temp: "quente" },
        },
        {
          label: "Já sou cliente e preciso de suporte",
          next: "perfil_suporte",
          tags: ["support"],
          context: { intent: "support", service: "suporte", relationship: "customer_support" },
        },
      ],
    },
    captura_nome: {
      type: "capture",
      text:
        "Perfeito. Agora vou registrar seus dados para a equipe continuar o atendimento.\n\nQual é o seu nome?",
      field: "contact_name",
      validation: "non_empty",
      errorText: "Informe seu nome para continuar.",
      next: "captura_email",
      tags: ["re7online", "intake", "contact_capture"],
    },
    captura_email: {
      type: "capture",
      text: "Obrigado. Agora informe seu e-mail.",
      field: "contact_email",
      validation: "email",
      errorText: "Informe um e-mail válido para continuar.",
      next: "captura_telefone",
      tags: ["contact_capture"],
    },
    captura_telefone: {
      type: "capture",
      text: "Perfeito. Informe também um telefone com DDD. Exemplo: (84) 99999-9999.",
      field: "contact_phone",
      validation: "phone_br",
      errorText: "Informe um telefone com DDD. Exemplos: (84) 99999-9999 ou 84999999999.",
      next: "menu_objetivo",
      tags: ["contact_capture"],
    },
    captura_nome_governo: {
      type: "capture",
      text:
        "Perfeito. Agora vou registrar seus dados para a equipe continuar o atendimento.\n\nQual é o seu nome?",
      field: "contact_name",
      validation: "non_empty",
      errorText: "Informe seu nome para continuar.",
      next: "captura_email_governo",
      tags: ["re7online", "intake", "contact_capture", "government"],
    },
    captura_email_governo: {
      type: "capture",
      text: "Obrigado. Agora informe seu e-mail.",
      field: "contact_email",
      validation: "email",
      errorText: "Informe um e-mail válido para continuar.",
      next: "captura_telefone_governo",
      tags: ["contact_capture", "government"],
    },
    captura_telefone_governo: {
      type: "capture",
      text: "Perfeito. Informe também um telefone com DDD. Exemplo: (84) 99999-9999.",
      field: "contact_phone",
      validation: "phone_br",
      errorText: "Informe um telefone com DDD. Exemplos: (84) 99999-9999 ou 84999999999.",
      next: "governo_orgao",
      tags: ["contact_capture", "government"],
    },
    menu_objetivo: {
      type: "menu",
      text: "Certo. Qual é o seu objetivo agora?",
      tags: ["re7online", "intake", "objective"],
      options: [
        {
          label: "Conhecer como funciona o Converta",
          next: "empresa_privada",
          tags: ["lead", "converta"],
          context: { intent: "learn_converta", service: "converta" },
        },
        {
          label: "Ver uma apresentação do produto",
          next: "empresa_privada",
          tags: ["lead", "demo", "poc"],
          context: { intent: "request_demo", service: "demo_poc", lead_temp: "quente" },
        },
      ],
    },
    menu_perfil: {
      type: "menu",
      text: "Qual perfil descreve melhor sua necessidade?",
      tags: ["lead", "qualification"],
      options: [
        {
          label: "Empresa privada",
          next: "captura_nome",
          tags: ["business"],
          context: { marketProfile: "business", profile: "business" },
        },
        {
          label: "Governo / órgão público",
          next: "captura_nome_governo",
          tags: ["government"],
          context: { marketProfile: "government", profile: "government", priority: "alta" },
        },
      ],
    },
    menu_inicial: {
      type: "menu",
      text:
        "Olá! Sou o assistente da Re7online.\n\nEscolha o tipo de atendimento:",
      tags: ["re7online", "intake"],
      options: [
        {
          label: "Conhecer o Converta",
          next: "converta_visao_geral",
          tags: ["lead", "converta"],
          context: { intent: "learn_converta", service: "converta" },
        },
        {
          label: "Ver uma apresentação ou proposta",
          next: "perfil_demo",
          tags: ["lead", "demo", "poc"],
          context: { intent: "request_demo", service: "demo_poc" },
        },
        {
          label: "Atendimento para órgão público ou licitação",
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
    empresa_privada: {
      type: "capture",
      text: "Qual é o nome da empresa ou organização?",
      field: "company",
      validation: "non_empty",
      errorText: "Informe o nome da empresa ou organização para continuar.",
      next: "segmento_privado",
      tags: ["business", "qualification"],
    },
    segmento_privado: {
      type: "menu",
      text: "Qual segmento descreve melhor a operação?",
      tags: ["business", "qualification"],
      options: [
        { label: "Varejo", next: "canais_interesse", context: { segment: "retail" }, tags: ["retail"] },
        { label: "Serviços", next: "canais_interesse", context: { segment: "services" }, tags: ["services"] },
        { label: "Escritório", next: "canais_interesse", context: { segment: "office" }, tags: ["office"] },
        { label: "Educação", next: "canais_interesse", context: { segment: "education" }, tags: ["education"] },
        { label: "Saúde", next: "canais_interesse", context: { segment: "healthcare" }, tags: ["healthcare"] },
        { label: "Outro", next: "canais_interesse", context: { segment: "other" }, tags: ["other_segment"] },
      ],
    },
    canais_interesse: {
      type: "menu",
      text: "Quais canais você quer priorizar primeiro?",
      tags: ["business", "channels"],
      options: [
        { label: "WhatsApp", next: "necessidade_privada", context: { channels: "whatsapp" } },
        { label: "Instagram", next: "necessidade_privada", context: { channels: "instagram" } },
        { label: "Facebook/Messenger", next: "necessidade_privada", context: { channels: "messenger" } },
        { label: "Webchat", next: "necessidade_privada", context: { channels: "webchat" } },
        { label: "Multicanal completo", next: "necessidade_privada", context: { channels: "omnichannel" } },
      ],
    },
    converta_visao_geral: {
      type: "menu",
      text:
        "O Converta centraliza WhatsApp, Webchat, Messenger e Instagram em um inbox único, com filas, departamentos, relatórios e automação controlada. Qual ponto você quer aprofundar?",
      tags: ["lead", "converta"],
      options: [
        {
          label: "Apresentação do produto",
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
    governo_orgao: {
      type: "capture",
      text: "Qual é o órgão ou entidade?",
      field: "public_entity",
      validation: "non_empty",
      errorText: "Informe o órgão ou entidade para continuar.",
      next: "governo_municipio",
      tags: ["government", "qualification"],
    },
    governo_municipio: {
      type: "capture",
      text: "Informe município/UF.",
      field: "public_city_uf",
      validation: "non_empty",
      errorText: "Informe município/UF para continuar.",
      next: "governo_estagio",
      tags: ["government", "qualification"],
    },
    governo_estagio: {
      type: "menu",
      text: "Em qual estágio está a demanda?",
      tags: ["government", "bid", "qualification"],
      options: [
        {
          label: "Pesquisa de solução",
          next: "governo_prazo",
          context: { publicSectorContext: "solution_research" },
        },
        {
          label: "Avaliação técnica",
          next: "governo_prazo",
          context: { publicSectorContext: "poc", lead_temp: "quente" },
        },
        {
          label: "Edital em preparação",
          next: "governo_prazo",
          context: { publicSectorContext: "bid_preparation", lead_temp: "quente" },
        },
        {
          label: "Edital publicado",
          next: "governo_prazo",
          context: { publicSectorContext: "published_bid", lead_temp: "quente", priority: "alta" },
        },
        {
          label: "Proposta necessária",
          next: "governo_prazo",
          context: { publicSectorContext: "proposal_needed", lead_temp: "quente", priority: "alta" },
        },
      ],
    },
    governo_prazo: {
      type: "capture",
      text: "Existe algum prazo importante? Se não houver, responda 'sem prazo definido'.",
      field: "deadline",
      validation: "non_empty",
      errorText: "Informe o prazo ou responda 'sem prazo definido'.",
      next: "handoff_governo",
      tags: ["government", "deadline"],
    },
    perfil_demo: {
      type: "menu",
      text:
        "Para direcionar melhor a conversa, selecione o perfil que representa sua necessidade:",
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
        "Qual é a principal necessidade hoje? Essa informação ajuda nossa equipe a preparar uma resposta mais objetiva.",
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
        "Atendemos órgãos públicos com atendimento multicanal, protocolos, filas, relatórios e evidências operacionais.\n\nQual é o contexto?",
      tags: ["government", "qualification"],
      options: [
        {
          label: "Edital ou licitação em andamento",
          next: "handoff_governo",
          tags: ["bid", "deadline"],
          context: { publicSectorContext: "bid" },
        },
        {
          label: "Apresentação para órgão público",
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
      text: "Para suporte, selecione o tipo de situação. Em seguida vamos encaminhar para atendimento humano.",
      tags: ["support", "qualification"],
      options: [
        {
          label: "Acesso/login",
          next: "handoff_suporte",
          tags: ["support", "access"],
          context: { supportType: "access_login" },
        },
        {
          label: "WhatsApp",
          next: "handoff_suporte",
          tags: ["support", "whatsapp"],
          context: { supportType: "whatsapp" },
        },
        {
          label: "Instagram/Facebook",
          next: "handoff_suporte",
          tags: ["support", "meta"],
          context: { supportType: "instagram_facebook" },
        },
        {
          label: "Webchat",
          next: "handoff_suporte",
          tags: ["support", "webchat"],
          context: { supportType: "webchat" },
        },
        {
          label: "Inbox",
          next: "handoff_suporte",
          tags: ["support", "inbox"],
          context: { supportType: "inbox" },
        },
        {
          label: "Relatórios",
          next: "handoff_suporte",
          tags: ["support", "reports"],
          context: { supportType: "reports" },
        },
        {
          label: "Instabilidade",
          next: "handoff_suporte",
          tags: ["support", "incident"],
          context: { supportType: "incident", priority: "alta" },
        },
        {
          label: "Financeiro/comercial",
          next: "handoff_suporte",
          tags: ["support", "commercial"],
          context: { supportType: "commercial" },
        },
      ],
    },
    handoff_comercial: {
      type: "handoff",
      text:
        "Perfeito. Vou encaminhar seu atendimento para um consultor da Re7online.\n\nSe puder, envie também empresa, segmento, quantidade aproximada de atendentes e melhor canal para retorno.",
      handoffSummary:
        "Atendimento comercial qualificado pelo fluxo automatizado Re7online. Coletar nome, empresa, segmento, telefone/WhatsApp, interesse principal, quantidade aproximada de atendentes e canal preferido.",
      tags: ["sales", "human_handoff"],
    },
    handoff_governo: {
      type: "handoff",
      text:
        "Vou encaminhar para nosso atendimento especializado em órgãos públicos.\n\nSe puder, envie órgão/entidade, município/UF, edital ou contexto, prazo e contato responsável.",
      handoffSummary:
        "Atendimento público/licitação qualificado pelo fluxo automatizado Re7online. Coletar órgão/entidade, município/UF, edital ou contexto, prazo, canais exigidos, contato responsável e necessidade de apresentação técnica.",
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

const re7onlineSlaIntakeDefinition = {
  start: "menu_tipo_atendimento",
  nodes: {
    menu_tipo_atendimento: {
      type: "menu",
      text:
        "Olá! Sou o assistente da Re7online.\n\nEscolha o que melhor descreve seu atendimento:",
      tags: ["re7online", "intake", "webchat_site"],
      options: [
        {
          label: "Quero conhecer o Converta / apresentação",
          next: "novo_nome",
          tags: ["commercial", "demo"],
          context: { origin: "webchat_site", interest: "demo", intent: "conhecer_converta" },
        },
        {
          label: "Já sou cliente e preciso de suporte",
          next: "suporte_nome",
          tags: ["support"],
          context: { origin: "webchat_site", interest: "suporte", intent: "support" },
        },
        {
          label: "Sou órgão público / licitação / governo",
          next: "governo_nome",
          tags: ["government", "bid"],
          context: { origin: "webchat_site", interest: "governo", intent: "public_sector", priority: "alta" },
        },
        {
          label: "Quero falar com atendimento",
          next: "humano_nome",
          tags: ["human_handoff"],
          context: { origin: "webchat_site", intent: "human_handoff" },
        },
        {
          label: "Já tenho protocolo",
          next: "protocolo_numero",
          tags: ["protocol_lookup"],
          context: { origin: "webchat_site", intent: "protocol_lookup" },
        },
      ],
    },
    protocolo_numero: {
      type: "capture",
      text: "Informe o protocolo do atendimento. Exemplo: CVT-XXXXXXXXXXXX.",
      field: "protocol_lookup_protocol",
      validation: "non_empty",
      errorText: "Informe o protocolo para continuar.",
      next: "protocolo_confirmacao",
      tags: ["protocol_lookup"],
    },
    protocolo_confirmacao: {
      type: "capture",
      text:
        "Para sua segurança, informe o e-mail ou telefone usado no atendimento anterior. Se esse dado não foi informado, volte ao menu e escolha atendimento humano.",
      field: "protocol_lookup_contact",
      validation: "non_empty",
      errorText: "Informe o e-mail ou telefone usado no atendimento.",
      next: "protocolo_resultado",
      tags: ["protocol_lookup"],
    },
    protocolo_resultado: {
      type: "text",
      text: "Vou verificar o atendimento informado.",
      tags: ["protocol_lookup"],
    },
    novo_nome: {
      type: "capture",
      text: "Claro. Para preparar o contato, qual é o seu nome?",
      field: "contact_name",
      validation: "non_empty",
      errorText: "Informe seu nome para continuar.",
      next: "novo_empresa",
      tags: ["commercial", "qualification"],
    },
    novo_empresa: {
      type: "capture",
      text: "Qual é a empresa ou organização?",
      field: "company",
      validation: "non_empty",
      errorText: "Informe a empresa ou organização para continuar.",
      next: "novo_segmento",
      tags: ["commercial", "qualification"],
    },
    novo_segmento: {
      type: "menu",
      text: "Qual segmento descreve melhor a operação?",
      tags: ["commercial", "qualification"],
      options: [
        { label: "Privado", next: "novo_cidade", context: { segment: "privado" } },
        { label: "Público", next: "novo_cidade", context: { segment: "publico", priority: "media" } },
        { label: "Governo", next: "novo_cidade", context: { segment: "governo", priority: "alta" } },
        { label: "Outro", next: "novo_cidade", context: { segment: "outro" } },
      ],
    },
    novo_cidade: {
      type: "capture",
      text: "Informe cidade/UF.",
      field: "city",
      validation: "non_empty",
      errorText: "Informe cidade/UF para continuar.",
      next: "novo_interesse",
      tags: ["commercial", "qualification"],
    },
    novo_interesse: {
      type: "menu",
      text: "Qual é o principal interesse neste momento?",
      tags: ["commercial", "qualification"],
      options: [
        { label: "Centralizar canais de atendimento", next: "novo_email", context: { interest: "omnichannel" } },
        { label: "Automação e chatbot", next: "novo_email", context: { interest: "automation" } },
        { label: "Relatórios e gestão da equipe", next: "novo_email", context: { interest: "reports" } },
        { label: "Implantação e proposta", next: "novo_email", context: { interest: "proposal", priority: "media" } },
        { label: "Ainda estou avaliando", next: "novo_email", context: { interest: "discovery" } },
      ],
    },
    novo_email: {
      type: "capture",
      text: "Informe um e-mail para retorno.",
      field: "contact_email",
      validation: "email",
      errorText: "Informe um e-mail válido para continuar.",
      next: "novo_telefone",
      tags: ["commercial", "qualification"],
    },
    novo_telefone: {
      type: "capture",
      text: "Informe também um telefone/WhatsApp com DDD.",
      field: "contact_phone",
      validation: "phone_br",
      errorText: "Informe um telefone com DDD. Exemplo: (84) 99999-9999.",
      next: "novo_urgencia",
      tags: ["commercial", "qualification"],
    },
    novo_urgencia: {
      type: "menu",
      text: "Qual é a urgência do contato?",
      tags: ["commercial", "qualification"],
      options: [
        { label: "Alta - preciso falar o quanto antes", next: "novo_horario", context: { priority: "alta" } },
        { label: "Média - posso aguardar retorno", next: "novo_horario", context: { priority: "media" } },
        { label: "Baixa - apenas pesquisando", next: "novo_horario", context: { priority: "baixa" } },
      ],
    },
    novo_horario: {
      type: "capture",
      text: "Qual o melhor horário para nossa equipe entrar em contato?",
      field: "best_contact_time",
      validation: "non_empty",
      errorText: "Informe o melhor horário ou responda 'qualquer horário comercial'.",
      next: "handoff_comercial",
      tags: ["commercial", "qualification"],
    },
    suporte_nome: {
      type: "capture",
      text: "Vamos registrar seu suporte. Qual é o seu nome?",
      field: "contact_name",
      validation: "non_empty",
      errorText: "Informe seu nome para continuar.",
      next: "suporte_empresa",
      tags: ["support", "qualification"],
    },
    suporte_empresa: {
      type: "capture",
      text: "Qual é a empresa ou tenant?",
      field: "tenant",
      validation: "non_empty",
      errorText: "Informe a empresa ou tenant para continuar.",
      next: "suporte_email",
      tags: ["support", "qualification"],
    },
    suporte_email: {
      type: "capture",
      text: "Informe um e-mail para identificarmos este atendimento no futuro.",
      field: "contact_email",
      validation: "email",
      errorText: "Informe um e-mail válido para continuar.",
      next: "suporte_telefone",
      tags: ["support", "qualification"],
    },
    suporte_telefone: {
      type: "capture",
      text: "Informe também um telefone/WhatsApp com DDD.",
      field: "contact_phone",
      validation: "phone_br",
      errorText: "Informe um telefone com DDD. Exemplo: (84) 99999-9999.",
      next: "suporte_canal",
      tags: ["support", "qualification"],
    },
    suporte_canal: {
      type: "menu",
      text: "Qual canal ou área foi afetado?",
      tags: ["support", "qualification"],
      options: [
        { label: "WhatsApp", next: "suporte_tipo", context: { support_channel: "whatsapp" } },
        { label: "Instagram/Facebook", next: "suporte_tipo", context: { support_channel: "instagram_facebook" } },
        { label: "Webchat", next: "suporte_tipo", context: { support_channel: "webchat" } },
        { label: "Inbox / relatórios", next: "suporte_tipo", context: { support_channel: "inbox_reports" } },
        { label: "Acesso / login", next: "suporte_tipo", context: { support_channel: "access" } },
        { label: "Outro", next: "suporte_tipo", context: { support_channel: "other" } },
      ],
    },
    suporte_tipo: {
      type: "menu",
      text: "Que tipo de situação ocorreu?",
      tags: ["support", "qualification"],
      options: [
        { label: "Instabilidade ou indisponibilidade", next: "suporte_urgencia", context: { support_type: "incident", priority: "alta" } },
        { label: "Envio ou recebimento de mensagens", next: "suporte_urgencia", context: { support_type: "messaging" } },
        { label: "Acesso ou permissão", next: "suporte_urgencia", context: { support_type: "access_permission" } },
        { label: "Configuração", next: "suporte_urgencia", context: { support_type: "configuration" } },
        { label: "Relatório ou dados", next: "suporte_urgencia", context: { support_type: "reports_data" } },
        { label: "Outro", next: "suporte_urgencia", context: { support_type: "other" } },
      ],
    },
    suporte_urgencia: {
      type: "menu",
      text: "Qual é a urgência?",
      tags: ["support", "qualification"],
      options: [
        { label: "Alta - operação parada ou crítica", next: "suporte_descricao", context: { priority: "alta" } },
        { label: "Média - impacta parte da operação", next: "suporte_descricao", context: { priority: "media" } },
        { label: "Baixa - dúvida ou ajuste", next: "suporte_descricao", context: { priority: "baixa" } },
      ],
    },
    suporte_descricao: {
      type: "capture",
      text: "Descreva em poucas palavras o que aconteceu.",
      field: "support_description",
      validation: "non_empty",
      errorText: "Informe uma descrição curta para continuar.",
      next: "handoff_suporte",
      tags: ["support", "qualification"],
    },
    governo_nome: {
      type: "capture",
      text: "Certo. Qual é o seu nome?",
      field: "contact_name",
      validation: "non_empty",
      errorText: "Informe seu nome para continuar.",
      next: "governo_orgao",
      tags: ["government", "qualification"],
    },
    governo_orgao: {
      type: "capture",
      text: "Qual é o órgão ou entidade?",
      field: "public_entity",
      validation: "non_empty",
      errorText: "Informe o órgão ou entidade para continuar.",
      next: "governo_cidade",
      tags: ["government", "qualification"],
    },
    governo_cidade: {
      type: "capture",
      text: "Informe cidade/UF.",
      field: "public_city_uf",
      validation: "non_empty",
      errorText: "Informe cidade/UF para continuar.",
      next: "governo_tipo",
      tags: ["government", "qualification"],
    },
    governo_tipo: {
      type: "menu",
      text: "Qual é a necessidade?",
      tags: ["government", "qualification"],
      options: [
        { label: "Edital publicado", next: "governo_prazo", context: { publicSectorContext: "published_bid", priority: "alta" } },
        { label: "Edital em preparação", next: "governo_prazo", context: { publicSectorContext: "bid_preparation", priority: "media" } },
        { label: "Apresentação técnica", next: "governo_prazo", context: { publicSectorContext: "technical_demo" } },
        { label: "Implantação ou contrato", next: "governo_prazo", context: { publicSectorContext: "implementation_contract" } },
        { label: "Pesquisa de solução", next: "governo_prazo", context: { publicSectorContext: "solution_research" } },
      ],
    },
    governo_prazo: {
      type: "capture",
      text: "Existe algum prazo importante? Se não houver, responda 'sem prazo definido'.",
      field: "deadline",
      validation: "non_empty",
      errorText: "Informe o prazo ou responda 'sem prazo definido'.",
      next: "governo_referencia",
      tags: ["government", "qualification"],
    },
    governo_referencia: {
      type: "capture",
      text: "Se houver link, número de edital ou documento, envie aqui. Se não houver, responda 'sem link'.",
      field: "public_reference",
      validation: "non_empty",
      errorText: "Informe a referência ou responda 'sem link'.",
      next: "governo_email",
      tags: ["government", "qualification"],
    },
    governo_email: {
      type: "capture",
      text: "Informe um e-mail para retorno.",
      field: "contact_email",
      validation: "email",
      errorText: "Informe um e-mail válido para continuar.",
      next: "governo_telefone",
      tags: ["government", "qualification"],
    },
    governo_telefone: {
      type: "capture",
      text: "Informe também um telefone/WhatsApp com DDD.",
      field: "contact_phone",
      validation: "phone_br",
      errorText: "Informe um telefone com DDD. Exemplo: (84) 99999-9999.",
      next: "handoff_governo",
      tags: ["government", "qualification"],
    },
    handoff_comercial: {
      type: "handoff",
      text:
        "Obrigado. Já tenho as informações iniciais e vou registrar seu atendimento para a equipe comercial continuar por aqui.",
      handoffSummary:
        "Contato comercial qualificado pelo Webchat Re7online. Revisar nome, empresa, segmento, cidade/UF, interesse, telefone/e-mail, urgência e melhor horário.",
      tags: ["commercial", "human_handoff"],
      context: { targetDepartment: "Comercial", targetQueue: "Fila Comercial", origin: "webchat_site", interest: "demo" },
    },
    handoff_suporte: {
      type: "handoff",
      text:
        "Obrigado. Vou registrar seu atendimento e encaminhar para suporte com prioridade conforme a urgência informada.",
      handoffSummary:
        "Suporte qualificado pelo Webchat Re7online. Revisar empresa/tenant, canal afetado, tipo de problema, urgência e descrição curta.",
      tags: ["support", "human_handoff"],
      context: { targetDepartment: "Suporte", targetQueue: "Fila Suporte", origin: "webchat_site", interest: "suporte" },
    },
    handoff_governo: {
      type: "handoff",
      text:
        "Obrigado. Vou registrar seu atendimento e direcionar para nossa equipe especializada em órgãos públicos e licitações.",
      handoffSummary:
        "Atendimento público/licitação qualificado pelo Webchat Re7online. Revisar órgão, cidade/UF, necessidade, prazo, referência/documento, e-mail e telefone.",
      tags: ["government", "bid", "human_handoff"],
      context: { targetDepartment: "Governo e Licitações", targetQueue: "Fila Governo", origin: "webchat_site", interest: "governo", priority: "alta" },
    },
    handoff_humano: {
      type: "handoff",
      text: "Tudo bem. Vou encaminhar seu atendimento para uma pessoa da equipe Re7online.",
      handoffSummary: "Visitante solicitou atendimento humano diretamente pelo Webchat Re7online.",
      tags: ["human_handoff"],
      context: { targetDepartment: "Atendimento Geral", targetQueue: "Fila Geral", origin: "webchat_site" },
    },
    humano_nome: {
      type: "capture",
      text: "Tudo bem. Para registrar o atendimento, qual é o seu nome?",
      field: "contact_name",
      validation: "non_empty",
      errorText: "Informe seu nome para continuar.",
      next: "humano_email",
      tags: ["human_handoff", "qualification"],
    },
    humano_email: {
      type: "capture",
      text: "Informe um e-mail para identificarmos este atendimento no futuro.",
      field: "contact_email",
      validation: "email",
      errorText: "Informe um e-mail válido para continuar.",
      next: "humano_telefone",
      tags: ["human_handoff", "qualification"],
    },
    humano_telefone: {
      type: "capture",
      text: "Informe também um telefone/WhatsApp com DDD.",
      field: "contact_phone",
      validation: "phone_br",
      errorText: "Informe um telefone com DDD. Exemplo: (84) 99999-9999.",
      next: "handoff_humano",
      tags: ["human_handoff", "qualification"],
    },
  },
} satisfies Prisma.InputJsonObject;

function getPresetDefinition(options: Options) {
  if (options.preset === "re7online-private-intake") {
    return {
      name: "Re7online Automated Intake",
      definition: re7onlineSlaIntakeDefinition,
      routingTargets: re7onlineRoutingTargets as readonly RoutingTarget[],
      legacyFlowNames: [] as readonly string[],
    };
  }
  if (options.preset === "secult-pe-demo-consolidated") {
    return {
      name: "SECULT-PE - Boas-vindas e triagem",
      definition: buildSecultDemoConsolidatedDefinition(),
      routingTargets: secultDemoRoutingTargets as readonly RoutingTarget[],
      legacyFlowNames: ["Atendimento SECULT/PE - Espelho operacional"] as readonly string[],
    };
  }
  fail(`preset desconhecido: ${options.preset}`);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function slugifyDepartmentName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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
    const existingRouting = await Promise.all(
      preset.routingTargets.map(async (target) => {
        const department = await prisma.department.findFirst({
          where: { clientId: client.id, name: target.department },
          select: {
            id: true,
            name: true,
            isActive: true,
            queues: {
              where: { name: target.queue },
              select: { id: true, name: true },
              take: 1,
            },
          },
        });
        return {
          ...target,
          departmentId: department?.id ?? null,
          departmentActive: department?.isActive ?? false,
          queueId: department?.queues[0]?.id ?? null,
        };
      })
    );
    const flowDefinition = options.preset === "secult-pe-demo-consolidated"
      ? buildSecultDemoConsolidatedDefinition(existingRouting)
      : preset.definition;
    const validation = validateChatbotFlowDefinition(flowDefinition);
    if (!validation.ok) {
      fail(`preset inválido: ${validation.message}`);
    }
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

    for (const target of existingRouting) {
      if (!target.departmentId) {
        actions.push({
          action: "create",
          target: "Department",
          detail: { name: target.department, slug: slugifyDepartmentName(target.department) },
        });
      } else if (!target.departmentActive) {
        actions.push({
          action: "update",
          target: "Department",
          detail: { id: target.departmentId, name: target.department, set: { isActive: true } },
        });
      }
      if (!target.queueId) {
        actions.push({
          action: "create",
          target: "Queue",
          detail: { name: target.queue, department: target.department },
        });
      }
    }

    if (preset.legacyFlowNames.length > 0) {
      for (const name of preset.legacyFlowNames) {
        const legacyFlow = await prisma.chatbotFlow.findFirst({
          where: { clientId: client.id, name },
          select: { id: true, name: true, isActive: true, entryPoint: true, definition: true },
        });
        if (legacyFlow) {
          actions.push({
            action: "deprecate",
            target: "ChatbotFlow",
            detail: {
              id: legacyFlow.id,
              name: legacyFlow.name,
              set: { isActive: false, entryPoint: false, metadata: "legacy_deprecated" },
            },
          });
        }
      }
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
            definition: flowDefinition,
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
            definition: flowDefinition,
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

      for (const target of preset.routingTargets) {
        let department = await tx.department.findFirst({
          where: { clientId: client.id, name: target.department },
          select: { id: true, isActive: true },
        });
        if (!department) {
          department = await tx.department.create({
            data: {
              clientId: client.id,
              name: target.department,
              slug: slugifyDepartmentName(target.department),
              isActive: true,
            },
            select: { id: true, isActive: true },
          });
        } else if (!department.isActive) {
          await tx.department.update({
            where: { id: department.id },
            data: { isActive: true },
          });
        }
        const queue = await tx.queue.findFirst({
          where: { clientId: client.id, departmentId: department.id, name: target.queue },
          select: { id: true },
        });
        if (!queue) {
          await tx.queue.create({
            data: {
              clientId: client.id,
              departmentId: department.id,
              name: target.queue,
            },
          });
        }
      }

        for (const name of preset.legacyFlowNames) {
          const legacyFlow = await tx.chatbotFlow.findFirst({
            where: { clientId: client.id, name },
            select: { id: true, definition: true },
          });
          if (!legacyFlow) continue;
          const definition = asRecord(legacyFlow.definition);
          const metadata = asRecord(definition.metadata);
          await tx.chatbotFlow.update({
            where: { id: legacyFlow.id },
            data: {
              isActive: false,
              entryPoint: false,
              definition: {
                ...definition,
                metadata: {
                  ...metadata,
                  legacy: true,
                  deprecated: true,
                  supersededBy: preset.name,
                },
              } as Prisma.InputJsonValue,
            },
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
