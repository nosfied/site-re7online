# Frontend fa60f0f6 — preparação exclusiva, 07/10/2026

**PREPARED FOR WINDOW / NOT DEPLOYED.** Pacote e staging conferidos; gatefalse. Não houve stop/start produtivo, save/resurrect, alteração de guarda/scheduler/cron/boot, DB/auth/tenant/agendamentos ou contato4366. Nenhum envio/provider produtivo. API e worker continuam afbb; frontend produtivo continua9f. Preparação não constitui autorização de executar a troca nem aceite funcional.

## Procedimento e escopo auditados

Reutilizados runbook, topologia, contrato de build e [procedimento frontend validado](FRONTEND_9F4CBE0F_PREPARED_2026-10-06.md), incluindo as correções de partida única, saída antes da captura, prontidão limitada e supervisão permanente. Nenhuma cadeia V4 de API/worker, guarda, nft ou controle root foi importada.

Fontes fixadas em `fa60f0f6443f3e0a129dc707021cffdc408af817`. Contra frontend9f, delta executável somente: page.tsx, appClientApi.ts (AbortSignal opcional no GET existente), campaignComposerLifecycle.ts, campaignPresentation.ts e campaignRelationReads.ts. API/worker/schema/dependências/lockfile/Next config/public não alterados. [Contrato e provas funcionais](CAMPAIGN_SCHEDULE_AND_GROUPS_LOCAL_2026-10-07.md) preservados.

Scripts novos em [frontend-fa60f0f6-prepared](frontend-fa60f0f6-prepared/). Comparados com os sete bytes de8da/f90: launcher, bootstrap e dois ensaios idênticos; frontend-check muda apenas P/TARGET; frontend-action apenas P; verify-package apenas SHA candidato. Não há alteração de lógica de supervisão, exceções, timeout ou ausência. [scripts.sha256](frontend-fa60f0f6-prepared/scripts.sha256) fixa cada arquivo; [proveniência sanitizada](frontend-fa60f0f6-prepared/artifact-provenance.json) fixa artefato e fontes. Manifesto de scripts SHA256 `ca4a3c984236c6e7751f97e40925e1bb8a144f1f31d745931a737b096d1f71f7`.

## Artefato exato

Build novo necessário: o build local anterior era Node22 e sintético. Git archive do SHA fixo, node_modules autocontido preservado e lockfile idêntico ao produtivo. Build isolado Node20.20.0/Next16.1.5 webpack, ambiente allowlisted conforme contrato; parâmetros públicos declarados na VPS comparados aos preservados em9f e iguais. Sem env/backend/providers. Base browser ausente continua `/agent-api`; rewrite public-api continua localhost3001. Nenhum npm install/update incidental.

| Artefato | Identidade completa |
| --- | --- |
| Tar final frontend-fa60f0f6.tar.gz | `9b375dffca78425e7193e2e73b3c3692a951dc9f638c1c73790cfd3c5e32dac2`,174.112.557bytes |
| Manifesto interno | `35f28f07cc82496b778956b1f53cbd1f5bb1e0d02b948430530fe36ded55d0b9` |
| BUILD_ID | `HttJ8PoISXKUzSzoDZ7_E` |
| Arquivos/links |22.869arquivos,31symlinks internos, conteúdo/modo/inventário exaustivo |
| Lockfile | `add66bbb579b4c2424746ccd26b7a41ec24faecf77d324447b9f8b463c73726a` |
| Config candidata privada | `6786c96757736598affa13410312bc83fb830460dc28c407cb7b0e739f6d07ed` |
| Config retorno privada | `9f3c53be22bcec9a51c8452d0aa84eaf033a7bc6b8bbff53b5cfef3f4423da27` |
| Retorno9f/BUILD_ID | `9f4cbe0f9a4e891f09bb2f41e88eccec388172da` / `LFcdEK9gXZsBhf4_c5r8G` |
| Manifesto interno9f | `ba6b43c2c550c5926893e12b5620b59d144e0cd91890b978171656b284422eba` |
| Inventário privado do retorno nesta preparação | `065c30967260cd83ff98fc31bf2a5e6031c185547d1ca558dd4a6cb17890c942` (mesmos itens, serialização própria) |

Tar inclui .next sem cache de build, public, node_modules completo, Next config/package/lock/tsconfig/next-env. Sem src de desenvolvimento, arquivos env ou configuração PM2. Preservados158assets estáticos de9f/gerações anteriores, com colisão aceita apenas se conteúdo igual. Extração limpa fora da árvore de desenvolvimento, antes do start: manifesto estrito PASS. O tar enviado à VPS é exatamente esse tar, hash conferido antes de extrair e manifesto completo depois. Não reconstruir durante envio.

## Provas executadas e reutilizadas

| Prova | Resultado/escopo |
| --- | --- |
| Build e execução limpa Node20.20.0 | PASS, ready564ms local; não previsão de prazo produtivo. Etapa TypeScript do build passou; não afirma tipagem de API/worker ou equivalência a outra suíte completa |
| Imports da aplicação |1.120resoluções observadas em runtime, zero fora do pacote; hook de instrumentação externo somente para observar o loader. Isso cobre caminhos executados, não todos os caminhos arbitrários futuros |
| Horários e conjuntos sobre tar exato |13/13PASS, Chrome real e driverNode20, APIs/auth simuladas;12:40Fortaleza→15:40Z nos payloads, polling/reset/seleção, controlador1/vários filhos e nomes iguais |
| Leituras limitadas sobre tar exato |7/7PASS, Chrome real:33iniciais/máximo2; zero novas em3ticks, +1retry e +1snapshot; sessão nova33/máximo2. Nenhum backend/provider iniciado |
| Composição operacional dos pacotes exatos | PASS, Node20.20.0/PM2 6.0.14 reais em PM2_HOME isolado: ida, prontidão, saída, retorno9f, negativas de intent repetido e CLI falhando, stdout/stderr/exit preservados. API/worker são stand-ins Node sem DB/provider |
| Supervisão permanente/slow startup/saída precoce/descendente | Provas anteriores reutilizadas, mesmos bytes/lógica. Não atribuídas como nova execução nem como reboot produtivo |
| Staging produtivo somente leitura | PASS:7scripts, tar, manifesto completo, config, before, ausência de intents/controls futuros; gatefalse. Captura de leitura arquivada, não será consumida pela janela |

No primeiro ensaio operacional, o servidor standalone do smoke ainda executava a mesma release: `executor_survived` negou corretamente o retorno. Evidência preservada; encerrado somente o servidor local de smoke, repetido o ensaio em laboratório/tentativa novos e gate passou, sem mudança de critério. O harness herdado usa texto genérico “af26 return”; os argumentos, config/entry e BUILD_ID desta execução comprovam retorno9f, não af26. Logs/provas detalhadas privados, foraGit.

Reprodução dos smokes: executar Node20.20.0 no Next do tar extraído limpo, porta local3083 e env público allowlisted; rodar `/tmp/re7-pm2-lab/node tests/browser/campaignScheduleAndGroups.mjs http://127.0.0.1:3083` e `/tmp/re7-pm2-lab/node tests/browser/campaignRelationReads.mjs http://127.0.0.1:3083`. Ambos interceptam APIs e negam acessos externos. A instrumentação verifica que a aplicação resolve módulos somente na extração; dependências do driver/browser não integram a aplicação. Encerrar esse servidor isolado antes do ensaio PM2 dos mesmos diretórios.

## Staging, retorno e estado produtivo

Preparação nova:
`/opt/re7online/backups/converta-persistent/preparations/frontend-fa60f0f6-20261007T171104Z`.
Candidato isolado:
`/opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front`.
Retorno preservado:
`/opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front`.

| Processo | Identidade reconfirmada por leitura |
| --- | --- |
| Frontend9f | launcher3345522/start ticks2116147846; filhoNext3345533/ticks2116147879; online/restart0 |
| API afbb7455 |3153929/ticks2107666112; online/restart0 |
| Worker mínimo reativo afbb |3154150/ticks2107666513; online/restart0 |
| DaemonPM2 |18676/ticks222727; mesma identidade |

Retorno9f: todos os arquivos/links/modos inventariados verificados na VPS, sem modificar nada. Runtime gerado .next/cache fora do manifesto não foi apagado. Config de retorno usa o Next9f e parâmetros públicos/opções originais, com nonce/control/journal próprios gerados futuramente na preparação nova; não usa control consumido da geração ativa.

Guard open/generation33/tasks{}, healthAPIok/DBok; bootinactive/enabled. Crontab/backupcron/saved/fallback conferidos iguais ao baseline. Leituras inicial/final demonstraram as mesmas identidades/releases e hashes da geração ativa. Não houve mudança operacional. Os parâmetros do scheduler foram registrados privadamente, sem executá-lo ou alterar flag. Esta conferência não certifica exclusividade contra futura intervenção: reconfirmar executor único e ausência de outro deploy/resurrect antes do stop.

**Preservar integralmente a geração ativa** `/opt/re7online/backups/converta-persistent/preparations/frontend-9f4cbe0f-20261007T012803Z`, controls/journals e saved/fallback originais. Não movida nem sobrescrita. Seletores de limpeza já auditados escolhem snapshots/backups/media, não preparations; crontab e backupcron permanecem nos bytes conferidos. A geração nova também torna-se dependência permanente após promoção. Não apagar nenhuma pasta enquanto active/saved/fallback a referenciar; nesta preparação não se remove geração anterior.

Não há dump/restore DB necessário para trocar somente frontend. Backup operacional fresco de saved/fallback será criado antes do stop, nunca restaurando DB/auth. Configs privadas estão600/pasta700; scripts/inventário público sem secrets. Nenhum privilégio novo/sudo/helperV4/política é necessário. Hash do baseline runtime privado: `62bb2245bf9ba470a8097f8e9692e079f35046d9e5ac93b2c3ea8ea7cd0cd6e3`; daemon privado: `e12a8e998e086346cbc0879e66f395330437895913d59ce3bf414e1b550c1187`; controles privados: `750bf0c29ed49ccd16e6d877a3a53d96b332e302661532059a5ecce7b99b4ac8`.

## Comandos finais revisáveis — NÃO executados nesta preparação

Somente após autorização da futura janela. Um comando por vez, conferir exit/diagnóstico privado; não usar loops de start. Atualizar uma preparação com divergência exige reavaliar o baseline, não editar bindings para aceitá-la. Gate atualfalse. Antes de executar: reconfirmar executor único, mesmos artefatos/configs/core/retorno e nenhum start-intent/control da tentativa. Não usar source-tree.preparation-read.private.json como certificado da janela.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-fa60f0f6-20261007T171104Z
R=/opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front
PM=/home/deploy/.npm-global/bin/pm2
export PATH=/usr/bin:/bin:/home/deploy/.npm-global/bin
exec 9>"$P/window.lock"
flock -n 9
(cd "$P" && sha256sum -c scripts.sha256)
test "$(sha256sum "$P/frontend-fa60f0f6.tar.gz" | cut -d' ' -f1)" = 9b375dffca78425e7193e2e73b3c3692a951dc9f638c1c73790cfd3c5e32dac2
python3 "$P/verify-package.py" "$R" 35f28f07cc82496b778956b1f53cbd1f5bb1e0d02b948430530fe36ded55d0b9
test "$(sha256sum "$P/candidate.ecosystem.config.cjs" | cut -d' ' -f1)" = 6786c96757736598affa13410312bc83fb830460dc28c407cb7b0e739f6d07ed
test "$(sha256sum "$P/return.ecosystem.config.cjs" | cut -d' ' -f1)" = 9f3c53be22bcec9a51c8452d0aa84eaf033a7bc6b8bbff53b5cfef3f4423da27
test ! -e "$P/source-tree.private.json"
test ! -e "$P/start-candidate.intent"
test ! -e "$P/start-return.intent"
test ! -e "$P/candidate.run.private.json"
test ! -e "$P/return.run.private.json"
# Habilitar SOMENTE após autorização e todas as reconfirmações pré-parada.
printf 'true\n' > "$P/execution-authorized"
python3 "$P/frontend-action.py" before
python3 "$P/frontend-action.py" init-candidate
python3 "$P/frontend-action.py" init-return
cp -n /home/deploy/.pm2/dump.pm2 "$P/saved.before.private.json"
cp -n /home/deploy/.pm2/dump.pm2.bak "$P/fallback.before.private.json"
date -Is
python3 "$P/frontend-action.py" stop
python3 "$P/frontend-action.py" exited
python3 "$P/frontend-action.py" delete
python3 "$P/frontend-action.py" start-candidate
python3 "$P/frontend-action.py" ready-candidate
python3 "$P/frontend-action.py" capture-current
python3 "$P/frontend-action.py" candidate
curl -fsS --max-time 5 http://127.0.0.1:3001/health > "$P/api.after.private.json"
```

Parar para a conferência de sessão/Inbox/CRM/campanhas do owner. **Somente após a confirmação**, promover sem nova partida:

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-fa60f0f6-20261007T171104Z
PM=/home/deploy/.npm-global/bin/pm2
export PATH=/usr/bin:/bin:/home/deploy/.npm-global/bin
python3 "$P/frontend-action.py" enable-supervision-candidate
python3 "$P/frontend-action.py" supervised-candidate
"$PM" save
cp /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
python3 "$P/frontend-action.py" supervised-candidate
date -Is
```

Prontidão preservada: teto30s/30tentativas, orçamento monotônico, HTTPlogin/identidade revalidada; wrapper40s (demais15s), diagnósticos privados por comando. Não é prazo garantido de indisponibilidade. Launcher faz um único fork, falha durante janela termina78 sem restart automático. Após promoção, falha Next encerra launcher e PM2 recupera normalmente com control/journal novos; dump não reutiliza identidade consumida. Não deixar PM2online só com parent. Provas de save/kill-daemon/resurrect e morte do Next anteriores permanecem válidas para mesmos bytes, não foram provocadas na VPS.

## Aborto e retorno9f antes da promoção

Falha antes do stop: manter9f, fechar gatefalse, preservar diagnóstico. Falha em exited: sucessor bloqueado. Timeout de start: resultado incerto, inspecionar PM2/journal/gates sem repetir start. Se candidato não pronto/encerrou antes da captura: sua identidade foi registrada antes de liberar Next; não exigir captura tardia ausente, mas exigir journal completo, árvore/PID/start ticks/inventário e sockets ausentes. PID0/porta fechada isoladamente não certificam saída. Sobrevivente, PID reutilizado, identidade/core divergente ou observação incompleta bloqueia retorno. Sem kill adicional.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-fa60f0f6-20261007T171104Z
PM=/home/deploy/.npm-global/bin/pm2
export PATH=/usr/bin:/bin:/home/deploy/.npm-global/bin
# Na mesma sessão com lock mantido; init-return já gerou controles próprios.
python3 "$P/frontend-action.py" stop
python3 "$P/frontend-action.py" candidate-exited
python3 "$P/frontend-action.py" delete
python3 "$P/frontend-action.py" start-return
python3 "$P/frontend-action.py" ready-return
python3 "$P/frontend-action.py" return
```

Owner confirma leitura; somente então promover retorno9f e persistir:

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-fa60f0f6-20261007T171104Z
PM=/home/deploy/.npm-global/bin/pm2
export PATH=/usr/bin:/bin:/home/deploy/.npm-global/bin
python3 "$P/frontend-action.py" enable-supervision-return
python3 "$P/frontend-action.py" supervised-return
"$PM" save
cp /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
python3 "$P/frontend-action.py" supervised-return
```

Falha de retorno não autoriza repetir start-return ou um terceiro start; preservar erro, verificar estado e return-exited quando aplicável. Após promoção/gatefalse, uma troca/retorno posterior exige tentativa/baseline novos, não reabrir controls consumidos. Aos15min de interrupção, escalar estado/bloqueio ao owner; não bypass/kill pelo prazo. API/worker/guarda/scheduler/cron/boot e DB/auth permanecem fora de ambos os comandos.

## Conferência posterior pela interface

Owner recarrega sessão habitual sem limpar cookies/storage: Inbox/CRM e campanhas existentes somente leitura. Abrir e trocar detalhe dos conjuntos, acessar lotes/resultados; independentes de mesmo nome permanecem separadas. Comparar horário salvo com data civil no navegadorFortaleza; abrir composer e editar campo **sem salvar/agendar**, conferir que polling não o repõe e descartar a composição local. Conferir terminais e eventual campanha em processamento natural, sem provocar envio.

Registrar cenário PASS/FAIL/NOT EXERCISED e relatos exatos; health isolado não é aceite funcional. Abas antigas mantêm bundle9f até reload;158assets preservados reduzem falha de lazy-load. Não prometer compatibilidade universal RSC/ServerAction. Após retorno a9f, aba com JS novo pode precisar reload para assets; não repetir ações de envio por erro visual. Durante stop/start podem falhar SSR/navegação/assets, embora API/realtime permaneçam ativos; impacto não é zero garantido.

Aceites anteriores permanecem nos seus casos/versionamentos. Agrupamento aguarda execução natural autorizada, contingência AUTO positiva e CRA-PR pendentes. Preparação/frontend não encerra essas frentes nem saneia históricos;4366 sem restauração automática, setembroCLOSED, SECULT/DB-only encerradas e Guia pausado.
