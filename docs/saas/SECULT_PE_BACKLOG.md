# SECULT-PE Backlog

Status: backlog tecnico/produto para avaliacao apos demonstracao. Este documento nao altera produto, dados ou configuracao.

## Diretriz

Itens abaixo respondem a demandas levantadas pela SECULT-PE, mas nao devem ser prometidos como disponiveis sem nova sprint, especificacao, validacao e autorizacao de deploy.

## Itens

| Prioridade | Item | Descricao | Risco se implementar sem desenho |
| --- | --- | --- | --- |
| P1 | Balanced assignment | Foundation implementada para policy opcional por tenant/departamento com modos manual, round-robin e menor carga ativa. A configuracao multitenant existe em `/app/settings/queue`, com leitura para supervisao e alteracao administrativa. Falta runbook de ativacao por tenant e acompanhamento operacional de carga. | Sobrecarga indevida, disputa de claim, quebra de fila/departamento. |
| P1 | Agent presence/session audit | Registro operacional de login, logout, expiracao, sessao substituida e atividade recente. | Confusao com controle oficial de ponto e risco trabalhista/compliance. |
| P2 | Contact social/display name polish | Refinar UX para nome de atendimento/nome social, mantendo historico minimizado e sem expor nome anterior indevido. | Reintroducao de dado sensivel ou conflito com anonimização. |
| P2 | Report filters active/inactive agents | Padronizar relatorios para ocultar inativos por default e permitir historico quando autorizado. | Relatorio inconsistente ou exclusao indevida de evidencias historicas. |
| P2 | Inbox heartbeat/reconnect | Melhorar heartbeat, reconexao, aviso de sessao e refresh controlado da fila/timeline. | Polling excessivo, carga no backend ou falsa sensacao de presenca. |
| P3 | Retification quick action | Acao rapida para mensagem de retificacao apos erro de digitacao, com texto guiado e auditoria. | Operador interpretar como edicao retroativa de mensagem ja entregue. |

## Criterios para Sprint futura

### Balanced assignment

- Status 87O.2: foundation backend reaproveitando `ConversationRuntimeState`, `ConversationAssignment`, usuarios ativos, departamento e `TenantOperationalConfig.config.queueAssignmentPolicy`.
- Status 87O.3: configuracao multitenant exposta em `/app/settings/queue`, sem aceitar `clientId` do frontend e preservando demais chaves de `TenantOperationalConfig.config`.
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
