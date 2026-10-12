# Audiência dinâmica: correção integrada e encerramento sem envio — 12/10/2026

## Estado corrente — implantação concluída e encerramento pendente de decisão

**DEPLOYED TECHNICALLY / OWNER UI READ CONFIRMED.** [Registro consolidado com tempos/versões/hashes/gates/limites](deployed-20261012/DEPLOYED_2026-10-12.md). API/worker/frontend implantados,saved=fallback,supervisãosemrestart,gatesfalse. Guard38closed/jobsuspenso/seisreportados/cincosemsubmissão e .6 preservados. [Retorno compatível preparado,não instalado](deployed-20261012/COMPATIBLE_RETURN_FOR_REVIEW.txt) / [procedimento concreto de encerramento somente para decisão](deployed-20261012/OUT15_CLOSURE_FOR_REVIEW.md). Nenhumcancelamento/envio/abertura/retomadaexecutado. IncidenteOPEN,legitimidadeout.15nãoaceita;frentesencerradaspreservadas. Ocorrência de output privado registrada separadamente no relatório, sem reproduzir valores ou alterar credenciais.

## Histórico preservado — retirada autorizada e staging integrado (12/10/2026)

**WITHDRAWAL COMPLETE / CAPACITY PASS DATADO / INACTIVE STAGING VERIFIED FOR REVIEW / NOT INSTALLED / NOT DEPLOYED.** [Comandos concretos](COMMANDS_FOR_REVIEW.txt), [hashes e evidências sanitizadas](staging-result-20261012.json), [fontes operacionais revisáveis](operational-20261012/). A retirada de5b3 foi consumida; não repetir seus blocos. Nenhum candidato iniciou, nenhuma política foi instalada, nenhuma reconciliação/cancelamento/abertura ocorreu. Gates API cincofalse e frontendfalse.

### Retirada, capacidade e custódia

Owner executou B/C: WITHDRAWAL_EXIT0/POST_EXIT0. Driver retirou exclusivamente as duas cópias literais autorizadas,958.939.136B alocados. Main íntegra, diretórios/manifests/journals/releases/retornos/WAL preservados. Observações novas do driver e do leitor posterior: duas amostras completas, owners0/incomplete0; ambos os caminhos ausentes. Recibo/logs/leituras foram copiados off-host e hasheados. Blob idêntico/índice/extracao canônicos reconfirmados antes da retirada; não é uma segunda réplica de desastre independente.

12/10 16:53:11UTC/13:53:11Fortaleza: mínimo deploy/PostgreSQL3.183.091.712B para orçamento3.063.001.639B, margem120.090.073B. **Depois de staging**,17:46:23UTC/14:46:23Fortaleza: deploy2.259.599.360B/PostgreSQL2.259.595.264B; mínimo2.259.595.264B, piso2.131.755.008B, margem127.840.256B. WAL83.886.080B/5arquivos,0slots; inodes amplamente disponíveis. Health API/DBok. Logs delimitados anteriores sem ERROR/FATAL/PANIC/write failure. Não atribuir a variação líquida de df integralmente à retirada: produção continuou escrevendo e o staging consumiu espaço. PASS de preparação datado, não certificado da futura janela. Espaço é estreito: não duplicar dependências ou novos tars/archives no host; reconferir capacidade/WAL/crescimento antes da decisão e da contenção.

### Backup fresco e estado preservado

Dump PostgreSQL off-host SHA9fb3feba8bc961afccca07d8363ac3812582511edbb3e076a9dacff61d8681e7/37.017.185B, concluído17:17:38UTC/14:17:38Fortaleza. Archive operacional/auth/data SHA8f8fc4aad1a7be1ec1cc4fdadee6fd4e32b65761c02939db39138897345c7aa6/2.420.674B, concluído17:27:25UTC/14:27:25Fortaleza;438membros. O campo atUtc do manifesto17:33 registra geração do manifesto, **não frescor do dump**. Usar o horário anterior da captura/custódia real acima e o RPO canônico; renovar se vencido na futura execução, preservando esta geração de prova.

Restore PostgreSQL16 isolado exit0/614objetos/70tabelas; seis resultados, zero Outbound.7–.11 e jobqueued/attempt1/operational_suspension/semlease conferidos. Banco temporário removido; aplicação/scheduler/provider não iniciados. Checksums das migrations confrontados com as fontes da API ativa, sem divergência. Prova de restore inicial incompleta foi preservada antes de completar campos obrigatórios verificáveis; hashes/proofs/manifests correspondentes foram regenerados. Nenhum dado produtivo alterado por essas conferências.

Leitura integrada17:45:46UTC/14:45:46Fortaleza: IMMEDIATE_READS_PASS_GUARD38_PRESERVED; todos os manifests/baselines/inventário global congelado/proxy/configurações/PIDs/startticks/cron/boot/saved/fallback passaram. API2ed/workerafbb/frontend3227/daemon preservados, guarda38fechada/tasks{}, job suspenso, seis resultados, recibo/disposição.6 e cinco sem submissão intactos. Leitura não é drain nem certificado de saída; testes funcionais/provas de entrega não foram repetidos. Sessões/auth foram conferidos por baseline; confirmação humana de telas pertence à futura janela.

### Staging e políticas

API: incident-6683-v4-dynamic-5b3cf3af-20261012T170000Z; candidata campaign-dynamic-5b3cf3af-20261012T170000Z. Sobre a base ativa2ed, overlay6033ac56931c47edaa01301fc3537a8012368bb33fe1d423c99e84ed1dde33a5;1.895arquivos/2symlinks/6.944dependências. Somente quatro módulos runtime e fontes correspondentes;schema/auth/aceitação/webhook/dependências preservados. Retorno pré-cancelamento à API2ed íntegra. Retorno compatível próprio campaign-dynamic-compatible-return-5b3cf3af-20261012T170000Z possui inventário/bytes iguais à candidata e dependências compartilhadas conferidas. Mesmo workerafbb: parada/partida coordenada futura por exigência V4, sem delta funcional/rebuild.

Frontend: frontend-dynamic-5b3cf3af-20261012T170000Z; tar EXATO74a2ac2fcf93b32623fa2e0dfa857d1792cfd503e1f46cee09e6f94f3ca2216f,BUILD_IDdFvS6tFEaWQsSIIn3P702,manifestoe0c66407d0b56748547d0d03f7a2b1b88d63a75cadde22f8cc8bbd03bac4054b. Extração remota completa23.803arquivos/31symlinks. Tar/build/provas Chrome11+6 anteriores reutilizados; nenhum rebuild/reteste amplo. CSS processado efetivamente referenciado64ec3d62bdaa41ef.css/hash1ddf8dca7f9965191239b7aef3b8ce92374ccf637ca421d3ad75a0cc964eab64; mesmo CSS validado, não presume arquivo novo por build novo. Controles/nonces de ida/retorno novos, nenhum intent/journal/certificado copiado. Retorno ao3227 ativo conserva release, controle permanente, journals e saved/fallback.

Propostas (não instaladas): V4 11283078071d5658bd0a5b91075b1465312be893def1a078457a5b39420fd53c; frontendjanela576f25f2bd8563a741336361d6dabe11760fc1693696fb247a88bba68061c1e4; permanente5ee8622d9499a38aab740bec02aaed9fa2732d9981505f915215e39b2d9eae3e. Helpers8de/c885/976 e sudoers literais permanecem iguais. Instalações futuras exigem Deifson na sessão sudo; arquivos root600 atuais/archive/integridade exigem conferência real antes da troca. Nenhuma nova delegação é necessária.

### Negativas preservadas e limites operacionais

- `run_release`: preparador reutilizado manteve TARGET3227; checker arquivado e único literal corrigido para candidata real. Controles/nonces não recriados; continua negando identidade divergente. Preparador canônico publicado inclui a referência correta.
- `policy_already_exists`: cópia de entradas do V4 incluiu política histórica. Bytes copiados/manifests arquivados; gerador passou a excluir políticas históricas e criou proposta nova. Nenhuma política copiada foi instalada ou considerada prova fresca.
- `NameError: time`: falha restrita à emissão final de metadata do continuador, após verificar pacote e gerar propostas. Diagnóstico preservado; finalizador publicou metadata sem recriar controles ou tocar produção.
- contrato de restore recusou campos ausentes `applicationStarted`/`migrationChecksumMismatches`. Relatório anterior preservado; sem defaults no consumidor. Completado pela cadeia observada sem aplicação e leitura real dos checksums; nova conferência integrada PASS.

Sintaxe/checks dos drivers/instaladores e quatro compilados Node20.20.0 conferidos. Efeitos de contenção/start/stop/nft/systemd/promoção e ausência de sobreviventes da **nova geração** NOT EXERCISED: observar somente na futura execução autorizada; não reatribuir ensaios antigos. Não houve instalação parcial root.

### Próxima decisão e dependências

Revisar pacote e comandos, depois decisão própria de implantação API→frontend. Antes da parada API: leitura/custódia/RPO/capacidade e hashes root frescos, instalação V4 por Deifson, inspectfaseNone, fivegatesfalse antes de habilitação. Sequenciador canônico faz fechamento→prova→preflight, observações novas/ownershipDB, renovação limitada de capture/unfence e diagnóstico privado, sem startrepetido. Retornos pré-stop/parcial/completo por estado real; pós-unfence somente gerador/política frescos e owner sudo disponível. Guarda38/job suspenso em todos os ramos.

**Frontend baseline pós-API é dependência explícita:** capturador preparado só aceita complete/switch e os certificados reais API/worker; originais pré-API são arquivados nesta geração. Recusa bloqueia instalação/parada frontend. Depois instalar política janela, preflightpreparatório arquivado e before novo na janela; saída root nova, partida única/readiness30s,BUILD_ID/CSSservido. Owner confirma layout/sessão/Inbox/CRM/Campanhas/lote antes da política permanente/promoção/save/fallback. Retorno3227 segue gatesnovos, sem repetir partidas.

**Cancelamento histórico NÃO PREPARED/AUTHORIZED para executar nesta rodada.** Bytes do retorno compatível estão staged/verificados, mas suas identidades/política de execução têm de ser capturadas da composição efetivamente implantada, antes da decisão de cancelamento. Não inventar PIDs futuros nem reaproveitar política pré-cancelamento. Se essa fase faltar, bloquear cancelamento; API2ed/frontend3227 anteriores não são retorno compatível depois dele. Nenhuma cinco posições foi retomada/terminalizada. Incidente permanece OPEN até implantação/aceite e encerramento específico aprovado; legitimidade do público out.15 não é resolvida por quatro elegíveis ou contadores concordantes.

CSV/Syer, internacional,CRA-PR,multilote/AUTO naturais permanecem separados. Recuperação.6/setembro CLOSED;frontend3227 anterior e aceites anteriores preservados. Preferência de janela sem humanos não dispensa conferência de atendimento/automações.

## Histórico preservado — continuação cf55655b (12/10/2026)

**CORREÇÃO LOCAL VALIDADA / STORAGE ACTION READY FOR REVIEW / NOT DEPLOYED.** Capacidade real continua insuficiente, mas há caminho concreto: [dois caminhos, custódia, comandos A/B/C e limites](STORAGE_WITHDRAWAL_FOR_REVIEW.md). Retirada ainda NÃO AUTORIZADA/NÃO EXECUTADA; staging integrado/políticas de janela ainda não são PREPARED FOR INSTALLATION. Proposta libera958.939.136B sem retirar main, releases, retornos, diretórios, WAL ou evidências. Próxima ação executável para decisão do owner: revisar e autorizar exclusivamente essa retirada. Sua execução e CAPACITY comprovado precedem staging/geração operacional; não reutilizar certificado root preparatório.

[Delta mínimo](acceptance-cancel-boundary.patch) / [proveniência](acceptance-cancel-boundary-source.json); o patch/manifestos históricos cf55655b continuam preservados no Git e na evidência privada.

### Fronteira aceitação → cancelamento

Reprodução no leitor real/PG sintético: evento de aceitação sem Outbound compatível seguido de cancelamento canônico produzia cancelled/not_submitted. FAIL esperado preservado. Delta mínimo em routes.ts: qualquer pendingAcceptance mantém **uncertain**, independentemente do estado do executor. Cancelamento do job não comprova ausência de submissão; o leitor não produz not_submitted para essa execução enquanto a fronteira estiver incompleta. Correspondência exige os mesmos messageId/MetaID quando conhecidos; MetaID divergente continua incerto. Lista, detalhe filho/controlador e lote preservam essa evidência. Nenhum status persistido é reescrito.

Provas dirigidas Node20.20.0/PG real isolado:3 casos PASS da fronteira e regressões afetadas; depois2 desses casos passaram com o leitor de retorno independente e negativas de resume/claim. Não somar essas execuções como cinco cenários novos. TypeScript final exit0. A primeira compilação da fixture apontou duas referências potencialmente nulas; assert de presença foi acrescentado antes dos builds finais, sem atribuir esses diagnósticos ao baseline. Driver de retirada: sintaxe e negativa de invocação sem autorização PASS; mutação destrutiva não ensaiada/executada, observação root real já descrita. Frontend/tar/build/11+6 smokes e demais provas cf55655b são reutilizados, sem rebuild ou repetição. Novo overlay API `6033ac56931c47edaa01301fc3537a8012368bb33fe1d423c99e84ed1dde33a5`,3.102.720B; somente routes fonte/compilado mudaram em relação ao overlaycf. Frontend permanece `74a2ac2fcf93b32623fa2e0dfa857d1792cfd503e1f46cee09e6f94f3ca2216f`.

### Capacidade real, proposta e leituras

[Orçamento](capacity-plan.json) e [função/provas](capacity_budget.py): mínimo obrigatório entre deploy e PostgreSQL, sem fallback de observação ausente. Três provas aritméticas PASS; projeção não recebe certificado CAPACITY PASS. Referência807.412.263B informada na revisão é preservada; as capturas brutas anteriores e sua aritmética não foram reescritas ou inventadas. Leitura atual15:56:46UTC/12:56:46Fortaleza mostra2.238.144.512B aos dois executores. Orçamento atualizado3.063.001.639B inclui36.171.776B para o retorno API compatível próprio: déficit824.857.127B; retirada projetaria margem134.082.009B. Amostra datada; não é espaço já liberado.

Consumo agregado legível: preparações22.694.834.176B, releases16.997.339.136B, du sem erro.60 archives/dumps grandes inventariados; nenhuma release é candidata à exclusão. Duas cópias da preparação ecosystem211000, alocação479.469.568B cada, nlink1, são idênticas à main mantida e ao blob off-host canônico. Hash/blob/índice novo/metadados e765 arquivos de extração reconferidos. Descritores e referências: observação root15:55:33–15:55:55UTC/12:55:33–12:55:55Fortaleza, duas amostras completas, owners0/incomplete0;4174 arquivos delimitados, zero referências explícitas absoluta/relativa aos dois caminhos. Conferência suplementar do basename em91 arquivos identificou9manifests/registros históricos: preservados no host/off-host e pinados no driver, sem editar o histórico ou executar geração consumida. Escopo não equivale a varredura de todo programa externo. [Hashes e evidências](storage-review.json).

Guarda38/hash fixo, API18413/worker18585/frontend4121573/daemon18676 e start ticks/cwd foram revalidados antes/depois pelo leitor root. Helpers atuais conferidos por hash: V4 `8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212`, socket `c885486f0a34c15f6b2a66af311eb151bc66f8d22c9790c35ae729dff1cbad30`, permanente `976272ee36d6900111877c02ea6d0b72dc9dad705237c819a18861c47bfaec3d`. Políticas reais estão no índice sanitizado; nenhuma instalação/sudoers/supervisão alterada. Job suspenso e recuperação.6 preservados; não emitir certificado global de drain.

### Retorno depois do encerramento histórico

[Manifesto compatível](compatible-return-manifest.json): retorno operacional próprio sobre a mesma base ativa+overlay6033, com os quatro leitores compatíveis e frontend novo74a2. É retorno de processo/controle, **não rollback semântico** para2ed/3227 anteriores. Base dist438 arquivos preservados, dependências/auth/schema/workerafbb iguais. Instância independente dos leitores foi executada em PG sintético depois do cancelamento:6entregas reportadas/5não enviados/0failed/0pending, dados preservados; resume409/campaign_batch_not_resumable, claimnull, provider0. Não houve ensaio de restart/V4 desta geração: binding/política/supervisão e saída/readiness reais continuam gates futuros.

Antes do cancelamento histórico, retornos atuais2ed/3227 continuam aplicáveis. Antes de autorizar esse cancelamento, exigir staging verificado e controles/políticas próprios do retorno compatível, hash integral/deps e prova de list/detail; se não disponíveis, **bloquear a ação histórica**, não improvisar API antiga, desfazer cancelamento ou reenviar. Frontend retorno pós-cancelamento deve conservar os mesmos bytes novos; nunca3227 antigo para representar not_submitted. Job cancelado é terminal pelo controle canônico e não pode ser resumed.

### Sequência restante

1. Decisão específica sobre retirada dois arquivos pelo bloco revisável; observação nova/revalidação individual, sem retry automático. Copiar diagnóstico off-host e inspecionar inclusive parcial/incerto.
2. CAPACITY atual demonstrado após retirada, WAL/erros/carga/inodes/backup/RPO reconfirmados. Se insuficiente, expansão mínima de1GiB efetivamente disponível pelo operador/provedor, decisão e procedimento próprios; não executada aqui.
3. Só então staging inativo da API6033/frontend74a2 e do retorno compatível, comparação integral/deps/manifestos; gerar políticas/bindings próprios/gatesfalse. Helper/nove sudoers preservados se contratos/hashes ainda conferidos; políticas de janela e permanente exigem sessão sudo de Deifson nas fases canônicas. Nenhuma política nova foi instalada ou declarada pronta sem staging.
4. Revisão/decisão de implantação API/mesmo worker → baseline frontend real pós-API → frontend/owner/controles. Após tudo validado, decisão separada e preflight fresco do cancelamento histórico, com retorno compatível disponível. Guarda38 permanece fechada, sem retomada/abertura/envio.

O incidente permanece OPEN. Capacidade tem uma ação concreta revisável, não uma nova negativa sem encaminhamento. Agrupamento/AUTO naturais, CRA-PR, CSV/Syer e internacional seguem separados; recuperação.6/setembro encerrados. Prioridade de janela sem uso humano informada pelo owner não dispensa verificações das automações.

## Histórico cf55655b — provas e preparação anterior preservadas


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

API overlay: `6033ac56931c47edaa01301fc3537a8012368bb33fe1d423c99e84ed1dde33a5`, 3102720 bytes, oito arquivos (quatro fontes/quatro compilados): campaignEligibility, campaignRecipientResultTruth, http/routes e campaignExecutionPresentation novo. [Manifesto de origem/resultado](api-overlay-manifest.json). Origem da API ativa2ed; fontes existentes conferidas em20788059 e os três compilados originais recuperados por SCP/hash. Aceitação, webhook, workerafbb, dependências, auth e schema preservados. Overlay não é uma release completa: a futura composição deve clonar/reutilizar a base íntegra pelo contrato, aplicar somente estes arquivos e conferir inventário integral antes do staging.

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
