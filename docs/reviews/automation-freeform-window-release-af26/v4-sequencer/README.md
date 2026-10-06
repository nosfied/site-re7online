# 6683 — executor sequencial e delegação restrita V4

**Revisão local de 05/10:** [diagnóstico completo e renovação limitada da captura](../CAPTURE_RENEWAL_LOCAL_2026-10-05.md), LOCAL VALIDATED / NOT DEPLOYED. Streams privados completos em todas as ações root; duas observações estáveis, arquivos anteriores preservados, identidade sem R/S e gate root intacto. Treze testes novos, 23 regressões e quatro casos do adaptador de ausência e driver Node20/PM2 real com 25 verificações; efeitos nft/fases simulados, sem build funcional ou nova janela. Os registros e comandos abaixo permanecem históricos.

**Registro atual:** a tentativa `165710Z` foi consumida e retornou à API/worker/frontend af26, sem liberar a candidata ao tráfego. O helper instalado foi substituído durante a recuperação pelo SHA-256 `24bdba2bde2c6835f699bdc79b269e4a458a8013aa8a03a2a9a25627619b0198`; a política e os nove comandos sudo não mudaram. Consulte o [resultado e as limitações](../INCIDENT_6683_V4_SEQUENCED_RETURN_2026-10-03.md). **Não executar os comandos históricos abaixo nem reutilizar esta preparação, seus certificados, nonces ou intents.** Eles registram a proposta anterior, cujos hashes não representam mais o helper instalado. Nova tentativa exige pacote/preflight próprios.

**FOR INDEPENDENT REVIEW / NOT DEPLOYED.** Estas fontes não contêm ambiente, sessão, token, dump ou estado de cliente. A API funcional segue fixada em `879cb1fa`; frontend e worker mínimo af26 permanecem os mesmos. O pacote abortado `incident-6683-v4-20261003T150000Z`, suas provas e backups não devem ser modificados.

`sequencer.py` é o único entry point da tentativa nova. Ele captura PM2/identidades e guarda, recusa uma requisição de preflight preexistente, fecha a guarda via `close.cjs`, confirma `generation = baseline + 1` e **só então** chama `delegated.py request/record/execute preflight`. Cada ação posterior usa o protocolo V4 existente, prova nft fresca e pós-condição; não repete start-intent. Um journal append-only e um lock comum entre preparações registram a sequência. Drift de geração/configuração nega imediatamente. Com a contenção intacta, a recuperação usa `return-partial` ou `return` conforme marcadores **e** processos reais; start incerto sem marcador bloqueia escolha automática. Antes da parada, restaura controles e guarda por CAS. Depois de retirar a contenção, falha de controles não causa parada automática de uma API que já serve tráfego.

`privileged.py` é proposto para instalação root-owned em `/usr/local/libexec/re7/incident-6683-window-control.py`, com política root-owned separada em `/usr/local/libexec/re7/incident-6683-window-policy.json`. Aceita apenas os nove argumentos literais gerados por `render_sudoers.py`, executado por `/usr/bin/python3 -I -S`. Não executa código da preparação gravável por `deploy`: regra nft, cron inicial/de janela, processos esperados e hashes dos scripts vêm da política copiada e conferida **antes** de habilitar sudoers. `inspect` verifica processo original, boot/cron, tabela ausente e sintaxe nft sem mutação. Ações root são serializadas por lock, auditadas em arquivo root-owned e protegidas por fase root-owned. `authorize-switch`/`authorize-return` conferem frontend preservado, saída do par antigo, único par sucessor filho do PM2, cwd/script/hash e PM2 saved/fallback iguais antes de permitir `unfence`.

## Evidências locais desta revisão

```bash
cd docs/reviews/automation-freeform-window-release-af26/v4-sequencer
python3 -m unittest -v test_sequencer.py test_privileged.py
```

**21/21 PASS**: driver controlado para ida/retorno, falha antes e depois do start, prova antecipada negada, drift e prova vencida recuperados sem repetir start, frontend preservado, falha privilegiada parcial, cron/boot/nft injetados, política/hash, e filhos **reais** de um processo local para identidade e saved/fallback. Um caso executa a substituição atômica do cron em namespace de usuário isolado e rejeita symlink. Os casos novos cobrem o formato real `tasks: {}` da guarda, a cadeia sequenciador → helper real (ida e retorno parcial) e a fase root-owned distinta por hash da política; uma tentativa abortada não é reutilizada. O teste V4 existente `test-api-only-6683.py` foi reexecutado sobre cópia isolada das quatro fontes operacionais intactas: **5/5 PASS**, incluindo nonce novo após 300 s e recusa de identidade alterada. Esses grupos não equivalem a uma execução nft/systemd real. O namespace Linux local permite criar rede separada, mas `nft` retornou `Operation not permitted` no Netlink; a sintaxe real deve ser checada pelo `inspect` instalado antes da janela. Builds funcionais não foram repetidos.

## Preparação nova e instalação proposta a Deifson

### Bloqueio da revisão ee6105af e substituição proposta

**Não executar a instalação abaixo ainda.** A revisão de `ee6105af` achou que o helper root-owned ainda comparava a guarda persistida `tasks` com `[]`. O sequenciador, o helper e as quatro fontes operacionais por modo agora validam explicitamente o schema persistido: `version: 1`, `open` booleano, `generation` inteiro não negativo, `tasks` objeto e `audit` lista. `tasks: {}` é o único vazio aceito; trabalho presente bloqueia, assim como campo ausente, `null`, `false`, `""` ou `[]`. Uma falha de leitura/JSON também bloqueia.

[Patch sanitizado](guard-contract-v4.patch) aplica-se, sem fuzz, às fontes **originais** `ops.py`, `delegated.py`, `read-state.py` e `execution-check.cjs` de cada um dos modos `switch`, `return` e `return-partial`; ele também corrige bindings que ainda apontavam à tentativa `163000Z` em vez da preparação `165710Z`. [Manifesto de origem/resultado](mode-manifest-v4.json) fixa SHA-256 dos quatro módulos e do `scripts.sha256` recalculado para cada modo. A preparação privada `165710Z` ainda contém os bytes antigos e gates falsos; não está pronta para execução. O arquivo `sequencer-manifest.json` privado também precisa ser atualizado com os SHA-256 de `sequencer.py` e `privileged.py` do [manifesto versionado](manifest.json). Não copiar provas, intents ou marcadores de outra tentativa.

Auditoria das leituras: `close.cjs`/`open.cjs` e `Bridge.restore_guard()` recebem o diagnóstico HTTP, cujo `tasks` é **array** e por isso exigem `[]`. `Bridge.guard()`, `System.guard()` de `ops.py`, `read-state.py` e `privileged.guard_closed()` leem o **arquivo**, cujo `tasks` é objeto. `Operations.guard()`, `Controls.enter/finish` e `delegated.bindings/finish` aplicam o mesmo schema. `inspect` lê processos/cron/boot/nft antes do close e **não** exige guarda fechada; o sequenciador valida a guarda em `capture_baseline` e imediatamente após `close`. `preflight` e renovações passam por `delegated.bindings`; `enter`, `authorize-switch`, `authorize-return` e `unfence` exigem `privileged.guard_closed()` com coleção vazia. `check-absent`/`check-present` só certificam nft; a ordem do sequenciador os prende ao gate correspondente. Formato inválido nega antes de aceitar vazio. Nenhuma regra sudo é adicionada. A política privada `e80cd68d…` não embute estes quatro módulos nem o código do helper e permanece byte a byte igual; a substituição proposta troca apenas os bytes de helper e fontes/manifests operacionais, preservando os originais e a fase abortada.

Verificação isolada desta substituição: `python3 -m unittest -v test_sequencer.py test_privileged.py` **21/21 PASS**; `RE7_PATCHED_MODE_DIR=/tmp/incident_6683_guard_pkg/updated python3 -m unittest -v test_mode_guard_contract.py` **2/2 PASS por modo** (`switch`, `return`, `return-partial`) sobre `System.guard`, `Operations.guard` e `delegated.bindings` da fonte operacional corrigida. O teste integrado usa `privileged.guard_closed()` real com `tasks: {}` e simula somente nft/cron/systemd e processos. `patch --dry-run` nas fontes originais dos quatro módulos, `py_compile` e `node --check` passaram. Os três modos tinham os mesmos hashes de origem; os hashes finais estão no manifesto. Estes ensaios não são implantação e não substituem o `inspect` root-owned após eventual instalação.

Para a substituição futura, após revisão independente: atestar hashes antigos de todos os modos, aplicar o patch em cópias privadas preservando os originais, recalcular `scripts.sha256` segundo o manifesto e testar `sha256sum -c`; colocar `sequencer.py` e `privileged.py` corrigidos na preparação e atualizar `sequencer-manifest.json`; atestar os SHA finais; só então executar o bloco de instalação restrita abaixo com `EXPECTED_HELPER_SHA` corrigido. A política root-owned e os nove comandos sudo literais não mudam. Se algum binding ou processo divergir, preparar estado novo e abortar antes de conter tráfego.


O pacote `incident-6683-v4-sequenced-20261003T163000Z` fechou e reabriu a guarda sem conter tráfego, porque exigia `tasks == []` para o estado persistido `tasks: {}`. A fase root-owned legada ficou `aborted`; preservar essa fase, a política, o helper original arquivado, provas, backup e o pacote. A tentativa nova usa `incident-6683-v4-sequenced-20261003T165710Z`, criado de lista explícita dos 24 arquivos estáticos por modo, sem copiar `owner-request`, `owner-proof`, `*.consumed`, intents, certificados ou gates consumidos. A política imutável nova tem fase root-owned própria derivada do SHA-256 da política. Se API/worker/frontend ou daemon PM2 mudar de PID + start ticks entre a geração da política e `inspect`, preparar outra política **antes** de conter tráfego.

O helper e a política da tentativa abortada foram instalados sob os caminhos fixos; as nove entradas sudo literais já passaram por `visudo`. Para trocar **somente** helper/política, a implementação nova precisa de revisão e aprovação específica de Deifson. O bloco abaixo arquiva os dois originais root-owned, confere origem e destino, instala os dois novos arquivos e executa `inspect` somente leitura. Não altera sudoers, tráfego, cron, boot ou processos. Não seguir se algum arquivo de arquivo histórico já existir.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-sequenced-20261003T165710Z
H=/usr/local/libexec/re7/incident-6683-window-control.py
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
S=/etc/sudoers.d/re7-incident-6683-window
HA=/usr/local/libexec/re7/incident-6683-window-control.aborted-163000.py
QA=/usr/local/libexec/re7/incident-6683-window-policy.aborted-163000.json
OLD_HELPER_SHA=7ff947e36742a0b6611c01c81bc39ee682e1db7db3f1147893be2ea1f5be51b5
OLD_POLICY_SHA=b8e47f174871b83b87f309645c1583905380183a2f22c847cd86ad95dae050af
EXPECTED_HELPER_SHA=c649745bf0eb84593b6eac16939f96cc19b5655f0ee1416c5a08a3dabea096cd
EXPECTED_SUDOERS_SHA=62b5a2ac1d56b013f6db4bb8180b0637b985786214f4bc3ce0e5f8d3f7c5111a
EXPECTED_POLICY_SHA=e80cd68d2ac8bd39dddd52b604e63f3f747215a466728973581cf69ea20d0b83
sudo test ! -e "$HA" && sudo test ! -L "$HA"
sudo test ! -e "$QA" && sudo test ! -L "$QA"
test "$(sha256sum "$H" | cut -d' ' -f1)" = "$OLD_HELPER_SHA"
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = "$OLD_POLICY_SHA"
test "$(sha256sum "$P/window/privileged.py" | cut -d' ' -f1)" = "$EXPECTED_HELPER_SHA"
test "$(sha256sum "$P/window/re7-incident-6683-window.sudoers.proposed" | cut -d' ' -f1)" = "$EXPECTED_SUDOERS_SHA"
test "$(cat "$P/window/privileged-policy.sha256")" = "$EXPECTED_POLICY_SHA"
test "$(sha256sum "$P/window/privileged-policy.private.json" | cut -d' ' -f1)" = "$EXPECTED_POLICY_SHA"
sudo cmp "$P/window/re7-incident-6683-window.sudoers.proposed" "$S"
sudo install -o root -g root -m 0644 "$H" "$HA"
sudo install -o root -g root -m 0600 "$Q" "$QA"
sudo install -o root -g root -m 0600 "$P/window/privileged-policy.private.json" "$Q"
sudo install -o root -g root -m 0644 "$P/window/privileged.py" "$H"
sudo namei -l "$H" "$Q" "$HA" "$QA"
test "$(sha256sum "$H" | cut -d' ' -f1)" = "$EXPECTED_HELPER_SHA"
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = "$EXPECTED_POLICY_SHA"
sudo visudo -c
sudo -n /usr/bin/python3 -I -S "$H" inspect
```

O bloco preserva o helper e a política anteriores, além da fase legada `aborted`, sem sobrescrever suas evidências. Instala a política nova **antes** do helper novo: se a instalação parar no meio, o helper antigo continua preso à fase `aborted` e nega `enter`. A regra sudo não contém wildcard, shell, `SETENV` ou execução de arquivo gravável por `deploy`. A última linha é leitura; confirma política, fase nova ausente, processo original e nft antes da janela. O audit root-owned continua em `/var/log/re7-incident-6683-window.log`; cada política usa fase root-owned distinta em `/var/lib/re7/incident-6683-v4-phase-<SHA>.json`, com lock comum.

Impacto da instalação: capacidade estreita para `deploy` aplicar/remover **somente** a tabela `inet re7_campaign_transition`, alternar **somente** o cron `re7-converta-backup` entre bytes fixados, e desabilitar/habilitar **somente** `pm2-deploy.service`. Há risco operacional se essa capacidade for invocada fora do coordenador; lock, política root-owned, fases e verificação de processos reduzem o risco, mas não substituem a execução única e a supervisão do owner. A instalação não é autorizada por este documento.

Após a janela e após comprovar que nenhum retorno depende do helper, Deifson pode revogar somente estes objetos, comparando hashes e conteúdo com os instalados:

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-sequenced-20261003T165710Z
H=/usr/local/libexec/re7/incident-6683-window-control.py
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
S=/etc/sudoers.d/re7-incident-6683-window
EXPECTED_HELPER_SHA=c649745bf0eb84593b6eac16939f96cc19b5655f0ee1416c5a08a3dabea096cd
EXPECTED_POLICY_SHA=e80cd68d2ac8bd39dddd52b604e63f3f747215a466728973581cf69ea20d0b83
sudo cmp "$P/window/re7-incident-6683-window.sudoers.proposed" "$S"
test "$(sha256sum "$H" | cut -d' ' -f1)" = "$EXPECTED_HELPER_SHA"
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = "$EXPECTED_POLICY_SHA"
sudo rm -- "$S"
sudo visudo -c
sudo rm -- "$H" "$Q"
```

Não apagar lock, fase, audit, backups, certificados ou provas como parte da revogação; preservar a trilha. Não remover o observador V4 já instalado, pois ele serve também ao retorno. O início da janela depende ainda de backup/restore e baseline **frescos**, root helper instalado e atestado, todos os gates privados verdadeiros e ausência de executor concorrente. A guarda permanece no estado atual até lá.


## Contratos de baseline após d717f113

[Correção auditada, preparação e instalação restrita](../REACTIVE_AFBB_BASELINE_CONTRACT_REVIEW_2026-10-06.md). Usar `prepare_baselines.py` em preparação nova e `baseline_contract.py` nos consumidores; não confundir initial operacional, baseline funcional e snapshot do sequenciador. Patch de quatro adaptadores com origens atestadas, manifests26; validação antes de CAS. Helper e nove chamadas sudo inalterados; revisão pendente, sem nova janela.
