import type { AppCrmImportOperation, AppSession } from "./appClientApi";
export const importRecoveryKey = (s: AppSession) => `crm-import:${s.baseUrl}:${s.user.clientId}:${s.user.id}`;
export const importIsTerminal = (o: AppCrmImportOperation | null) => o?.status === "COMPLETED" || o?.status === "FAILED";

type ImportRecoveryStorage = Pick<Storage, "getItem" | "removeItem">;

export type StoredImportRecovery = {
  operationId: string;
  operation: AppCrmImportOperation;
};

export async function recoverStoredImportOperation(
  recoveryKey: string,
  storage: ImportRecoveryStorage,
  fetchOperation: (operationId: string) => Promise<AppCrmImportOperation>
): Promise<StoredImportRecovery | null> {
  const operationId = storage.getItem(recoveryKey);
  if (!operationId) return null;
  try {
    return { operationId, operation: await fetchOperation(operationId) };
  } catch {
    return {
      operationId,
      operation: { ok: true, operationId, status: "UNKNOWN", summary: null, progress: null },
    };
  }
}

export function clearTerminalImportRecovery(
  recoveryKey: string,
  operation: AppCrmImportOperation,
  storage: ImportRecoveryStorage
) {
  if (!importIsTerminal(operation)) throw new Error("import_operation_not_terminal");
  if (storage.getItem(recoveryKey) !== operation.operationId) throw new Error("import_recovery_reference_changed");
  storage.removeItem(recoveryKey);
  if (storage.getItem(recoveryKey) !== null) throw new Error("import_recovery_reference_not_removed");
}

export async function finalizeTerminalImportRecovery(
  recoveryKey: string,
  operation: AppCrmImportOperation,
  storage: ImportRecoveryStorage,
  refreshContactsPageOne: () => Promise<void>
) {
  clearTerminalImportRecovery(recoveryKey, operation, storage);
  try {
    await refreshContactsPageOne();
    return true;
  } catch {
    return false;
  }
}

export function importOperationMessage(o: AppCrmImportOperation) {
  if (o.status === "COMPLETED") return "Importação concluída. O resumo abaixo corresponde à operação registrada.";
  if (o.status === "FAILED") return "A importação foi recusada antes de gravar contatos. Consulte o motivo antes de iniciar outra.";
  if (o.status === "PROCESSING") return `Importação em processamento. ${o.progress?.processed ?? 0} linha(s) com resultado registrado.`;
  if (o.reason === "operation_not_observed") return "Referência preservada, mas a admissão ainda não foi comprovada pela API. Isso não comprova falha nem ausência de gravações. Não repita a importação; consulte novamente esta referência.";
  return "Resultado ainda desconhecido. Não repita a importação: consulte novamente esta operação. Gravações anteriores podem ter sido concluídas.";
}
export function mergeImportObservation(current: AppCrmImportOperation | null, incoming: AppCrmImportOperation) {
  if (current && (current.operationId !== incoming.operationId || importIsTerminal(current))) return current;
  if (current?.progress && incoming.progress && incoming.progress.processed < current.progress.processed) return current;
  if (current?.progress && !incoming.progress) return { ...incoming, progress: current.progress };
  return incoming;
}
