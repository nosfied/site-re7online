# Terceiro lote — arquivos duplicados para revisão (14/10/2026)

**PREPARAÇÃO; nenhuma exclusão autorizada ou executada.** NEWauth+NEWDB, out.15 CLOSED, guarda38 fechada e serviços preservados. Segundo lote consumido, não reexecutar.

## Seleção literal e retenção

23 arquivos regulares/nlink1, **8.816.578.560 B alocados potencialmente recuperáveis**. Onze caminhos originais mantidos. Diretórios, controles, manifests, journals, recibos, logs, snapshots e fontes não pertencem à allowlist. Não é espaço já liberado.

| Grupo SHA-256 | Cópia principal/retida | Cópias redundantes propostas | Bytes alocados recuperáveis |
|---|---|---:|---:|
| 4c2fb0caf834ce0c2c9e628c82bf80bba669effd68ea521245a936cfc34c6810 | `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/content.private.tar.gz` | 5 | 2397323264 |
| 0d9c16cb978ec560d7b47f4c56e5417cb16d5a0cace2ca4c09d0cbbc53c56ee2 | `/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/whatsapp-agent-return.private.tar.gz` | 1 | 103124992 |
| d806e3ac7746f3c62a77012d10e9ba34072ac8a127ef339a174e3b78e0d59246 | `/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/admin-front-return.private.tar.gz` | 1 | 276815872 |
| 8de30ca43412fde5d03112d6805e6cbb54a585136d15a1f334df7f95944b05d7 | `/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/whatsapp-web-worker-return.private.tar.gz` | 1 | 96026624 |
| 3f4affa2d3135756687d95d41912b221163f82585937db7a561518ed95721fe0 | `/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/v4-20261003/window/content.private.tar.gz` | 10 | 4671959040 |
| 6b9bfae57e011fba21c17627d22c430859eb08ae248f380328081e5feb8e3111 | `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb7455-20261006T010000Z/window/content.private.tar.gz` | 1 | 474304512 |
| 8b67292578090a2f564e4a9bf399b002e667bba723c936859fc438aa1221f5c8 | `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb7455-20261006T010000Z/window/worker-reactive-afbb7455.tar.gz` | 1 | 111230976 |
| 9b375dffca78425e7193e2e73b3c3692a951dc9f638c1c73790cfd3c5e32dac2 | `/opt/re7online/backups/converta-persistent/preparations/frontend-fa60-observed-20261007T194628Z/frontend-fa60f0f6.tar.gz` | 0 | 0 |
| 236c1d502df5767eb7cde726ce0d7ae7c6e8200489cac4d09a417b08d98c0e98 | `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-20261005T025100Z/window/worker-minimal-b9-v3.tar.gz` | 2 | 224075776 |
| 413083a841d50f4d85dab34fc8a708fcb6cbd67299fc9b5bf240e7c41d645097 | `/opt/re7online/backups/converta-persistent/preparations/runtime-fix-20260930T020103Z/content.private.tar.gz` | 1 | 461717504 |

Os dois nomes do tar fa60 são hardlinks do mesmo inode/nlink2: ambos preservados, zero recuperação de conteúdo. Não somar cópias aparentes. Outra principal é preservada pela cadeia explícita dos instaladores/políticas anteriores; essa cadeia é conservadora de proveniência/recuperação, não prova de que o runner ativo use aquele tar hoje. Uma principal por hash nos demais grupos e custódia off-host dos originais permitem recuperar os nomes históricos sem manter todas as cópias no host.

### Caminhos literais propostos

- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-scheduled-20261008T173300Z/window/content.private.tar.gz` — 479465472 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-postack-20261008T170600Z/window/content.private.tar.gz` — 479465472 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-scheduled-20261008T174500Z/window/content.private.tar.gz` — 479465472 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-scheduled-20261008T173800Z/window/content.private.tar.gz` — 479465472 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/campaign-eligibility-reconciliation-20261008T150000Z/reconciliation-authorized-20261008/backup/content.private.tar.gz` — 479461376 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/activation-20261002T182720Z/whatsapp-agent-return.private.tar.gz` — 103124992 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/activation-20261002T182720Z/admin-front-return.private.tar.gz` — 276815872 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/activation-20261002T182720Z/whatsapp-web-worker-return.private.tar.gz` — 96026624 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/v4-20261003/window/backup-window-20261003T121329Z/content.private.tar.gz` — 467197952 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-pm2-20261003T235000Z/window/content.private.tar.gz` — 467193856 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-sequenced-20261003T163000Z/window/content.private.tar.gz` — 467193856 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-20261004T194000Z/window/content.private.tar.gz` — 467193856 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-20261003T150000Z/window/content.private.tar.gz` — 467197952 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-20261005T025100Z/window/content.private.tar.gz` — 467197952 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-pm2fix-20261004T005800Z/window/content.private.tar.gz` — 467193856 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9-capture-20261005T143500Z/window/content.private.tar.gz` — 467197952 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-absent-20261005T121000Z/window/content.private.tar.gz` — 467193856 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-sequenced-20261003T165710Z/window/content.private.tar.gz` — 467197952 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb-baseline-20261006T020000Z/window/backup-preserved-before-window-20261006T130000Z/content.private.tar.gz` — 474304512 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb-baseline-20261006T020000Z/window/worker-reactive-afbb7455.tar.gz` — 111230976 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9-capture-20261005T143500Z/window/worker-minimal-b9-v3.tar.gz` — 112037888 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-absent-20261005T121000Z/window/worker-minimal-b9-v3.tar.gz` — 112037888 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.
- `/opt/re7online/backups/converta-persistent/preparations/automation-20260929T220203Z/content.private.tar.gz` — 461717504 B alocados; redundância por SHA comprovada, sem referência operacional alcançável.

## Grafo, limites e negativas preservadas

Auditoria root v3:34 arquivos,7.350 referências mais symlinks/dependências protegidos, duas amostras owners0/incomplete0. O grafo conservador inicial vinculava um limite de namespace a todos os arquivos; seu resultado e bytes permanecem preservados. A distinção foi reproduzida pelo `prepare_policy.py` efetivo, hashc67018a1…, e7 testes locais. Captura de textos como deploy por SHA encontrou39 leituras negadas root; fontes necessárias recuperadas somente por cópias de hash idêntico. Grafo explícito local:12,03s, **zero fontes alcançáveis ausentes** e zero bindings relativos de dados irresolúveis aos candidatos. Não afirmar leitura completa dos39 textos na sessão deploy. Fontes desconhecidas não alcançadas permanecem limitadas; referências atuais e grafo são novamente conferidos pelo selo produtivo.

Seeds incluem processos/cwd/argv, PM2 saved/fallback, boot/cron/Nginx, helpers/políticas instalados, preparação bancária140000 e preparação frontend efetivamente ativa. Diretórios declarados por configuração e vínculos de arquivos/manifests expandem o grafo; limites de autorização não são dependências de todos os arquivos. Nomes genéricos em código registrados separadamente. Compilados ativos conferidos por hashes; os109 vínculos de referência, incluindo três dependências explícitas que estavam ausentes na reassociação do inventário, continuam protegidos. Nenhum destino .data é percorrido ou selecionado.

V1 recusou carga-I antes de ler estado; v2 recusou o grupo hardlinked; v3 completou com classificação conservadora; v4 e v5 atingiram240s sem certificado final. Na v5, checkpoints provam estado→34 hashes→referências lidas, sem completar grafo. Não atribuir uma operação histórica mais específica sem perfil. Nenhuma custódia pesada em VPS foi executada após esses timeouts. O grafo foi processado fora da VPS; não ampliamos timeout nem repetimos gerações recusadas/expiradas.

## Custódia e recuperação

Preservação direta off-host, evitando tar adicional volumoso na VPS: dez conteúdos originais, todos por SHA; índice dos34 nomes com UID/GID/modo, inode/nlink/bytes alocados, mtime/ctime/birth e atime capturada, xattrs lidos (zero presentes). Tar verificado e extraído em diretório isolado novo; hashes dos10 conteúdos e headers/metadados conferidos. Nenhum restore produtivo.

Tar SHA-256: `d34fd3a2b8d121f28c7b70df069c2833998e0987b01258faa1182c34dbae1bb4`. Índice v2: `eb2b7f05518d394bdd8d98b13817f2b603737a10cb48a5511d16d49a3a179f20`. Índice/prova anteriores mantidos; v2 altera apenas auditSha256 para preservar os vínculos de dependências, reutilizando a extração cujo conteúdo/metadados não mudou. Uma réplica física em custódia permanente privada do owner, fora de Git/temporários; não declarar discos independentes. Os pacotes podem conter configurações históricas sensíveis: custódia700/600, segurança externa/cifragem OPEN.

Receita revisável: `third-withdrawal/restore-isolated.py`. Recuperar somente caminhos ausentes aprovados, validar índice/hash, negar symlink nos pais/existência de destino, restaurar UID/GID/modo/mtime e xattrs do índice. Inode, ctime e birth não são recriáveis; novas referências/bindings são exigidos para eventual execução. Preparações consumidas nunca são reexecutadas. Os diretórios/manifests históricos permanecem no host.

## Delta observacional e comando

[Achado, correção e testes locais](THIRD_OBSERVATION_REVIEW.md). O driver inclui executor e todos os processos; troca de identidade, owner, retirado aberto, mapa sem prova e leitura incompleta negam. Statx birth/type só distinguem objeto novo com evidência positiva; ctime não é prova. Original DENY do segundo lote permanece íntegro.

Geração administrativa própria final `retention-third-files-final-20261014T050000Z`; selo e dry-run somente leitura, nenhum intent de retirada. Publicação final vincula o input efetivo e comandos A/B/C; B permanece não autorizado. Não instalar políticas/helpers/sudoers, executar retorno, alterar credenciais, enviar, abrir guarda ou retomar job.

## Resultado integrado final

**PREPARE_EXIT0 / DRY_EXIT0 / DRY_RUN_PASS; removedCount0.** Input77503f964007ba1fcb4d8a61d9286fdc4c7202f070aa19cc2fc14884ee8894a4; driver e1380546fb91072c4730482fb47c7f5dc6983efda6b4cfbaa332f003d84692bf.7.283 referências e109 vínculos selados, metadados e hashes dos34 originais reconfirmados sem adaptação;23 literais/nlink1. Duas observações frescas14/10 09:23:24/25UTC /06:23:24/25Fortaleza, owners0/0,incomplete0/0,reusedObjects0/0. O caso de reutilização é prova local dirigida; não atribuir sua ocorrência à VPS nesta preparação.

Capacidade fresca14/10 09:29:51UTC /06:29:51Fortaleza: mínimo efetivo deploy/PostgreSQL **10.531.876.864B**, WAL80MiB, slots0/archiveoff; healthok/dbok. Piso6.468.665.344B atendido; projeção após futura retirada descontando reserva268.435.456B:19.080.019.968B, não espaço já liberado. O arquivo de geraçãoT050000 é nome de geração, não horário da captura.

NEWauth+NEWDB verificados por ambiente/executável/identidade e verificador/atributos DB; API410272,worker410428,frontend188897 e daemon18676, boot/cron/configurações/saved-fallback600, política9c7b44/helper/sudoers e cinco gatesfalse preservados. Sem intent/recibo de retirada. Leitor canônico atual somente READ ONLY confirmou out.15 cancelada, seis entregas reportadas, cinco não enviadas, pending0/failed0; sem repetição de cancelamento/envio ou reabertura da investigação. A confirmação funcional anterior é reutilizada: nenhum serviço/configuração foi alterado.

Custódia completa:108 arquivos,83 diagnósticos/source/input/recibos mais conteúdos/índices/provas/extração, diretórios700/arquivos600. Manifest SHA `d50c06e19630024ad8961520e4a51781c2e7bfc61e52124250d4618e6f38b94e`. Segredos/configurações privadas nunca são publicados. [Comandos A/B/C para decisão exclusiva](THIRD_WITHDRAWAL_COMMANDS_FOR_REVIEW.txt), [resultado sanitizado](THIRD_WITHDRAWAL.sanitized.json), [fontes/manifest](third-withdrawal/files.sha256). B continua não autorizado.

Provas adicionais diretamente afetadas:7 testes do certificado exato (recibo/planHash/journal/post fresco), sem apply real. Fontes de auditoria expiradas/custody volumosa não são o procedimento vigente; preservadas nos diagnósticos e nas gerações anteriores. A preparação final usa o grafo resolvido fora da VPS e verifica todas as fontes alcançáveis por hash antes de selar o input; adições de referências só são aceitas nos cinco diretórios de auditoria criados explicitamente, sem remoção/drift de referências anteriores. Qualquer drift operacional exige nova investigação/generação, nunca editar este input para PASS.
