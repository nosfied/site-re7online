import type { TenantConfig } from "../config/tenantConfig.js";
import type { ConversationEvaluationDataset } from "./evaluation.types.js";

const tendenciaFixture: TenantConfig = {
  id: "tendencia-modas",
  name: "Tendência Multimarcas",
  metaPhoneNumberId: "evaluation-only",
  allowlist: [],
  handoffAttendantWaid: "",
  defaultLanguage: "pt_BR",
  disableLegacyFlows: true,
  disableChatbot: true,
  disableIntentClassifier: true,
  aiAssistantEnabled: true,
  aiAssistantFallbackToHandoff: true,
  aiAssistantHandoffKeywords: [
    "humano",
    "atendente",
    "vendedora",
    "pessoa da equipe",
    "quero falar",
  ],
  aiAssistantHandoffPrompt:
    "Esse atendimento pode ser melhor acompanhado por uma pessoa da equipe. Posso te encaminhar?",
  aiAssistantIntentCatalog: [
    {
      key: "showroom_visita",
      title: "Visita ao showroom",
      topics: [
        "onde fica",
        "qual endereço",
        "qual endereco",
        "fica em mossoró",
        "fica em mossoro",
        "a loja fica em mossoró",
        "a loja fica em mossoro",
        "mossoró rn",
        "mossoro rn",
      ],
      response:
        "Sim, a Tendência Multimarcas fica em Mossoró/RN, no Bairro Aeroporto, Rua Felipe Camarão, nº 1570, em frente ao antigo posto de Rubinho e ao lado da galeteria Top Frango.",
      nextQuestion:
        "Você quer que eu direcione para a equipe confirmar o melhor horário de atendimento?",
      leadTemp: "quente",
      priority: "alta",
      handoff: true,
      preQualification: true,
      tags: ["intent:showroom_visita", "area:comercial", "service:showroom"],
    },
    {
      key: "duvida_produto_comercial",
      title: "Dúvida comercial sobre produto",
      topics: [
        "qual tecido",
        "que tecido",
        "é qual tecido",
        "e qual tecido",
        "tecido dessa peça",
        "tecido dessa peca",
        "qual tamanho",
        "tem qual tamanho",
        "tamanho dessa peça",
        "tamanho dessa peca",
      ],
      response:
        "Essa informação precisa ser confirmada pela equipe conforme a peça e a disponibilidade atual.",
      nextQuestion:
        "Posso direcionar você para uma pessoa da equipe confirmar tecido, tamanho ou disponibilidade?",
      leadTemp: "quente",
      priority: "alta",
      handoff: true,
      preQualification: true,
      tags: ["intent:duvida_produto_comercial", "area:comercial", "service:produto_interesse"],
    },
  ],
  aiQualification: {
    enabled: true,
    semanticResolverEnabled: true,
    semanticConfirmationEnabled: true,
    semanticConfirmation: {
      enabled: true,
      minimumConfidence: 0.6,
      autoAcceptConfidence: 0.85,
      expirationMinutes: 30,
    },
    schemaVersion: "evaluation-1",
    slots: [
      {
        key: "tipo_atendimento",
        label: "Tipo de atendimento",
        type: "enum",
        required: true,
        allowedValues: ["atacado", "varejo"],
        captureHints: ["atacado", "revenda", "lojista", "varejo", "uso próprio"],
        question: "Você procura atendimento para atacado ou varejo?",
        crmMapping: {
          flowContextKey: "tipo_atendimento",
          leadTemp: "quente",
          priority: "alta",
          whenValue: ["atacado"],
        },
      },
      {
        key: "empresa_loja",
        label: "Loja ou cidade",
        type: "text",
        requiredWhen: { tipo_atendimento: "atacado" },
        question: "Qual é o nome da sua loja ou a cidade onde você atende?",
        crmMapping: {
          flowContextKey: "empresa_loja",
          leadField: "company",
        },
      },
      {
        key: "produto_interesse",
        label: "Produto de interesse",
        type: "text",
        required: true,
        question: "Qual peça ou acessório você procura primeiro?",
        crmMapping: {
          flowContextKey: "produto_interesse",
          leadField: "service",
        },
      },
      {
        key: "detalhe_produto",
        label: "Detalhe do produto",
        type: "text",
        question: "Você procura alguma cor, tamanho ou estilo específico?",
        askAfter: ["produto_interesse"],
      },
      {
        key: "duvida_principal",
        label: "Dúvida principal",
        type: "enum",
        allowedValues: [
          "catálogo",
          "valores",
          "disponibilidade",
          "formas de pagamento",
          "visita ao showroom",
          "entrega",
        ],
        captureHints: [
          "catálogo",
          "catalogo",
          "preço",
          "preco",
          "valor",
          "valores",
          "disponível",
          "disponivel",
          "pagamento",
          "showroom",
          "entrega",
        ],
        semanticAliases: {
          catálogo: ["modelos", "modelos novos", "opções", "opcoes", "novidades"],
          valores: ["quanto fica", "quanto custa", "preço", "preco", "valor"],
          disponibilidade: ["tem peça nova", "tem peca nova", "tem disponível", "disponivel"],
        },
        question:
          "Você quer confirmar catálogo, valores, disponibilidade, formas de pagamento, visita ao showroom ou entrega?",
        askAfter: ["detalhe_produto", "produto_interesse"],
      },
    ],
    handoffWhen: ["catálogo", "valores", "disponibilidade", "all:tipo_atendimento+produto_interesse+duvida_principal"],
    outcomes: ["lead_varejo_qualificado", "lead_atacado_qualificado", "pedido_humano"],
    commercialContinuation: {
      enabled: true,
      negativeReply:
        "Sem problema. Posso te ajudar com catálogo, valores, disponibilidade ou direcionar para a equipe?",
      ambiguousEnumReply:
        "Certo. Você quer confirmar catálogo, valores, disponibilidade, formas de pagamento, visita ao showroom ou entrega?",
    },
  },
};

const noQualificationFixture: TenantConfig = {
  id: "evaluation-no-qualification",
  name: "Evaluation No Qualification",
  metaPhoneNumberId: "evaluation-only",
  allowlist: [],
  handoffAttendantWaid: "",
  defaultLanguage: "pt_BR",
  disableLegacyFlows: true,
  aiAssistantEnabled: true,
  aiAssistantHandoffKeywords: ["humano", "atendente", "pessoa da equipe"],
};

export const defaultEvaluationDataset: ConversationEvaluationDataset = {
  id: "default-operational-regression",
  description: "Operational replay dataset for supervised AI qualification regressions.",
  tenantFixtures: {
    "tendencia-modas": tendenciaFixture,
    "evaluation-no-qualification": noQualificationFixture,
  },
  cases: [
    {
      id: "tendencia-varejo-catalogo",
      tenantKey: "tendencia-modas",
      description: "Retail catalog qualification should complete and activate supervised handoff.",
      turns: [
        { inbound: "oi", expected: { shouldAvoidFallback: true } },
        {
          inbound: "varejo",
          expected: { qualificationSlots: { tipo_atendimento: "varejo" }, shouldAvoidFallback: true },
        },
        {
          inbound: "blusa",
          expected: { qualificationSlots: { produto_interesse: "blusa" }, shouldAvoidFallback: true },
        },
        {
          inbound: "quero ver os modelos",
          expected: {
            qualificationSlots: { duvida_principal: "catálogo" },
            expectedSemanticIntent: "answer_slot",
            expectedHandoff: true,
            shouldAvoidFallback: true,
          },
        },
        {
          inbound: "sim",
          expected: { expectedMode: "HUMAN", expectedStatus: "WAITING", shouldAvoidFallback: true },
        },
      ],
    },
    {
      id: "tendencia-atacado-catalogo",
      tenantKey: "tendencia-modas",
      description: "Wholesale catalog qualification should preserve company, product and detail slots.",
      turns: [
        { inbound: "atacado", expected: { qualificationSlots: { tipo_atendimento: "atacado" } } },
        {
          inbound: "loja vestimenta natal rn",
          expected: { qualificationSlots: { empresa_loja: "loja vestimenta natal rn" } },
        },
        { inbound: "vestido", expected: { qualificationSlots: { produto_interesse: "vestido" } } },
        {
          inbound: "várias cores e tamanhos",
          expected: { qualificationSlots: { detalhe_produto: "várias cores e tamanhos" } },
        },
        {
          inbound: "quero catálogo",
          expected: { qualificationSlots: { duvida_principal: "catálogo" }, expectedHandoff: true },
        },
        { inbound: "sim", expected: { expectedMode: "HUMAN", expectedStatus: "WAITING" } },
      ],
    },
    {
      id: "tendencia-pedido-humano-prioritario",
      tenantKey: "tendencia-modas",
      description: "Human request must not be captured as a product/detail slot.",
      turns: [
        { inbound: "varejo", expected: { qualificationSlots: { tipo_atendimento: "varejo" } } },
        { inbound: "blusa", expected: { qualificationSlots: { produto_interesse: "blusa" } } },
        {
          inbound: "quero falar com vendedora",
          expected: {
            expectedHandoff: true,
            shouldAvoidTopic: ["quero falar com vendedora"],
            shouldAvoidFallback: true,
          },
        },
      ],
    },
    {
      id: "tendencia-duvida-produto-comercial",
      tenantKey: "tendencia-modas",
      description: "Retail product questions about fabric, size or availability must not trigger legal guardrails.",
      turns: [
        {
          inbound: "Essa bermuda branca, é qual tecido?",
          expected: {
            expectedHandoff: true,
            shouldAvoidFallback: true,
            shouldAvoidTopic: ["documentos", "informações específicas"],
            expectedOutputContains: ["equipe", "tecido"],
          },
        },
      ],
    },
    {
      id: "tendencia-negativa-explicita",
      tenantKey: "tendencia-modas",
      description: "Explicit negative must not become positive confirmation.",
      turns: [
        {
          inbound: "não quero que direcione",
          expected: { shouldAvoidFallback: true, expectedMode: "BOT" },
        },
      ],
    },
    {
      id: "tendencia-semantic-confirmation",
      tenantKey: "tendencia-modas",
      description: "Intermediate semantic confidence creates and consumes pending confirmation.",
      initialState: {
        aiQualification: {
          enabledSnapshot: true,
          schemaVersion: "evaluation-1",
          stage: "collecting",
          currentSlot: "duvida_principal",
          slots: { tipo_atendimento: "varejo", produto_interesse: "blusa" },
          completedSlots: ["tipo_atendimento", "produto_interesse"],
          missingSlots: ["duvida_principal"],
          lastQuestion:
            "Você quer confirmar catálogo, valores, disponibilidade, formas de pagamento, visita ao showroom ou entrega?",
          readyForHandoff: false,
        },
      },
      turns: [
        {
          inbound: "acho que queria ver os modelos",
          expected: {
            expectedPendingConfirmation: true,
            expectedSemanticIntent: "answer_slot",
            shouldAvoidFallback: true,
          },
        },
        {
          inbound: "sim",
          expected: {
            qualificationSlots: { duvida_principal: "catálogo" },
            expectedPendingConfirmation: false,
            expectedHandoff: true,
          },
        },
      ],
    },
    {
      id: "no-qualification-handoff-regression",
      tenantKey: "evaluation-no-qualification",
      description: "Tenant without aiQualification should not create qualification or semantic confirmation state.",
      turns: [
        {
          inbound: "quero falar com atendente",
          expected: {
            expectedHandoff: true,
            expectedPendingConfirmation: false,
            shouldAvoidFallback: true,
          },
        },
      ],
    },
  ],
};
