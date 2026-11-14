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

#### Tentativa 3950b67c-v1 e guard do membro raiz

A operação única seguinte usou o mesmo lote 3/3, control plane
`3950b67c01c10f9a3db84a06f51d45b023d9e527`, custódia
`p00-capacity-three-archives-3950b67c-v1` e request
`1d0ad4d9dae5e21bb65ea2c7150b3ddc36570e804a9c07cb83022676aa92d762`.
Terminou `AUDIT_MEMORY_MAX` no teto de 512 MiB, `oom=1`, `oom_kill=2`, sinal 9,
scope encerrado, plano ausente e zero efeitos. O primeiro candidato chegou a
`after_tar_scan` com 7.056 membros; o 9f4 parou em
`before_authority_compare`; fa60 não iniciou. A custódia e o request são
terminais e proibidos para replay.

| Evidência | SHA-256 |
| --- | --- |
| terminal | `9cca7e1bc6f8176f2c97e1bff941e887a4483bc997db6983c9b0b8b7ff3f3034` |
| telemetria do executor | `3240fb4dc6cdc141269e23cb0d9d568926354c7606a4977ac0d684165db22064` |
| telemetria do supervisor | `ab4f7caa183003c9ec9148f8b3b36e6e4053e93aacc4f87af50c78663c2035f1` |
| índice privado | `4995c169c57f70cd2c2771f6f439a32bfc8544dcf6c63f2ebea8228426d309a9` |

O diagnóstico local reproduziu, no autenticador real e sob timeout de cinco
segundos, um loop anterior para membro normalizado `.`. O percurso partia de
`root.parent`, ultrapassava a autoridade e permanecia em `/` quando todos os
owners intermediários eram admitidos. A correção mínima autentica a própria raiz
somente quando o membro raiz é diretório, prova confinamento antes de subir e
nega tipos diferentes, escapes, autoridade `/` e duplicatas de `.`, `./.` ou
`./`. Digest determinístico e autoridades intactas são regressões explícitas.

Os registros/listagens versionados do 9f4 não revelam o membro raiz nem o comando
de criação. Logo, a falha do percurso é fato reproduzido; atribuí-la ao archive
produtivo ainda seria inferência. Nenhum payload produtivo foi relido para
resolver essa diferença. A próxima etapa permitida é somente revisão do patch;
não há autorização renovada para `audit`, `prepare` ou `execute`.

Os sucessos `automation-20260929`, `hybrid-b9`, recuperação #288 e fechamento
`fa63994a` permanecem terminais e irrepetíveis. Seus receipts, journals e hashes
continuam nas seções próprias; não são reabertos por esta correção.

#### Tentativa terminal 916f8d6b-v1

O PR #303 foi integrado no merge
`916f8d6b4e8696c821c40eec910dbca39449a319`; sua árvore
`38fd61326d494a1d312a723653bfaee10d92a12d` é idêntica à do HEAD testado
`e75c48280c1e56bd96e497e59acc21107a45bf31`, coberto pela CI `41343829157`
4/4 PASS. A auditoria única da custódia
`p00-capacity-three-archives-916f8d6b-v1`, request
`113abf0a6f770d6353abfc1fb7479134e599b329f572d0fdd409fe3819f73c15`,
foi consumida por negativa de binding antes de classificar qualquer archive.

| Evidência | SHA-256 |
| --- | --- |
| estado operacional materializado | `fd2c68d8d0889cc55799695f55225495b4c6cf2136f3a151b93fd0e731ed0d96` |
| SHA antigo ainda vinculado pelo request | `6641d581af300cd81f13ba3febffef377e4f78feb40ede7d82d886994953ea6c` |
| terminal | `4ab144e806a8ea8ec43d013f40a6479c9d95bd557917ce51493697b3d944bdec` |
| telemetria do executor | `7235a80d617eaa1aa25df8828798a26c2ddb657083fc3bd2a71ea9dd75ed24b5` |
| telemetria do supervisor | `d41fde756979d9b340243d39bef0439a263b18613575fa1bc4be6abffc86596e` |
| índice privado | `d2902c27a570e4a9e7d69e3278eb4ad2b3180b1a576b6fc2930a7b0a8130ce6f` |

Predicado: `FILE_SHA256:operational-state.schema2.private.json`; exit code 2;
scope encerrado e zero plano/efeito. Os três candidatos e autoridades continuam
presentes, e PM2, current, dump, guarda, health e locks foram preservados. Essa
operação não produziu resultado de elegibilidade 3/3 e não pode ser repetida.

#### Auditoria corrigida 916f8d6b-v2

A v1 conservou o hash antigo porque o request foi derivado de template antes de
o estado operacional final ser autenticado. A v2 não transportou esse binding:
finalizou `operational-state.schema2.private.json`, confirmou
`7c719d20eb94a7df6c2e6ac92eacfb38407eebc97d7a9c3f2158dc92039dbda5`,
gerou o request e só o selou após readback integral dos bindings. Request
`4cfaab66119ea9f06c96e26781d40fc5be158442a7ac0baa4386326b5b4c1c6e`;
conferência `d53ca8c9094f7c249614de2db5c3d50ff8747b90a37d543c6ed9bf85e948a863`.

O audit único passou 3/3 e qualificou `458.973.184` bytes/3 inodes, plano
`502cc4b7213f9db745ceb88bf3df13adcfeab27a1f243313962d6c97ca53abf5`,
sem executar efeitos. Disponível antes `8.391.720.960`; projetado
`8.850.694.144`; mínimo incremental satisfeito e alvo agregado ainda não.
Terminal `f4792439…`, telemetrias `2454a7f5…`/`7b1fdd1e…`, índice
`5b2635c2…`. A produção permaneceu inalterada (`e5327224…`), os três candidatos
e autoridades seguem presentes e a custódia parou antes de `prepare`/`execute`.
O resultado é prova reutilizável, não autorização destrutiva.

O plano `502cc4b7213f9db745ceb88bf3df13adcfeab27a1f243313962d6c97ca53abf5`
foi consumido byte-exatamente por um único `prepare` contido por 512 MiB, swap
zero e prazo monotônico. Audit e prepare não devem ser repetidos. Intenção,
comandos e manifesto selados permanecem imutáveis na custódia; o leitor autentica
somente a primeira linha limitada da telemetria e eventos posteriores não
invalidam a prova de início. Nenhum `execute` ou efeito foi realizado por essa
transição.

A revisão local seguinte estende somente o supervisor canônico para iniciar
`execute` no mesmo scope contido de 512 MiB, swap zero e prazo monotônico. O
executor permanece a única autoridade de locks, journal, receipt e efeitos. O
supervisor lê evidência existente sem repará-la: journal sem `ATTEMPT` comprova
zero efeitos, receipt íntegro reconcilia falha ou sucesso e qualquer efeito não
integralmente reconciliado termina `RECOVERY_PENDING`. Não há replay automático,
receipt sintético ou regeneração da intenção selada. Regressões com caminhos
sintéticos cobrem 3/3 completo, drift sob locks, contenção indisponível,
interrupções antes/depois do primeiro efeito e sentinela externo. Esta entrega é
somente código/teste/documentação para revisão e não autoriza `execute` produtivo.

O PR #305 foi integrado no merge
`4e85ff75048ad428137d3497292f0906927c2cd2`, árvore testada
`5f42de235ad9936ab8eaa23cd050a3fb421e0f2e`. A única autorização posterior
materializou SHA-256
`6bfaa944a4d3bb2701a6949d5cd7811bf90fb22578949b85ce22f2a5a80e3d48`
e iniciou `execute` uma vez. A recaptura sob locks encerrou antes de qualquer
`ATTEMPT` com
`EXECUTE_RECAPTURE_DENY:DISPOSITION_MANIFEST_FIXED_BINDING`. Receipt
`0e9631f8…`, journal `9a2762bc…`, terminal `63da1875…` e recaptura
`cc82ebf3…` ficam preservados na custódia
`p00-capacity-three-archives-4e85ff75-execute-v1`. Resultado terminal:
`FAILED_RECONCILED`, 0/3 tentados, 0/3 concluídos, os três archives presentes e
zero ganho físico. Capacidade posterior `8.388.939.776` bytes; nenhuma nova
classificação ou exclusão foi iniciada. Não reutilizar autorização, intenção ou
receipt para replay.

Diagnóstico dirigido: plano e intenção apontam para o manifesto da custódia de
audit `916f8d6b-v2`, SHA `b2b5bff4…`. Prepare-v2 executou a partir desse control
root. Execute materializou o mesmo executor `fa323125…` em outro control root;
por derivar `ROOT` de `__file__`, calculou outro caminho absoluto para o
manifesto. O SHA histórico permaneceu igual, mas o caminho calculado divergiu e
o arquivo não existia na nova localização. Prepare-v1 já havia exposto a mesma
incompatibilidade ao relocar executor/manifesto; prepare-v2 usou o root original,
mas a lição não foi aplicada à materialização do execute.

Correção mínima vinculada ao PR #306: audit segue fixo ao manifesto local;
recapturas posteriores reabrem apenas o binding exato previamente autenticado e
selado, ainda preso ao SHA compilado, layout canônico e raiz de preparações.
Teste integral sintético usa três localizações físicas e nega drift de caminho,
SHA e escopo antes de qualquer efeito. Autorização `6bfaa944…` e receipt
`0e9631f8…` permanecem terminais; não há autorização de replay.

Fechamento sucessor: o PR #306 foi integrado no merge `04a9650d…`, com árvore
idêntica ao HEAD testado `42e4dee8…`. A custódia exclusiva
`p00-capacity-three-archives-04a9650d-prepare-successor-v1` reutilizou o plano
PASS `502cc4b7…`, produziu intenção `b3b1e7f7…`, preservou a tentativa anterior
e consumiu uma única autorização `2330c848…`. O executor concluiu exatamente os
três `unlink` já selados: receipt `6662af79…`, journal `b13da490…`, terminal
`24455815…`, 3/3 verificados e ganho físico real de `458.964.992` bytes. Os três
archives estão ausentes; as três autoridades, a produção, o dump, o grafo, a
guarda operacional e os locks foram preservados. O saldo do receipt foi
`8.846.487.552` bytes; a medição final, após as evidências, foi
`8.846.467.072` bytes e `8.727.609` inodes disponíveis. O lote está encerrado,
é irrepetível e não autoriza qualquer caminho adicional.

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

### Continuidade dirigida — 04/11/2026

O grafo final da geração ativa `785bde80` ainda acumula sete entradas em
`rollbackReleases`; a prova de ativação aponta somente `911a9708` como retorno
imediato de API e frontend. A correção local versiona essa distinção por componente
sem retirar papéis antigos por omissão: reconciliação autenticada continua sendo a
única saída de uma aresta histórica. Depois de estabelecido o binding, qualquer
papel excedente bloqueia a próxima ativação antes de efeitos; portanto a lista não
pode continuar crescendo silenciosamente entre ativações.

O primeiro grupo dirigido não produziu lote destrutivo fechado. `0fdec`, `708f`,
`754` e `fa639` têm dados privados; `911a` é rollback imediato; `b96` já foi
retirada e não pode ser reaberta. `aa952` mede 989.552.640 bytes e não apresentou
overlay na leitura dirigida, mas a cadeia moderna completa de lifecycle/review não
foi localizada e o volume isolado não cobre o déficit com margem. Estado nominal:
`NO_CLOSED_BATCH / AUTHENTICATED_CLOSURE_OR_MARGIN_MISSING`. Não executar nova
admissão nem retirada com base nessa classificação.

Em paralelo, a prevenção de `preparations` passa a negar a chamada direta do
produtor API/frontend: somente report/contrato/FD emitidos pela admissão integrada
habilitam `copy`/`tar`. Reuso, `OPEN`, `SANITIZED` e `RETENTION_DEBT` continuam no
lifecycle existente. Essa prova é local; adoção produtiva permanece pendente.

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


## Decisão consolidada após o fechamento 3/3 — 01/11/2026

Fonte: relatório do Codex local encaminhado pelo owner; sem nova inspeção da VPS
pelo editor desta consolidação. As medições abaixo são checkpoints históricos,
não saldo reservado para uma futura operação.

Saldo final registrado: 8.846.467.072 bytes. Diferença para o alvo agregado de
9.663.676.416 bytes: 817.209.344 bytes. Esse alvo não substitui o orçamento real
da próxima geração nem o piso normal de build. Lotes incrementais seguros não
precisam cobrir integralmente esse déficit: respeitam seu mínimo próprio e medem
o ganho real antes da decisão seguinte.

### Acervo pendente reutilizado — identificação resumida, não comandos

| Artefato | Bytes físicos registrados | Estado/impedimento |
| --- | ---: | --- |
| worker-package-audit | 365.674.496 | REVIEW READY / NOT QUALIFIED: contrato separado fecha candidato, autoridade, `PACKAGE_FILES.sha256`, relação de 11 links, identidades históricas e observador literal; percurso sintético materializado `audit → prepare → execute` passa e negativas de path/hash/identidade/link/referência/dependência passam. A futura qualificação produtiva continua sendo uma única fase `audit` contida, com identidades, referências, locks e equivalência folha a folha frescos; nenhuma retirada autorizada |
| runtime-fix/api-frontend-return.private.tar.gz | 276.844.544 | KEEP_PROTECTED permanente pela decisão existente sobre material protegido; não reabrir como candidato |
| frontend-3227b2d7.tar.gz | 184.074.240 | NOT_QUALIFIED; ancestral 0775 continua impedimento material |
| night/candidate.tar.gz | 102.604.800 | NOT_QUALIFIED; autoridade física esperada ausente |
| night/recovery-standalone.tar.gz | 102.477.824 | NOT_QUALIFIED; autoridade física esperada ausente |
| runtime-fix/worker-return.private.tar.gz | 95.993.856 | Pendente de registro histórico com escopo/evidência exatos; não fabricar prova retrospectiva |

Os três itens potencialmente qualificáveis somam 645.742.592 bytes, ainda
171.466.752 bytes abaixo do déficit registrado. Potencial não é autorização nem
recuperação comprovada. Não há hoje um conjunto comprovadamente retirável que
cubra o déficit integral; isso não cria uma nova exigência de tamanho mínimo
igual ao déficit para cada lote.

### Plano histórico de qualificação de `worker-package-audit`

O audit posterior encerrou em DENY. Consulte a decisão de 06/11 abaixo.

Escopo único: candidato
`/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb7455-20261006T010000Z/window/worker-package-audit`
e autoridade preservada
`/opt/re7online/releases/worker-minimal-reactive-afbb7455-verified`. O request
schema 3 deverá conter um único candidato, `incrementalBatch=true`,
`minimumRecoveryBytes=365674496`, `targetAvailableBytes=9663676416`, o manifesto
específico autenticado e o helper
instalado a partir do mesmo merge. A fotografia operacional, o SHA do request e
o diretório de Node no `PATH` são necessariamente materializados e reabertos na
janela; não são antecipados neste plano versionado.

Custódia proposta:
`/opt/re7online/backups/converta-persistent/preparations/p00-capacity-worker-package-audit-<merge12>-v1`, privada `0700`, com orçamento máximo de 128 MiB. A fase usa
`MemoryMax=536870912`, `MemorySwapMax=0`, timeout monotônico de 1800 segundos e
graça de cinco segundos. O comando canônico, depois do readback do request, é:

```text
/usr/bin/python3 -B <custody>/control/scripts/capacity-recovery-supervisor.py --stdout-output <custody>/audit.stdout.private.txt --stderr-output <custody>/audit.stderr.private.txt --terminal-output <custody>/audit.terminal.private.json --telemetry-output <custody>/audit.telemetry.private.jsonl --supervisor-telemetry-output <custody>/audit.supervisor-telemetry.private.jsonl audit --request <custody>/audit-request.private.json --request-sha256 <REQUEST_SHA256_FROM_STABLE_READBACK> --plan-output <custody>/audit-plan.private.json --containment-output <custody>/audit-containment.private.json --memory-max-bytes 536870912 --timeout-seconds 1800
```

A operação futura para na primeira divergência de binding, identidade, relação,
referência, helper, PM2/health/guarda/lock, contenção, prazo ou capacidade; para
também imediatamente após o `audit`, mesmo em PASS. Não há pré-comparação do
payload, `prepare`, `execute`, autorização ou efeito nesta habilitação.

Arestas d436239e (ROLLBACK_DEPENDENCY) e f1602787 (ACTIVE_DEPENDENCY), ativos,
retornos imediatos e dependências transitivas continuam preservadas. Não remover
arestas para fabricar elegibilidade. Uma necessidade de rever a retenção exige
prova e decisão próprias; documentos antigos não são referências vivas por mera
conveniência, nem ausência de uso presumida autoriza retirada.

### Delta estrutural da cadeia de releases — implementação local para revisão

O produtor fixed-current acumulava rollbacks por união, mas removia de
`activeReleases` todas as releases encontradas no snapshot anterior, inclusive
componentes fora de uma ativação API-only. O consumidor também podia classificar
uma `RELEASE_RUNTIME` fora do grafo como `RETIREMENT_READY` sem consultar dado
privado descendente. O delta local corrige ambos os pontos: promoção por componente
e proteção fail-closed do diretório-pai de `PRIVATE_DATA_NEVER_RETIRE`.

A reconciliação proposta não reescreve journals nem elimina arestas por idade. Um
request fechado enumera cada geração e autentica contrato, lifecycle, cadeia de
journals, review e receipt. O journal incompleto de `708f` exige sucessor terminal
compatível; `d436`/`f160` preservam o journal JSONL e o receipt legado. A saída é
um grafo sucessor, uma projeção schema 2 e receipt sem efeito; o consumidor deriva
novamente a projeção e nega omissões. Rollback imediato é provado por componente
no runtime manifest e no journal e não pode ser fechado. `708f`, `d436` e `f160`
ficam condicionalmente elegíveis somente após suas
provas e recaptura; `0fdec` e `a959` permanecem protegidas pelos overlays. Ativos e
rollbacks imediatos permanecem protegidos. Os 2.965.995.520 bytes são potencial
calculado, não ganho qualificado, não medição fresca e não autorização de retirada.

Estado desta entrada: código/regressões/documentação em checkout isolado; nenhuma
publicação de grafo, migração de overlay ou operação na VPS.

#### Reconciliação operacional v4 — negativa terminal em 02/11/2026

A custódia privada
`p00-release-graph-reconciliation-99c1ef24-v4` autenticou o merge
`99c1ef24bd4d6fe7043d60ad378aca0ba59ce03f`, selou o request
`307391aa1c38d8529efaf98b5184e5f89b5ee4b645a29cef027cc707befab127`
e executou uma única reconciliação não destrutiva. O consumidor negou antes de
publicar grafo, projeção ou receipt com
`release_reconciliation_dependency_still_open`.

A causa nominal é a presença física de
`immutable-708f018c-vps-20261027T152109Z/api-runtime/.data`, observada como
diretório `0755`, device/inode `64769:2699461`. Mesmo sem artefato
`PRIVATE_DATA_NEVER_RETIRE` enumerado no contrato antigo, o consumidor protege
fail-closed o diretório-pai quando o overlay canônico existe. Portanto `708f`
permanece papel protetor e sai do escopo de fechamento. `0fdec` e `a959`
continuam preservadas pelos vínculos privados já autenticados.

A estimativa anterior de `2.965.995.520 bytes` para três releases não é mais
potencial elegível. Pelos tamanhos físicos já registrados, o potencial restante
de `d436` e `f160` é `1.977.225.216 bytes`. A sucessora pode avaliar exclusivamente `d436` e `f160`,
sem autorização de retirada e somente após validar integralmente closures,
contratos, lifecycle, reviews, seleção ativa, rollbacks imediatos, referências
vivas e classificação privada. A v4 é terminal e não pode ser reapresentada.

A primeira materialização sucessora, v5, parou no preflight antes de selar o
request porque o estado operacional não carregava `canonicalRoots`, exigido
pela autenticação dos receipts legados. A v6 vinculou as raízes diretamente aos
estados históricos autenticados de `d436/f160`, validou integralmente as duas
closures e publicou uma reconciliação sem efeitos. Request
`bb96c4cd33766ab283cd430afa37542e5f5ed243ead00be0b8618e410de4e930`,
grafo sucessor `4c110fb56afd97a9414a458aaa2c0e2a1bbada7aaf3369585e3f0e4cf1331425`,
projeção `a4d317e838e1333c0064bc5b41edc3e58c816705397b427f8e106b9dd613c4b3`
e receipt `d3d90d2a2577a93a3e3ff8e94428169dc8a64bb557d97d9851446c32c8ce2865`.
Somente `d436/f160` deixaram os papéis históricos; `708f`, `0fdec`, `a959`,
ativos, rollbacks imediatos e dependências restantes permaneceram protegidos.
O consumidor integrado aceitou a projeção. O grafo produtivo não foi
substituído; o resultado continua sem autorização de retirada.

A montagem dos prepares sucessores foi versionada em
`generation-retirement-prepare-materialize.py`. Além do readback criptográfico,
ela reabre o request v6 original e todos os seus bindings antes do manifesto
final, exige que receipt, projeção e grafo sucessor concordem e vincula cada
fotografia/contrato exclusivamente à geração reconciliada correspondente. A
regressão usa o produtor real da reconciliação, atravessa o consumidor da
projeção e os dois entrypoints reais de `prepare`; grafo operacional diferente,
geração omitida e drift de contrato ou fotografia permanecem negativas.

Próximo ato: usar o inventário existente para fechar impedimentos concretos e
dimensionar o ganho possível, juntamente com a proposta preventiva em
[DEPLOY_ARTIFACT_LIFECYCLE](../DEPLOY_ARTIFACT_LIFECYCLE.md#extensão-preventiva-proposta--preparações-volumosas-01112026).
Nenhum novo audit, prepare, execute, mudança de permissão ou retirada é autorizado
por esta classificação documental.

#### Fechamento terminal d436 — 02/11/2026

A release `immutable-d436239e-vps-20261026T131821Z` foi retirada uma única vez
pelo `generation-retirement.py execute`, depois da reconciliação v6 sem efeitos e
da fotografia sucessora que derivou `deploymentState=SUPERSEDED` do receipt
`HISTORICAL_EVIDENCE_ONLY` e do grafo sucessor autenticado. A intenção permaneceu
byte-exatamente em
`11018393db431f1ee9ad43b329fed6bd9c3bb7cdb05d610f210319f59a068c5b`.

O fechamento canônico é `SANITIZED`: receipt
`b638b25a20823acfbc0797c0bdca037edf95e9d214578022c0c1d703c503ed5c`,
journal `525ab03b5b414a90bc6e8703597f1c7d7953cbfa192a9e17cd00225dfeba975c`
e review terminal
`11a301e4b266994eac124e54eadd0ae5178002a4e1f5d50f59672b948e4ffb52`.
O validador `_canonical_retirement_closure()` relacionou `ATTEMPT`, `RESULT` e
`VERIFIED` pelo ordinal `5`; o evento `VERIFIED` canônico contém `absent=true` e
não contém `path`. O único caminho aprovado está ausente.

O ganho líquido medido foi `988.528.640 bytes`, de `8.768.180.224` para
`9.756.708.864 bytes`, com `34.350` inodes líquidos recuperados. API `fa63994a`,
frontend `aa9527cc`, worker `e2e7`, PM2, dump, grafo sucessor e lock canônico
permaneceram inalterados. Esta retirada é terminal e irrepetível: não repetir
reconciliação, `prepare`, autorização ou `execute` para d436.

#### Fechamento terminal f160 — efeito histórico preservado e zero efeitos novos

A autorização v3 permaneceu congelada e byte-exata. A autorização v4
`ada9e96f3eb20c6c08fb943bc0898cf2dff9058b5a146c4cea42e6a4edf5bc04`
foi consumida uma única vez. O único comando removeu com sucesso
`immutable-f1602787-vps-20261026T174702Z`; `ATTEMPT`, `RESULT exitCode=0` e
`VERIFIED absent=true` estão registrados no journal
`905737bfb83042f6e0d98c37a4576adb5819e9cd45ebe074ba5ea1b0568648d2`.

O executor negou na inspeção posterior porque o artefato subordinado
`frontend-runtime/.next/cache`, classificado `WITH_PARENT_RELEASE_ONLY`, ficou
fora de `removedPaths` depois de desaparecer junto com o pai. O receipt
`36d0d69fbb22a920fcbd7e6c38bceae0ab0532368943e174c537900cf9aeb26b`
é `QUARANTINED`, com review
`610d43815c145dea7c57308e8d25f07bd604b88120b45cc638288611f513e690`.
O consumidor canônico retornou `release_reconciliation_closure_incomplete`.

O fechamento sucessor não reclassifica ausência genérica. Ele admite somente o cache
literal já emitido no contrato f160, com `retirableOn=WITH_PARENT_RELEASE_ONLY`,
confinado sob a única `RELEASE_RUNTIME` do mesmo release/target. O pai precisa
estar em `completed` por prova canônica do journal e receipt parciais; pai e cache
precisam continuar ausentes. Ausência isolada, vínculo divergente, caminho fora do
pai ou política diferente negam.

O intent sucessor
`371c585f59f550be44575bcbc3d9101d5383d491b98b41d4ba5185e152890d3a` selou
`commands=[]`. A autorização
`a8080e4a92cde71dd1b0bc1219ea4a4ac04ff28b5c3795198ef16955ebf7bc90` aprovou
zero caminhos. A execução sucessora terminou `SANITIZED` com receipt
`cf89aee59cd499a421b71321b79619e0c9f7c57e8449db640ee67e37c566e3a8`, journal
vazio `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` e review
terminal `4663caa1a25594a5868cf4257d56a1f8a3063d179498066247ba0c9aac654816`.
`_canonical_retirement_closure()` aceitou as duas ligações; a validação sanitizada
tem SHA-256 `1739c4956d2aa1558648a7563dc176a2ca3482d526304561caa7a29c6ceb02f8`.

O receipt terminal conserva a verdade histórica: um comando concluído e
`removedPaths` somente com a release-pai. A fase sucessora tem zero comandos
destrutivos e registra o cache exclusivamente em `subordinateAbsences`. Receipt,
journal, autorização consumida e cópia da review parcial originais permanecem
byte-exatos. O fechamento recuperou zero bytes adicionais. O ganho líquido medido
continua `988.590.080 bytes` em f160 e totaliza `1.977.118.720 bytes` com d436.
Ambas as retiradas são terminais e proibidas de replay.

O fechamento deste lote não instala a frente preventiva. A rota versionada agora
liga a admissão ao produtor materializado: report, contrato e input são reabertos e
o mesmo FD autenticado cria o artefato somente depois de registrar orçamento e
`OPEN`; `review-preparation` faz o fechamento terminal. A cobertura é da rota
canônica e da `reservationRoot`, não de escritores históricos/manuais nem do
filesystem inteiro. Adoção produtiva permanece pendente e exige janela própria.

## Escopos grandes ainda abertos e lote adicional b96 — 03/11/2026

A análise originalmente solicitada permanece aberta para as seis gerações
`d7de6453`, `3630e16`, `ec2a9fde`, `ef7db111`, `a62da468` e `5c339b2e`.
Nenhuma conclusão sobre essa cadeia deve ser inferida da classificação abaixo;
seus inventários, contratos e provas já preservados serão reutilizados sem nova
varredura global ou hashing antecipado.

Uma leitura dirigida de outra cadeia identificou, separadamente, a release
`/opt/re7online/releases/immutable-b96eb779-vps-20261028T025159Z` como lote
adicional condicionado, com `988.815.360 bytes` físicos estimados. Na fotografia
de qualificação, a release estava presente (`64769:1121166`, `deploy:deploy 0755`),
não aparecia em current, PM2 live ou dump e não possuía `api-runtime/.data`. Naquele
estado ainda integrava `rollbackReleases` por união histórica no grafo 911a e não
estava qualificada enquanto esse papel não fosse reconciliado pelo consumidor
canônico.

O pacote de revisão versionado em
[B96_RELEASE_GRAPH_RECONCILIATION_REVIEW_2026-11-03.json](../releases/B96_RELEASE_GRAPH_RECONCILIATION_REVIEW_2026-11-03.json)
fixou contrato, lifecycle, review, fechamento de retenção, linhagem frontend-only
b96 → aa952 e seleção ativa 911a. Esse pacote inicial permanece histórico e não
consumível; a operação posterior usou custódias sucessoras e bindings autenticados.

A reconciliação posterior encerrou somente o papel histórico b96 no grafo sucessor,
sem substituir o grafo produtivo e mantendo ativos, worker, aa952/fa639 como
rollbacks imediatos, overlays privados e dependências não reconciliadas protegidos.
Seu receipt, projeção e grafo sucessor foram consumidos pela preparação separada.

A reconciliação b96 foi concluída sem efeitos e permanece irrepetível. A custódia
de preparação `p00-generation-retirement-b96-d662e503-v3` consumiu uma única fase
`prepare`, encerrada em `DENY` antes de intenção ou comandos: o materializador não
encaminhou a closure histórica pelos argumentos `--prior-intent`, `--prior-receipt`
e `--prior-journal`, e o executor encontrou ausente o worktree já retirado pelo
fechamento frontend-only 3/3. Review anterior, grafo sucessor, projeção e receipt
permaneceram byte-exatos; não houve autorização nem efeito destrutivo. Essa custódia
é terminal e não pode ser reapresentada. A continuação exige o materializador
versionado autenticando e encaminhando a evidência anterior; somente uma custódia
sucessora, após integração e revisão própria, poderá executar novo `prepare`.

A custódia sucessora v4 encaminhou a evidência histórica pelos argumentos
`--prior-*`, reconheceu os três efeitos anteriores e selou exatamente um comando
novo, limitado à release b96. A autorização
`b5d0b0037eb23a84828ac9445f285deeea65dd8fc6a1b39ff534992a9104a8c1`, owner
`Deifson Oliveira`, foi consumida uma vez. A execução terminou `SANITIZED`, com
receipt `15aa21e258fd2fea42ff6ca49041d581d644b049e55db0864821fe0b038629a6`,
journal `a129f919897d87cdb9b21ba6098e39a09df65940421f4203613301b420afa0b7`
e review `4b1c5a2bc32b22418e2761b35b3b4bce9ca07628a10e9bb4ce74a21f9599c7b4`.
`_canonical_retirement_closure()` validou os dois elos sob SHA-256 normalizado
`73feb66a4ebecfc27bcf54b17f407d2486afdc9857124d044b7d1a03df4e5154`.

O ganho físico efetivo foi `988.491.776 bytes`, não os `988.815.360 bytes`
estimados: o saldo passou de `9.268.555.776` para `10.257.047.552 bytes`.
Produção, pacote, manifesto, índice e evidências foram preservados. O sentinel
`deploy.lock` permaneceu autenticado, físico e livre em `64769:803457`, modo `0600`,
SHA-256 `d7cf1d3c2596891ad8208fd6fdd2c8b4ca2028738a51217bc30dfaec8fe99535`.
Esse lote é terminal e proibido de replay. A margem de `593.371.136 bytes` sobre o
gate remove somente o bloqueio de capacidade observado e não autoriza o build da
campanha. A cadeia principal de seis gerações continua aberta.

## Árvores CRM ea3/d41 — prova local no fluxo canônico (04/11/2026)

O grupo mede historicamente `1.299.951.616 bytes`, mas permanece com **zero bytes
qualificados**. Os caminhos fechados são:

- `/opt/re7online/releases/crm-csv-front-ea3d2788-20261016`;
- `/opt/re7online/releases/crm-csv-front-return-d41ddd64-20261016`.

Archives, manifests, índice e receipt preservados são autoridades da equivalência;
ativações posteriores não são tratadas como prova de que essas árvores foram
selecionadas. A adaptação indispensável autentica essa relação no
`capacity-recovery.py`. Observação de processos, classificação de transações,
recaptura sob locks, autorização, journal e receipt permanecem os controles
canônicos existentes — a implementação duplicada inicialmente no
`generation-retirement.py` foi retirada.

O ensaio local autentica os dois candidatos exatos, nega drift e material
protegido, e demonstra `audit` aprovado seguido de `prepare` negado quando uma
transação aberta passa a referenciar a árvore. Nenhuma intenção é selada nesse
caso. Referência externa e observação incompleta também negam pelo consumidor
canônico. O helper aceita somente os dois caminhos literais adicionais.

Nenhuma retirada na VPS foi executada ou autorizada. A qualificação produtiva
depende de fotografia/request próprios, helper autenticado, recaptura completa e
medição física vigente; somente então os efeitos literais poderão ser revisados.

O primeiro audit produtivo não chegou a essa avaliação: a custódia recebeu o
grafo rico `785bde80` no caminho reservado à projeção e terminou
`LIVE_RELEASE_GRAPH_SCHEMA`, sem plano ou efeito. Helper e prova privada
permaneceram válidos; request e fotografia são terminais. A projeção schema 1
usada por lotes antigos também não é reaproveitável, pois classificava todo o
inventário instalado como protegido e bloquearia nominalmente `ea3` e `d41`.

A correção local versionada mantém as árvores no inventário e vincula uma nova
projeção schema 3 ao caminho/SHA do grafo rico. O consumidor real reabre a fonte e
rederiva inventário e proteção antes da avaliação: papéis operacionais omitidos ou
adicionados, binding divergente e drift negam. Regressões atravessam o audit CRM e
comprovam que entradas apenas inventariadas chegam à autenticação, enquanto a
omissão de um ativo nega antes de chamar o autenticador das árvores. Isso ainda
não qualifica bytes na VPS nem autoriza outra janela.

O binding também é autoridade no executor: schema 3 direto só é aceito para o
lote literal `ea3/d41` e para o caminho/SHA canônicos do grafo final `785bde80`.
Uma fonte substituta com SHA válido e projeção coerente é negada antes da
autenticação dos candidatos. O ganho qualificado permanece em zero até um audit
produtivo próprio.

### Fechamento produtivo do lote CRM (05/11/2026)

O lote literal `ea3/d41` concluiu `audit → prepare → execute` na custódia
`p00-capacity-crm-staging-audit-dc0405e3-v2`, com autorização por fase.
O plano `84c3d53a9b19fd62c4ab2d835eb7a45eb4ca803db7f124287fe4e08bb76236bf`
qualificou 1.299.951.616 bytes e 52.358 inodes. A execução terminou
`COMPLETED_RECONCILED`, exit 0, com dois comandos concluídos, sem retry.

- Receipt SHA-256 `301786a3de76f8061d66f705e408a7db30d504a4848e753ca02861d8abf7fe53`.
- Journal SHA-256 `d440b319412322d8944b4602d2ca478d246737aface4ee5b114c0f6aa9d19b9a`.
- O journal confirma `ATTEMPT → RESULT(0) → VERIFIED(ABSENT)` para cada árvore.
  Os links ativos de API e frontend permaneceram intactos e os locks ficaram livres.
- Ganho físico medido de 1.299.939.328 bytes. Pós-check de 10.066.833.408 bytes
  e 2.461.819 inodes disponíveis, com folga observada de 403.156.992 bytes
  sobre o gate de 9.663.676.416 bytes.

A autorização foi consumida e o lote é irrepetível. O saldo é histórico.
Fonte documental: [PR #344](https://github.com/nosfied/site-re7online/pull/344).

## Reconciliação dirigida de `deploy-control` — 06/11/2026

Esta rodada exclui integralmente `ef7db111-prep` e preserva seu manifesto, plano
DENY e resultado terminal. A enumeração física dos demais filhos literais de
`/opt/re7online/deploy-control` totalizou **2.142.552.064 bytes**: os 34 filhos
literais somam `2.142.547.968` bytes e o diretório-pai, que deve permanecer, ocupa
`4.096` bytes. Nenhum processo
visível tinha CWD, executable ou FD nessa raiz; `current` selecionava somente a
release `17cc77a8`, e o dump PM2 não continha a raiz. Isso não transforma uma
referência histórica em ausência de obrigação de custódia.

O resultado da qualificação é **0 bytes**. Vinte e um worktrees Git limpos somam
`1.344.856.064` bytes e são reproduzíveis pelos commits abaixo, mas nenhum receipt
terminal preservado vincula simultaneamente operação, raiz do controle e commit.
Dez worktrees somando `796.655.616` bytes contêm cache Python ou controles privados
não rastreados. Três cópias parciais sem registro Git somam `1.036.288` bytes. A
mera limpeza Git, o receipt terminal da operação principal ou uma referência a
`driver-commands` não substituem o binding ausente.

| Caminho literal | Bytes | Operação/autoridade | Conteúdo único ou evidência | Receipt terminal e referências | Decisão |
| --- | ---: | --- | --- | --- | --- |
| `/opt/re7online/deploy-control` | 4.096 | raiz canônica compartilhada | namespace dos controles | não é candidato | preservar |
| `/opt/re7online/deploy-control/059ea95aaf73` | 75.571.200 | worktree limpo `059ea95aaf73f3e143774d60a8fef4df88c7c0ba`; API-only 059 | nenhum untracked | comandos referenciam a raiz; receipt não a vincula | bloqueado |
| `/opt/re7online/deploy-control/0d532f0b33ed` | 74.960.896 | worktree limpo `0d532f0b33edef1612477fdc1ccedf6879aae74f`; bootstrap a959 | nenhum untracked | três fotografias referenciam a raiz; sem closure da raiz | bloqueado |
| `/opt/re7online/deploy-control/17cc77a8f120` | 76.976.128 | worktree limpo `17cc77a8f1200ed970097c9c83444e4cad874a1a`; target ativo | fontes reproduzíveis, mas commit ainda é autoridade da release ativa | sem receipt de disposição da raiz | preservar |
| `/opt/re7online/deploy-control/35c583cb942d` | 74.530.816 | worktree limpo `35c583cb942d1c9aca7c0ed9fcaf214da8f23dde` | nenhum untracked | apenas inventário histórico do registro Git | bloqueado |
| `/opt/re7online/deploy-control/3870e6d140af` | 73.252.864 | worktree limpo `3870e6d140afbeb510403b5cf7806751c4f7abb7` | nenhum untracked | apenas inventário histórico do registro Git | bloqueado |
| `/opt/re7online/deploy-control/3a87c7e095fa` | 73.768.960 | worktree limpo `3a87c7e095fa72c2aee1ba26649a5376610d0370` | nenhum untracked | apenas inventário histórico do registro Git | bloqueado |
| `/opt/re7online/deploy-control/411a17be2a5d` | 74.559.488 | worktree limpo `411a17be2a5de67156392eb223de3988b9ac106c` | nenhum untracked | apenas inventário histórico do registro Git | bloqueado |
| `/opt/re7online/deploy-control/436ef22b4a1a` | 75.026.432 | worktree `436ef22b4a1a5fb61c770f04f9b9fa73234d3f77`; bootstrap 123ba | `scripts/__pycache__` não rastreado, derivado mas não reconciliado | intenção/fotografia referenciam a raiz; sem closure | bloqueado |
| `/opt/re7online/deploy-control/4ddecdeb3950` | 536.576 | worktree limpo `4ddecdeb395033c6166f85ee4c935673500c17b5`; prepare d436/f160 | subconjunto rastreado reproduzível | request referencia a raiz; receipt terminal não a vincula | bloqueado |
| `/opt/re7online/deploy-control/4fc959814794` | 77.017.088 | worktree `4fc9598147946ee29a3bd4d6564516383e1bfc9a`; finalização 785 | `private-control/converta-deploy.py` | finalização terminal da release não dispõe a raiz | preservar evidência |
| `/opt/re7online/deploy-control/5ea7fa45a369` | 74.121.216 | worktree `5ea7fa45a3693a14bdbf1d9d0a464dd61423b4ad`; Meta app-id/template media | `scripts/__pycache__` | deploy documentado, sem receipt da raiz | bloqueado |
| `/opt/re7online/deploy-control/5fc17306be9e` | 557.056 | worktree limpo `5fc17306be9e77c8ecf10bc9d4a5705d1a377509`; prepare b96 | subconjunto rastreado reproduzível | request referencia a raiz; closure b96 não a vincula | bloqueado |
| `/opt/re7online/deploy-control/6e10975e5f28` | 73.252.864 | worktree limpo `6e10975e5f289cb4fedee98d7366f526be6e799c` | nenhum untracked | apenas inventário histórico do registro Git | bloqueado |
| `/opt/re7online/deploy-control/6f0d741581da` | 73.248.768 | worktree limpo `6f0d741581da17130c848c06a7c4c20d9b7e6848` | nenhum untracked | apenas inventário histórico do registro Git | bloqueado |
| `/opt/re7online/deploy-control/7e968da706c3` | 74.027.008 | worktree limpo `7e968da706c39560b4c42673f21aae57833dc4e0` | nenhum untracked | apenas inventário histórico do registro Git | bloqueado |
| `/opt/re7online/deploy-control/8af6ba2659e1` | 74.559.488 | worktree limpo `8af6ba2659e19171220d26d2f69790c4b89b9025` | nenhum untracked | apenas inventário histórico do registro Git | bloqueado |
| `/opt/re7online/deploy-control/90f04d8f2e47` | 73.850.880 | worktree limpo `90f04d8f2e47e0cd87c43bb8c26ff1cf33a1098d`; template-media UX | nenhum untracked | deploy documentado, sem receipt da raiz | bloqueado |
| `/opt/re7online/deploy-control/9441de5a5692` | 376.832 | cópia parcial sem `.git`; admissão frontend-only | `scripts`/`config` sem autoridade integral registrada | request de admissão referencia a raiz | preservar |
| `/opt/re7online/deploy-control/9e2510466064` | 76.017.664 | worktree limpo `9e25104660642ce72bfe289e41320a6d12c804bd`; archives 3/3 | nenhum untracked | operação 3/3 terminal, mas receipt `6662af79…` não vincula a raiz | bloqueado |
| `/opt/re7online/deploy-control/a23aded85dba` | 114.069.504 | repositório isolado `a23aded85dba52aef2679a02adf19451c02f48ed`; 0fdec finalize | dois drivers privados não rastreados | requests referenciam a raiz; sem disposição própria | preservar evidência |
| `/opt/re7online/deploy-control/aa9527cc39ae` | 266.240 | cópia parcial sem `.git`; admissão aa952 | `scripts`/`config` sem autoridade integral registrada | request referencia a raiz | preservar |
| `/opt/re7online/deploy-control/b1689394feb2` | 74.559.488 | worktree limpo `b1689394feb27bb92487896dbee21f34e70b53d5`; frontend-only | nenhum untracked | múltiplas ativações e inventários referenciam a raiz; sem closure própria | bloqueado |
| `/opt/re7online/deploy-control/b61e42035c0d` | 73.891.840 | worktree `b61e42035c0d32b988ea89e481db8a76a6b0047f`; PM2 control | dois `__pycache__` não rastreados | apenas registro histórico; sem receipt da raiz | bloqueado |
| `/opt/re7online/deploy-control/bd83b8b537ed` | 75.075.584 | worktree limpo `bd83b8b537ed8363ddbdceaeb31447972e6e315a`; fixed-current 708f | nenhum untracked | manifests referenciam a raiz; sem closure própria | bloqueado |
| `/opt/re7online/deploy-control/c206959c131f` | 77.131.776 | worktree `c206959c131fee6131ab1afe0b3c0b85b51a8f9b`; finalização 17cc | `private-control/converta-deploy.py` | release terminal, mas controle privado continua evidência | preservar evidência |
| `/opt/re7online/deploy-control/ccb8f00ca785` | 77.029.376 | worktree `ccb8f00ca7850a5f6cfc6c6ee8aaac7fd7e51fac`; finalização 785 v3 | `private-control/converta-deploy.py` | release terminal, sem disposição da raiz | preservar evidência |
| `/opt/re7online/deploy-control/cff6ca956bb1` | 75.563.008 | worktree `cff6ca956bb190cc6b5cd7fc60b03ffa58006494`; finalização 754 | driver privado de finalize | requests referenciam a raiz; sem closure própria | preservar evidência |
| `/opt/re7online/deploy-control/d2ae1395b701` | 76.890.112 | worktree `d2ae1395b701a4a6b0756a2c58c6e03e33561860`; finalização 911a | `private-control/converta-deploy.py` | release terminal, sem disposição da raiz | preservar evidência |
| `/opt/re7online/deploy-control/d662e503ffff` | 557.056 | worktree limpo `d662e503ffffc2d49a67721349a25609aa820cc6`; prepare b96 v3 | subconjunto rastreado reproduzível | request referencia tentativa DENY; sem closure da raiz | bloqueado |
| `/opt/re7online/deploy-control/da2cd8fbb8b6` | 74.559.488 | worktree limpo `da2cd8fbb8b67b7021b64c9b5467b9166adf129c` | nenhum untracked | somente inventário histórico | bloqueado |
| `/opt/re7online/deploy-control/f5b056cd9cbb` | 393.216 | cópia parcial sem `.git`; tentativas archives | `apps`/`scripts`/`docs`/`config` sem autoridade integral registrada | requests terminais/negados não dispõem a raiz | preservar |
| `/opt/re7online/deploy-control/f8a6f948a1da` | 74.469.376 | worktree limpo `f8a6f948a1daeef5d38e9c97445fcf9e9e647a1c` | nenhum untracked | somente inventário histórico | bloqueado |
| `/opt/re7online/deploy-control/fa63994acd56` | 75.915.264 | worktree `fa63994acd5655bd499a328679a0f8c11e0740e2`; finalização fa639 | driver privado de finalize | release terminal, sem disposição da raiz | preservar evidência |
| `/opt/re7online/deploy-control/fe40c54e5d55` | 75.964.416 | worktree limpo `fe40c54e5d5504fe51dd27c22455f15eca2a9ea3`; manifesto de archives | nenhum untracked | requests referenciam a raiz; receipt 3/3 não a vincula | bloqueado |

Não foi publicado perfil `CLOSED_DEPLOY_CONTROL_DERIVED_TREE` para esse estoque:
o contrato atual continua fechado aos quatro derivados ef7, e ampliar a allowlist
sem receipts vinculados fabricaria a prova ausente. O déficit conservador do build
permanece `1.601.449.984` bytes.

### Prevenção para novos controles isolados

Os diretórios históricos não nasceram de um materializador único: há worktrees
administrativos e cópias parciais criados por procedimentos operacionais distintos.
Novos worktrees passam a usar `deploy-control-worktree-materialize.py`, que reutiliza
`preparation_artifact_lifecycle.py`: grava `OPEN` antes de `git worktree add`, fixa
repositório/commit/tree/caminho/orçamento e mantém a disposição
`SANITIZE_AFTER_USE`. O consumidor fechado `consume` copia somente controles
rastreados e pinados para custódia privada, nega conteúdo não rastreado ou ignorado,
grava o receipt da operação, executa
`git worktree remove` sem força e, após comprovar ausência física e no registro
Git, emite o receipt terminal que fecha `SANITIZED`. Drift, conteúdo único ou
falha com a árvore presente fecham `RETENTION_DEBT`; estado aberto ou dívida
bloqueiam uma alocação equivalente antes do próximo worktree volumoso. Essa prova
não altera a classificação de zero bytes do estoque histórico.

## Decisão operacional vigente — 06/11/2026

O relatório operacional encerrou a seleção em
`DENY_BEFORE_AUDIT / NO_ADMISSIBLE_NONTERMINAL_BATCH`, com 0 B qualificados.
O inventário de origem foi reaberto pelo SHA-256
`f9acb9a9c51aa78f76d6c9820dbc18b8f5ba853980a916427d62d540da65b728`.
Nenhum request, plano ou intenção novos foi produzido.

| Escopo | Disposição |
| --- | --- |
| CRM `ea3/d41` e lote de três archives | Terminais e irrepetíveis, com receipts preservados. |
| `worker-package-audit` | Audit v5 terminal `DENY` por `DISPOSITION_TREE_DIRECTORY_IDENTITY`, plano `57eda79930ec4f24dcc56bccd6f46e9996f3855386264267d80b8071d18302ea`. |
| `ef7db111-prep` | Audit terminal `DENY`; resultado parcial sem autorização de retirada. |
| Worktrees históricos de `deploy-control` | 0 B qualificados; #352 cobre somente novos worktrees. |
| `build-output` | Os runtimes d7 são efeitos terminais autenticados; os demais runtimes derivados já encerrados permanecem irrepetíveis. Pacotes, manifestos, índices e evidências residuais continuam preservados. |

#### Decisão contratual sucessora de `worker-package-audit` — 14/11/2026

O audit v5 e seu plano terminal permanecem imutáveis e não serão repetidos sem
delta material. A leitura dirigida já existente confirmou raiz, ancestrais e
autoridade e enumerou 1.023 diretórios internos `deploy:deploy 0775`. O contrato
atual autentica as folhas e os 11 links, mas não sela uma política de diretórios
que permita distinguir esse conjunto literal de uma árvore genericamente
gravável por grupo. O estado anterior era
`CONTRACT_DELTA_REQUIRED_BEFORE_REAUDIT`; o delta fechado foi implementado e
foi revisado no HEAD `d65a8f0a…`, árvore `954217f2…`, com CI
`43614190415` 4/4. O estado é `CONTRACT_DELTA_REVIEWED_MERGE_READY`, ainda sem
qualificação produtiva ou autorização destrutiva.

A menor alteração admissível fica restrita à disposição
`p00-worker-package-audit-afbb7455-v1`: relação canônica dos diretórios derivada
dos caminhos já selados; modo `0775` permitido apenas para `deploy:deploy` com o
grupo contendo exclusivamente `deploy`; readback e revalidação em `audit`,
`prepare` e `execute`; locks e observação privilegiada com zero referências e
writers. Relação extra/ausente, owner/grupo/modo divergente, principal adicional
no grupo ou drift entre fases deve negar. Os efeitos continuam sendo somente
`unlink` e `rmdir` literais; não se admite `chmod`, prefixo livre, `rm -r` ou
exceção global. As regressões dirigidas e a suíte integral 154/154 passaram,
incluindo drift em `prepare`/`execute` e mudanças concorrentes de diretórios e
folhas. A próxima ação é integrar esse único delta no consumidor existente.
Somente após autenticar o merge cabe um novo audit contido e somente leitura.
Nesta decisão ocorreram zero efeitos produtivos ou destrutivos, e a manutenção
PM2 do worker segue em frente separada.

As seis gerações com análise aberta na seção de 03/11 são escopo de
reconciliação documental. Reaproveitar inventários, contratos e receipts para
identificar um artefato literal ainda presente, sua autoridade preservada,
a lacuna de evidência resolúvel e a classe admitida pelo executor vigente.
Sem candidato qualificado, o build de `36b94c6d` continua bloqueado pelo gate
de capacidade.

### Piloto documental d7 — efeitos terminais e entrada `RELEASE_RUNTIME`

Leitura dirigida em 06/11/2026, sem request, `audit`, `prepare` ou alteração da
VPS. O receipt
`/opt/re7online/backups/converta-persistent/retention-receipts/p00-capacity-recovery-9b2169d4-20261030T121840Z/execution-receipt.private.json`,
SHA-256 `97a121df8fab427ada569652c7d9f45ee04fe4d9a5c93c032daa65dfd1b817f8`,
foi reaberto com o journal `command-journal.private.jsonl`, SHA-256
`9baa07a07f14bdc00e2c62d1374547dd41e8ed534d6968ed554d346e596dc338`.
O vínculo terminal é exato:

| Ordinal | Efeito autenticado | Bytes físicos selados | Resultado |
| ---: | --- | ---: | --- |
| 2 | `/opt/re7online/build-output/immutable-d7de6453-vps-20261024T221500Z-producer/immutable-d7de6453-vps-20261024T221500Z/frontend-runtime` | 645.029.888 | `ATTEMPT → RESULT(0) → VERIFIED`; ausente e irrepetível |
| 3 | `/opt/re7online/build-output/immutable-d7de6453-vps-20261024T221500Z-producer/immutable-d7de6453-vps-20261024T221500Z/api-runtime` | 337.100.800 | `ATTEMPT → RESULT(0) → VERIFIED`; ausente e irrepetível |

Os dois efeitos somam 982.130.688 bytes. O ordinal 1 do mesmo receipt pertence ao
cache npm e não compõe a geração d7. O output-pai permanece com 154.484.736 bytes
e conserva pacote, manifesto e índice; não é candidato integral. O fechamento do
worktree d7 pertence ao lote conjunto d7/3630. A custódia original e seu formato
legado, localizados depois desta primeira leitura, são reconciliados abaixo sem
converter o receipt incorporado em journal canônico.

`PROTECTED_TRANSITIVE` era a classificação da fotografia do inventário
`f9acb9a9c51aa78f76d6c9820dbc18b8f5ba853980a916427d62d540da65b728`.
No grafo vigente
`/opt/re7online/backups/converta-persistent/deploy-transactions/immutable-17cc77a8-vps-20261104T141039Z-api-frontend-c206959c-v3-once/generation-release-graph.final.private.json`,
SHA-256 `ceff32cf664d14382b0209a30ac556012c2cd2a484d5039d04fa2f1c14f47224`,
d7 consta somente em `installedVerifiedReleases`. Não consta em ativo, rollback,
rollback imediato, retorno transitivo ou candidato. Preserva-se a negativa do
reconciliador de grafo: uma entrada d7 nega em
`release_reconciliation_entry_identity`, pois não há papel operacional aberto a
encerrar. Isso não transforma inventário em elegibilidade de retirada.

O verificador canônico `converta-release.py`, SHA-256
`da62e006cb92d3409cb042971611fcd1849a193fd7fda1645972ebce9f634973`,
foi executado em leitura sobre
`/opt/re7online/releases/immutable-d7de6453-vps-20261024T221500Z`. A verificação
estrita negou em `forbidden_release_entry:frontend-runtime/.next/cache`; a
comparação dirigida subsequente esclareceu integralmente o delta sem flexibilizar
o verificador:

- 34.349 entradas do índice: zero ausentes e zero divergências de tipo, modo,
  tamanho, SHA-256 ou destino de symlink;
- 30.922 arquivos, 880.051.412 bytes lógicos, foram conferidos pelo hash do índice;
- dez extras, todos confinados a `frontend-runtime/.next/cache`: seis diretórios
  `0755` e quatro arquivos `0644`, 30.176 bytes lógicos e 61.440 bytes físicos;
- zero extras fora do cache, zero symlinks extras/absolutos/escapando da release e
  zero nomes extras associados a `.data`, ambiente, sessão, autenticação,
  credencial, uploads ou banco; `api-runtime/.data` está ausente;
- a release mede 988.606.464 bytes físicos. Pacote, manifesto, índice, marker e
  release conservaram as identidades autenticadas.

Essa prova classifica todos os extras observados como cache derivado, mas não
supre o primeiro pré-requisito do consumidor. A entrada direta de
`RELEASE_RUNTIME` exige `generation-artifacts.private.json`,
`generation-lifecycle.private.json` terminal e `generation-review.private.json`
no output canônico. d7 preserva o contrato específico
`d7-capacity-binding-contract.private.json`, SHA-256
`6b9234fb9cc20050f946c0728e59d2aee358d5207d1402a934622387a8409f81`,
que autentica os runtimes derivados, mas contém somente `schemaVersion`,
`releaseId`, `targetCommit` e `artifacts`; não possui `generationId`, estado,
writer lock, classes, política privada ou lifecycle exigidos pelo contrato de
geração. Os três arquivos canônicos estão fisicamente ausentes.

A custódia histórica do worktree foi posteriormente localizada em
`retention-d7-3630-worktrees-ready-20261025` e autenticada por um leitor legado
fechado no consumidor existente. O leitor fixa o lote conjunto, os caminhos e
HEADs de `3630e16` e `d7de6453`, e os hashes dos cinco originais:

- intenção `3042455be0f8d0900245c4e63844d5814589ae44e5b2cb3f30057ec609f4bf48`;
- comandos literais `5d7d6e85d0d850d11b8a612817f1f2a2867acfc8362d9736878d1e5ac9b541e4`;
- receipt final `a5afecb03bdce97e03fde35597f9f92ef30a70055cbc9d1e763d1655ef431f72`;
- prova do lock `1793b9a3d91842d4431339bc9b951f09de4133938a128e3f806e4931516b9679`;
- manifest final `23adcdac759beecf7370ea9c1aea3b8f909a1db2cba6f9daa8458216b857ec02`.

O formato antigo não possui journal JSONL. O receipt incorpora o log terminal dos
dois comandos. A prova derivada autentica somente o efeito histórico do worktree
d7 no índice 2 (`exitCode=0`, caminho ausente e registro Git ausente), registra
`3630e16` apenas como membro obrigatório do lote e concede zero autorização ou
comando destrutivo. Os originais privados permanecem fora do Git. Os runtimes d7
dos ordinais 2 e 3 continuam vinculados separadamente ao receipt `97a121df...` e
ao journal `9baa07a0...`; não foram reexpressos pela closure do worktree.

O consumidor copiado fora do checkout aceitou os originais e emitiu uma closure
derivada com zero efeitos novos. Fixtures sanitizadas negam hash, caminho, HEAD,
comando, baixa incompleta do registro Git, resultado incompleto e lote divergente.
A entrada isolada de `RELEASE_RUNTIME`, contudo, ainda para no primeiro gate
`private_read:generation-artifacts.private.json`: o contrato canônico não existe.
Lifecycle e review permanecem consequentes a esse primeiro bloqueio. Os dez extras
de `frontend-runtime/.next/cache` continuam confinados e integralmente classificados
pela comparação de 34.349 entradas, mas não são automaticamente dispensáveis: a
política vigente só admite a classe subordinada de cache para f160. Assim, o
veredito permanece `DENY_BEFORE_PREPARE / GENERATION_CONTRACT_MISSING`, com o
fechamento do worktree agora autenticável, potencial físico da release ainda
condicionado e ganho qualificado de 0 B.

#### Veredito reproduzível da geração instalada

O contrato antigo `d7-capacity-binding-contract.private.json`, SHA-256
`6b9234fb9cc20050f946c0728e59d2aee358d5207d1402a934622387a8409f81`, autentica
somente os runtimes derivados. A comparação com `validate_contract()` termina em
`artifact_contract_schema`: faltam `generationId`, estado terminal, writer lock,
classes, política privada e as métricas/identidades exigidas para a release
instalada. Ele não pode ser promovido por mudança de nome ou preenchimento de
campos presumidos.

As fontes Git preservadas sustentam parte, mas não toda a cadeia:

- o registro d7
  `TEMPLATE_ADMIN_SYNC_ORDERING_2026-10-24_DEPLOYED.json`, SHA-256
  `3babb512086e6233a996e80ea5477855986a22177fc489f1d429f36fbd6043dd`,
  vincula release, target, pacote, manifesto, índice, marker, componentes e
  retornos anteriores;
- o registro sucessor a959
  `CAMPAIGN_AVAILABILITY_MEDIA_ADMISSION_2026-10-26_DEPLOYED.json`, SHA-256
  `c0d702aabd0e3caa1d8044671de07bd1f355985fd34b3d6bb457c146a708abb6`,
  declara d7 como predecessor de API e frontend e publica os hashes do receipt
  `3567a10a...f353dc8` e journal `991d549a...e0804240`;
- entretanto, o próprio registro d7 declara `privateEvidence.versioned=false` e
  `locationPublished=false`, e o registro a959 atribui sua proveniência a relato
  do owner, sem inspeção independente. Os bytes originais do receipt/journal de
  ativação a959 e um lifecycle privado d7 vinculável não estão na custódia local
  identificada. Hashes publicados sem os arquivos não permitem executar os
  leitores existentes nem autenticar a sucessão por componente.

Uma fixture com contrato canônico, lifecycle terminal e fotografia observada — d7
somente em `installedVerifiedReleases`, fora de ativo, rollback, retorno transitivo
e candidato — produz exatamente um comando `RELEASE_RUNTIME` com
`eligibilityAtPrepare=RETIREMENT_READY`. A mesma entrada com o contrato histórico
nega antes da classificação. Portanto, o grafo não é o bloqueio; a provenance da
geração é.

Não foi criado bootstrap d7. A fonte capaz de resolver a lacuna é a custódia
autenticada dos bytes originais do receipt e journal a959 já publicados por hash,
somada ao lifecycle privado d7 original; alternativamente, uma decisão contratual
versionada teria de autorizar explicitamente uma derivação a partir dos registros
Git, sem apresentá-la como lifecycle histórico. Até uma dessas provas existir,
review nova não pode legitimar contrato/lifecycle ausentes. Os dez extras de cache
continuam preservados; a exceção específica f160 não foi generalizada.

Nesta rodada, a medição física reutilizada da release é 988.606.464 bytes, incluindo
61.440 bytes dos dez extras de cache. Bytes qualificados: 0. Bytes efetivamente
recuperados: 0. Os efeitos terminais anteriores do worktree e dos runtimes permanecem
contabilizados separadamente e não foram somados de novo.

#### Busca dirigida da ativação a959 e próximo piloto — 07/11/2026

A busca somente leitura partiu dos hashes completos publicados pelo registro a959,
SHA-256 `c0d702aabd0e3caa1d8044671de07bd1f355985fd34b3d6bb457c146a708abb6`.
Os originais da ativação, distintos do par de retenção usado pelo descriptor legado,
foram localizados em
`/opt/re7online/backups/converta-persistent/deploy-preparations/immutable-a959129e-vps-20261026T023100Z-activation-v7-20261026`:

- `finalization-receipt.private.json`, SHA-256
  `3567a10a165af03377ce912ed44f7628646a33cdfb33c70ffc597f926f353dc8`;
- `window-state.private.json`, SHA-256
  `991d549a1bc7f93b88cd1b51e1fdafaef13162555e20eac2b2471566e0804240`.

Ambos são regulares `deploy:deploy 0600`. O receipt e o estado concordam em release,
target, estado terminal `DEPLOYED`, aceite, dump, marker, guarda e único `pm2 save`.
O campo chamado `journalSha256` no registro versionado referencia o estado terminal,
não um journal de eventos. Os dois arquivos privados não contêm os predecessores.
A sucessão de API e frontend por a959 é vinculável somente pelo conjunto: o registro
Git publica os dois hashes e declara d7 como `previousApiReleaseId` e
`previousFrontendReleaseId`, enquanto os originais autenticam a ativação terminal
conjunta. O leitor canônico atual não admite diretamente esse formato pré-canônico;
o descriptor a959 existente autentica outro par, pertencente à retenção, e não deve
ser reutilizado para representar a ativação.

O lifecycle privado d7 não foi recuperado. Uma primeira enumeração de nomes retornou
`/opt/re7online/build-output/immutable-d7de6453-vps-20261024T221500Z-producer/generation-lifecycle.private.json`,
mas a abertura imediata terminou em `ENOENT`. Releituras do pai e buscas pelo release
ID em arquivos `*lifecycle*.json` não localizaram o arquivo; portanto essa observação
volátil não é evidência autenticada. Foram consultadas, de forma dirigida, as raízes
`deploy-transactions`, `preparations`, `retention-receipts`, `deploy-preparations`,
`deploys`, `simple-activations`, `build-evidence`, `audits`, `read-only-audits`,
`build-output` e `deploy-control`. O veredito d7 permanece
`DENY_BEFORE_PREPARE / GENERATION_CONTRACT_MISSING`: a ativação sucessora está agora
localizada, mas não substitui o contrato/lifecycle original da geração.

O inventário autenticado
`f9acb9a9c51aa78f76d6c9820dbc18b8f5ba853980a916427d62d540da65b728`
foi reutilizado e somente os três caminhos literais abaixo foram recapturados. Não
foi feito inventário global nem leitura de payload da release:

| Próximo caso | Caminho literal e bytes físicos | Evidência recuperável | Primeiro gate e fonte capaz de resolvê-lo |
| --- | --- | --- | --- |
| `3630e16` — cadeia mais completa | `/opt/re7online/releases/immutable-3630e16-vps-20261024T195842Z`, presente, `988.524.544` B | membro autenticado do lote conjunto de worktrees; outputs encerrados pelo receipt `c1a99e4620860a867bb9da727e01451d84cb5cde07c6d0b9467feed25ceff3ff`, intenção `dbf1d0a273003b52167be035c4b0cf2d94c7356afe8154cb1c9b1d7a4054d39e`; registro d7 declara 3630 como predecessor da API | `private_read:generation-artifacts.private.json`: output preserva pacote, mas não contrato/lifecycle/review canônicos. Resolve com a custódia original da geração 3630 e a ativação d7 autenticada, ou decisão contratual explícita de derivação; depois ainda exige comparação integral e classificação privada. |
| `ec2a9fde` | `/opt/re7online/releases/immutable-ec2a9fde-vps-20261024T162005Z`, presente, `988.528.640` B | registro de deploy SHA-256 `84d3e9c0f9b7f2d715851e68baa24e04a8a81f6c4dc94021a265be213e77017e`; d7 declara ec2 como predecessor do frontend; quatro runtimes antigos são efeitos terminais e não candidatos | mesmo gate de contrato/lifecycle da release. Resolve com originais da geração ec2 e receipts/journals das sucessões por componente; a custódia histórica de 19 arquivos continua não localizada nas raízes antes consultadas. |
| `ef7db111` | `/opt/re7online/releases/immutable-ef7db111-vps-20261024T174000Z`, presente, `988.508.160` B | registro API-only SHA-256 `446d727bf9506fe3141222215d381f6d335700714d970a5fa0a5068bdc570fb3`; outputs encerrados no mesmo receipt `c1a99e46...ceff3ff` | contrato/lifecycle canônicos ausentes e a sucessão API `ef7 → 3630` ainda carece do original da ativação 3630. O perfil `ef7db111-prep` permanece `DENY` terminal e fora deste escopo. |

O primeiro próximo caminho para revisão é a release instalada `3630e16`, pois reúne
o fechamento recuperável de worktree e outputs e uma aresta sucessora publicada.
Isso não a qualifica: os três potenciais permanecem, respectivamente,
`988.524.544`, `988.528.640` e `988.508.160` bytes; bytes qualificados nesta rodada:
`0`; bytes efetivamente recuperados: `0`. Nenhum request, `audit`, `prepare` ou
`execute` foi criado ou executado.

#### Qualificação consolidada P00 — 07/11/2026

Esta seção substitui o encaminhamento de buscas individuais acima. A leitura
dirigida localizou os originais de ativação de `ec2`, `ef7`, `3630` e `d7`, além
dos originais a959 já registrados. Portanto, não permanece correto afirmar que a
sucessão `ef7 → 3630`, a ativação d7 ou a ativação a959 estão ausentes. O lifecycle
privado histórico das quatro gerações continua ausente; ele não foi sintetizado.

O fluxo novo `qualify-legacy-p00-installed-batch` é uma prova derivada e fechada,
não um lifecycle histórico nem autorização. Ele fixa o grafo
`ceff32cf664d14382b0209a30ac556012c2cd2a484d5039d04fa2f1c14f47224`, os quatro
caminhos, targets, pacotes, manifests, índices e markers, e autentica a cadeia por
componente `a62 → ec2`, `ec2(api) → ef7`, `ef7(api) → 3630`,
`3630(api)+ec2(frontend) → d7` e `d7(api+frontend) → a959`. As provas novas desta
rodada são a verificação canônica direta dos quatro pacotes e árvores e a prova
derivada emitida em fixture isolada. Os receipts, registros e ativações originais
continuam sendo as autoridades históricas.

| Geração / caminho literal presente | Bytes físicos observados | Veredito desta rodada | Evidência e impedimento remanescente |
| --- | ---: | --- | --- |
| `/opt/re7online/releases/immutable-3630e16-vps-20261024T195842Z` | 988.524.544 | **dependente de regra para o legado** | pacote `346246ce…fc18`, manifest `ec677da8…218e`, índice `92a62cc5…7952` e árvore passam no verificador; ativação `1da6cc4b…339a` e preflight `0ec17142…597b` comprovam API `ef7 → 3630`; d7 comprova sucessão. Falta integrar/materializar contrato e lifecycle derivados pelo fluxo fechado. |
| `/opt/re7online/releases/immutable-d7de6453-vps-20261024T221500Z` | 988.606.464 | **dependente de regra para o legado** | pacote `b75500e6…519`, manifest `dcc3c1a4…85d6`, índice `fcd7a0be…b6f4`; 34.349 entradas conferem. Os 61.440 B extras são somente cache subordinado. Ativação d7 `a119f623…79af` e sucessão a959 `3567a10a…dc8`/`991d549a…4240` estão autenticadas. Falta a mesma materialização derivada, sem reescrever o lifecycle ausente. |
| `/opt/re7online/releases/immutable-ec2a9fde-vps-20261024T162005Z` | 988.528.640 | **dependente de regra para o legado** | pacote `a8715c8d…b4ad`, manifest `b9aa1c53…f5e6`, índice `22b790da…4241`; árvore só diverge por cache runtime confinado. Preflight `23ef53b2…b82e`, ativação `45808ec5…511f`, ef7 e d7 fecham a sucessão dos dois componentes. Falta materialização derivada. |
| `/opt/re7online/releases/immutable-ef7db111-vps-20261024T174000Z` | 988.508.160 | **dependente de regra para o legado** | pacote `c5bb0b94…351c`, manifest `f6660e61…97aa`, índice `9f8ffc1e…bb74` e árvore passam estritamente. Preflight `c39675ef…10f0`, ativação `f8073f00…8d2` e 3630 fecham a sucessão API. O `DENY` terminal de `ef7db111-prep` continua preservado e não integra este candidato. |
| `/opt/re7online/releases/immutable-a62da468-vps-20261024T124726Z` | 988.495.872 | **preservado** | contém `api-runtime/.data` físico; pai privado não pode receber comando. A cópia anterior sem `-vps`, o incoming de 147.972.096 B e as preparações a62 permanecem sem closure própria e fora do lote. |
| `/opt/re7online/releases/immutable-5c339b2e-20261022T125717Z` | 985.571.328 | **preservado** | contém `api-runtime/.data` físico. Incoming de 166.449.152 B e checksum permanecem inventário sem disposição autenticada. |

O verificador canônico agora possui a exceção fechada
`--legacy-p00-runtime-cache-overlay`, aceita somente as identidades exatas d7/ec2
e somente `frontend-runtime/.next/cache`; arquivo extra fora dessa subárvore,
release diferente, symlink, modo gravável ou conteúdo privado continuam negando.
Os bytes finais do verificador proposto têm SHA-256
`3bc9a6ba5eec9e36090bcfc8bace1b3986bda5c45c5feb67483ff1defd1ae309`;
os descriptors legados versionados foram atualizados para vincular esse mesmo
consumidor, sem alterar as evidências históricas privadas.
O próprio script final foi transmitido por stdin e executado em leitura na VPS:
d7 retornou `RELEASE VERIFIED` com dez entradas de cache, e ec2 retornou
`RELEASE VERIFIED` com seis; nenhum arquivo foi materializado ou alterado nessa
prova.
O consumidor copiado fora do checkout comprovou quatro classificações
`RETIREMENT_READY`, mas emitiu somente
`LEGACY_P00_INSTALLED_BATCH_QUALIFICATION`, com `authorizationGranted=false`,
`executionPermitted=false`, zero comandos e próximo passo obrigatório
`CANONICAL_CONTRACT_LIFECYCLE_MATERIALIZATION`. Referência operacional, `.data`,
drift da cadeia ou divergência pacote/árvore negam antes de produzir a prova.

Os demais escopos não entram na soma: os 34 filhos históricos de
`/opt/re7online/deploy-control` continuam na tabela literal de 06/11, sem receipt
de disposição próprio (#352 previne apenas novas alocações); os pais de
`build-output` preservam pacote/manifest/índice/evidência, enquanto os runtimes já
retirados são terminais; `/opt/re7online/release-sources/freeform-window-af26`
(130.396.160 B) e `freeform-window-af26-cumulative-20261002` (1.879.433.216 B)
são fontes únicas preservadas; preparações e receipts terminais permanecem
evidência e não são efeitos repetíveis. O perfil `ef7db111-prep` continua
terminal `DENY` e integralmente excluído.

Medição fresca: 8.181.280.768 B e 8.752.642 inodes disponíveis. O gate do build
`36b94c6d` exige 9.663.676.416 B; déficit atual 1.482.395.648 B. Os quatro
caminhos legados somam 3.954.167.808 B físicos observados. Como a regra ainda não
foi integrada/materializada na VPS, **bytes aptos pelo fluxo vigente: 0**,
**bytes dependentes da regra versionada: 3.954.167.808**, **bytes recuperados: 0**.
Se a regra for integrada e a recaptura canônica mantiver o veredito, o saldo bruto
projetado será 12.135.448.576 B, 2.471.772.160 B acima do gate. Reservando
16.777.216 B para a custódia compacta e o fechamento, o ganho líquido conservador
é 3.937.390.592 B e a folga projetada é 2.454.994.944 B.

O lote completo para a próxima etapa canônica é exatamente, e somente, `3630`,
`d7`, `ec2` e `ef7` nos quatro caminhos literais da tabela. Ele ainda não está
selado: após integração da regra, requer materialização privada (inclusive a cópia
`0600` do registro Git a959 já autenticado), `audit`, plano por
SHA e `prepare` próprios. Nenhum request produtivo, retirada ou build foi iniciado
nesta rodada.

##### Ensaio integrado da materialização e do prepare — 07/11/2026

O schema 2 de `generation-retirement-prepare-materialize.py` fecha exclusivamente
o lote `p00-legacy-installed-releases-20261107-v1`. Ele exige as quatro releases
literais acima, a prova de qualificação, os quatro contratos/lifecycles/reviews e
fotografias vinculadas ao mesmo grafo. O schema 1 de uma ou duas gerações
reconciliadas permanece inalterado. O materializador continua sem executar
`prepare` e sem conceder autorização; ele apenas copia/readback os controles e
emite os quatro argv canônicos.

O ensaio isolado produziu a prova pelo consumidor real, materializou o pacote fora
do checkout e executou os quatro argv contra `generation-retirement.py prepare`.
O resultado no commit de código `4fcb87ef` foi exatamente quatro efeitos
`RELEASE_RUNTIME`, um para cada caminho
da tabela, sem efeito adicional, glob, force ou prune. Cada intenção ficou
`SEALED_FOR_EXPLICIT_AUTHORIZATION` e `authorizationGranted=false`. Os hashes de
uma execução registrada de fixture são:

- prova de qualificação: `1680fc80719889d646c0069dd15c0a865a4a83d711db81f1a8ef1ccbdd45787b`;
- plano/materialização: `1ae2475afcd10142d2b8279131234d4fcb7aaa69f36184e241ab55db0c73771d`;
- intents, na ordem ec2, ef7, 3630 e d7:
  `d52436ce3ae04178b6804a94580ed108299a4ee1e01e1226ee67e19233a00b13`,
  `7ea0175d555221d7d72522f63650e8afa692cd69d823c8df9604c602586f92b5`,
  `05d5d15dcdd36d2f84b9deec398588fe87bfdfef0dded6fd8c974eb0565fc76d`
  e `bdeba74dbf5f3410658aa7cd09d5459ee51e6ac86c3ac466e5af26af7c8ca9cd`.

Esses hashes identificam somente a execução sintética e não são reutilizáveis na
VPS. A regressão também acrescentou uma referência de dependência depois da
materialização: o `prepare` real negou por drift antes de criar intent ou arquivo
de comandos. A observação fresca de cada intent inclui os links `current`, o
fingerprint do PM2 vivo, o SHA do dump salvo, o SHA do grafo/retornos e o SHA da
lista de dependências.

O orçamento produtivo fica separado dos pequenos valores da fixture:

| Parcela | Bytes | Tratamento |
| --- | ---: | --- |
| pico temporário conservador de extração, um pacote por vez | 988.606.464 | capacidade necessária durante a qualificação; não é descontada do ganho líquido |
| custódia e fechamento | 16.777.216 | reserva descontada do ganho bruto |
| quatro releases | 3.954.167.808 | ganho bruto condicionado ao audit produtivo |
| ganho líquido conservador | 3.937.390.592 | ganho bruto menos a reserva de custódia |

O ensaio não substitui a etapa produtiva. Depois da integração, a VPS exige prova e
custódia novas, medição fresca, `audit` próprio, plano por SHA e `prepare`; nenhuma
intenção ou hash sintético pode ser usado para autorização.

##### Fronteira canônica, lifecycle preservado e execução isolada — 07/11/2026

A referência anterior a um `audit` produtivo por `capacity-recovery.py audit` não
se aplica a este lote: esse consumidor não admite `RELEASE_RUNTIME` como classe de
candidato. O controle fechado deste lote pertence integralmente ao fluxo de
`generation-retirement.py`. A sequência produtiva exata, ainda não executada, é:

1. em custódia privada sucessora, executar somente a qualificação em leitura
   `generation-retirement.py qualify-legacy-p00-installed-batch`, recapturando as
   árvores e as autoridades fixadas e produzindo a prova
   `LEGACY_P00_INSTALLED_BATCH_QUALIFICATION`;
2. finalizar o request schema 2, reabrir todos os bindings e executar
   `generation-retirement-prepare-materialize.py`, que copia/readback o consumidor
   integrado e emite os quatro argv fechados;
3. executar cada argv `generation-retirement.py prepare`. Esta é a classificação
   canônica que recaptura `current`, PM2 vivo, dump salvo, grafo/retornos e
   dependências antes de selar cada intenção. Não existe plano
   `capacity-recovery` intermediário para estas releases;
4. somente depois de revisão e `AUTHORIZE_ONCE` individuais, uma etapa futura pode
   executar os quatro `generation-retirement.py execute`, parando na primeira
   negativa. Nada nesta seção concede essa autorização.

O vínculo entre materializador e executor preserva agora dois artefatos no
contrato e na intenção de cada geração, no schema canônico: o lifecycle como
`EVIDENCE_PRESERVE/ACTIVE_DEPENDENCY/NEVER_AUTOMATIC`, com digest e dependência da
prova de qualificação, e exatamente uma `RELEASE_RUNTIME`, que é o único artefato
removível e o único comando. O materializador nega contrato sem lifecycle, com
lifecycle cruzado ou com segundo artefato removível; o executor mantém sua
exigência de exatamente um lifecycle autenticado.

A fixture isolada atravessa qualificação, materialização, quatro prepares e quatro
executes reais com autorizações sintéticas. O resultado é exatamente quatro
receipts `SANITIZED`, quatro journals `ATTEMPT → RESULT → VERIFIED` e quatro
reviews terminais, um efeito `RELEASE_RUNTIME` por geração; os quatro lifecycles
permanecem presentes. Uma segunda regressão conclui a primeira retirada, injeta
falha no `rm` da segunda, obtém receipt/review `QUARANTINED`, não invoca a terceira
nem a quarta e preserva byte-exatamente receipt e journal já emitidos. A tentativa
de repetir o primeiro comando com o mesmo destino selado nega antes do efeito por
`evidence_destination_exists`. Essas provas usam somente árvores temporárias e
não alteram bytes qualificados ou recuperados na VPS.

##### Fechamento terminal 36b94c6d e custódia de controle aberta — 08/11/2026

A geração `immutable-36b94c6d-vps-20261107T165118Z` terminou
`DEPLOYED_SANITIZED`. O retorno imediato autenticado de API e frontend é
`immutable-17cc77a8-vps-20261104T141039Z`; o worker `e2e7f17a` permaneceu
inalterado. A continuação de finalize consumiu uma única vez a intenção
`6064a4a98ede89bb085b09e4e474048d976aa9cf31a4c0cd03207be18a0c4f7c`.

O receipt `ea418a0fbbc2575703a41b13cc1c70826976764270d0044ffdbeb8035687b3fd`
registra 3/3 comandos e `remainingDerivedPaths=[]`; o journal
`9e5e24492075f2f240b14268418524d63a0a1d0ea82f6a8441e52b8e7f442768`
contém `ATTEMPT → RESULT(exitCode=0) → VERIFIED(absent=true)` para cada efeito.
O review terminal `816f4e8be5544c7e0bed259381a50be11d9507a0e5e7d918aafe2bb730d32ea1`
vincula esse receipt. Os três caminhos comprovadamente ausentes são:

- `/opt/re7online/build-worktrees/immutable-36b94c6d-vps-20261107T165118Z-source`;
- `/opt/re7online/build-output/immutable-36b94c6d-vps-20261107T165118Z-producer/immutable-36b94c6d-vps-20261107T165118Z/api-runtime`;
- `/opt/re7online/build-output/immutable-36b94c6d-vps-20261107T165118Z-producer/immutable-36b94c6d-vps-20261107T165118Z/frontend-runtime`.

Na intenção selada, os `allocatedBytes` dos efeitos eram 1.026.973.696 B para o
worktree, 337.526.784 B para o runtime API e 645.144.576 B para o runtime frontend:
total 2.009.645.056 B. O receipt terminal não contém medição de bytes; ele comprova
3/3 e ausência. O saldo de `df` passou de 8.816.476.160 B para 10.834.006.016 B,
variação observada de 2.017.529.856 B; inodes passaram de 8.775.519 para 8.847.872.
As fontes e métricas são distintas e não formam um ledger aritmético. O journal terminal da
transação é `12d8db1f6115de3796807c314b4ca7d3563f9675f88b3f627f04b0520195562b`,
o dump é `9101b1c995f07ebb4032a362812d601cee453e5884f513222b4efcf8a2ada398`
e o marker é `bc77c6422ca025eb69e4202d88309cf82b12135de06ca041ba5349d8b372c5a1`.

Esse `SANITIZED` é estritamente o escopo dos três derivados acima. A custódia de
controle `36b-runtime-cache-finalize-control-c7896c3d-v1` foi fechada depois, em
operação separada, sem repetir a retenção da release. O consumidor integrado no
merge `def461d550ff7d43115ed87ba2cd8153470e603e` autenticou lifecycle original
`557bea22007d9427f94fe383862327201c9b09dce59e9c607571895b2c0a5300`, receipt
de materialização `3ec9ce42615b0b05692073c179b285eb9b96e7766ca33b4e5209b247725d9082`
e request schema 2 `400fd0752cd84dd02967476639c168caa2f00531adef372cd87982806614fdd0`.

As cópias privadas foram retiradas somente depois de `ATTEMPT` durável e receberam
receipts próprios: driver `79059ea73100b03fa80f11b3a8b80aa8a288337d2fe4f9d63a1f248e9d99f1b3`
e wrapper `b4b48ced119ab50dbac84c1ece51446949173a0d2df3d1d8f52ec35cf59a8a01`.
O receipt da operação é `0a0966bac48bddc501aff3e287eadb9b280e4ced08c220e12ed638172c9d38aa`
e o terminal `6a247a4292a6f1996926d3fed2c47ba2033b8f2e822341e905376bf374312b94`
registra `TERMINAL_SUCCESS`. O lifecycle terminal
`4cc1bdbd9fb68d8610d5cc1800e7b7e7da0f5dd295f7aadaef9769f27e94304b`
está `SANITIZED / CLOSURE_RECORDED`; o worktree está ausente fisicamente e no
registro Git.

Os controles rastreados foram preservados em custódia privada `0600`, com os
hashes originais `28eeb2f3…2f98` e `c87300a0…e930`. O saldo observado passou de
10.713.362.432 para 10.791.366.656 B, ganho líquido observado de 78.004.224 B;
os inodes livres passaram de 8.847.843 para 8.851.504. A alocação realizada de
77.492.224 B, a leitura posterior de 77.647.872 B e a variação de `df` são fontes
distintas e não compõem ledger aritmético. A custódia não está mais pendente e não
deve ser consumida novamente.

##### Piloto de preservação da raiz vazia b58ed195 — qualificação local

A raiz literal `immutable-36b94c6d-vps-20261107T165118Z-api-frontend-b58ed195-v3-once`
permanece preservada no lugar e não é candidata à retirada. A disposição fechada
registra somente vazio atual, identidade física fixa, ausência de referências e
`historicalInvocationResultAuthenticated=false`. A emissão exige o observador
privilegiado sob os locks e produz uma atestação independente `root:deploy 0440`.
Essa atestação vincula separadamente as requisições do observador e da preservação;
os dois hashes não são intercambiáveis.
O receipt isolado não altera a classificação: somente um snapshot operacional
posterior, autenticado, que vincule receipt e journal completos permite a leitura
`PRESERVED_INACTIVE_EVIDENCE`. Receipt montado manualmente, varredura incompleta,
conteúdo, referência ou identidade divergente mantêm `DENY`. Esta qualificação
não libera bytes e o audit do cache npm permanece uma etapa posterior. Antes da
emissão produtiva, a prova de instalação do helper deve ser capturada e reaberta
pelo perfil fechado `empty-transaction-preservation`; a instalação isolada não
satisfaz esse gate e o perfil não autoriza audit.

##### Dívida do build abortado a838bd33 — disposição fechada do worktree

O produtor encerrou `immutable-a838bd33-vps-20261109T202533Z` em
`FAILED/RETENTION_DEBT` no checkpoint `after_api_npm_ci`, antes de pacote,
manifesto ou índice. A fotografia física atribuiu 987.512.832 B ao worktree,
24.576 B ao output de evidência, 122.880 B à custódia e 341.946.368 B ao cache npm.
Os quatro resíduos explicam 1.329.606.656 B dos 1.332.482.048 B consumidos na
janela; 2.875.392 B permaneceram como oscilação não atribuída.

O consumidor qualifica exclusivamente o caminho
`/opt/re7online/build-worktrees/immutable-a838bd33-vps-20261109T202533Z-source`.
O binding exige lifecycle `4388c11f…60af0`, inventário `ace7b547…1e02` e contrato
de capacidade `2fbfc0b7…b7a06`, além do target `a838bd33…54c1` e da árvore
`438b737c…dde4`. O ensaio isolado usa Git real e prova um único efeito sem
`--force`, ausência física e no registro Git, com output, custódia e cache
preservados. Drift de hash, pacote reaparecido, checkout alterado, ignorado extra,
referência operacional ou registro Git divergente negam antes da retirada.

Os 987.512.832 B permanecem apenas potenciais até `prepare`, intenção revisada,
`AUTHORIZE_ONCE`, receipt terminal e nova medição. A projeção anterior de
9.687.744.512 B deixa somente 24.068.096 B sobre o gate então vigente; portanto a
retirada fecha a dívida, mas não autoriza automaticamente outro build.

#### Cinco runtimes pré-contrato — qualificação fechada de 13/11/2026

O inventário dirigido `re7-five-historical-runtime-readonly-20261113.json`, SHA-256
`4c83d13f7ad11e2576378528c4bfec40e4599e7df2ff11663cf1d5d223a7b3b0`,
registrou cinco runtimes presentes, totalizando 5.055.369.216 B. O grafo
`7b9ea5fe…cb41` mantém os cinco apenas em `installedVerifiedReleases`; nenhum é
ativo, retorno imediato/transitivo ou candidato. PM2 vivo, dump `3a756660…64a` e
as referências dirigidas não apontam para essas árvores. Essa ausência de
referência não é, sozinha, autoridade de retirada.

A fronteira `qualify-legacy-precontract-five` autentica as identidades e caminhos
literais e reconstrói a linhagem sem fabricar manifesto moderno. `af26` é provado
pelo manifesto de executáveis preservado e pela igualdade integral de todas as
folhas não executáveis com a fonte histórica preservada
`release-sources/freeform-window-af26`; folha desconhecida protege apenas a árvore
afetada. `879` é provado pelos manifests completos de
source/dist e pelo baseline `af26` preservado; `b9` e `afbb` pelos deltas exatos e
encadeados. A comparação dirigida comprovou 425 hashes de API e 1.645 de frontend
em `af26`, 428 hashes de source e 425 de dist em `879`, 26 caminhos no delta
`879→b9` e 22 no delta `b9→afbb`, sem diferença não manifestada. Os symlinks
`api-runtime/.data` devem continuar apontando para o destino externo literal e
são classificados `EXTERNAL_DATA_PRESERVE`, nunca incluídos como efeito.

A prova separa `releases` qualificadas de `protectedReleases`; a união deve ser
exatamente o conjunto fechado dos cinco candidatos. Falha de autoridade protege
o candidato e, quando aplicável, seus descendentes de linhagem, mas não impede a
conclusão dos independentes já comprovados. O materializador schema 3 aceita
somente o subconjunto qualificado e exige, por candidato, contrato/lifecycle,
review, fotografia e uma única `RELEASE_RUNTIME`. A cadeia de regressão usa os
consumidores reais para qualificação, materialização, `prepare`, negativa por
drift e execução sintética com receipt terminal. Nenhuma qualificação ou retirada
produtiva é efeito desta revisão; a próxima etapa, após integração, é recapturar a
fronteira operacional na VPS e materializar contratos privados antes dos prepares.

##### Qualificação produtiva negada por manifesto histórico 0664 — 13/11/2026

A tentativa de qualificação somente leitura do lote precontract five, após o merge
`6012e256381f24bed9025d8e1b2229418bb084ec`, encerrou
`QUALIFICATION_DENY:legacy_precontract_af26_manifest_identity` antes da avaliação
individual. O manifesto original `af26` mantém SHA-256
`017c8d678f885026a574ee0b241c9cd156b015ea0b978b53714196ab53364989`,
mas seu modo histórico observado é `0664`; o verificador regular global proíbe
escrita por grupo. Nenhum byte foi qualificado, nenhum `prepare` foi executado e
nenhuma operação alterou o arquivo original ou a produção.

A correção delimitada adiciona uma **exceção de leitura exclusivamente para o
caminho e SHA exatos** de `af26Manifest`, exigindo owner e grupo do processo
`deploy`, modo histórico exato `0664`, diretório físico não-symlink de autoridade
pela verificação já existente, `O_NOFOLLOW`, confronto `lstat/fstat` anterior e
posterior, e SHA do conteúdo. `stable_regular_hash` permanece inalterada; outras
autoridades continuam negando escrita por grupo. A exceção não converte
qualificação em autorização de retirada e não autoriza `chmod` da fonte produtiva.
A próxima tentativa deve usar nova prova e apenas recapturar observações voláteis.

##### Correção consolidada de autoridade r879 — 13/11/2026

A retomada com merge `c775753772751e6fa4a54025461d80af99bdb1ba`
autenticou o manifesto `af26` e negou em
`legacy_precontract_r879_sourceManifest_identity`, antes de avaliar qualquer runtime.
A inspeção dirigida identificou o mesmo modo histórico `0664` em **três
autoridades literais adicionais já fixadas pelo qualificador**:
`incident-6683-879cb1fa/api-src.sha256` (SHA
`e7a92bf07f996f0776e64893e35e8368a630a3d5c2457baa7e6a243c9b5693ca`),
`api-dist.sha256` e `api-src-dist.tar`; todos UID/GID `1000:1000`, com SHA
original íntegro. Os manifests `r879.manifest`, `b9` e `afbb`, o grafo e
demais evidências continuam `0600` e sujeitos à autenticação estrita.

Em vez de novos reparos um a um, o mesmo leitor `stable_legacy_precontract_0664`
aceita **somente quatro bindings literais**: manifesto `af26` mais sourceManifest,
compiledManifest e archive `r879`, exigindo em cada um caminho, SHA, UID/GID,
modo exato `0664`, `O_NOFOLLOW` e `lstat/fstat` estáveis. A função
`stable_regular_hash` não foi alterada, os demais manifests continuam pelo
leitor estrito, e nenhuma fonte original é modificada. A fixture atribui os
modos históricos reais aos quatro arquivos e exercita qualificação integral,
negativas por modo/caminho/hash/chave e segregação dos demais controles.

O audit produtivo que negou é terminal e não deve ser repetido; a futura qualificação
deve usar nova custódia e preservar as autoridades e provas imutáveis existentes.
**Nenhum prepare, autorização ou efeito de retirada está implícito.**

#### Fechamento excepcional terminal dos cinco runtimes — 14/11/2026

As negativas de qualificação histórica acima foram superadas, para este lote e
somente ele, por preservação integral autenticada fora da VPS, restauração isolada
e autorização excepcional do owner. Não foram convertidas em `PASS` nem reescritas.
Os cinco caminhos terminaram `TERMINAL_SANITIZED / DO_NOT_REPEAT`, com receipt
`3fcb72eaebb343c233d417102749f7bdd0fe1b93e1bd243384ba1e6c27c1fa06` e
journal `1fb2c129e86e4f33cfa310ec4461ff0592287b50102067f63738fd116e805c94`.
Foram cinco comandos concluídos, cada um com `ATTEMPT → RESULT(0) → VERIFIED`.

A recuperação medida foi **5.055.328.256 B e 180.704 inodes**; o saldo passou
de 7.087.513.600 B/8.743.902 inodes livres para
12.142.841.856 B/8.924.606. A custódia
`p00-five-runtimes-exceptional-20261113-v1`, archive `e806a178…a739`, índice
`43e84827…cd5`, receipt `f9151e22…31c2` e restauração permanecem preservados no
ThinkPad. `.data` externo não foi seguido nem retirado. Produção, retornos,
worker, banco e tenants ficaram intactos.

O helper instalado `aedc012b…57a` e o consumidor excepcional `a0cf7090…ec4c9`
tinham allowlists fechadas nos cinco caminhos/identidades. A autorização
`a20c6df5…e298` não se estende a outros runtimes. Não repetir qualificação,
preservação, transferência ou retirada deste lote.

#### Fechamento excepcional terminal das dez releases — 14/11/2026

O lote `p00-ten-releases-exceptional-20261114-v1` encerrou em
`TERMINAL_SANITIZED / DO_NOT_REPEAT`. A intenção attempt-02
`c92549c1184998c2b1e0bcba2a98bbc1b2ac1cd40864d7d26380846990802e2f` foi a
única autorizada; a intenção anterior `ca3502ca…7e29` permanece descartada e não
pode ser reutilizada. A autorização
`988bd303c66d0234638c07084b89f0ef499b856586873ad33384b2e97f998802`, o journal
`46aa4366817c719eecedb2425a11006946402efde0d5db6568962a4bd646f8fc` e o receipt
`25788ae257beb85d6c342cd2a06678617792e3a06b69de88c43b1997cf16c451` registram
10/10 comandos com `ATTEMPT → RESULT(0) → VERIFIED` e ausência dos dez caminhos.

O receipt atribui recuperação de **8.523.984.896 B e 279.130 inodes**. O saldo
passou de `12.114.100.224 B`/`8.924.565` inodes livres para
`20.638.085.120 B`/`9.203.695`; o readback subsequente de
`20.638.040.064 B`/`9.203.694` registra atividade concorrente mínima, não uma
segunda retirada. A observação privilegiada de execução foi completa, com zero
referências, writers e falhas, e os dois locks foram comprovadamente liberados.

A custódia `p00-ten-releases-exceptional-20261114-v1` permanece no ThinkPad com
archive `464c60ef…10c8`, índice `054989cb…ccdf`, receipt `cb1926e7…f361` e
restauração isolada PASS. Seis symlinks `.data` foram preservados sem seguir os
destinos externos. API/frontend `fa10f4f5`, worker `e2e7f17a`, PostgreSQL por
health da API, tenants e produção permaneceram saudáveis. O helper
`dca521d9…f9f3`, o consumidor `3b212477…4b0e`, o perfil e a autorização eram
fechados para estes dez caminhos; não constituem permissão para qualquer lote
novo.

Os fechamentos 5/5 e 10/10 totalizam **15 caminhos**, **13.579.313.152 B** e
**459.834 inodes** recuperados. Preservam-se duas custódias e dois conjuntos
independentes de receipts/journals; não repetir nem combinar autorizações.

#### Próxima rodada dirigida após os lotes terminais — 14/11/2026

A fotografia estrutural reaproveitada tem SHA-256
`8962e14ac599329dd883b70856aa99dd0727de4adc71c96868c008a88dfa8d92`.
Após excluir os 15 caminhos terminais, uma atualização somente nos candidatos
literais confirmou sete releases históricas presentes, totalizando
**3.345.813.504 B e 111.106 inodes**, sem referência em `current`, grafo, PM2
vivo/salvo ou listeners ativos. Nenhuma retirada, intenção ou autorização foi
produzida.

| Lote | Caminhos | Bytes físicos | Inodes | Classe | Precedente | Risco | Custódia | Decisão |
| --- | --- | ---: | ---: | --- | --- | --- | --- | --- |
| frontend histórico | `9f4cbe0f…-front`; `fa60f0f6…-front`; `fa60f0f6…-front-css-17bd5fb8` | **1.917.022.208** | 76.720 | `LEGACY_RUNTIME_EQUIVALENT` | procedimento excepcional 5/5 e 10/10 | ausência de pacote integral para 9f4/CSS; não há `.data` nas árvores | pacote fa60 plain presente; custódia integral local ausente | **prioridade 1**, preservar/restore antes de preparar retirada |
| worker histórico | `worker-bf5f1d76…-b66bb89a`; `worker-minimal-hybrid-b9b58177-verified-v3`; `worker-minimal-reactive-afbb7455-verified` | **1.065.451.520** | 24.544 | `PRESERVATION_VERIFIED / OPERATIONAL_REFERENCE_PENDING` | procedimento excepcional 5/5 e 10/10 | `b66`/`b9` independentes, mas consumidor não admite 2/3; `afbb` ainda consta como `PWD` herdado no PM2 vivo/salvo | custódia integral 3/3, índice `a8127b31…7148`, receipt `1a1314ce…9ec` | preparar manutenção PM2 separada; nenhum prepare de retirada |
| campaign API | `campaign-eligibility-recovery-final-reviewed-20261008` | **363.339.776** históricos; **363.323.392** recuperados | 9.842 históricos; **9.839** recuperados | `TERMINAL_SANITIZED / DO_NOT_REPEAT` | procedimento excepcional fechado 1/1 | zero referência em current/PM2/dump/grafo protegido e observação privilegiada completa | archive `167bd932…786b`, manifesto `4fe74088…5263`, suplemento `2c6b80dd…19bf`, restore PASS, receipt `0c8f6d00…da6a`; `.data` não seguido | receipt terminal `8c6e5013…6082`; não repetir |

O próximo lote fechado para **preservação e preparação**, não para retirada, é o
frontend histórico de três caminhos. A sequência reaproveita o procedimento
comprovado nos lotes excepcionais: comparar primeiro o que já é restaurável pelo
pacote fa60, preservar externamente apenas o complemento necessário ou a árvore
integral quando a cobertura não puder ser provada, executar restore isolado e só
então recapturar gates operacionais e produzir intenção literal. Qualquer efeito
destrutivo exige nova autorização específica. Os outputs (~3,55 GB), fontes
históricas (~2,01 GB) e controles de deploy não entram nessa seleção, pois ainda
contêm autoridades/evidências ou negativas não reconciliadas.

#### Fechamento excepcional terminal dos três frontends — 14/11/2026

A priorização imediatamente acima foi consumida e está superada. Os três caminhos
`9f4cbe0f…-front`, `fa60f0f6…-front` e
`fa60f0f6…-front-css-17bd5fb8` terminaram
`TERMINAL_SANITIZED / DO_NOT_REPEAT`. A intenção
`d84d6e4d15d0fa40dcd4f2704e2897c162c32360199e8a4582df779fd8f0921c`, a
autorização `2e805fb27ed7d6aef94d0d5dcbebda13b212db608928459b3abe0075efb193f6`,
o journal `0e2e21d8761390395ceb5c7ae7a6298976019d51517d4ca5573e9c5c90bc14c9`
e o receipt `ece95abecc17a9b74a278f35cbfb9164cde109ecf9159e5cc7075fa37a9365c7`
comprovam 3/3 comandos, ausência física e **1.917.009.920 B / 76.717 inodes**
recuperados.

A custódia `p00-three-frontends-exceptional-20261114-v1` preserva os pacotes
reutilizados, 21 folhas complementares, índice `617ded0a…027a`, complemento
`72291aba…fc8b`, receipt `86654281…18be` e restauração 3/3 PASS. Não havia
`.data` nas árvores; API/frontend ativos, worker, banco, tenants e persistências
externas permaneceram intactos. A observação privilegiada de execução terminou
com zero referências, writers e falhas, e os locks foram liberados.

Antes do lote Campaign API, os três fechamentos excepcionais totalizavam **18
caminhos**, **15.496.323.072 B** e **536.551 inodes** recuperados. O total
vigente, após o fechamento 1/1 abaixo, é **19 caminhos**, **15.859.646.464 B** e
**546.390 inodes**. As autorizações são independentes, consumidas e não
reutilizáveis.

#### Continuidade dirigida — workers e Campaign API — 14/11/2026

A custódia dos workers foi concluída sem retirada. `b66` e `b9` têm ausência de
referência operacional na fotografia disponível, mas não avançam isoladamente:
o único consumidor local que se apresentava como `three-workers` ainda continha
os caminhos, identidades e hashes do lote de frontends 3/3 já encerrado, e o
consumidor integrado não contém os caminhos atuais dos workers. Usá-lo produziria
autoridade falsa. `afbb` permanece bloqueado pela referência `PWD` histórica no
PM2 vivo e salvo, embora cwd, entrypoint, FDs e mapas do PID produtivo apontem à
release ativa `e2e7f17a`.

O contrato de manutenção PM2 está fechado conceitualmente: fonte privada
autenticada, request allowlisted de worker sem `PWD`, `build`, `validate`, prova
isolada, troca somente do worker, aceite de sessões/filas/health, rollback e um
único `pm2 save` posterior ao aceite. A fonte privada limpa ainda não foi
localizada; não é legítimo fabricá-la a partir de `/proc` ou do dump contaminado.
Estado: `PM2_DEFINITION_CONTRACT_READY / AUTHENTICATED_SOURCE_REQUIRED`.

Para a Campaign API, a busca dirigida evitou retransmitir backups sem a árvore da
release. Como nenhuma cópia externa restaurável existia, somente a raiz candidata
foi transmitida uma vez para custódia privada. A restauração local confrontou o
manifesto histórico integral e negou inicialmente uma folha extra; a retomada
preservou `.env.example` como suplemento autenticado e concluiu sem ocultar a
divergência. Esse estado foi superado pelo fechamento terminal abaixo.

#### Fechamento excepcional terminal da Campaign API — 14/11/2026

O caminho literal
`/opt/re7online/releases/campaign-eligibility-recovery-final-reviewed-20261008`
terminou `TERMINAL_SANITIZED / DO_NOT_REPEAT`. A intenção `7fdbb80a…899d`, os
comandos `c63e3f2e…6f77`, a autorização `9933be4d…2e7e`, o journal
`c899d701…a52c` e o receipt `8c6e5013…6082` comprovam um comando concluído e
ausência física. A recuperação medida foi **363.323.392 B e 9.839 inodes**.

A observação `EXECUTE` foi completa, com zero referências, writers ou falhas.
API/frontend `fa10f4f5`, worker `e2e7f17a`, PM2, dump, health com banco `ok`,
`.data` externo e persistências dos tenants permaneceram preservados. A custódia
e a restauração continuam protegidas no ThinkPad. Não repetir transferência,
prepare, autorização ou retirada deste caminho.
