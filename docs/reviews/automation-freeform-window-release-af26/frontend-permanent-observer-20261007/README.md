# Recuperação permanente automática: proposta restrita, não instalada

Resultado canônico: [relatório único](../FRONTEND_FA60F0F6_PREPARED_2026-10-07.md#supervisão-permanente-após-reboot--proposta-isolada).

A janela continua usando política de boot/PID/ticks fixos e os três gates existentes. A recuperação permanente usa **outro leitor**, com política root estática de artefatos e implementação PM2. Nunca altera a política de janela, marker, control, journal, saved ou fallback. A política permanente não contém PID/ticks/boot/nonces/capturas históricos. A cada chamada obtém boot e daemon atuais; valida pidfile fixo, UID, executável Node por path/hash, cmdline integral esperada PM2 6.0.14, PID/ticks vivos e estáveis antes/depois. Pidfile sozinho não é prova; launcher deve ser filho direto do daemon observado nas duas amostras. Nenhum comando PM2/systemd/nft é executado como root.

Antes de qualquer novo Next, exige inventário root completo em duas amostras consistentes, sem listener e sem outro executor nas releases/entries aprovadas. Stdin Unix compartilhado permite apenas daemonfd0 e launcher/checker atuaisfd0, com identidades exatas; proprietário adicional nega. Outro daemon com o mesmo título/PM2 home observado também nega; essa correspondência só gera negativa, nunca autorização. Continua usando inventário/ledger do mesmo boot para ausência de encarnações anteriores. Depois de boot distinto, esses PIDs/grupos/inodes são ignorados **somente após a prova atual**, nunca usados como autorização ou ausência. Role por nonce não limita esta leitura: releases/entries fixas detectam encarnações com nonce novo.

Leituras não são atômicas com fork: permanece contrato operacional PM2 single instance/execução exclusiva, assim como antes. Não se promete resistência a um operador malicioso do mesmo UID que possa falsificar título/pidfile e iniciar processos fora do protocolo. Nenhum novo cliente é aceito pela mera contagem/UID/nome. Churn relevante/incompletude nega; até3 tentativas de leituras novas e timeout do launcher10s. Falha de privilégio/integridade/identidade ou sobrevivente nega78 sem repetir partidas. A recuperação **legítima** pós-reboot é automática; condição negativa persistente exige diagnóstico humano, não bypass.

Delegação proposta adicional e única:

```sudoers
deploy ALL=(root) NOPASSWD: /usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-permanent-observer.py
```

Sem argumentos, wildcard, shell, leitura arbitrária indicada por deploy, root de código modificável por deploy ou capacidades DB/backend. Helper, política e sudoers novos root:root0644/0600/0440. Usa o reader root existente somente após validar cadeia e hash; imports padrão em -I -S, sem cwd/PYTHONPATH do pacote. Saída tem identidades/roles/owners, não ambientes, credenciais ou configurações. Diagnósticos stdout/stderr/exit/timeout ficam privados600. Helper e sudoers de janela permanecem intactos.

`prepare-policy.py` gera bytes privados e binding local da proposta, a partir das extrações íntegras **já existentes**. `install-proposed.sh` contém hashes completos e destinos literais, deriva somente o diretório de onde os arquivos revisados serão copiados. É **proposta não executada**, depende de autorização específica de delegação/instalação. Verifica ausência dos três destinos e do arquivo proibido de captura; destino existente nega, não sobrescreve. Valida visudo antes/depois, hash, cadeia e modo; não instala o checker nem inicia processos. Se parcial, preservar e reportar quais arquivos existem antes de recuperação. Não instalar simultaneamente com janela.

Nova política/hash24a78e7e independe de reboot. Troca futura do binário Node/PM2/release exige revisão da allowlist, não ampliação silenciosa. Preparação anterior43ff não deve ser executada: sua supervisão dependia de rebinding manual. Nova composição integrada/política de janela final ainda deverá ser preparada e revisada após eventual autorização desta delegação. Staging9f permanece intocado.

Reprodução (Linux namespace sem rede externa, extrações e Node/PM2 preservados):

```bash
python3 assemble-checker.py /tmp/re7-permanent-review
RECOVERY_LABEL=candidate unshare -Urnpf --mount-proc sh -c 'ip link set lo up; exec python3 namespace-init.py python3 test_recovery.py /tmp/re7-permanent-review/frontend-check.py /tmp/re7-permanent-review/socket_observation_client.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2 /tmp/re7-front-fa60-css-corrected-clean-20261007 /tmp/re7-front-layout-audit-20261007/9f'
RECOVERY_LABEL=return unshare -Urnpf --mount-proc sh -c 'ip link set lo up; exec python3 namespace-init.py python3 test_recovery.py /tmp/re7-permanent-review/frontend-check.py /tmp/re7-permanent-review/socket_observation_client.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2 /tmp/re7-front-fa60-css-corrected-clean-20261007 /tmp/re7-front-layout-audit-20261007/9f'
```

PM2/Node/Next, PID/ticks, sockets, morte do Next, daemon kill/resurrect e sobreviventes são reais. Reboot é mudança **injetada** do boot histórico; Linux do laboratório não rebootado. Negação local de environ e privilégio são injeções declaradas. Root helper/reader/classificador/client executam código efetivo; instalação/sudo são fixture do laboratório. API/worker são timers sintéticos, nenhum provider/DB/auth produtivo. PID1 do namespace reaproveita comportamento de init: só reap mortos, não mata/ignora sobreviventes. Duas primeiras execuções sem reaper negaram por PID órfão ainda presente; preservadas, não PASS. Terceira expôs fixture lendo daemon antigo; corrigida apenas no harness, preservada. Nenhuma exceção criada no checker para zumbi/sobrevivente.

Os resultados de candidato e retorno não devem ser somados como casos distintos. Tar corrigido17bd/build/Chrome/CSS/smokes são reutilizados, sem rebuild ou testes funcionais. Estes ensaios verificam recuperação operacional. VPS reboot e instalação literal ainda não exercitados.

Remoção proposta **somente após autorização e demonstração de que nenhum active/saved/fallback/retorno depende da nova chamada**: conferir hashes instalados contra manifesto; arquivar helper/política/regra antes, remover somente `/etc/sudoers.d/re7-frontend-permanent-observer`, executar `visudo -c`, depois remover somente `/usr/local/libexec/re7/frontend-permanent-observer.py` e `/usr/local/libexec/re7/frontend-permanent-observer-policy.json`. Não remover observador de janela, staging, controles ou journals. Não foi executada instalação/remoção nesta rodada.
