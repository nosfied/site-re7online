# SECULT-PE Backlog

Status: backlog tecnico/produto para avaliacao apos demonstracao. Este documento nao altera produto, dados ou configuracao.

## Diretriz

Itens abaixo respondem a demandas levantadas pela SECULT-PE, mas nao devem ser prometidos como disponiveis sem nova sprint, especificacao, validacao e autorizacao de deploy.

## Itens

| Prioridade | Item | Descricao | Risco se implementar sem desenho |
| --- | --- | --- | --- |
| P1 | Balanced assignment | Foundation implementada para policy opcional por tenant/departamento com modos manual, round-robin e menor carga ativa. `presenceMode` adicionou `FRESH`, `AVAILABLE` e `IGNORE`, com `AVAILABLE` validado no Demo. SECULT agora esta aplicada em `round_robin`, `scope=tenant`, `presenceMode=AVAILABLE`, `maxActivePerAgent=2`; validacao organica de distribuicao permanece pendente. | Sobrecarga indevida, disputa de claim, quebra de fila/departamento. |
| P1 | Agent presence/session audit | Presenca operacional atual foi exposta no `Painel` para ADMIN/SUPERVISOR, reaproveitando disponibilidade + heartbeat da distribuicao automatica. Historico de login/logout, expiracao, sessao substituida e atividade recente continua pendente como frente separada. | Confusao com controle oficial de ponto e risco trabalhista/compliance. |
| P1 | Close terminal lifecycle | Telemetria segura de Inbox foi implementada em `a026b176` e provou tentativa/request de Maria, backend close bem-sucedido, protocolo fechado, snapshot existente, assignee limpo, close message + CSAT enviados. Backend close bug: NO. RBAC bug: NO. Residual aberto: evento terminal frontend `close.succeeded` / `close.failed` ausente apos sucesso do backend. | UI pode representar incorretamente uma acao que o backend concluiu, gerando incidente operacional sem erro real de permissao ou fechamento. |
| P2 | Contact social/display name polish | Refinar UX para nome de atendimento/nome social, mantendo historico minimizado e sem expor nome anterior indevido. | Reintroducao de dado sensivel ou conflito com anonimização. |
| P2 | Report filters active/inactive agents | Padronizar relatorios para ocultar inativos por default e permitir historico quando autorizado. | Relatorio inconsistente ou exclusao indevida de evidencias historicas. |
| P2 | Reporting management enhancements | Relatorios centrais estao consistentes apos `f84258d7`, que separou estoque atual de metricas por periodo. Futuro: expor carga ativa/capacidade por atendente, diferenciar atribuicao AUTO vs MANUAL e mostrar policy/presenceMode efetivos para auditoria. | Gestao operacional pode depender de consultas manuais para explicar distribuicao e carga. |
| P2 | Inbox heartbeat/reconnect | Melhorar heartbeat, reconexao, aviso de sessao e refresh controlado da fila/timeline. | Polling excessivo, carga no backend ou falsa sensacao de presenca. |
| P2 | `****6194` cycle-aware audit | Caso separado de Maria: ha snapshot antigo com CSAT respondido e atividade/runtime atual. Requer auditoria por ciclo antes de qualquer classificacao ou reparo. | Reparar dado correto ou misturar ciclos historicos e atuais. |
| P3 | Retification quick action | Acao rapida para mensagem de retificacao apos erro de digitacao, com texto guiado e auditoria. | Operador interpretar como edicao retroativa de mensagem ja entregue. |

## Criterios para Sprint futura

### Balanced assignment

- Status 87O.2: foundation backend reaproveitando `ConversationRuntimeState`, `ConversationAssignment`, usuarios ativos, departamento e `TenantOperationalConfig.config.queueAssignmentPolicy`.
- Status 87O.3: configuracao multitenant exposta em `/app/settings/queue`, sem aceitar `clientId` do frontend e preservando demais chaves de `TenantOperationalConfig.config`.
- Status 2026-09-09: `presenceMode` implementado e validado no Demo. O modo
  `AVAILABLE` mantem elegivel o agente com `available=true` mesmo se o heartbeat
  estiver stale, mas continua excluindo indisponivel explicito, capacidade
  atingida e departamento incorreto.
- SECULT aplicada em `presenceMode=AVAILABLE`, preservando `round_robin`,
  `scope=tenant` e `maxActivePerAgent=2`. Status: APPLIED / ORGANIC
  DISTRIBUTION VALIDATION PENDING.
- Incidente Maria Helena/capacidade: CLOSED AS PRODUCT BEHAVIOR. Maria tinha
  duas conversas ativas legitimas (`****6185`, `****8282`), ambas
  `HUMAN` / `IN_PROGRESS`, handoff ativo, sem fechamento, sem snapshot e sem
  CSAT; portanto capacidade 2/2 e exclusao de novas atribuicoes estavam
  corretas.
- Round-robin cursor bias permanece WATCH ONLY / not proven material apos
  `AVAILABLE`; nao recomendar `scope=department`, `maxActive=1` ou rewrite de
  cursor sem evidencia organica apos configuracao real.
- Default permanece manual quando a policy esta ausente, desabilitada ou em modo `manual`.
- Nenhum tenant existente deve ser ativado sem configuracao explicita e smoke controlado.
- Usar apenas tenant da sessao.
- Considerar departamento/fila.
- Considerar somente usuarios ativos.
- Preservar claim manual existente.
- Registrar evento auditavel de atribuicao automatica.
- Evitar atribuicao quando houver ambiguidade.
- Ter testes de concorrencia ou idempotencia minima.
- Pendencias: runbook de ativacao, telemetria de carga por agente, filtros de acompanhamento por responsavel e decisao sobre notificacao de atribuido.

### Agent presence/session audit

- Status parcial: `Painel > Presenca da equipe` mostra estado operacional atual para supervisao, com escopo por tenant/departamento e a mesma semantica de elegibilidade online usada pela distribuicao automatica.
- Distinguir login/logout voluntario, expiracao, troca de sessao e heartbeat.
- Nao chamar de controle oficial de ponto.
- Exibir apenas agregados e filtros por permissao.
- Sanitizar dados de sessao.
- Definir retencao.

### Nome social/nome de atendimento

- Preferir `displayName` operacional quando ja existir.
- Nao restaurar dados anonimizados.
- Evitar expor nome anterior depois da alteracao.
- Avaliar necessidade de campo dedicado somente com base juridica e migration justificada.

### Relatorios ativo/inativo

- Default: usuarios ativos.
- Historico: inativos apenas quando filtro explicito e permissao adequada.
- Exportacao deve indicar filtro usado.
- Nao remover historico operacional.

### Relatorios de estoque atual

- Status 2026-09-09: bug de verdade operacional corrigido em
  `f84258d7e8dab157fec0cb9dad5d46245d9dd111`.
- `Em atendimento agora`, `Aguardando agora` e `Fechadas agora` representam
  estado atual, nao somente eventos no periodo.
- `Conversas`, `Atendimentos concluidos`, medias de resposta/resolucao, SLA e
  transferencias continuam metricas de periodo/evento.
- Validacao Maria Helena: antes `Ultimas 24 horas + Maria` exibia
  `Em atendimento = 0`; apos fix deve exibir `Em atendimento agora = 2`.
  Validacao visual humana PASS; status REAL VALIDATED / CLOSED.

### Fechamento Maria Helena

- Telemetria segura implantada em `a026b176e6a3f7b010ba247fe6b851b9c375ca70`
  comprovou acao real `inbox-close-0698...` com tentativa e request presentes.
- Backend concluiu o fechamento: protocolo fechado, snapshot existente,
  `closeSource=app_inbox`, `closedBy=Maria`, runtime `CLOSED`, handoff `NONE`,
  assignee limpo, close message + CSAT enviados.
- Reclassificacao: BACKEND CLOSE BUG: NO; RBAC BUG: NO.
- Bug aberto: CLIENT TERMINAL/LIFECYCLE HANDLING CONFIRMED, porque nao houve
  evento terminal frontend `close.succeeded` / `close.failed` apos o sucesso do
  backend.

### Operational alert email

- Demo Web Session segue OPEN / PREEXISTING em `disconnected` / `QR_REQUIRED`.
- Novo item aberto: a queda de conexao Demo nao gerou email observado.
- Raiz ainda nao provada; auditar destinatarios `webSessionAlertEmails`,
  configuracao tenant-scoped vs CRA-only, alertas internos globais e se a
  transicao qualificava para alerta.

### Heartbeat/reconnect

- Detectar perda de conexao.
- Revalidar sessao.
- Recarregar fila e timeline com backoff.
- Evitar simulacao de atividade artificial.
- Informar operador quando sessao expirar.

### Retificacao

- Criar texto padrao editavel antes do envio.
- Registrar evento de retificacao, se necessario.
- Nao editar mensagem ja entregue pelo canal.
- Nao disparar automaticamente.

## Fora de escopo ate nova decisao

- Controle oficial de ponto.
- Dashboard novo de produtividade.
- IA generativa para correcao automatica sem revisao humana.
- Distribuicao automatica sem preservar setor/fila.
- Mudanca estrutural de schema sem justificativa.
- Criacao de modulo paralelo de ticket/case.
