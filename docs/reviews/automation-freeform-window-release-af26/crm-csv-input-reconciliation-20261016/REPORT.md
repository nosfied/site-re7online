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

# CRM/CSV — reconciliação dos inputs e próxima conferência

## Event17/10 — execução única CONSUMED/DENY e encaminhamento concreto

**CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.** Base92df116b/remoto conferidos; manifest publicado integral PASS e bloco literal executado uma vez como deploy, sem sudo. Às14:02:30 Fortaleza, exit1: `event-parent-contract` / `EVENT_PARENT_CONTRACT_NOT_SATISFIED`. Primeiro pai `src/events`0775, uid/gid1000. Só um pai alcançado; demais não certificados. Sem timeout/retry/reconexão ou leitura remota adicional. Canais, hashes, modos privados e ingestão canônica conferidos; [resultado sanitizado](../crm-csv-delivery-review-20261017/RESULT.json). O roteiro anterior está **consumido**; não executar novamente nem reaproveitar seu destino.

[Proposta mínima para decisão separada](../crm-csv-delivery-review-20261017/REMEDIATION_FOR_REVIEW.md): remover apenas g+w dos cinco pais literais historicamente0775, condicionado a preflight atual integral, atribuição dos consumidores/writers e ACLs, plano/intent/CAS novos, verificação pelo mesmo predicado e retorno explícito dos efeitos comprovados. Somente o primeiro tem observação nova; quatro são históricos, não CAS atual. Não há aplicação autorizada nem executor de remediação certificado nesta rodada. Faltantes e efeitos sobre escrita de grupo estão explicitados; nenhum chmod/reparo foi executado.

Próximo ato para revisão: autorizar e concretizar essa manutenção restrita, sem A/B/CSV; não simplesmente repetir a coleta consumida. Event PASS futuro não resolverá sozinho saved/fallback/identidades, SQL/ownership, vínculos/autoridade e proteção de consumidores. ELF/budget/discovery continua PAUSADO. Artefatos, fontes, testes válidos, DENYs, históricos e57 grupos originais preservados. Nenhum teste/build repetido: delta é resultado documental e proposta, sem alteração de implementação. NEWauth+NEWDB+NEWcipher/crons/guarda38/out.15 intocados, sem recertificação global. Responsável Deifson; revisão17/10, próxima21/10 ou antes da mudança.

---

## Correção de rumo — entrega CSV retomada LOCALMENTE, base8b5072fb

**PREPARAÇÃO ESTÁTICA CSV CONCLUÍDA / REVISÃO PENDENTE / INPUTS OPERACIONAIS NEGADOS / NOT DEPLOYED / NOT WINDOW READY.** Esta seção prevalece para a prioridade: `crm_csv_elf_budget` e `toolchain-discovery` ficam **PAUSADOS**, com todos os arquivos/provas/destinos/DENYs preservados. Não foi preparada outra geração, consulta ou teste dessas frentes. Nenhuma VPS, SQL, instalação, janela, reimportação, alteração de dados/credenciais/permissões produtivas ou reparo histórico nesta rodada. CSV continua suspenso para execução; o trabalho local volta à entrega funcional já certificada.

### Artefatos concretos entregues — não apenas uma lista de requisitos

[Entrega local e manifest de reuso](../crm-csv-delivery-review-20261017/DELIVERY.json), [composição concreta dos consumidores](../crm-csv-delivery-review-20261017/CODE_COMPOSITION.json), [índice deduplicado](../crm-csv-delivery-review-20261017/CODE_OBJECTS.json) e [fontes editáveis](../../../../scripts/crm_csv_delivery/prepare_review.py). A composição usa o compositor aceito scripts/crm_csv_predecessor/composition.py, com os bytes da política predecessora e2a5 extraídos pelo verificador canônico do recibo R1 preservado/pinado. Não copia a política, perfis, observações ou autoridade para o Git. Política predecessora não autoriza ida.

Foram compostos **127 caminhos lógicos /61 conteúdos únicos** dos quatro modos, incluindo R1/R2, prevenção Event/bindings, classificação/CLI de recuperação, R3, continuidade B2, diagnóstico B1, FD/JSON/parser B3 e fechamento aceito B4/ORIGINAL/predecessor. **54 objetos são referências a arquivos públicos já existentes; só sete objetos novos foram escritos,17.612B.** Não há hardlink/symlink ou cópia de runtime para montar este conjunto. Os sete conteúdos novos são código derivado das transformações aceitas (cinco consumidores predecessor, mais bibliotecas de revisão), não novos módulos funcionais CSV. Cada objeto é identificado por hash; o índice associa todos os127 caminhos aos mesmos bytes. CODE_COMPOSITION tem SHA **417d0e86184da48413fc562c5b443a3a20e23721ae754215b9b6bab47843cd67**.

O DAG eager de selagem é acíclico. O ciclo de chamadas/imports tardios anteriormente aceito permanece explicitamente inventariado, autenticado no uso, sem ser omitido nem convertido em requisito novo. Uma primeira verificação local do novo empacotador o tratou indevidamente como ciclo de selagem e negou antes de escrever; corrigiu-se somente essa verificação nova para usar o critério canônico. Uma composição local parcial também foi preservada após erro de caminho relativo antes do índice; a versão final valida caminho absoluto/novo antes das escritas e usa destino distinto. Esses rascunhos/unreferenced copies não entram na publicação e não são gerações operacionais ou provas aceitas reescritas.

### Reuso efetivamente conferido, sem rebuild/extração/cópia

O novo produtor leu as quatro imagens locais existentes com o leitor limitado/no-follow/FD estável e confrontou **tamanho+SHA dos arquivos reais** com os registros publicados, além dos manifests privados pinados. Conferiu também o tar ORIGINAL36f51ebe por SHA e leu seus membros somente em memória, sem extração no filesystem, comparando-os com o manifest alvo pinado. Não confia no source-plan local sem pin. A fonte canônica Event foi comparada ao overlay. Não é inferência de runtime pelo HEAD.

| Material já certificado | SHA256 | Bytes / compatibilidade |
| --- | --- | --- |
| API candidata |24e5857fb30a6540c4b3930b3979b49bc9954b0ff85c4021a7f43641b7b43eb5 |8.601.600;447 membros,442 originais preservados, quatro módulos CSV alterados e ledger novo |
| Frontend candidato |ea3d27881193bd872798aeb28a30630f085bad65688be913b781491b0d86c2ed |174.314.812; contrato UUID/GET e assets compatíveis já certificados |
| Frontend retorno compatível |d41ddd648c12b3bed4c13a3dde1019b96e41eda64d68089043a11f5f4edc0431 |177.450.139; retorno de interface mantendo backend candidato |
| Classificador Event |ebdfd5bba81b86f26506b13a89afb4aafd45252c4e1b23e90d2f2896b1d523e3 |10.240; somente eventRetentionPolicy.ts alvo03791f05… para os dois consumidores manuais |

Base histórica API36f51ebe/NEWcipher preservada nos442 membros, worker não modificado, reader histórico/v2 mantido; NEWauth/NEWDB dependem também dos perfis atuais, que **não** são certificados aqui. Os hashes/tipos originais dos pacotes, o inventário447/446 e os dois vínculos compartilhados foram conferidos; dados de .data e dependências não foram percorridos/duplicados. A versão fonte efetivamente ativa será reconfirmada no binding futuro, não presumida por essas imagens locais.

Reutilizadas no seu alcance: prova compiled de operationalStatus (ADMIN5/3/3 e5/2/2, RBAC dos demais), ledger/GET/replay0/POST sem UUID negado; Chrome com timeout/reentrada/recarga; restore retido/parado/schema; extrações integrais anteriores; provas R1/R2/32, ORIGINAL/28 e PM2 completo. Não se repetiram builds, suítes ou provas funcionais. O staging e a recuperação consumidos não foram executados ou editados. Runtimes já extraídos/transferidos na VPS são referências históricas para eventual reuso, sem nova confirmação atual.

### Controles e retornos preservados na composição

| Estado / decisão | Consumidor concreto | Fronteira preservada |
| --- | --- | --- |
| PRESTOP → PRESTOP | Recovery.inspect/recover +ScheduledControls | Restaura controles, não parte API/worker nem fabrica permit |
| STOPPED_UNSELECTED → ORIGINAL | Contract.original_allowed +check_original +recovery_start | Certificado integral com geração efetiva38/identidades, dados selados/imutáveis R2, ownership/saída/imports, autoridade específica antes do intent; independente de executáveis candidatos e de aplicar overlay |
| SELECTED_CANDIDATE → CANDIDATE | Contract.selected +Operations.start/System.start/pm2_input | Depois de seleção/possível admissão, API antiga não é retorno compatível. Conserva API24e5857f/ledger/GET/UUID; frontend pode voltar ao pacote compatível |
| Incerto/consumido/identidade divergente → DENY | Recovery.inspect +Context/correlation +intents/recibos | C/inspeção e decisão explícita, sem replay/start/seleção automáticos, sem falso complete |

Preservados saída/ownership, certificados geração38, CAS de predecessor/overlay, controle dos cinco gates e fechamento dos dois crons/supervisão/saved/fallback600/barreira/gates falsos. A falta de código candidato não dispensa dados dos quatro modos ou switch/old-exit-confirmed.json. Nenhum checker foi removido/afrouxado e nenhum perfil/binding/permit foi fabricado.

### Dependências que realmente impedem a fase operacional

| Dependência concreta | Consumidor / predicado canônico | Evidência e faltante exato; sem requisito hipotético |
| --- | --- | --- |
| Pais Event e bindings pré-parada | prestop_contract.event_parents/path_bindings/validate_pre_stop; check_current e CLI antes do primeiro contain/stop; revalidação Operations/overlay | Última R1 viu cinco pais0775 e arquivo0664, não reparados. A ida negaria; estado atual desconhecido. Próximo ato é a leitura literal abaixo, não chmod ou exclusão do predicado. ORIGINAL não depende de overlay candidato |
| Perfil/trio/saved/fallback/crons/supervisão | check_current/check_original, System.check_config, ScheduledControls | Perfis locais atestados são referências; geração futura exige observação correspondente e dados atuais, não cópia de capturedUtc histórico. Adaptador frontend aceito é reutilizado, investigação encerrada |
| SQL/importações/ownership | check_current SQL_FOUR_MODES_PASS/proxy; Sequencer.verify_stopped, Operations/db_owner_set_gate, csv_boundary.exit_and_imports | Canal/rota e SELECTs precisam identidade e autorização próprias; certificado de saída/importações só sob fence na janela. Não chamar capture_imports.capture agora, nem inferir drain por HTTP0/guarda38. UNKNOWN nega, sem reimportação |
| Bibliotecas/alias/autoridade protegidos | authority.protected_bytes/fixed_query/Context; root_store; pm2_input.protected_alias/start | Última R1 mostra helpers antigos e bibliotecas/alias novos ausentes. É instalação futura revisada, com predecessore2a5/CAS, perfis/política/manifest/âncora reais. Consulta não emite; permit só para recuperação, nunca tardio na ida. Não foi instalado nesta rodada |
| Toolchain efetivamente consumido | System.start→PM2, pm2_input.start e premissa de proteção B3/B4 já documentada | Node/CLI/dependências escolhidos precisam corresponder ao que for aprovado/protegido. **Nenhum desses predicados exige executar readelf, copiar128MiB, orçamento192/704,4552 arquivos ou retomar o coletor ELF.** Esse método auxiliar está pausado. Não se declara a proteção operacional provada nem se dispensa seu requisito; fechar sua evidência/decisão dentro da certificação CSV é pendência, com provas existentes reutilizadas |
|16 vínculos e selagem | Context.snapshot/manifest, path_bindings/original_bindings; modo, CJS/JSON/parser e índice original | Quatro fontes renderizadas em quatro modos com namespace/perfis reais; não16 capturas independentes. Não preencher agora. Composição em mãos fornece os consumidores exatos para materializar/selar depois dos dados |
| RPO/capacidade/fronteira/root fresco | restore_contract, root_evidence/pre_install/admit_gates | Reusar restore retido quando válido; R0/backup.lock/custódia apenas em sequência combinada. Revalidar fronteira, orçamento CSV11235700736B como referência, WAL/crescimento; root por último.192/704MiB da frente pausada não é reserva CSV/PG nem autorização de reduzir piso |

Faltam observações/autorizações, não um rebuild da aplicação ou um novo contrato CSV. As dependências acima se ligam a consumidores existentes e não concedem autorização operacional por constarem neste relatório. A pausa de uma técnica auxiliar não é dispensa silenciosa de root/proteção/manifest.

### Próximo ato operacional exato e sequência única

[Bloco literal](../crm-csv-delivery-review-20261017/NEXT_OPERATION_FOR_REVIEW.md): um comando no ThinkPad, futuramente autorizado, usa SSH existente como deploy **sem sudo** e executa apenas o **mesmo event_parents autenticado208f2ef5…**, lendo metadados dos pais do literal Event. Não importa entrada de geração consumida, não instala, não abre permissões, não consulta serviços/SQL/toolchain, não cria arquivo remoto. Hash fixo externo antes do compile; stdin/args/env não fabricam autoridade de fase.

Custódia LOCAL exclusiva nova `csv-delivery-event-boundary-20261017-v1`, parent owner700 existente, canais/recibo byte-exatos pelo Capture/private_record aceitos. Apenas sua biblioteca genérica de diagnóstico é reutilizada dos fontes pinados; nenhum driver/runner/launcher/programa ou testes de ELF é carregado/executado. Falha/timeout/resposta perdida/destino existente: preservar e parar sem retry/reconexão/reparo. PASS certifica somente esse predicado no intervalo, não pré-parada completa. DENY para no primeiro pai inadequado e não se apresenta como observação completa de todos os pais.

A sequência restante está fechada no mesmo roteiro: **(1)** revisão/autorização desta leitura e decisão restrita se persistir0775; **(2)** captura/binding privados CSV pelos consumidores existentes, incluindo SQL/ownership e saved/config, sem auditoria auxiliar genérica; **(3)**16 vínculos/política/manifests/âncora e instalação estática/fase separadas, com dados reais, código desta composição e revisão; **(4)** horário/owner, R0/root e hashes finais para autorização; **(5)** admissão/fence/saída+classificação/CAS/API→worker uma vez, inspeção/recuperação conforme estado, fronteira frontend real e revisão própria, encerramento/owner UI. Nenhum A/B é emitido agora, nenhum passo implica autorização automática do seguinte.

A contenção canônica é global e pode interromper atendimento/API/frontend; guarda38 não pausa CSV e não será aberta para o deploy. API nova antecede frontend novo; abas antigas sem UUID recebem400 sem gravação e precisam recarregar, sem logout/limpeza de sessão. Frontend novo/API antiga é combinação proibida. Depois da seleção, defeito persistente do backend exige outra versão **compatível**, não a conclusão forçada de uma implantação incerta ou retorno OLDcipher. Estes limites são os contratos existentes, não foram redesenhados.

### Validação efetivamente nova e limites

[Seis testes novos focados](../crm-csv-delivery-review-20261017/PROOFS.json), comando `PYTHONDONTWRITEBYTECODE=1 python3 -B -m scripts.crm_csv_delivery.test_delivery`: índice127/61 e todos os hashes; reuso dos quatro materiais/compatibilidade; recusa de destino existente/fora do checkout antes da leitura privada; corpo literal do predicado em diretórios locais reais válidos/775; digest divergente nega antes do compile/exec e import não conecta; transporte com resposta perdida preserva prefixos pelo writer canônico e não repete num destino consumido. O novo comando foi conferido por digest/compilação, não executado remotamente ou apresentado como cadeia produtiva ensaiada.

Reais: compositor e fontes concretos, leitura SHA dos quatro arquivos certificados/manifests, inventário API, verificadores de metadados de laboratório, arquivos/journals/FDs canônicos locais. Simulados: somente namespace remoto projetado em diretórios temporários e timeout da chamada SSH. Nenhum verificador canônico foi substituído por callback PASS; nenhuma atividade CSV real, SQL, PM2, root ou janela foi simulada para declarar readiness. Provas antigas válidas permanecem sem nova execução. Uma etapa pública ainda precisa de dados/autoridade reais; o índice estático continua DENY_OPERATIONAL_INPUTS por desenho.

Princípios/Change Policy/Release Checklist e contratos específicos consultados; nenhum exemplo pull/build/reload foi usado. Publicação restrita a código público de revisão, hashes e checkpoints; materiais privados, rascunhos locais, perfis/bindings, runtimes, caches e históricos consumidos ficam fora. Responsável Deifson; revisão17/10, próxima21/10 ou mudança/janela. NEWauth+NEWDB+NEWcipher, produção original aceita, ambos crons, frontend, guarda38 e out.15 CLOSED preservados pelo escopo sem efeitos, sem nova recertificação de health/UI.

---


## Dimensionamento ELF revisto LOCALMENTE —17/10/2026, base5b679f62

**LOCAL VALIDATED no alcance dos controles / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.** Nenhuma VPS, statvfs produtiva, imagem produtiva, SQL, limpeza, realocação, instalação, build, backup ou janela nesta rodada. A consulta capacity-v1 e a tentativav2 permanecem consumidas/DENY, com bytes, hashes, horários e destinos intactos. Não se reabre frontend/predecessor.

### Causa da lacuna e proposta única

O teto original128MiB limita somente ELF publicados; não limita todos os arquivos/estados de falha. O export de8MiB ocorre depois da escrita do journal; private_record original não limita append. Capture.command/SSH/SCP usavam capture_output sem teto de arquivo; SCP recursivo só conferia nomes/soma depois da recepção. Logo não havia teto integral demonstrado, mesmo com timeout e128MiB no produtor. O cálculo retrospectivo512MiB permanece histórico, não fundamento para um PASS novo.

**Uma proposta mínima:** fontes futuras limitadas, com envelope de planejamento **192MiB REMOTO /704MiB LOCAL quando compartilharem filesystem**, deduzido abaixo, não escolhido a partir dos442,90MiB. É proposta para revisão, NÃO redução aplicada ao lote consumido nem autorização de uso. As transformações conservam os gates conservadores512MiB/2GiB até uma revisão futura dos novos limiares, destinos e manifests. Nenhum comando executável novo ou geração operacional foi emitido. Não executar os comandos antigos com fontes novas. O valor observado em13:01 é histórico, não critério de escolha nem prova de capacidade futura.

Fonte editável: [storage_bounds.py](../../../../scripts/crm_csv_elf_budget/storage_bounds.py) e [editable_sources.py](../../../../scripts/crm_csv_elf_budget/editable_sources.py). Reutiliza os sete snapshots pinados no manifest707726e1, Capture, write_artifact, private_record, export, ingest, transporte SSH/SCP e analisador readelf LOCAL. [PROVENANCE](../../../../scripts/crm_csv_elf_budget/PROVENANCE.json) registra procedência/bytes/SHA; [SOURCE_DELTA](../../../../scripts/crm_csv_elf_budget/SOURCE_DELTA.patch) representa somente as oito fontes em memória com rótulos **LAB_ONLY**, não um pacote/perfil/observação operacionais. O patch não contém a si próprio. Todo o delta editável/documental está no diff Git. Nenhuma fonte privada é necessária para reproduzir estes testes.

### Limites impostos antes da escrita/lançamento

- Guard envolve os escritores canônicos, sem outro journal/escritor: serializa pelo FD do diretório (flock, sem sidecar), conta bytes lógicos/entradas/arquivos parciais existentes e recusa crescimento antes de chamar a implementação original. Preserva O_EXCL/no-follow/owner600/nlink/fsync; root700 e profundidade máxima existente (images/) são conferidos. Nem chmod/chown, unlink, truncamento, sobrescrita, reparo ou fallback. Diretórios exclusivos continuam obrigatórios; acesso negado/metadata inadequada não ganha PASS.
- Append tem teto incremental: remoto8MiB, custódia48MiB, análise192MiB; registro ordinário<=3MiB (transporte custódia<=20MiB). Reserva terminal64KiB por pool/journal para diagnóstico de falha/recibo; reserva não autoriza crescimento ilimitado. Se o armazenamento real falhar, o terminal pode também falhar: preservam-se os prefixos existentes, sem prometer recibo completo ou retry.
- SSH: stdout<=12MiB e stderr<=1MiB, escritos pelo pai em temporários anônimos com verificação ANTES de cada escrita; stdin/frame permanece em memória. Em excesso/timeout, mata somente o grupo local daquele filho, conserva prefixos e produz ChannelLimitExceeded/TimeoutExpired, nunca COMPLETE. Não reconecta; isso não prova que o remoto parou — ele tem seus próprios limites persistentes e a incerteza permanece.
- Capture.command:<=1MiB/canal; launcher<=16KiB/canal em memória. O launcher conserva o writer canônico independente93a11451 antes do manifest e limita seu recibo; a folha de storage é embutida nos MESMOS bytes revisados do launcher. Os demais loaders recebem explicitamente BLOBS/STORAGE_ROOTS autenticados pelo futuro manifest. Não importar guard por caminho mutável, não usar env como autoridade. Roots ausentes/sobrepostos, destinov2 consumido e hash de fonte divergente negam; o compositor só produz bytes em memória para revisão.
- Recepção substitui SCP recursivo por sequência **não recursiva, um operando literal SHA.elf por objeto**, no mesmo transporte aceito:<=64 e soma<=128MiB antes de criar images/lançar filho. RLIMIT_FSIZE por filho é o tamanho EXATO esperado do objeto; canais<=16KiB cada, arquivos de destino novos; conferência canônica tamanho/hash antes do próximo. Prazo240s é global para a sequência, não240s×64. Parcial ou resposta perdida nega sem próximo objeto/retry. O produtor mantém deduplicação por SHA e limite128MiB, inclusive na tentativa que falhar após escrever parcial.
- readelf LOCAL original mantém<=1MiB/canal em dois temporários anônimos,15s/objeto; canais persistidos+Base64 entram no pool. Não se executa alvo capturado, loader, ldd ou Node/PM2. Nenhum coletor/framework/autoridade paralelo.

### Memória de cálculo — pico lógico limitado, não somente payload de sucesso

MiB=1.048.576B. Os pools incluem estados incompletos; **não são todos somados como parcelas adicionais ao seu próprio conteúdo**. Sem cópia de runtime/tree/cache. Sem tar/gzip ou temporário de imagem remota: canonical write_artifact grava diretamente na folha exclusiva; parcial ocupa o lugar dessa folha, não é uma segunda imagem.

| Local/pool | Teto MiB | Escritas e duplicações incluídas |
| --- | ---: | --- |
| REMOTO tools |1|Oito fontes futuras+manifest; hashes/tamanhos reais pinados, soma<1MiB; até32 entradas |
| REMOTO resultado |142|128 imagens + journal<=8 + até6 de canais no desenho nominal; teto do pool prevalece mesmo se a distribuição diferir.64KiB terminal já dentro do pool; até384 entradas |
| REMOTO total lógico |**143**|1+142. Export/JSON stdout não é arquivo remoto; cópia Base64/envelope fica em buffers e no lado local, não se soma duas vezes aqui |
| LOCAL materialização |16|bundle Base64<4MiB, fontes registradas em Base64 no journal, metadados e readelf --version/canais; **2MiB reservados dentro do pool** para temporários anônimos, não acrescidos por fora; até32 entradas |
| LOCAL custódia SSH |64|Arquivos stdout12+stderr1; journal com nova Base64 desses canais (<=17⅓MiB), capture.raw<=8MiB e cópia das linhas ingeridas<=8MiB, recibo e metadados.13MiB de temporários já reservados dentro do pool; permanentes<=51MiB menos terminal. Não confundir custody PASS com source PASS |
| LOCAL análise/recepção |454|Imagens128; canais readelf<=64×2MiB=128; canais SCP<=64×2×16KiB=2; journal<=192 (inclui Base64 desses130MiB,~173⅓MiB, mais metadados com teto). Dois temporários anônimos<=2MiB e folga interna de2MiB. Hash/parse em memória não cria segunda imagem; até384 entradas |
| LOCAL launchers |12|3ações×4MiB, cada uma com canais<=2×16KiB e a cópia Base64/journal dentro do pool; erro/terminais incluídos, não4MiB por objeto |
| LOCAL pico lógico conservador |**546**|16+64+454+12; soma materiais retidos e parciais SEM supor limpeza entre etapas. Pool não é uma previsão de consumo observado |

Journals/recepções falhos não podem crescer além dos pools apenas por não chegarem ao export. Caso o limite seja atingido, a operação pode negar antes dos64 objetos; NÃO descartar bytes, reduzir população, truncar evidência ou elevar limite para completar. Preservação significa manter o que foi escrito; em overflow de canal preserva-se **prefixo explicitamente incompleto**, não uma alegação de saída integral. Recursos anônimos são fechados como no analisador aceito; materiais de custódia/parciais não são removidos.

### Alocação física, margem e reservas — parcelas diferentes

[PLAN.json](../../../../scripts/crm_csv_elf_budget/PLAN.json), função plan(), deriva os números sem receber bytes disponíveis:

| Cálculo | REMOTO | LOCAL agregado |
| --- | ---: | ---: |
| Pools lógicos limitados |143MiB =149.946.368B |546MiB =572.522.496B |
| Allowance de alocação/metadados |2MiB |14MiB |
| Base de planejamento |145MiB |560MiB |
| Margem de segurança25% |36,25MiB |140MiB |
| Arredondamento para próximo64MiB |10,75MiB |4MiB |
| **Proposta total** |**192MiB =201.326.592B** |**704MiB =738.197.504B** |

Os allowances são planejamento condicionado, **não teto físico universal**. Exemplificando blocos4KiB, limites de entradas32+384 dão até416 blocos remotos de arredondamento(~1,625MiB); local32+32+384+3×16=496 entradas(~1,94MiB), com allowance local maior para diretórios/metadados/temporários. A semântica de alocação real, preallocation, CoW, snapshots, quota, inodes e concorrência não é certificada por esses exemplos. O código impõe teto de bytes lógicos/quantidade/tamanho de canais; não instala quota nem controla o kernel ou escritores estranhos. Teto físico operacional exige conferir geometria/contabilização do filesystem e reservas efetivas na futura preparação; se insuficientes/desconhecidas, DENY, não declaração de bound integral. Não se usa f_frsize como prova de unidade de alocação máxima.

A margem25% é decisão explícita de planejamento para pequenas oscilações/overheads não modelados e preservação de diagnóstico; NÃO corrige um produtor sem limite nem substitui reservas canônicas. Arredondamento é legibilidade do envelope, separado da margem. O relatório anterior não provava porque512MiB fora escolhido; não reescrevemos essa história. Redução futura para192/704 só pode ocorrer após revisão do procedimento novo, com destinos próprios e literais coerentes, nunca nos comandos/manifestsv2 consumidos. A observação442,90234375MiB NÃO participa de plan() e não se converte em PASS/folga atual.

Conforme [OPERATIONAL_BASELINE](../../../saas/OPERATIONAL_BASELINE.md#capacidade-e-retenção-operacional): contabilizar por filesystem/executor, medir alocação/inodes e preservar reserva canônica, crescimento/WAL quando aplicáveis. Se material (/dev/shm) e custódia estiverem em FS diferentes, não somar livres: decompor os pools16 e530MiB e aplicar allowances/margens por dispositivo; o704 agregado NÃO pode ser usado para compensar falta em outro FS. Se compartilham FS, somar também outros materiais/ações retidos que já ocupam esse dispositivo antes da admissão. Os pools limitam somente esta tentativa futura; DENYs antigos não são apagados nem ficam grátis. Reservas bancária/auth e pisos datados de6.468.665.344B/4GiB não são universalizados nem reduzidos. Não houve medição de PGDATA/WAL ou liberação de reservas nesta rodada.

RAM não é armazenamento: buffers ELF/proc, Base64/JSON/objetos Python e pressão compartilhada de memória/page cache não têm certificação por estes pools ou por f_bavail. O filesystem sob /dev/shm não recebe tipo inferido pelo nome. Risco de ENOSPC/OOM/quota/concorrência permanece; eventual execução exige observação/frescor/autorização própria. Não há prova física completa, proteção de toolchain/ELF ou janela pronta.

### Provas afetadas, reprodução e limites

[PROOFS.json](../../../../scripts/crm_csv_elf_budget/PROOFS.json): **12 testes focados PASS**, executados com `PYTHONDONTWRITEBYTECODE=1 python3 scripts/crm_csv_elf_budget/test_budget.py`. Entrypoints operacionais não são executados. Fontes pinadas existentes mais sete arquivos novos entregues bastam; não depende de private/local-evidence.

Reais no laboratório: composição dos oito snapshots, Capture.command/bytes, leitor, write_artifact/private_record/export/ingest canônicos conectados; arquivos/FDs/fsync/flock/O_EXCL, subprocessos locais, pipes e RLIMIT_FSIZE, temporários anônimos. Cobertura: fonte/roots ausentes ou consumidos, hash adulterado; recusa antes de escrita/append; terminal após excesso; prefixos em ENOSPC injetado após escrita REAL de artefato e de canal temporário (filho local encerrado); canal excessivo e timeout; envelope multi-MiB com Base64 externo+interno e custódia DENY; conjunto65 ou128MiB+1 negado antes de receber; SCP literal não recursivo, arquivo excedido/EFBIG e parcial retido sem replay; launcher cap; cálculo muda quando o pool aumenta, sem entrada de capacidade observada.

**Simulado:** destino/processo do transporte SCP substituído por filho Python sintético (o RLIMIT e as escritas/pipes são reais); causa ENOSPC injetada, dados/roots de laboratório, tempo de espera controlado. Nenhum SSH, cliente SCP real/servidor SFTP, leitura de imagem produtiva, metadado root, configuração de serviços ou filesystem produtivo foi certificado. O caminho de consumo PM2 e as provas frontend/predecessor não mudaram nem foram repetidos. Não se executou de novo a cadeia remota consumida nem os blocos literais antigos. A primeira tentativa do teste de reserva tinha instrumentação duplicada de flock e foi interrompida localmente; a instrumentação foi corrigida para chamar o escritor canônico sem wrapper duplicado. Isso não foi operação remota nem prova aprovada descartada.

### Pendências e próximo passo

Revisar esta proposta/patch. Antes de qualquer futura execução: compositor deve selar os oito snapshots/guard+roots explícitos, original writer pré-manifest e scripts de lançamento com hashes coerentes; destinos novos revisados; verificar cliente SCP real e erro de limite no seu alcance; comprovar orçamento/allocator/inodes/RAM/reservas por FS e manter os controles de identidade/intervalo originais. Nenhuma dessas lacunas é preenchida com fixture. O novo delta não prepara comando remoto ou janela. Primeiro bloqueio agora é **revisão do dimensionamento e dos controles futuros**, com512MiB ainda não satisfeito na ÚLTIMA amostra histórica; não se afirma déficit atual sem nova leitura. Não executar v2/capacity-v1 outra vez.

Node/ELF/PM2/closure/proteção operacional, SQL/ownership, saved/fallback e identidades finais,16vínculos/autoridade e Event775 seguem pendentes nos respectivos contratos. NEWauth+NEWDB+NEWcipher, ambos os crons, guarda38 fechada, out.15 CLOSED e aceites anteriores preservados pelo escopo sem efeitos. Responsável operacional Deifson; revisão17/10, próxima21/10 ou mudança. Publicação só fontes/provas/documentação sanitizadas, sem brutos, configurações, bindings privados ou novos inputs operacionais.

---


## Consulta dirigida executada uma vez —17/10/2026, baseb39169e8

**LEITURA CONCLUÍDA / ORÇAMENTO NÃO SATISFEITO / CUSTÓDIA VERIFICADA / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.** O bloco literal metadata-only foi executado uma vez como deploy sem sudo; sua ação/destinos locais capacity-v1 estão **consumidos**, não repetir. Não se executou nenhum bloco v2, nem se retomou a descoberta ELF. Código/COMMANDS/manifest/provas mantêm os bytes aprovados. [RESULT.json](../crm-csv-toolchain-capacity-20261017/RESULT.json) contém somente resumo tipado, valores numéricos, metadados pertinentes e hashes/procedência; não contém stdout/stderr brutos, ambientes ou journals.

### Execução, fontes e custódia

Branch/HEAD/remoto iniciais:b39169e806d8b4901d368ebca0b30e2938ff2f6e, review/campaign-recovery-20260926. COMMANDS9d5b457c…, manifest9f248998… e seis fontes conferidos; parent privado owner700 e novos destinos exclusivos verificados. Um único SSH25s/BatchMode/StrictHostKey, sem conexão de diagnóstico adicional. A execução retornou exit0 e `CAPACITY_READ_CUSTODY_PRESERVED_NOT_CERTIFIED`.

Transporte: **16:01:09.350035–16:01:12.216986 UTC**, isto é13:01:09–13:01:12 Fortaleza. Intervalo remoto **16:01:12.154664–16:01:12.155377 UTC**; statvfs16:01:12.155254–16:01:12.155289. Não houve timeout, stderr ou retry. A leitura concluiu sem tratar budget=false como falha de transporte, admissão ou PASS operacional.

Custódia LOCAL pelo Capture/private_record originais: stdout2375B, SHA **340dd47cce2dfc48d17808d97fd897820ffa08449b78bc21d6833a4b6d6f2a84**; stderr0B. Envelope/manifest, canais/tamanhos/SHA/Base64 do journal e recibo conferidos offline com o leitor canônico. O input frame reconstituído das seis fontes pinadas também coincide com tamanho/hash registrados. Recibo `CAPACITY_CUSTODY_PRESERVED_NOT_CERTIFIED`, **readComplete=true / budgetSatisfied=false / oldDenyReclassified=false**. Originais privados preservados, sem sobrescrever, limpar ou reemitir. Não se repetiu suíte, build ou prova válida; somente análise offline dos novos bytes.

### Uma amostra numérica e seu alcance

Única chamada **os.statvfs(fd=6)** sobre o diretório aberto no-follow `/dev/shm/re7-csv-toolchain-read-20261017-v2`, identidade do objeto registrada no operando. Ambos os fatores abaixo vêm do MESMO retorno; calls=1. Leitor uid1000/gid1000.

| Campo / cálculo | Valor observado |
| --- | ---: |
| f_bsize / f_frsize |4096 /4096B |
| f_blocks |251872 |
| f_bfree / f_bavail |113383 /113383 |
| f_files |251872 |
| f_ffree / f_favail |250798 /250798 |
| f_flag / f_namemax |6 /255 |
| f_bavail×f_frsize, disponível ao leitor |**464.416.768B =442,90234375MiB** |
| Comparação aprovada |>=**536.870.912B =512MiB**, **false** |
| Diferença para o orçamento |**72.454.144B =69,09765625MiB** |

Demais campos numéricos disponíveis, inclusive f_fsid, foram preservados no registro tipado. O filesystem do FD tem dev26; a observação é desse destino, **não uma medição global de disco nem certificação de reserva deploy/PostgreSQL, RAM ou capacidade de janela**. Não se infere tipo/mount options apenas pelo nome /dev/shm ou pelo valor bruto de f_flag. A disponibilidade é do instante da chamada, não garantia para um momento futuro.512MiB permanece o orçamento aprovado, sem redução, remanejamento ou nova interpretação como128MiB só porque esse é o teto de payload.

### Contrato do diretório e images, separados da capacidade

O directory(q) **canônico retornou PASS**. No intervalo: destino diretório dev26/inode1067, uid1000/gid1000, modo0700, nlink2, tamanho60B; uid coincide com o leitor. Pais observados: `/` e `/dev`, root0:0/0755; `/dev/shm`, root0:0/01777. Tipos eram diretórios sem symlinks no percurso. FDs/metadados pertinentes de caminhos/pais conferidos antes/depois: pathMetadataStable=true. Isso não certifica ACL/quota ou sucesso de uma escrita/mkdir que não foi tentada.

`images` **estava ausente** nos dois checks do intervalo; portanto não há metadados de inode/owner/modo de images a preencher. Não se abriu folha ou imagem, não se criou images, não houve readdir, chmod/chown, escrita remota ou instalação. A existência de pais e o PASS de directory são fatos distintos da reprovação do orçamento.

### O que esclarece e o que continua indeterminado

Esta observação demonstra **agora** um predicado de capacidade falso e um contrato de diretório válido, com images ausente. Logo a descoberta original com o mesmo orçamento não pode ser admitida a partir deste dado. **Não prova a causa do DENY de15:28:57 UTC**: naquela tentativa não foram registrados números, identidades/metadados do destino ou o marcador de criação/validação de images; o mesmo stage agrupava duas amostras statvfs e new_directory. Livre/ocupado, permissões e existência podem variar entre intervalos. Não se retroage capacidade, modo700, inode ou ausência atuais, nem se atribui autoria histórica. O DENY antigo permanece INDETERMINATE e inalterado; as contraprovas locais anteriores mantêm seu alcance.

Não observados nesta consulta: imagens Node/ELF, dependências, PM2/shebang/PATH em execução, configurações, SQL/ownership, identidades finais, saved/fallback, toolchain protegido ou autoridade de fase. Nenhuma closure/proteção foi certificada. O código revisado não escreve arquivos remotos nem executa Node/PM2/loaders/ldd/readelf/SQL; os registros confirmam remoteFilesWritten=false, fileContentsRead=false, imagesCreationAttempted=false. Não houve instalação, reparo, limpeza, alteração de orçamento/destino, backup, emissão, contenção, stop/start, importação, envio ou janela. Não foi feita nova certificação de health/UI; NEWauth+NEWDB+NEWcipher, crons, guarda38/out.15 e fases aceitas permanecem preservados pelo escopo sem efeitos.

**Primeiro bloqueio atual:** o orçamento de512MiB não é satisfeito no filesystem do destino no instante observado. A autorização desta consulta termina no resultado/custódia. Não há retry, nova captura, limpeza, troca de destino, redução de limite ou continuação automática da descoberta; qualquer tratamento posterior depende de deliberação revisada separada. Estado: CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY. Responsável Deifson; revisão17/10, próxima21/10 ou mudança. Publicação só de resultado/checkpoints/índices; todos os privados, DENYs e ações consumidas preservados.

---

## Reconciliação offline de remote-budget e consulta dirigida —17/10/2026, baseaf2eaf04

**DIAGNÓSTICO ANTERIOR INSUFICIENTE / PROCEDIMENTO METADATA-ONLY LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.** Nenhuma consulta à VPS nesta rodada, nenhuma ação/destino v2 repetida, nenhum arquivo privado alterado. Os comandos e fontes consumidos permanecem intactos; esta seção refina a interpretação do stage, sem reclassificar seu DENY.

### Todos os registros da tentativa e a fronteira não registrada

Foram lidos/conferidos os **20 arquivos privados das seis áreas** da execução: materialização (bundle/frame, analyzer, stdout/stderr versão e journal); coleta (captura, transporte stdout/stderr, journal e recibo); análise (journal); três launchers (journal/stdout/stderr). [RECONCILIATION.json](../crm-csv-toolchain-capacity-20261017/RECONCILIATION.json) publica somente inventário, tamanhos/hashes e conclusões. O frame custodiado e as sete fontes decodificadas coincidem byte-exatamente com o manifest707726e1… e os arquivos revisados. Os stderr estão vazios; os journals preservam classe/errno e motivo estático, não a mensagem específica de RuntimeError. Não há resultado numérico de statvfs, operandos observados, metadados do destino nem marcador de tentativa/criação de images. bundle contém código/fonte, não uma observação de capacidade. Referências antigas não dão capacidade atual; não se varreu o cofre inteiro ou outros ambientes para substituí-la.

Código efetivamente executado, em ordem, sob **o mesmo stage remote-budget**:

```python
require(os.statvfs(q).f_bavail * os.statvfs(q).f_frsize >= 512*1024*1024,
        'remote_budget_512MiB')
images = lib['new_directory'](q/'images')
require(action == 'collect', 'discovery_action_only')
```

A expressão antiga chama statvfs **duas vezes** e mistura campos de duas amostras; não é uma medição registrada. new_directory, por sua vez, valida directory(q), faz mkdir e valida directory(images). Seu predicado directory consulta tipo, owner, modo700 e ausência de symlink nos pais. Tanto o teste booleano de orçamento quanto esses predicados podem lançar RuntimeError/errno=null, o mesmo resultado salvo no DENY. O action collect está documentado no frame/begin, não explica a falha. O errno=null também não é evidência de ENOSPC/EACCES de um syscall mkdir. **Zero ELF publicados não prova que images não foi criado.** Não há marcador que discrimine se mkdir foi alcançado ou se a falha foi numa validação anterior/posterior. Não atribuir causa, autoria ou falta de capacidade ao nome do stage.

Contraprova local: os **três statements e o catch reais**, extraídos AST sem chamar run/entrypoint consumido, com Capture/private_record/new_directory/directory canônicos, produzem registros sanitizados idênticos para (a) capacidade sintética abaixo do orçamento e (b) capacidade sintética suficiente seguida de reprovação canônica do diretório775 de laboratório. Cada expressão antiga chama statvfs duas vezes; nenhuma dessas provas observa ou atribui causa ao passado produtivo.

### Justificativa offline dos512MiB, sem alterar o limite

Não foi encontrada memória de cálculo contemporânea da escolha; o código fixa512MiB. A relação4×128MiB é aritmeticamente verdadeira, mas não prova por que o valor foi escolhido. Abaixo é **reconciliação retrospectiva de planejamento**, não uma medição nem nova autoridade de capacidade. O orçamento aprovado continua536.870.912B e o destino não muda.

| Parcela | MiB | Fundamentação e limite |
| --- | ---: | --- |
| ELF bruto deduplicado |128|Teto de bytes efetivamente escritos, imposto no produtorv2; até64 objetos |
| Journal exportável |8|Limite do stable_file/export canônico para execução que consegue exportar; **não** é limite incremental de escrita |
| stdout/stderr remotos das observações |6|Se journal<=8MiB, todos esses bytes estão em Base64 no journal; logo somatório bruto<=3/4×8MiB. Não inclui imagens, já na primeira parcela |
| Fontes inativas+manifest |1|Allowance acima dos7 arquivos pinados+manifest, conferidos abaixo de1MiB; não runtime inteiro |
| Arredondamento, diretórios/inodes |17|Allowance estimado, **não provado**: faltam unidade/alocação do filesystem e disponibilidade numérica |
| Margem de segurança não dedicada |352|Reserva prudencial, não bytes cuja necessidade foi observada |
| Total de planejamento |512|128+8+6+1+17+352; não confundir com reserva canônica deploy/PostgreSQL |

Consequência:512MiB é defensável como envelope prudencial para esse lote, **não como mínimo necessário demonstrado nem teto matemático de todo estado de falha**. Em DENY/parcial, o journal pode crescer antes da checagem de export; não existe cap incremental de metadados que prove o pior caso completo. RAM de buffers/processos e pressão de tmpfs também não são certificadas por f_bavail. A auditoria não encobre essas lacunas com uma conta fictícia. Não se reduz o orçamento, move destino ou instala/repara para obter PASS; eventual mudança futura do procedimento é outra revisão.

### Uma consulta nova mínima, somente para aprovação futura

[COMMANDS.md](../crm-csv-toolchain-capacity-20261017/COMMANDS.md) entrega **um bloco concreto**. Reutiliza launcher/leitor de revisão, protocolo REMOTE_LAUNCH e funções libload/libraries/pack exatos, Capture/reader/private_record aceitos; [PROVENANCE.json](../crm-csv-toolchain-capacity-20261017/PROVENANCE.json) explicita hashes/extrações. Não há outro framework, escritor, run_privileged, sudoers ou autorização paralela.

Escopo remoto estrito: metadados e existência de `/`, `/dev`, `/dev/shm`, destino **original** `/dev/shm/re7-csv-toolchain-read-20261017-v2` e sua folha images. Pais/destino são abertos com FDs de diretório no-follow, mantidos e reconferidos; folha images só stat relativo sem seguir link nem abrir conteúdo, mesmo se for arquivo. **Nunca** chama mkdir/new_directory remoto, write, readdir, PM2/Node, readelf/ldd, SQL ou leitor de imagens. Código/fonte autenticados chegam pela única sessão SSH e são compilados dos mesmos bytes em memória, sem materializar ferramentas ou journals remotos.

Uma chamada **os.statvfs(fd_destino)** no ramo em que o destino pode ser aberto com segurança: registra API, FD, caminho lógico, UID/GID do leitor, identidade/metadados, início/fim, todos os campos numéricos, f_bavail/f_frsize e produto, comparação>=512MiB calculada do **mesmo retorno**. Usar FD vincula o resultado ao objeto aberto; não transforma observação em snapshot global. Destino ausente/inacessível/substituído ou pai symlink nega antes da consulta (calls=0 explicitamente), sem escolher outro alvo. Erro de statvfs preserva operandos/errno/calls=1, sem segunda tentativa.

O directory(q) canônico é consultado **separadamente** apenas por leitura. Resultado budget=false pode ser leitura concluída, nunca admissão operacional; directory=PASS também não prova mkdir criável, ACL/quota/flag de montagem ou causa histórica. Existência de images observada futuramente não provará quando foi criada. O novo intervalo não retroage sobre o DENY.

Nenhum destino remoto novo. Novos destinos **exclusivamente locais**, no parent privado legítimo existente owner700: `csv-toolchain-capacity-20261017-v1` e `csv-toolchain-capacity-launcher-20261017-v1-collect`, novos diretórios700/arquivos600 sem corrigir parents. SSH único25s/BatchMode/StrictHostKey. stdout autenticado é o envelope; a custódia canônica é LOCAL, pois criar journal remoto contrariaria o escopo sem escrita. Capture preserva byte-exatamente canais/comando/intervalos/código/errno/tamanhos/hashes antes de parse, inclusive resposta perdida/parcial; recibo distingue readComplete de budgetSatisfied. Fontes6 em memória, resposta<=64KiB, sem copiar imagem/runtime. Falha/destino existente: preservar e parar, sem retry/reconexão, reparo ou expansão.

### Provas e limites atuais

[PROOFS.json](../crm-csv-toolchain-capacity-20261017/PROOFS.json): **10 testes novos dirigidos PASS**, sem repetir as suítes anteriores. FD/metadados e statvfs locais reais, contador de uma chamada; folha images contendo marcador sintético nunca aberta/lida; orçamento baixo e predicado directory negado distintos de leitura incompleta; ausência, negação, troca de inode, erro EIO sem retry; contraprova do stage antigo; bloco publicado executado literalmente e resposta perdida com canais/custódia preservados. Verificadores canônicos reais, sem callbacks que aprovam contratos. O ramo remoto de laboratório proíbe subprocesso e qualquer open de arquivo de conteúdo/escrita; o diretório alvo simulado permanece vazio.

SSH e caminhos produtivos são simulados em namespace local sem rede; números sintéticos somente nas contraprovas indicadas. User namespace não é root produtivo. As primeiras sete provas de função passaram no sandbox; os dois casos de transporte foram bloqueados pela restrição de namespace e a validação local completa foi concluída fora dessa restrição com aprovação da ferramenta. Nenhuma consulta real à VPS, imagem, instalação, build, backup ou janela. Não há afirmação de capacidade/proteção operacional nem fechamento de Node/ELF/PM2/SQL/identidades/autoridade/Event775.

**Próximo passo:** revisar e autorizar separadamente só este bloco metadata-only, se desejado. Primeira lacuna continua diagnóstico insuficiente para discriminar orçamento/validação de images; não publicar causa antes da observação. V2 e todos os DENYs/históricos/privados preservados e consumidos; NEWauth+NEWDB+NEWcipher, crons, guarda38/out.15 intocados. Responsável Deifson; revisão17/10, próxima21/10 ou mudança. CSV SUSPENSO / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.

---

## Execução única do roteiroea4a80c4 —17/10/2026: DENY preservado

**RESULTADO: DENY / CUSTÓDIA VERIFICADA / NENHUM ELF CAPTURADO OU ANALISADO / CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.** Três blocos literais de COMMANDS.md executados uma vez cada, na ordem autorizada, sem editar código, hashes, limites ou destinos. Materialização, coleta e análisev2 estão **consumidas**; não repetir. Sete fontes revisadas e todos os privados/DENYs anteriores preservados. [RESULT.json](../crm-csv-toolchain-discovery-20261017/RESULT.json) contém somente resultados sanitizados, intervalos e hashes/procedência.

### Revisão e alcance efetivamente executado

HEAD/branch/remoto iniciais:ea4a80c44c1153fb9b8e36908af7daf69f32b695, review/campaign-recovery-20260926. Manifest707726e1… e COMMANDS6175de5c… conferidos contra os literais publicados; sete fontes, parent privado owner700 e destinos locais exclusivos aprovados. Nenhum teste/suíte/build repetido. Vercel permanece deploymentEnabled=false nessa branch; único CI versionado aceita push/PR somente main/develop, sem alteração de configuração.

| Bloco | Intervalo UTC (17/10) / Fortaleza | Resultado e limite |
| --- | --- | --- |
|1materialização/preflight LOCAL|15:26:55.090656–15:26:55.142314 /12:26:55|exit0, MATERIALIZED_INACTIVE_NO_REMOTE; sete fontes inativas e analisador local conferidos; sem SSH |
|2coleta deploy SEM sudo|15:28:54.876893–15:28:57.850384 /12:28:54–12:28:57|exit1; CUSTODY_PRESERVED_DENY_NO_RETRY. DENY remoto às15:28:57.749791 em `remote-budget`, motivo estático `remote-budget_not_proven`, RuntimeError/errno=null |
|3recepção/análise LOCAL|15:30:02.137993–15:30:02.180072 /12:30:02|exit1, DENY local às15:30:02.178748, `source-custody` / `source-custody_not_proven`; zero objetos publicados, sem SCP/readelf de imagem |

O bloco3 foi executado uma única vez conforme o contrato que admite análise de parciais e nega sem transferência quando não há objetos. A reconciliação offline confirma que recibo, manifest, tamanho e SHA da captura correspondem; **custódia não está inválida**. O primeiro predicado não satisfeito nessa sequência é `image_set` (exige0<count<=64; observado0). O diagnóstico usa o stage amplo source-custody; o nome não autoriza inferir corrupção do recibo. Nenhum DENY da origem foi transformado em PASS.

### Fatos demonstrados e integridade da custódia

Preflight LOCAL real, sem simulação: GNU readelf (GNU Binutils for Ubuntu)2.42, `/usr/bin/x86_64-linux-gnu-readelf`,789.280B, SHA64c58e15274bbbb5153f31078e455e9e77ee5f51489e709bba5bb788ce9df2b0, root0/0755; alias/cadeia/FD estáveis pelo leitor canônico. Único argv readelf executado: `--version`, exit0 entre15:26:55.134417 e15:26:55.137902. **Não** houve análise de binário capturado nem execução de Node/PM2/loader/ldd.

Remoto: sete fontes inativas materializadas e conferidas pelos seus hashes, mais o manifest do pacote. O runner negou no primeiro estágio de orçamento, antes de PM2/CLEAN.PATH, Node, boot/PID/exe/maps ou qualquer command de observação. Publicados0ELF/0bytes ELF. Os512MiB são **orçamento específico desta operação**; não reserva canônica deploy/PostgreSQL. Os registros não guardam f_bavail/f_frsize ou bytes disponíveis, nem uma medição de capacidade. A negativa comprova que esse estágio não foi satisfeito; não autoriza dizer que o disco global está cheio, que o tmpfs tem determinado tamanho ou que a imagem Node mudou.

A exportação ocorreu na mesma resposta, inclusive em DENY, e foi ingerida pelo private_record existente. Conferência offline adicional usa os mesmos bytes do reader canônico e valida envelope, canais, manifest, fontes e recibo; não executa entrypoint consumido. Captura privada2244B, SHA **c6b86a6ff3d9c2168b844661059e42a622a78091dcd751381dffaf88e9892d72**. Recibo canônico367B, SHAbbd690a8fa494ceae4c38447fbba9aa10a80c0719bf815a3942993cc4a5b29f2, `TOOLCHAIN_DISCOVERY_CUSTODY_PRESERVED_NOT_CERTIFIED`, gatePass=false. Journal local da análise210B, SHA0fed305656ce1f14d25d42cd6cd6b28aae0ca72c0db3db61ecfc58436b272c75. Canais/journals/intervalos individuais e hashes completos em RESULT.json; nenhum bruto, journal, configuração ou imagem vai ao Git.

Materiais privados e destinosv2 permanecem intactos. Nenhuma imagem foi recebida: não existe diretório local images na análise; nenhuma transferência SCP foi tentada. Os arquivos inativos remotos não são instalação nem implantação. A leitura posterior de registros foi exclusivamente LOCAL; a visão sandbox de /dev/shm não continha a materialização, então a leitura offline foi feita na mesma visão local da execução, sem recaptura ou nova consulta à VPS.

### Dependências desconhecidas e primeiro bloqueio

Demonstrado: revisão de sete fontes, analisador **local** disponível/estável no preflight, negativa remota anterior às leituras, custódia byte-exata de DENY e negativa local por população vazia antes de SCP/análise. O ambiente produtivo não foi simulado nesta execução; as provas de laboratório anteriores continuam separadas e não preenchem os fatos não alcançados.

Permanecem **desconhecidos nesta tentativa**: imagem Node atualmente selecionada/executada, PM2 shebang/PATH e proteção efetivos, PT_INTERP/DT_NEEDED/RPATH/RUNPATH, arquivos mapeados e suas dependências, closure/proteção operacional completas. As referências d016/PM2 históricas conservam seus horários/hashes e não são atualizadas por esta execução. SQL/ownership, saved/fallback/identidades finais,16vínculos/autoridade e Event775 continuam pendentes e fora do escopo executado.

**Primeiro bloqueio concreto: remote-budget.** É necessário reconciliar o orçamento de512MiB com a capacidade do destino exato por evidência numérica dirigida, em etapa futura separadamente revisada/autorizada; a captura atual não contém esses números. Não baixar limite, mover destino, reparar ou executar nova coleta agora. Não se preparou outro launcher/pacote nem se repetiu qualquer ação. Fonte DENY e destinações consumidas permanecem como evidência. A certificação ELF não avançou; não há janela pronta.

Nenhuma instalação, sudo, reparo, SQL, backup, emissão, stop/start, contenção, importação, envio ou alteração de produção/controles. NEWauth+NEWDB+NEWcipher, ambos crons, guarda38/out.15 e fases aceitas preservados pelo escopo sem efeitos; não se realizou nova certificação de health/UI/produção. Responsável Deifson; revisão17/10, próxima21/10 ou mudança. Publicação restrita a resultado sanitizado/checkpoints e índices de revisão; código, manifest executado, COMMANDS e provas anteriores inalterados.

---

## Correção da dependência de descoberta —17/10/2026, base002b46a6

**PROCEDIMENTO REMOTO/LOCAL SEPARADO / LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.** Integração anterior permanece ACCEPT LOCAL no alcance já documentado. Esta seção substitui SOMENTE a dependência do procedimento de descoberta; não modifica a composição, contratos de execução, autoridade ou recuperação.

**O COMMANDS de002b46a6 NÃO DEVE SER EXECUTADO.** Exigia `/usr/bin/readelf` na VPS, embora a tentativa custodiada anterior já tivesse falhado no lançamento desse argv com FileNotFoundError/errno2. A [evidência original](../crm-csv-three-gaps-result-20261017/REPORT.md) não distingue executável ausente de loader ausente; não se presume causa nem se procura alternativa. A dependência remota, portanto, estava mal colocada. Os bytes e quatro provas anteriores continuam disponíveis no Git em002b46a6; não são provas da nova sequência nem da disponibilidade produtiva do analisador. Nenhum DENY anterior foi reclassificado.

### Comparação e volume antes de qualquer proposta de transferência

Conferidos os índices/fontes aceitos e o material local indicado na matriz, sem nova varredura privada ou captura. R2 conservou hash/metadados Node d01614ef…/97.661.912B, não o ELF integral. A imagem local disponível foi lida/hashada, sem execução:120.078.896B, SHAaf8d5d1e…; difere da produtiva. PM2/package/lock/closure26 e prova completa continuam reaproveitados nos seus alcances; não há ELF produtivo pinado correspondente entre esses materiais. [PROVENANCE.json](../crm-csv-toolchain-discovery-20261017/PROVENANCE.json) registra a comparação e a limitação do conjunto examinado; não alega inexistência em todos os discos/cofres.

A proposta copia somente o ELF selecionado e os ELF file-backed mapeados pelo daemon observado, **uma vez por SHA**, até64 objetos e **128MiB brutos somados**. Isso permite à ferramenta local ler os objetos completos, inclusive estruturas ELF, sem introduzir parser remoto, reconstruir arquivo esparso ou apresentar bytes fabricados como captura. Não copia runtime, árvore de release, node_modules, banco ou ambiente. O mesmo Node selecionado/mapeado não é copiado duas vezes. Uma biblioteca ainda não observada permanece UNKNOWN; o limite não pode ser aumentado para obter PASS. Exceder128MiB nega e preserva o já capturado, sem selecionar arbitrariamente um subconjunto como closure completa.

Orçamento específico do lote: **512MiB livres remotos /2GiB locais** antes das cópias. Não substitui reservas canônicas deploy/PostgreSQL nem certifica capacidade de janela. Raw remoto máximo128MiB; journal/export metadata continua com limite canônico8MiB. SCP copia uma vez somente o diretório privado `images`, com nomes SHA. Localmente, raw<=128MiB, canais readelf<=128MiB no pior caso64×2MiB, journals/artefatos/diagnósticos cabem na margem2GiB. Não se embute98MB em base64 dentro do journal limitado; não se amplia o reader/export por conveniência.

### Procedimento atual e consumidores reutilizados

[COMMANDS.md](../crm-csv-toolchain-discovery-20261017/COMMANDS.md) contém **três blocos concretos para revisão**, todos com fontes pinadas no manifest. Novos destinosv2, sem reutilizar os propostosv1 nem destinos consumidos:

1. LOCAL materialização + preflight readelf: reader/cadeia/FD, ELF executável root-owned sem escrita de terceiros, `--version` local por FD, tool/metadados/hash/canais privados. Ausente/negado nega **antes de qualquer SSH**. Literal do launcher/review ancora os mesmos bytes compilados; não import de caminho mutável.
2. Remoto deploy sem sudo: o [runner](../crm-csv-toolchain-discovery-20261017/runner.py) só usa as leituras aceitas de PM2/CLEAN.PATH, Node, boot/pm2.pid/stat/exe/maps e limites. Abre o FD contra a mesma identidade/metadados, publica bytes estáveis com `write_artifact` O_EXCL/no-follow, registra proveniência por `private_record`. **Nenhum subprocesso remoto**, readelf/alternativa, Node, PM2, CJS, loader ou ldd. SSH único devolve o journal também em DENY; resposta perdida conserva canais e origem, sem retry.
3. LOCAL recepção + análise: [local_elf.py](../crm-csv-toolchain-discovery-20261017/local_elf.py) exige journal/recibo canônico correspondentes ao mesmo manifest, fonte estável antes/depois, refs SHA/tamanhos e conjunto exato. Reconfere o analisador contra o preflight. SCP único para destino exclusivo; parcial preservado com tamanhos/hashes/metadados pelo leitor canônico, sem análise. Cada ELF íntegro é aberto em FD no-follow; o readelf **local** recebe esse FD, sem executar o alvo nem seu loader. stdout/stderr, comando/intervalo/código/errno e hashes pelo Capture/private_record existentes.

Destinos concretos: `/dev/shm/re7-csv-toolchain-{material,tools,read}-20261017-v2` nos respectivos hosts; custódia local `csv-toolchain-discovery-20261017-v2`, análise `csv-toolchain-analysis-20261017-v2`, launcher `csv-toolchain-launcher-20261017-v2-{materialize,collect,receive-analyze}`. Parents privados legítimos700 existentes; criação exclusiva700/600; sem criar parents, chmod, chown ou reparo. Não há instalação/autoridade produtiva implícita. SSH180s/SCP240s; readelf15s por objeto e HARD1MiB/canal, temporários anônimos no destino privado. Ausência/divergência/leitura negada/timeout/consumo de destino impede prosseguimento, sem replay ou fallback.

O transporte/launcher, export/ingest, leitor R2 e escritor canônico foram reaproveitados. `capture.source` permanece AST idêntico; não se criou framework/coletor genérico, writer ou parser ELF. `driver.libload` agora entrega explicitamente ao Capture o mapa BLOBS já autenticado, necessário à sua utilização local; não busca código em disco. A antiga derive.py foi desativada como gerador para não reinstalar a receita remota obsoleta; fontes editáveis atuais são os arquivos entregues, seal.py apenas publica índice/literais. Materialização continua inativa.

### Provas afetadas e limites

[PROOFS.json](../crm-csv-toolchain-discovery-20261017/PROOFS.json): **7 casos finais PASS**, três blocos publicados executados literalmente em namespace descartável sem rede. Caso válido conserva bytes/dedup1imagem, transferência/custódia e readelf FD local real. Negativas: ferramenta local ausente/negada antes de SSH; leitura remota negada; substituição entre conferência/uso antes de publicação; SCP parcial; imagem adulterada antes da análise. Todos preservam DENY e materiais; parciais têm hash/tamanho/metadados pelo reader real. No ramo remoto qualquer subprocess.run provoca erro no laboratório; nenhum foi chamado. Origem em DENY só poderá ser analisada mediante decisão correspondente, resultando sourceComplete=false; não altera o estado da origem nem autoriza continuar automaticamente após falha.

Reais: Bash/Python, loader de revisão, FDs/no-follow/metadata/hash, Capture/private_record/export/ingest, bytes ELF locais preservados, readelf local `--version`/`--program-headers --dynamic`, revalidação. Simulados: SSH/SCP via shims, proc/boot/PID/maps, digest esperado Node projetado para ELF local `/usr/bin/true` **nunca executado**; UID root65534 projetado a0 no namespace. Ausência/negação são injeções de erro na fronteira de leitura, não observações da VPS. Provas PM2 completa, closure26, Operations/retorno e integração anterior não repetidas.

O sandbox bloqueou o namespace na primeira execução; os ensaios foram feitos localmente fora dessa restrição com aprovação da ferramenta, sem VPS. O primeiro ensaio identificou ausência do mapa BLOBS no carregamento local do Capture; corrigida a interface para usar o mesmo snapshot autenticado. Revalidado somente o novo percurso e suas negativas após vincular recibo/fonte e registrar parciais. Nenhum efeito produtivo, build, instalação, download, SQL, backup, emissão ou janela.

### Estado final e pendências

Procedimento separado validado localmente, **não executado na VPS**. Os resultados futuros continuam descoberta/análise NOT_CERTIFIED ou DENY; full closure ELF/JS e proteção operacional NÃO certificadas. Ainda exigem reconciliação PT_INTERP/NEEDED/RPATH e mapas, transitivos dinâmicos, toolchain protegido, saved/fallback/identidades finais, SQL/ownership,16vínculos/autoridade e Event775. Não reaberto frontend nem recuperação consumida. NEWauth+NEWDB+NEWcipher, crons, guarda38/out.15 e privados/históricos preservados. Próximo passo: revisão dos comandos corrigidos, sem autorização de execução por esta publicação. Responsável Deifson; revisão17/10, próxima21/10 ou mudança.

---

## Aceite delimitado e procedimento Node/ELF/PM2 —17/10/2026, base6e93e409

**INTEGRAÇÃO ANTERIOR ACCEPT LOCAL no alcance documentado / PROCEDIMENTO LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.** O aceite refere-se à composição/folha e lançamento pré-autoridade descritos abaixo. Não promove projeções de UID/modos, Node local ou respostas sintéticas a observação produtiva. Os históricos REVIEW PENDING abaixo permanecem como registro de suas rodadas.

### Procedimento único para o primeiro bloqueio

[COMMANDS.md](../crm-csv-toolchain-discovery-20261017/COMMANDS.md) entrega dois blocos concretos **para revisão e autorização futura**: materialização local e transferência única/descoberta/custódia. Não foram executados na VPS. Novos namespaces exclusivos `re7-csv-toolchain-*20261017-v1`; nenhum destino consumido reutilizado. [MANIFEST.json](../crm-csv-toolchain-discovery-20261017/MANIFEST.json) autentica seis fontes. Não é geração operacional, manifest de fase, instalação ou permit.

O adaptador dirigido [runner.py](../crm-csv-toolchain-discovery-20261017/runner.py) reutiliza `file_chain`, `stable_file`, `read_at`, `executable` e boot64 do leitor R2, Capture extraído byte-exato do runner aceito e `private_record` original. Launcher e driver derivam do transporte aceito; só materialize/collect expostos, sem SELECT. [PROVENANCE.json](../crm-csv-toolchain-discovery-20261017/PROVENANCE.json) identifica origens/hashes/transformações; derive.py reproduz os derivados e seal.py publica índice/literais. Não há writer, RPC, classificador ou autoridade paralelo.

| Pergunta / consumidor | Leitura concreta e limite | Conclusão admissível / não comprovado |
| --- | --- | --- |
| Node que System.start selecionaria | PM2 alias/bin deve manter hashbbb586 e shebang exato; PATH vem de CLEAN da fonte Operations pinada, não da sessão SSH. Caminhos são observados em ordem. Primeira entrada existente executável deve ser Node d016; ambiguidade, falta de leitura ou drift nega | Resolução para **esse** PATH/UID e intervalo. Não executa env/Node/PM2 nem adapta referência para PASS |
| Imagem running | pm2.pid atual, stat/ticks/exe/boot/maps pré/pós pelos leitores existentes. SHA do FD exe deve corresponder à seleção acima; nenhum PID histórico promovido | Candidato de daemon e imagem no intervalo; não identidade final do trio ou certificado de ownership/saída |
| ELF e libs carregadas | Única ferramenta previamente escolhida `/usr/bin/readelf`; ELF executável/cadeia root-owned sem escrita grupo/outros. Ausência/EACCES nega. Tool e alvo abertos em FDs, não hash seguido de execução de caminho mutável. `--wide --program-headers --dynamic` | PT_INTERP/DT_NEEDED/RPATH/RUNPATH nos canais privados. Maps cobre o carregamento presente; resolução completa e carregamentos futuros continuam dependentes da análise offline. Não executa loader, ldconfig, ldd nem dependências |
| Proteção PM2/transitivos | Alias/bin, CLI/package/env e imagens mapeadas com cadeias, links, owner/modos, dev/inode e hashes. JS transitivo comparável às fontes pinadas pré-existentes | Observação de proteção/ausência de proteção, sem corrigir nada. Não alega toda closureCLI, autoridade ou toolchain protegido; transitivos não observados UNKNOWN |

Ferramenta readelf usa a confiança OS existente; o predicado de caminho root sem escrita de terceiros é uma precondição específica desta análise, não certificação de suas próprias dependências OS ou novo requisito retroativo de retorno. Node selecionado e imagem alvo não são executados. Quando a ferramenta faltar, não há tentativa por outro caminho, parser alternativo, instalação ou fallback. Descoberta precede qualquer escolha futura de proteção/instalação, que permanece separada e não autorizada.

Limites escolhidos antes da leitura:64B boot/pm2.pid,256KiB maps,64KiB entry,8MiB scripts/config,256MiB por imagem,64 arquivos mapeados/512MiB total; readelf15s e limite HARD1MiB em **cada** canal via RLIMIT_FSIZE sobre temporários anônimos no destino privado, transporte180s. Excesso/falha para e conserva parcial. O transporte pode vencer antes do pior caso64×15s: preserva canais locais e origem remota, sem retry/reconexão automática. Sem resposta completa, custódia será DENY parcial, não conclusão da descoberta. Sem parent privado legítimo/writer íntegro ou destino já existente, parar antes dos efeitos; não criar parent nem reparar permissões.

### Validação dirigida e limites das simulações

[PROOFS.json](../crm-csv-toolchain-discovery-20261017/PROOFS.json): quatro casos finais aprovados em [test_blocks.py](../crm-csv-toolchain-discovery-20261017/test_blocks.py). Blocos Bash publicados executados literalmente, launcher/manifest, fontes em memória, leitor/FD/metadados, ferramenta readelf local real sobre ELF FD, export e ingestão/custódia reais. Não se substituiu verificador por callback PASS. UID0 é namespace de usuário sem privilégios no host; raiz do host representada por UID65534 é projetada explicitamente para UID0 na fixture. SSH é shim sem rede; proc/stat/maps/pm2.pid/boot e digest esperado Node são fixtures: ELF local de `/usr/bin/true` NÃO executado, **não** a imagem Node produtiva d016. ENOENT/EACCES são falhas injetadas na fronteira do tool read. Não houve PM2/Node alvo, sudo, daemon, SQL, download ou build.

Casos: (1) descoberta sintética válida, sempre elfClosureCertified=false/protectionCertified=false; (2) readelf ausente, errno2, sem chamada de ferramenta; (3) leitura negada, errno13, sem chamada; (4) inode substituído entre snapshot e abertura, negativa antes de readelf. Todos preservaram canais/tamanhos/hashes e DENY no writer canônico. A suíte antiga PM2 completa, closure26, recuperação e integração de12 provas não foram repetidas.

Os primeiros ensaios foram bloqueados pelo sandbox no namespace de rede. Repetidos somente no laboratório com aprovação de execução local; correções da fixture: bind gravável, projeção stat/lstat, instrumentação sem tocar metadados dos ancestrais e UID root. O ensaio identificou dependência indevida de TMPDIR no novo adaptador: temporários anônimos foram limitados ao próprio destino privado antes da validação final. Também foi explicitada a precondição root do analisador; quatro casos revalidados sobre os hashes finais. A conferência staged exigiu normalizar somente o EOF do trecho extraído; os quatro blocos/casos foram novamente aprovados com o manifest final. Não se atribuiu nenhum DENY histórico a essas causas locais.

### Integridade da entrega

A allowlist corrente contém somente este incremento e os seis checkpoints/documentos pertinentes. DELTA.patch representa os arquivos de código, provas, procedimento e documentos listados, **excluindo o próprio patch, ALLOWLIST.json e MANIFEST.sha256 de entrega** para não criar auto-referência. Usa contexto zero (`git apply --unidiff-zero`) para não introduzir whitespace artificial nas linhas de contexto vazias. O índice SHA da revisão cobre o patch e a allowlist, excluindo a si mesmo; MANIFEST.json do diagnóstico tem papel distinto e cobre somente suas seis fontes. Nenhuma política, perfil/binding privado, journal, mapa de processo bruto, runtime ou cache integra a publicação.

Vercel permanece deploymentEnabled=false na branch review/campaign-recovery-20260926; único workflow versionado CI restringe push/PR a main/develop. Configurações não alteradas. Sem hook ativo configurado. Branch/HEAD e remoto conferidos na base6e93e409 antes das edições. Publicação Git não equivale a autorização remota ou instalação.

### Dependências restantes e próximo passo

Revisar/aprovar somente os dois blocos de descoberta. Nenhuma coleta autorizada por esta publicação. O resultado futuro será DISCOVERY_OBSERVED_NOT_CERTIFIED ou DENY_NO_RETRY; a análise offline dos canais ELF poderá delimitar resolução/transitivos ainda não observados. Não há certificação integral por versão, contagem4552 ou closure26. Permanecem SQL/ownership, saved/fallback/identidades finais, toolchain efetivamente protegido,16 vínculos/autoridade/inputs atuais, Event775 e futura instalação. Frontend não reaberto. NEWauth+NEWDB+NEWcipher, ambos crons, guarda38/out.15 e todos os privados/históricos consumidos intactos. Sem VPS, SQL, instalação, emissão, backup ou janela. Owner Deifson; última revisão17/10, próxima21/10 ou mudança.

---

## Integração local da folha e lançamento pré-autoridade —17/10/2026, base6adfb37e

**LOCAL VALIDATED no alcance abaixo / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.** Esta seção sucede a integração pendente descrita nas reconciliações abaixo, sem reescrever seus resultados. Predecessor mantém ACCEPT LOCAL no alcance anterior; as condições operacionais de toolchain/SQL/identidades continuam abertas. Nenhum kit histórico, comando consumido ou manifest de fase foi alterado.

### Integração efetiva e fontes editáveis

[composition.py](../../../../scripts/crm_csv_predecessor/composition.py) reutiliza o compositor editável aceito `crm-csv-original-chain-20261016/compose.py` e seu hook `delta.apply`, autenticados por `git show` da base6adfb37e e comparação byte-exata. Aplica os deltas anteriores na mesma ordem e chama **compose_inputs(source_only=True)** antes da análise de imports/DAG. Não chama write/write_kit, instalador ou produtor de dados. O novo ramo é explicitamente estático: rejeita mistura com argumentos operacionais; o ramo completo anterior foi preservado e teve regressão dirigida.

A composição existe somente em memória:127 caminhos/61 conteúdos. Os seis outputs Python do predecessor são idênticos aos hashes já revisados em PREDECESSOR_PROOFS. `window/policy_predecessor.py` é uma folha única pinada em46e71c30…, com as cinco arestas reais em imports e eagerDependencies: csv_contract, original_checks, root_readonly, pre_install e admit_gates. Sua origem editável continua runtime.py; sources.py agora confere esse pin ao produzir a folha. O índice resultante registra origem anterior, transformação e hashes; não confunde hash do input com output.

A closure ORIGINAL foi percorrida e carregada pelo **Loader canônico**: Operations e original_checks importaram a folha com os arquivos executáveis switch/return/return-partial removidos da fixture. Não se executou recover nem se criou permit; o layout e os dados exigidos pelos contratos não foram removidos para obter PASS. Os caminhos de fase continuam usando Context/root/decisão como antes. O novo código não modifica classificação, geração, seleção, certificados, consumo, replay, R3, B1/B2/B3 ou os verificadores de retorno.

`composition.owner_launch_program` fecha a ligação seguinte: confere o digest do índice e os objetos runtime/leitor dessa mesma composição, compila o renderizador desses bytes e produz somente o programa literal para revisão independente. Não importa uma segunda cópia por caminho nem o executa. A contraprova de biblioteca do renderizador adulterada nega antes da emissão.

O compositor acrescenta três fontes de revisão, não uma instalação: `review/pre_authority.py`, `review/reader.py` e `review/graph.py`. As duas últimas extraem exatamente as funções AST `metadata/read` do launcher canônico postrpc e `require/topo` do compositor B4; a prova compara os corpos AST. Não há segundo leitor de arquivos nem novo verificador de fase. Imports tardios aceitos não são convertidos em ciclos de selagem; ciclo real no DAG eager continua negado.

### Raiz de confiança antes da autoridade de fase

[pre_authority.py](../../../../scripts/crm_csv_predecessor/pre_authority.py) implementa o lançamento de revisão **somente de root_readonly/pre_install**, sem instalar/consultar Context, helper ou Store. Usa a mesma confiança canônica: o **owner aprova um programa literal de lançamento e seu hash**, publicado independentemente do diretório da preparação. `owner_program` apenas produz material para essa revisão; chamar essa função ou calcular um digest localmente **não** aprova um pacote. O programa de uma preparação real ainda precisará ser renderizado/publicado com seu namespace/digest concretos e aprovado pelo owner. Nenhum foi produzido nesta rodada; somente programas de fixtures descartáveis.

Sequência implementada: (1) programa literal, executado pelo Python isolado canônico, contém digest esperado da composição e bytes+hashes do runtime/leitor; não os obtém de argv/env; (2) confere e compila **esses mesmos bytes em memória**, sem import por caminho; (3) lê COMPOSITION.json pelo leitor FD/no-follow/limites/estabilidade existente e exige a correspondência exata ao literal revisado, kind estático e flags executionAuthorized/operationallyCertified falsas; (4) confere também runtime/leitor contra o índice e valida os nomes/arestas pelo topo canônico; (5) captura toda a closure, inclusive bibliotecas autenticadas, antes de importar a entrada; (6) entrega os bytes ao **verified_loader existente**, que restringe imports e compila snapshots; (7) reconfere o review e os arquivos capturados no uso. Ausência, adulteração, substituição ou erro de leitura nega; sem fallback, reparo, Context implícito ou PYTHONPATH como autoridade.

Para root_readonly a closure inclui a folha e bibliotecas de carregamento, sem candidatos. Para pre_install inclui antecipadamente os inspect entries tardios realmente consumidos por check_current (quatro Operations, baseline_contract, restore e current-sql). Os dados/perfis/imutáveis/RPO continuam sendo conferidos pelos verificadores originais, não pelo launcher. **O owner executará root_readonly no contexto root previsto e pre_install como deploy; o launcher não concede privilégio.** Toolchains Python/Node/OS e proteção efetiva permanecem pré-condições separadas. O mecanismo não é um sandbox de efeitos de código aprovado; autentica o código e limita as entradas conforme os consumidores revisados.

O adaptador de revisão usa a estrutura existente de código estático como vista do Loader (linguagem derivada da extensão), **sem inventar UID/modos ou um manifest de fase**. `permit=None` representa ausência apenas para o ramo de leitura do Loader, não um permit emitido. start_mode e qualquer finalidade distinta de inspect negam. Broker só permite Python baseline_contract e snapshot Node current-sql; não executa ops.py/contain ou close/open como filho. Não é caminho de retorno nem autorização de ida; ORIGINAL/CANDIDATE/PRESTOP de operação continuam no mecanismo de fase existente.

Os filhos preservam os mesmos literais revisados e usam programas embutidos derivados do pai já autenticado. Python usa -I -S. Node executa o bootstrap Node canônico a partir dos bytes do snapshot, com broker Python revisado para snapshots/filhos; não faz require de caminho mutável. A correlação é rotulada OWNER_REVIEW, não identidade de fase/B2. Cada releitura é passiva, não emissão ou renovação. Demais comandos de OS dos consumidores permanecem inalterados; não foram habilitadas novas ações sudo.

### Provas, simulações e negativas

Doze testes focados em [test_composition_launch.py](../../../../scripts/crm_csv_predecessor/test_composition_launch.py), **todos aprovados**, mais `Preserved.test_coherent_producer_bundle` anterior (um teste afetado pela extensão da interface). Provas antigas PM2 completa, closure26 e recuperação não foram repetidas. Contagens, hashes, nomes e limites estão em `INPUT_MATRIX.json.currentReconciliation.compositionLaunchLocal`.

| Prova | O que foi real / resultado | Limite |
| --- | --- | --- |
| Hook do compositor e cinco imports; AST do leitor/topo | Pipeline aceito completo em memória, origem Git pinada, imports/DAG resultantes; ramo estático rejeita inputs operacionais | Não se materializou preparação ou autoridade |
| ORIGINAL sem executáveis candidatos | Loader canônico carregou Operations/original_checks/folha; diretórios de código candidato ausentes na fixture | Sem start/recover/permit; provas anteriores continuam no respectivo alcance |
| Programa literal root_readonly | Programa emitido, snapshot/Loader/script/hash dos três alvos reais preservados, resultado CSV_ROOT_SOURCE_PASS e mutation=false | UID/modos/cadeias/bytes do host root **simulados** sobre os três hashes privados já preservados; não captura atual ou sudo. Qualquer subprocesso nessa prova era proibido |
| pre_install em processo Python isolado | Script e closure autenticados, checker canônico real alcançado; nega csv-contract.private.json ausente | Não há PASS de pre-A, pacote, RPO, SQL ou capacidade; não há callbacks que aprovam verificadores |
| Python filho e Node→Python→snapshot→Node | Processos e bootstraps reais; baseline Python e CJS/current-sql/preparation-bindings/waiting-work carregados. Node nega waiting-work.private.json ausente antes de docker/SQL; PATH do laboratório não contém essas ferramentas | Projetado **somente** o caminho /usr/bin/node inexistente localmente para o Node local já disponível; nenhum toolchain produtivo certificado. Metadados/serviços de produção não são simulados como observados |
| Negativas | Folha-fonte adulterada no produtor; folha ausente/adulterada no pacote; substituição após snapshot; import fora do mapa; ciclo; troca do índice apesar de argv/env; recusa de partida/recuperação e filhos mutáveis | Negativas antes dos efeitos; não conserta bindings/permissões nem emite permit |

O sandbox recusou spawnSync Node→Python com EPERM na primeira tentativa. Somente esse teste foi repetido fora da restrição, com aprovação da ferramenta, **sem sudo**, e passou. Depois do fechamento dos imports das bibliotecas, os11 testes não-Node afetados passaram no sandbox e o único Node foi revalidado fora dele. O teste do compositor foi reexecutado apenas ao acrescentar a contraprova AST/ramo estático; quatro interfaces foram revalidadas ao ligar o renderizador aos objetos autenticados. Não se declara que o sandbox provou o transporte que recusou. Nenhum stderr/snapshot/byte privado foi publicado.

### Estado e pendências restantes

A lacuna de integração do produtor/folha e de carregamento pré-autoridade está implementada e ensaiada localmente. O código de lançamento é reutilizável; **ainda não existe programa literal aprovado para uma preparação operacional atual**. Faltam namespace/perfis/32 dados de modo/16 renderizações e metadados legítimos, índices/reviews concretos e seus digests finais; nada foi preenchido. Quando esses inputs existirem, a selagem continua folhas→índices/review ORIGINAL→contrato/política→manifest de fase→âncora; o programa literal externo pinando o índice não volta ao índice que ele autentica, evitando autociclo.

Primeiro impedimento operacional inalterado: Node d01614ef/ELF e resolução/proteção efetiva PM2, além de saved/fallback/identidades e SQL/ownership atuais. Fontes locais aceitas não substituem observação/proteção futura. Event775 permanece negativa pré-parada; não há reparo ou nova investigação frontend. NEWauth+NEWDB+NEWcipher, ambos crons, produção, guarda38/out.15, arquivos privados e todos os históricos consumidos preservados. Sem VPS, coleta, instalação, build, SQL, backup, emissão, janela ou pacote operacional. Próximo passo: revisão deste delta; nenhuma execução operacional implícita. Responsável Deifson, revisão17/10, próxima21/10 ou mudança.

---

## Fechamento offline do toolchain —17/10/2026, basea8d257e6

**PREDECESSOR ACCEPT LOCAL somente nas11 provas/interfaces declaradas / TOOLCHAIN RECONCILED OFFLINE / CERTIFICAÇÃO OPERACIONAL BLOQUEADA / CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.** O aceite desta revisão não transforma os testes do predecessor em PASS de pacote, pre-A, admissão ou instalação. `compose_inputs` continua sem ligação ao futuro compositor/closure de fase; essa integração está explicitamente pendente. As seções anteriores abaixo são históricas e seus REVIEW PENDING não substituem este aceite delimitado.

### Comparação realizada, sem executar consumidores operacionais

Releitura dirigida dos manifests, fontes e arquivos locais já pinados. Nenhuma chamada PM2/Node/readelf, daemon, SQL, download, instalação, build, coleta ou suíte foi executada. Foram feitas comparações de bytes/hashes e leitura de código; não se afirma snapshot atômico dos arquivos locais nem metadados/proteção da VPS. Os resultados estão também em `INPUT_MATRIX.json.currentReconciliation.toolchainOffline`.

| Dependência / consumidor real | Fonte e comparação offline | Cobertura e limite |
| --- | --- | --- |
| Código compartilhado e quatro modos; Loader/Context/Bridge/Operations/Contract | [COMPOSITION.json ORIGINAL](../crm-csv-original-chain-20261016/static-kit/COMPOSITION.json), SHA `f9a0a44a83073739ad3bcddfdbd697eb5723c89a88d31a0c68519a87005307df`:123 caminhos/57 conteúdos, todos os objetos com hash correspondente; alvos declarados de imports presentes | Cobre bytes estáticos do índice aceito, incluindo R1/R2 e prevenção, não perfis, metadados de fase ou implantação. Não recomposto; não integra o delta predecessor por si só |
| Bibliotecas/launchers/helper/sudoers propostos | Nove entradas `protected/*` do mesmo índice, presentes com os hashes atuais; biblioteca de diagnóstico privado inclusa | Código disponível; a R1 histórica observou nove ausências no conjunto total de alvos, não nove ausências atribuídas indistintamente a esta lista: helper/sudoers vigentes foram observados em versões anteriores. `INSTALL_PLAN.json` B4 aponta composição0217… e versões anteriores de três fontes: é plano histórico, não inventário atual certificado. Nenhum alvo foi instalado/reparado |
| Codec RPC do diagnóstico | [CLOSURE.json](../crm-csv-three-gaps-procedure-20261017/CLOSURE.json), SHA `1e35a77626fea39d8b8f02695ddc4b10594ad7af37b44fba5ddcb2d309b1cd3b`:18 JS+8 package.json, todos26 arquivos locais iguais aos pins e às linhas correspondentes do índice B4 | Só `pm2-axon-rpc/pm2-axon/amp/amp-message/debug/ms/has-flag/supports-color` e resolução package.json; não carrega CLI/daemon PM2 nem fecha o toolchain de partida. Builtins de node_snapshot vêm do Node, fora desses26 |
| CLI/PM2 JS e módulos de laboratório | [TOOLCHAIN_FILES.sha256](../crm-csv-root-authority-b4-20261016/TOOLCHAIN_FILES.sha256), SHA `46180a0c52cbf9768ba750903fad5fa807c2c8b33dd2e20ef97d50ecb6c4fee7`: todos os4552 arquivos indexados ainda disponíveis e byte-iguais, sem faltante/deriva dentro **desse índice local**. Lock local igual ao [lock B4](../crm-csv-root-authority-b4-20261016/package-lock.lab.json), SHA8a96586f… | Inventário conservador do laboratório, inclui módulos/documentação/testes não necessariamente consumidos. Não se exige4552 observações produtivas nem se conclui que4552 é a closure executada. Dependências condicionais/ambiente do PM2 efetivo continuam sem atribuição operacional |
| Pacote próprio PM2 | Tarball existente SHA `a309112e6d89ed8adff54cb32831df3c79cdc6191e6085a8ea7007303fe49ce9`;133 membros regulares comparáveis ao índice B4 coincidem. Bin/pm2 e package.json coincidem também com os dois seeds produtivos históricos | Reutilizável sem download/extração. Isso vincula somente aqueles seeds ao pacote conhecido, não todos os arquivos instalados nem módulos carregados no daemon |
| JSON/CJS/parser e transporte de partida | `Operations.start → System.start → pm2_input.start → system.run([PM,'start',alias/FD,'--only',name])` nas fontes compostas; parser, `source_bytes/rendered`, memfd e selos presentes | Context.snapshot exige JSON e parser como dependências do CJS, verifica os mesmos bytes; alias protegido e nova revalidação no uso continuam obrigatórios. Os JSON/CJS de perfil não são fabricados. Preservada ordem API→worker e ORIGINAL independente de código candidato |
| Prova PM2 completa | [PM2_LAB_PROOF.json](../crm-csv-root-authority-b4-20261016/PM2_LAB_PROOF.json), SHA `0c57ff6ae0fcf768d0d94e419087cdb20bb49b8065cac30ff649ca2b0159ac73`: CLI6.0.14/daemon/parser/IPC/filhos e FD herdado reais, namespace encerrado; prova reutilizada, sem rerun | Node22.13.0 do laboratório, SHA `af8d5d1e234beb26b3095e6bebf80edc781f79c9435553a383037eccec2716f8`,120.078.896B: imagem local ainda coincide. Root/Context/alias root não eram reais nesse ensaio. A prova B3 cobre a interface System/Context→FD em seu alcance próprio; não é uma prova única produtiva dos dois elos |

Os dez pontos PM2 conferidos separadamente são `bin/pm2`, `package.json`, `index.js`, `lib/binaries/CLI.js`, `lib/API.js`, `lib/Common.js`, `lib/Client.js`, `lib/Daemon.js`, `lib/ProcessContainerFork.js` e `lib/ProcessContainer.js`. Seus hashes exatos constam no campo `pm2EntryFiles` da matriz JSON e no índice B4. O CLI requer CLI.js→constants/commander/ansis/async/debug/API/package/completion/Common/PM2IO/semver; API/Client/Common e os containers levam às dependências de ações e processos. A disponibilidade do conjunto conservador não é um trace dessas ações na VPS. Não foram executados require, CJS, CLI ou scripts desses pacotes para descobri-los.

### Faltantes exatos, sem promover versões a autoridade

1. **Imagem Node produtiva e ELF:** a observação histórica [R2](../crm-csv-r2-directed-result-20261017/REPORT.md) fixou97.661.912B/SHA `d01614ef369e36eee9ab8d86fbfa93ddf44931010add45e5262a63e3ddda784e`. O leitor `file_chain/executable` preserva hash/metadados, não um artefato ELF completo no conjunto declarado. Não há cópia correspondente nos artefatos pinados examinados. O Node local da prova é outro hash; `/usr/bin/node` não existe **neste ambiente local**, o que não diz que falta na VPS. PT_INTERP, DT_NEEDED, RPATH/RUNPATH, loader/bibliotecas resolvidos e respectivos bytes/proteção operacionais permanecem **UNKNOWN / ELF NÃO CONFERIDO**. A tentativa readelf foi separada e consumida; não se executou novamente, nem ldd ou alternativa automática. Não há lista exata de nomes de bibliotecas ELF sem essa evidência; não foi inventada.
2. **Resolução e proteção do PM2 efetivo:** o `System` composto usa `/home/deploy/.npm-global/bin/pm2`, cujo seed pinado tem shebang `#!/usr/bin/env node`. `CLEAN.PATH` começa em `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`. `child_transport.command` autentica lançamentos explicitamente chamados python/python3/node; para um argv cujo nome é pm2, devolve o comando. Portanto não se pode deduzir que o CLI usa `/usr/bin/node` só porque esse executável foi observado nos processos. Faltam resolução efetiva pelo PATH/shebang, todas as arestas CLI/dependências consumidas e proteção contra substituição do caminho PM2, módulos e intérprete. Metadata/links históricos deploy-owned não suprem proteção root. `pm2_input` fecha os bytes da configuração, **não** os bytes desses executáveis. B4 já explicitava essa precondição; não é novo requisito nem motivo para repetir a prova FD→PM222.
3. **Ambiente externo canônico:** bootstraps usam `/usr/bin/python3 -I -S`/stdlib e `/usr/bin/env`/Node builtins; helper usa sudo/root e ferramentas de sistema existentes; Operations também chama ps/crontab/systemctl/nft/docker/psql. São fronteiras externas à closure JS/Python de preparação. Não se inventou obrigação de hashear todo o OS nem novos privilégios. Instalação legítima/proteção/canais e verificações canônicas correspondentes continuam necessárias; a parte container/psql e ownership permanece no grupo SQL, sem conexão ou investigação nesta rodada. Runtimes de aplicação já aceitos e seus manifests são reutilizáveis no alcance anterior, não substituídos pelo laboratório PM2.
4. **Dados de fase não disponíveis neste kit estático:**32 entradas declaradas, oito por modo: backup-manifest.json, baseline.private.json, candidate.config.private.json, candidate.ecosystem.config.cjs, plan.private.json, proof-bindings.private.json, return.config.private.json e return.ecosystem.config.cjs. São dados/representações futuras a produzir dos mesmos perfis/vínculos legítimos, não32 fontes executáveis baixáveis nem32 capturas. Dados históricos privados podem servir de referência, não de observação atual. O índice ainda declara57 grupos; não foi preenchido ou reclassificado.

Assim, **não faltam arquivos dentro do índice JS local declarado**; faltam o fechamento/atribuição do toolchain efetivo e os artefatos/metadados operacionais correspondentes. Não se afirmou ausência global de algum arquivo no computador; a conclusão de ausência é limitada às referências pinadas examinadas. A dependência Node/ELF não é satisfeita por versão, contagem ou checksum de outro Node.

### Entrada exata de policy_predecessor na futura closure

Fonte editável `scripts/crm_csv_predecessor/runtime.py`, SHA `46e71c30fa44d454272f7a1e96ac5094182f4ec6f3fa7de57b153681ccd3b595`, torna-se **um único** `window/policy_predecessor.py`, folha sem imports. Os cinco importadores diretos são `window/csv_contract.py`, `window/original_checks.py`, `window/root_readonly.py`, `window/pre_install.py` e `window/admit_gates.py`, com os bytes transformados já indexados em PREDECESSOR_PROOFS. O módulo não concede ações, não lê política instalada e não é uma nova biblioteca root a instalar.

Integração futura pendente, em ordem: (a) executar a transformação editável antes da análise de dependências/selagem, com fontes autenticadas; (b) acrescentar a folha ao inventário/objetos deduplicados e a cada mapa `imports[importador]['policy_predecessor']` e respectiva dependência; (c) incluir a folha na closure ORIGINAL através de original_checks, sem ligar executáveis candidatos; (d) conferir review original-only, `window/sequencer-manifest.json` e review do pacote cobrindo os novos bytes; (e) após dados/metadados reais, `manifest.files`+`dependencies`+`imports` de fase incluem o mesmo caminho, hash, linguagem Python e UID/modo efetivos, sem fabricar metadados; (f) somente então selar contrato/política/manifest→âncora, sem hashes próprios ou permit voltando ao índice. Sem imports de retorno na folha, não se introduz ciclo de selagem. Uma entrada executável nova ou um permit não são necessários para importar essa folha.

**Fronteira pré-autoridade:** root_readonly/pre_install pertencem à preparação anterior à instalação/âncora; não podem pressupor Context já instalado nem importar o módulo de um caminho deploy mutável após conferir apenas o script. Seu lançamento futuro deve autenticar/carregar **os mesmos bytes** do conjunto revisado (script + folha/transitivos), pelo mecanismo canônico owner/revisão já existente. O helper de consulta não será usado para fabricar autoridade antes da instalação. Este vínculo de lançamento ainda não foi integrado/provado por compose_inputs. A aceitação local do predecessor não fecha essa lacuna; não será resolvida por PYTHONPATH, CLI/env como autoridade ou edição do kit histórico.

### Primeiro impedimento concreto e sequência mínima restante

**Para certificar o toolchain operacional, primeiro impedimento factual:** falta a fronteira autenticada da imagem Node d01614ef/ELF e a resolução/proteção efetiva do CLI PM2 com seus transitivos. Os bytes JS locais estão disponíveis; repetir npm/build/PM2, contar4552 ou ampliar closure26 não resolve esse faltante. A ação necessária será observação operacional dirigida e proteção revisada do toolchain efetivamente selecionado, com autorização própria; nenhum comando/pacote de coleta novo é preparado aqui.

**Próximo delta local de integração, separado dessa observação:** ligar `compose_inputs` ao compositor editável e ao lançamento pré-autoridade, incluindo a folha acima antes da selagem. Os bytes existentes e11 provas são reutilizáveis, mas será necessária prova da integração concreta, sem produzir autoridade ou perfis fictícios. Depois, somente os inputs operacionais ainda ausentes (saved/fallback/identidades, rota/SQL/ownership/toolchain) e16 renderizações podem permitir certificação de uma nova preparação. Nenhuma janela está preparada ou autorizada. Event775 mantém a negativa pré-parada e não foi reparado; frontend não foi reaberto. NEWauth+NEWDB+NEWcipher, crons, guarda38/out.15, custódias e ações consumidas preservados.

Responsável Deifson; revisão17/10/2026, próxima21/10 ou mudança. Esta rodada publica apenas documentação/matriz/índice de revisão; nenhum manifest operacional, código, binding, perfil ou permit foi modificado. Sem testes repetidos: a conferência nova é exclusivamente de hashes, índices e contratos já disponíveis.

---

## Reconciliação local do predecessor —17/10/2026, base52437710

**LOCAL VALIDATED no delta de fontes / REVIEW PENDING / CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.** Esta seção sucede a pendência descrita abaixo; preserva a reconciliação anterior e os57 registros históricos. Nenhuma observação foi renovada.

### Procedência e distinção de autoridade

O envelope R1 preservado de87.778B/SHA `931c9c39a6332ab4bea8a57869767c78a57eecce164ecd006346e85f44983529` foi lido localmente pelo leitor limitado/no-follow já aceito. Conferidos tamanho/hash do stdout e do alvo privado de2.751B/SHA `e2a5ffab807f457b4179a6981e15cbf52800cbf975bce921c31ee3a9a989860b`. A tentativa continua DENY; os horários16/10 não se tornam atuais. Os bytes da política não entram no Git. As18 observações não foram repetidas.

A fonte explica uma distinção importante: a política não possui campos `model`/`actions`. Seu modelo é o `policy_from` do helper8de358fd; as ações literais são do helper/sudoers, e a autorização depende também da fase e dos gates. A instalação original-only alterou exclusivamente os destinos de retorno para o par original, conforme `crm-csv-original-recovery-20261016/install_original_policy.py`; não apagou os dados `targetProcesses.switch`. A presença desses dados **não autoriza ida**. A recuperação consumida/aceita e a política preservada são fatos históricos, não uma nova autorização.

- **Predecessor:** e2a5 é somente a identidade esperada para pré-A/CAS futuro, ancorada na revisão dos bytes preservados. Sem fallback para fa113, sem inferir vigência atual.
- **Política futura:** bytes diferentes, nova preparação revisada, identidades e destinos delimitados, hash próprio. A admissão mantém a exigência de `inspect` da política futura instalada, `phase=None`, fontes vivas, cinco provas e demais controles. A evidência root do predecessor não substitui esse inspect.
- **Autoridade de fase:** Context/âncora/permit e distinção forward/recovery continuam intactos. A reconciliação não instala Store, emite permit ou fabrica pins. ORIGINAL/CANDIDATE continuam exigindo decisão específica; PRESTOP não parte.

### Rastreio produtor→consumidor e delta mínimo

Fonte editável nova: [sources.py](../../../../scripts/crm_csv_predecessor/sources.py), com [runtime compartilhado](../../../../scripts/crm_csv_predecessor/runtime.py). `compose_inputs` é a entrada conjunta e sem escrita para um **futuro compositor**, antes da selagem. Recebe explicitamente o contrato anterior, os bytes preservados, a política futura e seus vínculos já revisados; devolve fontes e contrato coerentes em memória. Não executa o compositor histórico nem gera uma preparação. O chamador futuro deverá incorporar estas fontes e suas dependências à closure/índices autenticados antes de selar; os kits históricos continuam como estavam.

| Elo existente | Origem/consumo de POLICY_SOURCE | Transformação futura |
| --- | --- | --- |
| compose.py operacional | herdava o pin fa113 do contrato OpenAI e do template do instalador | `produce_contract` valida os bytes e2a5 antes de produzir `sourcePolicySha256`; copia os imutáveis sem remover linhas; `compose_inputs` vincula o mesmo predecessor às demais saídas |
| csv_contract.check / original_checks.check_original | constantes próprias fa113 | importam `POLICY_SOURCE/require_contract` da mesma fonte; todo o sufixo canônico (imutáveis, arquivos, metadados, quatro modos, restore, referências, baseline) permanece byte-exato |
| root_readonly.capture | pin literal fa113 entre helper/sudoers root | usa o pin compartilhado; tipo, UID/modos, cadeias e hashes restantes permanecem |
| pre_install.verify | valida contrato e captura pré-A | mantém os verificadores, frescor600/3600s, RPO/custódia/laboratório; valida o conjunto exato dos três hashes root pelo mesmo módulo |
| admit_gates.admit | conferia root com valor do contrato, depois inspect da política instalada | exige contrato e root coerentes; mantém inspect do **hash futuro**, locks, gates, backup, seleção/consumo e exclusividade |
| instalador futuro | template herdava fa113 no predecessor e outro hash no destino | renderiza separadamente predecessor e hash futuro; mantém lock canônico, archive ausente, verificadores, helper/sudoers, backup e pós-conferências; reconfere predecessor após visudo, imediatamente antes da primeira escrita |

O instalador de entrada foi recuperado apenas como fonte:2.300B/SHA `b12603250d6d4acc5dc1b50fe94a1204631c7bbd4c6692b7ee8a47f4caa047ad`, cópia byte-exata sanitizada de `install-api-window-policy.sh` do material privado OpenAI anterior, agora [installer.source](../../../../scripts/crm_csv_predecessor/installer.source). Contém somente lógica, caminhos operacionais já públicos e pins, sem política/cron/ambiente. Nunca foi executado nesta rodada. O shell continua usando a sequência canônica de instalação: não é uma transação atômica de múltiplos arquivos nem protege contra um escritor root que ignore o lock; não se afirma fechamento dessa hipótese por um teste de hash.

O modelo reutiliza **o corpo canônico** de `policy_from` pinado em8de358fd: apenas as duas instruções de IO são substituídas pelo argumento de bytes já autenticados no produtor. Não há parser/schema paralelo. A validação preserva preparação, cron/fence, população/identidades, dois conjuntos de destinos e saved paths. Um campo novo `actions` ou `model` é recusado pelo modelo existente. O predecessor exato não tem absentWorker; uma política que precisasse dessa fronteira exigiria as provas canônicas externas, não seria completada artificialmente por este módulo.

### Provas executadas e limites

[PREDECESSOR_PROOFS.json](PREDECESSOR_PROOFS.json) registra os hashes de entrada/saída e os11 testes de [test_predecessor.py](../../../../scripts/crm_csv_predecessor/test_predecessor.py). Executado localmente `python3 -B -m scripts.crm_csv_predecessor.test_predecessor --custody <JSONL privado preservado>`;11/11 PASS. Sem a custódia, cinco testes públicos rodam e os seis dependentes dos bytes exatos são explicitamente SKIP, não substituídos por política fictícia.

Cobertura: fonte ausente/adulterada; modelo/população/fence/saved/actions incompatíveis; identidades/destinos futuros divergentes; desacordo de qualquer um dos três consumidores root; produtor sem mutação do input/imutáveis; predecessor recusado como política de ida; coerência do conjunto produzido; checkers concretos com leitura de arquivos privados sintéticos e profile_delta real; sufixos canônicos integralmente preservados; compilação das seis fontes transformadas; shell/CAS e troca durante visudo.

**Fronteira precisa:** os checkers completos são carregados, mas nestas fixtures sua execução termina deliberadamente em `source_policy_or_model_drift` ou no controle canônico `immutable_empty`. Isso demonstra a interface afetada e que R2 não foi removido; não é PASS de pacote completo. Pre_install/admissão têm suas chamadas e invariantes conferidas nas fontes, com o predicado compartilhado exercitado; seus requisitos completos não foram simulados como aprovados. O teste Bash executa literalmente o segmento CAS com `test`/`sha256sum` reais; sudo/visudo/install são funções de laboratório e o hash sudoers está fora desse segmento. Não há prova de instalação root ou de admissão real. As provas anteriores de recuperação/ORIGINAL/R3/B1–B4/PM2/controles e frontend são reutilizadas no alcance já aceito, sem rerun.

### Pendências e primeiro próximo passo

O desacordo de predecessor está reconciliado **nas fontes futuras**, não instalado nem materializado no kit consumido. Ainda faltam inputs atuais (saved/fallback/identidades finais, rota SQL/ownership, toolchain protegido),16 renderizações, namespace, inclusão deste módulo na closure autenticada e futura certificação do pacote concreto. A instalação da política futura continua separada da instalação estática/autoridade e da execução. Root fresco e CAS no uso exigirão autorização e coordenação próprias; esta leitura privada não os supre.

Próximo trabalho offline mínimo: conferir a closure do toolchain contra as fontes pinadas disponíveis e registrar exatamente o que falta, seguindo a sequência existente; nenhuma nova coleta genérica ou reparo Event775 foi preparado. Event775 continua negativa pré-parada, não flexibilizada. Frontend encerrado localmente; SQL e quaisquer operações permanecem fora desta rodada. NEWauth+NEWDB+NEWcipher, crons, guarda38/out.15 e todos os históricos consumidos intocados. Responsável Deifson; revisão17/10, próxima21/10 ou mudança.

---

## Reconciliação anterior —17/10/2026, base a60a00cb

**Integração a60a00cb ACCEPT LOCAL no alcance ensaiado / requisitos reconciliados offline / CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.** Aceite dos quatro testes conectados, reutilizando as onze contraprovas anteriores; RPC/peer/procfs simulados não viram prova produtiva. Nenhuma investigação frontend é reaberta. Esta atualização usa o relatório e a [matriz existentes](MATRIX.md), sem criar relatório, coletor ou pacote paralelos.

### Evidência e faltantes

Os57 IDs históricos e suas regras foram preservados em INPUT_MATRIX.json.rows. `currentReconciliation` agrupa somente quatro pendências, cada uma com consumidor, evidência, conclusão offline, faltante e dependência. A tabela da matriz é o mapa de leitura; nenhum readyOperationalInput foi promovido a true.

- **Saved/fallback/identidades finais:** aceite de recuperação16/10 e fontes originais são reutilizáveis; o envelope17/10 de358.887B (`67d9a846…`) comprova as observações iniciais descritas no [resultado consumido](../crm-csv-postrpc-result-20261017/REPORT.md). Ele parou antes dessas etapas finais. O [replay correto](../crm-csv-frontend-reconciliation-20261017/REPORT.md) resolve a representação frontend localmente, sem fabricar saved/fallback ou ticks finais. Falta observação futura dirigida dessas etapas e conferência no uso; não falta reconstruir frontend.
- **SQL/ownership:** o [procedimento delimitado](../crm-csv-three-gaps-procedure-20261017/REPORT.md) e SQLs canônicos são reaproveitáveis. Canal configurado não identifica servidor efetivo; rota/container/cliente ainda não observados por esse roteiro. SELECT precisa decisão separada após gates da rota. Mesmo SELECT válido não atribui processos: manter UNKNOWN sem tuplas root/proxy/FD/backend e sem prova pós-saída canônica. Não executar capture_imports.capture como leitor nem exigir zero com serviço vivo.
- **Toolchain:** a [descoberta dirigida](../crm-csv-r2-directed-result-20261017/REPORT.md), seeds CLI/package pinados, Node d01614ef e closure26 servem como fontes datadas. A [prova PM2 completa B4](../crm-csv-root-authority-b4-20261016/REPORT.md) comprova o mecanismo local no seu toolchain, não instalação/ELF produtivos. A dependência readelf permanece não conferida: a separação do diagnóstico foi aprovada, não eliminou a exigência de closure operacional. Faltam arquivos/dependências realmente consumidos e proteção root/alias; não downloads/build, contagem4552 como meta ou tentativa alternativa automática.
- **Vínculos/autoridade:** os16 são quatro fontes renderizadas em quatro modos, dependentes do namespace/perfis/caminhos futuros, não16 coletas. A [R1 preservada](../crm-csv-r1r2-result-20261017/REPORT.md) observou helper8de/sudoers62b5/política e2a5 e nove alvos futuros ausentes. O original root/Store/helper novo é desenho aceito, não autoridade instalada. SourcePolicy, metadados e CAS ainda precisam ser coerentes em todos os consumidores; emissão não ocorre por consulta. Permit só para recuperação ORIGINAL/CANDIDATE com decisão/frescor específicos, nunca para fabricar ida/PRESTOP.

Nenhuma custódia foi reclassificada. Conferência local restrita confirmou o envelope R1 de87.778B/SHA `931c9c39a6332ab4bea8a57869767c78a57eecce164ecd006346e85f44983529` e a existência de bytes privados da política e2a5 (2.751B) para o próximo trabalho offline. Isso não renova seu horário16/10 22:22 Fortaleza nem completa a R1/DENY. Os registros/índices de resultados anteriores fornecem o restante da procedência; sem reexecutar auditoria ou percorrer outras custódias para nova descoberta.

### Primeiro bloqueio concreto e ação necessária

**Primeiro bloqueio de composição ainda não resolvido:** os objetos atuais da composição fixam `POLICY_SOURCE=fa113e…` em csv_contract e original_checks; root_readonly/pre_install continuam ligados à mesma origem. A política realmente preservada na R1 é `e2a5ffab807f457b4179a6981e15cbf52800cbf975bce921c31ee3a9a989860b`, original-only da recuperação aceita. Os quatro objetos foram conferidos localmente contra COMPOSITION.json; esta diferença é comprovada, não hipótese de mudança produtiva nova.

**Próxima ação local concreta:** executar, em escopo próprio, a reconciliação de predecessor já prevista em BINDING_PLAN: revisar os bytes/modelo/ações da política R1 e refletir a mesma fonte autenticada nos produtores/checkers csv_contract/original_checks, root capture/pre_install/admissão, política/instalador CAS e referências imutáveis futuras, com contraprovas de ausência/deriva/modelo. Não substituir uma constante isolada para PASS, remover imutáveis, editar composição consumida ou declarar e2a5 vigente agora. Os bytes necessários para essa análise já estão custodiados; nova captura root curta só será necessária no momento operacional apropriado. Este delta documental **não implementa** essa reconciliação.

Há ainda impedimento pré-contenção independente já conhecido: Event775 nos cinco pais observados. Se permanecer, a ida nega antes da parada. Uma correção restrita dessas permissões depende de revisão/decisão operacional própria sobre os consumidores; não está autorizada nem executada. Não ampliar a rodada para reparo ou flexibilizar o checker.

### Sequência única mínima até implantação CSV — proposta, não autorização

1. **Fechar offline as dependências de composição:** primeiro a fonte root acima; depois conferir a closure declarada do toolchain contra fontes pinadas disponíveis e a lista exata de dados/namespace dos16 vínculos. Reusar fontes, runtime, tar/provas CSV/Prisma válidos, restore certificado e retorno ORIGINAL. Não refazer builds ou repetir suítes para preencher status. Validar o delta local aplicável antes de pedir instalação; frontend já aceito não volta à investigação.
2. **Obter somente fatos operacionais residuais sob autorização própria:** saved/fallback e identidades finais, rota/container/cliente; depois SELECT identidade/fronteira/importações autorizado e atribuição ownership canônica; closure/proteção do toolchain não disponível localmente. Reconfirmar Event e decidir seu tratamento restrito antes de contenção. Observações novas têm horários/destinos próprios e não completam retrospectivamente os DENYs. Nenhuma coleta genérica ou comando novo é preparado aqui; ações consumidas não podem ser repetidas.
3. **Materialização/certificação futura após inputs suficientes:** novo namespace aprovado, perfis/configurações e16 renderizações coerentes; quatro modos/PRESTOP/ORIGINAL/CANDIDATE/DENY e dados canônicos certificados sobre bytes concretos. Fechar DAG folhas→índices→contrato→política→manifest→âncora sem autociclo. ORIGINAL dispensa executáveis candidatos, não R1/R2, dados dos quatro modos ou certificado de saída. Pacote/instalador/pins concretos precisam nova revisão; B4 INSTALL_PLAN histórico não é instalador certificado atual.
4. **Revisão e autorizações separadas:** conferência atual/CAS de cada alvo antes da respectiva instalação; instalação estática protegida/toolchain/alias/helper; instalação da âncora aprovada; emissão específica de recuperação somente quando cabível. Consulta não emite/renova; instalação não autoriza execução. Agendar janela com owner e impacto global de atendimento explícito. Só então renovar R0/RPO pelo backup.lock/custódia e conferir a fronteira do restore retido (sem fingir removido); root curto por último e CAS no uso. Não antecipar provas perecíveis agora.
5. **Execução API→frontend somente em futura janela autorizada:** pacote/prazos/CAS/admissão canônica e fronteira before PASS; contenção global→saída/ownership completos→classificação fresca das importações sem UNKNOWN/PROCESSING não resolvido→seleção→API candidata uma vez. HTTP ausente não prova saída. Antes da seleção, ORIGINAL só com estado/certificado/decisão válidos; após seleção/possível escrita candidata, retorno compatível mantém backend candidato/ledger/GET/anti-replay. Falha persistente de backend requer outra versão compatível; estado incerto consome operação e exige inspeção/decisão, sem start/SQL replay.
6. **Fronteira frontend e encerramento:** após API realmente aceita, vincular frontend às identidades reais, publicar seus hashes/política e obter decisão correspondente antes da troca. Preservar o contrato de clientes/abas antigas: POST sem UUID nega antes da admissão, sem reimportação automática; comunicar recarga/fluxo novo. Encerrar com health/DB, sessões/console/telas, ambos crons, supervisão, saved/fallback600, barreira ausente/gates falsos e aceite do owner, out.15 CLOSED/guarda38 fechada. Importação real, reparo histórico e retenção não são testes implícitos da janela.

Nenhuma etapa acima está autorizada por este texto. A implantação CSV não depende de reabrir auth/banco/cifragem, SECULT, limpeza ou rotações externas adiadas; preservar NEWauth+NEWDB+NEWcipher. O objetivo funcional original (resultado recuperável após timeout, totais/RBAC) permanece não implantado e distinto destas condições operacionais.

### Delta documental e conferência

Somente esta atualização, a matriz e seu campo JSON de reconciliação, allowlist/índice documental e três checkpoints. O registro de16/10 abaixo é preservado como histórico; seus comandos, prazos e destinos não são atuais/autorizados. MANIFEST.sha256 é índice **desta revisão documental**, não manifest de preparação/autoridade: a versão anterior permanece no Git base a60a00cb; nenhum manifest operacional foi alterado.

Sem VPS/SELECT/instalação/restart/build/coleta/pacote/backup/renovação, código modificado ou suíte repetida. Validação pertinente:57 IDs/linhas/regras intactos, referências/código/links e hashes, diff --check; simulações aceitas não promovidas. Deifson; revisão17/10/2026, próxima21/10 ou mudança. Publicação normal na mesma branch, deploy desabilitado e CI versionado restrito a main/develop. **REVIEW ACCEPTED LOCAL ONLY / CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.**

---

## Registro histórico de16/10 — não executar seus comandos


Base/parent pretendido: `617280e321bfc35d69c154ed6ef4c3e172753bc0`.
**REQUIREMENTS RECONCILED / READ COMMANDS PARTIAL / REVIEW PENDING /
NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**

## Resultado

Os57 grupos foram relacionados individualmente em [INPUT_MATRIX.json](INPUT_MATRIX.json)
e [MATRIX.md](MATRIX.md), sem preencher nenhum input. São32 arquivos de modo
(8×4),20 grupos de observações/contratos e5 de owner/root/toolchain. Não são57
capturas independentes. Os16 vínculos são quatro renderizações de namespace por
modo, derivadas do mesmo conjunto observado, não16 coletas. Não houve acesso à
VPS, backup, captura root, geração operacional, instalação ou emissão.

A [próxima conferência](COMMANDS_FOR_REVIEW.md) contém dois blocos concretos de
coleta bruta: R1 root/crons/supervisão e R2 descoberta de processos/caminhos/Event.
R3 SQL/ownership e R4 fechamento do toolchain ficam explicitamente parciais:
identificam os dados faltantes que impedem publicar argv certificado. Não é
roteiro A/B ou pacote pronto. Nenhuma coleta foi executada para descobrir se passa.

## Fontes consultadas e limites da autoridade

Branch/HEAD/remoto coincidiram com a base. Não foram encontrados AGENTS.md nos
ancestrais consultados nem no escopo documental. Consultados runbook, backlog,
índice, Change Policy e Release Checklist; relatórios R1/R2/autoridade/R3/B1–B4,
composição/ORIGINAL, BINDING_PLAN e consumidores completos do kit aceito. Referências
byte-exatas em [SOURCE_INDEX.json](SOURCE_INDEX.json); o kit não foi recomposto.

As fontes editáveis/transformações continuam nos incrementos aceitos; objetos do
static-kit são composição derivada. Nenhum código, pin, política, instalador,
manifest histórico, teste ou prova aceita foi alterado. As suítes anteriores e a
prova PM2 completa não foram repetidas: não há mudança de implementação que o
justifique. Só foram conferidos documentos, estrutura da matriz e hashes/diff.

O histórico de recuperação aceita sustenta CSV_ORIGINAL_PAIR_RESTORED e OWNER UI
ACCEPTED; identidades/ambientes/crons então conferidos são fatos históricos. Não
atesta o estado atual. A ausência de intervenção preserva NEWauth+NEWDB+NEWcipher,
reader histórico, produção, dois crons, guarda38 e out.15; não alegamos nova medida
produtiva. Segurança externa OPEN/adiamento21/10 permanece fora deste delta.

## Deduplicação e ordem mínima

1. **Reuso local por conteúdo:** composição f9a0a44a…, compiled proof/artifact24e5857f,
   runtime compatível e provas R1/R2/R3/B1–B4/ORIGINAL aceitas. Conferir hashes e
   alcance; não buildar, extrair ou restaurar por rotina. O restore certificado
   retido/parado é evidência histórica válida dentro da mesma fronteira/tooling,
   nunca RPO fresco. Não alterar temporaryDatabaseRemoved=false.
2. **R1 uma leitura agrupada:** fonte root real, helper/sudoers, cadeias e controles
   cron separados. Bibliotecas futuras e alias/toolchain devem ser inventariados
   inclusive como ausentes, sem criá-los. A consulta da autoridade futura exige
   instalação revisada; não presumir que já existe.
3. **R2 uma observação coerente por identidade:** trio ativo, boot/PID/ticks,
   configurações efetivas privadas e saved/fallback, caminhos/.data, Event e pais,
   supervisão. Os blocos publicados cobrem descoberta, não o export completo de
   ambiente. Root/proc/SQL adicionais devem ser dirigidos ao trio então identificado.
4. **R3 compartilhar o canal SQL/proxy conferido:** guard/out.15, fronteira de schema,
   baselines, importações conhecidas e ownership sem imports/retenção. Não há
   equivalência entre ausência HTTP e trabalho concluído. SELECT prévio não
   substitui saída certificada pós-contenção. Sem dados atuais, comandos finais
   de R3 permanecem não prontos.
5. **R4 fechar o mesmo toolchain:** resolver executável/interpreter/launcher PM2 e
   closure transitiva; hashes, UID/modos e cadeias protegidas. Versão sozinha não
   atesta bytes. Os16 bindings e perfis são materializados **localmente depois**,
   com novo namespace aprovado, sem promover recibos antigos a observações.
6. **Somente futura sequência coordenada:** R0/RPO/custódia se exigidos pela janela,
   root curto por último, revisão dos bytes/prazos; instalação estática, âncora,
   emissão específica se recuperação aplicável e execução são autorizações distintas.
   Não há uma renovação antecipada autorizada ou necessária nesta rodada.

## Divergências concretas e decisões de parada

- `window/original_checks.py::check_original` e `window/root_readonly.py::capture`
  do kit ainda fixam POLICY_SOURCE `fa113e…`; BINDING_PLAN registra última política
  histórica instalada `e2a5ffab…`. Isso não prova drift novo. Impede assumir que o
  coletor antigo pode certificar a fonte atual. Capturar bytes sem acionar helper,
  revisar a correspondência em delta futuro; não substituir bindings agora.
- `BINDING_PLAN.sealOrder` ainda descreve recovery_binding.py implícito. O desenho
  aceito posterior usa âncora/contexto root e distinção forward/recovery; não
  ressuscitar o produtor antigo ou gerar constantes a partir de arquivo próprio.
- `INSTALL_PLAN.json` de B4 é referência histórica de alvos, não manifest final da
  composição atual. Usar os hashes atuais dos objetos para futura revisão; não
  executar instalador antigo nem afirmar que bibliotecas já estão protegidas.
- Faltam namespace novo, perfis ativos autenticados, executáveis/transitivos reais,
  canal SQL atual e recibo/destino privado da futura transferência. Cada comando
  incompleto está marcado, sem placeholders apresentados como pronto.
- Nenhum prazo numérico único vale para os57 inputs. Permit recuperação exige
  0<=age<600s no Context; RPO <3600s pertence à admissão revisada, não ao restore.
  Identidades, seleção, consumo, Event, mapas e ownership precisam de revalidação
  no uso. Prazos root específicos de janelas antigas não foram transportados para
  uma janela inexistente. Frescor de crescimento/WAL requer intervalo datado e
  orçamento novo, não dois valores históricos arbitrários.

## Efeitos auditados, diagnóstico e segurança

`privileged.py::act('inspect')` verifica phase_read() is None. É leitura sob o
contrato pré-fase, não uma inspeção genérica de instalação/recuperação consumida.
`capture_imports.capture` verifica saída/fence e grava recibo pós-saída; seu SQL
READ ONLY não torna o produtor inteiro uma leitura livre. `check_current` depende
da autoridade/pacote, delega consumidores e pode registrar diagnóstico/invocar
cliente PM2; não é coletor de descoberta sem bindings. `root_readonly` é puro mas
pinado à fonte histórica. Retention --dry-run não foi escolhido como leitor.

R1/R2 usam utilitários de leitura explícitos; criam somente arquivos privados
novos, stdout/stderr separados e param em falha. Não executam conteúdo capturado.
Essas capturas brutas **não** são journals canônicos. B1 preserva o transporte
canônico `run_privileged`/`private_record`, byte-exato, resumo sanitizado e sem
retry; seu allowlist não será ampliado para encobrir coleta arbitrária. A ingestão
local futura reutilizará private_record após conferir transferência e destino.
Falta esse vínculo de custódia para publicar seu comando final: documentado, não
inventado como uma segunda ferramenta de diagnóstico.

Riscos residuais: leituras multiarquivo não atômicas, troca concorrente entre
observação e uso, canais parcialmente visíveis ao deploy, ferramentas/arquivos
anunciados diferentes dos consumidos e custódia ainda não efetuada. Não resolvemos
isso por interrupção de writers, permissões novas ou preenchimento oportunista.
Qualquer divergência exige parada/revisão. ORIGINAL continua independente do código
candidato, mas mantém dados dos quatro modos, R1/R2 e evidência switch. PRESTOP não
parte; fase incerta/consumida não autoriza replay ou recuperação automática.

## Publicação e alcance

Allowlist: estes6 arquivos de revisão, índice de hashes e3 checkpoints canônicos.
Nenhum perfil/binding privado, valor de configuração, dado de tenant, runtime,
local-evidence ou .data incluído. Publicação normal na branch de revisão, Vercel
deploymentEnabled=false e único workflow CI restrito a main/develop; não se altera
configuração. A conclusão se limita aos mecanismos versionados, sem alegar auditoria
de integrações externas não visíveis. SHA final/remoto será informado na resposta.

Conferências locais:57 nomes/linhas correspondem exatamente ao índice de ausentes;
fontes referenciadas conferidas por hash; dois blocos passaram somente bash -n
(sem execução); diff --check PASS;73 arquivos da revisão anterior conservam seus
hashes. Os três checkpoints canônicos recebem apenas o novo parágrafo; seus
hashes históricos não foram reescritos. Nenhuma suíte aceita foi repetida.

Responsável operacional Deifson; revisão16/10/2026; próxima21/10 ou antes de mudança.
Próximo passo: revisar R1/R2 e os faltantes de R3/R4, então autorizar separadamente
as leituras dirigidas. **Não iniciar instalação ou janela com esta entrega.**
