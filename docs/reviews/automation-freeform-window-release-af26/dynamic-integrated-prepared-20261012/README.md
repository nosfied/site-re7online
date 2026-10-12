# Audiência dinâmica: correção integrada e encerramento sem envio — 12/10/2026

**LOCAL IMPLEMENTED / VALIDATED FOR REVIEW. NOT DEPLOYED. CAPACITY DENY: NOT PREPARED FOR INSTALLATION/WINDOW.** Base remota reconfirmada `f16bcad186abbe5313ea6df0052a97826b4b2e07`. O pacote local está concreto; a geração operacional produtiva, suas políticas e comandos de instalação ainda não existem. Não se apresenta um instalador fictício ou autorização de execução.

## Diagnóstico e desenho reutilizado

Consultar [auditoria de audiência](../dynamic-audience-continuity-20261011/README.md), [Result Truth](../../../saas/CAMPAIGN_RESULT_TRUTH_CANONICAL_RECONCILIATION_2026-09-18.md), gate lifecycle/CRM existente, fila/lease por tenant, `applyCampaignExecutionBatchAction`, procedimento V4 e procedimento frontend3227 observacional. out.13, out.14 e out.15 são campanhas distintas: NURTURE, FOLLOW_UP e NEW. Os 255 Leads NEW preexistentes resultaram em 11 selecionados e 244 bloqueados; sete Contacts PROVISIONAL foram indevidamente admitidos. Os quatro elegíveis operacionais não representam autorização do owner para um teste individual. A prévia histórica original não está registrada e o owner não recorda o filtro: não atribuir a causa histórica ao bug local de prévia.

A correção compartilhada reutiliza lifecycle/candidatos existentes antes do provider nas três modalidades (avulsa/manual, Audiência CRM, Importação CSV, com variantes estáticas/dinâmicas e execução imediata/agendada onde existentes). Não adiciona regra telefônica, suporte internacional ou limite artificial de um destinatário. O delta f16 de lifecycle e invalidação por geração é preservado.

## Suspensão e apresentação

Nova projeção pura `campaignExecutionPresentation.ts` lê jobs/leases autorizados do tenant. Processamento exige job running, identidade completa de lease e confirmação da mesma lease no registro do tenant. Pausa solicitada com executor ativo difere de pausa efetiva. `queued + operational_suspension`, sem lease, é suspensão operacional. Lease inconsistente, needs_review ou aceitação conhecida sem Outbound compatível é resultado incerto. Nenhuma leitura do ledger global é devolvida ao frontend. Relação de lote com tenant divergente é negada na projeção e não expõe seus metadados.

Lista, detalhe e lote compartilham esse estado. `Campaign.status` permanece intacto; “Enviando” continua sendo estado persistido, não certificado de executor ativo. O polling existente acompanha pausa solicitada até efetiva e resultado incerto, sem novo timer. Fontes de resultados/aceitação continuam agrupadas por tenant/campanha, não uma consulta de detalhe por linha. Estado observado pode mudar entre ticks; esta projeção não é certificado de drain.

## Encerramento específico da out.15

O cancelamento canônico já cobre controlador, filho, link, lote e job queued sem lease, sob lock transacional. Não há novo endpoint de mutação, migration, writer de ledger ou alteração do ack. Uma chamada com executor ativo passa a needs_review, não comprova encerramento.

Foi reproduzida uma lacuna: após cancelamento, a ausência de resultado era representada como FAILED pelo fallback antigo. O ajuste mínimo projeta **not_submitted / cancelled_before_submission** somente quando o cancelamento está confirmado pelo job; sem confirmação, mantém pending/revisão. Não cria Outbound, falha Meta, entrega ou cobrança. Resultados explícitos prevalecem; fallback histórico SENT continua limitado à execução autorizada. Público materializado permanece 11, seis entregas reportadas e cinco não enviadas: pending0/failed0 depois do cancelamento comprovado. Os 244 bloqueios de seleção permanecem separados.

A preparação administrativa [leitor específico](out15-close-preflight.cjs) executa SQL REPEATABLE READ / READ ONLY, statement8s/lock1s/transação25s. Vínculos explícitos demo/out.15, snapshot, seis Outbounds, recibo .6, disposição histórica, cinco identidades PROVISIONAL, job e lease são conferidos. Há um job histórico de materialização completed com metadados antigos: é preservado, não confundido com o queued atual. Novo trabalho não terminal ou drift nega.

PlanHash comprovado: `ce1afa3887e934bb505c385f0509c47c38dbd0468445be453cde000636e9194f`. Input privado original não é publicado nem adaptado. Esse hash exige reconfirmação fresca antes de eventual decisão de encerramento. O ensaio usa o próprio cancelamento canônico, não SQL inventado. Produção não foi cancelada.

**Fronteira de compatibilidade:** não aplicar encerramento antes da implantação conjunta dos leitores API/frontend. O frontend antigo não conhece not_submitted; a API anterior voltaria a apresentar falhas sem evidência. Os retornos à API2ed são válidos antes do encerramento histórico. Depois dele, qualquer rollback exige preparação compatível com esse resultado, sem desfazer cancelamento, reenviar ou fabricar falha. A autorização desta etapa não inclui cancelamento produtivo.

## Provas executadas e reutilizadas

| Prova | Resultado e alcance |
|---|---|
| TypeScript API final, Node20.20.0 | PASS exit0; quatro módulos runtime allowlisted, nenhuma exportação integral da branch |
| PostgreSQL sintético, leitores HTTP reais na composição ativa+overlay | 5 PASS: estados/leases, lista→detalhe→polling, dois cancelamentos concorrentes sob lock e replay com um evento, executor ativo/tenant errado, fronteira aceitação/Outbound e relação estrangeira |
| Restauração isolada do dump produtivo | PASS 70 tabelas, hashes de seis resultados/job/recibo; cancelamento canônico/replay/verify exclusivamente local: seis reportados, cinco não enviados, zero falhas/pending/provider |
| Paridade lifecycle→materialização | 1 prova integrada anterior PASS; evidência original 255→4/251 e módulo antigo 11 preservada; nenhuma nova submissão |
| Frontend final Node20.20.0 | Build exit0, tar completo extraído e verificado; 23.803 arquivos/31 symlinks; dependências autocontidas |
| Navegador Chrome sobre esse tar | 11 PASS: suspensão/lista/detalhe/polling, cinco estados, cancelamento, conjunto/lote, mobile390 e pausa solicitada→efetiva |
| Prévia sobre o mesmo tar | 6 PASS: invalidação filtro/modalidade, respostas atrasadas, total próprio sem cap, filtro salvo e estimativa zero |
| Unit diretamente alterado | 1 PASS: polling acompanha operação corrente; provas anteriores não afetadas reutilizadas |

A composição final foi adicionalmente montada com o `dist` efetivamente ativo recuperado por leitura: 438 módulos runtime preservados, três existentes alterados e uma projeção nova; lockfile idêntico. Somente a fixture compilada foi acrescentada para os testes. As mesmas cinco provas passaram nessa composição, sem entrypoint/scheduler. Não contar a repetição como cinco cenários novos.

Lint dirigido: DENY por duas ocorrências preexistentes `react/no-unescaped-entities` no mesmo trecho CSV de page.tsx e três warnings. A presença dos erros no baseline f16 foi conferida; sem correção incidental ou afirmação de lint PASS. Build/TypeScript final passou.

Providers/auth/APIs do navegador são simulados. O PostgreSQL e o Chrome são reais isolados. Cancelamento executado apenas no banco local. Efeitos V4/nft/systemd, promoção, observador root de nova geração e troca real desta composição **NOT EXERCISED**. Ensaios operacionais canônicos anteriores são referência; não são reatribuídos ao pacote novo. Aceitação/webhook/recuperação .6/UX3227 aprovados não foram repetidos.

O reboot perdeu /tmp e interrompeu um build após compilação, sem conclusão TypeScript. Código, logs, dump e tar3227 persistentes sobreviveram. Recuperou-se Node20.20.0 e recompilaram-se somente composição final interrompida e prova concorrente editada. O antigo tar integrado é histórico, não tratado como bytes do novo build. Negativas de paths/tsx/sandbox e mobile anterior foram preservadas; a falha de invocação não é PASS de produto.

[Patch mínimo](implementation.patch) e [proveniência das fontes](source-provenance.json); o delta lifecycle anterior em f16 está reutilizado e incorporado no artefato API.

## Artefatos exatos

API overlay: `b90ca705063a7101516c4f3df54f1ebf6f23de850107433f5d3ced066cdd57ae`, 3102720 bytes, oito arquivos (quatro fontes/quatro compilados): campaignEligibility, campaignRecipientResultTruth, http/routes e campaignExecutionPresentation novo. [Manifesto de origem/resultado](api-overlay-manifest.json). Origem da API ativa2ed; fontes existentes conferidas em20788059 e os três compilados originais recuperados por SCP/hash. Aceitação, webhook, workerafbb, dependências, auth e schema preservados. Overlay não é uma release completa: a futura composição deve clonar/reutilizar a base íntegra pelo contrato, aplicar somente estes arquivos e conferir inventário integral antes do staging.

Frontend tar: `74a2ac2fcf93b32623fa2e0dfa857d1792cfd503e1f46cee09e6f94f3ca2216f`, 178428455 bytes. BUILD_ID `dFvS6tFEaWQsSIIn3P702`. Manifesto `e0c66407d0b56748547d0d03f7a2b1b88d63a75cadde22f8cc8bbd03bac4054b`, 304 assets estáticos anteriores preservados. [Resumo](frontend-artifact.json). Código/configuração originados do3227 com somente os quatro arquivos frontend alterados. Inicialização em `/tmp` fora da árvore Git, Node20, dependências do pacote, CSS/JS/MIME e estilos calculados pelos smokes. Tar/manifestos/configurações/logs privados ficam fora do Git. Retorno3227 atual: tar `9b54548e4a7763f5078ae0433aceb43a37567eccd988814dd82f2fab97229319`, BUILD_ID `8OqIZZxaW7_ogf6h7AVoe`; gerações/launchers/journals/saved/fallback atuais preservados.

## Produção somente leitura

Captura canônica posterior ao reinício: **12/10 15:18:33–15:18:34 UTC / 12:18:33–12:18:34 Fortaleza**. Ledger consistente em ambas pontas, SHA `9e1a979932e4a22f8051046a4ce96e1ac5656723ba5ba4a57e1ef14f8e73a9e9`, openfalse/generation38/tasks{}, lock/.uncertain ausentes. API18413/worker18585/frontend4121573 restart0, daemon18676; mesmos caminhos/builds da leitura anterior. Job queued/attempt1/operational_suspension sem lease. Seis Outbounds, snapshot/recibo/disposição e ausência das posições .7–.11 preservados. Esta captura não é binding fresco de uma janela futura.

API ativa: campaign-result-truth-2ed9dccc-20261011T184000Z; worker mínimo reactive-afbb7455-verified; frontend3227. Verificação integral anterior: 1.893 arquivos/2 symlinks/6.944 entradas de dependências. Leitura root das políticas600 não repetida nesta etapa: conferência futura depende da sessão sudo legítima de Deifson; nenhum privilégio novo é proposto.

## Capacidade, backup e impedimento

[Orçamento](capacity-plan.json): staging integrado exige 3026829863 bytes livres conservadores: piso operacional2.131.755.008 + tar frontend + alocação frontend660.594.688 + base API sem duplicar dependências36.171.776 + overlay + controles16MiB. Deploy observou2.219.524.096 bytes livres, postgres UID70 observou2.219.470.848B às15:21:33UTC (12:21:33Fortaleza); faltam 807359015. Inodes6.858.637 livres. PGDATA/pg_wal/tablespaces padrão/ledger no mesmo filesystem; PostgreSQL16.12, DB667.991.063B, WAL80MiB/cinco arquivos, sem slots/wal_keep0/archiveoff. Crescimento entre amostras e reserva são considerados; df/dry-run não constituem CAPACITY PASS. Leitura executor postgres concluída; reconfirmar capacidade e erros/crescimento antes de qualquer staging futuro. Não apagar geração referenciada, WAL, backups ou evidências para passar.

Dump fresco desta preparação off-host `database-fresh.private.dump`,36.824.466B, hash no [índice](evidence-index.json); restauração isolada comprovada e comparação privada. Backup privado dos seis caminhos operacionais saved/fallback/ledger/configs também validado. SQL e arquivos não são snapshot simultâneo. Frescor/RPO e custódia devem ser reconfirmados na futura janela; este backup datado não autoriza deploy. Banco de ensaio pós-reboot é sintético e sem provider/scheduler. Não restaurar sobre produção.

## Sequência futura para revisão

1. Resolver capacidade por ação separada concreta/revisada (nenhuma exclusão autorizada aqui), confirmar postgres/deploy/WAL/erros/produção, revalidar backup/RPO e base ativa.
2. Staging inativo da composição completa API e frontend com os tars acima, manifests e dependências integrais; construir geração V4 nova, bindings próprios e cinco gatesfalse. Reutilizar helper/nove sudoers se hashes/contrato ainda compatíveis; política nova por instalação restrita do owner. Não renderizado enquanto o staging estiver bloqueado.
3. V4 API + parada/partida do mesmo workerafbb por necessidade operacional, uma sequência e provas novas, guarda38 permanece fechada. JSON/ecosystem dos três modos, baseline/tasks{}, inventário congelado/DB ownership e backup são gates obrigatórios. Abortos/retorno parcial/completo e pós-unfence canônicos com política fresca/owner conforme etapa; não repetir starts.
4. Somente complete/switch comprovado permite capturar baseline frontend real pós-API. Nova política de janela/controles próprios sobre os observadores instalados; leitura antes e saídas root novas, única partida, readiness/identidade/BUILD_ID/CSS.
5. Confirmação owner das telas antes de política permanente compatível, promoção/save/fallback e gatesfalse. Não reutilizar hashes antigos do reader ou identidade anterior de daemon/boot. Frontend/API retornos preservados e acesso root antecipado; escalonar15min de contenção, inclusive atendimento degradado.
6. Encerramento histórico out.15 é fase separada: novo preflight específico íntegro, autorização própria, interface legítima → única ação Cancelar lote por ID `d473aec1-8ffa-40b9-8bab-e6819153ae4c` → verifyREADONLY/read models/evento. Se timeout/incerto, inspecionar sem repetir POST; cancelamento não abre guarda, não retoma fila nem faz ack. Resultado exigido: seis entregas reportadas preservadas, cinco não enviadas, nenhuma falha Meta fabricada/duplicação/submissão.

Comandos concretos disponíveis agora são [verificação local e leitura](COMMANDS_FOR_REVIEW.txt). **Não há comandos produtivos de instalação/troca nesta entrega:** políticas/bindings concretos não foram gerados, para não declarar preparação pronta sem capacidade. Dependências restantes: capacidade; staging/retornos íntegros e bindings frescos; leituras root de políticas; geração/revisão dos instaladores; decisão futura de implantação e decisão própria de cancelamento. Não basta concordância de contadores para aceitar audiência.

## Estado corrente e critérios de encerramento

Incidente OPEN, guarda38 fechada, job suspenso, seis resultados/cinco não submetidos, recuperação.6 CLOSED. Encerramento exige correções revisadas implantadas e telas confirmadas, cancelamento histórico autorizado/verificado sem envio e preservação dos resultados; intenção individual não é substituída pelos quatro elegíveis. Frentes CSV/Syer, internacional, CRA-PR, multilote e AUTO naturais permanecem separadas. Preferir janela sem uso humano indicada pelo owner (feriados/fins de semana/após18h Fortaleza), conservando controles de automações/serviços. Nenhum envio, claim, configuração, reconciliação, ack, abertura, retomada, instalação ou deploy nesta tarefa.
