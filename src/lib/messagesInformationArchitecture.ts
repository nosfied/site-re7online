export type MessagesArea = "canned-replies" | "meta-templates";

export type MessagesCapabilities = {
  cannedReplies: boolean;
  templates: boolean;
};

export const MESSAGE_AREA_TABS: Array<{ id: MessagesArea; label: string }> = [
  { id: "canned-replies", label: "Mensagens prontas" },
  { id: "meta-templates", label: "Modelos Meta" },
];

export function resolveMessagesArea(
  requested: string | null | undefined,
  capabilities: MessagesCapabilities
): MessagesArea | null {
  if (requested === "meta-templates" && capabilities.templates) return "meta-templates";
  if (requested === "canned-replies" && capabilities.cannedReplies) return "canned-replies";
  if (capabilities.cannedReplies) return "canned-replies";
  if (capabilities.templates) return "meta-templates";
  return null;
}
