# Release Automação — comandos revisáveis da janela

> Para a correção do incidente 91230f88, **não repetir esta troca histórica de três processos**. Usar o [plano de 30/09](AUTOMATION_RUNTIME_FIX_PREPARATION_2026-09-30.md), que prepara somente API e worker e preserva o frontend ativo.

> Atualização posterior: execução autorizada registrada em [AUTOMATION_ROLLOUT_2026-09-29](AUTOMATION_ROLLOUT_2026-09-29.md). **DEPLOYED / AUTOMATION NOT ACTIVATED.** O conteúdo abaixo preserva a preparação e os gates como histórico; não é autorização para repetir a janela.

Usar junto ao [plano e seus gates](AUTOMATION_RELEASE_PLAN_2026-09-29.md). **Não é autorização de execução.** Trechos são sequenciais e exigem inspeção entre etapas; não colar como script único. Deifson executa sudo na própria sessão. Codex não solicita senha/token. Não executar scripts históricos de swap/prepare sem adaptação: contêm PIDs e releases antigos e terminação expressamente autorizada naquela janela.

## 1. Preparação antes da janela — executada em área isolada

Escolher identificador único; nunca reaproveitar preparação parcial:

```bash
CANDIDATE=ba66c24112ccb10f2dfdcced54350f513d399bc6
WINDOW=automation-AAAAMMDDTHHMMSSZ # substituir por identificador aprovado
PREP=/opt/re7online/backups/converta-persistent/preparations/$WINDOW
API=/opt/re7online/releases/$CANDIDATE
WORKER=/opt/re7online/releases/worker-bf5f1d76-f06d49cb-91230f88
OLD_API=/opt/re7online/releases/a3d16d4bdc4b143deeb6b66d4e963b0b4b3f216b
OLD_WORKER=/opt/re7online/releases/worker-bf5f1d76-f06d49cb-042e386a
OLD_CFG=/opt/re7online/backups/converta-persistent/preparations/secult-20260929T133547Z/secult.ecosystem.config.cjs
PM=/home/deploy/.npm-global/bin/pm2
umask 077
test ! -e "$PREP" && mkdir "$PREP"
test ! -e "$API" && test ! -e "$WORKER"
df -B1 /opt/re7online/backups/converta-persistent
```

Transferir os dois pacotes e manifests locais para PREP somente após autorização de preparação remota. Não trocar symlink atual. Verificar hashes fixados:

```bash
cd "$PREP"
printf '%s\n' \
 'c55822624d31d4afdbd173d5e05533655bbf2672c9bf473147269a038f607455  api-frontend.tar.gz' \
 '86021259868d5be22da5ecf993ac7f2ed866c154349636e113092d61fb9dff9f  worker-minimal.tar.gz' | sha256sum -c -
mkdir "$API" "$WORKER"
tar -xzf api-frontend.tar.gz -C "$API"
tar -xzf worker-minimal.tar.gz -C "$WORKER"
cmp "$API/package-lock.json" "$OLD_API/package-lock.json"
cmp "$API/apps/whatsapp-agent/package-lock.json" "$OLD_API/apps/whatsapp-agent/package-lock.json"
cmp "$WORKER/apps/whatsapp-web-worker/package-lock.json" "$OLD_WORKER/apps/whatsapp-web-worker/package-lock.json"
cp -a "$OLD_API/node_modules" "$API/node_modules"
cp -a "$OLD_API/apps/whatsapp-agent/node_modules" "$API/apps/whatsapp-agent/node_modules"
cp -a "$OLD_WORKER/apps/whatsapp-web-worker/node_modules" "$WORKER/apps/whatsapp-web-worker/node_modules"
```

Conferir todos os arquivos contra `api-frontend-files.json`/`worker-minimal-files.json`, não só tar. Não executar start/prestart/npm install/migration. Resolver symlinks internos de dependências e confirmar que não apontam a fontes mutáveis de outra release; se houver, abortar e preparar cópia isolada. Os manifests de transporte não incluem node_modules: conferir separadamente lockfiles, versões e schema gerado. A leitura atual comprovou compatibilidade, mas não substitui essa verificação após cópia.

Derivar configuração de CJS válido, não do ambiente bruto do PM2. Este comando só grava a configuração nova e não inicia apps:

```bash
node - "$OLD_CFG" "$PREP/candidate.ecosystem.config.cjs" "$API" "$WORKER" <<'JS'
const fs=require('fs'),assert=require('assert');
const [oldFile,out,api,worker]=process.argv.slice(2);
assert(!fs.existsSync(out));
const apps=structuredClone(require(oldFile).apps);
assert.equal(apps.length,3);
for(const app of apps){
 assert(app.env && app.watch===false);
 for(const k of Object.keys(app.env))assert(!k.startsWith('pm_')&&!['pm_id','node_app_instance'].includes(k));
 app.watch=false;app.instances=1;app.exec_mode='fork';app.interpreter='/usr/bin/node';
 if(app.name==='re7-whatsapp-agent'){
  app.cwd=api+'/apps/whatsapp-agent';app.script=app.cwd+'/dist/index.js';
  assert.equal(app.env.CAMPAIGN_OPERATIONS_FILE,'/var/lib/re7/campaign-operations/state.json');
  app.env.CAMPAIGN_BUILD_ID='ba66c24112ccb10f2dfdcced54350f513d399bc6';
 }else if(app.name==='re7-whatsapp-web-worker'){
  app.cwd=worker+'/apps/whatsapp-web-worker';app.script=app.cwd+'/dist/whatsapp-web-worker/src/index.js';
 }else if(app.name==='re7-admin-front'){
  app.cwd=api;app.script=api+'/node_modules/next/dist/bin/next';
 }else throw Error('unexpected app');
 assert(fs.existsSync(app.script));
}
fs.writeFileSync(out,'module.exports = '+JSON.stringify({apps},null,2)+';\n',{mode:0o600,flag:'wx'});
console.log('configuration resolved; no app started; environment not printed');
JS
```

Antes de usar: comparar a configuração antiga com `/proc` do processo REAL para garantir que continua sendo a vigente; o comando não presume isso. Preservar scheduler atual, topology/hostId, caminho da guarda, segredos, storage e media. Se `.data` for relativo, reproduzir somente o vínculo para o armazenamento persistente atualmente resolvido e conferido, sem copiar auth antigo. Guardar configuração de retorno e saved/fallback privados. Inspeção isolada adicional deve comprovar script/cwd/interpreter/build/public API base e variáveis críticas sem imprimi-las.

## 2. Backup fresco e restauração isolada — gate obrigatório

Sem outro pg_dump/pg_restore/retention concorrente; nenhum arquivo existente sobrescrito. Rechecar espaço para DB + conteúdo + runtime + configuração + dependências de retorno com margem. Usar rotinas de captura do último runbook adaptadas aos diretórios OLD_API/OLD_WORKER atuais, nunca aos e8/checkouts antigos hardcoded:

```bash
test ! -e "$PREP/database.dump"
docker exec wa-agent-postgres pg_dump -U wa_agent -d whatsapp_agent -Fc > "$PREP/database.dump"
docker exec -i wa-agent-postgres pg_restore --list < "$PREP/database.dump" > "$PREP/database.catalog"
sha256sum "$PREP/database.dump" "$PREP/database.catalog" > "$PREP/database.sha256"
cp -a "$OLD_CFG" "$PREP/active.ecosystem.config.cjs"
cp -a /home/deploy/.pm2/dump.pm2 "$PREP/dump.pm2.before"
cp -a /home/deploy/.pm2/dump.pm2.bak "$PREP/dump.pm2.bak.before"
crontab -l > "$PREP/deploy.crontab.before"
cp /etc/cron.d/re7-converta-backup "$PREP/re7-converta-backup.before"
tar -czf "$PREP/guard.private.tar.gz" -C /var/lib/re7 campaign-operations
```

Capturar também `/opt/re7online/content`, destinos REAIS de `.data`/auth/API/worker, configs privadas e dependências/releases anteriores conforme recipe `backup.py` da última janela. Especificar os destinos resolvidos no manifesto antes de tar; não arquivar só o symlink nem coletar diretórios por suposição. Nenhum conteúdo desses arquivos no Git/chat. Guardar catálogo/hash/tamanho/duração de cada componente. Captura viva não é snapshot atômico; preservar segunda captura final de guarda/auth depois da saída, sem substituí-la no runtime.

Copiar o dump para máquina local e conferir o mesmo hash; DB isolado NOVO, sem executar app:

```bash
# Somente na máquina local, com PostgreSQL isolado em 127.0.0.1:55432.
RESTORE_DB=re7_release_restore_AAAAMMDD_HHMMSS # nome novo, nunca produção
createdb -h 127.0.0.1 -p 55432 "$RESTORE_DB"
pg_restore -h 127.0.0.1 -p 55432 -d "$RESTORE_DB" --no-owner --no-acl --exit-on-error /caminho/local/database.dump
psql -h 127.0.0.1 -p 55432 -d "$RESTORE_DB" -X -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;'
```

Conferir 60 migrations e contagens/flags capturadas do mesmo dump. Medir duração e espaço. Não limpar backups/DB para fazer passar. Restaurar dump N não comprova restauração de dump N+1. Definir fim de janela/margem de retorno depois dessa medição.

## 3. Guarda e contenção — só após aprovação final

Ações da guarda usam GET/POST `/admin/ops/campaign-execution`, token lido dentro do processo a partir do CJS privado válido. Nunca colar token. Adaptar os clientes close/open já usados: leitura de geração atual, motivo auditável da nova janela, comparação de build esperado e fila atual; não reutilizar geração5 como constante. Corpo do fechamento:

```json
{"open":false,"generation":"VALOR_NUMERICO_DO_GET_ATUAL","reason":"Owner-authorized release ba66c241 + worker minimal 91230f88; WINDOW"}
```

O exemplo explicita que generation é número, não a string ilustrativa. Após POST autorizado, consultar repetidamente o diagnóstico existente: closed, drained=true, tasks=0, fault=null. Pendências impedem parada; timeout só escala. Salvar resposta sanitizada + ledger/auxiliares privados. **Esses clientes não foram executados nesta preparação.** Scheduler fica como estava; não editar a flag para obter drain. Trabalho novo exige decisão.

Preparar cópias `.window` dos crons comentando exclusivamente jobs concorrentes conforme runbook, preservando cron original. Barreira futura, após validação de sintaxe e tabela ausente:

```nft
table inet re7_campaign_transition {
 chain api_input {
  type filter hook input priority -10; policy accept;
  tcp dport { 3000, 3001 } counter reject with tcp reset
 }
}
```

```bash
sudo nft --check --file "$PREP/automation-fence.nft"
sudo nft list tables
# Gate: tabela ainda ausente, drain comprovado, configs/backup/retorno revisados.
cmp /etc/cron.d/re7-converta-backup "$PREP/re7-converta-backup.before"
sudo install -o root -g root -m 0644 "$PREP/re7-converta-backup.window" /etc/cron.d/re7-converta-backup
crontab - < "$PREP/deploy.crontab.window"
sudo systemctl disable pm2-deploy.service
sudo nft --file "$PREP/automation-fence.nft"
date -Is
sudo nft list table inet re7_campaign_transition
```

Saved/fallback devem ser preservados e mantidos sob controle: não executar resurrect/reboot enquanto apontarem para apps antigos. Não iniciar/alterar daemon PM2 root; inesperado filho dele bloqueia a janela.

## 4. Troca individual e barreira de saída

Capturar imediatamente PIDs, start ticks, árvore completa/descendentes e inodes de sockets das três aplicações, backends/locks de sessão e supervisores. Não usar PIDs de 29/09 como constantes. Reconfirmar que os donos não podem reaparecer por boot, saved, cron ou intervenção externa.

```bash
# Só com decisão expressa sobre o risco worker e término configurado pelo PM2.
"$PM" delete re7-whatsapp-agent
"$PM" delete re7-whatsapp-web-worker
"$PM" delete re7-admin-front
```

PM2 pode terminar após kill_timeout: esse comportamento faz parte do risco a aprovar, não drain. Se qualquer processo capturado continuar vivo, **STOP**; não executar SIGKILL extra automaticamente. Usar o verificador de start ticks/descendentes do procedimento anterior adaptado ao snapshot atual e consultar sockets correspondentes. Sua lógica deve somente ler, não repetir o `swap.py` histórico que continha kill de sobreviventes.

Barreira DB do procedimento realmente executado (não mata sessões):

```bash
docker exec -i wa-agent-postgres psql -X -U wa_agent -d whatsapp_agent -Atq -v ON_ERROR_STOP=1 <<'SQL'
BEGIN READ ONLY;
SET LOCAL statement_timeout='10s';
SELECT json_build_object(
 'otherClientBackends',(SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend' AND pid<>pg_backend_pid()),
 'advisoryLocks',(SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND database=(SELECT oid FROM pg_database WHERE datname=current_database())));
ROLLBACK;
SQL
```

Exigir zero na barreira conservadora e saída de todos os processos/sockets capturados. Se outro cliente legítimo impedir zero, identificar por leitura e submeter decisão; não matar sessão alheia nem afrouxar a barreira por conveniência. Lock liberado sozinho não prova que socket antigo parou. A lacuna prévia de lock→PID não pode ser preenchida por suposição. Capturar auth/runtime final privado após saída e antes do sucessor; não restaurar auth, não fazer logout/limpeza.

Somente após gate comprovado:

```bash
"$PM" start "$PREP/candidate.ecosystem.config.cjs" --only re7-whatsapp-agent
# Gate: API real ba66c241, guarda CLOSED, scheduler igual ao inicial, health/DB.
"$PM" start "$PREP/candidate.ecosystem.config.cjs" --only re7-whatsapp-web-worker
# Gate: um proprietário, identidade/hashes worker mínimo, sessões/auth sem regressão.
"$PM" start "$PREP/candidate.ecosystem.config.cjs" --only re7-admin-front
# Gate: build l1eBvPioySXt7NLiuFMkg, links/API e atendimento.
```

Validar `/proc` cwd/exe/script, hashes, CJS e variáveis permitidas sem imprimir segredos. Nunca validar somente nome PM2. Flag Automação deve continuar false/ausente em todos os tenants; divergência não autoriza update SQL. Nenhum envio/fixture produtiva para testar.

## 5. Supervisão e retomada

Só depois das verificações de identidade/health/guard/sessões e snapshot de referência compatível:

```bash
"$PM" save
cp -a /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
cmp /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
sudo nft list table inet re7_campaign_transition
sudo nft delete table inet re7_campaign_transition
date -Is
```

Owner confirma Inbox/CRM/auth em sessão própria, apenas leitura. Recontar fila; restaurar admissões ao estado inicial pelo POST auditado com geração atual somente se contemplado na autorização e seguro. Observar tick natural. Se falha/incerteza, manter fechadas e avaliar, não matar provider/retry. Retomar crons/supervisão somente com referências compatíveis:

```bash
cmp /etc/cron.d/re7-converta-backup "$PREP/re7-converta-backup.window"
sudo install -o root -g root -m 0644 "$PREP/re7-converta-backup.before" /etc/cron.d/re7-converta-backup
crontab - < "$PREP/deploy.crontab.before"
sudo systemctl enable pm2-deploy.service
systemctl show pm2-deploy.service --property=ActiveState,UnitFileState
```

Scripts escritores manuais devem usar a API ba66; os jobs históricos de backup/retention não são escritores do config JSON, mas revisar caminhos antes de restaurar. Não reativar executores de código obsoleto por restore de cron/saved. Parar com código novo e chave desligada.

## 6. Retorno compatível

Se necessário retornar binários: mesma contenção e barreira de saída antes de iniciar o par anterior por `"$PM" start "$PREP/return.ecosystem.config.cjs" --only <nome>`, sequencialmente. Configuração de retorno precisa estar conferida contra releases a3/minimal-f06; não apontar checkout do worker como API. Salvar/fallback novamente só após identidade verificada. Usa DB e auth ATUAIS; sem restore/down/reset. Reintroduz defeito 91230f88 e nega BOT na API antiga; não equivale a revogar a chave mantendo código corrigido. Nunca voltar a escritor pré-f06/5ee/e8 neste plano.

**Preparação/configuração remota, backup e restauração isolada executados**, conforme [resultado](AUTOMATION_RELEASE_PREPARATION_2026-09-29.md). Seções3–6 não executadas. PREP efetivo `automation-20260929T220203Z`; não repetir criação/cópia sobre esses arquivos. Configuração de retorno efetiva `return.ecosystem.config.cjs`. Banco temporário de verificação removido; backups preservados. Janela e risco worker ainda exigem decisão final.
