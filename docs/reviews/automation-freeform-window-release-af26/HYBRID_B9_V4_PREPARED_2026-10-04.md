# Retorno híbrido b9b58177 — preparação coordenada V4, 04/10/2026

**PREPARED FOR WINDOW / NOT DEPLOYED.** Esta preparação não fechou a guarda, conteve tráfego, iniciou candidatos ou alterou PM2, cron, boot, banco ou configuração de tenant. O frontend af26 segue no mesmo processo. Os quatro registros históricos permanecem sem reparo e não houve reenvio. A preparação privada nova é `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-20261004T194000Z`; as tentativas anteriores e seus marcadores foram preservados.

| Papel | Release isolada ou efetiva | Evidência |
| --- | --- | --- |
| API candidata | `b9b58177880e729854580def1180f3edb2fb83e8-api` | Cópia isolada da API 879; somente 13 fontes e 13 JS compilados alterados. Overlay SHA-256 `c8e0ef51e7fd71447bb3e7130e813e677b458f96f438fac69aa893bb55f963db`. Os 26 hashes individuais conferem com `window/release-manifest.private.json`. |
| Worker candidato | `worker-minimal-hybrid-b9b58177-20261004` | Cópia isolada do worker mínimo efetivo; [patch versionado](worker-hybrid-return-identity-20261004.patch) SHA-256 `99c29bc094ca2822b4c2cc3b5786700fa5aef60286dd4841e15cdf427ee91c49`, aplicado novamente à origem atestada: 8/8 hashes de fonte resultantes corretos. Na release, 8 fontes e 10 compilados conferem com o [manifesto](worker-hybrid-return-identity-20261004.manifest.json). Overlay SHA-256 `4ea5d04427088ba5176ab54330e937f519ea8dca97a28bb2f4cf2c040ff2ea2a`. Não foi reconstruído nem incluído o worker completo da árvore da API. |
| Retorno | API `879cb1faa88493cd78dd789b71f85043d6c8ff9c-api` e worker `worker-bf5f1d76-f06d49cb-91230f88-b66bb89a-af26-window` | São os processos produtivos atuais, não cópias de auth. O retorno conserva banco e auth atuais, sem restore produtivo. |
| Frontend | `af26f48a9c309b24ec4d23cfa97cc1e407c09d98-front` | Preservado no mesmo PID e start ticks; não há stop/start de frontend em nenhum modo. |

O manifesto privado do pacote tem SHA-256 `579b20b9602ff3f3533a7117ff56290c1a1185b5f48f363523962a28867b71e9`. Os três `scripts.sha256` conferem: ida `e86862e3abac5d18b42d707f29bf028aab5608092431788332a18c45332fb13d`, retorno completo `dbada0eebacd00ddc10f23f64b837301340637dac082c1e5b242e3092a5b8ea8`, retorno parcial `c8d2f1c48f339bc8f05e60972f7c66908e0ffd91b31ed1bd9265243ddde4e73e`. Não se copiaram provas, nonces, certificados, intents ou fase consumida. Os cinco gates privados estão **false**. A prova de preflight **não foi emitida antecipadamente**: o sequenciador somente a solicita após fechar a guarda por CAS e confirmar a geração nova.

Prisma schema SHA-256 `7fec399ffbbeb4f2d002d128481f96c1aaebb3efb9d0a76f2ba129939c5b54bd` e lockfile `f617d4f8c0f90bc8cb36dda100baec1e59ef1c9fc9a203c2e419e0b04725cdbb` são iguais em API/worker atuais e candidatos; Prisma Client/CLI é 6.19.2 em ambos, Node produtivo 20.20.0. No dump restaurado há 60 migrations concluídas, todas com checksum igual aos 60 arquivos da release, seis entradas históricas com rollback e nenhuma incompleta. Esta release não requer migration. O código funcional e os testes Node 20 já aprovados foram reutilizados; nenhum build funcional foi repetido nesta preparação.

## Backup, bindings e controles

Backup fresco capturado às 19:42:59 UTC, sem retenção destrutiva. `database.dump`: **25.819.560 bytes**, SHA-256 `a0cc49c04b5ab20b454d02e211575755703321ec1d16a5200cc3c919e1257299`; catálogo de **614 objetos**. Cópias privadas separadas de configuração/guarda/PM2/cron, `.data`/auth e conteúdo foram lidas de volta e hasheadas no manifesto privado. O dump foi restaurado sem erro em PostgreSQL 16 **local isolado**, sem aplicação, scheduler ou provider; conferidos catálogo, migrations e checksums, e removido o banco temporário. A cópia local do dump foi removida; o backup persistente permanece na preparação. A captura de filesystem vivo não é snapshot atômico de DB+auth e não certifica chamadas em voo.

PM2 real: API PID 2661766, worker PID 2661921, frontend PID 2537692; `watch=false`, zero reinícios observados. O classificador de configuração do pacote conferiu cwd, script, executável e variáveis de aplicação **no processo real** contra a configuração de origem, sem imprimir segredos. Todos os destinos e links `.data` de ida/retorno passaram. Saved/fallback são idênticos. O cron de backup e a saída literal, inclusive `\n`, de `systemctl show` coincidem com a captura; isso evita o `supervision_drift` que abortou a tentativa anterior. Guarda aberta, geração 23, sem tarefa no instante da captura; zero jobs/grupos/leases/agendamentos elegíveis, quatro WEB_SESSION conectadas e cinco registros de auth. Zero trabalho instantâneo **não prova drain**. Identidade e hash do docker-proxy continuam iguais aos bindings V4 observados; todo caminho será revalidado imediatamente antes da janela.

O helper root-owned instalado **permanece byte a byte igual**, SHA-256 `24bdba2bde2c6835f699bdc79b269e4a458a8013aa8a03a2a9a25627619b0198`, e as nove chamadas sudo literais não mudam. **Somente a política root-owned precisa ser substituída**: política preparada SHA-256 `0965ecd909727dee4c08cb4bd6fade54d2c11862d8b3c6e737ae3c8989c36f35`, com nova fase, processos e destinos de ida/retorno. A política anterior deve ser preservada. O sequenciador empacotado tem SHA-256 `54a5380ff340508e18d62cf3569619a7a715201b6b4ec983ff3e1ca5f39360c2`; sua captura privada de etapa/stdout/stderr/código de saída **não implementa recuperação automática** após retirada da contenção.

Antes da janela, Deifson executará apenas a substituição da política, após reconfirmar os processos e hashes. Este bloco **não** contém tráfego nem inicia processos:

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-hybrid-b9b58177-20261004T194000Z
Q=/usr/local/libexec/re7/incident-6683-window-policy.json
H=/usr/local/libexec/re7/incident-6683-window-control.py
S=/etc/sudoers.d/re7-incident-6683-window
OLD=/usr/local/libexec/re7/incident-6683-window-policy.pre-b9b58177.json
sudo test ! -e "$OLD" && sudo test ! -L "$OLD"
test "$(sha256sum "$H" | cut -d' ' -f1)" = 24bdba2bde2c6835f699bdc79b269e4a458a8013aa8a03a2a9a25627619b0198
sudo test "$(sudo sha256sum "$Q" | cut -d' ' -f1)" = 2afcf1d7b89790e92b07391767fb09228361f46357618242ebee78a0ee9090a0
test "$(sha256sum "$P/window/privileged-policy.private.json" | cut -d' ' -f1)" = 0965ecd909727dee4c08cb4bd6fade54d2c11862d8b3c6e737ae3c8989c36f35
sudo cmp "$P/window/re7-incident-6683-window.sudoers.proposed" "$S"
sudo install -o root -g root -m 0600 "$Q" "$OLD"
sudo install -o root -g root -m 0600 "$P/window/privileged-policy.private.json" "$Q"
sudo namei -l "$H" "$Q"
sudo visudo -c
sudo -n /usr/bin/python3 -I -S "$H" inspect
```

Se `inspect` não mostrar a política nova, fase nula e processos de origem vivos, **não** habilitar gates nem conter tráfego. PID/start ticks, proxy, configuração ou geração da guarda alterados exigem nova captura/binding antes da janela; não reutilizar a política de uma tentativa incompatível. A política antiga arquivada permanece disponível, mas qualquer reinstalação deve considerar a fase e o estado observados; não apagar fases, provas ou auditoria. Não há necessidade de ampliar sudoers.

## Sequência única e retorno

Após aprovação da janela, somente com backup ainda válido, operador único, `inspect`, ausência de tabela nft, campanhas/ledger classificados e cinco gates privados habilitados **após reconferência**, a execução é uma chamada: `python3 "$P/window/sequencer.py" "$P"`. O sequenciador executa, nesta ordem: baseline → fechar guarda por CAS e provar drain → preflight com prova nova → preparar crons e contenção root-owned → `stop-pair` uma vez → saída de API/worker antigos, descendentes, sockets, backends e locks → start da API b9 → prova V4 fresca da propriedade de DB → start do worker mínimo b9 → salvar PM2/fallback compatíveis → retirar nft → validar → reabrir guarda ao estado inicial → restaurar cron/boot. Scheduler não é alterado. Frontend conserva PID/ticks/BUILD_ID. Nenhum certificado equivale a ausência de chamadas inbound/outbound/auth em voo.

Antes da parada, erro restaura controles/guarda sem repetir proof ou start. Depois da parada, API candidata ausente ou falha antes do worker escolhe `return-partial`; par candidato iniciado escolhe `return`. Ambos exigem saída comprovada do proprietário corrente, zero backends/locks antes da API de retorno e nova prova V4 antes do worker de retorno. Retornam à API 879 e ao mesmo worker mínimo anterior com **DB/auth atuais**; nunca fazem restore produtivo, logout, limpeza de lock ou reenvio incerto. Sobrevivente, owner inesperado, start-intent ambíguo ou observador indisponível bloqueia sucessor. Falha depois da retirada de nft deve ser diagnosticada pelo registro privado da etapa; **não há rollback automático seguro nesse ponto**. Manter admissões fechadas se a validação não passar e aplicar procedimento de contingência segundo o estado real, sem repetir start.

O ensaio dirigido do sequenciador teve **6/6 PASS** para ordem/ida, retorno parcial/completo, falha de `unfence` e falha transitória/persistente de validação pós-contenção; mais **4/4 PASS** para identidade de filhos reais, cron em namespace isolado e cadeia helper real com `tasks: {}`. Os efeitos de nft/systemd da sequência foram simulados; não se atribui a eles validação da janela real. O primeiro comando de janela permanece bloqueado pelos gates falsos. Na janela anterior, a contenção durou 17 s e a guarda 88 s; estes são somente referenciais. **Estimativa de planejamento: 2–5 minutos de interrupção se todos os gates passarem**, com **15 minutos como ponto de escalonamento**, não como limite garantido; reservar margem adicional para retorno. Se o dono anterior ou o observador não puder ser comprovado, a espera não autoriza kill nem bypass. O alcance é API de todos os tenants, autenticação/Inbox/CRM/webhooks e worker WEB_SESSION durante a interrupção, mesmo com frontend preservado.

Após eventual troca: conferir PIDs/ticks, script/cwd/build, health/DB, sessões/auth, guarda/scheduler, PM2 saved/fallback, frontend preservado e Inbox/CRM autenticados. A continuidade híbrida e o retorno de campanha exigem casos naturais ou interação controlada autorizada, sem usar os quatro registros históricos como fixture. **Aceite funcional não decorre desta preparação.**
