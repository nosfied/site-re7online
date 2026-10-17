# Próxima conferência — comandos para revisão, NÃO EXECUTADOS

CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY. Esta publicação não autoriza os
blocos abaixo. Nenhum comando de instalação, emissão, admissão ou janela é incluído.
As únicas escritas previstas são novas evidências privadas; não mudam configuração.
Executar uma leitura uma vez. Falha, timeout, destino existente, tipo/permissão
inadequados ou saída incompleta: parar, preservar stdout/stderr, não repetir.
Não interpretar uma saída parcial como captura completa.

## R1 — fonte root e controles, sem chamar helper

**Revisável e concreto para coleta bruta**, na futura sessão deploy/owner sudo.
Não é o certificado CSV_ROOT_SOURCE_PASS; não executa código da preparação.
O diretório abaixo é exclusivo desta proposta, não uma nova geração operacional.
Se já existir, escolher e revisar outra referência antes de executar; não sobrescrever.
`sudo -v` só autentica a sessão legítima. Não instala delegação. Não publicar os
arquivos capturados: política e crons são privados. `cat` não segue deliberadamente
alvos arbitrários: os arquivos obrigatórios são primeiro recusados se symlink.
As leituras não são atômicas; alterações entre metadados/hash/cópia exigem nova
avaliação, nunca aprovação por estes comandos isolados.

```bash
(
set -euo pipefail
umask 077
Q=/dev/shm/re7-csv-input-review-20261016-r1
test ! -e "$Q" && test ! -L "$Q"
mkdir -m 700 "$Q"
test "$(stat -c %u "$Q")" = "$(id -u)"
test "$(stat -c %a "$Q")" = 700
date -u +%Y-%m-%dT%H:%M:%SZ > "$Q/started.private.txt"
sudo -v
for F in /usr/local/libexec/re7/incident-6683-window-control.py /usr/local/libexec/re7/incident-6683-window-policy.json /etc/sudoers.d/re7-incident-6683-window /etc/cron.d/re7-converta-backup; do
 N=${F##*/}
 sudo -n test -f "$F"
 sudo -n test ! -L "$F"
 timeout 10 sudo -n /usr/bin/namei -l "$F" > "$Q/$N.chain.private.txt" 2> "$Q/$N.chain.stderr.private"
 timeout 10 sudo -n /usr/bin/stat -c '%n %F %u %g %a %d %i %s %y %z' "$F" > "$Q/$N.stat.private.txt" 2> "$Q/$N.stat.stderr.private"
 timeout 10 sudo -n /usr/bin/sha256sum "$F" > "$Q/$N.hash-before.private.txt" 2> "$Q/$N.hash-before.stderr.private"
 timeout 10 sudo -n /usr/bin/cat "$F" > "$Q/$N.bytes.private" 2> "$Q/$N.bytes.stderr.private"
 timeout 10 sudo -n /usr/bin/sha256sum "$F" > "$Q/$N.hash-after.private.txt" 2> "$Q/$N.hash-after.stderr.private"
 cmp "$Q/$N.hash-before.private.txt" "$Q/$N.hash-after.private.txt"
done
timeout 10 crontab -l > "$Q/deploy.crontab.private.txt" 2> "$Q/deploy.crontab.stderr.private"
timeout 10 systemctl show pm2-deploy.service --property=ActiveState,UnitFileState > "$Q/supervision.private.txt" 2> "$Q/supervision.stderr.private"
date -u +%Y-%m-%dT%H:%M:%SZ > "$Q/finished.private.txt"
printf 'RAW_ROOT_AND_TWO_CRON_READS_COMPLETE_NOT_CERTIFIED\n'
)
```

Apuração local posterior obrigatória: hash dos bytes copiados igual aos dois hashes,
tipo/owner/mode/cadeias, comparação com a fonte efetivamente aprovada e com os seis
comandos/horários originais. Distinguir último histórico e2a5ffab… da observação nova.
Não trocar o pin fa113e… para obter PASS. Se root divergir, documentar/revisar o delta
futuro. As bibliotecas futuras ainda não podem ser presumidas instaladas.

## R2 — descoberta delimitada de identidades/caminhos, sem PM2 CLI

**Revisável e concreto para descoberta**, como deploy. Não usa `pm2 jlist`, `pm2
prettylist`, `resurrect` ou `save`: um cliente PM2 pode iniciar daemon se ausente.
Não usa `ps e`, cmdline completa, environment nem dumps na saída pública.
`ss` sem root pode omitir donos: isso é lacuna explícita, não prova de ausência.

```bash
(
set -euo pipefail
umask 077
Q=/dev/shm/re7-csv-input-review-20261016-r2
test ! -e "$Q" && test ! -L "$Q"
mkdir -m 700 "$Q"
test "$(stat -c %u "$Q")" = "$(id -u)"
test "$(stat -c %a "$Q")" = 700
date -u +%Y-%m-%dT%H:%M:%SZ > "$Q/started.private.txt"
cat /proc/sys/kernel/random/boot_id > "$Q/boot.private.txt"
timeout 10 ps -eo pid,ppid,uid,lstart,comm > "$Q/processes.private.txt" 2> "$Q/processes.stderr.private"
timeout 10 ss -ltnp > "$Q/listeners.private.txt" 2> "$Q/listeners.stderr.private"
for F in /home/deploy/.pm2/pm2.pid /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak; do
 test -f "$F" && test ! -L "$F"
 N=${F##*/}
 stat -c '%n %F %u %g %a %d %i %s %y %z' "$F" > "$Q/$N.stat.private.txt"
 sha256sum "$F" > "$Q/$N.hash.private.txt"
done
F=/opt/re7online/site-re7online/apps/whatsapp-agent/src/events/eventRetentionPolicy.ts
timeout 10 namei -l "$F" > "$Q/event-chain.private.txt" 2> "$Q/event-chain.stderr.private"
timeout 10 stat -c '%n %F %u %g %a %d %i %s %y %z' "$F" > "$Q/event.stat.private.txt" 2> "$Q/event.stat.stderr.private"
timeout 10 sha256sum "$F" > "$Q/event.hash.private.txt" 2> "$Q/event.hash.stderr.private"
command -v node > "$Q/node-path.private.txt"
command -v pm2 > "$Q/pm2-path.private.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "$Q/finished.private.txt"
printf 'DISCOVERY_READS_COMPLETE_NOT_PROFILE_OR_OWNERSHIP_CERTIFICATE\n'
)
```

Limite: não certifica PID→app/env, árvore/FD/SQL/proxy, saved conteúdo nem ausência
de importações. Precisam de leitura privada dirigida posterior, usando PIDs/ticks
atuais e o exportador legítimo conferido. O PID histórico936386/936540/188897 não é
entrada atual. Antes de oferecer o comando final faltam: identificação atual exata
do trio via daemon existente e protocolo seguro de consulta sem auto-spawn; hash e
argv do exportador de perfis efetivamente disponível; versão/credencial/canal SQL
atual; raízes literais dos alvos reutilizáveis. Não executar arquivo histórico para
preencher isso. A ausência de Event775 não é demonstrada por namei isolado: o
predicado canônico lê **todos** os pais e revalida no uso; se houver775, negar ida,
sem chmod e sem bloquear indevidamente ORIGINAL.

## R3 — SQL/importações e ownership: NÃO PRONTO para execução

Fonte exata: `crm-csv-operational-20261016/capture_imports.py`, `SQL` e `classify`;
consumer atual no kit via SOURCE_INDEX. SELECT delimitado100001, máximo aceito100000,
BEGIN READ ONLY, statement_timeout15000, ROLLBACK. Sua captura pós-saída não é leitor
livre: `capture()` exige Sequencer.verify_stopped, certificado, check-present e
**grava** csv-imports-*-after-exit. Não invocar `capture()` agora.

Para concretizar o comando falta confirmar por R2 o container, DB/role e canal que
correspondem ao runtime atual (os literais históricos wa-agent-postgres/wa_agent/
whatsapp_agent não são nova observação), além da fonte privada atual do escopo de
atividade conhecida. Quando conferidos, revisar argv SQL apenas de leitura e sua
saída privada; não usar Prisma retention:run nem --dry-run. Uma leitura prévia de
Event não produz certificado de saída. SQL/proxy/FD precisam da mesma identidade
conferida; consumidor não coberto ou UNKNOWN/PROCESSING impede prosseguimento.

## R4 — toolchain e 16 vínculos: PARCIAL, não certificado

R2 fornece caminhos anunciados pelo shell, não o executável realmente consumido.
Após identificar o PID Node/PM2, a próxima leitura deve usar literalmente
`/proc/<PID>/exe`, cwd e stat/ticks, confirmar cada salto de symlink e ler/hash dos
arquivos resolvidos. O comando final não é publicado como pronto com `<PID>`:
faltam PIDs/ticks, caminhos reais de PM2/Node/parser e closure transitiva exata.
Não executar PM2 --version para tentar atestar toolchain e não `require()` CJS para
inspecioná-lo. Integridade exige launcher, interpreter, pacote PM2, dependências,
parser, alias /proc/self/fd e bibliotecas protegidas com UID/modos/cadeias.
A prova B4 completa local permanece reutilizável; não demonstra esses metadados
na VPS. A proposta de INSTALL_PLAN antiga é fonte de alvos fixos, não seus hashes
finais atuais: consultar COMPOSITION atual antes de revisão de instalador.

Os16 vínculos são derivados offline das mesmas leituras, não16 chamadas remotas.
Falta o namespace futuro aprovado; nenhum caminho deve ser preenchido para PASS.

## Diagnóstico/custódia — reutilização canônica, etapa LOCAL separada

Os blocos R1/R2 preservam saídas e erros em arquivos600 dentro de diretório700;
não reivindicam journal canônico nem atestado de autoridade. Uma falha mantém os
arquivos já escritos e não chega ao resumo COMPLETE. Antes de uso, os utilitários
absolutos também devem estar disponíveis; ausência nega, sem instalação automática.
Transferência privada/custódia requer destino owner700 e recibo byte-exato; nenhum
scp para produção ou backup é proposto aqui.

A função existente `v4-sequencer/privileged_output.py::private_record` é o escritor
canônico. `run_privileged` aceita somente argv/action literais do helper/observer;
**não aceita** stat/cat e não será alargado para estas leituras. Após transferência
privada, seus bytes brutos podem ser anexados pelo `private_record` à custódia local
com hashes/tamanhos e stdout/stderr codificados, sem import de preparação consumida.
O comando final de ingestão fica NÃO PRONTO: faltam o destino privado novo efetivo,
recibo de transferência e correspondência entre os arquivos coletados. Não fingir
que arquivos brutos já são privileged-output.private.jsonl. Nenhum diagnóstico
paralelo ou novo escritor foi implementado nesta rodada. B1 continua sendo o
transporte obrigatório da **futura consulta autenticada**, após instalação revisada.

## Comandos deliberadamente excluídos

- Helper `inspect`: exige phase_read() inexistente; fase consumida não serve como
  alvo de inspeção nova. Não oferece certificado de recuperação ou permit.
- `enter`, `abort-prestop`, `restore-controls`, `authorize-*`, `unfence`, `recover`,
  install_static, Store.install_owner_once/issue_owner_once: alteram controles,
  autoridade ou processos; não são leituras.
- check_current: predicados atuais, mas depende do pacote completo/autenticado,
  chama Bridge/filhos/PM2 e diagnóstico privado. Não entrypoint de descoberta antes
  do binding; não executar check_current.py isolado para importar ops por acaso.
- root_readonly.py do kit: somente leitura, mas fonte fa113e… histórica fixada;
  não usar contra a política consumida e2a5ffab… para testar por tentativa.
- Capturadores/preparadores de R0, retenção/inventário com gravação, atualização de
  proofs e inspect de geração consumida: não reutilizar como coletores neutros.

Separação obrigatória: **R1/R2/R3/R4 leitura revisada → conferência/derivação local →
revisão dos bytes → eventual instalação estática → instalação de âncora → decisão
específica/emissão única de recuperação quando aplicável → janela**. Nada nesta
entrega autoriza as etapas posteriores. Backup/RPO/root curto só na sequência
coordenada, com necessidade e prazo explícitos; nenhuma renovação feita agora.
