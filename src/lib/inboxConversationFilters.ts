export const CONVERSATION_FILTERS = [
  { value: "ALL", label: "Todas" },
  { value: "WAITING", label: "Aguardando atendimento" },
  { value: "AUTOMATION", label: "Automação" },
  { value: "IN_PROGRESS", label: "Em atendimento" },
  { value: "WAITING_USER", label: "Aguardando cliente" },
  { value: "CLOSED", label: "Encerradas" },
  { value: "MINE", label: "Minhas" },
  { value: "UNASSIGNED", label: "Sem responsável" },
] as const;

export type ConversationFilter = (typeof CONVERSATION_FILTERS)[number]["value"];

export const PRIMARY_CONVERSATION_FILTERS: ConversationFilter[] = [
  "ALL",
  "MINE",
  "WAITING",
  "AUTOMATION",
];

export const MORE_CONVERSATION_FILTERS = CONVERSATION_FILTERS.filter(
  (item) => !PRIMARY_CONVERSATION_FILTERS.includes(item.value)
);

export const CONVERSATION_FILTER_BY_VALUE = new Map(
  CONVERSATION_FILTERS.map((item) => [item.value, item])
);

export function getMoreConversationFiltersForRole(role: string | null | undefined) {
  const normalizedRole = String(role ?? "").trim().toUpperCase();
  return MORE_CONVERSATION_FILTERS.filter(
    (item) => normalizedRole !== "AGENT" || item.value !== "CLOSED"
  );
}
