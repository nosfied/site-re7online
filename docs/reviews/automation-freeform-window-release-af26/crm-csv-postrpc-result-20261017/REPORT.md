# CSV — coleta pós-RPC consumida / DENY preservado

Base e autorização: `4fcad80adbdbb38e0206b40944811ff9ca83a469`, branch `review/campaign-recovery-20260926`. Executados **uma vez somente os blocos 1 e 2 literais** de [COMMANDS.md](../crm-csv-postrpc-diagnostics-20261017/COMMANDS.md). Sem código/hash/gate alterado, retry, reparo ou escalada. Bloco3/SELECT não executado. CSV SUSPENSO / CONSUMED-DENY / NOT DEPLOYED / NOT WINDOW READY.

## Resultado exato

- Bloco1: exit0, `MATERIALIZED_INACTIVE_NO_REMOTE`.
- Bloco2: exit1, `CUSTODY_PRESERVED_DENY_NO_RETRY`; launcher também registrou a negativa privadamente.
- `denialStage=frontend-contract`.
- `denialReason=CANONICAL_ENVIRONMENT_DRIFT`.
- Erro terminal DiagnosticDenied, errno não aplicável/null. Não houve OSError comprovado nesta negativa.

Materialização local: 17/10/2026 13:14:33.350463–13:14:33.393738 UTC. Transporte/coleta/custódia: 13:14:42.139334–13:14:46.691723 UTC, **10:14:42–10:14:46 Fortaleza**. Observações remotas registradas entre 13:14:45.048113 e 13:14:46.062476 UTC. Não representam snapshot atômico nem continuidade além desse intervalo.

Manifest aprovado: `85cbcb315d6081e33aefa79036c435c270e868445c1625b27ce99319af5ee617`. Launcher aprovado: `19389532ecdd9b8fc3360fb8c424dbf5bba1c17003c6f4a4f415799a6f7bd280`. Os bytes do pacote/COMMANDS foram comparados ao commit-base, DELIVERY.sha256 e provas publicadas antes dos efeitos. Os nove ensaios de blocos e dois testes de metadata foram reutilizados; nenhuma suíte ou build repetido.

## Etapas alcançadas

| Fronteira | Resultado nesta tentativa |
|---|---|
| Manifest/39 fontes/closure26 autenticados | GATE1_VERIFIED_SNAPSHOT PASS, fotografia dos **bytes das fontes**, não snapshot produtivo |
| Cadeias Node/Docker e FD Node | Observadas pelo procedimento; não certificam closure ELF operacional |
| boot-before/daemon-before/peer-before | PASS no intervalo observado |
| RPC do daemon existente | exit0, sem PM2 CLI/daemon novo; peer-after PASS |
| Socket pós-RPC | Tipo/owner e nove metadados canônicos PASS; atime não mudou neste par observado |
| pm2.pid | stable_file(64) e conteúdo antes/depois PASS |
| População/JSON/PIDs | Três aplicações esperadas, sem duplicação, PASS |
| Identidades/ticks/estado iniciais do trio | PASS, observações atuais desta tentativa, não promoção de PIDs antigos por presunção |
| Duas referências históricas remotas | Leitura/metadata/integridade/JSON PASS contra hashes pinados |
| API/worker | Operations.config/System.check_config PASS, incluindo cwd/exe/environ e identidade |
| Frontend, campos PM2 | Dez LIVE_FIELDS compatíveis com dump pré-janela; configuração PM2, cwd e exe passaram antes da etapa de ambiente |
| Frontend, ambiente kernel | **DENY** no predicado integral de ambiente de System.check_config |
| GATE2 | Não concluído |
| saved/fallback, identidades finais e boot-after | Não alcançados; nenhuma conclusão nova |
| GATE3/rota/container/psql | Não alcançados |
| SELECT/ownership | SELECT não executado, ownership UNKNOWN |
| ELF/closure operacional | Explicitamente NÃO CONFERIDA; nenhum PASS de toolchain |

O socket passou e o atime permaneceu igual **nesta tentativa**. Isso não estabelece a causa do DENY de 09:46. A tentativa anterior e sua falta de diagnóstico específico permanecem intactas, sem atribuição retrospectiva.

Referências efetivamente lidas agora: saved-dump.pm2.private.json, 26.270B/SHA c9c54c02b9694328a5aeaa4335efb88135f9bd948b4f786c8e9e4e851efd51e3; source.profile.private.json, 15.179B/SHA a062c7020353cb39b0578653ea51475f8e9f9f68a588d1c55eb87cbbd68b6b9e. O binding DB não foi lido nesta tentativa; sua disponibilidade histórica não é confirmação atual.

## Análise local da negativa

Usados exclusivamente os bytes já transferidos: stdout RPC, saved-reference-read, profile-reference-read e leituras frontend-config-io-1/2/3. Verificados tamanho/hash de stdout/stderr de todos os 60 registros de comando/observação; nenhum valor foi reproduzido no relatório. Reutilizado frontend_expected do contracts.py pinado (`8b6fd62ccaf1a9e0c866908eee57041e464156d62dbe9b9031493ef55695d198`) e o predicado original System.check_config (`ops.source c84a5e…`). Nenhuma nova consulta ou execução operacional para explicar a negativa.

A referência correta é o `env` do dump frontend pré-janela. O verificador exige igualdade de todos os seus campos, convertendo cada valor esperado em str, com o ambiente lido de `/proc` do PID retornado. Não é suficiente que o espelho PM2 coincida com a referência.

Dos **31 campos esperados**, 12 coincidem, 13 não foram encontrados e seis têm valor diferente. A leitura contém 30 variáveis ao todo; entradas extras não são, por si, motivo de negativa no predicado original. O espelho PM2 continua contendo os valores esperados. A divergência, portanto, está comprovada entre a referência e o conteúdo efetivamente consumido pelo verificador, sem concluir sua origem histórica, causa operacional ou impacto funcional.

Nomes dos campos esperados ausentes (sem valores):

- `LC_ALL`
- `LC_CTYPE`
- `NEXT_PUBLIC_CONVERTA_WEBCHAT_API_BASE_URL`
- `NEXT_PUBLIC_CONVERTA_WEBCHAT_SITE_ID`
- `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID`
- `NEXT_TELEMETRY_DISABLED`
- `NODE_ENV`
- `OLDPWD`
- `PM2_JSON_PROCESSING`
- `RE7_FRONT_CONTROL`
- `RE7_FRONT_RUN`
- `re7-admin-front`
- `unique_id`

Nomes dos campos com valores diferentes (sem valores):

- `PATH`
- `PWD`
- `SSH_CLIENT`
- `SSH_CONNECTION`
- `XDG_SESSION_ID`
- `_`

A negativa não comprova credencial incorreta, quebra de NEWauth/NEWDB/NEWcipher ou falha da interface. Nenhuma credencial foi alterada. Não se removeram campos nem se alterou referência para obter PASS. Continua necessária **revisão local da correspondência entre o contrato frontend, a fonte pré-janela aprovada e a representação observada**, preservando os verificadores canônicos. Qualquer mudança de contrato/leitor ou nova coleta exige escopo próprio; não foi feita nesta rodada.

## Custódia e procedência

Destino privado novo e agora consumido: `csv-postrpc-diagnostics-20261017-v1` sob a custódia legítima do owner. Guardas locais `csv-postrpc-launcher-20261017-v1-materialize` e `…-collect`; materialização e diretórios remotos usam os destinos publicados `re7-csv-postrpc-…-20261017-v1`. Sem sobrescrita ou limpeza.

Envelope bruto: **358.887 bytes**, SHA `67d9a84669f7941d1783a3b917d9a26d568ee3e7e531e7b4c070f805ae810f5e`. stdout da transferência: 479.100B/SHA `3a9578ceae6c1caf8010c99069223989e1a854f98bbb0302442ddced70c0abc1`; stderr vazio. O envelope recebido contém exatamente os mesmos bytes/hash/tamanho da exportação. Os metadados privados e a estabilidade local foram conferidos com FD/no-follow, sem publicar valores internos.

Ingestão canônica: `THREE_GAPS_CUSTODY_PRESERVED_NOT_CERTIFIED`, **gatePass=false**, atomicSnapshot=false, ownership=UNKNOWN. Custódia bem-sucedida significa preservação do DENY, não certificação dos gates. Recibo e bytes originais não foram alterados. [EVIDENCE_INDEX.json](EVIDENCE_INDEX.json) relaciona 11 artefatos privados e os 60 comandos/observações por ID, horário, código, tamanho/hash de stdout/stderr; nunca contém raw, argv sensível, cmdline, ambiente, perfil ou journal bruto. [RESULT.json](RESULT.json) contém somente o resumo sanitizado e hashes dos blocos executados.

## Pendências exatas e encerramento

1. Frontend: reconciliar localmente os 19 campos divergentes com o contrato/fonte aprovados, sem enfraquecer controles ou presumir falha funcional. Configuração frontend não certificada nesta tentativa.
2. Comparações saved/fallback e identidades finais: não executadas pelo fail-closed; permanecem pendentes, sem autorização implícita de releitura.
3. Rota/container/cliente SQL e SELECT: não alcançados/não autorizados. Identidade SQL e atribuição canônica de ownership continuam pendentes.
4. ELF/closure operacional/proteção do toolchain, inputs/16 vínculos atuais e autoridade instalada: este diagnóstico não os certifica.
5. Nenhuma certificação global, instalação de política, emissão/renovação de autoridade ou janela está pronta. Ambos crons, supervisão, guarda38 e out.15 não foram reobservados por este roteiro; não se declara novo aceite desses controles.

NEWauth+NEWDB+NEWcipher, produção, ambos crons, guarda38 fechada e out.15 CLOSED preservados por ausência de ações mutáveis nesse escopo. As instalações/recuperações anteriores continuam consumidas; CSV permanece suspenso. Sem instalação/restart/reload, SELECT, importação, envio, retenção, backup ou reparo.

Publicação limitada a este resultado sanitizado e três checkpoints, conforme ALLOWLIST.json; código/hashes/gates publicados intactos. Branch sem deploy (`deploymentEnabled=false`); único workflow versionado restringe push/PR a main/develop, sem execução aplicável a esta branch, PR ou acionamento manual. Responsável operacional Deifson; revisão21/10/2026 ou antes por mudança/novo escopo. Encerrar após publicação.
