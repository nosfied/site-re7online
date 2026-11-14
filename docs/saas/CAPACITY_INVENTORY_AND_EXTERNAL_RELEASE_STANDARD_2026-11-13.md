# Converta — padrão de atualização e ledger de capacidade (VPS + builder)

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

**Decisão contratual de 14/11:** `CONTRACT_DELTA_IMPLEMENTED_PENDING_REVIEW`. O
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
Somente depois de revisão e CI desse delta caberá **um** novo `audit`
produtivo contido; `prepare` e autorização destrutiva continuam fronteiras
posteriores e separadas. Nesta reconciliação foram executados zero comandos
destrutivos e a manutenção PM2 do worker permanece fora deste lote.

O PR #394 permanece draft no HEAD `992001005c6eba20b85e80f0b8cf62194a725784`.
Sua finalidade específica — completar autoridade AF26 para os mesmos cinco
runtimes — foi superada pelo fechamento excepcional terminal. Ele não deve ser
integrado automaticamente; qualquer utilidade genérica remanescente exige revisão
independente e não reabre o lote 5/5.

## 2-C. Descoberta dirigida posterior aos lotes 5/5 e 10/10 — 14/11/2026

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
