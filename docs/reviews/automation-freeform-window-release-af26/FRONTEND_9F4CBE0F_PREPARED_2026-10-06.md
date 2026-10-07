# Frontend 9f4cbe0f — preparação isolada, 06/10/2026 Fortaleza

**PREPARED FOR REVIEW / NOT DEPLOYED.** Preparação remota nova: `/opt/re7online/backups/converta-persistent/preparations/frontend-9f4cbe0f-20261007T012803Z`. Gate `execution-authorized=false`. Nenhuma parada/start produtivo, contenção, mudança de guarda/scheduler/cron/boot, API/worker, tenant, DB/auth ou histórico. Esta publicação documental não altera o candidato `9f4cbe0f9a4e891f09bb2f41e88eccec388172da`.

## Auditoria e baseline

Consultados [runbook](../../RUNBOOK_WHATSAPP_AGENT.md), [topologia](../../DEPLOY_TOPOLOGY_RE7.md), procedimento PM2, [contrato de build](FRONTEND_BUILD_CONTRACT.md), contratos de Composer/Result Truth/agendamento e [correção visual](CAMPAIGN_PROGRESS_VISUAL_LOCAL_2026-10-06.md). O procedimento genérico de checkout/build/restart in-place não se aplica: usar release isolada e parada individual do frontend, como nas atualizações anteriores. Não importar stop-pair, V4 DB ownership, firewall, fechamento de campanhas ou interrupção de sessões para uma troca de apresentação.

HEAD remoto confirmado `9f4cbe0f9a4e891f09bb2f41e88eccec388172da` antes da preparação. Contra af26, apenas `page.tsx` e `campaignPresentation.ts` são delta executável frontend; os outros dois arquivos em src são testes. Next config, public, dependências e lockfile não mudaram. Compatível com os mesmos GETs autenticados de lista/detalhe da API atual; nenhum campo/endpoint/RBAC novo.

Leitura produtiva 07/10 ~01:27 UTC (06/10 ~22:27 Fortaleza):

| Processo | Release / identidade | Estado |
| --- | --- | --- |
| Frontend | af26-front, PID2537692/ticks2081554427, BUILD_ID `J5cHyVKiKEI5xxiGBY5If` | online, restart0 |
| API | afbb7455-api, PID3153929/ticks2107666112 | online, restart0, health/DB ok |
| Worker | worker-minimal-reactive-afbb7455-verified, PID3154150/ticks2107666513 | online, restart0 |
| PM2 daemon | PID18676/ticks222727 | identidade capturada |

Saved/fallback apontam para essas três releases. Boot inactive/enabled; crons identificados são backup/retention/media, não inicializam frontend. Fontes Nginx legíveis preservam `/agent-api/` e realtime diretamente na API3001, demais rotas no frontend3000. Não foi executado nginx -T privilegiado nem corrigida configuração histórica duplicada. Nenhum npm/build/checkout em diretório ativo. Leitura não certifica que outro operador não intervirá futuramente: execução única e suspensão de deploys/resurrect manuais devem ser reconfirmadas antes da troca.

## Artefato exato e proveniência

Build funcional anterior era sintético, sem os parâmetros públicos preservados; não foi promovido como build produtivo. Fontes/configs finais foram copiadas e comparadas byte a byte com o candidato; build de preparação Node20.20.0/Next16.1.5 webpack usou ambiente allowlisted, sem backend env/providers. Valores atuais de webchat e Meta signup preservados privadamente; base browser ausente mantém `/agent-api`. Rewrites preservados: `/public-api/*` → localhost3001; `/agent-api` continua Nginx. Parâmetros públicos encontrados nos compilados sem expor valores.

Lockfile candidato e ativo: `add66bbb579b4c2424746ccd26b7a41ec24faecf77d324447b9f8b463c73726a`. Não instalado/upgraded pacote incidentalmente. Runtime Node da VPS20.20.0, igual ao ensaio.

| Item | Identificador completo |
| --- | --- |
| Tar final `frontend-9f4cbe0f-v2.tar.gz` | SHA256 `d0f15209922741e51ab21e22d01ff2188ce212ef23081888084c868754065e54`, 173.620.400 bytes |
| Manifesto completo interno `manifest.json` | SHA256 `ba6b43c2c550c5926893e12b5620b59d144e0cd91890b978171656b284422eba` |
| BUILD_ID candidato | `LFcdEK9gXZsBhf4_c5r8G` |
| Config privada candidata | SHA256 `5683dfbd304f3db408b7616e4c38fcd3bb20aceb7d2658c3e441602d3bcd7918` |
| Config privada retorno | SHA256 `61d9cb573313339b0c2d4d436905f0824de79eb90663de1540dddca192da557d` |
| Inventário privado da release af26 de retorno | SHA256 `4661dc9d08da2bc06761f4dd0fd323e7e8292ea74589c7dbcc697b652a34df51` |
| Verificador do tar extraído | SHA256 `8a8aab3aeed1560d25892dcc99fc40e5d6666cb272dba550c20657f125259b38` |
| Gate somente leitura frontend-check.py | SHA256 `130d70ab62d7867b930279774d01ea791d614a63810d882eccfc494b51d54c12` |

22.784 arquivos e 31 symlinks internos, manifesto de conteúdo/permissões/links e inventário exaustivo. Inclui `.next` sem cache de build, public, node_modules completo autocontido, Next config, package/lock/tsconfig/next-env; nenhum env secreto/config PM2 dentro do tar. Não usar árvore de desenvolvimento ou npm install na execução. Asset estático antigo:73 arquivos preservados, colisões aceitas somente com conteúdo igual. Primeiro tar tinha permissões incompatíveis com extração segura: preservado como preliminar; somente V2 é candidato. Os compilados não foram reconstruídos por essa normalização.

Release candidata extraída e verificada na VPS, **não iniciada**: `/opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front`. Retorno existente íntegro inventariado: `/opt/re7online/releases/af26f48a9c309b24ec4d23cfa97cc1e407c09d98-front`; não reembalado/reconstruído. Preservar ambos e configurações privadas. Backup operacional de saved/fallback será capturado antes da troca; não há write DB nesta release nem motivo para restaurar dump. Retorno de frontend não restaura DB/auth.

## Verificações executadas e limites

- Build com parâmetros preservados: PASS. Extração limpa, hashes/permissões/symlinks e inventário: PASS local/VPS.
- Inicialização do tar exato Node20.20.0: PASS em isolamento; primeiro startup local ready647ms (não estimativa garantida para VPS). Pacote também extraído limpo fora da árvore de desenvolvimento, com ambiente vazio: startup e GET login/converta PASS; 513 carregamentos de módulos observados, zero módulo carregado fora do pacote. Cache de imagens criado pelo Next durante leitura é runtime gerado, não integra o tar original; manifesto estrito é conferido antes do start. Nenhum serviço backend/provider iniciado.
- Página real e Chrome:10/10 PASS com autenticação/APIs sintéticas e polling controlado; sem envio. GET login/converta locais PASS. Prova anterior59 testes reutilizada, não atribuída como nova execução. Tipagem integral22 diagnósticos da base permanece limitação.
- Gate `before` executado por leitura na VPS: PASS, API/worker/daemon/af26 identificados; captura privada arquivada como `source-tree.preparation-read.private.json` e `source-tree.final-preparation-read.private.json`, deixando a futura captura livre. Gates exited/candidate/return são comandos revisáveis, **não exercitados produtivamente**. Não implementar recuperação automática por causa de diagnóstico melhor.
- Sessão autenticada produtiva após a futura troca, parada/start/retorno PM2 e checks visuais com registros reais: PENDING. Startup/bundles isolados não são aceite do owner nem janela executada.

## Abas abertas e sessões

Sessão permanece em sessionStorage/localStorage e é validada pela API, que não reinicia/revoga tokens nesta troca. Abrir/recarregar não migra tenant nem concede permissão. Abas antigas mantêm JS af26 e seu defeito até reload; assets antigos no candidato permitem lazy loads antigos sem depender da árvore af26. Nenhum `use server` foi encontrado em src; não prometer compatibilidade universal RSC/framework nem consertar avisos Server Action preexistentes. Reload normal é o procedimento de atualização; não limpar storage/cookies nem forçar logout. Outras abas devem ser recarregadas antes de confirmar a correção.

Retorno só para af26 poderá remover URLs exclusivas do bundle novo: uma aba com bundle candidato pode precisar reload para recuperar um lazy chunk. Cache local já recebido não prova disponibilidade no servidor. Falha de carregamento → capturar diagnóstico privado e recarregar, sem repetir ações de envio. Durante stop/start podem falhar navegação/SSR/assets; Inbox já aberta usa API/realtime diretamente e backend continua, mas não se promete ausência de impacto em cada requisição.

## Comandos revisáveis — NÃO executar nesta preparação

Nenhum sudo, helper/política V4 ou novo privilégio necessário. Responsável: deploy/Codex em execução única; owner disponível para leitura funcional. Reconfirmar antes da autorização efetiva: hashes, ambiente/config, frontend/API/worker/daemon iguais ao baseline, ausência de outro deploy, release retorno íntegra, gate e captura nova. Drift invalida a preparação: diagnosticar antes de stop, não adaptar binding silenciosamente.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-9f4cbe0f-20261007T012803Z
R=/opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front
PM=/home/deploy/.npm-global/bin/pm2
export PATH=/usr/bin:/bin:/home/deploy/.npm-global/bin
# O gate permanece false nesta etapa; habilitação só na execução autorizada futura.
test "$(cat "$P/execution-authorized")" = true
test "$(sha256sum "$P/frontend-9f4cbe0f-v2.tar.gz" | cut -d' ' -f1)" = d0f15209922741e51ab21e22d01ff2188ce212ef23081888084c868754065e54
python3 "$P/verify-package.py" "$R" ba6b43c2c550c5926893e12b5620b59d144e0cd91890b978171656b284422eba
test "$(sha256sum "$P/candidate.ecosystem.config.cjs" | cut -d' ' -f1)" = 5683dfbd304f3db408b7616e4c38fcd3bb20aceb7d2658c3e441602d3bcd7918
test "$(sha256sum "$P/return.ecosystem.config.cjs" | cut -d' ' -f1)" = 61d9cb573313339b0c2d4d436905f0824de79eb90663de1540dddca192da557d
test "$(sha256sum "$P/frontend-check.py" | cut -d' ' -f1)" = 130d70ab62d7867b930279774d01ea791d614a63810d882eccfc494b51d54c12
test "$(sha256sum "$P/verify-package.py" | cut -d' ' -f1)" = 8a8aab3aeed1560d25892dcc99fc40e5d6666cb272dba550c20657f125259b38
python3 "$P/frontend-check.py" before
cp -n /home/deploy/.pm2/dump.pm2 "$P/saved.before.private.json"
cp -n /home/deploy/.pm2/dump.pm2.bak "$P/fallback.before.private.json"
date -Is
"$PM" stop re7-admin-front
python3 "$P/frontend-check.py" exited
"$PM" delete re7-admin-front
"$PM" start "$P/candidate.ecosystem.config.cjs" --only re7-admin-front
python3 "$P/frontend-check.py" capture-current
python3 "$P/frontend-check.py" candidate
curl -fsS --max-time 5 http://127.0.0.1:3000/app/login > "$P/login.after.private.html"
curl -fsS --max-time 5 http://127.0.0.1:3001/health > "$P/api.after.private.json"
# Conferir owner e matriz abaixo; somente depois persistir a referência compatível.
"$PM" save
cp /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
python3 "$P/frontend-check.py" candidate
date -Is
```

Não repetir starts para diagnosticar. `exited` exige ausência dos PIDs capturados/descendentes e sockets anteriores, sem listener3000; PID reutilizado, daemon/core divergente ou observação incompleta negam. R/S não são identidade. Capturas não são removidas nem reusadas. Validar os hashes dos dois scripts publicados antes de executá-los. Gate readonly não substitui a decisão de autorização nem promete atomicidade contra operador paralelo.

Retorno se candidato identificado falhar no startup/HTTP/owner: preservar stdout/stderr/exit privado, parar somente esse frontend e provar saída antes do sucessor. Se capture-current ainda não foi feito, fazê-lo uma vez com candidato vivo identificado; se candidato caiu antes de haver identidade/captura suficiente, **bloquear start de retorno até investigação comprovar ausência**, sem inferir por porta fechada/PID0. Não prometer recuperação automática dessa situação. API/worker devem continuar iguais em todos os gates.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-9f4cbe0f-20261007T012803Z
PM=/home/deploy/.npm-global/bin/pm2
export PATH=/usr/bin:/bin:/home/deploy/.npm-global/bin
# candidate-tree.private.json capturado e preservado antes de encerrar candidato.
test -s "$P/candidate-tree.private.json"
"$PM" stop re7-admin-front
python3 "$P/frontend-check.py" candidate-exited
"$PM" delete re7-admin-front
"$PM" start "$P/return.ecosystem.config.cjs" --only re7-admin-front
python3 "$P/frontend-check.py" return
curl -fsS --max-time 5 http://127.0.0.1:3000/app/login > "$P/login.return.private.html"
# Confirmar owner, API/worker inalterados, então salvar referência de retorno.
"$PM" save
cp /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
python3 "$P/frontend-check.py" return
```

Aborto pré-stop: nenhuma troca; guardar diagnóstico e manter original. Falha de gate de saída/identidade: não iniciar sucessor, não kill/bypass, comunicar imediatamente. HTTP pode ser relido limitadamente (até3 leituras, sem restart) para distinguir indisponibilidade transitória de persistente; erro persistente após candidato vivo leva ao retorno acima. Horizonte15 minutos: escalonar estado e bloqueio, não autorização para relaxar gates. Estimativa de indisponibilidade: intervalo stop→startup/conferência, não medido na VPS; nenhuma duração garantida. Guard/scheduler/crons/boot/barreira permanecem intocados; saved/fallback só mudam após conjunto validado.

## Conferência pós-troca, somente leitura

| Caso existente | Conferência esperada | Evidência a registrar |
| --- | --- | --- |
| Sessão/Inbox/CRM | reload preserva acesso/tenant autorizado | relato owner + ausência de erro novo |
| Campanhas CRM/CSV aceitas | resultados terminais reais continuam corretos | IDs/horários privadamente; sem novo envio |
| Fila imediata, se existir naturalmente | Na fila de envio; Enviando, sem horário inventado | snapshot e GET do mesmo ID |
| Agendamento futuro existente, se houver | data/horário salvos, aba Agendadas | UI vs scheduledAt |
| Processamento natural existente | atualização e terminal/falha/parcial | GETs novos e UI; sem provocar job |
| Troca de detalhe | resposta anterior não substitui ID atual | observação owner, leitura somente |
| API/worker preservados | mesmos PIDs/ticks/releases/restarts | gates e health/DB |

Caso sem fila/futuro/processamento natural fica NOT EXERCISED produtivamente; usar provas isoladas sem criar campanha para obter PASS. Agrupamento, audiência dinâmica, agendamento real, contingência Auto e CRA-PR continuam pendentes. Avulso b9/CRM estático imediato afbb/CSV individual imediato afbb mantêm seus aceites limitados. Frontend preparado não amplia esses aceites.
