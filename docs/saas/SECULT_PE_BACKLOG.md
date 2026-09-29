# SECULT-PE Backlog

## Fechamento SECULT — confirmação do owner em 29/09/2026

**DEPLOYED / CLIENT ACCEPTED.** Deifson informou: “SECULT aprovou. Já está
utilizando a nova atualização.” Ativação e uso registrados conforme esse relato;
não foram informados horário, executor da ativação ou casos específicos exercitados.
A confirmação do cliente é distinta das verificações técnicas e testes locais.
A pendência de ativação registrada na janela anterior fica superada pelo relato,
sem reescrever sua evidência histórica ou afirmar nova leitura técnica da chave.
Permanecem os limites de shutdown, tipagem e rollback documentados; escritores
compatíveis são necessários para preservar a garantia de concorrência.
Campanhas/CRA aguardam validação funcional do owner; inatividade no Guia pausada;
DB-only encerrada/aceita; 6683 CLOSED. Telegram e DELIVERED/READ separados.


## Estado vigente — janela SECULT de 29/09/2026

**Código implantado; ativação SECULT e aceite funcional pendentes.** API/frontend
`a3d16d4b`, worker mínimo `bf5f1d76` + cinco fontes `f06d49cb` (pacote `042e386a`).
[Fechamento técnico, backup, horários, limites e retorno](SECULT_ROLLOUT_2026-09-29.md).
Campanhas reabertas (geração 5), scheduler observado; Inbox/CRM confirmados pelo
owner. Chave permanece desligada em todos os tenants: falta sessão legítima ou
grant de suporte existente para o setter SECULT. Sem contorno de RBAC/SQL.
Compatibilidade de API/worker/scripts deve ser mantida; retorno a escritores antigos
perde a garantia concorrente. Primeira interrupção autorizada não comprova drain
retroativo do worker. Campanhas/CRA aguardam validação funcional do owner; DB-only
encerrada, inatividade no Guia pausada, 6683 CLOSED. Registros abaixo preservam
o escopo e o estado histórico de cada etapa.


## SECULT — publicação para revisão após Node20 — 29/09/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Node v20.20.0 exato: 65 módulos carregados sem
entrypoint, 104 testes PASS (29+45+30), dependências inalteradas. [Provas e limites](../reviews/secult-worker-persistence/NODE20_RESULTS.md).
Material somente para revisão: patch de cinco fontes, receita/manifesto, proposta
de parada e plano. G1 revisão/configuração e G2 parada continuam abertos. Primeira
interrupção não tem drain comprovado; sem implementação de shutdown. Campanhas/CRA
aguardam owner; legados sem prova não precisam ser liberados; 6683 CLOSED.


## SECULT — backport escolhido, pacote fonte reproduzido — 29/09/2026

**REVISÃO LOCAL / NOT DEPLOYED.** Direção do owner: worker mínimo sobre bf5f1d76;
cinco fontes f06 separadas da API/frontend. Reconstrução limpa pelos lockfiles:
92 compilados idênticos. [Diff exato, manifesto e proposta completa](../reviews/secult-worker-persistence/README.md).
G1 revisão/runtime alvo e G2 parada continuam abertos. Nova correção de shutdown não
implementada; primeira interrupção antiga tem risco próprio, sem prova retroativa.
Retorno preferencial compatível+chave false não se confunde com API antiga sem SECULT,
que perde garantia de persistência. Legados sem comprovação não precisam ser
liberados; sem backfill/inferência/corte temporal. Campanhas/CRA aguardam owner.


## SECULT — alternativa mínima do worker e gate de parada — 29/09/2026

**AVALIAÇÃO LOCAL CONCLUÍDA / G1 E G2 ABERTOS / NOT DEPLOYED.** Base bf5f1d76
reproduz 91 JS do bundle real e todos os 65 módulos alcançáveis; pacote/lock/tsconfig
idênticos. Backport experimental de cinco fontes exatas de f06 altera somente quatro
módulos + helper; recomendado para revisão em lugar dos 21 módulos do worker completo.
45 regressões e 30 testes de concorrência PASS; tipagem mantém 13 erros, logs de
44 linhas idênticos baseline/backport. Builds --noCheck não aprovam tipos.

Quatro ensaios dirigidos reproduzem a **falha do shutdown atual**: libera ownership
com socket/inbound/outbound/auth pendentes; store de auth pode reportar falha ignorada
pelo adapter; timeout não é rejeição comprovada. Não existe drain seguro demonstrado.
Proposta mínima de admissão/contagem, conclusão auth e fechamento de transporte antes
de liberar lock apresentada, **não implementada**. Não encerrar HUMAN para deploy.

Rollback feature-aware exige todos os escritores compatíveis; voltar à API antiga
nega CLOSED, porém perde garantia de persistência e exige exclusão de snapshots
antigos antes de qualquer retorno à funcionalidade. Reprodução confirma que escritor
antigo restaura true revogado. Nenhuma produção alterada ou nova implementação SECULT.
[Comparação, artefato, ensaios, proposta de parada e retorno](SECULT_DEPLOY_PLAN_2026-09-29.md).
Campanhas/CRA aguardam owner; DB-only encerrada; Guia inatividade pausado; 6683 CLOSED.


## SECULT — preparação de implantação a3d16d4b — 29/09/2026

**PREFLIGHT READ-ONLY / ARTEFATOS LOCAIS / NOT DEPLOYED.** API/frontend efetivos
e8ebd776; 2.020 hashes conferidos. Worker: checkout 5ee2de6b, mas módulos compartilhados
compilados mais antigos; 21 módulos alcançáveis diferentes/novos no candidato,
incluindo fila operacional, origem CRM e normalização além da dependência SECULT.
**Gate material:** revisar delta adicional do worker e comprovar parada/retorno
WEB_SESSION antes de aprovar janela. Guarda de campanhas não drena todo o worker.
Três WEB_SESSION conectadas; fila/agendamentos vazios são fotografia, não quiescência.
Chave ausente nos dez tenants; nenhuma ativação. Builds isolados API/frontend/worker
passaram, sem converter --noCheck em aprovação de tipos ou aceite produtivo.
[Plano único: versões, delta, artefatos, backup, sequência, retorno e gates](SECULT_DEPLOY_PLAN_2026-09-29.md).
Backup fresco e restauração desse dump ficam para janela autorizada; não realizados
agora. Implantação de todos os escritores compatíveis precede ativação separada
somente secult-pe. Rollback legado perde garantia, exige revogação/exclusão de
escritores antigos. Campanhas/CRA aguardam owner; DB-only encerrada, Guia inatividade
pausado, 6683 CLOSED. Sem commit/push/deploy/restart/cron/admissão nesta preparação.


## SECULT — decisão departamental aplicada localmente — 29/09/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Owner definiu vínculo departamental atual
obrigatório ao departamento do snapshot do encerramento. Perda efetiva do vínculo
revoga consulta; departamento ausente/inativo não concede exceção. Helper único
reutiliza resolvedor canônico com fallback legado, sem estender dispensa de assignee
atual ao responsável histórico. Lista, contagens, detalhe, timeline, mídia e realtime
cobertos; ativos e SUPERVISOR/ADMIN preservados. Mesma Inbox/filtro/histórico.

Código final: **31/31 testes afetados PASS**, build TypeScript backend PASS e smoke
AGENT autenticado com revogação do vínculo e remoção automática do painel/lista.
UI usa polling existente, com atraso visual e sem promessa de revogação instantânea
do conteúdo já exibido. Novas consultas/entregas são negadas. Duas correções anteriores
revalidadas na suíte. As 112 provas/smoke anteriores ficam como histórico, sem
reatribuição integral ao delta; limites de tipagem frontend/worker preservados.
[Decisão, provas e limites](SECULT_OWN_CLOSED_LOCAL_2026-09-28.md). Sem commit/push/deploy/ativação.
API/worker/scripts compatíveis exigidos antes de ativar; rollback a escritores
antigos perde a garantia. Campanhas/CRA aguardam owner; DB-only encerrada, inatividade
no Guia pausada; 6683 CLOSED. A pendência departamental abaixo foi resolvida por esta
nova decisão; registros anteriores preservados como histórico.


## SECULT — revisão local de 48e0fc2a — 29/09/2026

**CORREÇÕES LOCAIS VALIDADAS / NOT DEPLOYED; decisão departamental pendente.**
Falha isolada da nova permissão nega CLOSED sem derrubar os caminhos ativos da
Inbox; erros gerais continuam propagados. Realtime separa invalidação por conversa
e por tenant: handoff de B preserva mensagem pendente de A; transferência/reentrada
na própria conversa e revogação continuam protegidas. Reprodução: 3 falhas em seis
casos antes; 6/6 depois. Regressões afetadas 25/25 e build TypeScript backend PASS.
As 112 provas e smoke anteriores permanecem históricas, sem reatribuição integral
ao delta. UI/worker não alterados nem novamente validados nesta revisão.

Não foi encontrado contrato explícito estendendo a exceção departamental do assignee
atual ao responsável histórico. A afirmação documental anterior foi corrigida;
regra não alterada silenciosamente. Owner deve definir se perda de vínculo revoga
consulta própria CLOSED antes de preparar deploy. [Detalhes, referências e evidências](SECULT_OWN_CLOSED_LOCAL_2026-09-28.md).
API/worker/scripts compatíveis continuam necessários; rollback para escritores
antigos perde garantia de revogação. Campanhas/CRA aguardam owner; DB-only encerrada,
inatividade no Guia pausada; 6683 CLOSED. Sem commit/push/deploy ou ativação.
Os registros anteriores abaixo descrevem as respectivas etapas históricas.


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
