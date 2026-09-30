# Incidente 91230f88 — preparação da correção b66bb89a

**PREPARED / NOT DEPLOYED / INCIDENT OPEN.** Esta preparação não fecha a guarda, não interrompe processos, não aplica firewall nem muda configurações. Decisão final da janela é separada. Fonte de verdade para a causa e alcance: [relatório do incidente](AUTOMATION_RUNTIME_SELF_WRITE_INCIDENT_2026-09-29.md); o procedimento histórico de três processos permanece em [comandos da release anterior](AUTOMATION_RELEASE_COMMANDS_2026-09-29.md). **Nesta troca, o frontend não é reiniciado nem reconstruído.**

## Artefatos e backup preparados

PREP privado na VPS: `/opt/re7online/backups/converta-persistent/preparations/runtime-fix-20260930T020103Z` (modo 700). API isolada: `/opt/re7online/releases/b66bb89aca9112277463b7d2adbee0b9e7831157-api`; worker isolado: `/opt/re7online/releases/worker-bf5f1d76-f06d49cb-91230f88-b66bb89a`. Copiados das releases **efetivamente ativas** ba66c241 e worker mínimo bf5+f06+912, com substituição de somente cinco módulos API e quatro fontes/compilados worker. Nenhum processo usa essas cópias ainda. O frontend ativo continua ba66c241, BUILD_ID `l1eBvPioySXt7NLiuFMkg`.

| Artefato | SHA256 |
| --- | --- |
| Pacote API de 5 módulos + fontes | `17e751ba2652db80050231b95e23d1df052d8fd81d5d45175b3ea372d09b62c7` |
| Pacote worker mínimo de 4 módulos + fontes | `7a06b74b107ae7fab4b02069f233acfef86ce049ad556051b0bcb012989e1b6f` |
| DB fresco (`database.dump`, 23.171.014 bytes) | `69eacbae20089fbecde84905c382020fe75ef60669de3a8f80e39ec7d4b0229d` |
| Arquivo de conteúdo | `413083a841d50f4d85dab34fc8a708fcb6cbd67299fc9b5bf240e7c41d645097` |
| Runtime/auth no filesystem | `f2ea7c047268d41605d519cba13f54cb5c13320d2a5c400bd7a6126597c2184c` |
| Configuração/guarda/saved/cron | `93fdc4b1c11b02caab63eb154f7f394352095c839033359f238534bfd4d57b8e` |
| Retorno API/frontend ba66c241 | `b39ee8b1d7f6add5634cdfc852781ce8f581840901f37dacd5cfa5f1056ea835` |
| Retorno worker mínimo f06+912 | `6faabcc7c17fc8f60463147ffe327dda358b7fc86994c07284cf782d4601ed72` |

Compilados alterados, SHA256 conferidos na release remota (JS):

| Módulo | API b66bb89a | Worker mínimo + b66 |
| --- | --- | --- |
| runtimeWriteFence | `004fc03d06c558c9b6b9874c0eee07de997176465b04400a2480942c69ec4029` | `004fc03d06c558c9b6b9874c0eee07de997176465b04400a2480942c69ec4029` |
| dualWriteStorage | `184a3aa0a353941b36a1f89111035491f0190af233c957670162f7fa9b519cce` | `184a3aa0a353941b36a1f89111035491f0190af233c957670162f7fa9b519cce` |
| webSessionInbound | `e4d589bafa077146c9c9069ff40af8f3223372714b61a4bb595a74c5249faa79` | `cdb9a78affa176f0b1d19c5c3cf23ee654b1b5adf50763576292f0a5c9205e53` |
| webSessionOutboundService | `31feeaf217dd718d2d73470fec46759f3f1c75c68738dfb36ed7c3cfac0cb99a` | `31feeaf217dd718d2d73470fec46759f3f1c75c68738dfb36ed7c3cfac0cb99a` |
| webhook.controller | `f3bd6cd1024ca18ca2872bb3aba5d150b53cc8653033caba82e9e0e7fa9cd208` | fora do worker mínimo |

Manifesto privado `release-preparation.json` confirma 93/93 compilados worker conforme [manifesto versionado](../reviews/runtime-self-write-backport/manifest.json), quatro alterados, e os cinco compilados API correspondentes à fonte b66bb89a. Lockfiles, node_modules, schema Prisma gerado (`75c32a1d4fa67626d991d89d0327749c7ca65edea02e969c5733fd2b2c0dc594`) e symlinks de auth resolvem exatamente como nas releases ativas. CJS privado novo mantém flags/segredos atuais, `watch=false`, Node20, API com `CAMPAIGN_BUILD_ID=b66bb89a`; entrada do frontend é idêntica à vigente. Não há migration.

Backup de 02:06:20–02:08:38 UTC, sem descarte. Catálogos e arquivos compactados testados para leitura; dump copiado com SHA igual e restaurado **somente** no PostgreSQL local 127.0.0.1:55432 em 5,536 s: 60 migrations, checksums sem divergência, 0 jobs/grupos/leases, quatro auth records, uma chave de visibilidade ligada. Banco temporário removido. DB dump consistente; arquivos/auth capturados enquanto vivos não formam snapshot atômico. Recolher estado final privado após saída dos processos; não restaurar auth ou dump sobre produção.

Leitura anterior à preparação: API/worker/frontend online em Node20.20.0; três sessões WEB conectadas, uma desconectada, uma pendente; guarda aberta geração 7, scheduler habilitado, 0 tarefas/jobs/scheduled **naquele instante**. Zero tarefas não demonstra drain futuro nem operações inbound/outbound/auth do worker. Boot `pm2-deploy.service` enabled/inactive; frontend PID 1856062 era o ativo nessa leitura, nunca usar PID fixo na janela. Espaço antes do backup 34,79 GB. Crons atuais igualaram exatamente as cópias pré-janela ensaiadas; `.window` e nft foram copiados, **não aplicados**.

## Janela proposta — comandos sequenciais, somente após decisão final

Deifson executa apenas os blocos `sudo` na própria sessão, sem compartilhar senha. Codex confere cada saída antes do bloco seguinte. Não colar como script único. Configuração e auxiliares privados já estão em PREP; **não executar** `prepare.py`, `backup.py` ou scripts da janela de três processos novamente.

```bash
PREP=/opt/re7online/backups/converta-persistent/preparations/runtime-fix-20260930T020103Z
PM=/home/deploy/.npm-global/bin/pm2
python3 "$PREP/read-state.py" > "$PREP/immediate-before.private.json"
# Conferir versões/PIDs reais, sessões, jobs, guard, scheduler, terceiros e supervisores.
sha256sum "$PREP/database.dump"  # comparar com 69eacbae20089fbecde84905c382020fe75ef60669de3a8f80e39ec7d4b0229d
```

Gate antes de qualquer mutação: releases e CJS ainda íntegros, frontend ba66 intacto, espaço/backup/restauração, um worker proprietário, ausência de outro deploy/backup, configurações e cron inalterados, retorno compatível presente. Trabalho ou incerteza nova exige avaliação; não forçar fila. O manifesto `backup-manifest.json` e `restore-result.json` são as provas efetivas.

```bash
node "$PREP/close.cjs"
# Conferir CLOSED, geração nova, drained=true, tasks=0, ledgerFault=null e fila sem trabalho inesperado.
# Se não comprovar drain, STOP; não iniciar a contenção.
```

Antes da contenção, Deifson confirma sintaxe/tabela ausente; Codex reconfirma guard e versões. O nft ensaiado bloqueia portas 3000/3001, logo a **interface frontend continua rodando, porém fica inacessível durante a barreira**. Atendimento/API e inbound WEB podem sofrer interrupção; não prometer retries íntegros.

```bash
sudo nft --check --file "$PREP/automation-fence.nft"
sudo nft list tables
cmp /etc/cron.d/re7-converta-backup "$PREP/re7-converta-backup.before"
sudo install -o root -g root -m 0644 "$PREP/re7-converta-backup.window" /etc/cron.d/re7-converta-backup
crontab - < "$PREP/deploy.crontab.window"
sudo systemctl disable pm2-deploy.service
sudo nft --file "$PREP/automation-fence.nft"
date -Is
sudo nft list table inet re7_campaign_transition
systemctl show pm2-deploy.service --property=ActiveState,UnitFileState
```

Confirmada barreira, nenhum terceiro/root PM2 capaz de operar e supervisão desabilitada, executar **uma vez** o script preparado. Ele fotografa PIDs/start ticks/descendentes e sockets; usa PM2 `delete` individualmente na API e worker, nunca no frontend. Depois exige saída dos antigos, frontend com mesmo PID/start ticks, ausência dos sockets capturados e zero backends/locks conservadoramente antes de registrar `old-exit-confirmed.json`. Não mata sobrevivente; retorno de erro mantém sucessores proibidos. PM2 pode terminar operação pendente no seu `kill_timeout`: isso **não** é drain gracioso; risco inbound/outbound/auth permanece aceito apenas por decisão do owner.

```bash
python3 "$PREP/stop-pair.py"
# Gate: old-exit-confirmed.json, sem processo/filho/socket antigo; nenhum terceiro.
python3 "$PREP/start-one.py" re7-whatsapp-agent
python3 "$PREP/start-one.py" re7-whatsapp-web-worker
# Gate: PIDs reais novos, somente um proprietário por sessão, hashes e auth atual intactos.
```

Se sobrevivente, lock incerto, terceiro ou divergência: **não iniciar sucessor**; manter contenção, diagnosticar e escalar, sem kill extra, remoção de lock, logout ou retry cego. Escalonar ao owner se contenção alcançar o horizonte que ele definir; prazo não autoriza término forçado. O vínculo individual lock→PID continua não comprovado.

Com API/worker online e identidade correta, atualizar saved/fallback apenas para as versões compatíveis; nenhum restart do frontend. Retirar contenção e validar health/DB, guard CLOSED, worker health, frontend BUILD_ID e sessão privada do owner em Inbox/CRM. O `validate.cjs` preparado pressupõe as contagens pré-janela; divergência exige interpretação, não alteração de dados para conseguir PASS.

```bash
"$PM" save
cp -a /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
cmp /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
sudo nft list table inet re7_campaign_transition
sudo nft delete table inet re7_campaign_transition
date -Is
node "$PREP/validate.cjs"
# Reavaliar fila/scheduler e atendimento; só então restaurar admissões ao estado inicial.
node "$PREP/open.cjs"
cmp /etc/cron.d/re7-converta-backup "$PREP/re7-converta-backup.window"
sudo install -o root -g root -m 0644 "$PREP/re7-converta-backup.before" /etc/cron.d/re7-converta-backup
crontab - < "$PREP/deploy.crontab.before"
sudo systemctl enable pm2-deploy.service
systemctl show pm2-deploy.service --property=ActiveState,UnitFileState
```

Após reabrir, observar tick natural do scheduler e trabalhos novos sem produzir envios para validação. Se candidato falhar, preferir voltar ao par **ba66c241 + worker mínimo f06+912** com DB/auth **atuais**, mantendo guarda fechada e repetindo contenção/barreira para impedir proprietários concorrentes. Esse retorno reintroduz o defeito de loop WEB e não é recuperação funcional dos fluxos; não reenviar resultado incerto. Retorno mais antigo a3+f06 tem garantias e defeitos adicionais descritos no incidente, exige decisão específica. Nunca restaurar dump sobre dados novos.

## Prova funcional que encerra o incidente

Somente após deploy autorizado e estabilidade, Deifson escolhe conversa/controla envio **novo** no Syer, sem replay do final 9614 nem correção retroativa. Registrar horário/IDs técnicos do inbound e do outbound aceito, nó/flow/consentimento persistidos após a primeira resposta 1 ou 2, e uma **resposta seguinte** que avança ao nó esperado sem repetir consentimento. O owner controla conteúdo e momento; nenhum envio é provocado por este plano. Em Syer híbrido, correlacionar WEB principal e dedupe Meta sem duplicidade. Para META_CLOUD puro, exercitar o mesmo avanço em conversa autorizada separada ou marcar **não exercitado**; o caminho é API webhook → provider Meta → persistência de runtime. Caso híbrido API→WEB, conferir roteamento e o runtime pelo transporte efetivo; sem caso autorizado, **pendente**. Erro/resultado incerto não autoriza reenvio. Health, logs e testes locais não encerram o incidente sem essa prova.
