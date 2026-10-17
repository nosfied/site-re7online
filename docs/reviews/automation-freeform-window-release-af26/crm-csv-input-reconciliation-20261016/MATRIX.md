## Reconciliação legada OFFLINE — correlação corrigida localmente

[Conclusão/produção das chaves](REPORT.md),
[16 provas](../crm-csv-delivery-review-20261017/LEGACY_AUDIT_PROOFS.json).
1764 criações e20 resumos da captura17:44 se correlacionam por UUID de chamada embutido
**e tenant**, não por telefone/hash/tempo. Mesmo conjunto1784 evidências →20 grupos
COMPLETED; nenhuma evidência removida. Erro no agrupamento52d6, não no gate terminal.
Fonte futura editável e hooks de composição corrigidos; snapshots/SQL v1/v2 consumidos
intactos. Órfãos/ambiguidade/operações realmente incompletas continuam negando.

| Controle | Estado vigente |
| --- | --- |
| Predicado terminal puro sobre a captura corrigida |PASS para20 resumos correlacionados, somente offline |
| Admissão integral |NÃO satisfeita: saída/ownership/escopo completo conhecido/fence não foram provados por esta análise |
| Próximo delta |revisar correção e vincular fonte/hashes à futura composição; não ajustar escopo/binding histórico para PASS |
| Demais dependências |atribuição/knownActivityScope/16 vínculos/autoridade/decisões API→frontend permanecem |

LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV suspenso;
M1 consumido; ELF pausado. Seções abaixo são checkpoints históricos.

## Resultado vigente — SQL v2 CONSUMED/COMPLETE17:44; admissão não satisfeita

[Resultado sanitizado](../crm-csv-delivery-review-20261017/SQL_V2_RESULT.json),
[análise/limites/encaminhamento](REPORT.md).

| Requisito | Evidência observada nesta rodada | Faltante / efeito |
| --- | --- | --- |
| Três SQLs/canal/custódia |blocos1/2 únicos exit0; quatro fronteiras PASS; captura715815B byte-exata |v1/v2 consumidos; não repetir |
| Identidade/visibilidade |db/roles esperados; PG16; READ ONLY; cinco relações SELECT; backends visíveis |não é fronteira/schema completo nem certificação de outros controles |
| Ownership |14 backends/4 advisory locks |UNKNOWN sem atribuição canônica; zero não exigido |
| Auditoria de imports |1784 eventos;20 grupos COMPLETED e1764 UNKNOWN, estes apenas criação legada isolada |imports gate nega import_not_proven_terminal; não prova1764 execuções ativas |
| Janela/materialização CSV |não executadas; demais provas datadas reutilizáveis no alcance |correlação/alcance legado→atribuição/16 vínculos/autoridade→decisões API→frontend |

Próximo passo exclusivamente local: revisão dirigida da correlação/alcance legado
com bytes existentes e contratos, sem promover UNKNOWN nem alterar dados/classificador.
M1 CONSUMED; ELF PAUSADO; CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.
As entradas de preparação abaixo são históricas e não autorizam replay.

## Preparação corrigida v2 — única entrada SQL vigente para revisão

[Dois blocos novos](../crm-csv-delivery-review-20261017/SQL_V2_COMMANDS_FOR_REVIEW.md),
[ligação e limites](REPORT.md#preparação-sql-corrigida-v2--basec5b6dbc4),
[4 ensaios incrementais](../crm-csv-delivery-review-20261017/SQL_V2_PROOFS.json).
Pacote composto contém fonte corrigida;13 provas anteriores reutilizadas. V1/roteiro
anterior CONSUMED/DENY, intactos. Nenhum destino real v2 consumido, nenhuma VPS.
Próximo: revisão/autorização separada dos blocos1/2 v2, depois reconciliação SQL/atribuição
→16 vínculos/autoridade→materialização/janela API→frontend. Ownership UNKNOWN.
M1 consumido; ELF pausado; CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.

## Atualização local libpq/harness — base06fc3c92

[Correção e limites](REPORT.md#correção-libpq--harness--local-validated--review-pending),
[13 provas](../crm-csv-delivery-review-20261017/SQL_LIBPQ_PROOFS.json).

| Requisito | Evidência / alcance | Faltante real |
| --- | --- | --- |
| Lançamento libpq |histórico vazio reproduzido; unset explícito na fonte futura; comando gerado consumido no laboratório |revisão; futuro pacote/manifest/destinos/autorização próprios |
| Harness |nove Docker -e literais; shell/psql/PG16 reais; três SQLs/quatro fronteiras/custódia;13 casos |Docker/SSH/rota simulados; sem certificação produtiva |
| SQL produtivo |DENY17:16 intacto, nada reconsultado |identity/visibilidade/backends/imports atuais; ownership UNKNOWN |
| Implantação CSV |contratos/provas aceitos reutilizados |vínculos/autoridade/materialização e decisões API→frontend, sem replay |

Primeiro ato é revisão deste delta; não executar os blocos SQL consumidos.
M1 CONSUMED; ELF PAUSADO. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.
As entradas abaixo são checkpoints datados, não instrução de repetição.

## Vigente17/10 às17:16 Fortaleza — SQL CONSUMED/DENY

[Relatório único](REPORT.md#estado-vigente-csv-17102026-às1716-fortaleza-base8e2a53cf),
[resultado](../crm-csv-delivery-review-20261017/SQL_RESULT.json).
A matriz histórica abaixo é procedência, não instrução de replay.

| Item | Estado/evidência vigente | Próximo passo / dependência |
| --- | --- | --- |
| M1/pais Event |COMPLETE/CONSUMED; predicado original PASS17/10 às15:09 | não repetir M1/preflight; revalidação no uso canônico futuro não é dispensada |
| Trio/config/saved/controles |leitura concluída15:37, fontes autênticas e compare canônico; DIRECTED_RESULT | reusar no alcance/horário; esta tentativa não os leu novamente |
| Canal SQL |before-identity PASS17:16, mesmo container/rota/cliente da custódia | não é identidade de servidor ou certificação de toolchain |
| SQL identity |cliente exit2, stdout0, diagnóstico service libpq vazio | corrigir LOCALMENTE ambiente efetivo/ensaio, sem alterar SQL/segredos/role |
| SQL ownership |não executado, backends/locks não observados; ownership UNKNOWN | sem zero implícito ou atribuição por lista de backends |
| SQL imports |não executado, classificação atual não observada; atividade completa desconhecida | sem reimportação, reparo ou conclusão retroativa por ausência de linhas |
| Provas locais8SQL |válidas só no ambiente de fixture; Docker -e PG* não propagados ao psql | futura correção deve ensaiar opções efetivas, não só SQL contra outro ambiente |
| Custódia |PASS byte-exato, origem DENY e destinos consumidos | sem retry/reconexão/overwrite |
| R1/R2/retorno/autoridade |provas locais aceitas reutilizáveis e composição estática | instalação/identidades/vínculos/permit/frescor próprios ainda pendentes; ORIGINAL não depende de executáveis candidatos |
| API→frontend |pacotes certificados reutilizados; CSV não implantado | depois de dados/provas e revisão, janela própria; backend compatível/ledger preservados no retorno pós-seleção |
| ELF/Prisma/segurança externa |ELF pausado; demais decisões preservadas | nenhuma nova frente, coleta ou rotação |

**Primeiro trabalho concreto é local:**sanitização do ambiente libpq e teste do lançamento
que reproduza as opções Docker, sem mudar contratos SQL ou fazer nova tentativa produtiva.
Esta entrega registra o achado, não implementa a correção. Os57 grupos originais permanecem
históricos, sem atualizações oportunistas de pins/perfis/observações. CSV SUSPENSO /
NOT DEPLOYED / NOT WINDOW READY. Metodologia/princípios completos e referências no
[runbook](../../../RUNBOOK_WHATSAPP_AGENT.md#continuidade-csv--estado-vigente-e-metodologia).

---

## Três SQLs canônicos preparados LOCALMENTE — base88126c97

[Roteiro literal para revisão](../crm-csv-delivery-review-20261017/SQL_COMMANDS_FOR_REVIEW.md),
[fontes/hashes](../crm-csv-delivery-review-20261017/SQL_REVIEW_SOURCES.json),
[provas PostgreSQL16 real](../crm-csv-delivery-review-20261017/SQL_REVIEW_PROOFS.json).
**Nenhuma VPS/SELECT produtivo nesta rodada. M1 consumido; ELF pausado.**

Reutiliza transporte/leitor/Capture/private_record e os três arquivos SQL existentes
sem mudar seus bytes:identity.sql(ed4eb882…), ownership.sql(989f3371…), imports.sql(cbb92b53…).
O canal é derivado em memória da captura autenticada499893B/f6873eb9… já concluída,
selecionando somente db-route/sql-client-path/version. Derivado privado tem tamanho/hash
no novo manifest, sem corpo publicado; não inclui env/trio/saved/crons. Falta/adulteração
ou leitura negada nega antes da materialização/SSH. Launcher e manifest têm hashes literais
no roteiro; carregam os mesmos bytes conferidos, sem import posterior por caminho mutável.
Não é nova autoridade operacional, framework, coletor genérico ou schema de política.

### Percurso mínimo, condições e alcance

Quatro fronteiras de rota/container/cliente:before-identity→after-identity/before-ownership→
after-ownership/before-imports→after-imports. Cada uma usa inspect limitado existente,
System.db_container canônico e os dois comandos de cliente já aceitos, com igualdade
à custódia. Sem refresh do trio, saved/fallback ou controles; nenhuma fonte datada
substitui a revalidação do canal. No máximo15 subprocessos no caminho válido.

Cada SQL executa uma vez, na ordem, READ ONLY/timeouts/ROLLBACK e psql -X -w -Atq
ON_ERROR_STOP=1, role/database fixos, PG* limitadas. Identity exige database/role/read-only/
major16 e system ID observado; não inventa pin de cluster anterior. Falha de privilégio
ou identidade/limite nega sem sudo, role alternativo, alteração de SQL ou retry. Falha
encerra a conexão (rollback automático se ON_ERROR_STOP impedir o ROLLBACK textual),
preserva diagnóstico e não faz a próxima fronteira/consulta. ownership lista backends/
locks, não requer zero com produção viva e nunca certifica atribuição completa.
Imports100001 dispara IMPORTS_POSSIBLY_TRUNCATED_100001, com raw privado preservado;
é possível truncamento, não contagem completa presumida. Até100000, classificador
canônico tenant/op/UNKNOWN é reutilizado, sem emitir scopeComplete/old-exit/fence.
Dados IDs/tenants e erros SQL ficam privados; Git recebe só conclusões/hashes.

A lacuna8MiB do journal foi demonstrada por PostgreSQL real:100001 linhas produziram
16675395B. Só o export desta derivação escolhe96MiB antes da leitura, via o mesmo
stable_file e o mesmo formato canônico. SQL stdout64KiB/4MiB/32MiB e demais comandos1MiB,
stderr64KiB; excesso preserva prefixo explicitamente parcial e hashes/tamanhos observados,
nega sem afirmar custódia dos bytes descartados. Captura do subprocesso em memória vem
antes dessa checagem: não é limite de RAM/processo ou orçamento de disco total. Não se
reduziu o limite SQL nem alterou o leitor/manifest histórico. O roteiro discrimina o
cálculo Base64/journal e as cópias adicionais de transporte; capacidade/reservas canônicas
continuam requisito de execução, não certificado nesta preparação. Sem backup/build.

### Provas novas afetadas e reuso

Oito provas em PostgreSQL16 isolado novo sob /tmp, socket Unix sem TCP/VPS, ciclo de
laboratório iniciado/encerrado explicitamente:caso válido com segundo backend real ativo;
negação real de EXECUTE pg_control_system; negação real de SELECT Event; database e role
divergentes reais;100001 linhas Event sintéticas reais; rota divergente (fronteira Docker
simulada, zero SQL); limite de saída (resposta sintética, prefixo/negação explícitos).
Nos casos SQL reais os payloads são exatamente os pinados, não mocks de resultado.
Classificador, System.db_container e byte-exact export/ingest/private_record são concretos.
Docker inspect/exec e seus IDs são fixtures; SSH não foi executado, não é prova de canal
produtivo. O caso válido comprova três consultas e quatro revalidações; negativas impedem
próxima consulta, sem replay ou falso complete. Somente essas interfaces foram testadas.

Compositor reproduz3 arquivos de código byte a byte e12 vínculos de entrada em destino
descartável (só destino instrumentado); derivação do canal lê a custódia local legítima,
com negativas ausência/negação/adulteração e metadados de origem(uid/600). Nada é publicado como observação/perfil/permit
operacional novo. Provas funcionais CSV, frontend, retorno, autoridade/PM2, M1 e coleta
anterior foram reutilizadas sem repetir suítes/builds. Fontes editáveis em
scripts/crm_csv_diagnostic/sql_execution.source e compose_sql_review.py; arquivos sob
sql-review são derivados inativos para a revisão, não geração de implantação.

**Primeiro ato restante:** revisão e autorização separada dos dois blocos SQL publicados,
com destinos exclusivos. Sem execução automática após publicação. Depois dos resultados,
reconciliar identidade SQL/visibilidade e importações; atribuição canônica completa continua
própria, sem presumir que pg_stat_activity ou zero backends resolvem ownership. Root/
proteção dos consumidores/16 vínculos/autoridade/frescor final continuam fases distintas
na sequência já registrada API24e5857f→validação ledger/GET→fronteira/revisão frontend.
NEWauth+NEWDB+NEWcipher, multitenancy, crons, guarda38 e out.15 CLOSED preservados.
**CSV SUSPENSO / LOCAL VALIDATED NO ALCANCE / REVIEW PENDING / NOT DEPLOYED /
NOT WINDOW READY.** Deifson; revisão21/10 ou mudança. Histórico abaixo preservado.

---

## Leitura dirigida concluída17/10 às15:37 Fortaleza — base80e62ffd

**DOIS BLOCOS CONSUMIDOS / COLETA E CUSTÓDIA PASS / RECONCILIAÇÃO OFFLINE APROVADA NO ALCANCE OBSERVADO.** [Resultado sanitizado e procedência](../crm-csv-delivery-review-20261017/DIRECTED_RESULT.json).
HEAD/remoto80e62ffd e todos os hashes/fontes/precondições locais conferidos; bloco1
literal executado uma vez, materialização inativa PASS; somente depois bloco2 uma vez
como deploy sem sudo. Nenhuma adaptação de código, referência ou constante. Manifest
1a0ac094… e launcher5ce13ad8… inalterados. Destinos publicados agora consumidos; não
repetir blocos, nova conexão, preflight Event, M1, M2/M3 ou frente ELF.

Intervalo do runner: **18:37:34.897090–18:37:36.148114UTC** (15:37:34–15:37:36 Fortaleza),
**1,251024s**. Transporte/custódia18:37:32.029895–18:37:36.675419UTC,4,645524s.
Esses intervalos não são snapshot atômico, continuidade de observação ou medição de
HTTP/indisponibilidade. Terminal GATES_1_3_AND_CONTROLS_OBSERVED e recibo
CUSTODY_PRESERVED_GATES_PASS_NOT_CERTIFIED. Nenhuma operação de serviço/tenant foi feita.

### Reconciliação pelos bytes preservados, sem nova consulta

| Requisito | Fato efetivamente conferido | Limite |
| --- | --- | --- |
| Fontes/Node/daemon |35 fontes e26 membros RPC autenticados; Node hash/cadeia+FD; daemon18676/ticks222727, socket/peer/pm2.pid estáveis no intervalo | sem closure ELF/proteção root certificadas; fontes antigas são expectativas CAS, não substituem observações |
| Trio | API936386/ticks2193413108, worker936540/ticks2193413523, frontend188897/ticks2161347676; população exata, identidades antes/depois e operações canônicas de configuração PASS | não é health/DB/out.15/guarda atual nem certificação permanente |
| Frontend | source.profile atestado fornece OS; dump histórico fornece projeção PM2; compare_frontend53de e System/Operations PASS, ambientes separados | correção de representação não altera contrato nem pressupõe dump==environ |
| Saved/fallback | dois arquivos30425B, SHA05fd82d4…, byte-idênticos, regulares owner1000 modo600; três membros completos enumerados | nenhum campo foi removido para obter PASS |
| API/worker salvos | caminhos/interpreter e todas96/24 entradas do perfil OS original coincidem; ambientes salvos99/27 entradas coincidem integralmente com projeções RPC | dicionários OS/PM2 não são iguais: três chaves extras PM2_JSON_PROCESSING, nome do processo e unique_id, explicitamente preservadas |
| Campos saved completos |136 campos API,64 worker,71 frontend; mesmos conjuntos que o before; entre saved e live, campos comuns diferem só em axm_monitor; live tem ainda instances/pm_id | mudança vs pre-window do par em oito campos está registrada, sem atribuição histórica por hipótese |
| Frontend salvo | compare_saved original PASS: ambiente igual e diferença só axm_monitor vs before | exceção concretamente aceita não foi ampliada para outros campos |
| Cron deploy |2017B, SHA ff827e69…, byte-exato ao before autenticado | confere conteúdo observado, não execução passada/futura dos jobs |
| Cron sistema |201B, SHA2e83a677…, byte-exato ao before autenticado | conferência separada do deploy, sem alterar cron ou usar supervisão como substituto |
| Supervisão |43B, SHAce5c1c72…, igualdade exata a initial.supervision histórico atestado | não inferida do boolean supervisionRestored ou de inactive/enabled |
| Gates/authorization |cinco nomes exatos, todosfalse; authorization=false; arquivos owner600 | somente observação; nenhum gate admitido/resetado, nenhuma autorização de janela |
| Rota/cliente | System.db_container e URLs ativas dos dois consumidores PASS; ID/IP/publicação do binding atestado; caminho absoluto psql e versão16 observados | nenhum SELECT/conexão PostgreSQL; identidade de servidor/database/role efetivos e ownership UNKNOWN |

Os oito campos diferentes de saved API/worker vs dump pré-janela são axm_monitor,
created_at, env, pm_err_log_path, pm_out_log_path, pm_pid_path, pm_uptime e unique_id.
Isso não foi reduzido por whitelist para declarar igualdade integral. Paths/ambiente
exigidos pelo perfil original coincidem, e toda projeção env coincide com o live
observado. A igualdade de todos os campos comuns saved/live exceto axm_monitor é
comparação explícita dos objetos preservados; não suprime os campos exclusivos live
instances/pm_id. Os perfis preservam NEWauth+NEWDB+NEWcipher no alcance das variáveis
conferidas privadamente; não foram publicados valores/hashes individuais de segredos.

Referências legítimas: arquivo de recuperação aceita SHA32e0cb1d… fornece initial,
source.profile e dump; archive canônico pré-janela SHA8d5ed997… fornece ambos os before
cron. Os novos arquivos de referência foram comparados byte a byte aos membros desses
archives, não assumidos autênticos por terem sido lidos. ScheduledControls.verify(before)
foi executado **offline** sobre as respostas preservadas com os before autenticados;
nenhum comando remoto/método de restauração foi executado nessa análise. Supervisão
usa os bytes initial.supervision, conforme Controls.finish, sem invocar finish.

### Custódia efetiva, encerramento e sequência mínima

82 registros de canais comando/observação verificados em tamanho/SHA/Base64 e código;
export499893B/SHAf6873eb9… conferido byte a byte contra stdout SSH667110B e recibo.
Stderr SSH vazio, journal local1391125B; envelopes de ambos launchers exit0 e canais
conferidos. Arquivos privados0600/diretórios0700. Todos os brutos, configurações, crons,
ambientes, nomes/IDs privados e journals ficam fora do Git. As35 fontes e scripts
literais consumidos permanecem iguais aos publicados, sem edição para PASS.
Não houve teste/build novo nesta rodada: são observações reais e análise offline;
provas locais aprovadas foram reutilizadas. DENYs anteriores não são reclassificados.

A evidência permite vincular **para revisão separada** os três SQLs canônicos existentes
(identity.sql, ownership.sql e imports.sql, hashes completos no resultado) ao canal
observado, container identificado por hash e comandos db-route/sql-client-path/version.
**SELECT NÃO EXECUTADO E NÃO AUTORIZADO**, sem novo launcher/pacote de execução ou
replay dos antigos blocos consumidos. Futura proposta precisa de decisão própria,
destinos exclusivos e revalidação da rota antes/depois; cliente16 não comprova server16,
role/permissões/identidade do cluster. Consulta de backends não atribui por si os
sockets de todos os processos: ownership completo exige provas canônicas próprias.
Não exigir banco vazio com produção viva; saída/ownership é etapa da janela autorizada.

**Próximo requisito concreto:** decisão separada sobre SELECTs delimitados vinculados
a esse canal e sua revalidação, para fechar identidade SQL/visibilidade/importações.
Depois: fechar atribuição canônica e controles protegidos/16 vínculos com observações
atuais e fontes aceitas→materialização final quatro modos, R1/R2 e predecessor e2a5→
revisão de autoridade/política específicas→janela coordenada/R0/root frescos→A/admissão
explicitamente autorizadas→saída/ownership/CAS→API24e5857f→validação UUID/GET/ledger→
fronteira frontend com identidades reais e revisão/decisão própria→frontend candidato.
Retorno após seleção mantém backend candidato/replay protegido; defeito persistente
exige outra versão compatível. Nada disso foi iniciado automaticamente.

Faltantes exatos desta coleta: identidade SQL server/database/role e visibilidade,
classificação atual de importações e atribuição completa; root600/política/barreira e
guarda38 não observados aqui; proteção instalada dos consumidores,16 vínculos e
âncora/autoridade/permit específicos não instalados por esta ação. Capacidade/WAL/RPO,
backup/restore e frescor final só na sequência autorizada apropriada, sem renovação
antecipada nesta rodada. ELF segue PAUSADO, não nova exigência de descoberta.
Produção multitenant preservada: sem dados/config/RBAC/credenciais/crons/serviços,
importação, instalação, restart, SELECT, contenção ou janela. M1 consumido intacto,
NEWauth+NEWDB+NEWcipher, ambos crons, guarda38 fechada e out.15 CLOSED preservados;
guarda/out.15/health atuais não foram recertificados por inferência.
**CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.** Deifson; revisão21/10 ou mudança.

---

## Próximo ato CSV preparado — base8bf0fa8e, somente revisão LOCAL

**M1 COMPLETE/CONSUMIDO; não repetir M1/M2/M3, Event/preflights ou frentes ELF.**
[Roteiro integrado literal](../crm-csv-delivery-review-20261017/DIRECTED_COMMANDS_FOR_REVIEW.md),
[fontes/procedência](../crm-csv-delivery-review-20261017/DIRECTED_SOURCES.json) e
[provas focadas](../crm-csv-delivery-review-20261017/DIRECTED_PROOFS.json).
Nenhum acesso à VPS nesta rodada. CSV SUSPENSO / LOCAL VALIDATED no alcance ensaiado /
REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.

O diagnóstico existente foi composto em destino de revisão próprio, sem tocar os
runners/manifestos/intents consumidos. Fonte editável: scripts/crm_csv_diagnostic/compose_directed.py,
que consome source_inputs() aceito e pinado. Três arquivos executáveis pequenos derivados
(launch/driver/runner);35 fontes autenticadas, incluindo26 RPC reutilizadas por referência,
adaptador frontend53de3ac7 e opsc84a5e05. Não é framework/coletor genérico, novo checker de
configuração ou preparação operacional dos quatro modos. Não copia runtime, perfis ou
bindings. A função de SELECT e seus quatro payloads foram excluídos deste roteiro; a
exposição só permite materialize/collect, não instalação/emissão/partida.

O fluxo novo conecta a fonte editável ao consumidor real: perfil OS vem exclusivamente
do source.profile autenticado; projeção PM2 completa vem do dump aprovado; Operations.config /
System.check_config e compare_frontend/compare_saved aceitos permanecem. Preserva ainda
os bytes completos de saved/fallback, não só o frontend. As identidades/boot esperados são
CAS histórico: não são fatos atuais e qualquer diferença nega sem adaptação automática.

Controles são observados separadamente pelos canais canônicos: deploy crontab, cron de
sistema, supervisão, before de ambos crons, initial.private.json, gates e authorization.
A nova leitura não confere root600/barreira/guarda nem interpreta inactive/enabled como
defeito. A conferência offline deve autenticar as referências contra custódias já válidas,
comparar cada cron pelo contrato ScheduledControls(before) e supervisão por initial.supervision;
gates/authorization false e trio completo de saved/fallback exigem reconciliação dos novos
bytes. Não se atribui essa certificação a uma simples coleta ou ao gate frontend.

### Gates e única sequência restante

| Ordem | Resultado esperado / consumidor | Encaminhamento |
| --- | --- | --- |
| 1 Fontes/revisão | hashes literais→launch→manifest→mesmos bytes em memória; destinos exclusivos | leitura ausente/adulterada/existente nega antes do SSH quando local; não download/fallback |
| 2 Identidade/config/saved | RPC único de daemon existente com peer/ticks/boot/FD; consumidores canônicos do trio; dumps600 | observação atual futura, não inferida das fontes datadas; perfil OS e projeção completos separados |
| 3 Rota/cliente | System.db_container, ID/IP/publicação e URLs dos dois consumidores; psql path/versão16 | GATE3_ROUTE_CLIENT_OBSERVED, sem conectar PostgreSQL, sem exigir banco vazio |
| 4 Controles/custódia | CONTROLS_OBSERVED_NOT_CERTIFIED, canais e export byte-exatos, antes/depois com horários | analisar privately os controles e referências; ownership/root/guarda/barreira permanecem não certificados |
| 5 Decisão separada | SELECTs delimitados do contrato existente, depois atribuição canônica | sem SELECT nesta entrega, sem capture_imports.capture livre; produção viva não precisa de banco vazio |
| 6 Materialização final | dados reais e16 vínculos→quatro modos/R1R2, predecessor e2a5 e autoridade apropriada | proteção dos consumidores já adotada permanece; ELF discovery pausado, não condição nova para este diagnóstico |
| 7 Janela explícita futura | frescor/R0/root→review hashes→A/admissão→saída/ownership/CAS→API24e5857f | nenhuma dessas etapas está autorizada aqui, sem intents inventados |
| 8 Frontend | API validada UUID/GET/ledger→identidades reais de fronteira→review/decisão→frontend candidato | retorno pós-seleção mantém backend candidato e replay protegido; defeito persistente exige versão compatível |

### Provas efetivas e limites

Cinco ensaios afetados: dois blocos Bash literais completos (materialização local +
transporte/custódia), adaptador aceito com ambientes OS/PM2 distintos, controles presentes,
fonte adulterada antes de SSH, peer divergente, leitura de controle negada e transferência
parcial. O teste de controle negado foi reforçado e só ele repetido: etapa
controls-deploy-cron / DEPLOY_CRON_READ_FAILED, sem falso terminal de controles observados.
Compositor reproduz exatamente os três arquivos e35 vínculos digest/tamanho/bootstrap
em destino descartável; só o destino foi instrumentado. A primeira checagem detectou
um espaço extra introduzido pelo encapsulamento da string do compositor; corrigida a
string do produtor, sem mudar os bytes entregues/testados ou afrouxar comparadores.

Reais no laboratório: Node/cliente RPC closure26/protocolo e socket locais, memfd/FD,
checkers concretos, leituras filesystem, launcher/autenticação, journal/export/ingest
private_record. Simulados explicitamente: SSH por shim, /proc/SO_PEERCRED produtivos e
pins sintéticos antes das contraprovas, Docker/psql-path/version e respostas dos controles.
Network namespace sem VPS. O sandbox inicial impediu socket; mesma suíte executada com
permissão de laboratório local. Nenhum mock substituiu o comparador por PASS. Provas
frontend/R1R2/recuperação/autoridade/PM2/M1 não afetadas foram reaproveitadas, sem rebuild
ou suíte ampla. Fixtures sintéticas e lab.py não são enviados pelo manifest remoto.

Limites herdados explícitos no roteiro: fonte8MiB/boot64B/bundle4MiB/hash-imagem256MiB,
RPC8s/comando25s/SSH180s; journals e capture_output não têm teto global em bytes. Não
se declara orçamento de armazenamento/RAM certificado. Os resultados são intervalos,
sem snapshot nem promoção de DENYs históricos. Falha preserva o parcial e encerra sem
retry/reconexão/reparo/expansão de limites. Ação operacional seguinte é exclusivamente
revisar/autorizar os dois blocos publicados, não executá-los nesta rodada. RPO/root
perecíveis, SELECT e atribuição ownership continuam decisões separadas.

Responsável Deifson; revisão17/10/2026, próxima21/10 ou mudança. NEWauth+NEWDB+NEWcipher,
crons, produção, guarda38 fechada e out.15 CLOSED preservados, sem observação atual
nova nesta entrega. Sem VPS/SQL/instalação/restart/importação/alteração de dados/RBAC,
credenciais/crons/serviços; sem continuidade automática depois da publicação.

---

## M1 COMPLETE17/10 às15:09 Fortaleza — cinco pais0755, Event original PASS

[Resultado na mesma proposta](../crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md), [efeitos/hashes](../crm-csv-delivery-review-20261017/M1_RESULT.json). M1 único autorizado6feb950b, owner forneceu coordenação no TTY, deploy uid1000 SEM sudo: cinco0775→0755 por FD, owner/grupo/demais bits e demais campos preservados, ctime esperado. Cinco pares intent/done, plano pinado e terminal APPLIED_EVENT_PARENTS_PASS conferidos; canais11.295B/0B e exports privados byte-exatos off-host. Journal remoto0,005522s; span local576,789931s inclui espera do owner, não duração de manutenção/HTTP.

M1/destinos consumidos; M2/M3, replay, leitura remota adicional e reparo não executados. Coordenação temporária encerrada após conferência. Só o impedimento pais Event foi resolvido naquele instante; restantes CSV preservados, sem retomada automática. Sem serviço/cron/tenant/RBAC/credencial/overlay/importação; sem testes/builds/backup novos. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY; ELF PAUSADO. Deifson; revisão21/10 ou antes de mudança.

---

## M1 não iniciado — falha local do TTY, base1e8ba1c0

[Resultado na mesma proposta](../crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md), [hash/procedência](../crm-csv-delivery-review-20261017/MAINTENANCE_RESULT.json). HEAD/remoto/hashes PASS; tentativa única de abrir terminal do owner falhou exit127 por incompatibilidade libpthread/GLIBC_PRIVATE. Nenhuma confirmação de coordenação, bloco M1 ou SSH iniciados; zero efeitos. Destino local M1 ausente; plano/fontes/blocos não alterados, M1 não consumido. Diagnóstico privado canônico preserva o output combinado observado, sem alegar canais M1 ou horários de manutenção inexistentes.

Parado sem retry/reparo/alternativa/M2/M3. Próximo: owner orientar retomada por TTY local utilizável e confirmar os mantenedores/jobs reais antes de qualquer SSH. Não houve observação produtiva nem recertificação de permissões; análise ACL/provas locais continuam válidas. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY; ELF PAUSADO; Deifson, revisão21/10 ou antes de retomada.

---

## ACL fechada OFFLINE e manutenção restrita LOCAL — base396f2ed8

[Mesma proposta, análise primária e executores M1/M2/M3](../crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md). No caminho POSIX ACL Linux não há restrição VFS de owner para leitura, falhas LSM/suporte são propagadas e ENODATA corresponde à falta da ACL opcional. A custódia (FDs legíveis, uid=owner1000, cinco775 e dez ENODATA) não demonstra ocultação: a ressalva genérica não é bloqueio concreto nem exige provar ausência de mecanismo desconhecido. ACL base pelo modo continua; registros históricos/absenceConfirmed=false preservados.

Executor futuro remove somente g+w em cinco FDs, preserva owner/grupo/demais bits, revalida plano original/cadeia/ACLs no uso, intent/done por efeito, Event original e retorno só de efeitos comprovados. Coordenação concreta do owner/mantenedores Git/npm/sync é precondição manual registrada, não lock inventado ou prova automatizada de ausência.9 provas locais, incluindo parcial/incerteza/replay/deriva/retorno e transporte simulado com perda de resposta. Nenhuma VPS, coleta, efeito produtivo ou janela. Próximo: revisão dos executores e decisão sobre coordenação/autorização, não nova coleta ACL/ELF por rotina. CSV SUSPENSO / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY; Deifson, revisão21/10 ou antes de mudança.

---

## Preflight xattr17/10 — coleta completa, aplicação ainda bloqueada

[Resultado na proposta existente](../crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md) e [hashes/procedência](../crm-csv-delivery-review-20261017/XATTR_RESULT.json): novo bloco661c2ffa executado uma vez às14:28:50 Fortaleza, deploy sem sudo, exit0; histórico getfacl não executado. Oito elos revalidados, cinco diretórios0775 uid/gid1000; access/default retornaram ENODATA61 nos dez casos, zero blobs. Não é ausência comprovada. Nove campos de cada alvo iguais à R1 histórica, sem continuidade/atomicidade presumida. Canais6.978B/0B e custódia canônica byte-exatos; sourceComplete=true/applicationAuthorized=false.

Faltam interpretação da visibilidade ENODATA, atribuição/exclusão de writers Git/npm/manutenção e executor/plano/intent/CAS fresco com autorização própria. Próxima decisão restrita: delimitar os mantenedores concorrentes e o tratamento dessa incerteza na mesma proposta, sem inventário genérico ou novas leituras agora. Ambos os preflights/destinos consumidos preservados; nenhuma permissão/ACL/código alterados, sem retry ou teste/build repetido. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY; ELF PAUSADO. Deifson; revisão21/10 ou antes de nova decisão.

---

## Revisão ACL xattr LOCAL — basec7aa5897, preflight consumido preservado

A [proposta existente](../crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md) agora contém **novo** bloco literal/destino exclusivo para revisão: dois nomes POSIX ACL access/default por os.getxattr nos mesmos FDs, sem getfacl remoto ou parser. Transporte/leitor/Capture/private_record reutilizados, autenticados dos mesmos bytes. ENODATA é ausência/não visibilidade não confirmada; EACCES/EPERM, ENOTSUP e outros erros ficam distintos e negam, nunca viram “sem ACL”. Bytes presentes ficam opacos em custódia privada e alterações permanecem bloqueadas.

[12 provas locais](../crm-csv-delivery-review-20261017/XATTR_PROOFS.json): ACL base/estendida/default reais contra getfacl, bytes exatos/FD, negação e falta de suporte reais locais, substituição/symlink, erros injetados, perda de resposta e bloco literal/custódia. Sem VPS/instalação/chmod/SQL/ELF, sem suíte anterior repetida. Próximo ato é somente revisão e autorização própria da consulta xattr; estados atuais, análise ACL e cobertura/exclusão dos writers continuam faltantes. DENY/getfacl consumido intacto; CSV SUSPENSO / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY, ELF PAUSADO. Deifson; revisão21/10 ou antes da mudança.

---

## Event preflight17/10 — CONSUMED/DENY antes dos alvos

[Proposta existente atualizada e decisão](../crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md), [resultado/hashes](../crm-csv-delivery-review-20261017/PREFLIGHT_RESULT.json). Uma execução literal f0538524 deploy sem sudo às14:17:02 Fortaleza; exit1, tool-preflight / READ_OR_TOOL_FAILURE / FileNotFoundError errno2 na consulta ao caminho fixo /usr/bin/getfacl. Identidade não privilegiada observada, zero alvos/cadeias/ACLs e zero comandos getfacl. Canais602B/0B e recibos privados conferidos; sourceComplete=false. Sem retry, alternativa, busca, leitura adicional ou mudança produtiva.

Aplicação0755 continua DENY: faltam evidências atuais dos cinco e atribuição/exclusão de writers. Próximo ato é decisão separada sobre a ferramenta ACL/mecanismo revisado; não há instalação ou nova coleta autorizada. Custódias anteriores mantêm seus horários/alcances; bloco/destino agora consumidos. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY; ELF PAUSADO; Deifson, revisão21/10 ou antes da mudança. Nenhum teste/build repetido nem código alterado.

---

## Preflight dos cinco pais — preparado LOCALMENTE, base0b38fb0c

[Roteiro literal e análise de impacto atualizados na mesma proposta](../crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md): transporte/leitor/Capture/private_record reutilizados, cadeia por FD/meta canônico e ACLs por getfacl fixo; ferramentas gateadas antes dos alvos, sem fallback. Getfacl2.3.2 disponível só no laboratório; VPS desconhecida.14 provas locais afetadas, incluindo bloco shell completo e negativas; simulações explícitas, sem VPS/chmod/sudo ou novo pacote operacional.

A documentação identifica Git/npm, importadores Event e cron, mas não comprova dependência efetiva de g+w ou exclusão de writers. Preflight completo não autoriza0755; faltam ACLs atuais e cobertura/exclusão dos mantenedores concorrentes, seguidas de executor/plano/intent/CAS e aprovação específica. Próximo ato concreto para revisão é autorizar somente o bloco de preflight publicado, destino novo exclusivo, sem aplicação. DENY anterior e todos os históricos permanecem intactos; CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY; ELF PAUSADO. Deifson; revisão21/10 ou antes da mudança.

---

## Event17/10 — execução única CONSUMED/DENY e encaminhamento concreto

**CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.** Base92df116b/remoto conferidos; manifest publicado integral PASS e bloco literal executado uma vez como deploy, sem sudo. Às14:02:30 Fortaleza, exit1: `event-parent-contract` / `EVENT_PARENT_CONTRACT_NOT_SATISFIED`. Primeiro pai `src/events`0775, uid/gid1000. Só um pai alcançado; demais não certificados. Sem timeout/retry/reconexão ou leitura remota adicional. Canais, hashes, modos privados e ingestão canônica conferidos; [resultado sanitizado](../crm-csv-delivery-review-20261017/RESULT.json). O roteiro anterior está **consumido**; não executar novamente nem reaproveitar seu destino.

[Proposta mínima para decisão separada](../crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md): remover apenas g+w dos cinco pais literais historicamente0775, condicionado a preflight atual integral, atribuição dos consumidores/writers e ACLs, plano/intent/CAS novos, verificação pelo mesmo predicado e retorno explícito dos efeitos comprovados. Somente o primeiro tem observação nova; quatro são históricos, não CAS atual. Não há aplicação autorizada nem executor de remediação certificado nesta rodada. Faltantes e efeitos sobre escrita de grupo estão explicitados; nenhum chmod/reparo foi executado.

Próximo ato para revisão: autorizar e concretizar essa manutenção restrita, sem A/B/CSV; não simplesmente repetir a coleta consumida. Event PASS futuro não resolverá sozinho saved/fallback/identidades, SQL/ownership, vínculos/autoridade e proteção de consumidores. ELF/budget/discovery continua PAUSADO. Artefatos, fontes, testes válidos, DENYs, históricos e57 grupos originais preservados. Nenhum teste/build repetido: delta é resultado documental e proposta, sem alteração de implementação. NEWauth+NEWDB+NEWcipher/crons/guarda38/out.15 intocados, sem recertificação global. Responsável Deifson; revisão17/10, próxima21/10 ou antes da mudança.

---

# Rumo corrente — entrega CSV retomada LOCALMENTE17/10/2026

**ELF/budget/discovery PAUSADOS.** [Composição concreta](../crm-csv-delivery-review-20261017/DELIVERY.json):
127 caminhos/61 conteúdos,54 reutilizados,7 novos/17.612B; API24e5857f/frontendea3d/retornod41d/Eventebdf
conferidos sem build/extração/cópia. [Próximo ato literal](../crm-csv-delivery-review-20261017/NEXT_OPERATION_FOR_REVIEW.md)
SOMENTE PARA REVISÃO: uma leitura deploy sem sudo dos pais Event, custódia privada,
sem execução nesta rodada, sem continuar após DENY. Código/predicado canônico no uso intacto.

| Bloqueio concreto | Consumidor | Próximo passo na sequência única |
| --- | --- | --- |
| Última observação dos pais Event775 | event_parents→validate_pre_stop→check_current/CLI→Operations/overlay | Primeiro: revisão/autorização da leitura dirigida; remediação se necessária exige decisão separada, sem chmod implícito |
| Dados atuais/config/SQL/ownership | System.check_config/ScheduledControls/check_current/exit_and_imports | Captura CSV dirigida e binding, sem executar capture_imports pós-saída fora de janela; preservar UNKNOWN |
| Root/16vínculos/âncora | Context/Loader/root_store/pm2_input.alias, contratos R1/R2 | Materialização real/selagem/CAS/instalações revisadas distintas; sem fabricar permit ou identidade. Proteção do consumidor é requisito; coletor ELF não é requisito funcional obrigatório |
| Frescor/RPO e execução | restore/pre_install/admit_gates/CLI | Só com horário: R0/root/hashes, decisão explícita; depois saída/CAS/API→frontend e recuperação conforme estado |

Seis testes focados novos; provas funcionais/32/R1R2/28/PM2/restore reutilizadas,
sem repetição. PREPARAÇÃO ESTÁTICA CONCLUÍDA / INPUTS OPERACIONAIS NEGADOS /
CSV SUSPENSO PARA EXECUÇÃO / NOT DEPLOYED / NOT WINDOW READY. Histórico abaixo preservado.

---

# Dimensionamento ELF local —17/10/2026, base5b679f62

Proposta única para revisão futura: pools limitados143MiB remoto/546MiB local,
allowances físicos condicionais2/14MiB +25% +arredondamento64MiB → **192/704MiB**.
[Memória de cálculo/limites](REPORT.md#dimensionamento-elf-revisto-localmente-17102026-base5b679f62).
Nenhum valor de disponibilidade entra no cálculo; não autoriza redução do orçamento
consumido512MiB/2GiB, retry, realocação ou nova consulta.

| Requisito | Resultado local | Falta operacional |
| --- | --- | --- |
| Escrita/journal/parcial | Guard antes dos writers canônicos; pools, entradas, append, reserva terminal e parciais contabilizados | Geometria/alocação/quota/inodes/reservas/RAM atuais por filesystem |
| Canais/recepção | Child pipes limitados; SCP exato não recursivo, RLIMIT por tamanho de referência, prazo global240s;12 testes afetados PASS | Cliente SCP real/servidor não certificados por filho sintético; revisão dos8 snapshots/roots e destinos futuros |
| Proposta192/704MiB | Derivada de código +margem independente, PLAN.json; teto lógico, allowance físico não universal | Orçamento novo ainda não aplicado/autorizado; gates512/2GiB e snapshots consumidos intactos |
| Deny anterior / consulta | Históricos preservados; causa anterior INDETERMINATE | Não concluir capacidade atual pelos442,90MiB históricos; não repetir |
| Demais frentes | Frontend/predecessor/provas PM2 reutilizados, não reabertos | Toolchain protegido, SQL/ownership, saved/fallback, identidades/16vínculos/autoridade/Event775 continuam pendentes |

CSV SUSPENSO / LOCAL VALIDATED no alcance / REVIEW PENDING /
NOT DEPLOYED / NOT WINDOW READY. Próximo: revisão local da proposta; nenhuma execução.
Checkpoints abaixo históricos.

---

# Consulta dirigida b39169e8 executada —17/10/2026

Um bloco/um SSH/uma statvfs, deploy sem sudo, exit0. [Resultado sanitizado](../crm-csv-toolchain-capacity-20261017/RESULT.json). Custódia byte-exata verificada, readComplete=true / budgetSatisfied=false; consulta capacity-v1 **consumida**, NÃO REPETIR. Nenhuma escrita remota ou continuação ELF.

| Requisito | Observação nova16:01:12UTC (13:01:12Fortaleza) | Limite / pendência |
| --- | --- | --- |
| Capacidade destino |f_bavail113383×f_frsize4096=464.416.768B (442,90234375MiB) |<536.870.912B/512MiB; faltam72.454.144B. Orçamento/destino inalterados; primeiro bloqueio atual |
| Contrato directory(q) |Canônico PASS; uid1000/gid1000/0700, dev26/inode1067 |Não prova ACL/quota/escrita ou mkdir; não é admissão operacional |
| images/pais |images ausente nos checks; pais/tipos/FDs/metadados estáveis no intervalo |Sem metadados de images a inventar; não se deduz sua história |
| Causa do DENY anterior |Observação atual distingue orçamento falso de diretório válido |Causa antiga INDETERMINATE: faltam os dados daquele instante; não reclassificar |
| Demais inputs |Não consultados |Node/ELF/PM2/closure/proteção, SQL, identidades e autoridade seguem pendentes |

A leitura está concluída; capacidade de janela/closure/proteção NÃO certificadas. Sem retry, limpeza, redução, destino alternativo ou retomada automática. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY. Seções abaixo preservadas como históricas.

---

# Reconciliação offline de remote-budget —17/10/2026, baseaf2eaf04

20arquivos privados conferidos, frame7fontes coincide com revisão. Sem números statvfs ou marcador mkdir. O stage agrupa2statvfs+new_directory(images); contraprova real do predicado canônico demonstra registros indistinguíveis. **Causa INDETERMINADA, criação de images também não demonstrada.**

| Lacuna | Fechado offline | Faltante / ação proposta |
| --- | --- | --- |
| Causa do DENY |Custódia íntegra, insuficiência diagnóstica explicitada; action collect conhecido |Uma consulta futura de metadados/FD e1statvfs no destino original, sem escrita ou imagem |
| Orçamento512MiB |Modelo retrospectivo128raw+8journal+6canais+1fontes+17alocação estimada+352margem |Não mínimo provado, nem bound completo para falhas; journal não tem cap incremental. Alocação/capacidade/RAM não certificadas. Limite/destino inalterados |
| Procedimento dirigido |[Comando concreto](../crm-csv-toolchain-capacity-20261017/COMMANDS.md), leitor/transport/custódia canônicos;10provas locais novas |Não executado na VPS, exige autorização própria. calls=0 se destino inseguro/indisponível; sem fallback |
| Demais inputs |Históricos e artefatos válidos preservados |Node/ELF/PM2/closure/proteção, SQL, identidades e autoridade continuam UNKNOWN/pendentes |

Só locais: novos destinos privados capacity-v1; NENHUMA criação/modificação remota. Nenhum v2 repetido. CSV SUSPENSO / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. Checkpoints abaixo históricos.

---

# Execução autorizada ea4a80c4 —17/10/2026: DENY preservado

Três blocos consumidos uma vez cada, sem retry. [Resultado sanitizado](../crm-csv-toolchain-discovery-20261017/RESULT.json); relatório detalha UTC/Fortaleza e custódia. Código/manifest707726e1/COMMANDS6175de5c intactos.

| Requisito | Observado nesta tentativa | Não demonstrado / próximo passo |
| --- | --- | --- |
| Ferramenta local |readelf2.42/root0/0755, SHA64c58e15…, --version por FD, exit0 |Não foi analisado ELF produtivo; disponibilidade local não certifica closure |
| Fontes/transporte |7fontes inativas autenticadas, export/journal2244B c6b86a6f…/recibo canônico byte-exato |Custódia PASS de integridade com gatePass=false; não gate operacional PASS |
| Orçamento remoto |DENY remote-budget/remote-budget_not_proven antes de todas as leituras de imagem |Valores statvfs não registrados; causa exata UNKNOWN. Primeiro bloqueio: evidência numérica dirigida do destino512MiB, mediante revisão/autorização futura |
| Bytes/análise |0ELF publicados; bloco3 DENY source-custody; offline recibo corresponde e predicado image_set tem contagem0 |Sem SCP/análise de imagem. Não deduzir falha da custódia pelo nome amplo do stage |
| Node/PM2/ELF/proteção |Nenhuma observação atual alcançada; históricos inalterados |Continua UNKNOWN; não preencher usando provas simuladas ou referências históricas |
| SQL/identidades/autoridade/Event775 |Fora do alcance desta execução |Sem ação, reparo, redução de limites ou novo pacote |

CSV SUSPENSO / DENY PRESERVED / NOT DEPLOYED / NOT WINDOW READY. Materiais/destinosv2 consumidos, NÃO REPETIR. Checkpoints anteriores abaixo são históricos.

---

# Correção da dependência de descoberta —17/10/2026, base002b46a6

**Roteiro anterior NÃO EXECUTAR**: dependia de readelf remoto após ENOENT conhecido, cuja causa executável/loader não foi discriminada. [Procedimento corrigido](../crm-csv-toolchain-discovery-20261017/COMMANDS.md): localpreflight → remoto somente bytes/metadados → SCP/custódia/análise LOCAL.7provas afetadas, sem VPS. Nenhuma closure/proteção certificada.

| Item | Reutilização / procedimento | Limite e dependência |
| --- | --- | --- |
| Materiais | Hash/metadados Node d016 disponíveis; Node local af8d diferente; PM2/lock/closure26/prova completa aceitos | ELF produtivo integral ausente nas fontes pinadas examinadas; não runtime inteiro |
| Bytes remotos | Selecionado+ELF mapeados deduplicados; reader/FD/write_artifact/private_record existentes |64objetos/128MiB total; reserva operação512MiB remota/2GiB local, não reserva canônica; sem readelf/subprocesso remoto |
| Recepção/análise | Manifest/recibo/fonte estável, SCP exclusivo, conjunto/hashes; readelf LOCAL comprovado antes do SSH e revalidado por FD |Parcial/tamper nega e conserva; sem loader/ldd/código capturado. PT_INTERP/NEEDED/RPATH ainda exigirão análise offline |
| Closure/proteção | Descoberta é distinta de instalação/proteção |Continuam UNKNOWN; SQL/ownership, identidades finais,16vínculos/autoridade/Event775 separados |

CSV SUSPENSO / LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. Checkpoints anteriores abaixo preservados como históricos; não executar seus comandosv1.

---

# Atualização —17/10/2026, base6e93e409

Integração da folha/compositor/lançamento pré-autoridade **ACCEPT LOCAL** somente no alcance descrito; simulações não são certificados. Procedimento Node/ELF/PM2 [COMMANDS](../crm-csv-toolchain-discovery-20261017/COMMANDS.md), seis fontes e quatro ensaios literais locais aprovados. Sem execução na VPS.

| Grupo | Reutilizado / futuro procedimento | Ainda faltante / dependência |
| --- | --- | --- |
| Node selecionado/ELF | PATH canônico, entryPM2 pinado, leitor/cadeia/FD; ferramenta fixa readelf, ausente/inacessível => DENY. Futuro pm2.pid+exe/maps/boot por intervalo | Observação autorizada; PT_INTERP/NEEDED/RPATH e resolução offline; toolchain/proteção NÃO certificados |
| PM2/path/transitivos | Fontes CLI/lock/índice e prova PM2 existentes; roteiro alias/bin/CLI/package/env e metadados das imagens mapeadas | JS dinâmico não observado UNKNOWN; decisão de proteção/instalação futura separada |
| Saved/fallback/identidades; SQL/ownership;16vínculos/autoridade | Evidências históricas intactas nas linhas anteriores | Inputs atuais e autorizações separadas, sem fabricar dados ou renovar provas |

Primeiro bloqueio factual: Node/ELF e resolução/proteção PM2. Próximo passo: revisão do procedimento, não execução implícita. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY. Seções seguintes preservadas como checkpoints históricos.

---

# Integração local —17/10/2026, base6adfb37e

[Relatório consolidado](REPORT.md#integração-local-da-folha-e-lançamento-pré-autoridade-17102026-base6adfb37e). `currentReconciliation.compositionLaunchLocal` registra hashes, consumidores e provas. **LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY; CSV SUSPENSO.**

| Lacuna anterior | Implementação/prova local | Limite restante |
| --- | --- | --- |
| compose_inputs sem chamador | Hook real do compositor existente chama source_only antes do scan/DAG;127 caminhos/61 conteúdos em memória; seis outputs anteriores byte-iguais | Sem pacote/perfis/autoridade;57 grupos de inputs não preenchidos |
| Folha fora do mapa | Uma window/policy_predecessor.py pinada, cinco imports/dependências; ORIGINAL carrega Operations/checker/folha por Loader real sem executáveis candidatos | Novo manifest de fase precisa metadados reais; kits históricos intactos |
| root_readonly/pre_install com import mutável | Programa literal para revisão do owner embute review digest e bibliotecas; leitor/topo canônicos e Loader consomem snapshots e revalidam; filhos Python/Node ligados ao mesmo review | Sem Context/permit. Programa concreto para uma preparação operacional ainda exige inputs, renderização e revisão; não se autentica só por argv/env |
| Negativas |12 provas novas+uma regressão dirigida: falta/adulteração, TOCTOU, import externo, ciclo, troca do review, recusa de start/filhos mutáveis | Root/host simulados; pre_install/SQL negam dados ausentes. Nenhum PASS operacional inferido |

**Primeiro impedimento operacional inalterado:** Node/ELF e resolução/proteção PM2; saved/fallback/identidades, SQL/ownership e16 vínculos/autoridade atuais continuam pendentes. Revisar o delta antes de materializar qualquer preparação. Event775 não reparado; frontend não reaberto.

---

# Fechamento offline do toolchain —17/10/2026, basea8d257e6

Predecessor **ACCEPT LOCAL somente nas11 provas/interfaces declaradas**; integração futura ainda pendente. [Relatório consolidado](REPORT.md#fechamento-offline-do-toolchain-17102026-basea8d257e6); resultados completos em `INPUT_MATRIX.json.currentReconciliation.toolchainOffline`. Sem testes repetidos ou novo pacote.

| Fronteira real | Bytes/provas aproveitáveis conferidos offline | Falta exata / dependência |
| --- | --- | --- |
| Context/Loader/Bridge/Operations, quatro modos e protected |123 caminhos/57 objetos por hash; nove entradas protected; referências de imports declarados presentes | Dados/metadados de fase, proteção/instalação atuais, não certificação produtiva.32 dados de modo/16 renderizações continuam ausentes no kit estático |
| Diagnóstico RPC |26 arquivos locais iguais aos pins:18 JS+8 JSON de resolução; alcance de codec preservado | Node builtins/ELF/CLI/daemon não fazem parte dessa closure |
| PM2/CLI e transitivos locais de referência | Tar pinado a309…;133 membros comparados ao índice; bin/package seeds já observados;4552 arquivos do índice conservador local correspondem, sem faltantes; dez arquivos de entrada listados na matriz JSON | Conjunto efetivamente consumido na VPS e proteção contra substituição.4552 não é meta nem trace. Shebang env node sob CLEAN.PATH precisa vínculo efetivo |
| FD→PM2 real de laboratório | Prova completa B4 reutilizada; Node22 local af8d… ainda coincide; CLI/daemon/IPC/filhos reais | Não transfere o aceite para Node produtivo d016… nem para root/Context/alias operacional |
| Node efetivo e ELF | Hash/metadados históricos d016…,97.661.912B; não há imagem correspondente no conjunto pinado examinado | PT_INTERP/DT_NEEDED/RPATH/RUNPATH, loader/libs/resolução/proteção UNKNOWN. Primeiro impedimento factual de certificação; exige autorização operacional dirigida. Sem readelf/ldd/alternativa executada |
| policy_predecessor | Folha window/policy_predecessor.py, SHA46e71c30…; cinco importadores exatos no relatório | Integrar antes do scan/selagem em imports/dependencies/files, review ORIGINAL/shared/package e manifest de fase. root_readonly/pre_install pré-autoridade precisam carregar os mesmos bytes revisados, não import mutável ou Context fabricado |

**Primeiro impedimento operacional:** imagem/ELF Node e resolução/proteção PM2 efetivos. **Próximo delta local separado:** ligar compose_inputs+folha+lançamento pré-autoridade ao compositor futuro, sem modificar kit histórico. SQL/ownership, saved/fallback/identidades e16 vínculos/autoridade continuam pendentes. Event775 não reparado; frontend não reaberto. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.

---

# Atualização local do predecessor —17/10/2026

Fonte e2a5 reconciliada no produtor/transformações futuros, sem fallback, instalação ou emissão. Ver [relatório](REPORT.md#reconciliação-local-do-predecessor-17102026-base52437710) e [provas](PREDECESSOR_PROOFS.json). Contrato, root/pre-A/admissão e CAS têm papéis distintos; política original-only não autoriza ida. Imutáveis atuais preservados. Kit histórico permanece fa113 até futura materialização revisada; nenhum input operacional promovido. Restam saved/fallback/identidades, SQL/ownership, toolchain protegido e vínculos/autoridade/closure atual.11 testes focados; não certificação operacional.

# Matriz dos 57 grupos — requisitos, não capturas

## Reconciliação anterior de17/10 — pendências restantes, base a60a00cb

Revisão da integração frontend: **ACCEPT LOCAL no alcance dos quatro ensaios**, em conjunto com as onze provas de reconciliação. São provas locais/fixtures, não observações ou certificação produtiva. [Integração](../crm-csv-diagnostic-integration-20261017/REPORT.md) e [reconciliação](../crm-csv-frontend-reconciliation-20261017/REPORT.md) não são reabertas. A seção histórica dos57 IDs abaixo permanece intacta; `INPUT_MATRIX.json.currentReconciliation` registra somente esta atualização, sem preencher inputs.

| Pendência / consumidores | Evidência reaproveitável | Conclusão offline | Faltante exato e dependência operacional |
|---|---|---|---|
| Saved/fallback e identidades finais — LIVE, I02/I10/I18/I26/I34/I49/I50; Bridge/Contract/compare_saved/System | Restauração original e UI aceitas16/10; referências hash-conferidas; RPC/identidades iniciais/API-worker de17/10 às10:14; frontend reconciliado localmente | Proveniência e contrato correto disponíveis; mapas OS/PM2 não são intercambiáveis. Sem necessidade de nova investigação frontend | A coleta consumida não chegou a ler saved/fallback atuais nem repetir boot/identidades ao final. Faltam essas comparações completas, owner/modo600 e vínculo ao intervalo de uma observação futura autorizada. Não promover o stat inicial a observação final |
| SQL/ownership — I37/I38/I41/I52; db_container/db_backends/identity.sql/classify/db_owner_set_gate | Canal NEWDB documentado, configuração loopback5432 e proxy; binding histórico1d67ff65; SQLs/classificador e inventário Event terminais históricos | Consumidores/canal pretendido/consultas estão definidos, sem conexão ou novo resultado | Rota/ID/imagem/rede/publicação e cliente psql não foram alcançados; depois, SELECT autorizado para cluster/database/role/privilégios/fronteira/importações; atribuição por tuplas socket/proxy/backend com observador canônico root. SELECT sozinho não fecha ownership. Produção ativa não exige zero artificial; saída/fence/duas amostras são prova da janela, não de leitura preparatória |
| Toolchain protegido — TOOLCHAIN/I57 e ROOT/I53; Context/pm2_input/parser/install_static | Hash Node d01614ef, seeds CLI/package com tar pinado, closure26 diagnóstica e provas locais PM2/FD/B3/B4 | Reusar fontes e prova de consumo FD; conferir apenas closure declarada contra fontes pinadas já disponíveis. Isso não prova a imagem/dependências instaladas | Faltam closure JS/ELF efetivamente consumida e proteção real de toolchain/bibliotecas/alias. R1 observou futuros alvos ausentes. Não repetir readelf nem instalar alternativa;4552 não é meta de captura. Observações residuais e instalação protegida requerem escopos próprios |
|16 vínculos, fonte root e autoridade — PATHS/DERIVED/ROOT/ANCHOR/PERMIT; path_bindings/checkers/Store/Context | BINDING_PLAN, composição estática ORIGINAL/quatro modos e provas aceitas; R1 e2a5/helper8de/sudoers62b5; inspeção de alvos ausentes | Mapas/ordem de selagem conhecidos; não há16 capturas. **Incoerência de fonte root fa113/e2a5 ainda aberta**; pode ser revisada localmente com os bytes preservados | Namespace/perfis/caminhos/metadados atuais precedem as quatro renderizações por modo (ops/execution-check/delegated/read-state). Só depois índices→contrato→política→manifest→âncora, sem ciclos. Instalação estática, âncora e emissão owner são decisões separadas. Permit recovery não existe por consulta e não é requisito da ida/PRESTOP |

**Impedimento pré-contenção já observado:** os cinco pais Event775 da R1 continuam incompatíveis com event_parents. É evidência datada, não nova medição. Se inalterados, a ida nega antes de contain/stop. Exige decisão operacional específica e revisão restrita de permissões/consumidores antes de qualquer execução; nunca chmod genérico, dispensa do predicado ou ajuste automático. ORIGINAL permanece independente do código candidato.

Os conjuntos acima dependem de ROOT/LIVE/SQL/TOOLCHAIN;32 arquivos de modo são derivados, não novas observações independentes. Os alvos root futuros ausentes não são reparados por documentação. Fonte e2a5 observada não é certificado root atual; o Context/permit não pode ser fabricado para completar a matriz.

O restore certificado retido/parado continua reutilizável apenas se schema/fronteira/ferramentas permanecerem compatíveis; preservar temporaryDatabaseRemoved=false. Não renovar backup/RPO/root agora: RPO curto pertence à sequência coordenada futura, root por último. Supervision/cron before já comparados não são reabertos; futura admissão/encerramento exigem suas revalidações próprias.

**Primeiro bloqueio e sequência única:** ver [atualização do relatório](REPORT.md). Os comandos antigos e destinos consumidos não são um roteiro autorizado novo.

---


Cada ID reproduz literalmente um item de MISSING_INPUTS. O JSON adjacente contém consumidor, fonte, reuso, observação, momento e frescor **por item**. Os agrupamentos abaixo não atestam nenhum input.

| Grupo | Consumidor/predicado | Fonte / reuso | Observação e momento |
|---|---|---|---|
| ROOT | root policy_from; csv_contract.check/original_checks.check_original; pre_install.verify; installer CAS | Root files/chains actually installed + owner-reviewed static package; Historical root policy e2a5ffab… and accepted source helper/sudoers are comparison evidence only | R1 root bytes/hash/metadata/chains, prior targets incl absent entries; no helper invocation; At future binding review; repeat source CAS immediately before installation. Short-lived root certificate only at coordinated window; historical <600s is not a newly authorized deadline. |
| LIVE | Bridge.apps/app_matches/identity; Contract; profile_delta; System.check_config; baseline_all4 | Active process identity/config, original saved/fallback; canonical accepted NEWauth/NEWDB/NEWcipher custody; Accepted original recovery receipt and source profiles are historical candidates, not current attestations | R2 process identity/config and private exact profile comparison; root/proc access only where necessary; Binding capture plus revalidation before admission, stop and start. PID/ticks and boot must still match; no reusable fixed TTL inferred. |
| PATHS | prestop_contract.path_bindings/validate_pre_stop; original_bindings; Operations.__init__/start | Actual cwd/script/.data resolution for original and staged targets; 16 pendingNamespaceRenderings; original consumer semantics and 123-path static kit | R2 resolved paths, link targets and existing candidate artifact digest; no candidate selected; At materialization; parents/links rechecked before contain and at use. No age-based PASS. |
| EVENT | prestop_contract.event_parents; csv_boundary.event_consumers/event_policy; check_current | Literal Event source and every parent; known Event consumer inventory; Accepted Event predicate and CSV compiled proof; historical 775 finding is not repaired | R2 lstat chain/hash plus current consumer source references; read failure/775 => DENY; Before contain and CAS at overlay/use; no TTL substitutes for revalidation. |
| CRON | ScheduledControls.verify; delegated controls; Recovery closure; helper source controls | deploy crontab and /etc/cron.d/re7-converta-backup separately; Consumed restricted cron recovery receipts, original six commands/schedules | R1/R2 both current byte sets and source hashes; no crontab install/job execution; At binding, admission, pre-stop recovery and final closure; compare exact bytes, not one combined success flag. |
| SQL | capture_imports.classify; csv_boundary.exit_and_imports; db_owner_set_gate.verify; current-sql baseline | Bounded Event SELECT plus known-activity inventory; current SQL/proxy/FD ownership; Classifier/SELECT source and terminal historical operations; no current scope inference | R3 read-only SQL through verified channel + R2 ownership/process inventory; Before future admission; post-exit terminal proof only inside authorized window. UNKNOWN/PROCESSING/incomplete denies; no HTTP inference. |
| CONTROLS | Bridge.guard; baseline_contract; check_current; ScheduledControls; closure | Current guard/out.15/supervision and both cron controls; Owner accepted UI and historical guard38/closed out.15; preserve as history | R2 canonical GET/SELECT and supervision reads with credentials handled privately; Binding and fresh admission; after exits and closure independently. Do not run waiting-work historical entrypoint. |
| RESTORE | restore_contract.validate shared by Operations/baseline/Node; admission RPO/custody checks | Original certified restore + schema/tooling frontier + byte-exact custody receipts; Retained/stopped certified restore, original receipt bytes; prior snapshot proof | No backup now. Later R0 only when a window actually requires fresh RPO; compare frontier/tools first; Restore has no calendar TTL in validate and does NOT certify RPO. Retain temporaryDatabaseRemoved=false; RPO <3600s only when invoked by reviewed admission; root last. |
| DERIVED | Contract/check_original; csv_contract.check; mode/baseline/ecosystem checkers; Context manifest DAG | Materialize from authenticated observations and accepted static code, then review by owner; Existing code/proofs, renderer and seal order; no historical data promoted to fresh | None independent: consumes ROOT/LIVE/PATHS/EVENT/CRON/SQL/CONTROLS/RESTORE; After inputs validated; seal leaves -> mode indexes -> original review -> recovery contract -> policy -> phase manifest -> anchor. Do not include own hash or permit in ancestor. |
| COMPILED | csv_contract.check compiled-proof binding; profile_delta | Certified CSV24e5857f package + sanitized compiled proof/provenance; Existing compiled package/proof; no rebuild | Check existing bytes and references at future materialization; no fresh production behavior asserted; Content-valid until bytes/toolchain/contract change; not time-based and not functional production validation. |
| TOOLCHAIN | authority.protected_bytes/Context.snapshot; pm2_input.start; parser; B4 install_static/verify_static | Actual Node/PM2 launcher, resolved scripts/modules and complete transitive dependencies; protected alias/libs; Full local PM2 B4 proof and same-byte FD transport; accepted static sources | R2 locate exact executable/interpreter and readlink; R4 close toolchain dependency/metadata inventory; Before approving static targets; immutable hashes and root chains revalidated at load/use; version output alone insufficient. |
| ANCHOR | root_store.Store.install_owner_once; Context bundle/validate_dag; Loader snapshot | Owner-approved contract/policy/profile/code manifest, root-owned immutable anchor; Accepted owner trust model and future installer source, not an installed authority | No observational substitute: require separately authorized static/anchor installation after package review; Only AFTER concrete package hashes and owner approval; query does not create or renew. |
| PERMIT | Store.issue_owner_once; Context.start_mode recovery authorization; original start gate | Explicit owner decision + fresh classification, execution identity, profile/policy pins; Accepted R3 distinction forward vs recovery and B2 lineage | Window-only facts/owner issuance, never part of next read-only capture; Recovery ORIGINAL/CANDIDATE only, age 0<=age<600s; once/decision-specific. PRESTOP and forward switch do not acquire recovery permit. |

## Correspondência exaustiva

| ID | Input literal | Grupo |
|---|---|---|
| I01 | `return/backup-manifest.json` | RESTORE |
| I02 | `return/baseline.private.json` | LIVE |
| I03 | `return/candidate.config.private.json` | DERIVED |
| I04 | `return/candidate.ecosystem.config.cjs` | DERIVED |
| I05 | `return/plan.private.json` | DERIVED |
| I06 | `return/proof-bindings.private.json` | RESTORE |
| I07 | `return/return.config.private.json` | DERIVED |
| I08 | `return/return.ecosystem.config.cjs` | DERIVED |
| I09 | `return-before-commit/backup-manifest.json` | RESTORE |
| I10 | `return-before-commit/baseline.private.json` | LIVE |
| I11 | `return-before-commit/candidate.config.private.json` | DERIVED |
| I12 | `return-before-commit/candidate.ecosystem.config.cjs` | DERIVED |
| I13 | `return-before-commit/plan.private.json` | DERIVED |
| I14 | `return-before-commit/proof-bindings.private.json` | RESTORE |
| I15 | `return-before-commit/return.config.private.json` | DERIVED |
| I16 | `return-before-commit/return.ecosystem.config.cjs` | DERIVED |
| I17 | `return-partial/backup-manifest.json` | RESTORE |
| I18 | `return-partial/baseline.private.json` | LIVE |
| I19 | `return-partial/candidate.config.private.json` | DERIVED |
| I20 | `return-partial/candidate.ecosystem.config.cjs` | DERIVED |
| I21 | `return-partial/plan.private.json` | DERIVED |
| I22 | `return-partial/proof-bindings.private.json` | RESTORE |
| I23 | `return-partial/return.config.private.json` | DERIVED |
| I24 | `return-partial/return.ecosystem.config.cjs` | DERIVED |
| I25 | `switch/backup-manifest.json` | RESTORE |
| I26 | `switch/baseline.private.json` | LIVE |
| I27 | `switch/candidate.config.private.json` | DERIVED |
| I28 | `switch/candidate.ecosystem.config.cjs` | DERIVED |
| I29 | `switch/plan.private.json` | DERIVED |
| I30 | `switch/proof-bindings.private.json` | RESTORE |
| I31 | `switch/return.config.private.json` | DERIVED |
| I32 | `switch/return.ecosystem.config.cjs` | DERIVED |
| I33 | `mode/window manifests and original-preparation-review.sha256` | DERIVED |
| I34 | `window/csv-baseline.private.json` | LIVE |
| I35 | `window/csv-compiled-proof.private.json` | COMPILED |
| I36 | `window/csv-contract.private.json` | DERIVED |
| I37 | `window/csv-known-imports.private.json` | SQL |
| I38 | `window/db-owner-bindings.private.json` | SQL |
| I39 | `window/deploy.crontab.before + window` | CRON |
| I40 | `window/event-consumer-binding.private.json` | EVENT |
| I41 | `window/initial.private.json` | CONTROLS |
| I42 | `window/original-bindings/path-bindings.private.json` | PATHS |
| I43 | `window/owner-evidence` | RESTORE |
| I44 | `window/path-bindings.private.json` | PATHS |
| I45 | `window/privileged-policy.private.json` | ROOT |
| I46 | `window/re7-converta-backup.before + window` | CRON |
| I47 | `window/recovery-contract.private.json` | DERIVED |
| I48 | `window/restore proofs and mode backup/baseline/proof-bindings` | RESTORE |
| I49 | `window/saved-dump.pm2.private.json + saved-dump.pm2.bak.private.json` | LIVE |
| I50 | `window/source.profile.private.json` | LIVE |
| I51 | `window/target.profile.private.json` | DERIVED |
| I52 | `window/waiting-work.private.json` | CONTROLS |
| I53 | `current protected-file/prior-target hashes and root chains` | ROOT |
| I54 | `phase code manifest with actual uid/modes` | DERIVED |
| I55 | `static anchor approved against policy/contract/profiles` | ANCHOR |
| I56 | `decision-specific permit (recovery only)` | PERMIT |
| I57 | `current PM2/Node executable + transitive toolchain integrity` | TOOLCHAIN |

## Os 16 vínculos

São `pendingNamespaceRenderings` do BINDING_PLAN: `ops.py`, `execution-check.cjs`, `delegated.py`, `read-state.py` em cada um de switch, return, return-partial e return-before-commit. Não são 16 PIDs, 16 capturas nem os três pins. Sua saída depende do namespace de uma **futura** preparação e dos caminhos reais compartilhados. Não foi reservado novo namespace operacional nem renderizado arquivo nesta rodada.

A matriz histórica menciona recovery_binding.py no sealOrder. Essa etapa foi substituída pela autoridade root aprovada em R3/B1/B2: não regenerar módulo de pins implícito. Reutilizar apenas o DAG aplicável: folhas estáticas e dados → índices por modo/original → contrato → política → manifest de código/metadados → âncora revisada. Permit específico é posterior, fora dos índices que o antecedem.

ORIGINAL dispensa código executável candidato, não os dados selados dos quatro modos nem switch/old-exit-confirmed.json. PRESTOP não parte. Os mapas original e candidato permanecem separados; resolução segue exatamente path_bindings, sem endurecimento improvisado.
