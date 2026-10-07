# Frontend 9f4cbe0f — preparação isolada, 06/10/2026 Fortaleza

**LOCAL OPERATIONAL VALIDATED / PREPARED FOR REVIEW / NOT DEPLOYED.** Revisão operacional 07/10/2026 sobre `a92c7f26`: somente recuperação de saída precoce e prontidão limitada. Scripts novos ainda não foram copiados à VPS; o staging remoto mantém os bytes de a92c7f26 e não deve executar os comandos anteriores.  Preparação remota nova: `/opt/re7online/backups/converta-persistent/preparations/frontend-9f4cbe0f-20261007T012803Z`. Gate `execution-authorized=false`. Nenhuma parada/start produtivo, contenção, mudança de guarda/scheduler/cron/boot, API/worker, tenant, DB/auth ou histórico. Esta publicação documental não altera o candidato `9f4cbe0f9a4e891f09bb2f41e88eccec388172da`.

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
| Gates/frontend private controls frontend-check.py | SHA256 `48e0b85264b41ef1d5af8d588c03658b9783c99c17c0f739740e5914bf574012` |

22.784 arquivos e 31 symlinks internos, manifesto de conteúdo/permissões/links e inventário exaustivo. Inclui `.next` sem cache de build, public, node_modules completo autocontido, Next config, package/lock/tsconfig/next-env; nenhum env secreto/config PM2 dentro do tar. Não usar árvore de desenvolvimento ou npm install na execução. Asset estático antigo:73 arquivos preservados, colisões aceitas somente com conteúdo igual. Primeiro tar tinha permissões incompatíveis com extração segura: preservado como preliminar; somente V2 é candidato. Os compilados não foram reconstruídos por essa normalização.

Release candidata extraída e verificada na VPS, **não iniciada**: `/opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front`. Retorno existente íntegro inventariado: `/opt/re7online/releases/af26f48a9c309b24ec4d23cfa97cc1e407c09d98-front`; não reembalado/reconstruído. Preservar ambos e configurações privadas. Backup operacional de saved/fallback será capturado antes da troca; não há write DB nesta release nem motivo para restaurar dump. Retorno de frontend não restaura DB/auth.

## Verificações executadas e limites

- Build com parâmetros preservados: PASS. Extração limpa, hashes/permissões/symlinks e inventário: PASS local/VPS.
- Inicialização do tar exato Node20.20.0: PASS em isolamento; primeiro startup local ready647ms (não estimativa garantida para VPS). Pacote também extraído limpo fora da árvore de desenvolvimento, com ambiente vazio: startup e GET login/converta PASS; 513 carregamentos de módulos observados, zero módulo carregado fora do pacote. Cache de imagens criado pelo Next durante leitura é runtime gerado, não integra o tar original; manifesto estrito é conferido antes do start. Nenhum serviço backend/provider iniciado.
- Página real e Chrome:10/10 PASS com autenticação/APIs sintéticas e polling controlado; sem envio. GET login/converta locais PASS. Prova anterior59 testes reutilizada, não atribuída como nova execução. Tipagem integral22 diagnósticos da base permanece limitação.
- Gate `before` executado por leitura na VPS: PASS, API/worker/daemon/af26 identificados; captura privada arquivada como `source-tree.preparation-read.private.json` e `source-tree.final-preparation-read.private.json`, deixando a futura captura livre. Gates exited/candidate/return são comandos revisáveis, **não exercitados produtivamente**. Os ensaios operacionais novos estão delimitados abaixo; não constituem recuperação automática produtiva.
- Sessão autenticada produtiva após a futura troca, parada/start/retorno PM2 e checks visuais com registros reais: PENDING. Startup/bundles isolados não são aceite do owner nem janela executada.

## Abas abertas e sessões

Sessão permanece em sessionStorage/localStorage e é validada pela API, que não reinicia/revoga tokens nesta troca. Abrir/recarregar não migra tenant nem concede permissão. Abas antigas mantêm JS af26 e seu defeito até reload; assets antigos no candidato permitem lazy loads antigos sem depender da árvore af26. Nenhum `use server` foi encontrado em src; não prometer compatibilidade universal RSC/framework nem consertar avisos Server Action preexistentes. Reload normal é o procedimento de atualização; não limpar storage/cookies nem forçar logout. Outras abas devem ser recarregadas antes de confirmar a correção.

Retorno só para af26 poderá remover URLs exclusivas do bundle novo: uma aba com bundle candidato pode precisar reload para recuperar um lazy chunk. Cache local já recebido não prova disponibilidade no servidor. Falha de carregamento → capturar diagnóstico privado e recarregar, sem repetir ações de envio. Durante stop/start podem falhar navegação/SSR/assets; Inbox já aberta usa API/realtime diretamente e backend continua, mas não se promete ausência de impacto em cada requisição.

## Correção operacional sobre a92c7f26 — 07/10

A captura tardia tinha uma corrida: o Next podia sair antes de `capture-current`. Um launcher operacional sem privilégios registra PID/start ticks/grupo/sessão do próprio processo e do filho Node **antes de liberar o código Next**. Um nonce exclusivo liga PM2, configuração privada, journal e release/entry SHA/BUILD_ID. O bootstrap espera IPC antes de importar o entrypoint preservado. Isso muda a forma de inicialização preparada (PM2 → launcher → Node/Next), não os compilados, tar, dependências, API ou worker. O retorno af26 usa a mesma forma supervisionada.

O launcher faz um único fork. Se o filho termina, registra o resultado e permanece supervisionado sem lançar outro Next. PM2 online isoladamente deixa de significar aplicação saudável: todos os gates validam também o filho. Reinício do launcher/daemon, PID reutilizado, zumbi, duplicação ou journal incompleto negam. O start tem intent exclusivo antes da chamada PM2; sucesso, erro ou timeout não autorizam repetir. Uma falha anterior ao registro do filho continua bloqueada por falta de prova: não se inventa identidade.

Antes do retorno, parar somente o frontend e exigir: PIDs registrados ausentes (PID reaproveitado nega), duas observações consecutivas consistentes do inventário de processos, nenhum executor pelo nonce/cwd/entry/grupo, nenhum listener3000 e nenhum socket da captura tardia sobrevivente, quando esta existe. A captura tardia é complementar; sua ausência já não impede a recuperação do filho que teve identidade registrada antes da execução. O inventário inclui descendentes órfãos com marker/grupo/cwd, não somente filhos ainda ligados ao parent. Porta fechada/PID0 nunca certificam saída.

O primeiro ensaio negou leitura EACCES de um processo local preexistente; a evidência foi preservada. A única exceção é um PID/start ticks observado antes do lançamento, anterior ao launcher e fora de seu grupo; essa identidade não pode ser um descendente novo. Processos novos/alterados, árvore incompleta ou observação ambígua negam. Não há exclusão genérica por nome/UID/contagem. Esse inventário não é garantia atômica contra intervenção paralela nem cobertura de código arbitrário que deliberadamente apague todos os vínculos; pressupõe os executáveis fixados e execução única. Não há kill adicional no procedimento.

Prontidão: no máximo30 tentativas e30 segundos de orçamento monotônico, pausa de até1s, GET `/app/login` com timeout até1s e PM2 jlist até3s, sempre limitado ao orçamento restante. Identidade/saída rejeitada imediatamente; pendência de bootstrap ou HTTP indisponível só aguarda dentro desse limite. Identidade é revalidada depois do HTTP200. O wrapper tem teto40s para a etapa (inclui precheck PM2); demais comandos15s. Há JSONL privado por tentativa e arquivos privados por comando com stdout/stderr/exit code/timeout; console divulga apenas etapa/resultado/nome do registro. Nenhum restart faz parte da espera. Uma recusa exige avaliar o estado, não repetir a etapa cegamente.

### Ensaios novos, sem produção

Node20.20.0/PM2 6.0.14, fork real, PM2_HOME separado e sockets HTTP reais. `frontend-check.py` é importado sem substituir validadores; somente paths, porta e CLI são redirecionados ao laboratório. API/worker são Node stand-ins sem DB/provider, usados para provar identidade preservada; não são provas funcionais desses componentes. nft/systemd não são chamados, pois não fazem parte da troca frontend.

| Cenário operacional | Resultado observado |
| --- | --- |
| Ida normal e retorno | PASS: pronto, identidade/saída, um filho por lançamento, retorno pronto |
| Startup HTTP lento (2,2s) | PASS: aguarda sem segundo start; retorno PASS |
| Filho encerra com exit9 antes de capture-current | DENY prontidão por application_ended; captura tardia ausente; ausência comprovada e retorno PASS |
| Descendente detached com socket em porta diferente3000 | DENY prontidão; executor_survived bloqueia retorno; nenhum sucessor iniciado |
| HTTP503 persistente | DENY por prazo/tentativas; ausência comprovada e retorno PASS; ensaio reduzido2s/4 tentativas usa a mesma função, não comprova duração30s |
| PM2 recusa config inexistente | DENY: stderr/stdout/exit preservados em arquivo0600; repetição de intent recusada antes do PM2 |
| Pacote Next exato preservado, via launcher | PASS login HTTP/identidade/captura/saída; retorno com fixture Node |

O ensaio com o tar Next usa a extração limpa já preservada, fora da árvore de desenvolvimento. O retorno **af26 completo não foi iniciado no laboratório**; sua forma PM2/Node foi ensaiada com fixture e a release af26 mantém a verificação anterior de inventário. Não transformar essa distinção em PASS produtivo. Falhas preliminares de EACCES e da asserção do nome de timeout permanecem privadas; o prazo negou corretamente e a asserção foi corrigida. Os testes funcionais anteriores59/10 e limitações22 tsc não foram reexecutados ou atribuídos a esses cenários.

Reprodução (paths são os binários preservados do laboratório, não instalações novas):

```bash
LAB_EVIDENCE_DIR=local-evidence/frontend-9f4cbe0f-prepared/reproduction-private python3 docs/reviews/automation-freeform-window-release-af26/frontend-9f4cbe0f-prepared/test_operational_pm2.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2
# Verificação específica do Next: mesma prova, com a extração íntegra preservada.
LAB_EVIDENCE_DIR=local-evidence/frontend-9f4cbe0f-prepared/reproduction-next-private python3 docs/reviews/automation-freeform-window-release-af26/frontend-9f4cbe0f-prepared/test_operational_pm2.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2 /tmp/re7-frontend-9f4cbe0f-clean-final
```

Os diretórios de evidência devem ser novos; o script nunca inicia aplicações/providers produtivos. Limpeza de processos sintéticos no finally não é comando de recuperação produtiva.

### Hashes dos bytes operacionais revisáveis

| Arquivo | SHA256 |
| --- | --- |
| `frontend-check.py` | `48e0b85264b41ef1d5af8d588c03658b9783c99c17c0f739740e5914bf574012` |
| `frontend-action.py` | `2fa6e66e10283d159b1ce6a3705f7b1bdafe077f5c05a515a5432fefebc4c216` |
| `launcher.cjs` | `807862928443c6591417123476127a3cc311ae39ba1be74527b80b07b0ab04b5` |
| `bootstrap.cjs` | `0142c188b45fb37e29528ad62a966e5c450f3b7ba88da2d52d58c16313c292b3` |
| `test_operational_pm2.py` | `6964b497e7cbebffced1afab4b66a257e9c8f893a8d7b54b803e9c2e377f931e` |
| `verify-package.py` | `8a8aab3aeed1560d25892dcc99fc40e5d6666cb272dba550c20657f125259b38` |

[scripts.sha256](frontend-9f4cbe0f-prepared/scripts.sha256) fixa esses seis arquivos; o tar/manifesto/BUILD_ID permanecem os da tabela original. Configs `.ecosystem.config.cjs` originais preservadas; `init-*` produz configs `.tracked.config.cjs` com nonce/entry/BUILD_ID privados e paths do launcher. Não é reutilização de prova/captura antiga. Antes da janela, esses scripts devem ser transferidos para o staging e conferidos pelo manifesto; **não houve transferência nesta rodada**. Nenhuma instalação root/sudo/helper/política é necessária.

## Comandos finais revisáveis — NÃO executar nesta preparação

Executar um comando por vez, conferindo exit code e diagnóstico privado; nenhum loop de start. Antes: executor único, hashes/configs de origem, API/worker/daemon iguais ao baseline e retorno íntegro. Drift nega antes da parada. Gates continuam false. Nova tentativa exige preparação/nonce próprios, preservando intents/journals anteriores.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-9f4cbe0f-20261007T012803Z
R=/opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front
PM=/home/deploy/.npm-global/bin/pm2
export PATH=/usr/bin:/bin:/home/deploy/.npm-global/bin
# Após transferência dos scripts revisados; gate true somente em execução autorizada futura.
(cd "$P" && sha256sum -c scripts.sha256)
test "$(cat "$P/execution-authorized")" = true
test "$(sha256sum "$P/frontend-9f4cbe0f-v2.tar.gz" | cut -d' ' -f1)" = d0f15209922741e51ab21e22d01ff2188ce212ef23081888084c868754065e54
python3 "$P/verify-package.py" "$R" ba6b43c2c550c5926893e12b5620b59d144e0cd91890b978171656b284422eba
test "$(sha256sum "$P/candidate.ecosystem.config.cjs" | cut -d' ' -f1)" = 5683dfbd304f3db408b7616e4c38fcd3bb20aceb7d2658c3e441602d3bcd7918
test "$(sha256sum "$P/return.ecosystem.config.cjs" | cut -d' ' -f1)" = 61d9cb573313339b0c2d4d436905f0824de79eb90663de1540dddca192da557d
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
# Owner confere Inbox/CRM e matriz abaixo. Só então persistir conjunto validado.
"$PM" save
cp /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
python3 "$P/frontend-action.py" candidate
date -Is
```

Falha de prontidão do candidato, inclusive saída anterior à captura: conservar journal/logs/intent. Confirmar daemon/core; parar somente o launcher identificado e provar ausência. **Não exige candidate-tree** quando a aplicação encerrou antes dessa captura, pois o journal registrou sua identidade antes da liberação. Se journal ausente/incompleto, sobrevivente, identidade divergente ou leitura incompleta: bloquear sucessor e diagnosticar, sem kill/bypass.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-9f4cbe0f-20261007T012803Z
PM=/home/deploy/.npm-global/bin/pm2
export PATH=/usr/bin:/bin:/home/deploy/.npm-global/bin
# Somente após diagnóstico do candidato; init-return já foi preparado antes da parada.
python3 "$P/frontend-action.py" stop
python3 "$P/frontend-action.py" candidate-exited
python3 "$P/frontend-action.py" delete
python3 "$P/frontend-action.py" start-return
python3 "$P/frontend-action.py" ready-return
python3 "$P/frontend-action.py" return
# Owner confirma leitura e API/worker inalterados; então salvar referência de retorno.
"$PM" save
cp /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
python3 "$P/frontend-action.py" return
```

Falha do retorno: não repetir start-return; conservar diagnóstico, parar apenas frontend identificado se aplicável e usar `return-exited` para comprovar ausência. Não há um terceiro lançamento automático. Falha antes do stop mantém af26; falha em exited bloqueia candidato. Timeout de start é resultado incerto: inspecionar PM2/journal uma vez e aplicar gates, nunca executar start de novo. Horizonte15 minutos exige escalonar estado/bloqueio, não relaxar provas. Não há duração de indisponibilidade garantida. Guarda/scheduler/crons/boot/barreira e DB/auth permanecem intocados; API/worker nunca param.

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
