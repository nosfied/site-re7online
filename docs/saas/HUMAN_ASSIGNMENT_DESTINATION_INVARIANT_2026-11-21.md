# Invariante de destino da atribuição humana

**Estado:** `LOCAL_VALIDATED / NOT_MERGED / NOT_DEPLOYED / OWNER_REVIEW_REQUIRED`.

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
transação serializável exige token presente, executa CAS do
`ConversationRuntimeState` e persiste projeção SQL, histórico de atribuição,
protocolo e auditoria como unidade. Token ausente/stale ou conflito retorna
`conversation_changed`; falha de projeção desfaz runtime e eventos. Destino ausente/inativo,
fila ausente/divergente, cross-tenant, atendente inelegível ou capacidade negam
antes da escrita. `HUMAN/WAITING` sem atendente durante handoff pendente não é
alterado por esta rota.

## Compatibilidade

- Tendência BOT sem destino usa somente `Atendimento Geral` e sua fila
  operacional autenticada.
- CRA-PR sem handoff explícito usa somente o padrão do próprio tenant.
- Demo com handoff explícito preserva os IDs autenticados.
- RBAC, memberships, capacidade, destinos explícitos, handoff e políticas
  existentes não são relaxados. Transferência de atendente sem setor retorna
  `conversation_department_required`; a UI oculta essa ação inválida sem impedir
  a operação separada de transferência de setor.

## Cobertura dos escritores

- `claim|assign`: destino resolvido antes do efeito; token obrigatório e transação
  única para runtime, projeções e eventos.
- `transfer`: setor explícito e fila operacional autenticada; mesma exclusão CAS
  e atomicidade.
- handoffs Meta/Web e automações que entram em `HUMAN/WAITING` com
  `assignedUserId=null` não são atribuições concluídas e não recebem fallback.
- início manual pelo CRM permanece fluxo próprio; sua atomicidade não é alegada
  por este PR sem prova de equivalência.

Não há migration, mudança de schema ou worker. O frontend muda apenas a negativa
de transferência de atendente sem destino. A reparação da conversa
3209 é uma transação produtiva separada e depende de autorização do Owner.
