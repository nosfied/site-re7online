# CRM/CSV — reconciliação dos inputs e próxima conferência

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
