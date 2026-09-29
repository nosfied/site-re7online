# SECULT-PE Backlog

## SECULT — funcionalidade local sobre f06d49cb — 28/09/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Consulta AGENT de sua conversa atualmente CLOSED,
chave `allowAgentOwnClosedConversations=false` por default, gestão SUPERVISOR/ADMIN
na página Inbox existente. Snapshot comprova o responsável do encerramento atual;
sem arquivo por ciclo, nova categoria ou permissão operacional. Dependência de
persistência continua em commit separado. Entrega local de 28/09 preservada;
publicação exclusivamente para revisão autorizada em 29/09, sem deploy/ativação.

Provas: HTTP/DB/socket **10/10**, persistência com setter real **37/37**, regressões
**65/65**; builds backend/frontend PASS. Worker build --noCheck PASS; tipagem estrita
mantém 13 erros preexistentes. Tsc frontend amplo mantém 22 diagnósticos idênticos à
base. Smoke autenticado confirma configuração, Encerradas, consulta, controles
bloqueados e revogação do painel. [Implementação, matriz e limites](SECULT_OWN_CLOSED_LOCAL_2026-09-28.md).

API, worker e scripts precisam ser compatíveis antes da ativação; retorno a escritores
antigos perde a garantia de revogação. Campanhas/CRA aguardam validação funcional do
owner; DB-only encerrada/aceita, inatividade no Guia pausada, 6683 CLOSED. Sem produção.
Revisão de publicação: 22 arquivos; comparação completa das 40 linhas dos 22
diagnósticos frontend idêntica à base f06d49cb, mesmas dependências/compilador,
zero diagnóstico novo. Código validado sem mudanças; 112 provas e smoke reutilizados.
CI push restrito a main/develop; Vercel desabilitado na branch de revisão.
Os registros anteriores abaixo preservam o estado histórico de cada etapa.


Status: backlog tecnico/produto para avaliacao apos demonstracao. Este documento nao altera produto, dados ou configuracao.

## Diretriz

Itens abaixo respondem a demandas levantadas pela SECULT-PE, mas nao devem ser prometidos como disponiveis sem nova sprint, especificacao, validacao e autorizacao de deploy.

## Itens

| Prioridade | Item | Descricao | Risco se implementar sem desenho |
| --- | --- | --- | --- |
| WATCH | Balanced assignment | Foundation implementada para policy opcional por tenant/departamento com modos manual, round-robin e menor carga ativa. A configuracao multitenant existe em `/app/settings/queue`, com leitura para supervisao e alteracao administrativa. SECULT opera com `round_robin`, `scope=tenant`, `presenceMode=AVAILABLE`, `maxActivePerAgent=2`; validacao organica de 2026-09-10 e REAL VALIDATED para comportamento funcional. Fairness e cursor round-robin permanecem somente em observacao. | Sobrecarga indevida, disputa de claim, quebra de fila/departamento se for alterado sem nova evidencia. |
| P1 | Agent presence/session audit | Presenca operacional atual foi exposta no `Painel` para ADMIN/SUPERVISOR, reaproveitando disponibilidade + heartbeat da distribuicao automatica. Historico de login/logout, expiracao, sessao substituida e atividade recente continua pendente como frente separada. | Confusao com controle oficial de ponto e risco trabalhista/compliance. |
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

Validacao organica SECULT em 2026-09-10:

- janela analisada: desde `2026-09-09 11:38:31 -03`, quando
  `presenceMode=AVAILABLE` foi aplicado;
- auto-assignments: 30;
- agentes distintos selecionados: 11;
- Maria Helena recebeu 1 auto-assignment apos voltar a ficar abaixo de 2/2;
- `no_eligible`: 0;
- exclusao apenas por heartbeat stale: 0;
- tamanho do pool elegivel observado nos eventos: 5 a 11;
- Allana recebeu 7/30, Anna 6/30, demais agentes distribuiram o restante;
- classificacao: AVAILABLE REAL VALIDATED por trafego real para elegibilidade
  funcional; concentracao residual em Allana permanece em WATCH, sem bug de
  algoritmo comprovado.

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
