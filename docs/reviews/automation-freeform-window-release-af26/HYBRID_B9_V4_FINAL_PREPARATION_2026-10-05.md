# b9/V4 — preparação operacional final, 05/10/2026

**PREPARED FOR INSTALLATION / NOT DEPLOYED.** A preparação privada completa está em `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-absent-20261005T121000Z`. Usa os bytes operacionais de `39682db4b4174facb05b523b1cfd830bd14cfb5c` e o tar funcional exato já validado. Os cinco gates continuam `false`; nenhum helper/política foi instalado, candidato iniciado, guarda alterada, firewall aplicado ou processo parado nesta rodada. Preparações históricas e a primeira montagem parcial desta rodada foram preservadas.

Os [comandos executáveis completos](b9-39682-prepared/OWNER-STEPS.txt) e o [manifesto sanitizado da preparação](b9-39682-prepared/manifest.sanitized.json) acompanham este relatório. Configurações, auth, dump e evidências operacionais privadas permanecem exclusivamente no diretório privado; não foram versionados.

## Artefatos, identidades e hashes fixados

| Componente | Composição conferida |
| --- | --- |
| API candidata | Release `b9b58177880e729854580def1180f3edb2fb83e8-api`; os 13 pares fonte/compilado do manifesto revisado conferem. Nenhum outro delta incorporado. |
| Worker candidato | Release `worker-minimal-hybrid-b9b58177-verified-v3`, proveniente do tar exato abaixo, sem rebuild. Conferência dos 7.036 arquivos e 11 symlinks da release; nova extração limpa do mesmo tar passou o manifesto completo e o fechamento de imports, sem iniciar aplicação. O `.data` operacional é o único symlink adicional permitido, apontando à auth corrente previamente vinculada. |
| Retorno | API `879cb1faa88493cd78dd789b71f85043d6c8ff9c-api` e worker `worker-bf5f1d76-f06d49cb-91230f88-b66bb89a-af26-window`, atualmente vivos. DB/auth atuais preservados; nenhum restore produtivo. |
| Frontend | af26 preservado em todos os modos. PID `2537692`, sem reinícios; BUILD_ID `J5cHyVKiKEI5xxiGBY5If`. Nenhum stop/start ou rebuild previsto. |
| Schema/Prisma/dependências | API candidata e retorno com schema SHA `7fec399ffbbeb4f2d002d128481f96c1aaebb3efb9d0a76f2ba129939c5b54bd` e lockfile SHA `add66bbb579b4c2424746ccd26b7a41ec24faecf77d324447b9f8b463c73726a` idênticos. A composição Prisma do worker permanece a do tar já ensaiado em Node 20.20.0; sem migration ou atualização de dependência. |

| Arquivo / conjunto | SHA-256 completo |
| --- | --- |
| Tar `window/worker-minimal-b9-v3.tar.gz` | `236c1d502df5767eb7cde726ce0d7ae7c6e8200489cac4d09a417b08d98c0e98` |
| Helper proposto `window/privileged.py` | `8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212` |
| Política nova da ida `window/privileged-policy.private.json` | `2f8f384602e66dd5050cf37cf1558ce7b137deb115a6001fa3cc8c5edf6eb6e7` |
| Sequenciador `window/sequencer.py` | `d9719e2f1840589a74d664f57cbd6ec6404ef6622f9759e3107aac2974ad5514` |
| Gerador `window/prepare_policy.py` | `3d612e0bd003f39c182de240c75439b455dd6f4e8a78b17e0ceaeb9ed27f9601` |
| Template pós-retirada `window/prepare_post_unfence_return.py` | `813102bb238d07918f8cd18642cfe3d3c9ace3db5c33cdcfa4d4ded885f457fd` |
| Patch retorno ausente `window/absent-worker-return.patch` | `378841d7326acfb26832ac8d3b910837ec57626abc3d493fbc8883bf75d4210a` |
| `window/sequencer-manifest.json` | `cc3f8523b98ce7cb98ec7593d4b9ed5d29ff68d4e216769672a16993ce9874fd` |
| `window/mode-manifest-v4.json` | `92e982e738c14947e20c786209a0913517e5f5e23f05e3a2f01d102edb857639` |
| `window/release-manifest.private.json` | `c52ad73ed1d252a754a11cdd4b5d7a36d33c4fa23e8225aafe27b3b52a0cf1a3` |
| `window/OWNER-STEPS.txt` | `561f7930b31986de798e5f1937588512c54d8c5dc5c96915cd9e6403c2193aed` |
| `switch/scripts.sha256` — 24 entradas | `8b2dccc8a1a27877f00cbaa4a03129069854eb358ec32747d5e58c53f6fe7a09` |
| `return/scripts.sha256` — 24 entradas | `b606b74673acb8dfd4b1c1f29c56b0b329ae6cf8305533064f2eea647151904e` |
| `return-partial/scripts.sha256` — 24 entradas | `a4a903c8aaa0c703730e03bcee76dd886638c0b3b61e1aa5f506d43b28118bd3` |
| `ops.py`, em cada um dos três modos, vinculado ao root novo | `ba1991f9b9dde1fc8cf1d739e85026ac781d84c93145cf4b2bafcefb21335ff2` |
| `delegated.py`, em cada um dos três modos | `b251b694d9095a58f62f9856ee00e3254ef7aeb238152882b7b228b81f8fd88c` |
| Sudoers proposto, mesmos nove comandos | `62b5a2ac1d56b013f6db4bb8180b0637b985786214f4bc3ce0e5f8d3f7c5111a` |

Os manifestos dos modos passaram integralmente após a vinculação ao novo caminho. A origem normalizada de `ops.py/delegated.py` do modo `return` corresponde exatamente à origem exigida pelo patch de worker ausente; o template aplica o patch somente nessa origem e confere também os hashes de resultado. Nenhuma prova, nonce, start-intent ou certificado consumido foi copiado. A política nova contém PIDs/tempos atuais, destino de releases e bytes de controles fixos; qualquer mudança desses processos antes da execução invalida a preparação e exige nova captura.

As configurações reduzidas de aplicação foram comparadas ao ambiente dos processos reais: 85 chaves da API, 17 do worker e seis do frontend, com **zero divergências**, sem copiar metadados PM2 ou exibir valores privados.

A política do retorno **pós-retirada** não pode ter um hash conhecido agora: seus bytes dependem dos PIDs/tempos da API candidata e da última execução do worker, que ainda não foram iniciados. Seu gerador, patch e contrato estão fixados acima; os comandos abaixo geram e conferem seu hash integral a partir do estado observado, sem editar política existente ou fornecer PIDs presumidos. Os modos de retorno ainda sob contenção usam a política da ida e já estão preparados.

## Leituras imediatas e backup/restauração

As últimas leituras confirmaram API PID `2832716`, worker PID `2835341` e frontend PID `2537692`, todos online e com zero reinícios, ligados ao mesmo daemon PM2 e às origens da política. Health/DB passou em **05/10 às 09:20:47 Fortaleza**. Guarda disponível, aberta na geração **25**, com `tasks: {}` e sem falha de ledger. A flag real `CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=false` mantém o scheduler habilitado; nenhuma alteração de scheduler foi realizada. `dump.pm2` e `dump.pm2.bak` correspondem aos scripts/cwds atuais compatíveis, com `watch=false`. Cron de backup e crontab do deploy conferem com os bytes capturados; boot `inactive/enabled`, barreira nft ausente.

O observador instalado conseguiu a leitura restrita. Identidade e hash do proxy vivo conferem com os bindings existentes; Docker **29.2.1**, `/usr/bin/docker-proxy` SHA `8cd3b929d0cbae223b017134f7e8a09a7da49089fe24ffc051b8c54f7718d7e1`. A prova de proveniência já revisada foi reaproveitada. Caminhos `.data` de ida/retorno conferem com a auth compartilhada atual. O recorte DB de preparação mostrou **zero jobs/grupos/leases/agendamentos em envio**, quatro sessões conectadas e cinco registros auth. Esse recorte não certifica drain nem observabilidade integral de inbound/outbound/auth; a guarda/drain de campanhas será comprovada novamente pelo sequenciador na execução autorizada.

Backup persistente novo: `window/database.dump`, **26.508.828 bytes**, SHA `535601239db17240c6bac4f266e251f7a7ed2902e57c3be350d566221cc1fa09`, catálogo de **614 objetos**. Espaço disponível antes do backup: aproximadamente 16,2 GiB; nenhuma limpeza, alteração de permissões ou retenção destrutiva. Configurações/saved/fallback/guarda, auth/runtime e conteúdo tiveram arquivos privados novos, leitura de catálogo/tar e hashes verificados. Manifesto do backup SHA `152204ab9833fcac5eba5c9ffd3ebc8b059b6dcb86148e0ef27d1b50cccf8ace`.

O mesmo dump foi restaurado em PostgreSQL **16.15 local isolado**, somente por socket Unix, sem aplicação/provider. Restore com `--exit-on-error` passou; 60 migrations concluídas e seis rollbacks históricos. A conferência adicional dos checksums das 60 migrations concluídas contra os SQLs rastreados encontrou **zero ausentes e zero divergentes**. Os dois bancos temporários usados para restore/conferência foram removidos e o PostgreSQL local foi parado. Resultado vinculado em `window/restore-result.json`, SHA `c22b04dd33c0b2ece7819de0cadb7bcd1e3d8fae93c759d33dd137d0cb41a7b6`. Os dados restaurados ficaram fora do Git; nenhum dump foi restaurado em produção. O retorno usa os dados/auth atuais, preservando alterações posteriores ao backup.

Os ensaios operacionais e funcionais aprovados foram reaproveitados porque os módulos de `39682db4` e o tar não mudaram. Houve somente verificações de integridade, extração e backup/restore necessárias à preparação, sem novos builds ou suítes.

## Instalação restrita antes da janela — Deifson

**Bloco preparado, não executado.** O helper instalado foi relido e mantém SHA `24bdba2bde2c6835f699bdc79b269e4a458a8013aa8a03a2a9a25627619b0198`; helper `root:root 0644`, política `root:root 0600`. O conteúdo da política instalada exige sudo com senha e não foi relido pelo executor nesta rodada. Seu hash esperado é o da última atestação privilegiada, `e56235b96a91f2d10868a235eaab79e2ac102797273c08d0c557d48fdf632d2d`; o teste privilegiado abaixo precisa confirmá-lo **antes de qualquer escrita**. Divergência interrompe o bloco. Os destinos de arquivo histórico e a fase do hash novo foram conferidos ausentes. A instalação deve ser concluída antes de habilitar os gates ou conter tráfego.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-absent-20261005T121000Z
H=/usr/local/libexec/re7/incident-6683-window-control.py
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
S=/etc/sudoers.d/re7-incident-6683-window
HA=/usr/local/libexec/re7/incident-6683-window-control.pre-b9-absent-121000.py
QA=/usr/local/libexec/re7/incident-6683-window-policy.pre-b9-absent-121000.json
sudo test ! -e "$HA" && sudo test ! -L "$HA"
sudo test ! -e "$QA" && sudo test ! -L "$QA"
test "$(sha256sum "$H" | cut -d' ' -f1)" = 24bdba2bde2c6835f699bdc79b269e4a458a8013aa8a03a2a9a25627619b0198
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = e56235b96a91f2d10868a235eaab79e2ac102797273c08d0c557d48fdf632d2d
test "$(sha256sum "$P/window/privileged.py" | cut -d' ' -f1)" = 8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212
test "$(sha256sum "$P/window/privileged-policy.private.json" | cut -d' ' -f1)" = 2f8f384602e66dd5050cf37cf1558ce7b137deb115a6001fa3cc8c5edf6eb6e7
test "$(sha256sum "$P/window/re7-incident-6683-window.sudoers.proposed" | cut -d' ' -f1)" = 62b5a2ac1d56b013f6db4bb8180b0637b985786214f4bc3ce0e5f8d3f7c5111a
sudo cmp "$P/window/re7-incident-6683-window.sudoers.proposed" "$S"
sudo visudo -c
sudo install -o root -g root -m 0644 "$H" "$HA"
sudo install -o root -g root -m 0600 "$Q" "$QA"
sudo install -o root -g root -m 0600 "$P/window/privileged-policy.private.json" "$Q"
sudo install -o root -g root -m 0644 "$P/window/privileged.py" "$H"
test "$(sha256sum "$H" | cut -d' ' -f1)" = 8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 2f8f384602e66dd5050cf37cf1558ce7b137deb115a6001fa3cc8c5edf6eb6e7
sudo namei -l "$H" "$Q"
sudo stat -c '%U %G %a %n' "$H" "$Q"
sudo visudo -c
sudo -n /usr/bin/python3 -I -S "$H" inspect
```

Exigir cadeia sem symlinks/escrita por deploy, arquivos `root:root` com os modos indicados, sudoers literal idêntico e `inspect` com hash da política nova, `phase:null`, `sourceProcessesAlive:true`. Esse `inspect` pós-instalação ainda é **NOT EXECUTED**, conforme o escopo. Não instalar política/helper para testar agora. A permissão dos nove comandos permanece igual; não há sudo geral, shell root delegado ou nova regra sudoers.

## Ida e retorno antes da retirada — Codex

Após a decisão de instalação/execução, reconferir execução única, PIDs/tempos e hashes, proxy/bindings, auth/sessões, trabalhos, backup, cron/boot e guarda. Drift de identidade/configuração impede habilitar gates; não renovar provas contra outro binding. Só então habilitar os cinco gates e executar **uma vez**:

```bash
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-absent-20261005T121000Z
python3 "$P/window/sequencer.py" "$P"
```

1. Capturar baseline; fechar guarda por CAS, confirmar geração e drain; emitir preflight somente depois. Não encerrar HUMAN.
2. Conter portas 3000/3001 e controlar cron/boot pelos bytes root-owned; iniciar horizonte de escalonamento. `stop-pair` uma única vez. Exigir saída de processos/descendentes, sockets, certificado, zero backends externos e zero advisory locks antes da API.
3. Iniciar API b9; obter prova V4 nova que explica exaustivamente suas conexões pelo proxy antes de iniciar um worker mínimo b9. Frontend permanece com a identidade original. Observador falho ou cliente estranho nega o worker, inclusive no retorno.
4. Antes de retirar nft: identidade/hash/script/cwd, frontend, controle HTTP do worker na porta própria, guarda fechada e PM2/fallback; capturar árvore/sockets do worker vivo e ancorar hash na fase root-owned. Health na porta 3001 é realizado somente **após** retirar nft, pois a contenção também bloqueia loopback.
5. Depois: `validate.cjs` com captura privada de etapa/stdout/stderr/exit code; health/DB/frontend, worker/sessões e leitura Inbox/CRM pelo owner. Só com validação segura, reabrir a guarda por CAS no estado inicial autorizado e restaurar cron/boot; conferir barreira ausente. Health não constitui aceite funcional b9.

Antes da parada, aborto restaura estado original apenas se as mesmas identidades estiverem vivas. Após parada/start parcial, o sequenciador seleciona `return-partial`; com par candidato completo sob contenção, `return`. Ambos apontam à API 879/worker af26, exigem saída do proprietário atual e certificados/V4 frescos, sem parar frontend, restaurar DB/auth, apagar locks ou repetir start. Intent incerto exige observação e impede novo start. **15 minutos** são horizonte de escalonamento; não autorizam kill, bypass, reabertura de guarda ou promessa de recuperação automática por tempo.

## Contingência pós-retirada, com worker vivo ou ausente — Codex + Deifson

Se a validação pós-retirada falhar, manter guarda fechada, coletar diagnóstico e observar processos reais. Antes de gerar o retorno, a fase anterior precisa ter controles restaurados: quando estiver `unfenced`, executar uma vez o comando literal `restore-controls`; quando já estiver `complete`, não repeti-lo. Isso restaura cron/boot sem start e mantém a guarda fechada. O observador precisa estar disponível; não dispensar suas provas para recuperar.

```bash
sudo -n /usr/bin/python3 -I -S /usr/local/libexec/re7/incident-6683-window-control.py restore-controls
```

Com barreira ausente, API/frontend/daemon identificados e worker correto vivo **ou** ausente comprovado, gerar a preparação nova abaixo. Seu destino foi conferido ausente. O template já fixado captura identidades/DB/bindings atuais, exige a captura anterior do worker e a fase root-owned quando ausente, rejeita substituto/descendente/socket/PID reutilizado e aplica o patch somente sobre os bytes atestados. Não iniciar um worker quebrado para produzir uma identidade e não copiar provas/intents.

```bash
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-absent-20261005T121000Z
R=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-return-b9b58177-absent-20261005T121000Z
python3 "$P/window/prepare_post_unfence_return.py" "$P" "$R"
```

Depois de conferir a saída e os manifestos gerados, **Deifson precisa instalar esta política fresca na própria sessão sudo**. Essa dependência existe mesmo com worker ausente e foi explicitada antes da janela. O helper e a regra sudo não mudam. O valor `RETURN_POLICY_SHA` é lido da saída persistida e conferido com os bytes recém-gerados; não é placeholder nem hash presumido de processos futuros.

```bash
set -euo pipefail
R=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-return-b9b58177-absent-20261005T121000Z
H=/usr/local/libexec/re7/incident-6683-window-control.py
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
QA=/usr/local/libexec/re7/incident-6683-window-policy.failed-b9-absent-121000.json
sudo test ! -e "$QA" && sudo test ! -L "$QA"
test "$(sha256sum "$H" | cut -d' ' -f1)" = 8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 2f8f384602e66dd5050cf37cf1558ce7b137deb115a6001fa3cc8c5edf6eb6e7
RETURN_POLICY_SHA=$(cat "$R/window/privileged-policy.sha256")
test "$(sha256sum "$R/window/privileged-policy.private.json" | cut -d' ' -f1)" = "$RETURN_POLICY_SHA"
sudo install -o root -g root -m 0600 "$Q" "$QA"
sudo install -o root -g root -m 0600 "$R/window/privileged-policy.private.json" "$Q"
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = "$RETURN_POLICY_SHA"
sudo namei -l "$Q" "$H"
sudo stat -c '%U %G %a %n' "$Q" "$H"
sudo visudo -c
sudo -n /usr/bin/python3 -I -S "$H" inspect
```

Com worker ausente, o esperado é `phase:null`, `sourceProcessesAlive:false`, `sourceWorkerAbsent:true`; com par correto vivo, `sourceProcessesAlive:true`. O hash exibido deve ser o da política nova. Codex então executa uma vez:

```bash
R=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-return-b9b58177-absent-20261005T121000Z
python3 "$R/window/sequencer.py" "$R" --post-unfence-return
```

Esse ramo reaplica contenção. Worker ausente usa `recover-partial`; par vivo usa `stop-pair`. Depois da saída da API candidata exige novamente certificado, ausência de árvore/sockets e zero backend/locks antes de iniciar API 879; prova V4 fresca antes do único worker af26. Finaliza validação, saved/fallback e controles com frontend preservado. Qualquer sobrevivente, ambiguidade ou falha do observador bloqueia sem limpeza ou reenvio. A prova é pontual e depende da execução única e dos iniciadores controlados; não promete atomicidade do `/proc` ou observabilidade integral do shutdown antigo.

## Dependências restantes para a decisão

- Deifson executar a instalação restrita acima depois da aprovação, incluindo a leitura sudo do hash atual da política antes de escrever; `inspect` novo precisa passar antes da contenção.
- Reconferência imediatamente anterior à execução, inclusive exclusividade operacional e validade dos bindings/backup. Os gates continuam falsos até essa conferência e a decisão do owner.
- Deifson acompanhar a janela e estar disponível para eventual instalação da política fresca de contingência; leitura funcional autenticada Inbox/CRM após retorno do tráfego. Nenhum cliente será solicitado a enviar dados para obter PASS.

Produção preservada. Sem reparo dos quatro registros históricos, fusão de conversas, reenvio, mudança de transporte/fluxo ou nova funcionalidade. Implantação técnica de b9 e aceite funcional ainda pendentes; campanhas/CRA aguardam validação do owner, SECULT encerrada e reparo de setembro CLOSED.
