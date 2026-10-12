# Proposta concreta de capacidade — somente para revisão

**CONSUMIDO EM12/10: retirada autorizada/executada exit0,post0; não repetir A/B/C.** [Resultado factual e staging](README.md). Conteúdo abaixo preservado como proposta histórica, não autorização de nova retirada.

Estado: READ-ONLY AUDIT COMPLETE / CUSTODY VERIFIED / WITHDRAWAL NOT AUTHORIZED OR EXECUTED.

Manter no host: /opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/content.private.tar.gz. Manter todas as releases ativas/referenciadas, retornos, diretórios, manifests, journals, capturas, WAL e evidências. As quatro retiradas antigas de outubro são consumidas e não fazem parte desta proposta.

Retirar, somente após autorização específica, os dois caminhos literais:

1. /opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/backup-bindings-pre-postack-20261008T215639Z/window/content.private.tar.gz
2. /opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-campaign-eligibility-ecosystem-20261008T211000Z/window/postack-backup-20261008T215639Z/backup/content.private.tar.gz

Cada arquivo: 479.460.086 bytes lógicos; 479.469.568 alocados, nlink1/inodes distintos. Recuperação projetada total958.939.136B. SHA comum4c2fb0caf834ce0c2c9e628c82bf80bba669effd68ea521245a936cfc34c6810. É o mesmo blob off-host da preservação canônica, rehashado agora; 784 membros/765 arquivos da extração reconferidos. Índice novo preserva os três caminhos/metadados/identidades. Uma localização off-host física não representa duas réplicas de desastre.

Leitura root executada pelo owner: duas observações completas/zero owners/zero incomplete.4174 arquivos de referência examinados em preparations, PM2 saved/fallback e libexec root; nenhuma referência explícita absoluta/relativa aos dois caminhos redundantes. Nove manifests/registros históricos citam o basename local e foram preservados no host e off-host; seus hashes são reconfirmados pelo driver. Esses controles consumidos não são retorno ativo e não serão executados. Manifests originais não são editados; eventual consulta/restauração histórica deve recuperar o blob idêntico pela main/índice off-host, não repetir a preparação consumida. Políticas ativas e históricas foram lidas e preservadas por hash. Não extrapolar essa cobertura para programas externos não examinados. Esta observação é preparatória: o driver obtém novas amostras na execução futura.

O driver deriva do procedimento canônico de retirada de10/10: allowlist dois caminhos, lock administrativo, guard38/hash/markers/identidades fixos, input/hash do reader/reference aprovado/políticas, amostras root completas e referencias reconfirmadas, rehash/stat individual antes de cada unlink, fsync do diretório, intent único. Timeout/parcial/incerto exige inspeção; nunca repetir B automaticamente. Não instala delegação ou altera serviços/DB/configuração. O driver novo é sintaticamente validado; execução destrutiva NOT EXERCISED. Não atribuir a ele a retirada anterior.

Com a amostra15:56:46UTC/12:56:46Fortaleza: mínimo deploy/PostgreSQL2.238.144.512B. Orçamento atualizado3.063.001.639B inclui o retorno API compatível adicional36.171.776B. Déficit atual824.857.127B; retirada projetaria3.197.083.648B livres, margem134.082.009B sobre orçamento. Não é CAPACITY PASS antecipado. Piso/atividade/WAL/frescor/referências precisam reconferência depois da liberação real. Se não for suficiente, propor expansão do filesystem em pelo menos1GiB efetivamente disponível, com operador/provedor, capacidade/backup e procedimento de expansão próprios; não executar infraestrutura nesta etapa.

## Bloco A — custódia off-host, leitura

```bash
set -euo pipefail
P=local-evidence/dynamic-integrated-20261012/continuation-cf55655b
test "$(sha256sum local-evidence/position6-storage-preservation-20261010/content.private.tar.gz | cut -d' ' -f1)" = 4c2fb0caf834ce0c2c9e628c82bf80bba669effd68ea521245a936cfc34c6810
test "$(sha256sum "$P/storage-paths.private.json" | cut -d' ' -f1)" = 39b5b962e0465e8d115a8b95e29b0e8bda6bd5356fcd9323fac923fad64e984f
test "$(sha256sum "$P/root-observation.private.json" | cut -d' ' -f1)" = b0af5d143cf00e2d5aa5704e7cf09d3249927d3a6e01690f1e2d6fdb47bcd4c2
```

## Bloco B — somente após autorização específica futura, sessão sudo do owner

Não executar nesta preparação. Não compartilhar senha ou JSON. BlocoC é separado e deve ocorrer mesmo em recusa/parcial/timeout deB.

```bash
set -euo pipefail
umask 077
P=/dev/shm/re7-integrated-storage-audit-20261012T153000Z
test "$(sha256sum "$P/withdraw-two-for-review.py" | cut -d' ' -f1)" = ba8f0bdc6e97e85632ff124ce430d6a72035f4ad32c620b22e329827f10dc379
test "$(sha256sum "$P/storage-root-readonly-v3.py" | cut -d' ' -f1)" = 2cd7f25e96e9a4fcd796a4f06dde59c288945c3eccb2345c34e35982ef6d0e49
test "$(sha256sum "$P/storage-paths.private.json" | cut -d' ' -f1)" = 39b5b962e0465e8d115a8b95e29b0e8bda6bd5356fcd9323fac923fad64e984f
test "$(sha256sum "$P/root-observation.private.json" | cut -d' ' -f1)" = b0af5d143cf00e2d5aa5704e7cf09d3249927d3a6e01690f1e2d6fdb47bcd4c2
test ! -e "$P/withdrawal-decision.private.json"
test ! -e "$P/withdrawal.stdout.private.log"
test ! -e "$P/withdrawal.stderr.private.log"
sudo -v
set +e
timeout 180 sudo -n /usr/bin/python3 -I -S "$P/withdraw-two-for-review.py" --future-owner-authorized-withdraw-two > "$P/withdrawal.stdout.private.log" 2> "$P/withdrawal.stderr.private.log"
WITHDRAWAL_EXIT=$?
set -e
printf '%s\n' "$WITHDRAWAL_EXIT" > "$P/withdrawal.exit.private.txt"
printf 'WITHDRAWAL_EXIT=%s\n' "$WITHDRAWAL_EXIT"
```

## Bloco C — leitura posterior obrigatória, sem nova retirada

```bash
set -euo pipefail
umask 077
P=/dev/shm/re7-integrated-storage-audit-20261012T153000Z
test "$(sha256sum "$P/storage-post-readonly.py" | cut -d' ' -f1)" = e9851a2660a0e4797625cfba57fb58bfba8857a40c11a1812583ad805f227a06
test ! -e "$P/post-observation.private.json"
test ! -e "$P/post-observation.private.stderr"
set +e
timeout 180 sudo -n /usr/bin/python3 -I -S "$P/storage-post-readonly.py" > "$P/post-observation.private.json" 2> "$P/post-observation.private.stderr"
POST_EXIT=$?
set -e
printf 'POST_EXIT=%s\n' "$POST_EXIT"
if sudo -n test -e "$P/withdrawal-decision.private.json"; then
  test ! -e "$P/withdrawal-decision.export.private.json"
  sudo -n cat "$P/withdrawal-decision.private.json" > "$P/withdrawal-decision.export.private.json"
fi
sudo -n df -B1 /opt/re7online /var/lib/re7 /var/lib/docker/volumes/postgres_wa_agent_pgdata/_data
sudo -n df -i /opt/re7online
test ! -e "$P/post-api-health.private.json"
curl --fail --max-time 5 --silent --show-error http://127.0.0.1:3001/health > "$P/post-api-health.private.json"
```

O observadorC relata cada caminho e detecta os inodes originais inclusive se o arquivo retirado continuar aberto; main exige hash original e guarda38/PIDs atuais. COMPLETE com remainingCopies não vazio não é retirada concluída. Copiar todos os diagnósticos/recibo off-host sem executarB novamente; reconfirmar PostgreSQL/WAL/espaço aos dois UIDs/sessões/job/seis resultados pelo capturador canônico READ ONLY e Inbox/CRM pelo owner. Nova captura não precisa reenviar/reconciliar. Política/helper/sudoers e nenhum serviço são alterados.

## Depois da capacidade realmente demonstrada

Só então executar staging integrado inativo e verificar pacote completo/retornos/deps/manifests. Gerar V4/controles frontend/políticas próprios com gatesfalse. Preparação API/frontend exige revisão futura; uma aprovação de retirada não autoriza instalação, deploy ou cancelamento. O histórico out.15 continua suspenso; nenhum envio/abertura/retomada decorre desta proposta.
