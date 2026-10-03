# 6683 — executor sequencial e delegação restrita V4

**FOR INDEPENDENT REVIEW / NOT DEPLOYED.** Estas fontes não contêm ambiente, sessão, token, dump ou estado de cliente. A API funcional segue fixada em `879cb1fa`; frontend e worker mínimo af26 permanecem os mesmos. O pacote abortado `incident-6683-v4-20261003T150000Z`, suas provas e backups não devem ser modificados.

`sequencer.py` é o único entry point da tentativa nova. Ele captura PM2/identidades e guarda, recusa uma requisição de preflight preexistente, fecha a guarda via `close.cjs`, confirma `generation = baseline + 1` e **só então** chama `delegated.py request/record/execute preflight`. Cada ação posterior usa o protocolo V4 existente, prova nft fresca e pós-condição; não repete start-intent. Um journal append-only e um lock comum entre preparações registram a sequência. Drift de geração/configuração nega imediatamente. Com a contenção intacta, a recuperação usa `return-partial` ou `return` conforme marcadores **e** processos reais; start incerto sem marcador bloqueia escolha automática. Antes da parada, restaura controles e guarda por CAS. Depois de retirar a contenção, falha de controles não causa parada automática de uma API que já serve tráfego.

`privileged.py` é proposto para instalação root-owned em `/usr/local/libexec/re7/incident-6683-window-control.py`, com política root-owned separada em `/usr/local/libexec/re7/incident-6683-window-policy.json`. Aceita apenas os nove argumentos literais gerados por `render_sudoers.py`, executado por `/usr/bin/python3 -I -S`. Não executa código da preparação gravável por `deploy`: regra nft, cron inicial/de janela, processos esperados e hashes dos scripts vêm da política copiada e conferida **antes** de habilitar sudoers. `inspect` verifica processo original, boot/cron, tabela ausente e sintaxe nft sem mutação. Ações root são serializadas por lock, auditadas em arquivo root-owned e protegidas por fase root-owned. `authorize-switch`/`authorize-return` conferem frontend preservado, saída do par antigo, único par sucessor filho do PM2, cwd/script/hash e PM2 saved/fallback iguais antes de permitir `unfence`.

## Evidências locais desta revisão

```bash
cd docs/reviews/automation-freeform-window-release-af26/v4-sequencer
python3 -m unittest -v test_sequencer.py test_privileged.py
```

**14/14 PASS**: driver controlado para ida/retorno, falha antes e depois do start, prova antecipada negada, drift e prova vencida recuperados sem repetir start, frontend preservado, falha privilegiada parcial, cron/boot/nft injetados, política/hash, e filhos **reais** de um processo local para identidade e saved/fallback. O teste V4 existente `test-api-only-6683.py` foi reexecutado sobre cópia isolada das quatro fontes operacionais intactas: **5/5 PASS**, incluindo nonce novo após 300 s e recusa de identidade alterada. Esses grupos não equivalem a uma execução nft/systemd real. O namespace Linux local permite criar rede separada, mas `nft` retornou `Operation not permitted` no Netlink; a sintaxe real será checada pelo `inspect` instalado antes da janela. Builds funcionais não foram repetidos.

## Preparação nova e instalação proposta a Deifson

Criar diretório privado **novo** sob `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-*`, a partir das fontes estáticas íntegras, sem copiar `owner-request`, `owner-proof`, `*.consumed`, intents, certificados ou gates da tentativa abortada. Recriar configurações, bindings, baseline, backup/restore isolado e manifests. Copiar estas fontes versionadas para a preparação nova e incluir seus hashes nos manifests. `prepare_policy.py "$P"` gera `window/privileged-policy.private.json` e seu SHA no novo pacote; `render_sudoers.py "$P/window/re7-incident-6683-window.sudoers.proposed"` gera exatamente nove linhas. Os destinos de instalação e fase estavam ausentes na leitura de 03/10, mas devem ser reconferidos imediatamente antes da instalação. Se a API/worker/frontend ou daemon PM2 mudar de PID + start ticks entre geração da política e `inspect`, **não** adaptar na janela; preparar política nova antes de conter tráfego.

Depois da revisão independente, a **aprovação específica de Deifson para esta delegação adicional** deve cobrir os comandos seguintes. Eles instalam somente dois arquivos root-owned e a regra sudo literal; não param serviço nem aplicam nft. Substituir `P` pelo caminho completo da preparação nova revisada. Conferir os hashes esperados do [manifesto](manifest.json) e do arquivo privado `privileged-policy.sha256` antes e depois de `install`; não seguir se qualquer destino existir ou for symlink.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-NOVA-PREPARACAO
H=/usr/local/libexec/re7/incident-6683-window-control.py
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
S=/etc/sudoers.d/re7-incident-6683-window
EXPECTED_HELPER_SHA=7ff947e36742a0b6611c01c81bc39ee682e1db7db3f1147893be2ea1f5be51b5
EXPECTED_SUDOERS_SHA=62b5a2ac1d56b013f6db4bb8180b0637b985786214f4bc3ce0e5f8d3f7c5111a
test ! -e "$H" && test ! -L "$H"
test ! -e "$Q" && test ! -L "$Q"
sudo test ! -e "$S" && sudo test ! -L "$S"
sudo test ! -e /var/lib/re7/incident-6683-v4-phase.json
sudo test ! -L /var/lib/re7/incident-6683-v4-phase.json
test "$(sha256sum "$P/window/privileged.py" | cut -d' ' -f1)" = "$EXPECTED_HELPER_SHA"
test "$(sha256sum "$P/window/re7-incident-6683-window.sudoers.proposed" | cut -d' ' -f1)" = "$EXPECTED_SUDOERS_SHA"
sudo install -o root -g root -m 0644 "$P/window/privileged.py" "$H"
sudo install -o root -g root -m 0600 "$P/window/privileged-policy.private.json" "$Q"
sudo namei -l "$H" "$Q"
test "$(sha256sum "$H" | cut -d' ' -f1)" = "$EXPECTED_HELPER_SHA"
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = "$(cat "$P/window/privileged-policy.sha256")"
sudo visudo -cf "$P/window/re7-incident-6683-window.sudoers.proposed"
sudo install -o root -g root -m 0440 "$P/window/re7-incident-6683-window.sudoers.proposed" "$S"
sudo cmp "$P/window/re7-incident-6683-window.sudoers.proposed" "$S"
sudo test "$(sudo sha256sum "$S" | cut -d' ' -f1)" = "$EXPECTED_SUDOERS_SHA"
sudo visudo -c
sudo -n /usr/bin/python3 -I -S "$H" inspect
```

Antes do `install`, confrontar os SHA dos arquivos de origem com o manifesto versionado; depois, confrontar o helper instalado com o **mesmo hash fixado** no manifesto e o policy hash privado. A regra sudo não contém wildcard, shell, `SETENV` ou execução de arquivo gravável por `deploy`. A última linha é leitura; confirma que a regra e a política funcionam sem pedir senha durante a janela. O audit root-owned fica em `/var/log/re7-incident-6683-window.log`; fase/lock root-owned ficam em `/var/lib/re7/incident-6683-v4-*`.

Impacto da instalação: capacidade estreita para `deploy` aplicar/remover **somente** a tabela `inet re7_campaign_transition`, alternar **somente** o cron `re7-converta-backup` entre bytes fixados, e desabilitar/habilitar **somente** `pm2-deploy.service`. Há risco operacional se essa capacidade for invocada fora do coordenador; lock, política root-owned, fases e verificação de processos reduzem o risco, mas não substituem a execução única e a supervisão do owner. A instalação não é autorizada por este documento.

Após a janela e após comprovar que nenhum retorno depende do helper, Deifson pode revogar somente estes objetos, comparando hashes e conteúdo com os instalados:

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-NOVA-PREPARACAO
H=/usr/local/libexec/re7/incident-6683-window-control.py
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
S=/etc/sudoers.d/re7-incident-6683-window
sudo cmp "$P/window/re7-incident-6683-window.sudoers.proposed" "$S"
test "$(sha256sum "$H" | cut -d' ' -f1)" = "$(sha256sum "$P/window/privileged.py" | cut -d' ' -f1)"
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = "$(cat "$P/window/privileged-policy.sha256")"
sudo rm -- "$S"
sudo visudo -c
sudo rm -- "$H" "$Q"
```

Não apagar lock, fase, audit, backups, certificados ou provas como parte da revogação; preservar a trilha. Não remover o observador V4 já instalado, pois ele serve também ao retorno. O início da janela depende ainda de backup/restore e baseline **frescos**, root helper instalado e atestado, todos os gates privados verdadeiros e ausência de executor concorrente. A guarda permanece no estado atual até lá.
