# Frontend 9f4cbe0f — preparação isolada, 06/10/2026 Fortaleza

**DEPLOYED TECHNICALLY / OWNER READ CHECK CONFIRMED (07/10/2026).** Frontend `9f4cbe0f9a4e891f09bb2f41e88eccec388172da` implantado exclusivamente pelo procedimento revisado em `f90ecb1b`. Partida única, sem retorno ou recusas. Frontend af26 anterior saiu com ausência comprovada; API afbb e worker mínimo reativo preservados. Owner confirmou sessão/Inbox/CRM/campanhas em leitura antes da promoção; supervisão permanente promovida sem nova partida e PM2 saved/fallback persistidos. Gatefalse encerra esta tentativa. Cenários de envio/processamento/agendamento não exercitados nesta janela permanecem pendentes; não houve envio de validação ou reparo histórico.

## Resultado da implantação exclusiva — 07/10/2026

Reconferidos imediatamente hashes dos sete scripts e do manifesto, tar V2, configs privadas, retorno af26 (arquivos/links inventariados), candidato completo e identidades API/worker/frontend/daemon. Exclusividade sem outro executor identificado, lock da preparação disponível e nenhum control/intent da futura partida preexistente. Backups privados de saved/fallback e baseline de crontab/cron de backup/boot/guarda/scheduler capturados antes da parada. Nenhum dump/restore DB era necessário para uma release exclusivamente frontend.

Sequência efetiva: gate autorizado → captura `before` nova → `init-candidate`/`init-return` novos → reconfirmação das identidades → stop somente frontend → `exited` → delete somente a entrada frontend encerrada → `start-candidate` único → prontidão limitada → captura atual → gate candidato → health API → leitura do owner → promoção permanente → gate supervisionado → PM2save/fallback → gate supervisionado final. Todas as ações executadas passaram, exit0/sem timeout; stdout/stderr/exit ficaram nos arquivos privados do wrapper. Nenhum start foi repetido, prova antiga reutilizada ou sobrevivente ignorado. Retorno foi preparado, não executado. Não houve contenção nft ou suspensão de admissões.

| Checkpoint | Horário UTC / Fortaleza | Evidência |
| --- | --- | --- |
| Início da parada frontend | 12:44:09 /09:44:09 | registro privado antes do stop; af26 PID2537692 saiu |
| Prontidão limitada concluída | 12:44:45.979 /09:44:45.979 | check ready-candidate PASS; limite superior observado de indisponibilidade36,965s, não duração garantida ou medição contínua |
| Identidade/BUILD_ID/health | 12:45:05 /09:45:05 | candidate PASS, APIok/DBok |
| Owner confirma leitura | antes da promoção | resposta “sim, tudo funciona.” ao pedido de sessão/Inbox/CRM/campanhas e troca de detalhe; nenhum envio solicitado |
| Supervisão promovida | 12:47:55 /09:47:55 | enable-supervision-candidate PASS, sem novo fork; marker permanente, gatefalse |
| Saved/fallback e gate supervisionado | 12:48:10 /09:48:10 | PM2save, fallback igual ao saved; gate PASS |
| Conferência final de identidades/controles | 12:48:55 /09:48:55 | três online/restart0; guarda/scheduler/crons/boot preservados |

Frontend efetivo: release9f, BUILD_ID `LFcdEK9gXZsBhf4_c5r8G`, launcher PID3345522/ticks2116147846 e Node/Next PID3345533/ticks2116147879. Journal registra exatamente parent, application_identity e application_released, sem segunda submissão. API afbb PID3153929/ticks2107666112; worker mínimo reativo afbb PID3154150/ticks2107666513; daemon PM2 PID18676/ticks222727, todos iguais ao baseline. Nenhum restart da API/worker; frontend novo restart0.

Guarda permaneceu aberta, geração33; configuração do scheduler igual ao baseline. Crontab deploy e bytes do cron de backup iguais; boot `inactive/enabled`. DB/auth/configurações de tenants não foram modificados por esta operação. Health final APIok/DBok, GET local login200 e hashes dos sete scripts finais PASS. Saved e fallback têm o mesmo SHA256 `b5befab9aede10848769212b4e64972e654f87d0c9dd97042579f8f3de2b8a7a`, com API/worker nas releases preservadas e frontend apontando para `launcher.cjs` desta geração e seu control candidato. O tar não foi reconstruído. Preservar toda a pasta operacional enquanto active/saved/fallback a referenciarem, conforme auditoria abaixo.

### Aceite e limites desta janela

| Cenário | Resultado | Escopo da prova |
| --- | --- | --- |
| Versão, saída antiga, partida única, prontidão, promoção e saved/fallback | PASS produtivo | gates efetivos e observações de processos/sockets/HTTP; sem simulação |
| Sessão, Inbox, CRM e campanhas existentes em leitura | PASS relatado pelo owner | confirmou o roteiro solicitado; não inventar campanha, fila ou operação específica |
| Envio imediato em fila/processamento e atualização terminal/falha/parcial | NOT EXERCISED produtivamente nesta janela | provas locais válidas reutilizadas; nenhum envio/job provocado |
| Agendamento futuro real e concorrência de respostas atrasadas ao trocar detalhe | NOT EXERCISED como cenário dirigido produtivo | leitura geral confirmada não comprova a corrida ou agendamento |
| PM2autorrestart/resurrect após promoção e retorno af26 | NOT EXERCISED produtivamente | ensaios isolados anteriores preservados; não interromper novamente para obter PASS |

Implantação técnica concluída e conferência autenticada de leitura confirmada. A correção visual está liberada, mas isso não encerra agrupamento, audiência dinâmica, agendamento real, contingência Auto ou aceite CRA-PR. Aceites limitados avulso b9/CRM estático imediato afbb/CSV individual imediato afbb preservados; históricos intactos, reparo de setembro CLOSED. Uma troca após esta promoção não pode reabrir a tentativa consumida: exige preparação/baseline novos, preservando journals/controls existentes.

## Preparação histórica — staging de 8da, anterior à execução


## Staging remoto concluído — 07/10/2026

Transferência em diretório exclusivo `staging-8da6a8f3-20261007T113800Z`. Os dois arquivos anteriores foram conferidos contra os hashes atestados de a92c7f26 e arquivados em `scripts-before-8da6a8f3-20261007T113800Z`, com `originals.sha256`. Nenhum arquivo histórico/captura/intenção foi removido ou sobrescrito. Os sete scripts finais, regulares e sem symlink, estão no diretório operacional com modo0644, protegido pela pasta privada0700. `scripts.sha256` SHA256 completo: `4a5bd8c32ad2a5be1474df2901d89566df79a2681b92c96cdc5f87b6ceee7e40`; os sete hashes da seção de código abaixo passaram na VPS.

| Verificação remota desta rodada | Resultado e limite |
| --- | --- |
| Tar V2, configs candidata/retorno e manifesto de retorno | PASS, mesmos hashes completos da tabela de artefatos; sem reconstrução |
| Candidato extraído | PASS: 22.784 arquivos,31 symlinks, modos, inventário exaustivo e BUILD_ID `LFcdEK9gXZsBhf4_c5r8G`; não iniciado |
| Retorno af26 | PASS: todos os 23.497 arquivos e31 symlinks inventariados íntegros; BUILD_ID `J5cHyVKiKEI5xxiGBY5If` |
| Identidades observadas 12:16 UTC /09:16 Fortaleza | Frontend PID2537692/ticks2081554427; API3153929/2107666112; worker3154150/2107666513; daemon18676/222727. Três aplicações online, restart0, mesmas releases da tabela de baseline |
| Configuração/supervisão | Configs privadas preservadas; saved e fallback ainda referenciam af26/afbb/worker mínimo afbb; boot inactive/enabled. Node20.20.0/PM2 6.0.14 |
| Health e leitura pública | API `ok=true`, DB `ok`; GET local `/app/login`200. Não é aceite autenticado nem validação visual produtiva |
| Gate `before` do código final | PASS, saída0/sem timeout, stdout/stderr registrados privadamente. Captura nova arquivada em `source-tree.staging-8da6a8f3-20261007T113800Z.private.json`; futura captura canônica permanece ausente |
| Controles futuros | Gatefalse; sem start-intent, run-control ou promoção. Não executados init, stop, start, save ou retorno na produção |

Uma conferência adicional comparou equivocadamente o manifesto de **runtime frontend de retorno** ao diretório af26 inteiro e negou `return_inventory`. A diferença foi investigada, sem mudar manifesto/bindings: zero arquivo inventariado ausente e todos os hashes/links iguais. O diretório histórico também contém fontes/backend/docs e configuração privada fora daquele manifesto; dentre os caminhos runtime `.next/node_modules/public`, os únicos extras são25 arquivos em `.next/cache`. Portanto não se declara inventário exaustivo do diretório histórico inteiro. O candidato novo, por sua vez, passou no inventário estrito completo. Nada foi apagado para obter PASS.

### Preservação das dependências permanentes

Auditados crontab deploy, `/etc/crontab`, cron.d/daily/weekly/monthly, timers e configuração efetiva de tmpfiles, scripts executados de backup/mídia/retention e iniciador PM2. Nenhuma rotina examinada seleciona `preparations` ou esta geração. A preservação decorre de alvos distintos comprovados por caminhos resolvidos, sem symlink na cadeia da preparação, não de sua idade ou mtime.

| Rotina / bytes observados | Seleção efetiva de remoção | Relação com esta preparação |
| --- | --- | --- |
| `/usr/local/sbin/re7-converta-backup`, SHA256 `179a9ab52ab155cfcba908628be0a8d24796c6f917829ad00054e690e2ad6f71` | somente diretórios timestamp filhos imediatos de `converta-persistent/snapshots`; `.keep-*` no root; rsync --delete nos destinos de conteúdo do snapshot | preparação é irmã de snapshots, fora de todos esses seletores |
| `backup-data.sh`, SHA256 `32870c50972a68a81c03ff0ec6b6b7a11e79606931e0e6474615c721f5a5531f` | `.backups/*.tar.gz`, maxdepth1, mtime>14 dias | outro diretório e tipo/nome |
| `backup-postgres.sh`, SHA256 `795d9906bbde658710e024bbe84afa9a30bd392ef8f5235b7580fa85ac2d5733` | `backups/postgres/*.dump`/`*.dump.sha256`, maxdepth1; temporários do próprio dump | não seleciona preparação/launcher/journals |
| `cleanup-local-media.mjs`, SHA256 `bd6c1ec6e018deb677447456411b1008c4a3bf9646e8d9d929d8abc930432bc9` | arquivos sob `.data/media/outbound` | raiz resolvida distinta |
| `run-retention.ts` / serviço de privacidade | retenção de registros; sem exclusão da geração operacional | sem seleção filesystem desta pasta |
| tmpfiles/timers/cron de sistema examinados | tmpfiles sem regra `/opt`; rotinas do sistema em seus próprios diretórios | nenhuma remoção da preparação identificada |

Boot PM2 SHA256 `0170f46aaab904b11711a62854cc1fe49f06a9d5f542bd4b286775f8ecc681d4` usa resurrect do dump; não faz limpeza. Atualmente active/saved/fallback ainda apontam para Next direto af26. Depois da promoção, passarão a referenciar launcher, observador, control e journals desta geração: **preservar a pasta inteira enquanto qualquer referência existir**, incluindo durante retorno. Só retirar depois de migração de todas as referências e ausência comprovada dos executores. Não foi necessário alterar cron/retention ou instalar privilégios. Esta é evidência dos seletores operacionais examinados, não imunidade contra exclusão manual ou uma futura rotina não auditada; nenhuma rotina foi executada para testar remoção.

Os comandos finais de ida, promoção e retorno permanecem na seção abaixo e usam os scripts já conferidos. Na futura janela: reconfirmar execução única e baseline, autorizar o gate somente no escopo aprovado e produzir captures/controls novos; nunca usar as capturas de leitura desta preparação. Antes da promoção, manter retorno disponível; após promoção o gatefalse fecha a tentativa e uma troca operacional posterior exige baseline/preparação próprios. Nenhuma dependência sudo nova.

Provas locais de inicialização, saída precoce, prontidão limitada, PM2 save/resurrect e morte do Next já publicadas são reutilizadas com os mesmos bytes; não foram repetidas. Nova evidência aqui é transferência/conferência remota e auditoria de seletores, não execução produtiva da supervisão nova.

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
| Gates/frontend private controls frontend-check.py | SHA256 `924bf7dca0d79d10a85f2f3511c63ec6b5069a71f23158340ee8ccd404dbeb75` |

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

O launcher faz um único fork por execução. Durante a janela, se o filho termina, registra o resultado e encerra com código78: PM2 fica stopped, sem retry automático. Após a promoção explícita, a morte do filho encerra o launcher com código1 e permite a recuperação normal pelo PM2, com nonce/journal novos. PM2 online isoladamente deixa de significar aplicação saudável: todos os gates validam também o filho. Durante a janela, reinício do launcher/daemon, PID reutilizado, zumbi, duplicação ou journal incompleto negam. Na supervisão permanente, restart/resurrect legítimos possuem identidades novas e não usam o baseline consumido da janela. O start tem intent exclusivo antes da chamada PM2; sucesso, erro ou timeout não autorizam repetir. Uma falha anterior ao registro do filho continua bloqueada por falta de prova: não se inventa identidade.

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
| Pacotes Next exatos preservados, via launcher | PASS candidato9f → retorno af26, HTTP/identidade/captura/saída; sem fixture frontend nesse ensaio |

O ensaio com o tar Next usa a extração limpa já preservada, fora da árvore de desenvolvimento. Na revisão e6594000, o af26 completo não foi iniciado no laboratório. Isso foi ampliado somente no ensaio operacional atual: o pacote af26 preservado foi extraído e iniciado, com os 23.497 arquivos e symlinks comparados ao manifesto de retorno anterior, sem diferenças/ausências; nenhum rebuild. Não transformar essa distinção em PASS produtivo. Falhas preliminares de EACCES e da asserção do nome de timeout permanecem privadas; o prazo negou corretamente e a asserção foi corrigida. Os testes funcionais anteriores59/10 e limitações22 tsc não foram reexecutados ou atribuídos a esses cenários.

Reprodução (paths são os binários preservados do laboratório, não instalações novas):

```bash
LAB_EVIDENCE_DIR=local-evidence/frontend-9f4cbe0f-prepared/reproduction-private python3 docs/reviews/automation-freeform-window-release-af26/frontend-9f4cbe0f-prepared/test_operational_pm2.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2
# Verificação específica do Next: mesma prova, com a extração íntegra preservada.
LAB_EVIDENCE_DIR=local-evidence/frontend-9f4cbe0f-prepared/reproduction-next-private python3 docs/reviews/automation-freeform-window-release-af26/frontend-9f4cbe0f-prepared/test_operational_pm2.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2 /tmp/re7-frontend-9f4cbe0f-clean-final /tmp/re7-front-af26-supervision
```

Os diretórios de evidência devem ser novos; o script nunca inicia aplicações/providers produtivos. Limpeza de processos sintéticos no finally não é comando de recuperação produtiva.

### Hashes dos bytes operacionais revisáveis

| Arquivo | SHA256 |
| --- | --- |
| `frontend-check.py` | `924bf7dca0d79d10a85f2f3511c63ec6b5069a71f23158340ee8ccd404dbeb75` |
| `frontend-action.py` | `57493c5bf7696af05758ad75fb3511decc126bb011927d011153b4cb06ad3a67` |
| `launcher.cjs` | `131a92d08fe7c6484585ed0a1e18e1bf9f9a1851907337b02ae13ca99e110fef` |
| `bootstrap.cjs` | `0142c188b45fb37e29528ad62a966e5c450f3b7ba88da2d52d58c16313c292b3` |
| `test_operational_pm2.py` | `3c4f5553915e773f8ae76dd4c1c848fc4d18723d608cd15bf571efcd6bb9f3e8` |
| `test_supervision_pm2.py` | `16455ac178f4fad50321da421f2208ce11340fca15035050bf3dac4410052295` |
| `verify-package.py` | `8a8aab3aeed1560d25892dcc99fc40e5d6666cb272dba550c20657f125259b38` |

[scripts.sha256](frontend-9f4cbe0f-prepared/scripts.sha256) fixa esses sete arquivos; o tar/manifesto/BUILD_ID permanecem os da tabela original. Configs `.ecosystem.config.cjs` originais preservadas; `init-*` produz configs `.tracked.config.cjs` com nonce/entry/BUILD_ID privados e paths do launcher. Não é reutilização de prova/captura antiga. Na revisão local de8da não houve transferência; o staging remoto foi concluído e conferido nesta rodada, conforme seção inicial. Nenhuma instalação root/sudo/helper/política é necessária.

## Supervisão permanente — revisão dirigida sobre e6594000

O comportamento anterior não era adequado a saved/resurrect: journal `wx` de uso único e parent mantido online depois da morte do Next. Esta revisão separa **a tentativa de implantação** da **geração de release supervisionada**:

| Controle | Durante a janela | Depois da promoção |
| --- | --- | --- |
| Start do operador | intent exclusivo; nenhum segundo start da mesma tentativa | gate da tentativa false; não reabrir/reutilizar intents |
| Morte do Next | parent registra exit e termina78; stop_exit_codes78 evita retry automático | parent registra exit e termina1; autorestart original do PM2 recupera |
| Evidências | nonce/journal da tentativa fixos e preservados | cada novo launcher cria nonce, control e journal exclusivos em `.run.private.json.runs/<nonce>/` |
| Identidade | daemon/API/worker/frontend pinados pelo baseline operacional | observador próprio da geração, PID/start ticks/bootId/entry hash/BUILD_ID; baseline de janela não é reutilizado após reboot |
| Dump | não salvar configuração transitória antes da promoção | mesmo dump aponta para launcher/control da geração; novas execuções não truncam journals anteriores |

`enable-supervision-candidate`/`enable-supervision-return` só são executados depois de prontidão e conferência funcional autorizada. Revalidam processo original/core, último resultado de prontidão, autorestart e stop_exit_codes, gravam uma promoção exclusiva vinculada a nonce/entry hash/BUILD_ID e fecham `execution-authorized=false`. Não fazem start/restart. Esse é o término da tentativa; depois disso, diagnóstico usa `supervised-*`, e uma nova troca/retorno operacional exige tentativa/baseline novos. Não invocar os comandos de retorno da tentativa já fechada para contornar a supervisão.

PM2 6.0.14 normalizou `[78]` para `78` em jlist/dump. O verificador aceita somente número inteiro78 ou array unitário do mesmo inteiro; não aceita string, bool, null ou coleção vazia. Autorestart, watch e demais opções originais permanecem preservados; apenas o código78 é reservado para falha segura de janela/evidência. Não editar dump manualmente. O env fixo do dump vincula a geração/controle original; não é a identidade de uma execução nova. As identidades efetivas ficam nos controls/journals novos, com nonce/PID/start ticks/bootId próprios.

Na execução inicial promovida, o Next continua com a identidade já registrada, **sem outro fork**. No próximo restart/resurrect, o launcher verifica release/entry/BUILD_ID, promoção e ausência de executores das execuções anteriores antes de fazer seu único fork. Usa `/usr/bin/python3 -I -S` e apenas o observador efetivo publicado. Rejeita sobrevivente, PID reutilizado no mesmo boot, journal inválido ou observação incompleta persistente. Somente o novo launcher e seu observador filho podem ser excluídos do inventário: PID/start ticks/parent exatos, nunca por nome/UID/contagem. Até3 leituras completas para observação incompleta/churn; sem espera fixa, limpeza ou novo start. Cada recusa é registrada privadamente. O subprocesso observador tem teto10s. Falha persistente termina78, deixando PM2 stopped com diagnóstico, sem launcher online solitário nem loop infinito de tentativas.

`bootId` distingue inicialização do SO de PID reutilizado no mesmo boot. Journals de outro boot ficam preservados e não certificam identidades/sockets atuais. Cada execução nova registra o boot real e novo nonce. **Reboot do SO não foi exercitado**; encerramento/resurrect do daemon real foi. Não atribuir atomicidade contra outro operador ou cobertura a código arbitrário que apague vínculos. Nenhum privilégio/root/helper V4 novo.

O inventário de metadata preexistente trata um PID que desapareceu antes de ser registrado como **não registrado**, não como exceção válida: uma identidade posterior só recebe a exceção se PID/start ticks tiver sido efetivamente observado e corresponder. A prova de ausência continua exigindo as duas observações completas. O ensaio preservou negativas preliminares de EACCES/churn, normalização PM2 e a saída assíncrona do daemon. Essas negativas não foram promovidas como PASS; os resultados finais abaixo vieram de tentativas isoladas novas. Nenhum start foi repetido para salvar uma tentativa falha.

### Evidência final desta revisão

| Ensaio com Node20.20.0/PM2 6.0.14 reais | Candidato9f | Retorno af26 |
| --- | --- | --- |
| Next pronto → promoção sem restart | PASS | PASS |
| save → PM2 kill → saída do daemon comprovada → resurrect do mesmo dump | PASS | PASS |
| Morte real do Next (SIGKILL no filho Next controlado apenas no laboratório) após prontidão → recuperação automática PM2 | PASS | PASS |
| Segundo kill/resurrect usando o mesmo dump, hash inalterado | PASS | PASS |
| Identidades/nonces distintos, evidências anteriores preservadas | PASS (4 execuções) | PASS (4 execuções) |
| Stop final → ausência de todas as encarnações pelo mesmo verificador | PASS | PASS |
| Start repetido na janela / start depois de gate fechado / promoção repetida | DENIED | DENIED |

Os frontends são os pacotes Next reais preservados; API/worker continuam stand-ins Node sem providers/DB. PM2/processos/sockets/HTTP/dump e exit codes são reais; nft/systemd não foram simulados nem executados, pois não pertencem à operação frontend. O daemon pode continuar existindo brevemente depois de `pm2 kill`: o ensaio aguarda sua ausência por observação limitada, não toma o retorno da CLI como certificado. Nas leituras de ausência do laboratório, no máximo3 reconfirmações somente para observação incompleta, com cada negativa preservada; sobrevivente continua negando imediatamente.

Os cinco cenários operacionais afetados foram reexecutados sobre o launcher novo: ida, retorno, HTTP lento, saída precoce (PM2 stopped/restart0, uma aplicação) e descendente detached com socket que bloqueou o retorno. HTTP503 com orçamento reduzido também negou; timeout da consulta PM2 no fim do orçamento é falha controlada, não prontidão. Testes funcionais59/10, build e tipos não foram repetidos/reconstruídos. Tar candidato permanece `d0f15209922741e51ab21e22d01ff2188ce212ef23081888084c868754065e54`.

Reprodução adicional dos testes de supervisão, com diretório de evidência novo:

```bash
LAB_EVIDENCE_DIR=local-evidence/frontend-9f4cbe0f-prepared/reproduction-supervision-private python3 docs/reviews/automation-freeform-window-release-af26/frontend-9f4cbe0f-prepared/test_supervision_pm2.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2 /tmp/re7-frontend-9f4cbe0f-clean-final /tmp/re7-front-af26-supervision
```

**Dependência permanente:** launcher, bootstrap, observador, control, promoção e journals da geração são referenciados pelo processo e pelo dump salvo. Preservar esse diretório enquanto active/saved/fallback o referenciarem; não tratar como preparação descartável depois da janela. Não remover/mover os scripts durante operação ou retorno. Só retirar uma geração depois de todas as referências migrarem e executores saírem. A revisão local anterior não transferiu scripts. Nesta rodada os scripts foram transferidos; a auditoria inicial comprova a separação dos seletores de limpeza existentes, sem alteração de retention/cron.

## Comandos históricos da tentativa concluída — NÃO repetir

Executar um comando por vez, conferindo exit code e diagnóstico privado; nenhum loop de start. Antes: executor único, hashes/configs de origem, API/worker/daemon iguais ao baseline e retorno íntegro. Drift nega antes da parada. Gates continuam false. Nova tentativa exige preparação/nonce próprios, preservando intents/journals anteriores.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/frontend-9f4cbe0f-20261007T012803Z
R=/opt/re7online/releases/9f4cbe0f9a4e891f09bb2f41e88eccec388172da-front
PM=/home/deploy/.npm-global/bin/pm2
export PATH=/usr/bin:/bin:/home/deploy/.npm-global/bin
# Scripts revisados já conferidos; gate true somente em execução autorizada futura.
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
# Owner confere Inbox/CRM e matriz abaixo. Só então terminar tentativa e habilitar supervisão.
python3 "$P/frontend-action.py" enable-supervision-candidate
python3 "$P/frontend-action.py" supervised-candidate
"$PM" save
cp /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
python3 "$P/frontend-action.py" supervised-candidate
date -Is
```

Antes da promoção: falha de prontidão do candidato, inclusive saída anterior à captura: conservar journal/logs/intent. Confirmar daemon/core; parar somente o launcher identificado e provar ausência. **Não exige candidate-tree** quando a aplicação encerrou antes dessa captura, pois o journal registrou sua identidade antes da liberação. Se journal ausente/incompleto, sobrevivente, identidade divergente ou leitura incompleta: bloquear sucessor e diagnosticar, sem kill/bypass.

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
# Owner confirma leitura e API/worker inalterados; então concluir tentativa e salvar retorno.
python3 "$P/frontend-action.py" enable-supervision-return
python3 "$P/frontend-action.py" supervised-return
"$PM" save
cp /home/deploy/.pm2/dump.pm2 /home/deploy/.pm2/dump.pm2.bak
python3 "$P/frontend-action.py" supervised-return
```

Antes da promoção, falha do retorno: não repetir start-return; conservar diagnóstico, parar apenas frontend identificado se aplicável e usar `return-exited` para comprovar ausência. Não há um terceiro lançamento automático. Falha antes do stop mantém af26; falha em exited bloqueia candidato. Timeout de start é resultado incerto: inspecionar PM2/journal uma vez e aplicar gates, nunca executar start de novo. Horizonte15 minutos exige escalonar estado/bloqueio, não relaxar provas. Não há duração de indisponibilidade garantida. Guarda/scheduler/crons/boot/barreira e DB/auth permanecem intocados; API/worker nunca param.

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
