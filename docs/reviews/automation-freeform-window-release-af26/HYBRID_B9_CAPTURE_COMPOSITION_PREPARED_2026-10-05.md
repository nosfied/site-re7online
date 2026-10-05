# b9/V4 — composição final com renovação de captura, 05/10/2026

**PREPARED FOR INSTALLATION / NOT DEPLOYED.** Preparação nova `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9-capture-20261005T143500Z`. Integra `183b41224a563c063d99809d08a75ae4cdea23d4`; o ensaio encontrou e corrigiu uma lacuna adicional estritamente operacional nos gates da contingência, descrita abaixo. Os cinco gates permanecem **false**. Nenhuma política/helper foi instalada, janela aberta, processo iniciado/parado, guarda/scheduler/cron/boot alterado, registro histórico reparado ou mensagem enviada.

[Comandos completos de instalação, sequência e contingência](b9-capture-183b-prepared/OWNER-STEPS.txt), [hashes completos dos modos/insumos](b9-capture-183b-prepared/manifest.sanitized.json) e [provas sanitizadas da composição](v4-sequencer/composition-results.sanitized.json). Configurações, dump, auth, inventários e logs privados não entram no Git. Preparações/tentativas anteriores permanecem preservadas.

## Composição e integridade

- API candidata **b9b58177880e729854580def1180f3edb2fb83e8**, 13 pares fonte/compilado conferidos na release isolada já existente. Sem incorporar novos deltas funcionais.
- Worker candidato **worker-minimal-hybrid-b9b58177-verified-v3**, exclusivamente do tar validado SHA **236c1d502df5767eb7cde726ce0d7ae7c6e8200489cac4d09a417b08d98c0e98**. Hash antes da extração, 7.036 arquivos, 11 symlinks internos e imports alcançáveis conferidos; `.data` operacional aponta à auth corrente. Nova extração de auditoria do mesmo tar, sem rebuild/início de aplicação.
- Retorno: API **879cb1faa88493cd78dd789b71f85043d6c8ff9c** e worker **worker-bf5f1d76-f06d49cb-91230f88-b66bb89a-af26-window**. Frontend af26 preservado, BUILD_ID **J5cHyVKiKEI5xxiGBY5If**; sem stop/start.
- Schema/lockfiles API b9/879 conferem; schema SHA `7fec399ffbbeb4f2d002d128481f96c1aaebb3efb9d0a76f2ba129939c5b54bd`, lockfile `add66bbb579b4c2424746ccd26b7a41ec24faecf77d324447b9f8b463c73726a`. Prisma e dependências do worker são os do tar validado. Sem migration, alteração de dependência ou build funcional.
- Os três manifests de origem, com 24 arquivos, foram relidos e passaram. `ops.py` de origem em cada modo: `ba1991f9b9dde1fc8cf1d739e85026ac781d84c93145cf4b2bafcefb21335ff2`. Aplicação do patch de diagnóstico com **fuzz=0** e rebinding somente ao diretório novo. `privileged_output.py` em window/switch/return/return-partial; **25 entradas** em cada scripts.sha256. Sem copiar provas, nonces, intents, certificados ou capturas consumidas.

| Insumo final | SHA-256 |
| --- | --- |
| Helper, proposto e instalado, **inalterado** | `8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212` |
| Logger, inalterado | `93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a` |
| Sequenciador final | `145cb7e3c2f2f0fc1baff5799c755e1ea5e6bc63aa2220b95b10392c5cc50460` |
| Template final pós-unfence | `322264cc250f2f29041fd7a3e5bf1711b52c35bcb852d932db1934aca3eb4a46` |
| Patch de diagnóstico | `36b60240b10cf84b775a9c35bd9c4ca81ff6ce8482f0107f3c7217e9c50e33be` |
| Política fresca, **não instalada** | `e57320ee60e00d4f641a311e64e8acde94cd2f06081da5d8ee4fdf540c65ef7f` |
| Manifest sequenciador privado | `9009810e4294593a4f82a763ac5ba7c45f4f335b25b529e819ca320acbc35f75` |
| Manifest switch, 25 arquivos | `ecf5a97f361fa35ba93e610480d32b7e05f158dc487812bde9ff55c807751433` |
| Manifest return, 25 arquivos | `28eaccb4915dc2db9dabb894ff9525d58d48720f97ce346c5f4775d1890ba22f` |
| Manifest return-partial, 25 arquivos | `4e0b4d9dbe852b4833fe1ab3938149befc7a4869a737ad5285b119c1851f7fcb` |

**Somente a política precisa ser instalada.** Helper e nove comandos sudo permanecem iguais. A política instalada anterior deve ser arquivada, nunca sobrescrita sem conferir seu hash esperado `2f8f384602e66dd5050cf37cf1558ce7b137deb115a6001fa3cc8c5edf6eb6e7`; fases anteriores ficam preservadas por hash. Esse hash é da atestação/instalação anterior do owner, não de uma leitura root nova nesta rodada. O diretório sudoers não é legível por deploy: cmp/stat/visudo e hash root da política são checks explícitos do bloco de Deifson, **pendentes da decisão de instalação**, sem ampliar privilégios.

## Ensaio da composição exata e lacuna resolvida

A composição final foi baixada da preparação VPS em arquivo privado e extraída no laboratório. Nenhuma aplicação b9 foi iniciada nele: os ensaios operacionais usam apps sintéticos Node, mantendo os testes funcionais anteriores válidos. O driver carrega sequenciador/helper/logger **dos bytes extraídos**, confere os três manifests completos e copia os módulos efetivos dos modos. Não usa o sequenciador antigo por herança: essa falha inicial do harness foi identificada e corrigida; o ensaio incompleto não contou como PASS.

A geração efetiva do retorno encontrou uma dependência faltante: `prepare_post_unfence_return.py` não criava `execution-gates.private.json`, que `delegated.py` exige. O template final agora cria os **cinco gates falsos**, sem herdar autorização consumida. O ramo `post_unfence_return` do sequenciador também nega gates falsos **antes de inspect/enter ou outra ação privilegiada**. Os comandos concretos só habilitam essa execução depois de inspect da política fresca, reconhecimento do estado vivo/ausente e reconferência de insumos. O crontab de deploy precisa ser restaurado explicitamente antes da geração; a ação root restore-controls restaura apenas cron de sistema e boot. Sem alterar helper/sudoers, seletores de retorno ou código funcional.

| Grupo executado nesta composição | Resultado / limite |
| --- | --- |
| `test_composition_pm2.py` | **28 verificações PASS/negação esperada**, Node 20.20.0/PM2 6.0.14 reais: switch/return/return-partial, sockets abrindo/fechando, recusa transitória root seguida de renovação, churn persistente limitado, stderr root preservado, PID/restarts idênticos durante renovação, identidade divergente, descendente/substituto reais; nenhuma recaptura repete start. nft/fases são simulados, ticks divergentes têm caso adicional injetado; não equivale a nft ou DB reais. |
| `test_composition_template.py` | **4/4 PASS** nos bytes finais: geração completa com worker vivo/ausente, logger nos três destinos, manifests de 25 arquivos, gates falsos, patch ausente sobre origem/resultados normalizados, negativa por origem alterada; erro/sucesso do observador chega ao arquivo privado em cada modo. OS/DB, identidade de fonte da geração e criação da política são fronteiras injetadas; não são declaradas como propriedade real de processos. |
| `test_sequencer.py` | **24/24 PASS**, driver controlado de ordem/retorno/falhas; inclui a negativa nova de gates falsos na contingência antes de qualquer ação root. Full sequence com esse driver não é execução real de nft/systemd. |

As provas anteriores de ausência/retorno com PM2 real, adaptador e funcionalidade b9 são reutilizadas; **não somadas ou reatribuídas como testes novos deste delta**. No ensaio atual há também negativa real para worker que sai deixando descendente vivo. A composição da contingência ausente é exercitada pelo template e pelo driver sequencial, enquanto as propriedades de ausência exaustiva do helper inalterado mantêm a prova PM2 anterior. Nenhum teste mantém providers/auth/DB produtivos conectados. Logs privados e journal sanitizado são conferidos separadamente; erro bruto não vai ao journal. Recusa inicial da janela anterior continua de causa desconhecida; não foi inventado diagnóstico retroativo.

Reprodução, na raiz do worktree com composição privada atestada preservada:

```bash
python3 docs/reviews/automation-freeform-window-release-af26/v4-sequencer/test_composition_template.py local-evidence/capture-composition-20261005/composition-final
python3 docs/reviews/automation-freeform-window-release-af26/v4-sequencer/test_composition_pm2.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2 local-evidence/capture-composition-20261005/composition-final
python3 -m unittest discover -s docs/reviews/automation-freeform-window-release-af26/v4-sequencer -p test_sequencer.py
```

Revisores usam seu pacote privado atestado; ele não acompanha o Git. O manifesto registra os hashes para verificar correspondência. Sem reproduzir testes funcionais aprovados ou prometer shutdown sem perda.

## Estado imediato, bindings e backup final

Conferência VPS em **05/10/2026 15:02 UTC (12:02 Fortaleza)**: API879 PID 2958776, workeraf26 PID 2958996, frontend PID 2537692, online/zero reinícios. Ambiente reduzido corresponde ao real: 85 chaves API, 17 worker, seis frontend. saved/fallback apontam às referências compatíveis atuais, watch=false. Auth/data compartilhados e symlinks conferem. Quatro sessões conectadas e cinco registros auth no recorte; zero jobs/grupos/leases/agendamentos em envio, sem fechar admissões. Isso **não comprova drain** nem observabilidade integral de inbound/outbound/auth.

Guarda aberta, geração **27**, tasks `{}`, sem falha de ledger; scheduler `CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=false`, preservado. Cron/crontab/boot (`inactive/enabled`) conferidos; proxy vivo/identidade/hash conferem pelos bindings V4 e observador instalado. O lock global estava disponível na leitura pontual; reconfirmar execução única antes da futura janela. As referências de rede/auth não mudaram: bindings novos neste diretório fixam esses mesmos destinos observados, mais baseline/configurações/política atuais. Nenhum acesso foi flexibilizado. Gates falsos e ausência de marcadores anteriores conferidos nos três modos.

Backup fresco `window/database.dump`: **26.714.173 bytes**, SHA **c17c45122a49e6945a7adbd5f05712e5d38a6011f5f56a05f5849dabfcd06a19**, catálogo de **614 objetos**. Três arquivos privados de configuração/saved/fallback/guarda, auth/runtime e conteúdo com leitura de catálogo/tar/hash verificada; sem retenção destrutiva. Espaço VPS ~16 GiB. Manifest backup `d073c88eaf9f9b12d6735886c1f7b72f82e3a252513613969764bdf2f77031f2`.

**Esse mesmo dump** foi restaurado em PostgreSQL **16.15**, somente socket Unix local, sem aplicação/provider. `pg_restore --exit-on-error` terminou 0; 60 migrations concluídas, seis rollbacks históricos, zero SQL/checksum divergente ou ausente. Banco temporário removido e servidor isolado parado. Resultado restore SHA `0d653084877d74b853aaeca506832221c49615c586c4451a6a06f5f5b8469168`, concluído às 14:48:43 UTC. Sem restore produtivo, reparo histórico ou reenvio. EPERM inicial dos sockets no sandbox não foi contado como PASS; execução isolada permitida concluiu.

## Sequência, abortar e retorno

1. Deifson instala **apenas a política**, por bloco fixo que confere helper/hash/política anterior, preserva arquivo antigo e verifica root/permissões/cadeia/sudoers/visudo. Inspect deve reconhecer hash fresco, fase nula e processos de origem vivos. Nada disso foi executado nesta preparação.
2. Codex reconfirma exclusividade, identidade/artefatos/insumos imediatamente, habilita gates após decisão e executa o sequenciador **uma vez**: baseline -> CAS/drain -> preflight -> contenção/iniciadores -> stop-pair -> certificados/ausência/zero DB e locks -> API b9 -> V4 fresco -> worker mínimo b9. Frontend permanece vivo.
3. Sob nft: identidade/processos/script/cwd/hash/guarda fechada e controle HTTP do worker fora de 3001. Captura do worker preserva PID/ticks/daemon/release/árvore e usa dois samples consistentes. Saved/fallback, autorização root, renovação antes do unfence, revalidação root. Recusa conhecida FD/sockets permite somente renovação limitada; churn/erro desconhecido/sobrevivente bloqueiam.
4. Após unfence: health/DB/API3001, frontend/BUILD_ID, sessões/ownership e Inbox/CRM autenticados quando disponíveis. Só validação técnica segura permite restaurar admissões ao estado inicial e controles. Não reiniciar para testar nem reabrir guarda por prazo. Horizonte de 15 minutos exige comunicação/contingência, não bypass ou kill.
5. Falha pré-unfence seleciona retorno completo/parcial pelo estado observado, com API879 e mesmo workeraf26, novos intents/certificados no modo apropriado e prova V4 antes do worker. Erro no retorno bloqueia com diagnóstico privado, sem repetir start.
6. Falha persistente **pós-unfence b9** mantém guarda fechada: capturar diagnóstico, restaurar controles quando fase root permitir, gerar preparação de contingência nova. O template comprova par b9 vivo ou worker ausente pela última captura/identidade/árvore/sockets; nega substituto. Política depende de PID/ticks reais futuros, portanto seu hash é calculado nesse momento. Deifson instala essa política fresca; inspect/gates precedem `--post-unfence-return`. Esse requisito humano está previsto nos comandos, não descoberto durante indisponibilidade. Se return/return-partial já foi consumido, o template nega essa geração: não improvisar reuse contra outro estado.

O retorno **não é rollback de banco**: DB/auth presentes, sessões e dados novos permanecem. Não apagar locks, logout, restaurar auth antiga, repetir submissão incerta ou reparar as quatro conversas históricas. O observador deve passar antes de qualquer start do worker, inclusive retorno. A captura é uma observação pontual, não certifica futuro nem resolve o risco residual de shutdown antigo.

## Pendências exatas

- Decisão de instalação/execução desta preparação; instalação restrita de política por Deifson e cmp/stat/visudo root antes da janela. **Helper não precisa ser substituído.**
- Reconfirmar bindings/processos/backup/controles na hora da execução; drift material exige nova preparação, sem apagar provas antigas.
- Deifson disponível para política de contingência fresca e leitura funcional Inbox/CRM; aceite funcional b9/retorno híbrido pendente. Campanhas/CRA aguardam owner; SECULT encerrada, inatividade no Guia pausada, reparo de setembro CLOSED.

**Produção preservada em API879/workeraf26/frontendaf26. PREPARED FOR INSTALLATION / NOT DEPLOYED.** Não ativar/configurar nenhum tenant nesta preparação.
