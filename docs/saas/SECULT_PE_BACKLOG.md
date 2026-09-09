# SECULT-PE Backlog

Status: backlog tecnico/produto para avaliacao apos demonstracao. Este documento nao altera produto, dados ou configuracao.

## Diretriz

Itens abaixo respondem a demandas levantadas pela SECULT-PE, mas nao devem ser prometidos como disponiveis sem nova sprint, especificacao, validacao e autorizacao de deploy.

## Itens

| Prioridade | Item | Descricao | Risco se implementar sem desenho |
| --- | --- | --- | --- |
| P1 | Balanced assignment | Foundation implementada para policy opcional por tenant/departamento com modos manual, round-robin e menor carga ativa. `presenceMode` adicionou `FRESH`, `AVAILABLE` e `IGNORE`, com `AVAILABLE` validado no Demo. Para SECULT, ativacao de `AVAILABLE` permanece pendente de configuracao explicita do cliente/TI e smoke controlado. | Sobrecarga indevida, disputa de claim, quebra de fila/departamento. |
| P1 | Agent presence/session audit | Presenca operacional atual foi exposta no `Painel` para ADMIN/SUPERVISOR, reaproveitando disponibilidade + heartbeat da distribuicao automatica. Historico de login/logout, expiracao, sessao substituida e atividade recente continua pendente como frente separada. | Confusao com controle oficial de ponto e risco trabalhista/compliance. |
| P1 | Close observability | Incidente Maria Helena de fechamento permanece sem raiz provada: reproducao Demo de AGENT close passou, conversa humana dormente pode ser encerrada, mas nao houve request backend real da Maria. Mutacoes criticas do Inbox devem registrar tentativa, ator, conversa, requestId/correlacao, resultado e erro seguro. | Cliente vira fonte de debugging via DevTools; incidentes reais ficam sem trilha suficiente. |
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
- Incidente Maria Helena/capacidade: CLOSED AS PRODUCT BEHAVIOR. Maria tinha
  duas conversas ativas legitimas (`****6185`, `****8282`), ambas
  `HUMAN` / `IN_PROGRESS`, handoff ativo, sem fechamento, sem snapshot e sem
  CSAT; portanto capacidade 2/2 e exclusao de novas atribuicoes estavam
  corretas.
- Round-robin cursor bias permanece watch item / not proven material apos
  `AVAILABLE`; nao recomendar `scope=department`, `maxActive=1` ou rewrite de
  cursor sem nova evidencia apos configuracao real.
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
  Validacao visual humana segue pendente.

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
