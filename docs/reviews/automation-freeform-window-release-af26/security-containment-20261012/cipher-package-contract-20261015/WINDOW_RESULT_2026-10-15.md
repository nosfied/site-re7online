# Janela v10 — 15/10/2026, Fortaleza

**B CONSUMED / FAILED BEFORE PROCESS EXIT / PRESTOP RESTORED / CIPHER NOT DEPLOYED.** Política b6a584 instalada; B invocado uma única vez. A recusa `restore_not_verified` ocorreu em `ops.stop`, antes de qualquer parada. C classificou `NO_FINAL_PLAN`, sem autorização de replay/sucessor. Não houve plano final, intent/recibo de commit ou conversão; API410272, worker410428 e frontend188897 preservaram os mesmos PIDs/start ticks. Gates fechados, barreira ausente e owner confirmou sessões/telas funcionando. **Não repetir A/B nem utilizar C1/C2 sem plano correspondente.**

## Causa e alcance da falha de preparação

`preparation-bindings.cjs` aceita a prova certificada de restore retido e parado: `temporaryDatabaseRemoved || (snapshotCertified && databaseRetainedStoppedForEvidence)`. Porém o consumidor real `Operations.stop` exige diretamente `restore-result.json['temporaryDatabaseRemoved'] == true` e nega com `restore_not_verified`.

A prova aprovada preservava o cluster isolado como evidência (`temporaryDatabaseRemoved=false`). A renovação de RPO manteve essa semântica, identificando explicitamente a reutilização; não afirmou ter removido o cluster nem ter executado outro restore. A incompatibilidade **já estava no pacote aprovado**. O checker passava, mas não cobria a precondição desse consumidor de parada. As provas do sequenciador com bridge não executavam `Operations.stop` real. A declaração anterior de auditoria integral foi mais ampla que as provas; a falha é nossa de preparação/cobertura.

Nenhum campo foi ajustado para PASS, nenhuma evidência de restore foi apagada e nenhum start/SQL foi repetido. A v10 permanece consumida pela tentativa; o histórico validado para revisão não constitui implantação concluída.

## Sequência executada

1. Owner confirmou disponibilidade sudo e ausência de uso humano. Pacote concreto, consumidores reais, quatro modos e prova de fonte passaram novamente.
2. Backup fresco READ ONLY sob `backup.lock`: **05:43:48.105479–05:43:56.198523 Fortaleza** (08:43 UTC), **8,093 s**,41.246.059 B, SHA `025e337cf3aee0178a3360807ac1f281b04593936776b1515fbad912dabb05c1`. Catálogo614 e schema/fronteira de migrations iguais ao restore certificado, digest142a2b61; pg_dump/restore16.12 e Node20.20.0 iguais. Cópia off-host e cofre permanente700/600 conferidos. Restore anterior reutilizado explicitamente; nenhuma conversão local foi reapresentada como nova.
3. Renovados somente manifests/provas de backup, com originais arquivados sob lock. Código, perfis, grant, SQL, CLI, política/instalador permaneceram iguais. Review manifest vigente: `1a40f727ed46d0c04cd5ac7facb8ca2ec451dca741f3fc83ec2d2e2679e02022`.
4. Reconferência: mínimo deploy/PostgreSQL **18.406.391.808 B**, superior ao piso8.794.603.520 B; WAL80MiB, identidade NEWDB/SQL/proxy/health aprovados. Um leitor auxiliar tentou reutilizar `complete-preparatory.private.stderr` e negou antes da consulta SQL: recusa preservada; somente as leituras faltantes foram concluídas em canal diagnóstico novo, sem editar código/bindings ou repetir a cadeia B. Correção de nome único fica registrada separadamente.
5. Owner executou A uma única vez. Fonte9c7/helper8de/regra62b5, cadeias/modes/owner root, manifests e visudo passaram. Política **b6a58431c989a36eebdfa9e443118a7e15fbe0229d102cd896f91d3d193f818d** instalada pelo instalador **bfc016e75154b26a7f364ab5f1f6423c744dcbe4e41a1587c79ad039380fbd76**. Fonte9c7 arquivada root-owned600. Helpers/sudoers inalterados; inspect e cinco gatesfalse passaram.
6. Última conferência de RPO/capacidade/scope/manifest/inspect passou e B foi invocado uma vez. O sequenciador fechou a guarda mantendo38, preflight passou e iniciou contenção. `stop-pair` negou na prova de restore antes de atingir a parada. A recuperação canônica `prestop` conferiu identidades originais, restaurou admissão/controles e guard closed38. Não executou retorno de binário ou partida.
7. C READ ONLY retornou `NO_FINAL_PLAN`/planSha256null/replayfalse/successorfalse. Inspeção confirmou selagem vazia, ausência de intent/recibo de commit e as três identidades originais. Não há escolha C1/C2 aplicável; nenhum recibo de observação foi fabricado. A política instalada b6a584 permanece, com fase consumida/restaurada; não reinstalar nem retornar à9c7 por conveniência.
8. Gates e execution-authorized fechados sob lock, sem apagar marcas. `check-absent` privilegiado passou. Health/DB, controle worker, GET administrativo200, BUILD_ID servido, saved/fallback600/conteúdo, supervisão inactive/enabled e SQL congelado/out.15/recibo/contadores passaram. Owner confirmou sessão, console, Inbox, CRM e Campanhas em leitura.

## Tempos e disponibilidade

| Marco | Fortaleza15/10 |
|---|---|
| Invocação B | 05:53:19.069388 |
| Baseline capturada | 05:53:22.716247 |
| Contenção iniciada | 05:53:24.239071 |
| Contenção concluída | 05:53:25.598425 |
| Falha registrada | 05:53:26.786204 |
| Pré-parada restaurada | 05:53:27.735650 |
| B retornou erro | 05:53:27.790554 |

Sequência B: **8,721 s**. Nenhuma parada/reinício de API/worker/frontend. O intervalo conservador entre início de contenção e restauração final foi **3,497 s**. Esse é um limite de contenção de admissão, **não uma medição de indisponibilidade HTTP**; não houve sonda contínua durante esse intervalo. Não declarar interrupção zero de admissão só porque os PIDs permaneceram vivos. Inspeção técnica final passou às05:59:24.072489; confirmação funcional do owner registrada depois.

## Estado final e custódia

- API/worker/frontend efetivamente ativos continuam os anteriores: dynamic-compatible-return5b3cf3af, worker mínimo afbb, frontend BUILD_ID`dFvS6tFEaWQsSIIn3P702`.
- NEWauth+NEWDB, sessões/console, saved/fallback600, supervisão/controles restaurados, barreira ausente, cinco gatesfalse/executionfalse e guarda fechada38.
- Dez cifras **não convertidas nesta janela**; Telegram opaco,147 históricos e payloads não alterados. Decoder/epoch/v2 planejados **não implantados**. Grant95eda continua uma decisão/artefato preparado, sem instalação por esta tentativa.
- Out.15 CLOSED, seis entregas reportadas/cinco não enviadas, CRM/usage/recibo preservados pelo leitor SQL canônico. Sem abertura, envio de teste, retomada, migration, propostas.env, credenciais externas ou ativação Telegram.
- Backup e recibos em `re7-private-retention-custody/cipher-v10-window-20261015`; journal, stdout/stderr, negativa, C e inspeções em `execution-evidence`,700/600/indexados. Provas antes/depois de RPO arquivadas também off-host, SHA `1b16f549b40a03a884d7b3189c9ed667ae77a44d97329427c258b6387924d241`. Arquivos root-owned permanecem preservados no host; política proposta original está em custódia por seu hash. Não se afirma réplica física independente do computador do owner.

## Pendência concreta

Uma versão futura deve **unificar o contrato de restore em todos os consumidores, incluindo stop/start/retornos**, reutilizando prova certificada retida com referência íntegra, schema/fronteira/ferramentas e limites explícitos. Ensaiar as precondições reais de `Operations.stop` sem conter/parar produção; cobrir prova retida válida, inválida/ausente/divergente, pré/pós-commit e quatro modos. Não transformar `temporaryDatabaseRemoved` emtrue para passar nem apagar a evidência por causa do boolean. Nova geração/revisão com fonte root **b6a584 efetivamente instalada**, não9c7. A v10 e a v9 não serão reparadas em campo.

Corrigir também o nome diagnóstico fixo do leitor auxiliar em versão nova: evidência única por execução, sem overwrite/replay; preservar a recusa original. Nenhuma correção de código foi aplicada nesta janela. A autorização de execução foi consumida pela tentativa; não há nova janela implícita.

Segurança externa/cifragem **OPEN**. Segredos de cifra ativos ainda não foram substituídos; risco dos pares segredo+ciphertext históricos continua acompanhado. Auth/banco/console/out.15 permanecem concluídos. Responsável Deifson; revisão15/10, próxima21/10 antecipada após mudanças.
