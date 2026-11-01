# Plano P00 — sanitização, retenção e higiene do projeto

**Status:** P00 / EXECUÇÃO LIBERADA APÓS TENDÊNCIA `DEPLOYED_SANITIZED`
**Abertura:** 30/10/2026
**Autoridade:** [princípios fundamentais](../WORKING_PRINCIPLES.md)
**Execução produtiva:** somente pelo [runbook canônico](../DEPLOY_RUNBOOK.md)

## Estado de partida

A janela Tendência encerrou em `DEPLOYED_SANITIZED`, sem repetição de build,
ativação ou retenção. O saldo relatado após a finalização foi 8.012.804.096 bytes.
Esse valor é um checkpoint histórico: cada lote deve medir capacidade e inodes uma
vez no início e uma vez no fim, sem transformar observações em novas tentativas.

O objetivo agora é recuperar capacidade sustentável, reduzir raízes/branches/PRs e
impedir que build, preparação e diagnóstico voltem a acumular resíduos sem destino.
A limpeza não autoriza excluir por idade, nome ou tamanho. Cada item recebe uma
classe e uma prova de ausência de referência antes da retirada.

## Fechamentos terminais

### Lote incremental 2026-10-31 — retornos `automation-20260929`

Estado terminal `COMPLETED`, sem autorização de repetição. A execução canônica
consumiu exatamente a intenção
`79158edad60917020df8f0a04342bc9ba4780520e845b5c7a877506c64063e2a` e dois
comandos `unlink` literais, SHA-256
`2d20972bc839fff090dedf11c641e8e3fbef34bb0fb88051ce5af14a21f54303`.
Foram retirados somente:

- `automation-20260929T220203Z/api-frontend-return.private.tar.gz`;
- `automation-20260929T220203Z/worker-return.private.tar.gz`.

O journal SHA-256 é
`7416d6b2f9de42d5a25167e3e0a49604d4e4e1503b6798b363c072158043c137` e o
receipt SHA-256 é
`466e4315a101a9225bf4a29cc3861e2a74c1beb6b704cb1232ba3525befac648`.
O ganho físico medido foi `375.603.200` bytes. A verificação posterior comprovou
os dois caminhos ausentes, produção preservada e `8.423.989.248` bytes disponíveis
após o pequeno custo da custódia. O índice de evidências SHA-256 é
`284f05514a7b1d561e81570b36240b06f3662b9429ca091f212bc2feeb371998`.

Este lote não volta para inventário, auditoria, preparação ou execução.

### Lote incremental 2026-10-31 — duplicatas `hybrid-b9`

Estado terminal `COMPLETED`, 2/2, sem autorização de repetição. Foram removidas
somente as duas cópias duplicadas literais de
`worker-minimal-b9-v3.tar.gz` nas preparações `hybrid-b9-capture` e
`hybrid-b9-absent`. A autoridade SHA-256
`236c1d502df5767eb7cde726ce0d7ae7c6e8200489cac4d09a417b08d98c0e98`
permaneceu preservada na preparação `hybrid-b9b58177-20261005T025100Z`.

O journal SHA-256 é
`4fa19906df26870468e10e93a7bae37bf56e9675543664e6fb57100784a3a5c7` e o
receipt SHA-256 é
`056573218d17556df599bb965120985cad5b004da7de22441e52316276239241`.
O ganho físico posterior medido foi `224.071.680` bytes. A verificação final
comprovou os dois candidatos ausentes, a autoridade intacta, produção e locks
preservados e nenhum efeito fora do escopo. A capacidade disponível final foi
`8.651.104.256` bytes; faltavam `1.012.572.160` bytes para o alvo agregado de
`9.663.676.416` bytes.

Os dois caminhos removidos ficam proibidos de voltar a inventário, auditoria,
preparação ou execução. Ganho estimado nunca substitui os `224.071.680` bytes
efetivamente observados no receipt.

### Histórico encerrado — tentativa `runtime-fix` negada

O escopo então classificado continha somente dois archives de retorno derivados da
preparação `runtime-fix-20260930T020103Z`. Seus hashes são reutilizados do
`backup-manifest.json` e do registro versionado
`AUTOMATION_RUNTIME_FIX_PREPARATION_2026-09-30.md`; não foram recalculados nesta
classificação:

| Caminho literal | Classe | SHA-256 registrado | Bytes físicos observados | Autoridade preservada |
| --- | --- | --- | ---: | --- |
| `/opt/re7online/backups/converta-persistent/preparations/runtime-fix-20260930T020103Z/api-frontend-return.private.tar.gz` | `RETIRE_DERIVED` / `CLOSED_PREPARATION_DERIVED_ARCHIVE` | `b39ee8b1d7f6add5634cdfc852781ce8f581840901f37dacd5cfa5f1056ea835` | 276.844.544 | release isolada `ba66c24112ccb10f2dfdcced54350f513d399bc6`, manifesto e registro versionado |
| `/opt/re7online/backups/converta-persistent/preparations/runtime-fix-20260930T020103Z/worker-return.private.tar.gz` | `RETIRE_DERIVED` / `CLOSED_PREPARATION_DERIVED_ARCHIVE` | `6faabcc7c17fc8f60463147ffe327dda358b7fc86994c07284cf782d4601ed72` | 95.993.856 | release isolada `worker-bf5f1d76-f06d49cb-91230f88-b66bb89a`, manifesto e registro versionado |

Ganho físico potencial: `372.838.400` bytes e dois inodes. Ambos são arquivos
regulares `deploy:deploy 0600`, `nlink=1`, sob a raiz canônica de preparações.
Ficaram explicitamente fora do lote `content.private.tar.gz`, `database.dump`,
`runtime-data.private.tar.gz`, `configuration.private.tar.gz` e qualquer outro
caminho. A classificação não substitui a futura recaptura de referências e
identidades por `audit`; não há autorização de `prepare` ou `execute` neste
checkpoint histórico. A negativa abaixo consumiu essa classificação; esta seção
não é roteiro vigente.

Com a capacidade final observada do lote anterior, a projeção meramente aritmética
após este próximo lote seria `8.796.827.648` bytes. Ainda faltariam `866.848.768`
bytes para o alvo agregado de `9.663.676.416` bytes, que permanece uma meta entre
lotes e não um predicado de bloqueio para cada lote incremental seguro.

#### Negativa consumida e reconciliação nominal

A classificação preliminar acima foi consumida pelo `audit` único da custódia
`p00-capacity-runtime-fix-returns-2abddc80-20261031T133937Z` e não autoriza nova
tentativa. O plano negado SHA-256
`e9ceaffcf0123432a8e897a5e2111e640cc46d79146c92de7875b81888d125ee`
registrou conjuntamente:

- `PREPARATION_ARCHIVE_PROTECTED_MATERIAL` no retorno API/frontend;
- `PREPARATION_ARCHIVE_RECORD_SCOPE` no retorno worker;
- `MINIMUM_RECOVERY_NOT_MET` como consequência agregada.

A reconciliação somente leitura, sem extração e sem recalcular os hashes integrais,
reproduziu exatamente o predicado estrutural. O retorno API/frontend contém uma
ocorrência protegida real: `apps/whatsapp-agent/.env.example`, membro regular de
1.789 bytes. Pela decisão fail-closed do owner, o archive inteiro fica
permanentemente `KEEP_PROTECTED`; não se propõe exceção para o sufixo `.example`.

O worker permanece preservado. Seu request usa
`proof.kind=VERSIONED_PREPARATION_RECORD` e o documento específico
`AUTOMATION_RUNTIME_FIX_PREPARATION_2026-09-30.md`, SHA-256
`5500f19a563907d2d33ee568644baa42d64bf50b4bc8cb37662e78d55aed8973`.
A linha 18 vincula descritivamente o hash, mas não contém conjuntamente o basename
literal e o tamanho. O documento possui na linha 32 prova genérica de que os
arquivos compactados foram testados para leitura, porém não contém o literal
canônico `` `tar -tzf` dos arquivos compactados PASS ``. Portanto, estender apenas
o allowlist de documentos continuaria negando e não deve ser implementado. Uma
futura extensão continua condicionada a registro versionado específico que
satisfaça as mesmas provas exatas, sem aceitar documento genérico ou fabricar
evidência histórica.

Resultado da reconciliação SHA-256:
`a502e814bb192db7851d6724c50ae143a1fc50bf54fd88d8d722416dc7def036`;
índice SHA-256:
`5a6cf4f4a98ec0e8f1041634d0c68396f7dbeaa33945553324f99dc00750a23b`.
Não houve `prepare`, `execute`, `unlink` ou autorização substituta.

### Lote fechado 3/3 — tentativa interrompida, correção somente local

O lote atual permanece exatamente nos archives
`worker-reactive-afbb7455.tar.gz`, `frontend-9f4cbe0f-v2.tar.gz` e
`frontend-fa60-css-corrected.tar.gz`, total físico declarado de `458.973.184`
bytes. Não há autorização para incluir quarto caminho, mudar manifesto, autoridade,
permissão, exceção ou efeito. As provas de identidade, relação e material protegido
já produzidas são reutilizáveis; não devem ser reconstruídas por hashing ou extração
integral.

A custódia
`p00-capacity-three-archives-9e251046-20261101T132910Z` terminou por sinal:
`exitCode=-15`, RSS pico do filho `1.288.294.400` bytes, pico do cgroup
`1.976.967.168` bytes e zero OOM. Não houve plano, `prepare`, `execute` ou
`unlink`; stdout/stderr ficaram vazios. Os hashes integrais do request, das duas
telemetrias e do marcador terminal permanecem no índice privado da custódia; não
foram recalculados nesta revisão local. Essa operação é terminal e não pode ser
relançada.

| Estado | Prova | Critério de encerramento |
| --- | --- | --- |
| implementado nesta revisão local | liberação de `TarFile.members`; registro SQLite binário, cache 1 MiB, disco 64 MiB; progresso limitado | diff e regressões aprovados |
| ensaiado localmente | 30.000/60.000 membros sob `RLIMIT_AS=256 MiB`, incluindo nomes longos, diretórios, symlinks admitidos e arquivos regulares com conteúdo/autoridade físicos; no máximo um `TarInfo`; resultados atualizados vinculados ao teste do PR, sem afirmar cardinalidade do archive produtivo interrompido | regressão dirigida e suite documental PASS |
| executado em produção | nenhuma fase após a tentativa terminal | somente após revisão, integração e autorização separada |
| pendente estrutural | lifecycle ainda não cobre automaticamente arquivos volumosos criados em `backups/.../preparations` | contrato de criação/owner/orçamento/retirada antes de novas preparações volumosas |

O merge `b66fc5fd0178b4dcd87e5aa4618d3a955efaa204` integrou a correção de
cardinalidade; isso não altera a terminalidade da tentativa anterior. A extensão
local seguinte resolve apenas os predicados
`RESOURCE_CONTAINMENT_NOT_IMPLEMENTED` e
`DURATION_CONTAINMENT_NOT_IMPLEMENTED` para uma futura fase `audit`: escopo
transitório cgroup v2 autenticado, limite agregado de memória, swap zero e prazo
monotônico. Ensaios locais comprovaram cadeia Python/Node/helper no mesmo escopo,
OOM real, timeout de descendente resistente e preservação de sentinela externo.
O valor de 256 MiB continua hipótese de ensaio; orçamento produtivo, integração e
autorização de nova operação permanecem pendentes. `prepare`, `execute`, o lote
3/3 e suas autoridades não foram alterados.
O fechamento local revisado separa executor não iniciado, iniciado por
`telemetry_started` e estado inconclusivo; exceção pós-lançamento nunca reutiliza
o predicado de pré-lançamento. A espera é limitada e falha de kill/confirmação
termina em `RECOVERY_PENDING`. O ensaio afetado comprovou descendente resistente
encerrado no escopo e sentinela externo preservado, sem nova tentativa produtiva.

#### Tentativa c0146133-v1 — `AUDIT_MEMORY_MAX`, terminal

A custódia `p00-capacity-three-archives-c0146133-v1` consumiu uma única auditoria
do mesmo lote 3/3, request SHA-256
`2b1d438d71af5d22dfb0c253b8595656f1ab27b59d4a910062fa07b767272f7e`.
O supervisor encerrou em `AUDIT_MEMORY_MAX`, sinal 9, pico do cgroup igual ao
limite de 268.435.456 bytes e escopo confirmado vazio. Terminal
`b62a630b4ca092b7f58a2d6d5ddcecab58deec0b559acf4925813a62d4ebd9f5`;
telemetrias `51008da92a34eff0257043068bde0fffaa2c578885b3a8737a47989d3cfb9e73`
e `f2c8ce4a8d4c8a485e1a338f491b8f44b34a22d7ec18731895c59f47730335d7`.
Plano ausente e zero efeitos.

| Candidato | Última prova persistida |
| --- | --- |
| `worker-reactive-afbb7455.tar.gz` | hash, 7.056 membros e autoridade concluídos |
| `frontend-9f4cbe0f-v2.tar.gz` | hash concluído; `before_authority_compare`; zero progresso persistido |
| `frontend-fa60-css-corrected.tar.gz` | não iniciado |

O diagnóstico local não promoveu hipótese a fato produtivo. Casos esparsos e
3.000 arquivos/192 MiB passaram com baixo pico. Um payload físico de 180 MiB,
aconselhado como frio mas sem residência inicial medida,
atingiu o teto de 256 MiB com cerca de 249 MiB em `file`, mesmo com RSS próximo de
31 MiB, e concluiu somente porque houve reclaim local. Como a tentativa produtiva
não preservou `memory.stat` nem consumo por PID no intervalo final de 27,2 s, a
composição do OOM permanece não atribuível. O orçamento de 256 MiB está recusado
para replay; qualquer proposta futura exige residência inicial, recuperação e
componentes do cgroup medidos, sem alterar candidatos ou reaproveitar esta autorização.

#### Telemetria complementar e perfil frio local

A mesma entrega local amplia apenas observabilidade: o supervisor amostra uma vez
por segundo, com limites fechados, `memory.stat`, eventos, processos do cgroup e
correlação com o executor; o autenticador emite progresso temporal limitado ao
longo de hashes/payloads/autoridades. Falha de coleta permanece visível como
lacuna e não vira completude presumida.

O perfil dirigido percorreu o autenticador completo pelo supervisor real com três
archives sintéticos próprios, sem `drop_caches` global ou bytes produtivos. A
soma de 458.973.184 bytes foi escolhida somente a partir do espaço físico
declarado do lote original; não é prova de seu volume descompactado. Os archives
sintéticos ocuparam 459.113.917 bytes lógicos. Na qualificação única, os seis
arquivos tiveram residência capturada imediatamente antes do lançamento: zero de
224.144 páginas residentes, sem lacunas ou leitura intermediária. Em 4,146 s, o
cgroup alcançou o teto de 536.870.912 bytes. Na última amostra viva, tomada no
mesmo instante, `file`, `anon`, `kernel`, shmem, dirty/writeback e RSS somado
foram 515.809.280, 19.091.456, 1.880.064, zero, zero e 30.838.784 bytes. O
terminal registrou `max=1508`, mas `high=oom=oom_kill=0`; os três candidatos
passaram sob pressão. Não se presume que todo `file` seja recuperável, e não há
amostra direta de decaimento depois que o cgroup desapareceu.

Os 128 MiB pertenciam ao orçamento de **disco da custódia**, não a uma margem
canônica de memória, e essa fórmula foi retirada. Critério atual:
`SYNTHETIC_PROFILE_512_MIB_QUALIFIED / VPS_OPERATIONAL_BUDGET_NOT_APPROVED`.
A fixture complementa — não substitui — a regressão de 30k/60k membros. A
qualificação sintética não prova o volume descompactado dos archives produtivos
nem a composição do OOM anterior. Próximo ato: revisão desta entrega. Produção e
a custódia terminal continuam proibidas para replay; qualquer operação na VPS
depende de autorização separada e orçamento representativo.

Os sucessos `automation-20260929`, `hybrid-b9`, recuperação #288 e fechamento
`fa63994a` permanecem terminais e irrepetíveis. Seus receipts, journals e hashes
continuam nas seções próprias; não são reabertos por esta correção.

O ensaio dirigido adicional encerrou um filho real por `SIGTERM` enquanto o
`ExactNameRegistry` estava aberto. O supervisor persistiu as fases
`before_child → signal_received → after_child`, `exitCode=-15`, sinal 15 e pico
RSS. Como esperado para término não recuperável, `__exit__` não rodou: permaneceu
um diretório privado `0700`, de nome exclusivo sob o pai da telemetria, com um
banco `0600` de 8.192 bytes lógicos/físicos e 4.096 nomes. A limpeza feita pelo
próprio teste ocorreu somente depois de medir e revalidar device/inode e não é
contrato produtivo. Em operação, tal resíduo permanece na custódia terminal para
inventário/classificação literal; não autoriza glob, varredura destrutiva ou retry.

#### Comparação com caminhos já comprovados

| Referência | Versão/função e prova efetiva | Trecho reutilizado sem mudança | Diferença do lote 3/3 |
| --- | --- | --- | --- |
| PR #288 | merge `9b2169d4e74c0d1c7ae5fb363f31ea753112b326`; `candidate_binding()` exclui somente `processScan` depois de `validate_candidate()` recapturar completude/referências; plano PASS `23a3d796…`, receipt `97a121df…` | projeção estável do artefato e recaptura volátil em `prepare`/`execute` | não percorreu relação tar/autoridade de alta cardinalidade |
| `automation-20260929` | `CLOSED_PREPARATION_DERIVED_ARCHIVE`, registro versionado e dois `unlink`; journal `7416d6b2…`, receipt `466e4315…` | caminho/hash/prova fechados, journal, receipt e proibição de repetição | retornos anteriores não exerceram a relação atual 3/3 com autoridades de cerca de 25 mil entradas |
| `hybrid-b9` | `proof.kind=DUPLICATE_COPY`, autoridade exata preservada; journal `4fa19906…`, receipt `05657321…` | igualdade exata, autoridade distinta, `nlink=1` e efeito literal | archive menor e prova por cópia; não exigiu manter relação completa de nomes/autoridade do lote atual |
| `fa63994a` | `converta-release.py::require_generation_reviews()` e `generation-retirement.py`; lifecycle/marker/receipt terminal `DEPLOYED_SANITIZED` | lifecycle, review, fechamento terminal e não repetição | é geração canônica; os archives atuais nasceram em `preparations`, fora desse lifecycle |

Os prefixos acima identificam hashes integrais já preservados nas seções de
fechamento e nos índices privados. A comparação não reexecutou efeitos, hashing
integral, extração ou coleta produtiva.

### Classificação somente leitura das gerações — 31/10/2026

A classificação posterior ao lote `hybrid-b9` reutilizou a fotografia operacional,
o grafo e os contratos já autenticados; não executou `capacity-recovery audit`,
`generation-retirement prepare` ou qualquer exclusão. A fotografia confirmou API
`fa63994a`, frontend `aa9527cc` e worker `e2e7f17a` ativos.

| Classe | Gerações/caminhos | Resultado |
| --- | --- | --- |
| ativa | releases `immutable-fa63994a-vps-20261030T153352Z`, `immutable-aa9527cc-vps-20261029T222733Z` e `immutable-e2e7f17a-20261022T005110Z` | protegidas por `current`/PM2/dump |
| rollback imediato | releases `immutable-754281d3-vps-20261029T174145Z` e `immutable-b96eb779-vps-20261028T025159Z` | preservar releases, pacotes, manifestos e índices |
| transação aberta ou layout transacional não reconciliado | `immutable-d436239e-vps-20261026T131821Z` e `immutable-f5028de1-20261020T181603Z` | negar retirada até fechamento/classificação do journal legado |
| dependência transitiva | demais diretórios presentes no grafo protegido | preservar; o grafo autenticado contém os 60/60 diretórios físicos de `releases` |
| histórica sem retorno comprovado | nenhuma release física | nenhuma release ficou simultaneamente fora de active, rollback, retorno transitivo, candidatas e transações abertas |
| retirável | nenhuma release física | nenhum `RELEASE_RUNTIME` existente está `RETIREMENT_READY` e fora do grafo protegido |

O inventário físico encontrou 18 diretórios sob `build-output`, em geral entre
148 e 155 MB. Os contratos fechados preservam pacote, manifesto, índice e evidência;
os runtimes derivados já aparecem `SANITIZED` ou estão fisicamente ausentes. A
geração `immutable-123ba7bd-vps-20261026T200100Z` é a única com derivados
`RETIREMENT_READY`, mas esses runtimes já estão ausentes e seu diretório contém
somente pacote/evidência preservados. Os outputs `059ea95a` e `ef3a2128` pertencem
a releases já retiradas, porém também restam apenas fontes de verdade preservadas.

Existe somente um diretório sob `build-worktrees`,
`whatsapp-meta-backfill-7339b143-source`, com `75.272.192` bytes. Ele não pertence
a uma geração de release coberta por contrato de retirada e não entra em lote sem
classificação própria.

Uma release histórica típica ocupa aproximadamente 989 MB. Somar seu diretório de
`build-output` ultrapassaria aproximadamente 1,1 GB apenas contabilizando pacote,
manifesto, índice e evidência que o contrato manda preservar; não há runtime/output
retirável que complete esse ganho. Assim, não existe lote literal canônico de uma
única geração acima de aproximadamente 1,1 GB. A próxima classificação deve voltar
às preparações grandes, por artefato literal e autoridade preservada, nunca pela
pasta inteira.

## Resultado obrigatório

1. Uma única fonte de estado atual; histórico não concorre como instrução.
2. Espaço para o orçamento real da próxima geração mais margem operacional.
3. Preparações, releases, outputs, worktrees, caches, branches e PRs classificados.
4. Todo efeito temporário nasce com owner, classe, orçamento e evento de retirada.
5. Gates previsíveis são validados juntos antes da primeira escrita produtiva.
6. Finalização terminal retira derivados e libera o lock no mesmo protocolo.
7. Toda retirada produz intenção, comandos fechados, recibo e medição posterior.

## Vocabulário fechado de classificação

| Classe | Destino |
| --- | --- |
| `KEEP_ACTIVE` | componente selecionado por current/PM2/dump |
| `KEEP_ROLLBACK` | rollback imediato comprovado e suas dependências |
| `KEEP_EVIDENCE` | manifesto, recibo, journal, índice ou prova compacta necessária |
| `KEEP_UNIQUE_DATA` | DB, configuração privada, runtime-data ou dado tenant-scoped |
| `RETIRE_DERIVED` | build-output, worktree, cache ou archive reproduzível e sem referência |
| `RETIRE_DUPLICATE` | cópia byte-identificada com autoridade preservada |
| `INVESTIGATE` | identidade, referência ou autoridade ainda inconclusiva |

`INVESTIGATE` nunca é sinônimo de removível. Preparações não são apagadas como
diretórios inteiros: payload derivado pode ser retirado enquanto recibos, DB,
configuração, runtime-data e evidência tenant-scoped permanecem protegidos.

## Sequência de execução

### Lote 1 — inventário único e orçamento

- congelar novos builds fora de P00 até recuperar o orçamento real;
- capturar uma única fotografia de bytes, inodes, current, PM2, dump, locks, grafo,
  transações abertas e processos com referência;
- enumerar por device/inode e bytes físicos, evitando somar hardlinks duas vezes;
- produzir tabela por caminho com classe, autoridade, referência, bytes, inodes e
  ação; não fazer hashing integral quando manifesto autenticado já responde;
- definir o ganho mínimo do lote pela diferença entre capacidade atual e orçamento
  da próxima geração, acrescida da margem operacional versionada.

### Lote 2 — derivados e duplicados de menor risco

Priorizar somente itens já comprovados por manifesto, começando pelos maiores ganhos:

- conteúdo repetido entre `automation-20260929` e `runtime-fix-20260930`;
- conteúdo/runtime repetido entre `night-20260927` e `migration`;
- archive repetido entre as duas preparações `hybrid-b9`;
- retornos repetidos dentro de `freeform-window-af26`;
- worktrees, runtimes e caches terminais não selecionados por grafo.

A cópia autoritativa é nomeada antes do plano. DB dumps, runtime-data, configuração
privada e dados de tenant ficam fora dos comandos.

Archives individuais derivados dentro de preparações usam exclusivamente a classe
`CLOSED_PREPARATION_DERIVED_ARCHIVE` do control plane de capacidade. A classe não
remove diretórios e admite somente os basenames fechados de retorno de runtime,
com registro versionado/cópia autoritativa autenticados e `unlink` literal. Lotes incrementais
podem recuperar parte do alvo, mas o receipt deve medir o ganho físico real antes
de qualificar o lote seguinte.

### Lote 3 — releases e preparações históricas

- classificar releases como ativa, rollback imediato, dependência transitiva,
  histórica sem retorno ou retirável;
- exigir que current, PM2, dump, transações, rollback e grafo não referenciem a
  candidata;
- separar evidência compacta de payload derivado;
- executar em lotes pequenos, com capacidade medida após cada receipt;
- interromper ao atingir o orçamento e a margem; limpeza não é pretexto para ampliar
  o escopo destrutivo.

### Lote 4 — Git, branches, worktrees e PRs

| Objeto | Prova antes da ação | Ação permitida |
| --- | --- | --- |
| Worktree verdadeiro | alterações locais e arquivos não rastreados inventariados | preservar; nunca limpar implicitamente |
| Worktree isolado | commit incorporado ou branch preservada, sem trabalho único | retirar pelo mecanismo Git |
| Branch remota | commits alcançáveis pela canônica ou PR supersedido comprovado | excluir somente após registro |
| PR aberto | conteúdo incorporado, substituído ou ainda necessário | merge, fechamento fundamentado ou permanência |
| Raiz documental | autoridade atual, links e validador | consolidar; histórico vira registro, não runbook |

PRs conhecidos para decisão: #286 deve consolidar o estado final; #291 deve ser
revisado como melhoria de retomada de pacote, sem confundi-lo com necessidade da
release já concluída. Nenhuma branch é removida apenas porque está antiga.

## Controles preventivos obrigatórios

### Antes de construir

Uma admissão somente leitura deve validar em conjunto:

- capacidade real, pico temporário, reserva e inodes;
- modos/owner/hashes do control plane;
- schema produzido contra os consumidores reais;
- `observations.pm2.fingerprintSha256`;
- paridade de symlinks entre produtor, índice e comparador;
- estado e protocolo do `deploy.lock`;
- destinos exclusivos e ausência de geração parcial incompatível.

A fixture de CI deve atravessar materialização → retenção prepare → preflight. Teste
unitário de cada script isolado não qualifica a fronteira.

### Durante o build

- um build por release; output e temporários vinculados ao lifecycle;
- compressão publica checkpoints retomáveis;
- perda de transporte não autoriza rebuild enquanto o produtor puder concluir;
- temporários usam raiz dedicada, orçamento e estado terminal explícito;
- nenhum build usa runtime ativo ou o worktree verdadeiro.

### No fechamento

- aceite decide finalize ou rollback; não abre nova geração;
- exatamente um `pm2 save` quando aplicável;
- retenção consome apenas a intenção já selada;
- lock terminal é removido sob o mesmo protocolo autenticado;
- derivados da geração terminam em `SANITIZED` ou dívida nominal com owner e prazo.

### Operação contínua

- alertas por dois níveis: aviso antes do orçamento e bloqueio antes do piso;
- relatório por geração: pico, saldo final, bytes/inodes criados e retirados;
- política de retenção por classe, não por cron/idade cega;
- artefatos duráveis candidatos a armazenamento externo com lifecycle e verificação;
- meta: um build por release, zero negativa produtiva por contrato conhecido, zero
  efeito repetido e 100% das gerações com fechamento e receipt.

## Patinadas desta janela convertidas em regressão

| Falha observada | Controle permanente |
| --- | --- |
| leitura `/proc` incompleta | observador privilegiado fechado e autenticado |
| symlink válido classificado como `other` | comparador comum e regressão produtor/consumidor |
| `processScan` volátil mudou candidato | identidade estável separada de observação fresca |
| alvo de espaço excedeu orçamento por poucos MB | orçamento e meta adicional são decisões distintas |
| snapshot sem fingerprint PM2 | materializador validado pelo consumidor real |
| lock terminal residual | criação, hold e remoção testados como um protocolo |
| SSH caiu após compressão | lifecycle retomável; observar antes de reconstruir |
| `ok=false` sem causa nominal | evento sanitizado com subpredicado obrigatório |
| CI modular verde e fronteira quebrada | teste integrado da transição completa |

## Critério de encerramento

A frente termina somente quando:

- orçamento e margem estão satisfeitos sem contar ganho estimado como ganho real;
- cada caminho analisado possui classe e autoridade;
- todos os lotes executados têm receipt e zero remanescente não explicado;
- branches/PRs/worktrees estão reconciliados sem perda de trabalho local;
- runbook, estado atual, lifecycle e validadores concordam;
- controles de admissão e fechamento possuem regressão ponta a ponta;
- a próxima geração normal pode seguir do início ao fim sem adaptação manual entre
  fases conhecidas.

Até lá, o backlog funcional pode ser analisado, mas novos builds normais não devem
competir com esta frente P00 por disco ou por mudança de control plane.
