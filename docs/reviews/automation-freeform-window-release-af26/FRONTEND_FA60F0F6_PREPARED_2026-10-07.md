# Frontend fa60f0f6 — preparação exclusiva, 07/10/2026

**RETURNED TO 9f / OWNER RETURN READ CONFIRMED / fa60 FUNCTIONAL FAIL — 07/10, fechamento17:53Fortaleza.** A janela nova foi concluída com retorno comprovado e supervisão/saved/fallback9f; fa60 não foi promovido. API/worker e controles preservados. [Registro final](#retorno-9f-concluído-após-fail-de-layout--0710). As preparações e tentativas abaixo são históricas, não comandos para reuso.

**Preparação anterior:** PREPARED FOR WINDOW / NOT DEPLOYED. Pacote e staging conferidos; gatefalse. Não houve stop/start produtivo, save/resurrect, alteração de guarda/scheduler/cron/boot, DB/auth/tenant/agendamentos ou contato4366. Nenhum envio/provider produtivo. API e worker continuam afbb; frontend produtivo continua9f. Preparação não constitui autorização de executar a troca nem aceite funcional.

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


## Execução autorizada e retorno comprovado — 07/10

**Resultado: RETURNED TO 9f4cbe0f / fa60 NOT DEPLOYED.** Nenhuma partida do candidato fa60; uma única partida do retorno9f. O tar funcional validado permanece intacto e não foi reconstruído. Não houve envio, mudança de atendimento/agendamento/tenant, restore, reparo histórico ou restauração de4366.

| Checkpoint | UTC (Fortaleza = UTC−3) | Evidência |
|---|---|---|
| Reconferência de origem | 17:31:27 | Identidades, retorno/manifesto e controles iguais à preparação; health/DBok |
| Parada do frontend9f | 17:36:47 (14:36:47) | stop PASS; launcher3345522 e Next3345533 saíram |
| Certificado inicialmente negado | 17:36:59 | frontend_socket_survived; não houve delete/start antes de resolver |
| Leitura do proprietário residual | após a recusa | Socket Unix49928 conectado, exclusivamente fd0 do daemon18676/start ticks222727 nas observações disponíveis |
| Escalonamento | horizonte15min | Frontend parado; API/worker vivos; nenhum bypass/kill/start pelo prazo |
| Saída revalidada | 17:53:35 | exited PASS com certificado root fresco; nenhum proprietário adicional |
| Única partida do retorno9f | 17:53:55 | start-return PASS, intent exclusivo, nenhum start-candidate |
| Retorno verificado | 17:54:25 (14:54:25) | ready-return/return PASS, HTTPlogin e APIhealth/DBok |
| Promoção após leitura do owner | 17:56–17:57:50 | owner: “Sim, sessão e telas funcionam”; supervised-return PASS, PM2save/fallback PASS |
| Reconferência final | 17:58:53 | releases, manifesto, identidades, controles e saved/fallback conferidos |

Intervalo observado entre início de parada e retorno verificado: **17min38s**. Esse intervalo inclui diagnóstico, ensaio local e leitura sudo do owner; não mede indisponibilidade de cada requisição. A verificação de prontidão já havia passado antes da marca17:54:25. O horizonte15min foi escalonado e não virou certificado de saída ou autorização de kill.

A recusa acidental da chamada de parada anterior não executou stop. O gate foi fechado; os controles init já gerados foram preservados. Uma releitura por `before` negou `capture_already_exists` sem sobrescrever a captura; a retomada reconfirmou em leitura a mesma árvore/PID/start ticks e ausência de intents de start. Uma leitura auxiliar com import incorreto também falhou antes da parada, sem efeitos. Todos os diagnósticos foram preservados. Esses fatos não foram tratados como starts repetidos.

### Causa do bloqueio e correção operacional autorizada

O gate original exigia desaparecimento de todo inode de socket capturado, incluindo stdin compartilhado com o daemon PM2. Na VPS, os dois PIDs antigos já haviam saído e o listener3000 estava ausente; o único inode residual era o fd0 Unix conectado do daemon preservado. Isso é recurso compartilhado de supervisão, não socket privado de executor sobrevivente.

A correção em `remaining_source_sockets` mantém os gates de PID reutilizado/zumbi, descendentes, daemon/core e listener. Apenas classifica o residual como compartilhado quando: Unix stream conectado e sem flag de listener; identidade do daemon igual ao baseline; seu fd0 aponta ao inode exato; inventário completo demonstra **somente** aquele daemon/fd0 como proprietário; duas observações consecutivas e o conjunto residual coincidem. Outro socket/owner, identidade divergente, leitura incompleta ou churn negam. Sem exclusão por nome, UID, endereço ou contagem.

A primeira execução corrigida na VPS negou `socket_owner_observation_incomplete`: deploy não podia ler `/proc/17261/fd`. Não foi descartado esse PID. Deifson realizou então a leitura root restrita de todos os proprietários, sem executar código de arquivo gravável por deploy, instalar sudoers ou alterar processos. Ela confirmou duas observações completas e idênticas. O certificado `/run/re7-frontend-source-exit-20261007T173647Z.json` é root-owned, exclusivo, cadeia root sem symlinks/escrita por outros, vinculado a boot, hash da captura original e daemon PID/ticks, com validade120s. O verificador revalidou arquivo/schema/frescor/binding/identidade/fd0 e sockets antes de aceitar `exited`. Certificado vencido, dono extra ou captura divergente nega. É evidência pontual, sem garantia atômica de concorrência posterior; execução única e controles continuam necessários.

Essa dependência root foi usada **somente para recuperar a origem desta tentativa**, autorizada explicitamente pelo owner. Não há sudo novo nem exclusão global de sockets. O caminho fixo do certificado desta tentativa não deve ser reciclado para uma futura janela. Nova tentativa precisa resolver a captura/classificação e o acesso observacional antes de parar; esta rodada não declara o pacote pronto para retry automático. O certificado e todos os originais/diagnósticos permanecem preservados.

### Hashes da correção e provas dirigidas

| Item | SHA-256 |
|---|---|
| frontend-check original | f036a144c926899a894dd631552a1d38a4b5aeb5a513e9b803e14bc6928ba331 |
| primeira correção, negou leitura incompleta | d27c358300286f7224557aeed26bc467f240bafee16e0e6774a276efb6b2a758 |
| verificador final utilizado no retorno | 923e2747c239b434a93ef94948794fc044516689bf04527163ac81c6783114b3 |
| teste dirigido | 893e6ff8d358571d8ae43b0d77170a4da529e04751c9c45950c4cfaadcb9e67b |
| scripts.sha256 da recuperação (7scripts + teste), conferido na VPS | 0aa970a8668770563cbd7d31f644e509fb51f3efb0a3575cd3d95996a234e331 |
| verificador de revisão, varredura sem exclusão por UID (somente local) | ae619698a2dc0df8c232ad69f63b700b97d31ff6210e608e0d76d109f15163f7 |
| scripts.sha256 de revisão (somente local) | 22786fd60d8eb43eb7856522337e9ff14541dadc30bbe76c3a7b7c02026a7971 |

Originais do verificador e manifests foram arquivados antes de cada substituição. Os8hashes do manifesto da recuperação passaram na VPS. Na revisão local final, a varredura também foi ampliada a todos os UIDs: permissões insuficientes negam, sem excluir genericamente processos de outro usuário. As provas dirigidas foram reexecutadas sobre esses bytes. Essa diferença de observação permanece somente para revisão; não se substituiu o verificador utilizado pelo retorno já promovido. A recuperação produtiva foi comprovada pela observação root exaustiva, não pela varredura parcial por UID. Ambos os hashes são identificados acima. Launcher/bootstrap/action e artefato funcional não mudaram.

Ensaio reproduzível em Linux com namespace UID/PID/proc privado, Node20.20.0 e PM2 6.0.14 já preservados:

```bash
unshare -Urpf --mount-proc python3 \
  docs/reviews/automation-freeform-window-release-af26/frontend-fa60f0f6-prepared/test_shared_daemon_socket.py \
  /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2
```

**Processos/efeitos reais locais:** daemon PM2 e fd0 Unix; frontend Node e stop/exited; identidade de daemon divergente negada; executor vivo negado; outro socket Unix negado; processo Node adicional segurando socket negado. Nenhum DB/provider/nft/systemd produtivo. O teste fora do namespace negou corretamente uma leitura de fd sem permissão; não foi atribuído PASS.

**Injeções explicitadas:** nesse laboratório o app não herdou o inode do stdin do daemon; o campo residual foi acrescentado à captura para exercitar a combinação `exited` (sem alegar herança real local). O caso de owner adicional usa processos/sockets reais com binding de daemon simulado. Os testes do registro root leem arquivo/proc/socket reais, mas injetam a cadeia de diretórios para superar o mapeamento UID do namespace: registro válido PASS; expirado/futuro/ownerextra/hash de captura divergente DENY. Ownership/cadeia do certificado root real foram conferidos na VPS na recuperação. Não equiparar essas injeções a efeitos operacionais reais ou a novo aceite funcional.

### Estado efetivo final e pendências

- Frontend **9f4cbe0f9a4e891f09bb2f41e88eccec388172da**, BUILD_ID `LFcdEK9gXZsBhf4_c5r8G`, launcher3388720/start ticks2118003772, online/restart0; geração operacional atual é esta preparação, ramo return. Diretório antigo9f e journals intactos; diretório novo/journals/controles também passam a depender de preservação permanente.
- API **afbb7455**, PID3153929/ticks2107666112, e worker mínimo reativo afbb, PID3154150/ticks2107666513, online/restart0, mesmos processos/envs; daemon18676/ticks222727 preservado. Sem rebuild/backport/troca desses componentes.
- Health/DBok; guarda aberta/geração33/tasks{}, conteúdo inteiro inalterado; parâmetros existentes do scheduler iguais. Crontab/cronbackup iguais; boot inactive/enabled. Não se aplicou nft nesta janela frontend. Saved/fallback foram alterados somente para persistir o frontend de retorno, com referência9f/launcher novo verificada e dumps idênticos.
- Gatefalse; nenhuma partida do candidato e uma única do retorno. Owner confirmou sessão/Inbox/CRM/campanhas somente em leitura; isso comprova recuperação de acesso, não aceite da correção fa60.
- **fa60 NOT DEPLOYED / OWNER FUNCTIONAL VALIDATION NOT EXERCISED.** Provas funcionais anteriores sobre tar fa60 mantidas; não reatribuídas à produção9f. Agrupamento natural, contingência AUTO positiva e CRA-PR continuam separados. Não houve nova campanha, alteração de horário ou saneamento histórico.

## Auditoria observacional da árvore ativa — 07/10

**LOCAL OBSERVATION CONTRACT VALIDATED / PRIVILEGED ACCESS NOT INSTALLED / NOT READY FOR WINDOW.** Frontend9f efetivo e tar fa60 preservados; não houve nova preparação remota, parada, instalação, build, envio ou alteração de backend/configuração/históricos. Certificado root consumido não foi lido/reutilizado. O ensaio faz as funções históricas de certificado falharem se forem chamadas: os gates novos não as utilizam.

### Árvore e acesso efetivamente observados

Leitura dirigida da geração de retorno ativa: PM2 6.0.14/Node20.20.0 em **cluster_mode** → launcher3388720/ticks2118003772 → bootstrap/Next3388733/ticks2118003808; daemon18676/ticks222727. Launcher e daemon compartilham grupo18676 e **fd0 `socket:[49928]`**. Next tem stdin `/dev/null`. São processos reais produtivos, sem inferência a partir dos ensaios fork anteriores. BUILD_ID9f e releases API/worker afbb continuam os registrados acima; sem reinícios observados nesta leitura.

| Verificação | deploy | Leitura privilegiada necessária |
|---|---|---|
| PM2/journals/release/BUILD_ID, PID/start ticks/árvore própria e seus FDs | Disponível; zero falhas nos alvos | Não para essas identidades |
| Propriedade exclusiva do socket compartilhado | Somente holders visíveis; não comprova exclusividade | Sim, todos os UIDs/FDs |
| Saída origem/candidato/retorno e ausência de owner adicional | Árvores/ledgers/listeners disponíveis; owners incompletos | Sim, observação fresca em cada saída |
| Instalação root-owned/regra literal/política fixa | Verificação pública parcial | Deifson antes de eventual janela |

A varredura por deploy teve142processos com acesso negado, inclusive dois do próprio UID. Um deles é o sd-pam PID17261/ticks132263: igualdade de UID não permite presumir leitura. Não foram excluídos da exigência nem tratados como owners ausentes. Os dois proprietários visíveis do inode49928 são daemonfd0 e launcherfd0; a ausência de outros só poderá ser afirmada por leitura privilegiada nova. Observador DB instalado e helper backend existentes não oferecem essa leitura; nenhuma chamada/permissão deles foi ampliada. Os dois caminhos propostos para observador/política frontend foram encontrados ausentes.

### Revisão de todos os gates e menor mecanismo

Além do residual na origem, candidate-exited/return-exited ainda tinham comparação bruta de inodes. O ensaio cluster real também demonstrou `executor_survived` indevido pelo grupo compartilhado: o daemon já existente era classificado como descendente frontend. A correção local usa PID/start ticks preexistentes apenas para a inferência de grupo; match explícito de nonce/release/entry, novo processo, ledger/PID reutilizado, zumbi ou descendente continua negando.

[Proposta e código](frontend-socket-observation-proposal/README.md): uma chamada Python `-I -S` sem argumentos, root-owned e com política fixa, somente leitura. O mesmo contrato cobre **source, candidate e return**. Cada gate faz duas observações consistentes de todos os proprietários e rejeita leitura incompleta, outro holder, executor e listener. Somente o fd0 Unix stream conectado pertencente exclusivamente ao daemon exato pode explicar um inode residual. Não é exclusão global de sockets/UID/grupo nem autorização pelo PID inexistente/porta fechada. Saídas privadas incluem stdout/stderr/exit/timeout; journal recebe somente motivo/nome sanitizados. Bindings/hash/boot/nonce da origem real são conferidos antes da parada; resposta antiga não serve de prova.

A dependência concreta é a decisão/instalação de Deifson da chamada restrita proposta, helper e política nova, seguida de preflight real root sobre a árvore ativa. A instalação e seu teste host **não foram executados**; não se declara pacote pronto. Não é necessário sudo amplo, firewall novo ou alteração da delegação DB. Dois snapshots são observação pontual, não atomicidade: executor único e disciplina operacional continuam obrigatórios. Falha após parar impede avançar/retornar até resolver a leitura; por isso a capacidade deve ser demonstrada antes da janela.

### Ensaio final e limitações

Reprodução em namespaces UID/PID/network isolados, Node20.20.0/PM2 6.0.14/Next dos pacotes exatos. Os hashes de ClusterMode.js, ForkMode.js e bin/pm2 coincidem com produção (manifesto anexado); instances1 reproduz o cluster e a **herança real** de fd0. Sem DB/provider/browser produtivo; API/worker temporizadores. Chamada root direta do mesmo observador, não instalação sudoers. Resultado final22verificações:7PASS e15negações esperadas (três negações de churn são leituras distintas, não retry automático).

| Cenário | Resultado | Natureza |
|---|---|---|
| Origem9f → candidatofa60 → retorno9f, sockets/árvore/ledgers dos três gates | PASS | Processos/Next reais; cliente chama reader efetivo no namespace |
| Descritor daemon/launcher compartilhado e daemon-only após stop | PASS | Herança cluster real, sem inode inventado |
| Next morre → launcher sai → PM2 recupera incarnation nova → prontidão HTTP → stop/ausência | PASS | Recuperação real local, sem repetir start da janela |
| Executor vivo, listener adicional, holder adicional do stdin, executor destacado sobrevivente | DENY | Processos/sockets reais |
| Churn entre amostras, três leituras distintas | DENY | Processos reais; barreira de momento injetada |
| Falta de helper/sudo, inclusive no preflight antes de qualquer stop | DENY | Chamada real sem capacidade, alvo preservado |
| Permissão incompleta, daemon binding divergente, ledger com PID reutilizado, replay e R/S | DENY/PASS conforme contrato | Injeções dirigidas; não alegar PID reutilizado real nem troca real de daemon |

Uma versão intermediária do ensaio após recuperação PM2 negou `executor_survived`; não preservou inventário suficiente para atribuir causa exata, que permanece desconhecida. O driver final aguarda prontidão HTTP real da incarnation recuperada antes do stop e registra diagnóstico em nova recusa. Os verificadores não foram relaxados para obter PASS. O ensaio final passou sobre os bytes publicados, sem chamadas ao certificado histórico. Esses resultados não reatribuem os ensaios fork anteriores ao comportamento cluster.

Tar fa60 SHA-256 `9b375dffca78425e7193e2e73b3c3692a951dc9f638c1c73790cfd3c5e32dac2`, manifestos/BUILD_IDfa60 e9f conferidos e preservados; nenhuma suíte funcional ou build repetida. [Manifesto completo dos bytes revisáveis](frontend-socket-observation-proposal/manifest.json); scripts.sha256 local agora cobre10arquivos. Manifesto da recuperação produtiva0aa970… não foi substituído. A integração nova está somente para revisão, **fa60 NOT DEPLOYED**. Agrupamento natural, contingência AUTO e CRA-PR preservam pendências; contato4366/históricos intactos.

## Pacote concreto de instalação observacional — 07/10

**PREPARED FOR INSTALLATION REVIEW / NOT INSTALLED / PRIVILEGED VPS PREFLIGHT NOT EXECUTED / NOT READY FOR WINDOW.** Este é somente o staging do observador, não outra preparação operacional declarada pronta. Não existe autorização de instalação nesta rodada; os comandos abaixo são para revisão e execução futura após autorização específica. Não houve nova janela, rebuild, envio, alteração de aplicação/tenant ou de delegação DB/backend.

Diretório privado novo: `/opt/re7online/backups/converta-persistent/preparations/frontend-socket-observer-20261007T190902Z`. Origem reconfirmada:9f/BUILD_ID `LFcdEK9gXZsBhf4_c5r8G`, launcher3388720/ticks2118003772, Next3388733/ticks2118003808; daemon18676/ticks222727; cluster_mode/restart0. Política gerada diretamente dessas observações. O nonce da origem identifica a incarnation efetivamente viva; não foi inventado nem reciclado como autorização. Candidate/return têm nonces novos, apenas bindings de classificação inativos; nenhum start-intent/prova/certificado/marker consumido foi copiado. Scope privado `executionGate:false`, `notAWindowPreparation:true`. Preparações antigas, certificado consumido e evidências intactos.

### Bytes e staging comprovados

10scripts/arquivos de comando transferidos e conferidos individualmente; schema real da política PASS; identidade viva reconfirmada após transferência. Política, origem, binding e captura inicial privados600; diretório700. Os destinos helper/política novos continuam ausentes pela leitura deploy; destino sudoers não é observável por deploy e **deve ser conferido por root antes de instalar**. Qualquer destino existente, inclusive symlink pendente, bloqueia sem sobrescrita. Não se presume ausência por permissão insuficiente.

| Arquivo | SHA-256 |
|---|---|
| observer.py | `93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385` |
| preflight.py | `06abcfab67e17251d8b13ca8a92fd223bf056a29a9aa4b5599a7eed621027175` |
| install.sh | `c6740222f5cdf50ef3b6ba2eb982bc1a850617176f98bafce841dc266b711c71` |
| check-installation.sh | `318b24481a6cb1c0853b9bc50ab78913684defa38055796e9b8d2cdb3fab9be6` |
| remove.sh | `07eca4a9f82c07fccd252ad11c7b3cd451979588c667550e1449feae90ba3e63` |
| run-preflight.sh | `e4d9c32099c6862d6ec465fbe10c29c28d657b81cab7714174206a028135f61e` |
| re7-frontend-socket-observer.sudoers.proposed | `118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12` |
| scripts.sha256 | `803d49f32993971238c24b644c4e5e30a67fd06fe980c3b9fc5bdbf6bc93296f` |
| policy.private.json (privado) | `b92f5f882ce8ebb09738fd26af903c079762a843aa68e1068ec700addae6a5d0` |
| origin.private.json (privado) | `e473c238902dcd757cca0a4c6c3f5ba7b6978bdf77ce9ad65323cc9536b401f6` |
| initialSourceCapture (privado) | `a1701dbe57ccb45dbb40d1b43a890e1a33649534493b621c8b684c5799d2fbc4` |
| socket-observer-binding.private.json (privado) | `cf05094ac8c2b30380584b111bf66009590c9667490aa6e7adfeb1a5fa555031` |
| private.sha256 (privado) | `520f13aeb2b2630ce095ac8fe0aaffad986df807da99834025e5d558385004e7` |

[Manifesto de instalação com todos os hashes](frontend-socket-observation-proposal/installation-manifest.json). O helper `93564f…` não mudou desde afeb26a3. API/worker/tar/launcher/bootstrap também não mudaram. Os novos bytes são o roteiro de instalação/remoção e o driver de preflight, ensaiado separadamente.

### Instalação exata, futura e exclusiva

Após revisão/autorização específica, Deifson executa na própria sessão deploy; senha somente no sudo local. O script completo versionado é [install.sh](frontend-socket-observation-proposal/install.sh), sem placeholders. Verificação externa antes de executar:

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-socket-observer-20261007T190902Z
test "$(sha256sum "$P/scripts.sha256" | cut -d' ' -f1)" = 803d49f32993971238c24b644c4e5e30a67fd06fe980c3b9fc5bdbf6bc93296f
(cd "$P" && sha256sum -c scripts.sha256)
bash "$P/install.sh"
```

A instalação reconfirma root-absence dos três destinos e a cadeia de diretórios existentes sem symlinks/escrita indevida. Usa root:root helper0644/política0600/regra0440; valida visudo global e proposta **antes**, hashes root-owned antes de habilitar a regra e visudo global **depois**. Confere AST/imports reais (inclusive `from pathlib import Path`) e Python `-I -S`. Não executa código de preparação como root no comando delegado. A única nova regra é:

```sudoers
deploy ALL=(root) NOPASSWD: /usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-socket-observer.py
```

Arquivos `/usr/local/libexec/re7/frontend-socket-observer.py`, `/usr/local/libexec/re7/frontend-socket-observer-policy.json` e `/etc/sudoers.d/re7-frontend-socket-observer`. Não instala regra DB/backend, argumentos variáveis, shell ou sudo amplo. Os privilégios atuais de Deifson e as chamadas backend/DB permanecem intactos. Falha da instalação para imediatamente e preserva o estado parcial; não repetir o bloco nem contornar destino existente. A remoção abaixo trata também os arquivos já introduzidos de uma instalação parcial.

Conferência independente, sem observação de tráfego nem start/stop:

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-socket-observer-20261007T190902Z
bash "$P/check-installation.sh"
```

### Preflight privilegiado com produção funcionando

Somente depois da instalação conferida, execução **como deploy**, sem sudo no driver (apenas no leitor fixo):

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-socket-observer-20261007T190902Z
bash "$P/run-preflight.sh"
```

[Driver](frontend-socket-observation-proposal/preflight.py) reconfirma boot, daemon, PM2/identidade/restart, incarnation real, release/entry/hash/BUILD_ID e árvore antes da leitura. Captura sockets atuais estritamente, sem ignorar descriptor desaparecido. Arquiva a captura autoritativa anterior e snapshots de cada tentativa; nenhuma negativa é apagada. Chama o leitor root publicado, exige hashes da política/helper, receipt exclusivo e prazo monotônico, duas observações completas consecutivas e contrato efetivo de preflight. Reconfirma identidade/árvore e conjunto de sockets depois. A classificação esperada do inode compartihado é daemonfd0 + launcherfd0; outros descritores são explicados pela árvore viva exata. Owner adicional, executor inesperado, listener não explicado, zumbi ou observação incompleta negam.

Leitor: orçamento8s/duas amostras; chamada externa10s; driver inicia no máximo3tentativas, orçamento de início45s e wrapper65s. O wrapper limita **somente o processo de leitura/driver**, nunca aplicação/PM2. Não há espera fixa como certificado, polling indefinido, limpeza ou repetição de start. Privileged stdout/stderr/exit/timeout e cada tentativa ficam em arquivos600/diretórios700. Terminal mostra apenas resumo e caminho do diagnóstico privado. Provas novas não autorizam janela; gate permanece falso mesmo com PASS.

| Recusa | Tratamento / critério |
|---|---|
| Mudança observada entre amostras, incompletude transitória ou alteração de sockets entre leituras | Candidata a transitória; até3leituras novas, sem apagar a negativa. Só é confirmada transitória se uma leitura seguinte completa passar, com bindings intactos |
| Permissão insuficiente, falta de regra/helper, arquivo/cadeia/bytes inválidos ou tabela de observação indisponível | Bloqueio de capacidade/instalação; não excluir processo nem tentar fabricar PASS. Interromper e diagnosticar a capacidade concreta |
| PID/start ticks/boot/nonce/release/árvore divergentes, owner/listener adicional ou recusa não explicada | Bloqueio imediato; preservar diagnóstico; não adaptar bindings automaticamente |
| Três leituras sem prova completa | `REPEATED_OBSERVATION_BLOCKED_CAUSE_NOT_ESTABLISHED`; não chamar de transitório nem afirmar incapacidade permanente por contagem. Investigar registros antes de nova rodada |

A leitura root de todos os processos **ainda não foi feita na VPS**. Root pode também negar uma leitura incompleta; não se assume que instalar a regra gera PASS. Se o diagnóstico não sustentar causa, ela fica desconhecida. Nenhum processo será excluído por UID/nome para superar a negativa. Duas observações são pontuais, não atomicidade. Este preflight só permite avaliar depois a viabilidade de outra janela.

### Remoção concreta e preservação

[remove.sh](frontend-socket-observation-proposal/remove.sh) é executado somente quando Deifson confirmar que nenhuma operação de troca/retorno ativa ou pendente depende do observador. Exige confirmação local `REMOVE-OBSERVER-ONLY`; valida cada arquivo presente contra os hashes e ownership/modes desta geração, negando geração posterior/desconhecida. Arquiva bytes em `removal-archive-private` novo/root-owned antes de remover. Suporta instalação parcial; nunca remove arquivos pré-existentes encontrados antes da instalação, diretórios compartilhados, DB/backend ou evidências. Não execute esta remoção se o instalador foi recusado por destino pré-existente.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-socket-observer-20261007T190902Z
bash "$P/remove.sh"
```

Remove somente a regra introduzida, valida visudo e depois remove helper/política desta geração; falha para e preserva o restante. Staging, arquivos de arquivo e gerações antigas permanecem. Não remover enquanto preparação/retorno depender da leitura.

### Provas reutilizadas e dirigidas

Ensaio real PM2/Node/Next cluster de afeb26a3 (7PASS/15negações esperadas) reutilizado, **não repetido**. Tar fa60 idêntico; não houve build/smoke funcional novo. Novos12testes PASS do driver usando arquivos/FDs/processo filho reais em namespace sem rede externa, metadata PM2 e respostas privilegiadas explicitamente simuladas. Cliente/logger e contrato de autorização são os módulos efetivos: sucesso, recusa transitória→leitura fresca, três recusas, falta de capacidade, permissão, binding/PID divergente, owner adicional, duas amostras obrigatórias, replay, PM2 duplicado, zumbi e socket mudando após observação. São provas do driver, **não comprovação de sudoers/root/proc na VPS**.

```bash
unshare -Urnpf --mount-proc sh -c 'ip link set lo up; python3 -m unittest discover -s docs/reviews/automation-freeform-window-release-af26/frontend-socket-observation-proposal -p test_preflight_driver.py -v'
```

Scripts shell/AST/imports/manifests conferidos; staging remoto/hash/schema/origem PASS. Instalação, remoção e preflight root: **NOT EXECUTED**. Backlog mantém fa60 NOT DEPLOYED e demais aceites separados. Próxima decisão é específica sobre instalar estes bytes; nenhuma janela será aberta antes da leitura privilegiada completa e de sua revisão.

## Instalação conferida e preflight real na VPS — 07/10

**INSTALLATION VERIFIED / LIVE OBSERVATION PASS / fa60 NOT DEPLOYED.** Owner autorizou exclusivamente instalação restrita e preflight dos bytes b08bdbcc. Nenhuma janela foi aberta, nenhum stop/start/restart/promoção/deploy foi executado. Instalação concluída por Deifson na própria sessão sudo; senha não solicitada no chat nem registrada. Não houve instalação parcial ou recuperação.

### Instalação

Deifson executou o bloco publicado após conferir os manifestos/scripts e arquivos privados. `install.sh` → `check-installation.sh` PASS: hashes exatos do helper/política/regra, propriedade root:root, modos0644/0600/0440, cadeia de diretórios sem symlinks ou escrita indevida, AST/imports permitidos, regra literal Python `-I -S` sem argumentos e visudo antes/depois PASS. Confirmação `RESTRICTED_INSTALLATION_COMPLETE_NO_WINDOW`. Depois foi reconfirmado por leitura pública o hash do helper e stat root/modes/helper sem symlink; o próprio leitor root atestou os hashes reais do helper e política. Não se ampliou delegação DB/backend; os dois helpers existentes mantêm os mesmos hashes.

### Observação produtiva efetivamente executada

Uma invocação de `run-preflight.sh` como deploy, depois da instalação conferida. Início registrado **07/10/2026 19:38:49,616 UTC / 16:38:49,616 Fortaleza**. Primeira e única tentativa PASS; duas observações consecutivas completas,153processos em cada amostra; reader exit0/sem timeout. Tempo leitor **0,181615s**, driver **1,072121s**. Nenhuma negativa, retry ou nova invocação foi necessária. Diagnósticos privados, stdout/stderr/código/receipts e capturas anteriores preservados; não se reutilizou o certificado consumido.

- Boot/bindings, PID/start ticks de daemon e origem, incarnation/nonce atual, release/entry/hash/BUILD_ID e árvore foram reconfirmados antes/depois.
- Cada amostra identificou exatamente2executores da origem,1listener frontend explicado pela captura e7sockets da árvore.
- Socket Unix compartilhado inode49928: stream conectado (`type0001/state03/flags00000000`), com **somente** daemon18676/ticks222727/fd0 e launcher3388720/ticks2118003772/fd0 como proprietários, iguais nas duas amostras. Não foi inferido pela quantidade de owners visíveis a deploy; a varredura root leu todos os processos.
- Os demais proprietários foram explicados pela árvore ativa exata. Nenhum owner adicional, executor inesperado, listener não explicado ou leitura incompleta foi aceito. O Next permanece3388733/ticks2118003808.

[Resultado sanitizado e hashes da evidência privada](frontend-socket-observation-proposal/installation-result.json). Diretório privado da execução: `receipts-private/preflight-19735a437277a1978e72ce765d4c3bcc` dentro do staging observacional publicado. JSON bruto, policy/bindings, stdout/stderr e lista completa dos153processos ficam fora do Git. A captura inicial e o snapshot anterior permaneceram preservados. O `installationApproved:false` do scope inicial é registro histórico imutável da preparação, não estado atual da autorização; a autorização e conclusão estão registradas neste resultado novo. `executionGate:false` permanece efetivo.

### Produção preservada e limite do resultado

Depois da leitura: frontend9f3388720/ticks2118003772, APIafbb3153929/ticks2107666112 e worker mínimoafbb3154150/ticks2107666513, todosonline/restart0; daemon preservado. Mesmas releases e BUILD_ID9f. Nenhuma ação em guarda/scheduler/cron/boot/saved/fallback/DB/auth/configuração de tenant foi executada. Nenhum envio, campanha, reparo histórico, build ou suíte funcional repetida. Só os três arquivos privilegiados novos autorizados foram instalados; helper/regra/política antigos DB/backend e gerações anteriores intactos.

O bloqueio de **capacidade de observar a árvore ativa da VPS** está comprovadamente resolvido para estes bindings e esta execução. Isso não comprova saída produtiva futura nem ida/retorno/fa60, não oferece atomicidade temporal e não habilita gates. Outra troca de fa60 continua condicionada a preparação operacional revisada, bindings/provas frescos e autorização própria. A observação não será reutilizada como certificado de uma futura parada. Não remover o observador/permissão enquanto eventual preparação/retorno depender dele. Aceites independentes e históricos preservados.

## Nova sequência fa60 com observador instalado — 07/10

**PREPARED FOR POLICY REVIEW / INTEGRATED PREFLIGHT DENIED / NOT READY FOR WINDOW / fa60 NOT DEPLOYED.** Preparação efetivamente criada e conferida na VPS: `/opt/re7online/backups/converta-persistent/preparations/frontend-fa60-observed-20261007T194628Z`. Não houve instalação de política, stop/start/restart, promoção, alteração de controles produtivos ou envio. Gate `execution-authorized:false`; nenhum start-intent ou journal de partida. Gerações consumidas e diagnósticos preservados.

### Artefatos, controles e política exatos

[Pacote revisável](frontend-fa60-observed-prepared/README.md), [manifesto completo](frontend-fa60-observed-prepared/manifest.json), [diff operacional](frontend-fa60-observed-prepared/operational-paths.patch), [diff sanitizado da política](frontend-fa60-observed-prepared/policy-diff.sanitized.json) e [comandos](frontend-fa60-observed-prepared/WINDOW-STEPS.txt). A relocação altera somente o diretório fixo de action/check. Os três gates revisados `exited`, `candidate-exited`, `return-exited` usam o mesmo cliente/contrato/root reader; não receberam exceções adicionais. Launcher/bootstrap, observador instalado e sudoers permanecem byte a byte iguais. Controles de candidato e retorno foram inicializados uma vez com nonces inéditos, configuração privada derivada das origens atestadas e snapshots próprios dos processos pré-existentes. Não se copiou intent, startup ledger, certificado ou prova consumida. O nonce da origem é sua identidade efetivamente viva, não um token reaproveitado para autorizar partida.

| Item | SHA-256 / identidade |
|---|---|
| Tar fa60 reutilizado, sem rebuild | `9b375dffca78425e7193e2e73b3c3692a951dc9f638c1c73790cfd3c5e32dac2` |
| Manifesto funcional candidato | `35f28f07cc82496b778956b1f53cbd1f5bb1e0d02b948430530fe36ded55d0b9` |
| BUILD_ID candidato | `HttJ8PoISXKUzSzoDZ7_E` |
| Manifesto retorno9f ativo | `ba6b43c2c550c5926893e12b5620b59d144e0cd91890b978171656b284422eba` |
| BUILD_ID retorno9f | `LFcdEK9gXZsBhf4_c5r8G` |
| `scripts.sha256` (7 módulos finais) | `86dc5c7691c17735368fd509d598a866d661600cde3e1104f26badc18fdbff7a` |
| `bindings.sha256` (privado) | `aa6e4e0a882ce4bc52363cc40344b5071bca99cde9e187d48dad609acf9c7d5f` |
| `review-commands.sha256` | `8be652957cb74a90d383a95d10f034da61aabd860196fdb06e6d95a6043d3d0f` |
| Helper instalado, inalterado | `93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385` |
| Sudoers instalado, inalterado | `118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12` |
| Política root instalada | `b92f5f882ce8ebb09738fd26af903c079762a843aa68e1068ec700addae6a5d0` |
| Política nova proposta, não instalada | `eff1b150640219af55c184d08a0f1752e23c5fd55954b8220d4f137ed27c5213` |

Tar exato preservado por hardlink no staging novo; candidato: inventário completo, hashes/modos/symlinks/BUILD_ID PASS. Retorno: todos os arquivos e vínculos imutáveis do manifesto PASS. A primeira conferência de igualdade do inventário total do retorno recusou oito arquivos adicionais; investigação limitada identificou somente imagens WebP regulares, não executáveis, pertencentes a deploy, em `.next/cache/images/*/*.webp`. O Next empacotado cria esse cache em `ImageOptimizerCache`, linhas634/689 de `node_modules/next/dist/server/image-optimizer.js` (hash `7133d307e3a3351e61b09df73e512b751051725d43a4e7730c45a55616c65525`). Snapshot privado separado; não apagados nem copiados ao Git. Isso distingue saída runtime de artefato imutável; nenhum verificador de saída/processos foi relaxado e não se afirma igualdade do inventário total com o tar. A recusa inicial e seu diagnóstico permanecem preservados.

A comparação entre política instalada e controles finais encontrou exatamente cinco campos diferentes: caminhos das capturas de source/candidate/return e nonces de candidate/return. Boot, PID/start ticks do daemon, porta3000 e release/entry de todos os papéis, além do nonce real da origem, permanecem iguais. Nonces só são publicados como digests. A política antiga **não** autoriza os novos controles. Não se adaptaram bindings para aceitá-la.

### Preflight integrado real e dependência restante

Uma invocação efetiva de `frontend-action.py before`, com os sete módulos finais e gatefalse, em **07/10/2026 19:55:24,086 UTC / 16:55:24,086 Fortaleza**. O root reader instalado executou com sucesso e atestou a política antiga; o consumidor final **negou `socket_observer_integrity_binding`**, pois exige a nova política. A leitura é evidência preparatória de recusa, **não PASS integrado**. Registro privado stdout/stderr/exit preservado, hash `533fcae9a02d334a6c4f3a44ec71d828b6fab4b854af230c3d071fc344ac7364`; captura preservada em `source-tree.preparation-denied.private.json`. Não se repetiu leitura para forçar PASS. O PASS observacional anterior continua válido como prova de capacidade, não como prova destes novos bindings.

Conferência final remota: `scripts.sha256`, `bindings.sha256` e `review-commands.sha256` PASS; frontend9f3388720/ticks2118003772, APIafbb3153929/ticks2107666112 e worker mínimoafbb3154150/ticks2107666513, todosonline/restart0; daemon18676/ticks222727 preservado. Nenhuma captura de saída foi emitida, nenhum certificado consumido foi reutilizado. API/worker, guarda, scheduler, cron/boot, saved/fallback ativos, DB/auth e históricos não foram alterados. As cópias de saved/fallback são somente snapshots privados da preparação.

### Substituição proposta antes de qualquer parada

Requer revisão/autorização específica da política nova; **não executar agora**. [Bloco completo restrito](frontend-fa60-observed-prepared/replace-policy.sh), SHA `f11e74f16deb9dc11b51e39cc0e0a6f94b542cf453046a990bfbbf6078004be6`, já staged no diretório novo. Confere hashes de origem/resultado, root:root e cadeia sem links/escrita indevida, diferenças permitidas, controles novos e daemon/boot. Arquiva a política antiga em `/usr/local/libexec/re7/frontend-socket-observer-policy.pre-fa60-194628.json`, root0600, exigindo destino ausente; instala exclusivamente política nova root0600 e valida visudo antes/depois. Não grava helper/sudoers nem amplia chamadas delegadas. Destino divergente, falha parcial ou daemon alterado para a execução; não repetir nem sobrescrever arquivo desconhecido.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-fa60-observed-20261007T194628Z
test "$(sha256sum "$P/replace-policy.sh" | cut -d' ' -f1)" = f11e74f16deb9dc11b51e39cc0e0a6f94b542cf453046a990bfbbf6078004be6
bash "$P/replace-policy.sh"
```

Senha somente na sessão sudo de Deifson. Depois da instalação aprovada, executar o bloco **PREPARATORY PREFLIGHT** de `WINDOW-STEPS.txt` com gatefalse. Somente PASS completo dos bytes finais permite avaliar a futura janela; preservar a captura preparatória em arquivo próprio e obter outra no início da janela. Mudança de identidade/política ou observação incompleta bloqueia; não renovar binding para mascarar divergência.

### Ida, retorno e promoção preparados

[Comandos finais de ida/retornos/promoção](frontend-fa60-observed-prepared/WINDOW-STEPS.txt), hash `75b2abdb40bceb3863cc16990a34d3327191504535a8c93e7b9478ef8e78ff81`. A futura janela mantém uma sessão/flock exclusiva, reconfirma manifests/artefato/configurações/core e salva snapshots atuais antes da parada. Não reinicializa os controles. Ordem: before novo → stop origem → exited com leitura root nova → delete → uma partida candidata → prontidão limitada → captura/validação → conferência owner → promoção permanente → PM2save/fallback. Prontidão preserva limite30tentativas/30s e wrapper40s, com diagnóstico privado; não repete start.

Retorno antes de qualquer submissão candidata usa uma nova leitura `exited` da origem. Depois de uma submissão candidata, inclusive encerramento antes da captura, exige `candidate-exited` com ledger completo e observação root nova; erro de identidade/observação ou sobrevivente bloqueia a partida9f. Uma única partida de retorno; owner confirma antes da promoção/saved/fallback. Falha do retorno exige `return-exited` fresco e escalonamento, sem terceira partida/bypass. Depois de promoção, outra operação exige preparação própria. Alternância R/S não muda identidade; zumbi, PID reutilizado, executor/proprietário adicional, listener e leitura incompleta continuam negando. Certificado preparatório, porta fechada e PID zero não substituem saída comprovada. Aos15min informar estado/impedimento; prazo não autoriza kill.

Nenhum build, suíte ou smoke funcional repetido. Reutilizadas as provas Node20.20.0 do tar, browser horário/conjuntos/leituras e PM2/Next reais já publicadas; nesta rodada houve somente geração de controles, leitura de integridade, validação estática shell/AST dos comandos e a chamada produtiva de preflight que negou. Não se atribui PASS de ida/retorno produtivos a essas provas. Persistem duas dependências: revisão/instalação exclusiva da política e preflight integrado PASS; depois, revisão/autorização própria da janela. Gate continua falso. Aceites independentes de agrupamento/contingênciaAUTO/CRA-PR e históricos preservados.

## Política substituída e preflight integrado PASS — 07/10

**POLICY INSTALLED VERIFIED / INTEGRATED PREPARATORY PREFLIGHT PASS / EXECUTION GATE FALSE / fa60 NOT DEPLOYED.** Autorização específica do owner incluiu somente substituição da política d896eb99 e preflight integrado. Nenhum stop/start/restart, candidato, promoção ou janela foi executado. Tar, build e provas funcionais reutilizados; nenhuma suíte repetida.

### Instalação restrita conferida

A capacidade sudo não interativa para substituição retornou `sudo: a password is required`, antes de qualquer mutação. Deifson executou então o bloco revisado na própria sessão sudo, sob flock exclusivo; nenhuma senha foi solicitada no chat, capturada ou registrada. `scripts.sha256` e `bindings.sha256` conferidos antes da instalação. `EXACT_FIVE_FIELD_POLICY_DIFF_PASS`, hashes root-owned, cadeia de diretórios, `NEW_POLICY_AND_ARCHIVE_PASS` e visudo antes/depois PASS. Não houve instalação parcial ou alteração de helper/sudoers.

| Arquivo | Hash SHA-256 confirmado | Propriedade / modo |
|---|---|---|
| Política instalada `/usr/local/libexec/re7/frontend-socket-observer-policy.json` | `eff1b150640219af55c184d08a0f1752e23c5fd55954b8220d4f137ed27c5213` | root:root0600 |
| Anterior arquivada `/usr/local/libexec/re7/frontend-socket-observer-policy.pre-fa60-194628.json` | `b92f5f882ce8ebb09738fd26af903c079762a843aa68e1068ec700addae6a5d0` | root:root0600 |
| Helper preservado | `93564f78ad2286621b465f713f82ac5d37d031518c92be9110dcf934412af385` | root:root0644 |
| Regra sudo literal preservada | `118a54ec6f03c6f8af92a5e9f05d766fda08eea0d2fa79a207ecf588374e8b12` | root:root0440 |

Hash/modo da política anterior arquivada foram verificados pelas assertions root do instalador publicado executado pelo owner. O leitor instalado depois atestou diretamente os hashes da política nova e helper; não se publicou nem tentou ler como deploy o conteúdo protegido da política. A regra literal permanece sem argumentos adicionais e nenhuma delegação DB/backend foi ampliada.

### Cadeia integrada executada com produção funcionando

Depois da instalação, Codex executou a seção **PREPARATORY PREFLIGHT** de `WINDOW-STEPS.txt`, como deploy sob o mesmo `window.lock` exclusivo da preparação. Reconfirmação dos hashes completos de `scripts.sha256` e `bindings.sha256`, todos os bytes listados PASS; `execution-authorized=false`. Uma invocação de `frontend-action.py before` com os módulos finais: **PASS, exit0, sem timeout, sem retry**. O processo de leitura root também exit0 e atestou a nova política exata. As duas observações consecutivas foram completas e consistentes,156processos em cada amostra; duração do leitor0,191941s. Registro da conclusão **07/10/2026 20:24:24,092 UTC / 17:24:24,092 Fortaleza** (mtime do registro privado da ação).

Contrato efetivo reconfirmou boot, daemon PID/start ticks, release/entry/nonce da origem, identidade PM2, árvore, listener e todos os proprietários pertinentes. Socket compartilhado observado com somente daemon18676/ticks222727/fd0 e launcher3388720/ticks2118003772/fd0, nas duas amostras. Nenhum processo foi excluído para obter PASS, nenhuma negativa relaxada, nenhum binding alterado. A negativa anterior `socket_observer_integrity_binding` permanece preservada e foi resolvida pela substituição autorizada da política, não por aceitar a geração antiga.

Somente após PASS, captura renomeada para `source-tree.preparation-reviewed.private.json`, preservada integralmente. Hash `10ef047bfd5a57af10686313f26b5f315317e426039fed656b4e1bb0127b18ed`. `source-tree.private.json` ausente novamente, permitindo uma captura inédita no futuro preflight da janela. Diagnósticos stdout/stderr/exit/receipt mantidos em diretórios privados; hashes do registro da ação `c2dc51ecb30c510c1d98e7207bd90d130050326460bda74d6c6939b643e5821d` e do root reader `bb869cd42115dc5efee6f6c6579fff30f809668f61504075f7d521d704ed9eb8`. [Resultado sanitizado versionado](frontend-fa60-observed-prepared/policy-preflight-result.json). Manifesto original da preparação e capturas/diagnósticos anteriores não foram reescritos.

### Estado confirmado e limites

Conferência posterior somente leitura: frontend9f3388720/ticks2118003772, APIafbb3153929/ticks2107666112, worker mínimo reativoafbb3154150/ticks2107666513; todosonline/restart0, mesmas releases. Daemon18676/ticks222727 preservado. Nenhum intent de start ou ledger de candidato/retorno; gatefalse. Guarda, scheduler, cron/boot, saved/fallback ativos, DB/auth, configuração de tenant e históricos não foram alterados por esta execução.

Os pré-requisitos **de instalação da política e preflight integrado preparatório** estão satisfeitos para esta observação. Isso não comprova saída futura nem ida/retorno produtivos, não habilita o gate e não constitui aceite funcional de fa60. A próxima janela precisa de autorização própria e reconfirmação imediata; `exited`, `candidate-exited` e `return-exited` obterão observações inéditas. Não reutilizar esta captura como certificado de saída. Produção continua9f/afbb; nenhuma parada ou envio autorizados nesta etapa. Aceites independentes e frentes históricas preservados.

## Janela fa60 — rejeição funcional e retorno bloqueado — 07/10

Owner autorizou somente frontend; execução sob lock exclusivo, tar/manifests/retorno/controles conferidos, before novo PASS. Stop origem20:33:52UTC; exited fresco PASS, delete e partida candidata únicos PASS, prontidão20:34:34UTC/validação20:34:56UTC PASS. API/worker e controles preservados. Owner reportou layout sem tamanho/organização; **FAIL funcional**, causa desconhecida nesta etapa. Nenhuma promoção/save.

Candidato identificado e parado20:36:45UTC para retorno autorizado. Gate `candidate-exited` negou `unreadable_new_or_changed_process`. Diagnóstico identifica dois SSHs posteriores à preparação com ambiente inacessível a deploy; não foram excluídos. Leitor root instalado e contrato efetivo de ausência PASS em leitura diagnóstica, sem permitir partida por isso. Retorno ainda não iniciado; frontend parado, API/worker ativos. [Correção restrita e hashes para decisão de recuperação](frontend-recovery-observation-20261007/README.md): classificador efetivo/17casos sintéticos PASS; não instalada, sem alteração de helper/política/sudoers. Preservadas captura candidata, negativa e todos os journals.

## Retorno 9f concluído após FAIL de layout — 07/10

**RETURNED TO 9f / OWNER RETURN READ CONFIRMED / fa60 NOT DEPLOYED.** A janela autorizada exclusivamente do frontend encerrou com uma partida candidata e uma partida de retorno, sem restart/repetição. Fa60 nunca recebeu marker de promoção ou saved/fallback. Owner relatou “sem tamanho e sem organização”; causa de layout permanece **desconhecida**, investigação separada após restabelecimento. HTTP/BUILD_ID/prontidão não foram confundidos com aceite visual.

### Cronologia e alcance

| Checkpoint | UTC07/10 | Fortaleza07/10 | Resultado |
|---|---|---|---|
| Before inédito da janela | 20:32:53 | 17:32:53 | PASS, política nova, identidades/controles/retorno/tar íntegros |
| Início stop origem9f | 20:33:52 | 17:33:52 | Uma parada frontend; API/worker ativos |
| Saída origem | 20:34:04 | 17:34:04 | Gate fresco PASS, dois samples completos; sem reuso da captura preparatória |
| Candidato pronto | 20:34:34 | 17:34:34 | Partida única; prontidão limitada PASS |
| Candidato validado tecnicamente | 20:34:56 | 17:34:56 | Identidade/BUILD_ID/HTTP PASS; owner depois rejeitou layout |
| Candidato parado para retorno | 20:36:45 | 17:36:45 | Identidade reconfirmada; sem promoção |
| Primeiro candidate-exited | 20:36:51 | 17:36:51 | DENY `unreadable_new_or_changed_process`; diagnóstico preservado |
| Checker corrigido instalado | 20:46:18 | 17:46:18 | Somente bytes aprovados; arquivo e manifesto anteriores arquivados |
| Candidate-exited novo | 20:46:28 | 17:46:28 | PASS; leitura root nova + contrato + inventário efetivos |
| Retorno9f pronto | 20:47:50 | 17:47:50 | Uma partida, readiness PASS |
| Retorno9f validado | 20:48:08 | 17:48:08 | Gate/BUILD_ID PASS; pronto para conferência owner |
| Confirmação owner registrada | 20:50:29 | 17:50:29 | “sim voltou ao normal” |
| Promoção retorno | 20:50:30 | 17:50:30 | Somente após confirmação; sem start/restart |
| Saved/fallback + supervisão final | 20:51:43 | 17:51:43 | PASS; gatefalse |
| Conferência final de componentes/controles | 20:53:03 | 17:53:03 | PASS; lock depois liberado |

Intervalo observado início da troca→retorno validado **14min16,866s**; não é uma alegação de indisponibilidade contínua: candidato respondeu entre20:34:34 e sua parada, porém com layout rejeitado. Dois intervalos sem frontend útil, separados pela versão defeituosa. O retorno técnico foi restabelecido antes do horizonte15min; a confirmação de telas e persistência vieram depois. Nenhum timeout foi usado como prova de saída, autorização de kill ou motivo para repetir starts. Bloqueio comunicado imediatamente e recuperação restrita apresentada/aprovada enquanto frontend estava parado.

### Bloqueio e correção efetivamente aplicada

Inventário local não conseguia ler ambiente/cwd de dois SSHs do mesmo UID, ausentes do snapshot feito na preparação. Não eram executores frontend conforme duas observações root completas, mas a cadeia local negava antes de consumir essa prova. Identidades diagnosticadas:3409655/ticks2118900628 e3410745/ticks2118940709, grupos/ancestrais próprios, roles vazias. Não foram excluídos por nome, UID ou PID; baselines não foram reescritos. Primeiro diagnóstico amplo foi refinado ao mesmo UID do inventário efetivo; a classificação final e a negativa ficaram privadas.

Owner aprovou somente o checker95b2d33d. Origem `1136c0cc8e4e26234c50b6ff7d7b10997d8dad1da58bae4e3a63ea6c5303e7bf`; resultado `77817b16a7f760b0b75d514f54df7ef482cbb819d92fa4a6cab48541b7080c6a`. Original arquivado `frontend-check.pre-recovery.private.py`. Manifesto antigo arquivado `scripts.pre-recovery.sha256`, hash `86dc5c7691c17735368fd509d598a866d661600cde3e1104f26badc18fdbff7a`; novo manifesto `8bde9e92aecccf24a30d751a5bffbd089169fd5ff4e4bf11ce8f2e83c7bf1fac`. Todos os demais scripts/helper/política/sudoers iguais.

O gate passou só depois de uma chamada inteiramente nova do observador instalado. Para identidade local ilegível nova, exige duas amostras root completas e frescas, PID/ticks/parent/group exatos, nenhuma role/grupo/PID protegido, cadeia ancestral completa/consistente e nenhuma divergência; R/S ignorado como estado transitório, zumbi e observação incompleta negados. Contrato de ausência root, sockets/owners/listener e ledger continuaram obrigatórios. Os17testes publicados exercitam classificador efetivo com dados sintéticos; **separadamente**, o gate corrigido foi executado na VPS sobre processos/PM2/sockets reais e PASS. Não se atribuem a esses testes novas provas Node/PM2 de reboot ou funcionalidade fa60.

### Estado liberado ao tráfego

Frontend **9f4cbe0f9a4e891f09bb2f41e88eccec388172da**, BUILD_ID `LFcdEK9gXZsBhf4_c5r8G`; launcher3413279/ticks2119046532, Next3413290/ticks2119046558, daemon18676/ticks222727. Todosonline/restart0. API **afbb7455**3153929/ticks2107666112 e worker mínimo reativoafbb3154150/ticks2107666513 preservados, online/restart0. HealthAPIok/DBok, owner confirmou layout/sessão/Inbox/CRM/Campanhas normais. Nenhum envio de validação, mutation de tenant, reparo histórico ou build.

Guarda aberta/generation33/tasks{}, mesmo estado operacional; scheduler/configuração/identidade da API preservados. Backupcron e crontab idênticos por hash, bootinactive/enabled igual; nenhum nft/contenção foi aplicado nesta janela frontend. DB/auth e dados atuais preservados. PM2 saved/fallback atualizados somente após confirmação do owner, ambos hash `4722a408e20e210097066b1cc7647e095ed7223371a3fa60dc9ce7f9441a55de`; API/worker no dump mantêm configuração/env/args/cron_restart iguais ao snapshot anterior. Retorno aponta ao launcher/control9f do staging novo e marker permanent; supervised-return PASS antes/depois de save. Gatefalse e lock liberado. [Resultado sanitizado](frontend-recovery-observation-20261007/returned-result.json).

Staging ativo `/opt/re7online/backups/converta-persistent/preparations/frontend-fa60-observed-20261007T194628Z` agora é dependência permanente do retorno9f, assim como launcher/checker/controles/journals e seus vínculos saved/fallback; não remover. Preservados arquivo original, manifests anteriores, captura preparatória, captura fonte/candidata, root stdout/stderr/exit e recusas. Geração antiga9f e preparações consumidas intactas. Intents consumidos impedem reexecutar estes comandos; qualquer futura operação precisa de preparação própria.

### Pendências separadas

1. Investigar causa do layout fa60 em isolamento, incluindo assets e execução do pacote exato; não assumir CSS ausente sem evidência nem iniciar candidato produtivo para diagnosticar. Falha visual não reabre backend, registros ou aceites anteriores.
2. A correção aprovada alcança gates de ausência candidata/retorno. `supervision_preflight` permanente permanece usando inventário local sem observação para uma identidade nova ilegível. Isso requer auditoria isolada específica; supervised-return prova o processo vivo atual, não recuperabilidade de todas as partidas futuras no mesmo boot. Não provocar restart/resurrect na VPS para testar essa limitação.
3. Agrupamento aguarda caso natural autorizado, contingênciaAUTO e aceite específicoCRA-PR permanecem independentes. Históricos/4366 sem reparo; setembroCLOSED e demais frentes preservadas. Fa60 continua **FAIL / NOT DEPLOYED**, apesar do retorno técnico9f e confirmação visual concluídos.

## Causa do layout demonstrada e supervisão ensaiada — 07/10

**AUDITORIA ISOLADA CONCLUÍDA / CORREÇÕES LOCAIS PARA REVISÃO / NOT DEPLOYED.** O estado produtivo continua o retorno9f descrito acima; nenhuma leitura repetida, stop/start, instalação, save, mudança de controle ou preparação remota nesta investigação. Staging permanente9f preservado. A causa “desconhecida” no registro da recuperação permanece como diagnóstico daquele momento; as evidências abaixo agora demonstram a causa.

### Causa e comparação do artefato exato

Antes de recompilar, tar fa60 `9b375dffca78425e7193e2e73b3c3692a951dc9f638c1c73790cfd3c5e32dac2` e tar9f `d0f15209922741e51ab21e22d01ff2188ce212ef23081888084c868754065e54` foram conferidos e extraídos em diretórios novos, com hashes/modos/31symlinks do inventário completo verificados. Node20.20.0/Next16.1.5/Chrome reais, rede externa inexistente, APIs/auth simuladas. Mesma origem proxy HTTP local, rota `/app/campaigns`, sessão sintética, viewport1400×1100, Fortaleza e cache desabilitado. Caminhos preservados pelo proxy; TLS/Nginx da VPS não reproduzidos nem necessários para produzir a falha encontrada. Screenshots, HTML/rede, console e logs permanecem privados.

| Evidência | 9f | fa60 rejeitado |
|---|---|---|
| Document HTML |200,text/html|200,text/html|
| CSS efetivamente referenciado/carregado |`8cc37bb3fdff7798.css`,200,text/css,192809bytes|`47378a03a33357df.css`,200,text/css,67832bytes|
| SHA-256 CSS |`3fb05e4b7a81a49c4538a8a5114db1e9fee0ea6e10f16b70d31ad99fb4a303cf`|`524df9d551d68e0f140655656e7a925e6d5a5c98f4a8c95065ed66f2008edea4`|
| Tailwind |classes geradas|`@tailwind base/components/utilities` sem expansão|
| Estilos calculados da mesma probe |flex, gap24px, padding24px, fonte14px, radius16px|block, gapnormal, padding0, fonte16px, radius0|
| Scripts efetivamente carregados |7,200/MIME JavaScript|8,200/MIME JavaScript|
| Exceções JS / APIs inesperadas |0/0|0/0|

O build original preservado `/tmp/re7-front-fa60-build` **não continha `postcss.config.mjs` nem `tailwind.config.js`**, embora ambos existam no commit funcional fa60. O build9f preservado continha ambos. A lista de extração para o build omitira as configurações; Next compilou/minificou o CSS sem o plugin Tailwind. CSS foi servido corretamente, mas as diretivas desconhecidas pelo navegador não geram estilos. Assets antigos incluídos no tar não substituem a folha nova explicitamente referenciada. Não é evidência de cache, arquivo ausente, erro MIME ou falha de JavaScript. Reprodução do tar rejeitado + única intervenção nos inputs do build + desaparecimento da falha comprovam a causa sem mudança funcional.

### Correção mínima e detector do problema

[Receita e provas reproduzíveis](frontend-layout-audit-20261007/README.md), [resultados](frontend-layout-audit-20261007/results.json), [manifesto do delta](frontend-layout-audit-20261007/manifest.json). `build-inputs.py` extrai conjunto completo de inputs do SHA funcional, exige configs, compara package/lock e reutiliza node_modules íntegro sem atualizar dependências. Após a comparação inicial sem rebuild, uma compilação corretiva isolada Node20 foi necessária. Nenhum TSX/código funcional fa60 alterado.

Tar corretivo privado: **`17bd5fb895ce14f610257fb8186b916dbc39d34cdd7f421cb07f5a0fc2e1f252`**,174115534bytes; manifesto completo **`378bb220d02e29e93ccd2edf4d83cb2e903912f5548dc498e28e6a4e914cd1bf`**; BUILD_ID **`wBXX8kmp5RuCHCYt_ot8X`**,22868arquivos/31links,157assets anteriores preservados sem colisão. Extração limpa/inventário completo e inicialização exata Node20 PASS. Comparação mesmo navegador/origem9f→tar corrigido PASS, CSS expandido e estilos esperados. Tars anteriores/build/evidências não substituídos. Artefato novo não foi levado à VPS nem promovido a pacote operacional pronto.

Os smokes anteriores13/13 e7/7 comprovavam DOM, ações, payloads e limites de leitura; não verificavam estilos calculados, expansão do CSS ou aparência. HTTP200/BUILD_ID também não capturam esse defeito. Detector novo `frontendAssetContract.mjs` verifica Document separado de prefetch RSC, CSS/JS200/MIME, Tailwind expandido e estilos calculados; integrado antes dos13casos do smoke de horários/conjuntos. Esses13casos passaram no novo tar extraído limpo. As7provas anteriores continuam válidas para o comportamento testado anteriormente, sem atribuição de nova execução ou aceite visual. Scripts `nomodule` não solicitados pelo Chrome moderno não contam como assets falhos.

### Supervisão permanente: lacuna, correção local e limites

Confirmado no checker instalado após recuperação: `supervision_preflight` executa dois inventários locais sem passar observação root, embora `tracked_absent` já a consuma. Quando um processo novo do mesmo UID é ilegível, a retomada pode terminar78 antes de iniciar Next. Isso é independente do CSS.

[Patch revisável](frontend-layout-audit-20261007/supervision.patch): somente em `unreadable_new_or_changed_process`, obter leitura root nova com cliente adjacente sob `-I -S`, conferir boot/daemon/release/entry/integridade/receipt e passar as duas amostras ao mesmo classificador e aos dois inventários. PID/ticks/ancestrais/grupos/roles/frescor permanecem exigidos; zumbi, sobrevivente, PID divergente, leitura ausente/incompleta negam. Cliente usa cwd `/` na chamada literal para não classificar o próprio leitor pela cwd herdada. Sem alteração de helper, política ou sudoers, sem instalação.

Origem checker **`77817b16a7f760b0b75d514f54df7ef482cbb819d92fa4a6cab48541b7080c6a`** → resultado **`a611e0234e1248629b311ba5f0901d46a933151df12091904efb9281f44036a5`**. Cliente origem **`130e4aba02b055d28ab4857375b43f5e1f79bf3dfe63604c3776d058df44607e`** → resultado **`c5a17c1c109c942d8094d2fe0bbd0b1ca89ca0378baa411b838c949a91bf4f7f`**. Bytes reconstruíveis apenas do Git, conforme `assemble-checker.py`; staging ativo não modificado.

Ensaio dirigido: PM2 6.0.14 cluster→launcher→bootstrap→Next9f reais, Node20, proc/rede isolados; morte do Next real e recuperação por PM2 com nonce/control novos e HTTP200 PASS. Processo Node auxiliar real, **negação local de environ injetada**; leitor root executou observador/syscalls efetivos do namespace, não a instalação sudo da VPS. Checker anterior reproduziu DENY; novo permitiu somente identidade não relevante comprovada. Negativas PASS: executor real na release sobrevivente, privilégio injetadamente indisponível e ticks do daemon divergentes; nenhuma criação de novo control/Next nesses casos. Dois testes simulados do subprocess conferiram comando literal/cwd neutro e diagnóstico privado600 de stdout/stderr/exit. Não reatribuir essas provas à permissão SSH real nem somá-las aos17testes sintéticos anteriores.

**Limite mantido:** política root instalada fixa boot/PID/ticks do daemon. A correção resolve a retomada com o mesmo daemon atestado. Depois de reboot/resurrect com daemon novo, inventário local legível preserva o contrato existente; se precisar da observação privilegiada, política antiga deve negar. Este ensaio não certifica recuperação root nesse cenário nem autoriza relaxamento ou substituição silenciosa de política. A capacidade observacional para daemon novo permanece uma decisão técnica explícita antes de declarar recuperabilidade permanente completa. Nenhuma nova janela está preparada/autorizada por este resultado.

Tentativas de laboratório que falharam por instrumentação foram preservadas: script `nomodule` não solicitado; RSC confundido com Document; PM2_HOME/baseline inicial do harness corrigidos. Elas não recebem PASS e não são defeitos atribuídos ao produto. Composição final reproduzível passou. Próximo passo concreto é revisar receita/detector/patch e esse limite de supervisão; eventual preparação futura deve usar tar corrigido, bindings novos e evidência de acesso aplicável, preservando9f até autorização própria. Agrupamento natural, contingênciaAUTO, CRA-PR e históricos continuam frentes separadas.
