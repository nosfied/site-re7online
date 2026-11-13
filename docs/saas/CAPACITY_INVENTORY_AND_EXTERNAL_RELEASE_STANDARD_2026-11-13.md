# Converta — padrão de atualização e ledger de capacidade (VPS + builder)

**13/11/2026. Status: orientação operacional para novas gerações, SEM autorização de build, deploy ou retirada.** A única fonte de comandos executáveis de deploy permanece [DEPLOY_RUNBOOK.md](DEPLOY_RUNBOOK.md); retirada extraordinária segue [CAPACITY_RECOVERY_POLICY.md](CAPACITY_RECOVERY_POLICY.md), e ciclo de vida segue [DEPLOY_ARTIFACT_LIFECYCLE.md](DEPLOY_ARTIFACT_LIFECYCLE.md). [WORKING_PRINCIPLES.md](WORKING_PRINCIPLES.md) prevalece. Valores abaixo são **fotografias históricas ou últimos reports operacionais informados**, não inspeção ao vivo.

## 1. Estado comprovado e irrepetível

**Release ativa:** `immutable-fa10f4f5-external-20261112T233820Z` (API e frontend); worker `immutable-e2e7f17a-20261022T005110Z`. Target `fa10f4f59c9a05328e536dd25a1668c3ba25939e`, BUILD_ID `4j3t9N75vsvYu9t3DoFq4`. Implantação autenticada `DEPLOYED_RETENTION_INCOMPLETE`, journal SHA-256 `45579306a46dbd79a963b9176531673124147e8a7e667eaef72fec7591bf11e5`, `saveCount=1`, dump `3a7566603da04a5bd2ac929b0c9c8993ea5aa587e596d23d8d97c113687eb64a`, marker `ef3cb8edde127f4de841f49f5a329e74fde4a7d34b5fe787463b20d7228fcf5d`, receipt retirement VPS `f12d8260d27f1bc041afddfe8badc0b46cd9f9a8b0a9a732f71b2ebd6a8fa18b`, **0 comandos de retirada na VPS** e lock terminal ausente. Saúde e guarda geração 47 aprovadas na última observação. O termo `RETENTION_INCOMPLETE` refere-se ao snapshot de implantação e não revoga o fechamento posterior do builder.

**Builder de sucesso `fa10f4f5`: encerrado `SANITIZED/CLOSURE_RECORDED`.** Autorização `54f0821a660cedc7f64a851bbfc63b550b7f612b07629ee2b97d4562f4942285`, journal `dfc96283013a0dad6d36e28a68ffa1ea65813f3a1be4b955a192d915c543e351`, receipt `4b4f1a295e5c24acad2d03a8b816925ec46efb790db6ceddbece1c898f93ca7d`, lifecycle `b28caeaf78e0ce006736f8721a8a6ed2a855de8330f7b0934d5654c0b77d69e0`. Remoção `2/2` sem força, raiz e worktree ausentes. Receipt atribui **2.508.197.888 B**, 75.639 entradas (75.640 inodes com raiz). `df` variou **+2.945.175.552 B / +75.652 inodes**, não atribuível integralmente por atividade concorrente; somatório lógico de hardlinks não é medição física. **Nunca repetir esta retirada.** Export receipt `012103fd3dd41987f4352ef61b635e3ba1866c2d3926dc416ac3f6e5d571a6bb` preservado.

**Última fotografia VPS pós-deploy:** `7.080.562.688 B` e `8.743.987` inodes livres; nenhuma nova medição VPS foi feita na retirada do builder (host distinto). Antes do preflight `7.247.413.248 B` livres, delta de disponibilidade `-166.850.560 B`, **não equivale a custo líquido de deploy**. Runtime instalado ~`989.159.424 B`, pacote retido ~`148.213.760 B`; não somar como “recuperável” e nem retirar sem grafo/custódia. O gate histórico de build na VPS foi `9.663.676.416 B`, enquanto recepção/verificação/instalação externa exigia `5.700.927.488 B`; redução ~41% **do gate**, não do consumo permanente.

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
