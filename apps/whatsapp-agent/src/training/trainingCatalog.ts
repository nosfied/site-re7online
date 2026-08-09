export const TRAINING_CATALOG_VERSION = 1;

export type TrainingCatalogItemType = "video" | "pdf" | "link";

export type TrainingCatalogItem = {
  id: string;
  type: TrainingCatalogItemType;
  title: string;
  description?: string;
  path?: string;
  url?: string;
  durationLabel?: string;
  updatedAt?: string;
  tags?: string[];
  downloadable?: boolean;
};

export type TrainingCatalogSection = {
  id: string;
  title: string;
  description?: string;
  items: TrainingCatalogItem[];
};

export type TrainingCatalogManifest = {
  version: number;
  sections: TrainingCatalogSection[];
};

export const trainingCatalogManifest = {
  version: TRAINING_CATALOG_VERSION,
  sections: [
    {
      id: "getting-started",
      title: "Primeiros passos",
      description: "Conheca os recursos basicos para operar o Converta com seguranca.",
      items: [
        {
          id: "intro-platform-video",
          type: "video",
          title: "Conhecendo o Converta",
          description: "Visao geral da plataforma e dos principais modulos.",
          path: "getting-started/intro-platform.mp4",
          durationLabel: "Video",
          downloadable: false,
          tags: ["primeiros-passos"],
        },
        {
          id: "intro-platform-guide",
          type: "pdf",
          title: "Guia rapido da plataforma",
          description: "Material de apoio para iniciar a operacao.",
          path: "getting-started/intro-platform-guide.pdf",
          downloadable: true,
          tags: ["primeiros-passos"],
        },
      ],
    },
    {
      id: "inbox",
      title: "Caixa de entrada",
      description: "Atendimento, marcacao de mensagens, transferencias e historico.",
      items: [
        {
          id: "inbox-overview-video",
          type: "video",
          title: "Atendimento pelo Inbox",
          description: "Como acompanhar conversas e responder com contexto.",
          path: "inbox/inbox-overview.mp4",
          durationLabel: "Video",
          downloadable: false,
          tags: ["inbox", "atendimento"],
        },
        {
          id: "inbox-operator-guide",
          type: "pdf",
          title: "Guia do operador",
          description: "Resumo operacional para equipes de atendimento.",
          path: "inbox/inbox-operator-guide.pdf",
          downloadable: true,
          tags: ["inbox", "atendimento"],
        },
      ],
    },
    {
      id: "reports",
      title: "Relatorios",
      description: "Leitura gerencial de conversas, SLA, atendentes e sessoes.",
      items: [
        {
          id: "reports-guide",
          type: "pdf",
          title: "Como interpretar relatorios",
          description: "Orientacoes para filtros, indicadores e exportacoes.",
          path: "reports/reports-guide.pdf",
          downloadable: true,
          tags: ["relatorios"],
        },
      ],
    },
  ],
} satisfies TrainingCatalogManifest;
