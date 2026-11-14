# Converta — padrão de atualização e ledger de capacidade (VPS + builder)

## Atualização terminal posterior — 14/11/2026: P00 extraordinário encerrado

**Esta atualização substitui apenas os números P00 consolidados anteriores (19 caminhos / 15.859.646.464 B); não altera os receipts de cada lote.** O lote de nove releases com `.data` físico concluiu `RETIREMENT_TERMINAL_VERIFIED`, 9/9, journal `f5839ac5161d4138ea42e58eac7574e1a4490c472a0fa28db828fa24f5b677a9`, receipt `4c834211cf16c0b4b7418e18641bbc090c04280d8e30b7f2b2c4661969f8dc2a`. Acrescentou **8.897.097.728 B e 309.433 inodes**. Consolidado dos cinco lotes excepcionais: **28 caminhos / 24.756.744.192 B / 855.823 inodes**. Última medição reportada: **31.786.229.760 B / 9.599.605 inodes livres**. Cuidado: não somar os valores antigos com o consolidado novo, nem confundir disponibilidade atual com reserva de capacidade.

O procedimento completo, custódia, restauração, regras de `.data` interno/externo e lições de integração estão no [fechamento terminal P00](../reviews/CONVERTA_P00_TERMINAL_CLOSURE_AND_REUSABLE_RETIREMENT_METHOD_2026-11-14.md). `DO_NOT_REPEAT` para todos os 28. A prioridade operacional passa ao backlog funcional e ao lifecycle preventivo por geração; não há nova rodada extraordinária autorizada.


**13/11/2026. Status: orientação operacional para novas gerações, SEM autorização de build, deploy ou retirada.** A única fonte de comandos executáveis de deploy permanece [DEPLOY_RUNBOOK.md](DEPLOY_RUNBOOK.md); retirada extraordinária segue [CAPACITY_RECOVERY_POLICY.md](CAPACITY_RECOVERY_POLICY.md), e ciclo de vida segue [DEPLOY_ARTIFACT_LIFECYCLE.md](DEPLOY_ARTIFACT_LIFECYCLE.md). [WORKING_PRINCIPLES.md](WORKING_PRINCIPLES.md) prevalece. Valores abaixo são **fotografias históricas ou últimos reports operacionais informados**, não inspeção ao vivo.

## 1. Estado comprovado e irrepetível

**Release ativa:** `immutable-fa10f4f5-external-20261112T233820Z` (API e frontend); worker `immutable-e2e7f17a-20261022T005110Z`. Target `fa10f4f59c9a05328e536dd25a1668c3ba25939e`, BUILD_ID `4j3t9N75vsvYu9t3DoFq4`. Implantação autenticada `DEPLOYED_RETENTION_INCOMPLETE`, journal SHA-256 `45579306a46dbd79a963b9176531673124147e8a7e667eaef72fec7591bf11e5`, `saveCount=1`, dump `3a7566603da04a5bd2ac929b0c9c8993ea5aa587e596d23d8d97c113687eb64a`, marker `ef3cb8edde127f4de841f49f5a329e74fde4a7d34b5fe787463b20d7228fcf5d`, receipt retirement VPS `f12d8260d27f1bc041afddfe8badc0b46cd9f9a8b0a9a732f71b2ebd6a8fa18b`, **0 comandos de retirada na VPS** e lock terminal ausente. Saúde e guarda geração 47 aprovadas na última observação. O termo `RETENTION_INCOMPLETE` refere-se ao snapshot de implantação e não revoga o fechamento posterior do builder.

**Builder de sucesso `fa10f4f5`: encerrado `SANITIZED/CLOSURE_RECORDED`.** Autorização `54f0821a660cedc7f64a851bbfc63b550b7f612b07629ee2b97d4562f4942285`, journal `dfc96283013a0dad6d36e28a68ffa1ea65813f3a1be4b955a192d915c543e351`, receipt `4b4f1a295e5c24acad2d03a8b816925ec46efb790db6ceddbece1c898f93ca7d`, lifecycle `b28caeaf78e0ce006736f8721a8a6ed2a855de8330f7b0934d5654c0b77d69e0`. Remoção `2/2` sem força, raiz e worktree ausentes. Receipt atribui **2.508.197.888 B**, 75.639 entradas (75.640 inodes com raiz). `df` variou **+2.945.175.552 B / +75.652 inodes**, não atribuível integralmente por atividade concorrente; somatório lógico de hardlinks não é medição física. **Nunca repetir esta retirada.** Export receipt `012103fd3dd41987f4352ef61b635e3ba1866c2d3926dc416ac3f6e5d571a6bb` preservado.

**Última fotografia VPS pós-deploy:** `7.080.562.688 B` e `8.743.987` inodes livres; nenhuma nova medição VPS foi feita na retirada do builder (host distinto). Antes do preflight `7.247.413.248 B` livres, delta de disponibilidade `-166.850.560 B`, **não equivale a custo líquido de deploy**. Runtime instalado ~`989.159.424 B`, pacote retido ~`148.213.760 B`; não somar como “recuperável” e nem retirar sem grafo/custódia. O gate histórico de build na VPS foi `9.663.676.416 B`, enquanto recepção/verificação/instalação externa exigia `5.700.927.488 B`; redução ~41% **do gate**, não do consumo permanente.

**Lote excepcional 10/10: encerrado `TERMINAL_SANITIZED / DO_NOT_REPEAT`.**
Dez releases legadas, em allowlist literal, foram preservadas integralmente fora
da VPS, restauradas de forma isolada e retiradas com 10/10 resultados verificados.
Journal `46aa4366817c719eecedb2425a11006946402efde0d5db6568962a4bd646f8fc`;
receipt `25788ae257beb85d6c342cd2a06678617792e3a06b69de88c43b1997cf16c451`.
A recuperação física atribuída foi **8.523.984.896 B e 279.130 inodes**. O
receipt mediu `20.638.085.120 B`/`9.203.695` livres; o readback posterior mediu
`20.638.040.064 B`/`9.203.694`. A custódia, archive `464c60ef…10c8`, índice
`054989cb…ccdf` e receipt `cb1926e7…f361` permanecem protegidos. Não somar de
novo esse ganho, não retransmitir a custódia e não reutilizar a autorização.

**Lote frontend 3/3: encerrado `TERMINAL_SANITIZED / DO_NOT_REPEAT`.** Os três
frontends históricos foram preservados com reaproveitamento dos pacotes locais,
restaurados de forma isolada e retirados com três resultados verificados. Receipt
`ece95abecc17a9b74a278f35cbfb9164cde109ecf9159e5cc7075fa37a9365c7`;
recuperação física **1.917.009.920 B e 76.717 inodes**. A custódia externa,
índice `617ded0a…027a` e receipt `86654281…18be` permanecem protegidos.

**Consolidação excepcional:** os lotes 5/5, 10/10, frontend 3/3 e Campaign API
1/1 encerraram 19 caminhos e recuperaram, pelos respectivos receipts,
**15.859.646.464 B e 546.390 inodes**. As quatro custódias, restaurações,
journals e receipts permanecem protegidos. O total não é estimativa de novo lote,
não deve ser somado novamente e não cria autorização reutilizável.

## 2. Inventário existente é a base; não reiniciar auditoria global

Fontes já existentes, com época e fronteira explícitas:

| Evidência | O que cobre e como usar | Estado |
| --- | --- | --- |
| [Auditoria VPS 24/10](VPS_CAPACITY_AUDIT_2026-10-24.md) | classificação inicial de 77 GiB, backups, DB, releases, outputs e candidato pequeno | histórica; lote pequeno recuperou **1.441.624.064 B**, NÃO repetir |
| [Auditoria VPS 26/10](VPS_CAPACITY_AUDIT_2026-10-26.md) | sete raízes, inventário de 58 releases, 15 outputs, 4 worktrees, 148 preparações, 11 deploy-preparations e 7 transações, deduplicação `device/inode` | histórica; lote v3 **10/10**, recuperou **6.942.289.920 B**, NÃO repetir |
| [Política e receipts P00](CAPACITY_RECOVERY_POLICY.md) | `audit → prepare → AUTHORIZE_ONCE → execute`, bateladas 3/3, interrupções e pendências com hashes | lote de três archives: **458.964.992 B** recuperados; NÃO repetir |
| [Estado canônico histórico](CURRENT_STATE.md) e [registro verificável](CURRENT_STATE.json) | campanhas, grafo, backups e encerramentos por geração | consultar entries/receipts terminais; não usar snapshot antigo como estado vivo |
| [Lifecycle de artefatos](DEPLOY_ARTIFACT_LIFECYCLE.md) | listas de raízes, `PRESERVE`, `RETURN_CHAIN`, `RETENTION_DEBT`, links compartilhados, retirada b96 e demais gerações | não reabrir itens `SANITIZED`; toda fotografia exige compatibilização apenas para os candidatos restantes |
| [Lições E1.4](../reviews/CONVERTA_E1_4_CONTINUIDADE_E_LICOES_2026-11-13.md) | cache npm, cópia privada sem checkout, lock, cache Next, reconciliador, wrapper | falhas corrigidas por PR #382–#388; não reproduzir em nova geração |

**Proibições:** não executar `du -a`/auditoria global de novo como ponto de partida, não somar `du` de hardlinks como recuperação, não reabrir lote terminal, não reemitir intenção consumida, não recalcular SHA imutável sem necessidade, não apagar por idade/tamanho, não executar `prune`, `rm` genérico, glob ou `git worktree remove --force`. Reabrir fotografias existentes primeiro; recapturar somente dados **voláteis e dirigidos** dos candidatos realmente pendentes no momento de seu `prepare/execute`. Se for indispensável um inventário amplo novo, justificar explicitamente qual campo não coberto impede decisão e limitar custo/cgroup/tempo pela política.

## 2-A. Reconciliação posterior — lote P00 de quatro releases legadas JÁ SANITIZADO

**13/11/2026, última verificação dirigida informada pelo Codex; sem nova retirada.** A qualificação histórica registrada no backlog de 07/11, inicialmente descrevendo `3630e16`, `d7de6453`, `ec2a9fde` e `ef7db111` como candidatas potenciais, foi **superada** por receipts produtivos terminais posteriores. A verificação dirigida encontrou as quatro releases **ausentes**. Não há `audit`, `prepare`, `AUTHORIZE_ONCE` ou `execute` a repetir para elas.

| Release | Receipt terminal informado (abreviado; reabrir autoridade privada para SHA integral) | Bytes físicos atribuídos no receipt | Estado verificado |
| --- | --- | ---: | --- |
| `immutable-3630e16-vps-20261024T195842Z` | `19e45fc4…f23c` | 988.524.544 | `SANITIZED`, ausente |
| `immutable-d7de6453-vps-20261024T221500Z` | `3cd34156…fccc` | 988.606.464 | `SANITIZED`, ausente |
| `immutable-ec2a9fde-vps-20261024T162005Z` | `dfc0e535…cfcc` | 988.528.640 | `SANITIZED`, ausente |
| `immutable-ef7db111-vps-20261024T174000Z` | `416e4173…4142` | 988.508.160 | `SANITIZED`, ausente |

**Total atribuído às retiradas anteriores: 3.954.167.808 B; remanescente físico desse lote: 0 B.** Os receipts informam quatro comandos históricos `ATTEMPT → RESULT(exitCode=0) → VERIFIED`, um por release, e `remainingDerivedPaths=[]`. A verificação atual executou **zero** comandos destrutivos. Última capacidade VPS informada: **7.106.207.744 B** e **8.743.986** inodes livres, sem nova varredura integral. Essas atribuições não equivalem à variação exclusiva de `df` e não devem ser somadas novamente aos lotes históricos sem confrontar receipts/escopos.

**Autoridades coletivas informadas (prefixos, não substituem os originais):** qualificação `865d015b…497e`, materialização `bb1b1531…7a2e`, prepare terminal `cad7092a…e8f9`. Antes de usar qualquer uma como autoridade operacional, recuperar os SHA integrais dos arquivos privados; não fabricar hashes nem reproduzir o lote. Classificação: `TERMINAL_SANITIZED / NO_FURTHER_ACTION`.

**Localização documental:** este arquivo está rastreado no branch canônico `review/campaign-recovery-20260926`, merge `2a55c80e840f593e8da73a18da8575445856cea9` (blob `560806d3e4e2d54f4fb843bd96e74a7edc764722`). Se ausente no checkout local do operador, verificar primeiro `git rev-parse HEAD`, branch e remote/ref, sem reemitir inventário, alterar receipts ou presumir que o arquivo não foi integrado.

## 2-B. Cinco runtimes pré-contrato — JÁ SANITIZADOS

**14/11/2026, fechamento terminal informado e reaberto pelos arquivos privados.**
Os cinco caminhos do lote `p00-five-runtimes-exceptional-20261113-v1` estão
`TERMINAL_SANITIZED / DO_NOT_REPEAT`. Receipt
`3fcb72eaebb343c233d417102749f7bdd0fe1b93e1bd243384ba1e6c27c1fa06`,
journal `1fb2c129e86e4f33cfa310ec4461ff0592287b50102067f63738fd116e805c94`
e autorização `a20c6df524b5bdf1ce54a0065e7a3689c4a0cb55b6b87c2ebfe738e9ce9ae298`
registram 5/5 efeitos verificados. Recuperação física: **5.055.328.256 B e
180.704 inodes**. Saldo terminal: **12.142.841.856 B e 8.924.606 inodes
livres**.

A custódia integral externa permanece no ThinkPad com archive
`e806a178239525e093466b6bf962f7c1025f38a8245da26ee9f2c3584e26a739`,
índice `43e84827b27d9dcf68cac9a2eecfee0cace4d5099b63c0c952b55dc316f33cd5`
e receipt `f9151e22c0ce044d10e79fe736f62730d66e605e553c3110d96e535a6fb031c2`.
Ela não deve ser retirada nem retransmitida. O procedimento excepcional foi
restrito às identidades literais, exigiu restauração, observação privilegiada
completa, locks, autorização, journal e readback; não cria allowlist genérica.

### Próximo lote dirigido — decisão documental

| Identidade / classe | Situação | Capacidade documentada | Proteção e autoridade | Mecanismo / decisão |
| --- | --- | ---: | --- | --- |
| `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb7455-20261006T010000Z/window/worker-package-audit` — `CLOSED_PREPARATION_MANIFEST_DISPOSITION` | presente; audit v5 terminal DENY | 365.674.496 B | autoridade `/opt/re7online/releases/worker-minimal-reactive-afbb7455-verified`, manifesto schema 2, `PACKAGE_FILES.sha256` e 11 links | consumidor existente; **lote priorizado, bloqueado por `DISPOSITION_TREE_DIRECTORY_IDENTITY`** |
| `/opt/re7online/deploy-control/ef7db111-prep/node_modules` + `/opt/re7online/deploy-control/ef7db111-prep/apps/whatsapp-agent/dist` — `CLOSED_DEPLOY_CONTROL_DERIVED_TREE` | 602.820.608 B foram qualificados no plano DENY; não autorizados | 602.820.608 B | manifesto e digests preservados; raiz/worktree/fontes protegidos | perfil exige quatro candidatos e mínimo 949.141.504 B; **preservar, não formar lote parcial** |
| `/opt/re7online/deploy-control/ef7db111-prep/apps/whatsapp-agent/node_modules` + `/opt/re7online/deploy-control/ef7db111-prep/.next` | presentes na fotografia terminal; não qualificados | 346.320.896 B | 1.123 folhas historicamente graváveis por grupo/outros | impedimento `DEPLOY_CONTROL_TREE_IDENTITY`; **preservar** |
| `/opt/re7online/deploy-control/*` — worktrees históricos enumerados em 06/11 | nenhum receipt de elegibilidade | 1.601.449.984 B históricos para a raiz | controles/evidências e conteúdo não reconciliado | consumidor moderno não retroqualifica estoque; **preservar** |
| geração falha `immutable-fa10f4f5-external-20261112T211724Z` no builder | dívida fora da VPS | ~78.295.040 B | lifecycle/evidências próprias | não aumenta capacidade da VPS; tratar separadamente |

O próximo lote fechado é, portanto, somente `worker-package-audit`. A leitura
dirigida de 14/11 confirmou device/inode, UID/GID, modo e nlink exatos da raiz,
dos três ancestrais e da autoridade, mas enumerou **1.023 diretórios internos
`deploy:deploy 0775`**. Isso reproduz materialmente
`DISPOSITION_TREE_DIRECTORY_IDENTITY`; não existe delta que autorize repetir o
audit v5.

**Decisão contratual de 14/11:** `CONTRACT_DELTA_REVIEWED_MERGE_READY`. O
manifesto fecha todas as folhas regulares e os 11 links, mas o schema vigente não
vincula uma política autenticada para a relação completa de diretórios internos;
o consumidor apenas rejeita qualquer bit `0022`. Por isso, nem a contagem de
1.023 diretórios nem o plano terminal negado autorizam converter `0775` em PASS.
A alteração implementada estende somente a disposição literal
`p00-worker-package-audit-afbb7455-v1`: derivar o conjunto exato de diretórios
dos caminhos de folhas e links já selados, vincular sua relação canônica ao
manifesto e admitir `0775` exclusivamente para `deploy:deploy` quando o grupo
`deploy` tiver somente o principal `deploy`. `audit`, `prepare` e `execute`
devem reabrir esse binding, recapturar identidades sob os locks e exigir zero
referências e writers pelo observador privilegiado. Diretório extra/ausente,
modo diferente, outro owner/grupo, grupo ampliado, relação divergente ou drift
entre fases continua sendo negativa material.

Não há `chmod`, exceção por prefixo, allowlist genérica nem alteração dos
efeitos: permanecem `unlink` literal por folha e `rmdir` literal em pós-ordem.
A regressão fechada cobre relação extra, modo/owner/grupo divergente, principal
adicional, mudança concorrente de diretório ou folha e drift em `prepare` e
`execute`; a suíte integral do consumidor passou 154/154 e preservou os perfis
anteriores. O consumidor tem SHA-256 `24a42444c0db890616de3fb40b8e46812f66433b230547835f7010e30632ff09`
e o materializador vinculado `903cb4f162a254a89dde52b47ff150079098da392bea83528f176a5905352d20`.
A revisão final do HEAD `d65a8f0a…`, árvore `954217f2…`, não encontrou
relaxamento dos perfis anteriores; a CI `43614190415` passou 4/4. Depois da
integração autenticada caberá **um** novo `audit` produtivo contido e somente
leitura; `prepare` e autorização destrutiva continuam fronteiras posteriores e
separadas. Nesta reconciliação foram executados zero comandos destrutivos e a
manutenção PM2 do worker permanece fora deste lote.

O PR #394 permanece draft no HEAD `992001005c6eba20b85e80f0b8cf62194a725784`.
Sua finalidade específica — completar autoridade AF26 para os mesmos cinco
runtimes — foi superada pelo fechamento excepcional terminal. Ele não deve ser
integrado automaticamente; qualquer utilidade genérica remanescente exige revisão
independente e não reabre o lote 5/5.

## 2-C. Descoberta dirigida posterior aos lotes 5/5 e 10/10 — 14/11/2026

### Corte econômico posterior — lotes mínimos de 5 GB

O candidato `worker-package-audit` foi suspenso por decisão do owner: seus
365.674.496 B não justificam a sucessão administrativa preparada. O PR #396 foi
encerrado sem merge, preservando HEAD `fdc69b64…`, árvore `7b69126d…`, CI
`43618491422` 4/4 e `HELPER_PROOF_IDENTITY` como histórico. Não repetir audit v5,
instalação, `prepare` ou retirada.

Como a fotografia de 13/11 não identificava lote elegível acima do novo piso, foi
executada uma única recaptura pelo coletor estrutural comprovado, limitada a
metadados e ocupação, sob `timeout 310`, `ionice -c3` e `nice -n10`. A captura
durou 47,3 s, tem SHA-256 `cc8fa5959f8097a237ea1b7ffa7c194995220e7332a068ae62fbcff97f772024`
e não fez hashing de conteúdo. O saldo observado foi 22.894.850.048 B e
9.290.193 inodes disponíveis.

| Lote/grupo | Caminhos | Bytes físicos | Classe/evidência | Equivalência com sucessos | Custódia | Custo/risco | Decisão |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| Releases históricas não qualificadas | 28 filhos literais remanescentes de `/opt/re7online/releases`; maior subconjunto são os três workers já preservados | **2.510.159.872** | `HISTORICAL_UNQUALIFIED`; inventário estrutural + custódia worker 3/3 | procedimento excepcional seria conhecido, mas o conjunto inteiro não alcança o piso | parcial; workers 3/3 preservados | abaixo de 5 GB e referências/contratos distintos | **não selecionar** |
| Releases produtivas e retornos | seis releases `ACTIVE`, `ROLLBACK_REQUIRED` ou `TRANSITIVE_RETURN` | **6.325.665.792** | grafo atual e seleção produtiva | nenhuma: exclusão viola produção/rollback | não aplicável | risco produtivo inaceitável | **PRESERVE** |
| Releases com conteúdo privado | nove releases imutáveis classificadas `PRIVATE_DATA_DEPENDENCY` | **8.897.130.496**; `.data` físico: **1.167.360**; restante derivado potencial: **8.895.963.136** | `.data` físico interno e runtime instalado | difere dos sucessos: `.data` não é symlink externo e entraria no efeito sobre o pai | nenhuma custódia integral/restauração das nove está vinculada | risco de retirar sessões/credenciais/arquivos tenant; diretório inteiro não é vital, mas o efeito atual é indivisível | **PENDENTE POR PROVA ESPECÍFICA** |
| Outputs + fontes | `/opt/re7online/build-output` (**3.548.393.472**) e `/opt/re7online/release-sources` (**2.009.833.472**) | **5.558.226.944** | outputs guardam pacote/manifest/índice/lifecycle; fontes `freeform-window-af26*` são autoridades históricas únicas | não é lote homogêneo; `build-output` isolado fica abaixo do piso e fontes não equivalem a resíduos | autoridades ficam nesses próprios caminhos | remover fontes perderia prova; separar payload de controle exigiria qualificação própria | **PENDENTE POR PROVA ESPECÍFICA / fontes VITAIS** |
| Preparações persistentes | `/opt/re7online/backups/converta-persistent/preparations` | **13.658.386.432** na medição da raiz | receipts, journals, requests, manifests, provas e payloads históricos coexistem | difere dos sucessos: 176 preparações e várias classes, sem efeito/runtime fechado comum | custódias externas existem somente para lotes terminais específicos | raiz inteira não é vital, mas inexiste partição autenticada entre evidência única e cópia dispensável | **PENDENTE POR PROVA ESPECÍFICA** |

Resultado: **zero lotes elegíveis de pelo menos 5.000.000.000 B** e potencial
físico qualificado igual a **0 B**. Não existe “melhor lote” executável. A menor
próxima ação é nenhuma: encerrar a descoberta e só reabrir se um inventário
futuro, produzido por necessidade operacional independente, revelar um lote
homogêneo acima do piso. Não criar coleta, PR ou adaptação para fabricar esse
resultado.

### Reavaliação objetiva das retenções

| Conjunto | VITAL COMPROVADO | RESÍDUO COMPROVADO | PENDENTE POR PROVA ESPECÍFICA |
| --- | --- | --- | --- |
| Nove releases privadas | 1.167.360 B de `.data` físico, potencialmente contendo sessões, credenciais e persistência tenant | 8.895.963.136 B são runtime derivado potencial, mas não efeito isolado autenticado | provar inatividade ou preservar/restaurar cada `.data` com disponibilidade adequada; o efeito excepcional atual remove o pai inteiro |
| Preparações | receipts, journals, manifests, índices, requests e provas necessários a recuperação e não repetição | payloads duplicados podem existir, mas nenhum subconjunto de 5 GB está autenticado como dispensável | relação literal por preparação, blocos sem dupla contagem e autoridade externa dos payloads |
| `build-output` | pacotes, manifests, índices e lifecycle preservados por contrato | runtimes derivados anteriores já foram retirados ou estão ausentes; não há 5 GB de runtime descartável comprovado | duplicação externa dos payloads remanescentes; não usar `release-sources` para completar artificialmente o piso |
| `release-sources` | `freeform-window-af26` e `freeform-window-af26-cumulative-20261002`, autoridades históricas únicas | nenhum resíduo comprovado | somente autoridade sucessora poderia permitir reclassificação; não é necessária à operação atual |
| Releases históricas não qualificadas | três workers têm custódia 3/3; `afbb` ainda é citado por `PWD` herdado | nenhum conjunto de 5 GB; soma total 2.510.159.872 B | referências/contratos individuais e piso econômico; não agrupar com classes diferentes |

Não existe lote de pelo menos 5 GB classificado integralmente como `RESÍDUO
COMPROVADO`. O maior potencial técnico é o restante derivado das nove releases
(8.895.963.136 B), mas `.data` interno é diferença operacional relevante e impede
aplicar diretamente o precedente dos lotes com `.data` externo. Pela regra do
owner, registrar a incompatibilidade e seguir; os demais conjuntos também não
produzem lote direto. Nenhuma implementação ou cópia foi iniciada.

### Saneamento estrutural dirigido e política local definitiva — 14/11/2026

Uma leitura dirigida, sem conteúdo de tenants e sem hashing integral, reabriu
somente os bindings voláteis das nove releases privadas. A evidência tem SHA-256
`d164399b2ac6d51a3d44e2950d4452856391ac72117f18adbf5e0eb1c61e3354`.
Nenhum dos nove caminhos aparece em `current`, PM2 vivo ou dump salvo; também não
há mount interno. As ocorrências no grafo estão exclusivamente no catálogo
`installedVerifiedReleases`, e não em papéis de seleção ou retorno. A varredura
dirigida de 27 processos do usuário `deploy` encontrou zero referências, mas
registrou 52 falhas transitórias de leitura em `/proc`; portanto ela sustenta o
planejamento, não substitui a observação privilegiada completa exigida antes de
qualquer efeito.

Os nove `api-runtime/.data` são diretórios físicos internos, não symlinks. Eles
somam **1.167.360 B físicos, 836.313 B lógicos e 158 entradas**, sem falha de
leitura na agregação. Seu conteúdo não foi exibido. A ausência em PM2/current não
prova dispensabilidade de sessões, credenciais ou persistência; por isso esses
bytes continuam `VITAL_UNTIL_MIGRATED_OR_INDEPENDENTLY_RECOVERABLE`. O restante
**8.895.963.136 B** é runtime derivado potencial, mas só se torna
`RESÍDUO_COMPROVADO` depois de cada `.data` estar fora da raiz candidata, com
identidade, integridade, disponibilidade e restauração autenticadas, e depois de
uma observação privilegiada completa negar referências e writers.

| CONJUNTO | BYTES FÍSICOS | NECESSIDADE REAL NA VPS | CONTEÚDO VITAL | CUSTÓDIA DISPONÍVEL | DESTINAÇÃO | POTENCIAL RECUPERÁVEL | BLOQUEIO |
| --- | ---: | --- | --- | --- | --- | ---: | --- |
| nove releases privadas | 8.897.130.496 | nenhuma seleção/PM2/retorno; catálogo apenas registra instalação verificada | `.data` interno: 1.167.360 B | nenhuma custódia integral/restauração vinculada | mover cada `.data` para raiz persistente dedicada ou custódia operacional restaurável; preservar release integral; depois aposentar pais literais | 8.895.963.136 B mantendo `.data` local fora dos pais; até 8.897.130.496 B somente se disponibilidade externa substituir legitimamente a local | migração/custódia ainda não executada; `/proc` privilegiado pendente |
| preparações persistentes | 13.658.386.432 | controles terminais pequenos precisam permanecer consultáveis; payloads não precisam necessariamente permanecer locais | receipts, journals, requests, manifests, índices e única prova de recuperação | externa apenas para lotes terminais específicos | por transação: preservar o conjunto de controle local e externalizar payload/archive depois de readback; nunca retirar a raiz agregada | **não quantificado** sem partição literal já autenticada | 176 escopos/classes misturados; não há subconjunto físico ≥5 GB provado como resíduo |
| `build-output` | 3.548.393.472 | não participa do runtime ativo; serve como autoridade de pacote/exportação | pacote, manifesto, índice, lifecycle e evidências ainda sem sucessor | parcial, por geração | após aceite e custódia externa: payload sai; localmente permanecem hashes/receipts mínimos | abaixo do piso econômico isoladamente; **não qualificado** | ausência de mapa geração→custódia para todo o estoque |
| `release-sources` | 2.009.833.472 | não serve tráfego, mas sustenta prova e recuperação histórica AF26 | duas fontes históricas únicas | não demonstrada | permanecer local até existir sucessora externa autenticada e restaurável; não somar a outputs para fabricar lote | 0 B hoje | única autoridade conhecida |

**Decisão executável:** o único lote material prioritário é o das nove releases,
mas sua primeira operação não é retirada: é um contrato de migração/preservação
dos nove `.data` literais, sem leitura de conteúdo além do necessário, seguido de
archive integral, readback e restauração. A retirada só pode ser preparada numa
fronteira posterior, com intenção literal e autorização própria. Preparações,
outputs e fontes não formam lote de exclusão; nenhum total bruto autoriza
`rm`, glob ou descarte agregado.

#### Política permanente de armazenamento

1. **Releases locais:** por componente, manter a release ativa e **um** retorno
   imediato autenticado. Retorno transitivo adicional só permanece com binding
   explícito, `retainUntil` e owner; sem esses campos, a instalação seguinte
   deve negar, não apagar automaticamente.
2. **Persistência tenant:** nenhuma release imutável nova pode conter `.data`,
   upload, sessão, mídia, credencial ou volume gravável dentro de sua raiz. O
   instalador deve exigir raiz persistente externa e vínculo autenticado. A
   existência de persistência interna é negativa de admissão, nunca convite a
   excluí-la.
3. **Orçamento por geração:** contrato antes da alocação deve fixar bytes e
   inodes máximos para worktree, cache, build, pacote, staging, release,
   evidências e reserva. O teto duro é `capacityReservationBytes/Inodes`; excedê-lo
   nega a fase. Após fechamento, o limite local é o conjunto de controle
   enumerado no contrato; payloads terminais têm residual local alvo **zero**
   depois de custódia/readback ou disposição autorizada.
4. **Preparações e evidências:** journal, receipt, índice, hashes e autoridades
   mínimas permanecem consultáveis. Archives, cópias, staging e pacotes terminais
   vão para custódia externa autenticada quando ainda necessários; caso contrário
   recebem disposição literal. `EVIDENCE_REQUIRED` não preserva automaticamente
   toda a árvore pai.
5. **Fechamento automático permitido:** somente classificação, medição,
   publicação durável de receipts e solicitação única de aprovação. Exclusão
   produtiva continua exigindo intenção literal, gates de produção/tenants,
   locks, observação completa e autorização aplicável.
6. **Interrupção e contabilidade:** toda disposição usa journal
   `ATTEMPT → RESULT → VERIFIED`, reconcilia efeitos já concluídos e registra
   bytes/inodes antes, pico, depois e residual. Nenhum efeito é repetido por
   ausência de resposta.

Essa política evita recriar a dívida: build descartável termina sem raiz;
instalação não incorpora persistência; e cada geração já nasce com destino
terminal e orçamento verificáveis. Ela não autoriza migração ou retirada nesta
frente.

### Reaproveitamento local das nove releases privadas — 14/11/2026

A reconciliação seguinte reutilizou a evidência `d164399b2a…3354`, os registros
de deploy, as custódias existentes no ThinkPad e somente metadados dirigidos das
autoridades que permanecem na VPS. O relatório complementar tem SHA-256
`d80144956c52f425d589b2bb195d867a044f2eed4e622e4e69e601c4054343d1`.
Não houve hashing integral, leitura de conteúdo privado, transferência, build ou
efeito produtivo.

Os nove pacotes originais continuam presentes: sete em seus `build-output`
canônicos, um no output `a62da468` e um como `.incoming-5c339b2e.tar.xz`. Os
bindings imutáveis de pacote/índice coincidem com os registros versionados. O
total lógico dos pacotes é **1.351.254.084 B** (**1.351.290.880 B físicos**).
Nenhuma das custódias autenticadas já existentes no ThinkPad cobre integralmente
essas nove identidades; a custódia `a62da468` contém evidências de preparações
falhas, não a release instalada nem seu pacote autenticado. Logo, hash documentado
não deve ser confundido com bytes restauráveis locais.

Os `.data` não mostraram escrita depois de **07/11/2026 09:59:06 -03:00**; o
`.data` da API ativa mostrou escrita em **13/11/2026 17:09:08 -03:00**. Combinado
com zero vínculo em `current`, PM2 vivo/salvo e papéis operacionais do grafo, isso
classifica os nove como `HISTORICAL_PRIVATE_DATA` para preservação — não como
conteúdo descartável. A observação de processos anterior teve cobertura
incompleta, portanto o perfil privilegiado ainda é gate obrigatório antes de um
futuro `prepare/execute`.

| CAMINHO | BYTES FÍSICOS | `.DATA` | REFERÊNCIAS PRODUTIVAS | CUSTÓDIA LOCAL | COMPLEMENTO BRUTO MÍNIMO | RESTAURAÇÃO | DECISÃO |
| --- | ---: | ---: | --- | --- | ---: | --- | --- |
| `immutable-17cc77a8-vps-20261104T141039Z` | 989.769.728 | 602.112 | nenhuma; catálogo apenas | não | 148.732.320 | não executada | `CUSTODY_COMPLEMENT_REQUIRED` |
| `immutable-785bde80-vps-20261103T103429Z` | 989.036.544 | 90.112 | nenhuma; catálogo apenas | não | 148.216.180 | não executada | `CUSTODY_COMPLEMENT_REQUIRED` |
| `immutable-911a9708-vps-20261102T221325Z` | 988.966.912 | 81.920 | nenhuma; catálogo apenas | não | 148.211.996 | não executada | `CUSTODY_COMPLEMENT_REQUIRED` |
| `immutable-0fdec8b0-vps-20261028T224726Z` | 988.868.608 | 110.592 | nenhuma; catálogo apenas | não | 148.220.020 | não executada | `CUSTODY_COMPLEMENT_REQUIRED` |
| `immutable-fa63994a-vps-20261030T153352Z` | 988.852.224 | 45.056 | nenhuma; catálogo apenas | não | 148.144.564 | não executada | `CUSTODY_COMPLEMENT_REQUIRED` |
| `immutable-754281d3-vps-20261029T174145Z` | 988.798.976 | 32.768 | nenhuma; catálogo apenas | não | 148.180.076 | não executada | `CUSTODY_COMPLEMENT_REQUIRED` |
| `immutable-708f018c-vps-20261027T152109Z` | 988.770.304 | 110.592 | nenhuma; catálogo apenas | não | 148.186.660 | não executada | `CUSTODY_COMPLEMENT_REQUIRED` |
| `immutable-a62da468-vps-20261024T124726Z` | 988.495.872 | 12.288 | nenhuma; catálogo apenas | não | 148.004.244 | não executada | `CUSTODY_COMPLEMENT_REQUIRED` |
| `immutable-5c339b2e-20261022T125717Z` | 985.571.328 | 81.920 | nenhuma; catálogo apenas | não | 166.525.384 | não executada | `CUSTODY_COMPLEMENT_REQUIRED` |

Resultado: **0/9** integralmente restauráveis do ThinkPad agora; **9/9** com
persistência histórica sem dependência operacional encontrada; **9/9** exigem
preservação adicional. O payload bruto mínimo calculado é
**1.352.421.444 B** (pacotes + `.data`), acrescido somente dos pequenos controles
e do overhead do archive a serem selados. Depois de archive, readback e
restauração 9/9, o potencial habilitável é **8.897.130.496 B**. Antes disso, o
potencial destrutivo autorizado permanece **0 B**.

A menor próxima operação é uma custódia única e fechada: reutilizar os nove
pacotes autenticados na VPS, transferir cada pacote uma vez e anexar somente os
nove `.data` como suplementos privados, sem copiar os runtimes expandidos. O
receipt deve vincular package/manifests/índices, identidades dos `.data`, archive,
readback e restauração isolada por release. Só então cabem observação privilegiada
fresca, intenção literal e autorização destrutiva separada. Não há impedimento que
justifique novo executor ou migração de produção; falta apenas executar e provar
essa custódia já compatível com o precedente excepcional.

#### Custódia e restauração integral 9/9 — concluída em 14/11/2026

A operação posterior executou exatamente a custódia fechada acima, sem copiar os
runtimes expandidos e sem efeito destrutivo. O lote
`p00-nine-private-releases-exceptional-20261114-v1` terminou em
`PRESERVATION_VERIFIED / RESTORE_9_OF_9_PASS`:

- inventário de origem: `d164399b2a…3354`;
- manifesto privado dirigido dos 158 itens `.data`: `8c22c6d19a…17f4`;
- receipt de transferência: `0eae77e095…eaa9`;
- receipt de preservação: `46d3049a71…ad87`;
- índice privado da custódia: `48eb52f473…1699`;
- fotografia sanitizada pós-operação: `273911dd35…a5e8`.

Os nove pacotes úteis somam **1.351.376.292 B** lógicos e **1.351.413.760 B**
físicos na VPS. Os nove complementos `.data`,
preservados separadamente e sem seguir symlinks, somam **747.520 B** como
archives; o transporte útil sem duplicação foi **1.352.123.812 B**. A diferença
contra a estimativa anterior decorre do pacote autoritativo `a62da468`: o caminho
pré-correção continha `05f1452f…e252`, enquanto o deployment record vincula o
repack `fdac4ef8…66e4` em `…-repacked-uploads-fix`. O parcial divergente não foi
publicado e foi descartado; as sete publicações anteriores foram reaproveitadas.

Cada restore validou cobertura exaustiva, hashes, tipos, modos e destinos de
symlink. O pacote legado `5c339b2e` usa os nomes históricos
`release-manifest.json`/`release-index.json`; seus hashes coincidem com as
autoridades registradas, sem flexibilização do verificador. A alocação física
reconstruída foi **8.899.563.520 B**, diferença de blocos do filesystem local em
relação aos **8.897.130.496 B** medidos na VPS, sem diferença material de folhas.
Os nove candidatos permaneceram presentes, a produção e os tenants não foram
alterados e a quantidade de comandos destrutivos foi zero.

Estado sucessor: **9/9 restauráveis**, potencial físico preparado
**8.897.130.496 B**, retirada autorizada **0 B**. A próxima operação mínima é
instalar/reutilizar perfil privilegiado fechado para as nove identidades,
recapturar referências/writers sob locks e materializar a intenção 9/9. Nenhum
`AUTHORIZE_ONCE` ou `execute` pertence a esta etapa.

A descoberta reutilizou a fotografia estrutural
`/tmp/re7-vps-capacity-structural-20261113.json`, SHA-256
`8962e14ac599329dd883b70856aa99dd0727de4adc71c96868c008a88dfa8d92`,
e eliminou primeiro os 15 caminhos `TERMINAL_SANITIZED / DO_NOT_REPEAT`. A
atualização foi estritamente dirigida: `du -x -B1 -s` nos filhos literais
selecionados, sob `ionice -c3`, `nice -n10` e timeout de 240 segundos por
passagem, seguida de readback de `current`, grafo, PM2 vivo/salvo e listeners.
Não houve nova auditoria global, hashing integral, transferência, `prepare` ou
efeito destrutivo. O saldo observado foi **20.631.146.496 B livres**.

Esta seção é a fotografia anterior ao fechamento frontend 3/3. Os três primeiros
caminhos estão agora `TERMINAL_SANITIZED / DO_NOT_REPEAT`; somente os quatro
restantes continuam pendentes. A medição conjunta histórica,
em uma única passagem e sem somar filhos, registrou **3.345.813.504 B e 111.106
inodes**. Nenhum aparece em `current`, no grafo vigente, nos `cwd` do PM2 ou nos
listeners ativos; essa ausência operacional é condição necessária, mas não
autoridade de retirada.

| Caminho literal / classe | Device:inode | Bytes / inodes atuais | Autoridade já disponível | Proteção ou impedimento | Decisão |
| --- | ---: | ---: | --- | --- | --- |
| `/opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front` — `LEGACY_RUNTIME_EQUIVALENT` | `64769:5778416` | 637.677.568 / 25.519 históricos | custódia/restauração `86654281…18be` | receipt terminal `ece95abe…65c7` | `TERMINAL_SANITIZED / DO_NOT_REPEAT` |
| `/opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front` — `LEGACY_RUNTIME_EQUIVALENT` | `64769:5803927` | 639.291.392 / 25.587 históricos | custódia/restauração `86654281…18be` | receipt terminal `ece95abe…65c7` | `TERMINAL_SANITIZED / DO_NOT_REPEAT` |
| `/opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front-css-17bd5fb8` — `LEGACY_RUNTIME_EQUIVALENT` | `64769:5829522` | 640.053.248 / 25.614 históricos | custódia/restauração `86654281…18be` | receipt terminal `ece95abe…65c7` | `TERMINAL_SANITIZED / DO_NOT_REPEAT` |
| `/opt/re7online/releases/worker-bf5f1d76-f06d49cb-91230f88-b66bb89a` — `LEGACY_RUNTIME_EQUIVALENT` | `64769:2966832` | 334.172.160 / 8.393 | archive privado de retorno do worker ainda presente | `.data` é symlink externo e deve permanecer fora de qualquer archive/efeito | segundo lote dirigido |
| `/opt/re7online/releases/worker-minimal-hybrid-b9b58177-verified-v3` — `LEGACY_RUNTIME_EQUIVALENT` | `64769:5557758` | 365.600.768 / 8.070 | pacote `worker-minimal-b9-v3.tar.gz` ainda presente | cobertura integral e restauração ainda não vinculadas ao runtime; `.data` externo protegido | segundo lote dirigido |
| `/opt/re7online/releases/worker-minimal-reactive-afbb7455-verified` — `LEGACY_RUNTIME_EQUIVALENT` | `64769:5770335` | 365.678.592 / 8.081 | manifests e cadeia histórica preservados | pacote principal não foi localizado na custódia registrada; `.data` externo protegido | segundo lote dirigido |
| `/opt/re7online/releases/campaign-eligibility-recovery-final-reviewed-20261008` — `LEGACY_RUNTIME_EQUIVALENT` | `64769:6029469` histórica | 363.339.776 / 9.842 históricos | custódia `0c8f6d00…da6a`, restauração PASS e receipt terminal `8c6e5013…6082` | caminho ausente; `.data` externo preservado | `TERMINAL_SANITIZED / DO_NOT_REPEAT`; 363.323.392 B / 9.839 inodes recuperados |

### Priorização fechada

1. **Frontend 9f4/fa60/fa60-css:** **1.917.022.208 B e 76.720 inodes**;
   próximo lote escolhido. Não há `.data` nessas três árvores. Antes de copiar,
   confrontar o pacote fa60 existente com a matriz de restauração; transferir
   somente bytes ainda sem autoridade recuperável. A retirada exige custódia
   externa, restore, perfil literal, gates voláteis, intenção e autorização
   próprias.
2. **Workers b66/b9/afbb:** **1.065.451.520 B e 24.544 inodes**; segundo lote,
   com os três destinos externos `.data` explicitamente preservados.
3. **Campaign API:** lote concluído; **363.323.392 B e 9.839 inodes** recuperados,
   com `.data` externo preservado. Excluir de toda seleção futura.

Restam, portanto, **dois lotes grandes acima de 1 GB** nessa fotografia. O lote
médio Campaign API já é capacidade efetivamente recuperada. Os `build-output`
remanescentes somam cerca de 3,55 GB,
mas misturam pacotes, contratos e evidências de releases terminais ou protegidas;
`release-sources` mantém autoridades históricas e `deploy-control` mantém
controles/evidências com negativas próprias. Esses grupos permanecem
`PRESERVE/UNCLASSIFIED`, fora do lote escolhido.

### Comparação com `worker-package-audit`

| Controle | Lote terminal 5/5 | `worker-package-audit` | Decisão |
| --- | --- | --- | --- |
| Natureza | cinco releases runtime pré-contrato | árvore derivada enumerada de preparação | usar primeiro o consumidor normal, que já conhece a classe |
| Autoridade de conteúdo | custódia integral externa + restore | autoridade física `worker-minimal-reactive-afbb7455-verified`, relações de arquivos e 11 links | não copiar novamente enquanto a autoridade continuar íntegra |
| Dados únicos/privados | archive integral; `.data` externo não seguido | manifesto fecha exatamente a árvore; autoridade/overlay ficam fora dos efeitos | qualquer extra ou relação divergente preserva |
| Produção/rollback | grafo, current, PM2, dump e `/proc` recapturados | mesmos controles já fazem parte de `capacity-recovery.py` | reutilizar, sem perfil paralelo |
| Permissões | cinco raízes literais `0700` | raiz/ancestrais corretos, mas 1.023 diretórios internos `0775` | negativa atual é legítima pelo contrato |
| Efeito | cinco `rm -r --one-file-system` fechados | `unlink` por folha e `rmdir` pós-ordem, sem `rm -r` | efeito normal é mais restrito e deve ser preservado |

O modo `0775` não prova, isoladamente, writer ativo; na fotografia ele representa
incompatibilidade com a regra que proíbe árvore candidata gravável por grupo ou
outros. Ainda assim é risco concreto de mutabilidade entre relação autenticada e
efeito, e o audit anterior não pode ser convertido em PASS. A menor ação segura é
o delta fechado descrito acima, no consumidor existente. Ele não altera a
autoridade de folhas, não reutiliza o perfil 5/5 e não mistura a correção futura
da definição PM2 do worker com recuperação de capacidade.

## 3. Classes e decisões de limpeza

| Classe operacional | Exemplos | Tratamento |
| --- | --- | --- |
| `ACTIVE / ACTIVE_DEPENDENCY` | API/frontend/worker vivos, PostgreSQL, Docker volumes, dados tenant/mídia, overlay `.data` | nunca retirar |
| `ROLLBACK_REQUIRED / RETURN_CHAIN` | releases anteriores e retornos transitivos, dumps, markers e provas de recuperação | manter até grafo atualizado provar ausência de papel |
| `UNIQUE_EVIDENCE / ARCHIVE` | falhas Prisma/OOM, backups e preparações, receipts, package/manifests/índices | conservar ou arquivar com custódia verificável; não classificar como lixo |
| `TERMINAL_SANITIZED` | lote VPS 24/10; v3 26/10; archives 3/3; retirements b96/a838; builder sucesso fa10 | irrepetível: usar apenas recibo |
| `RETENTION_DEBT / PRESERVE` | builder a838 worktree v2 `1.027.608.576 B` com preservação até **10/12/2026 20:59:59 Fortaleza**, v1 `671.199.232 B`; outras dívidas históricas | impedimento real; não retirar por calendário, tratar por prova e autorização próprias |
| `FAILED_GENERATION_UNRECONCILED` | builder `immutable-fa10f4f5-external-20261112T211724Z`, ~**78.295.040 B** | candidato de análise dirigida separado; não aproveitar autorização do builder de sucesso |
| `CANDIDATE_FOR_REVIEW` | archives/outputs/preparações derivadas remanescentes comprovadamente sem referências | só qualificar após confronto com mapa, grafo, custódia, classes, links e observador; `audit/prepare` não implica autorização de `execute` |

Na VPS, os maiores grupos **históricos** incluem `releases` (~28,69 GB na auditoria anterior), `build-output` (~5,83 GB), `build-worktrees` (~3,07 GB), `release-sources` (~2,01 GB), `deploy-control` (~1,61 GB) e `failed-preparations` (~1,73 GB). Esses valores **não são ocupação atual** e vários caminhos foram retirados depois. Categorias abaixo de `/opt/re7online/backups/converta-persistent`, DB, mídia e evidências não são lixo presumido. Não prometer recuperação com base na diferença entre fotografias.

**Ordem econômica recomendada:** (1) retirar automaticamente da fila os nomes `TERMINAL_SANITIZED`; (2) preservar `ACTIVE/ROLLBACK_REQUIRED/UNIQUE_EVIDENCE`; (3) trabalhar só candidatos derivados já mapeados e planos PASS ainda válidos (ex.: `worker-package-audit` conforme seu contrato, não pressupor autorizado); (4) avaliar separadamente a geração falha 211724Z no builder; (5) somente depois decidir se falta inventário mais profundo. Nunca usar a pressão de capacidade para remover prova única ou comprometer rollback.

## 4. Padrão-alvo para novas atualizações — sem afirmar automação já instalada

**Preferência arquitetural:** builder externo isolado, pacote único verificado, transferência única, instalação inerte, aceitação, promoção por componente e `pm2 save` único, com fechamento auditado da geração. O piloto API-only `a838bd33` e release API+frontend `fa10f4f5` demonstraram viabilidade produtiva. **O runbook ainda exige seleção explícita do builder externo e qualificação entre hosts; não interpretar a preferência como autorização permanente ou CI/CD já automatizado.** Mudar o default executivo só após implementar e aprovar a rota em sua interface de admissão/runbook, sem bypass de gates nem alteração produtiva silenciosa.

Exigir **antes da primeira janela produtiva** uma fixture representativa `request → producer → install → driver → wrapper → finalize → retention`, incluindo checkout Git, locks reais simulados, cache de imagens Next, sobreposição privada `.data`, retorno API/frontend, PM2, snapshot/capacidade e interrupção depois de `pm2 save` sem segundo save. Testes isolados PASS não bastam. Não tentar em produção para descobrir incompatibilidades do control plane.

**Automatizar verificações e disposições não destrutivas:** admissão, orçamento, reservas, inventário dirigido, isolamento tenant, diff de componentes, checks CI, contratos producer↔consumer, staging/health, reporter de hashes e métricas, reaproveitamento de artefatos e journal de fases. **Efeitos produtivos e destrutivos** continuam exigindo uma decisão expressa por escopo/contrato; a aprovação pode cobrir uma sequência fechada de efeitos, não uma série de confirmações redundantes. `AUTHORIZE_ONCE` individual é exigida quando o contrato de retirada a exige. Não automatizar exclusão livre, novo save após falha ou upgrade implícito de controle.

**Política de continuidade:** fases terminadas e evidências imutáveis são `COMPLETED/REUSABLE`; checks voláteis são `RECAPTURE_ON_BOUNDARY`; lacuna comprovada é `MISSING`. Cada nova geração tem ledger com `buildCount=1`, `uploadCount=1`, `saveCount<=1`, target/BUILD_ID, tempos, gate e pico físico, bytes/inodes por host, retained-vs-recovered, rollback e receipts. Meta operacional: **zero intervenções para corrigir contrato durante deploy**, não zero validação de segurança.

## 5. Próximas ações NÃO destrutivas, sem repetir o trabalho massivo

1. Registrar esta fotografia terminal e conferir lacunas de registros canônicos sem substituir o histórico.
2. Extrair das fontes já preservadas **somente** candidatos não terminais e suas autorizações/receipts; não executar auditoria integral.
3. Para cada candidato, gerar ficha de decisão `EXISTING_EVIDENCE → FRESH_DELTA → PROTECTED/ELIGIBLE → INTENT/AUTHORIZATION`. O resultado `UNKNOWN` significa PRESERVE.
4. Tratar a geração builder falha 211724Z em escopo independente, usando os mecanismos PR #382/#383, sem reabrir o sucesso.
5. Planejar futura adoção do pipeline de build externo como rota normal em um **único trabalho incremental**, só depois de certificar a cadeia completa de ponta a ponta; não abrir sucessão de PRs para erros previsíveis.

**Nada neste registro autoriza exclusões ou altera o estado real dos hosts.**
