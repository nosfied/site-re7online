# Invariante de destino da atribuição humana

**Estado:** `LOCAL_VALIDATED / NOT_DEPLOYED / OWNER_REVIEW_REQUIRED`.

## Defeito e fronteira

O handler real de `POST /app/conversation/:id/claim|assign` aceitava elegibilidade
com `requireDepartment=false` e podia persistir `HUMAN/IN_PROGRESS` com atendente,
mas `departmentId=null` e `queueId=null`. A transferência posterior falhava em
`conversation_department_required`. O incidente 3209 demonstra esse defeito; o
caso histórico 3009 permanece encerrado e não é reaberto.

## Invariante

Antes da primeira escrita de uma atribuição humana concluída, o backend resolve:

1. departamento explícito já autenticado na conversa; senão
2. departamento operacional padrão ativo do mesmo tenant;
3. a fila deve ser exatamente `Department.operationalQueueId`, válida na relação
   tenant/departamento; fila por nome nunca é aceita.

O destino resolvido alimenta a elegibilidade com departamento obrigatório. Uma
única escrita CAS do `ConversationRuntimeState` persiste atendente, departamento,
fila, status, modo e handoff. Conflito retorna `conversation_changed` antes de
evento, auditoria, protocolo ou projeção adicional. Destino ausente/inativo,
fila ausente/divergente, cross-tenant, atendente inelegível ou capacidade negam
antes da escrita. `HUMAN/WAITING` sem atendente durante handoff pendente não é
alterado por esta rota.

## Compatibilidade

- Tendência BOT sem destino usa somente `Atendimento Geral` e sua fila
  operacional autenticada.
- CRA-PR sem handoff explícito usa somente o padrão do próprio tenant.
- Demo com handoff explícito preserva os IDs autenticados.
- RBAC, memberships, capacidade, UI de transferência e políticas existentes não
  são relaxados.

Não há migration, mudança de schema, worker ou frontend. A reparação da conversa
3209 é uma transação produtiva separada e depende de autorização do Owner.
