import type { AppCrmImportOperation, AppSession } from "./appClientApi";
export const importRecoveryKey = (s: AppSession) => `crm-import:${s.baseUrl}:${s.user.clientId}:${s.user.id}`;
export const importIsTerminal = (o: AppCrmImportOperation | null) => o?.status === "COMPLETED" || o?.status === "FAILED";
export function importOperationMessage(o: AppCrmImportOperation) {
  if (o.status === "COMPLETED") return "Importação concluída. O resumo abaixo corresponde à operação registrada.";
  if (o.status === "FAILED") return "A importação foi recusada antes de gravar contatos. Consulte o motivo antes de iniciar outra.";
  if (o.status === "PROCESSING") return `Importação em processamento. ${o.progress?.processed ?? 0} linha(s) com resultado registrado.`;
  return "Resultado ainda desconhecido. Não repita a importação: consulte novamente esta operação. Gravações anteriores podem ter sido concluídas.";
}
export function mergeImportObservation(current: AppCrmImportOperation | null, incoming: AppCrmImportOperation) {
  if (current && (current.operationId !== incoming.operationId || importIsTerminal(current))) return current;
  if (current?.progress && incoming.progress && incoming.progress.processed < current.progress.processed) return current;
  if (current?.progress && !incoming.progress) return { ...incoming, progress: current.progress };
  return incoming;
}
