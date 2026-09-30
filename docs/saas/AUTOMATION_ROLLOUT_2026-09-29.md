# Release Automação — execução controlada, 29/09/2026

**DEPLOYED / AUTOMATION NOT ACTIVATED / FUNCTIONAL AUTOMATION ACCEPTANCE PENDING.** Registro da execução autorizada sobre o [plano 3e7c0a84](AUTOMATION_RELEASE_PLAN_2026-09-29.md). Não confundir deploy do código com ativação ou aceite funcional do acompanhamento BOT. `allowAutomationConversationsInInbox` permanece false/ausente em todos os tenants. Correção 91230f88 continua entrega separada da funcionalidade de leitura.

## Artefatos efetivos e retorno

API/frontend: `ba66c24112ccb10f2dfdcced54350f513d399bc6`, código funcional até d06a92b8. Frontend BUILD_ID `l1eBvPioySXt7NLiuFMkg`. Worker exclusivamente `/opt/re7online/releases/worker-bf5f1d76-f06d49cb-91230f88`: base mínima bf5f1d76 + pré-requisito f06d49cb + backport 91230f88; não foi usado o worker completo da API. Hashes de dist/frontend efetivamente ativos conferem com os [manifests dos pacotes](../reviews/automation-worker-backport/RELEASE_ARTIFACTS_2026-09-29.json).

Processos reais após troca: API 1855712, worker 1855921, frontend 1856062, sob PM2 deploy; online, zero restarts, watch=false, cwd/script/env comparados à configuração preparada, Node `/usr/bin/node`. API usa mesma guarda compartilhada/host e scheduler habilitado, sem mudança de flag. Configuração `candidate.ecosystem.config.cjs` privada no PREP abaixo; sem ambiente bruto PM2. Saved/fallback foram atualizados apenas após conferir os três processos.

Retorno compatível disponível e não utilizado: API/frontend a3d16d4b + worker mínimo f06/042e386a, `return.ecosystem.config.cjs`, DB/auth atuais, mesma barreira de saída antes de sucessor. Mantém persistência concorrente/SECULT, mas reintroduz defeito 912. Revogar a chave mantendo binários é cenário diferente; nesta execução não houve ativação a desfazer. Nunca restore/down/reset sobre dados novos, logout, limpeza de auth ou retry incerto.

## Backup reutilizado

Preparação `/opt/re7online/backups/converta-persistent/preparations/automation-20260929T220203Z`. [Backup/restauração previamente verificados](AUTOMATION_RELEASE_PREPARATION_2026-09-29.md), reutilizados conforme autorização: dump 23.132.316 bytes, SHA256 `c32730005bb882532d47290611b5a1a80836c9ebc6a71dd6bd2047b95e42f06a`. Todos os arquivos do manifesto foram novamente hasheados antes da interrupção. Sessões/auth atuais preservados; houve captura privada adicional depois da saída e antes do sucessor, sem restaurar dados. 60 migrations existentes, nenhuma migration executada.

## Checkpoints UTC (Fortaleza = UTC−3)

| UTC 29/09 | Evento comprovado |
| --- | --- |
| 23:48:32 | Preflight imediato: versões/PIDs/hashes anteriores, três sessões conectadas, zero trabalhos/agendamentos, guarda OPEN 5; sem divergência |
| 23:50:47 | Integridade dos pacotes/backups e configuração real conferidas; root PM2 sem filhos diretos; cron/fence preparados |
| 23:52:47 | POST auditado fechou guarda na geração 6; drained=true, tasks=0, fault=null; scheduler preservado |
| 23:53:39 | Cron deploy temporariamente suspenso, originais preservados |
| 23:54:08 | Owner aplicou fence 3000/3001 e cron.d temporário; boot inactive/disabled; início da contenção |
| 23:54:50 | API antiga parada individualmente |
| 23:54:52 | Worker antigo parado individualmente |
| 23:54:53 | Frontend antigo parado individualmente |
| 23:54:56 | Barreira: árvores antigas incapazes de operar, sockets capturados ausentes, zero outros backends DB e advisory locks; auth capturado |
| 23:55:31 | API candidata online/identidade conferida, listener 3001 presente, guarda fechada |
| 23:55:57 | Worker mínimo online/identidade conferida |
| 23:56:13 | Frontend candidato online/identidade conferida |
| 23:56:27 | WEB_SESSION: 3 connected / 1 disconnected / 1 pending; quatro registros auth; hashes efetivamente ativos conferem |
| 23:56:54 | Health autenticado do worker e build conferidos; saved/fallback compatíveis e iguais |
| 23:57:28 | Owner retirou fence; fim da contenção: 3min20, 20:54:08–20:57:28 Fortaleza |
| 23:58:25 | Health API/DB local e dois acessos públicos 200; frontend local/público 200/build correto; diagnóstico guarda ba66/CLOSED 6/drained=true |

Horizonte de escalonamento definido pelo owner: 15min desde contenção, 00:09:08 UTC; contenção terminou antes. Não é garantia de recuperação nem autorização de kill. Não houve kill adicional, remoção de lock ou término de sessão DB. Saída verificada por PID/start ticks/descendentes, sockets e barreira conservadora DB. Mapeamento individual lock→PID continua não comprovado; não foi usado como prova. Término configurado PM2 foi autorizado; não se declara shutdown gracioso/drain WEB_SESSION.

## Verificação e limitações

Antes/depois: 3 connected, 1 disconnected, 1 pending; quatro registros auth. Contagens iguais não demonstram replay integral nem que nenhuma operação antiga ficou incerta. Não se provocou envio/fixture/mutação de atendimento; não foram encerrados HUMAN. Três novos processos somente após saída dos antigos; nenhum proprietário concorrente iniciado.

HTTP API/frontend só foi validado após retirada do fence, que bloqueava também loopback. Antes: identidade/env/hashes, listener, arquivo da guarda, controle do worker e estado DB. Após: health/DB, builds públicos e diagnóstico autenticado. Não se inferiu atendimento integral por health.

Logs estruturados desde início mostraram bootstrap DB pronto, server.started, scheduler iniciado, worker/control iniciado e reconexões/atualizações de auth, sem eventos error/fatal no trecho analisado. Linhas não estruturadas não foram classificadas como integralmente validadas. Dados/mensagens/tokens não publicados. Eventos naturais de conexão/auth não são envios provocados pela validação.

Ocorrência operacional: `crontab <caminho-longo>` rejeitou o arquivo antes de alterar o cron; original reconferido, instalação do mesmo conteúdo por stdin PASS. Não houve divergência de artefato ou necessidade de retorno. Cron deploy restaurado por stdin às 00:01:46 UTC 30/09, byte a byte, sem alteração de comandos/agendamentos.

Acompanhamento BOT permanece desligado; ativação em tenant indicado e aceite funcional SUPERVISOR/ADMIN/AGENT dependem de etapa separada. Respostas automáticas em andamento continuam limitação técnica preexistente, distinta da demanda maior pendente. Campanhas/CRA aguardam validação funcional do owner; inatividade no Guia pausada; SECULT DEPLOYED/CLIENT ACCEPTED; DB-only encerrada; 6683 CLOSED. Telegram e DELIVERED/READ separados.

## Retomada e confirmação do owner

Owner respondeu “sim” à verificação na própria sessão: Inbox, CRM e configurações da Inbox funcionando após recarregar, somente leitura. Isso confirma continuidade básica do atendimento, não os casos de acompanhamento/intervenção BOT, pois a chave continua desligada. Não se fabricou sessão nem se alterou atendimento.

Às 00:01:26.647 UTC 30/09 (21:01:26 Fortaleza 29/09), POST auditado com geração atual e motivo da release restaurou guarda OPEN 7. Fila imediatamente anterior: jobs=0/sendingScheduled=0; tarefas=0/fault=null depois. Scheduler permaneceu habilitado, sem alternar sua flag. Guarda aberta implica drained=false; não é falha. Admissões ficaram fechadas de 23:52:47 a 00:01:26 (~8min39).

## Fechamento operacional

Observação somente leitura por inotify das substituições atômicas do ledger: dois ciclos naturais do scheduler às 00:01:31.085 e 00:02:31.085 UTC 30/09, admitidos pela API 1855712/ba66, geração 7, e removidos ao concluir; intervalo 60s. Nenhuma tarefa inesperada observada. Não se provocou tick ou envio. Fila/grupos/leases/sending/agendamentos permaneceram zero na reconferência, sem claim de drain permanente. Nenhum envio foi observado pelo diagnóstico durante essa verificação; isso não substitui auditoria histórica de tráfego externo.

Às 00:04:00 UTC 30/09 (21:04 Fortaleza 29/09), reconferidos cron deploy e cron.d byte a byte com originais, boot inactive/enabled, saved/fallback iguais e contendo somente os três candidatos compatíveis. API/frontend ba66 e worker mínimo 912, watch=false. Unit enabled/inactive representa supervisão habilitada para boot, não start da unit nesta operação. Auth e configurações privadas preservados; nenhum restore produtivo, migration, logout, limpeza de sessão ou kill adicional. Nenhum retorno necessário.

Estado final: **DEPLOYED / AUTOMATION NOT ACTIVATED**; health/API/DB e worker ok; guarda OPEN 7, tasks=0/fault=null/drained=false; scheduler habilitado; sessões 3 connected / 1 disconnected / 1 pending, auth=4. Owner confirmou leitura básica. Ativação em tenant expressamente indicado, testes funcionais com conteúdo autorizado e aceite de acompanhamento/intervenção permanecem separados. Sem ampliação do aceite CRA, sem novos testes locais/suítes nesta janela.
