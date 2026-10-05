# b9/V4 — contingência de retorno com worker candidato ausente

Estado: **LOCAL VALIDATED / NOT DEPLOYED**. Produção não foi alterada nesta rodada. A API 879, o worker mínimo af26 e o frontend af26 continuam efetivos; a tentativa anterior e suas provas consumidas permanecem preservadas. O tar funcional b9 já validado continua fixado no SHA-256 `236c1d502df5767eb7cde726ce0d7ae7c6e8200489cac4d09a417b08d98c0e98`; nenhum rebuild foi feito.

## Contrato e bytes revisáveis

A ida normal mantém `source_processes_alive`: daemon PM2 e os três filhos vivos com PID, tempo de início e PPID esperados. O retorno pós-retirada da contenção aceita uma variante **somente para recovery**: API e frontend candidatos vivos e identificados, PM2 original identificado, worker candidato offline/ausente sem substituto, e identidade da última execução do worker previamente capturada. O sequenciador grava antes do `unfence` a identidade, grupo/sessão, UID, release, árvore completa de descendentes e inodes de sockets. O helper root-owned reobserva e vincula o hash dessa captura à fase de `unfence`; a fase `complete` preserva o hash. A política de retorno nova exige esse hash, a fase anterior e a mesma captura copiada. Ausência de PID ou porta fechada, isoladamente, não satisfaz o gate.

Antes de retornar, o helper confere a identidade da API, frontend e PM2, ausência de todos os PIDs capturados, de processos no grupo/sessão do worker, de executores da release, dos sockets capturados e de filho PM2 inesperado. PID reutilizado, descendente, worker substituto ou leitura ambígua negam o avanço. O adaptador de retorno executa `recover-partial` somente com esse vínculo; contém novamente as portas, para a API candidata e exige o certificado de saída, ausência de árvore/sockets, zero backends externos e zero advisory locks antes da API 879/worker af26. O frontend não é parado. O fluxo de retorno mantém DB/auth atuais e não repete start incerto nem reutiliza nonce/prova. Falha do observador ou do certificado deixa guarda e contenção fechadas para diagnóstico; nenhum bypass foi acrescentado.

Arquivos: `v4-sequencer/{privileged.py,prepare_policy.py,prepare_post_unfence_return.py,sequencer.py,absent-worker-return.patch}`. O patch somente adapta `ops.py` e `delegated.py` de retorno **após** confirmar os hashes normalizados das fontes privadas; não substitui o worker pelo worker completo. `render_sudoers.py` e os nove comandos literais permanecem inalterados. O manifesto versionado contém os SHA-256 finais de código, patch e testes; a preparação futura deve conferir também seus próprios hashes privados. A política root-owned é gerada somente em uma preparação nova, pois contém PIDs/tempos e caminhos daquela execução.

## Ensaios reproduzíveis

No diretório `v4-sequencer`:

```bash
unshare -Urpf --mount-proc python3 -m unittest -q test_sequencer.py test_privileged.py
unshare -Urpf --mount-proc python3 test_absent_worker_pm2.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2
python3 test_absent_worker_mode.py /tmp/re7-b9-absent-review
RE7_PATCHED_MODE_DIR=/tmp/re7-b9-absent-review python3 -m unittest -q test_renewal_consumed_proof.py
```

Resultado final: 33/33 testes do sequenciador/helper; laboratório com **PM2 6.0.14 e Node 20.20.0 reais** passou; 4/4 testes do adaptador de retorno e 5/5 de renovação de prova passaram. O laboratório PM2 inicia apenas processos JS ociosos em namespace, sem DB, sessões ou providers produtivos. Ele comprovou o classificador efetivo para worker vivo/ausente, sobrevivência de descendente ou executor da release, troca de daemon/API/frontend, substituto e retorno completo à API/worker antigos com frontend preservado. PID reutilizado foi injetado porque sua ocorrência real não é reproduzível com controle determinístico. Os efeitos nft, cron, systemd e DB nos testes de sequenciamento/adaptador foram simulados; não atribuir a eles validação de operações privilegiadas reais. O helper real validou a captura de árvore/socket; captura adulterada foi negada. A aplicação do patch sobre os bytes originais privados e a comparação byte a byte do resultado também passaram.

## Preparação e instalação futura, sem execução nesta rodada

Não reutilizar a preparação consumida. Criar janela nova com o mesmo tar b9 íntegro, API b9, API 879 de retorno, worker mínimo af26 de retorno, frontend preservado, backup/restore frescos e sem provas/start-intents herdados. Copiar para ela os bytes versionados deste pacote, aplicar o patch de retorno somente às fontes atestadas e gerar política nova com o worker capturado se o ramo de contingência for necessário. Instalar helper **antes** de abrir a janela, pois o helper atualmente instalado não reconhece a captura e a fase novas. O comando restrito de substituição, executado por Deifson em sua sessão, será:

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-NOVA
H=/usr/local/libexec/re7/incident-6683-window-control.py
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
OLD=/usr/local/libexec/re7/incident-6683-window-control.pre-absent-worker.py
test "$(sha256sum "$P/window/privileged.py" | cut -d' ' -f1)" = 8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212
sudo test ! -e "$OLD" && sudo test ! -L "$OLD"
sudo test "$(sudo sha256sum "$H" | cut -d' ' -f1)" = 24bdba2bde2c6835f699bdc79b269e4a458a8013aa8a03a2a9a25627619b0198
sudo install -o root -g root -m 0644 "$H" "$OLD"
sudo install -o root -g root -m 0644 "$P/window/privileged.py" "$H"
test "$(sha256sum "$H" | cut -d' ' -f1)" = 8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212
sudo namei -l "$H" "$Q"
sudo visudo -c
```

`P` deve ser trocado pelo diretório novo. A política da nova ida requer outro bloco restrito. O hash dela depende dos PIDs/tempos capturados nessa preparação, por isso só poderá ser fixado após gerar e revisar os bindings. A receita exata para essa etapa é:

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-NOVA
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
OLD=/usr/local/libexec/re7/incident-6683-window-policy.pre-absent-worker.json
EXPECTED_OLD_SHA=HASH_COMPLETO_ATESTADO_NO_PREFLIGHT
EXPECTED_NEW_SHA=HASH_COMPLETO_ATESTADO_DA_POLITICA_GERADA
sudo test ! -e "$OLD" && sudo test ! -L "$OLD"
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = "$EXPECTED_OLD_SHA"
test "$(sha256sum "$P/window/privileged-policy.private.json" | cut -d' ' -f1)" = "$EXPECTED_NEW_SHA"
sudo install -o root -g root -m 0600 "$Q" "$OLD"
sudo install -o root -g root -m 0600 "$P/window/privileged-policy.private.json" "$Q"
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = "$EXPECTED_NEW_SHA"
sudo stat -c '%U %G %a %n' "$H" "$Q"
sudo namei -l "$H" "$Q"
sudo visudo -c
sudo -n /usr/bin/python3 -I -S "$H" inspect
```

Os dois hashes de política e o caminho `P` são parâmetros obrigatórios a preencher com a preparação fresca; `H` permanece definido no primeiro bloco, na mesma sessão. Não executar com placeholders. `inspect` deve retornar política nova, fase nula e processos de origem vivos. A regra sudo literal não muda. Nenhum desses comandos foi executado nesta rodada. Remover helper/permissão só depois de concluídas todas as possibilidades de retorno que dependam deles.

## Limites e próximo gate

A captura e a reobservação são pontuais; não conferem atomicidade ao `/proc`. A execução única, PM2/boot/cron controlados, contenção e fase root-owned continuam necessários. Mudança de identidade, captura incompleta ou novo executor causa recusa, não autorização por espera. O próximo passo é revisão independente destes bytes e ensaios, seguida de preparação privada nova e verificação dos hashes do helper/política antes de qualquer contenção. Campanhas/CRA e aceite funcional de b9 continuam pendentes; os quatro registros históricos não foram reparados nem reenviados.
