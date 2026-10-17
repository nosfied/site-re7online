# CSV — análise local e diagnóstico pós-RPC

Base: `4f5bb477ece1cd605c1ad94a0af78a3ed7019292`. Nenhuma VPS, coleta, SELECT, instalação, reparo ou janela nesta rodada. CSV SUSPENSO / LOCAL VALIDATED no alcance ensaiado / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.

## Evidência disponível e primeira fronteira

A análise somente leitura de duas custódias pinadas está em [LOCAL_ANALYSIS.json](LOCAL_ANALYSIS.json), reproduzida por [analyze_custody.py](analyze_custody.py). O envelope de 17/10 tem 60.158 bytes, SHA `18add4ba10e9509cf1527241ff4a6e48e35205519d7bce70713bd07923b58b7d`; o stdout RPC tem 25.655 bytes, SHA `ec71e5a5364035d06ac72e1cef728ce20836cb2e223e5d0dbaa7ad0d4559687a`. RPC entre 12:46:40.163137 e 12:46:40.253593 UTC (09:46 Fortaleza). Peer-before/after passaram na coleta histórica. Estes horários não são observações novas.

O arquivo histórico de recuperação de 16/10 tem 686.080 bytes, SHA `32e0cb1de5dac716027fc8face5cc60f8b996ec0ca9de6b18363cbbb84b30076`. Os três membros usados como referência conferem com os hashes do leitor revisado:

| Membro histórico | Bytes | SHA-256 |
|---|---:|---|
| saved-dump.pm2.private.json | 26270 | c9c54c02b9694328a5aeaa4335efb88135f9bd948b4f786c8e9e4e851efd51e3 |
| source.profile.private.json | 15179 | a062c7020353cb39b0578653ea51475f8e9f9f68a588d1c55eb87cbbd68b6b9e |
| db-owner-bindings.private.json | 365 | 1d67ff65fc300b7bb0fb165e31a69d415d9adb5d111d3b91e444137a3a8eaeeb |

**Excluído no conteúdo disponível:** JSON RPC ilegível; população diferente dos três nomes esperados ou nomes duplicados; divergência dos PIDs retornados; divergência dos campos PM2 cwd/script/interpreter/status/watch contra as referências; ausência/divergência de valor ou tipo dos dez LIVE_FIELDS do frontend. O espelho de ambiente PM2 contém o subconjunto esperado, comparado sem divulgar valores; isso não substitui a leitura canônica de `/proc/environ`.

**Primeira fronteira esclarecível com os registros:** população e campos retornados do RPC, comparados aos membros históricos hash-conferidos. **Primeira fronteira do código após peer-after:** estabilidade pós-consulta de socket/pm2.pid, ainda indeterminada. Não existem no envelope os dois stat_result completos nem o pm2.pid posterior. Também continuam indeterminados os ticks/estado kernel de cada aplicação, cwd/exe/environ atuais, arquivos de referência efetivamente presentes na VPS e saved/fallback atuais. Não se avançou ficticiamente sobre essas etapas com `/proc` sintético. A igualdade local dos membros do tar não certifica os arquivos remotos nem constitui snapshot atômico.

O DENY produtivo original permanece consumido, incompleto e sem causa específica demonstrada. Não é atribuído retrospectivamente a atime, configuração, permissões ou mudança de processo.

## Delta mínimo

[frontier.source](frontier.source) é a fonte editável da fronteira. [compose.py](compose.py) deriva o runner e os auxiliares da versão aceita `9afc2197e4bbc58a6f6a7ae0d9f94d92189ad3a2`, conferindo bytes com Git e registrando [SOURCE_INDEX.json](SOURCE_INDEX.json). As funções/classe fora de frontend/run são comparadas por AST com a origem; driver/launch mudam somente destinos. A integração é inline no runner existente: sem checker, writer, autoridade ou política paralelos. O diagnóstico continua por Capture.observe/event → private_record canônico. Não se executam entrypoints consumidos.

A comparação integral `endpoint.lstat()==meta` é substituída pela igualdade de `lib.meta` antes/depois. A função canônica pinada inclui dev, ino, mode completo, uid, gid, nlink, size, mtime_ns e ctime_ns; exclui atime. Tipo socket e owner continuam verificados separadamente e SO_PEERCRED antes/depois permanece intacto. pm2.pid continua com stable_file(64), no-follow/FD/estabilidade e igualdade de conteúdo; não foi introduzida uma nova exigência de igualdade temporal entre seus metadados.

O ensaio [test_stat_contract.py](test_stat_contract.py), [STAT_PROOF.json](STAT_PROOF.json), usa lstat inicial de socket AF_UNIX local real e vetores nativos os.stat_result controlados. Alterar só atime faz a igualdade integral negar, enquanto os nove campos canônicos permanecem iguais. Alterar cada campo canônico nega. Não se usa utime como prova de mudança exclusiva de atime: utime pode modificar ctime. Não é evidência de que esse fenômeno ocorreu na VPS.

## Diagnóstico identificável e custódia

Cada chamada `checked` registra verification_begin, comando/observação pelo escritor existente e verification_pass ou verification_denied. O terminal DENY inclui denialStage/denialReason. Motivos são literais estáticos ou tradução estrita de mensagens canônicas conhecidas; texto arbitrário de exceção, valores de ambiente e tokens não entram nesses motivos. Classe e errno numérico são preservados quando disponíveis. Não há fallback ou retry.

| Etapa | Negativa estática / objeto preservado privadamente |
|---|---|
| postrpc-socket-stat/type-owner/metadata | indisponibilidade, tipo/owner, deriva dos nove metadados; stat e atime observados |
| postrpc-pid-read/content | leitura instável ou conteúdo divergente; bytes, hash e metadata do stable_file |
| rpc-json/index/population | JSON, estrutura, população; stdout RPC original já preservado |
| application-N-identity/returned-pid/present/ticks/state | leitura, PID, ausência, ticks, estado; resultado e leituras canônicas |
| saved-reference e profile-reference read/hash/json | leitura, integridade, formato; bytes completos/base64, hash e metadata privados antes de validar hash |
| frontend-reference/profile-apps/pair-config-N-name | referência ausente ou schema inválido |
| pair-config-N / frontend-contract | motivo canônico estático específico ou negativa estática genérica; resultados/leituras dos verificadores reais |
| *-io-N | falha estática de read_text/resolve e errno; chamada e resultado realmente consumidos |

A instrumentação de Path chama as operações originais, devolve o resultado original e preserva a classe da exceção. Assim System.identity continua convertendo FileNotFoundError em None e a etapa de presença nega. Não se substituiu System.check_config, Operations.config, compare_frontend ou verify_peer por callback de aprovação. A referência global Path é restaurada por finally; o consumidor é síncrono, sem execução paralela suportada neste pacote.

As novas observações permanecem exclusivamente nos artefatos privados do Capture existente. `read_text` preserva o texto efetivamente consumido, inclusive normalização de newline; não é alegação de bytes FD brutos. RPC e stable_file preservam bytes exatos. Nenhum desses conteúdos privados é publicado no Git.

## Provas e limites

[PROOFS.json](PROOFS.json): nove ensaios completos dos blocos literais de COMMANDS.md, materialização → launcher → coleta de laboratório → exportação → transferência → custódia canônica. Casos: válido, atime-only, socket substituído, pm2.pid alterado, identidade ausente, ticks alterados, referência histórica adulterada, referência ausente e ambiente divergente no verificador canônico. Cada negativa exige etapa/motivo esperado, ausência de avanço à rota e custódia PRESERVED_NOT_CERTIFIED. Somam-se os dois testes dirigidos de metadata já aprovados; nenhuma suíte PM2 ampla foi repetida.

Reais: Bash/Python, Node, socket/RPC codec, FDs/memfd, arquivos descartáveis, verificadores canônicos extraídos dos corpos originais pinados, exportação e private_record. Simulados: SSH, `/proc` de produção, projeção do peer para as identidades históricas, Docker/SQL e atime controlado. Namespace próprio, rede isolada; UID0 no namespace não é root do host. Fixtures ficam graváveis somente para reproduzir concorrência; sistema-base é read-only. readelf está indisponível e não é chamado. Nenhum SELECT real ou sintético é solicitado por estes nove casos.

Durante o desenvolvimento, a fixture inicialmente read-only impediu as mutações concorrentes (EROFS); corrigiu-se exclusivamente a montagem descartável do laboratório. A prova de identidade ausente também detectou que o wrapper alterava FileNotFoundError; corrigiu-se a preservação da exceção antes do ensaio final. Esses resultados intermediários não foram apresentados como aprovação. Não há mudança de consumidor canônico para acomodar testes.

Os ensaios não certificam root, toolchain ELF operacional, ownership SQL, dados/configuração atuais ou janela. ELF/closure operacional NÃO CONFERIDA; ownership UNKNOWN. Preservadas fontes, destinos consumidos, DENYs, recibos, NEWauth+NEWDB+NEWcipher, ambos crons, guarda38 e out.15, sem observação produtiva nova.

## Reprodução e publicação

Com os arquivos versionados e o toolchain local existente indicado no harness:

```bash
python3 docs/reviews/automation-freeform-window-release-af26/crm-csv-postrpc-diagnostics-20261017/compose.py
python3 docs/reviews/automation-freeform-window-release-af26/crm-csv-postrpc-diagnostics-20261017/seal.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/automation-freeform-window-release-af26/crm-csv-postrpc-diagnostics-20261017/test_stat_contract.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/automation-freeform-window-release-af26/crm-csv-postrpc-diagnostics-20261017/test_blocks.py
```

Os testes de socket/namespace exigem permissão local do sandbox; não sudo nem VPS. analyze_custody exige as duas custódias legítimas pinadas e imprime só resultado sanitizado. Não fabrica dados quando ausentes. COMMANDS.md é material de reprodução/revisão futura, sem autorização remota; destinos novos não significam autorização de coleta. O bloco SELECT herdado continua separado e não autorizado.

DELTA.patch cobre somente runner/driver/launch/lab comparados às fontes aceitas, não representa todo o commit e não inclui a si próprio. DELIVERY.sha256 cobre todos os arquivos desta pasta exceto o próprio índice; ALLOWLIST.json delimita também os três checkpoints. Nenhum histórico rastreado anterior é editado.

Push: branch review/campaign-recovery-20260926, deploymentEnabled=false; único workflow versionado restringe push/PR a main/develop. Configurações inalteradas. Sem workflow manual/PR. Responsável operacional Deifson; revisão 21/10/2026 ou antes por mudança/novo achado. Próxima decisão permanece revisão deste delta; nenhuma nova coleta ou janela está incluída.
