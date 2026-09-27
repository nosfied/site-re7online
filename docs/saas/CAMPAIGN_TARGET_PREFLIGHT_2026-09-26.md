# Preflight somente leitura — campanhas, 2026-09-26

Candidato: `2ecfc91a35775326ffa90693b3ff4f77ac37c9ca`; branch
`review/campaign-recovery-20260926`. **NOT DEPLOYED / OWNER UI PENDING**.
Este documento registra leitura do alvo, não autorização nem execução de rollout.
Complemento operacional ao documental `66b9cf2b`: substitui a proposta preliminar
de janela de 30–60 minutos por condições verificáveis. Não há janela aprovada ou
duração comprovada. Migration, drift e ensaio não foram repetidos.

## Ambiente observado

VPS operacional descrito em `DEPLOY_TOPOLOGY_RE7.md`: HEAD detached
`5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`, tracked limpo; somente `.data/`
do worker untracked. PM2: frontend, API e worker online, uma instância fork de
cada; processos auxiliares npm/Next não representam réplicas adicionais da API.
PostgreSQL 16 em container saudável. Código compilado da API contém o scheduler,
três chamadas diretas ao runner nas rotas e test-send; não contém handlers de
SIGTERM/SIGINT nesses módulos. Não foi comprovada equivalência binária por build
reproduzível, nem ausência de consumidores em hosts fora da topologia documentada.
Worker, processos, configurações e sessões foram preservados.

Scheduler habilitado, intervalo padrão 60 s e execução no startup. Desabilitar o scheduler com
`CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=true` exige novo processo e não impede envio
manual. Admissão inclui `/app/campaigns`, drafts/CSV, send/resume/schedule/test-send
e `/admin/campaigns` / `run`; o candidato acrescenta ações de execution-batches.

### Entradas e supervisores — leitura complementar

| Caminho | Evidência e limite |
| --- | --- |
| Nginx / host operacional | Arquivos em disco encaminham `/agent-api/` à API e `/` ao frontend; realtime tem location próprio. Não confundir leitura em disco com configuração carregada. |
| Alias admin | Em disco, HTTP/HTTPS redirecionam 301 para o host operacional preservando request_uri. Não é um backend separado. |
| Host de API | Em disco, `/health` e `/webhook` vão à API; `/` responde 404. Não presumir que todo host publicado encaminha campanhas. |
| Frontend compilado | `.next/routes-manifest.json` confirma rewrite `/public-api/:path*` para a API local; não há rewrite de `/agent-api` nesse build de produção. Código atual oferece criação de draft e importação de recipients por `/public-api/v1/campaigns`; essas mutações também entram no fence, embora não iniciem envio diretamente. UI usa `/agent-api` para app/admin. |
| Portas diretas | **3000 e 3001 aceitaram TCP de fora do VPS**, além de loopback e endereço do host. Não foi enviado payload HTTP nem credencial. A API direta contorna Nginx; a porta do frontend alcança o rewrite público. Prova de alcance a partir da origem consultada, não de todas as redes/IPv6. |
| Acesso local | Loopback alcança ambas as portas. Scripts/operadores no host e scheduler interno contornam controles de borda. RBAC existente não é um modo de manutenção. |

`nginx.conf` inclui `sites-enabled/*`: tanto o arquivo principal quanto
`converta.re7online.com.bak-20260810-support-upload` entram no glob e declaram
os mesmos server_name/listeners. Não foi removido nada. `sudo -n nginx -T`,
`sudo -n nft list ruleset`, `sudo -n iptables-save` e `sudo -n ufw status verbose`
foram negados por exigirem senha. Não houve tentativa de contornar esse controle.
Não afirmar qual bloco prevalece na configuração em memória. Mesmo `nginx -T`
mostra o que seria carregado do disco; é necessário correlacionar com último
start/reload bem-sucedido e mudanças posteriores. Nenhum reload foi feito.

PM2 vivo: API/frontend/worker, uma instância fork cada, autorestart=true,
watch=false, sem cron_restart. `dump.pm2` e backups incluem API antiga e worker.
`pm2-deploy.service` está **enabled, inactive/dead**, Restart=on-failure;
ExecStart executa `pm2 resurrect`, ExecReload executa `pm2 reload all`, ExecStop
executa `pm2 kill`. Portanto boot/start/resurrect pode restaurar a API salva;
parar ou recarregar a unidade inteira atingiria o worker e NÃO serve de fence.
Não confundir serviço systemd inativo com daemon PM2 ausente: o daemon está vivo.
Listagens acessíveis de units/timers não revelaram outro supervisor específico;
crontab do deploy contém backup/limpeza/retenção. Crontabs privilegiadas,
automações externas e política de boot permanecem sob confirmação do operador.

### Leituras exatas a cargo do operador privilegiado

Executar somente leitura no alvo; manter dumps integrais privados, retornar
apenas trechos de roteamento, políticas e metadados sanitizados:

- `sudo nginx -T`: includes, warnings de conflicting server name, listen,
  server_name, location, proxy_pass e redirects. Correlacionar
  `sudo journalctl -u nginx --since '2026-08-10' --no-pager` e o error_log
  configurado com start/reload e mtimes dos arquivos incluídos. Se não houver
  trilha suficiente para provar disco = memória, registrar a lacuna; não executar
  reload para fazer a leitura passar.
- `sudo nft list ruleset`, `sudo iptables-save`, `sudo ip6tables-save`,
  `sudo ufw status verbose`: políticas INPUT/FORWARD/Docker e regras IPv4/IPv6
  de 3000/3001. Consultar também firewall/security-group do provedor e DNS/aliases
  no painel, somente leitura. O TCP externo já comprova que não há bloqueio
  universal das duas portas; falta identificar o controle exato a ser corrigido.
- `sudo systemctl cat pm2-deploy.service`,
  `sudo systemctl show pm2-deploy.service -p Restart -p ExecStart -p ExecStop -p ExecReload`,
  `sudo systemctl list-unit-files`, `sudo systemctl list-timers --all`,
  `sudo crontab -l` e leitura de `/etc/cron.d/`, `/etc/rc.local` quando existir.
  Conferir outros usuários/daemons PM2 e inventário de automações de deploy/boot
  com o operador. Não imprimir env/credenciais dos dumps PM2.

Nenhum dado, regra, supervisor, processo ou sessão foi modificado.

## Banco, migration e drift

Consulta feita com BEGIN READ ONLY, timeout de 15 s e ROLLBACK; apenas metadados
ou agregados. Histórico: 65 linhas, 59 migrations distintas, 59 aplicações
concluídas com checksum igual ao SQL do candidato. As outras seis linhas são
tentativas históricas explicitamente rolled_back, com checksums antigos:
conv_runtime_state_shadow (duas), add_lead_model, add_user_model, add_scheduling
e add_audio_transcriptions. Não há falha não resolvida nesse histórico.

As quatro tabelas da fila ainda não existem. Migration pendente única da frente:
`20260925143000_add_campaign_execution_queue`; aditiva, referencia Client.id UUID
e Campaign.id TEXT, tipos confirmados no catálogo. Não foi aplicada no alvo.
A validação via Prisma e o ensaio operacional local anteriores continuam válidos;
este preflight não os repete nem converte em validação de execução no alvo.

Os 16 objetos do inventário de drift coincidem integralmente com o catálogo
consultado no ensaio: oito defaults gen_random_uuid() (Client, WaPhoneNumber,
Contact, Conversation, Message, Event, InboundMessage, OutboundMessage); quatro
defaults updatedAt CURRENT_TIMESTAMP (AgentAvailability, ChatbotFlow,
DepartmentBusinessHour, UserDepartmentMembership); índices extras
SearchIndex_searchVector_idx e WebhookEndpoint_clientId_signingSecretKeyVersion_idx;
nome do índice CompletedServiceSnapshot_clientId_departmentId_assignedUserId_c;
nome da FK Department_operationalQueue_fkey. São anteriores à frente. Defaults
continuam compatíveis com inserções do Prisma; índices extras não impedem DDL
aditiva; renomes não mudam a integridade referencial. Nenhum desses 16 objetos
impede esta migration. Isso não equivale a uma auditoria de todo o catálogo.

**Fence de privilégios do ensaio NÃO é transferível:** papel configurado na API
e no worker é o mesmo, superuser, proprietário de 66 tabelas públicas, com
INHERIT, BYPASSRLS, CREATEROLE e CREATEDB, sem memberships explícitos. Sessões
normais sem application_name impedem atribuição individual só por pg_stat_activity;
crons também usam esse banco. REVOKE não bloqueia superuser/owner e uma mudança
global do papel atingiria serviços compartilhados. Nenhuma alteração foi feita.

## Estado e backup

Fotografia de leitura: 104 campanhas — 85 completed, 12 cancelled, 5 failed e
2 draft; zero sending/running/paused/scheduled, zero agendadas vencidas/futuras.
Zero eventos submit_started sem OutboundMessage correspondente, zero
provider_accepted sem OutboundMessage, zero reconciliation_required. Correlação
por tenant + messageId, sem ler destinatários. Ausência desses sinais não prova
que nunca houve chamada externa sem registro; in-flight test-send não possui
um inventário durável completo. needs_review do ensaio é somente sintético.
Recontagem obrigatória na janela aprovada, pois o runtime permanece ativo.

Destino persistente legível e gravável pelo operador; 42 GiB disponíveis na
partição (28% usada). Snapshot automático mais recente observado: 20260926T024001Z;
dump 21.647.934 bytes, SHA256 conferido contra SHA256SUMS; manifest registra
581 objetos e validação pg_restore --list. Não houve novo dump nem restore.
Retenção 7/4/3 continua com Permission denied em snapshot antigo pertencente a
root; não foi corrigida, não invalida o dump novo, mas pode aumentar ocupação.
Offsite não configurado no manifest. Backup atualizado imediatamente antes da
janela e verificação de restauração/segredos de recuperação continuam condições
de entrada; espaço atual não é garantia indefinida.

## Quiescência: evidência atual insuficiente

No SHA vivo `5ee2de6b`, `campaignRunner.ts:133` inicia Promise desacoplada da
resposta HTTP e guarda `runningCampaigns` em memória, removendo em finally.
Não há endpoint de drain/contagem nem espera de shutdown demonstrada. A função
que limpa o timer não aguarda ticks já iniciados; startup e intervalos podem
admitir novos runners. Encerrar conexões HTTP não prova que as Promises acabaram.

`routes.ts:36783` (`sendScopedCampaignTest`) faz awaits de pré-validação antes
de `campaign.test_send.requested`; só depois chama provider e persiste resultado.
Eventos requested/sent/failed permitem correlacionar sinais já registrados por
requestId, mas não revelam uma chamada ainda em pré-validação e não oferecem
barreira contra outra execução. Exceção/crash entre provider e persistência deixa
incerteza. Campanhas sem status sending, sockets vazios, logs silenciosos ou
esperar N segundos NÃO demonstram quiescência. Não executar envio para sondá-la.

**Conclusão:** após bloquear novas entradas externas, ainda não existe prova
observável suficiente no código atual para autorizar a parada sem risco de
interromper campanha/test-send. Scheduler interno e requisições já admitidas
continuam sendo fontes de trabalho. Ausência de eventos de incerteza na fotografia
anterior não fecha essa lacuna.

### Desenho registrado em `2b5697b6` — implementação local descrita ao final

Uma guarda operacional de campanhas, sem alterar permissões do banco compartilhado,
com o mesmo contrato no código pré-fila de recuperação e no candidato:

1. Modo fechado por padrão no startup e comando administrativo autenticado de
   fechamento em runtime; estado/geração de fechamento persistente, independente
   do processo, para que crash/PM2 resurrect não reabra campanhas. Falha em ler o
   estado mantém campanhas fechadas. Nenhum bypass por acesso loopback/direto.
2. Admissão atômica + registro de trabalho antes do primeiro await para rotas
   app/admin/public-api de campanha, test-send, scheduler/claim, runner e
   materialização/enqueue. Fechar a admissão e obter a geração deve ser atômico
   com esse registro. Resposta HTTP concluída não remove tarefa desacoplada;
   registrar até terminar persistência/finally. Contar também tick do scheduler.
3. Ao drenar, impedir início de outro destinatário/lote, deixando uma chamada
   provider já iniciada concluir e persistir aceitação/resultado. Preservar a
   pendência restante de modo recuperável; nunca marcar campanha concluída só
   para zerar contador. Test-send já admitido pode terminar; nenhum novo inicia.
4. Leitura administrativa sanitizada por instância/PID/build/geração: admissão
   fechada confirmada, tarefas admitidas, runners, ticks/claims, provider calls
   e persistências pendentes; zero de todos, nenhum resultado incerto não tratado
   e cobertura de TODAS as instâncias são a condição de drain, não um timeout.
   Contador zero após restart/crash não vale como prova do processo anterior:
   intents/resultados duráveis e reconciliação explícita são necessários.

O registro durável de intento/resultado de test-send deve fechar a lacuna de
crash; reutilizar o armazenamento de eventos existente se suficiente, sem presumir
uma migration nova. A guarda deve ser específica para campanhas: não bloquear o
serviço genérico de envio usado pelo atendimento Inbox. Isso exige revisão dos
call sites, inclusive chamadas internas ao runner, não só um if nas rotas.

Validação futura focada: fechar durante pré-validação, chamada simulada em voo,
persistência lenta/falha e concorrência scheduler/manual; confirmar nenhum novo
provider após fechamento, preservação de aceitos/pendências e não reenvio em crash.
Cobrir acesso direto/loopback, rotas públicas, PM2 restart/resurrect e todas as
instâncias; regressão limitada de Inbox/CRM/webhooks com fixtures/provider simulado.
Sem repetir migration/drift. A primeira instalação desse mecanismo no código vivo
TAMBÉM requer transição controlada: a versão atual não fornece drain retroativo.
Qualquer chamada cujo término não possa ser demonstrado deve ser tratada como
incerta, com decisão de reconciliação antes de prosseguir. Não se elimina esse
problema apenas adicionando instrumentação e reiniciando.

## Decisão registrada em `2b5697b6` e retorno do atendimento

**NÃO avançar ao rollout da fila agora.** Preparar e ensaiar primeiro o mecanismo
mínimo de fechamento/drain e um artefato de recuperação baseado no SHA funcional
com campanhas fechadas, mantendo a produção atual viva nesta etapa. Trata-se de
trabalho posterior a autorizar, não de solução pronta nem mudança implementada.
Não solicitar aprovação genérica de 30–60 min: duração depende do drain comprovado
e do ensaio da recuperação, ainda inexistentes.

Não há atualmente caminho comprovado para restaurar Inbox/CRM/webhooks com o
código antigo e simultaneamente impedir campanhas por todas as entradas. Somente
scheduler=false + Nginx é insuficiente, dadas portas diretas, acesso local e rotas
manuais. REVOKE é inválido para o papel compartilhado superuser/owner. Parar API
impede execução daquele processo, mas também para o atendimento e não substitui
drain nem protege contra resurrect. O artefato antigo sem guarda NÃO é rollback
operacional aceitável.

Procedimento de recuperação a ENSAIAR, depois de autorizar o mecanismo acima:

1. Confirmar admissão fechada em todas as instâncias/gerações, concluir drain e
   excluir respawn da versão sem guarda, preservando o supervisor/processo do worker.
   Manter controles externos como defesa adicional, não como única barreira.
2. Se candidato falhar, conservar a migration aditiva e todos os jobs/snapshots/
   aceites/incertezas. Nenhum down, restore destrutivo ou reenvio automático.
3. Iniciar apenas o artefato de recuperação instrumentado em modo campanhas
   fechadas, scheduler/runner impedidos antes do primeiro claim/provider. Comprovar
   que não depende das tabelas novas para servir atendimento e que ignora os jobs
   sem executá-los. Rodar verificações locais do atendimento e leitura de health;
   health sozinho não aceita rollback. Esse artefato ainda NÃO existe validado.
4. Reabrir exclusivamente atendimento depois de verificar Inbox/CRM/autenticação,
   recebimento e webhooks em ambiente isolado e obter critérios de aceitação para
   o alvo. Campanhas continuam bloqueadas. Retomar candidato posteriormente mantendo
   idempotência, resultados aceitos e reconciliação das incertezas.

| Serviço | Alcance da manutenção e recuperação proposta |
| --- | --- |
| Campanhas de todos os tenants | Admissão e execução suspensas até liberação explícita; drafts/import/test-send também cercados. |
| API / Inbox / CRM / autenticação / realtime | Sem API ficam indisponíveis. A guarda proposta permitiria retorno com campanhas fechadas, mas exige implementação e ensaio. |
| Webhooks Meta e integrações API | API parada impede processamento; não há prova de retenção/retry completo nem promessa de replay. Definir com owner risco de perda/atraso antes da janela. |
| Worker Web / sessões | Não parar/recarregar nem usar pm2 kill/reload all. Pode seguir conectado e persistir parte do inbound, mas callbacks/handoff dependentes da API degradam; integridade integral do inbound não foi provada. |
| PostgreSQL | Permanece ativo; nenhum REVOKE/mudança de papel compartilhado. |
| Frontend | Pode continuar servindo páginas, mas atendimento depende da API; não confundir página carregada com serviço recuperado. |
| Site institucional Vercel | Não requer alteração para este procedimento. |

### Abortar ANTES da migration se qualquer condição ocorrer

- Configuração carregada/entradas/IPv4/IPv6 ou supervisores continuam sem inventário
  suficiente; alguma instância sem guarda pode receber trabalho ou reaparecer.
- Não há confirmação de fechamento na mesma geração em todas as instâncias, há
  tarefa/provider/persistência ativa, estado de crash desconhecido, ou test-send
  não observável. Timeout não transforma pendência em sucesso.
- Artefato de recuperação de atendimento com campanhas fechadas não foi validado,
  ou sua primeira instalação segura no código atual não foi definida.
- Backup fresco/verificação de restauração/segredos de recuperação não estão
  disponíveis na janela, ou o owner não definiu tratamento de incerteza/inbound
  sem garantia de replay. Reutilizar evidência de migration/drift, sem refazer auditoria.

### Acessos e decisões necessários — específicos

Operador privilegiado precisa fornecer as leituras listadas acima e confirmar
controle de PM2 saved state/boot e automações externas, sem compartilhar senha.
Owner precisa decidir se autoriza, em tarefa separada, implementação/ensaio da
guarda e do artefato de recuperação; nomear responsável por reconciliação e aceitar
critérios de inbound/atendimento sem garantia de retry. Só depois dessas provas
se define janela e autorização de mudança. Não se pede aprovação de deploy aqui.

## Status do preflight antes da implementação local

**CONDIÇÕES OPERACIONAIS AINDA NÃO FECHADAS / NOT DEPLOYED / OWNER UI PENDING**.
Portas externas e risco de resurrect comprovados; configuração carregada/firewall
privilegiados e drain/retorno seletivo ainda pendentes. Leitura complementar não
consultou novamente migration, drift ou dados de campanhas, nem repetiu ensaio,
build/testes/smokes. Worker/sessões preservados. Owner PASS anterior, 6683 CLOSED,
aceite CRA pendente e DELIVERED/READ → HUMAN/WAITING separados e sem alteração.


## Atualização: guarda/drain e recuperação implementados SOMENTE LOCAL

O desenho acima deixa de ser apenas proposta no worktree da revisão; os fatos
observados em produção não mudaram. Implementação, configuração, diagnóstico e
primeira transição estão no [runbook](../RUNBOOK_WHATSAPP_AGENT.md#guarda-operacional-de-campanhas--implementação-local-2026-09-26).
A guarda usa armazenamento persistente local e autorização superadmin existentes,
sem migration nem alteração de privilégios compartilhados. Não altera a fila ou
intenção de pause/cancel; separa suspensão administrativa de ação do usuário.

Artefato separado em `tmp/worktrees/re7-campaign-service-recovery-20260926`, base
`5ee2de6b`, mantém campanhas fechadas incondicionalmente e preserva atendimento.
Configuração aberta não contorna esse build. Client antigo privado, worker/sessões
intocados. Evidência local em `local-evidence/recovery/operational-guard/`; dumps
sintéticos anteriores foram restaurados em novos DBs, não alterados nem recriados
por migration. Não houve consulta a produção nesta etapa.

Recomendação permanece: não implantar antes de fechar as condições da PRIMEIRA
transição do código sem instrumentação. O novo diagnóstico não prova ausência
retroativa de chamadas; file paths compartilhados e inventário de executores são
condições de confiança. Lacunas de Nginx/firewall privilegiados e respawn continuam
exatamente as do preflight. Retorno do atendimento tem evidência local específica,
sem promessa de retries/inbound em produção. Janela e owner/CRA continuam pendentes.
Não há limpeza automática de locks/tarefas incertas nem abertura por timeout.


### Resultados comprovados do ensaio local

- Suítes afetadas de fila/runner/grupos/guarda: **40/40**; inclui snapshot único,
  3.001 → quatro lotes, variáveis por destinatário, exclusividade, perda de lease,
  pause/cancel durante chamada e retorno administrativo sem duplicação.
- Rotas afetadas: **44/44**; caso final adicional de fechamento durante a
  pré-validação real de test-send: **1/1**. Controle global por superadmin e
  rejeição de tokens/usuários tenant comprovados (subconjunto focado: **3/3**).
- Guarda final: **8/8**, incluindo crash real com exit 73, identidade de
  boot/processo (sem confiar apenas no PID), falha/persistência lenta, arquivo
  inválido e fechamento observado por outro processo na mesma geração.
  Fila após o último ajuste de aquisição interna de lease: **8/8**.
- Artefato de recuperação: **4/4** casos de Inbox/CRM/auth/webhook no DB sem
  tabelas novas; **5/5** com tabelas novas, incluindo inbound sintético. Probe de
  bloqueio direto/runner/scheduler: **1/1 em cada DB**. Provider sempre simulado.
- Troca candidato → subprocesso do artefato fechado → candidato: **1/1**,
  mesmo arquivo de guarda/geração e DB; snapshots de Campaign/jobs/batches/Event/
  OutboundMessage idênticos durante o probe antigo, três submissões simuladas
  únicas após retorno, sem repetir o primeiro aceite.
- Builds backend candidato e recuperação: **PASS**. Sem alterações de frontend,
  worker, schema/migration ou transportes; não repetidos builds/smokes desses
  componentes, migration ou inventário de drift. `git diff --check`: PASS.

Os números acima identificam execuções/subconjuntos e não devem ser somados como
casos únicos. Durante desenvolvimento, foi corrigido fechamento indevido ao
finalizar scheduler com runner filho ativo. O primeiro build antigo usava Client
novo compartilhado e falhou em UuidFilter; foi corrigido com Client privado do
schema antigo, sem alteração funcional incidental. Erros de caminho/helper de
fixtures foram corrigidos sem remover assertions. Logs anteriores preservados
quando disponíveis; resultados finais e fontes têm manifesto local.

Ambiente: dois DBs sintéticos exclusivos no cluster loopback local: um com fila,
outro restaurado do dump anterior sem fila. Sem reset, db push, migration ou
alteração dos dumps anteriores. Launcher usa env limpo e credenciais fictícias;
`apps/whatsapp-agent/scripts/campaign-guard-local-isolation.mjs` recusa DB fora dos
dois destinos locais e bloqueia fetch/HTTP externo. Testes substituem provider
por respostas simuladas. Evidências/patches/hashes em
`local-evidence/recovery/operational-guard/` (não versionadas).


### Publicação para revisão e reforço de topologia — 2026-09-26

Candidato `review/campaign-recovery-20260926` sobre `2b5697b6`; recuperação
`review/campaign-service-recovery-20260926` em `e6a12bc9f4ae77ada191f7bdc7d835ee704d5bac`, parent direto
`5ee2de6b`. Artefato antigo separado, campanhas permanentemente fechadas e
atendimento compatível com DB anterior/posterior conforme ensaios acima.
[Configuração, proteção, limites e procedimento dos dois artefatos](../RUNBOOK_WHATSAPP_AGENT.md#publicação-dos-dois-artefatos-para-revisão--2026-09-26).

Lacuna documental corrigida em código: abertura agora exige atestado de host único
+ identidade local, e ledger é vinculado ao host. Configuração desconhecida,
multi-host ou identidade divergente impede abrir/admitir/provider; inventário
verdadeiro continua necessário, sem coordenação entre hosts. Estado legado aberto
sem vínculo não fica implicitamente aberto. Não configurar single-host diante de
inventário incompleto. Primeiro provisionamento/primeira transição ainda pendentes.

Validação incremental: guarda **11/11** (8 anteriores + 3 cenários de topologia),
build backend candidato **PASS**. Nenhuma mudança funcional no recovery, schema,
migration, frontend ou worker; respectivos resultados anteriores preservados.
Novo probe aceita SHA completo verificado e ancestralidade, para reproduzir o
ensaio com o artefato commitado. Resultado dessa troca registrado na evidência
local `guard-publication/return-published-artifact.log`: **1/1 PASS**, mesmo estado
compartilhado, retorno sem duplicar o aceite simulado.
Backups/patches/hashes anteriores preservados; staging exclui todo estado privado.
CI push restrito main/develop, sem deploy; Vercel com exclusão nominal das duas
branches. NOT DEPLOYED / OWNER UI PENDING; CRA/primeira transição pendentes.
Não há quiescência retroativa; 6683 CLOSED e materialização separada.


### Achados incrementais de guarda — revisão 889a1c7c / e6a12bc9

Corrigidos os dois achados sem nova auditoria geral: exceção exata de consentimento
nos dois artefatos preserva autenticação/feature/tenant; resposta conhecida do
provider alcança a persistência SQL mesmo quando o ledger falha. Runner não
classifica aceite com persistência pendente como rejeição. Marcador compartilhado
`.uncertain` impede nova admissão/abertura/drain; recuperação só recebeu a exceção
de consentimento e leitura desse marcador, permanecendo fechada em código.
[Operação, diagnóstico de locks e limite quando SQL + filesystem falham](../RUNBOOK_WHATSAPP_AGENT.md#correção-dos-achados-de-consentimento-e-aceiteledger--2026-09-26).

Validação final afetada, provider simulado e dois DBs loopback sintéticos:

- Guarda: **15/15**, com contenção real de outro escritor/processo, EIO, lock
  abandonado/inverificável e falha simultânea SQL/filesystem. Reprodução anterior
  dos dois erros pós-aceite: **2 falhas esperadas**, preservadas localmente.
- Runner/grupos afetados: **11/11**, incluindo 3 casos de receipt/SQL e manutenção
  dos casos de pausa/cancel/needs_review/falha durante provider e drain administrativo.
- Rotas candidatas: **5/5**, incluindo consentimento com guarda fechada, RBAC global,
  pré-validação e 2 casos reais de test-send com resposta preservada no SQL.
- Rotas legadas de consentimento na recuperação: **1/1**.
- Consumidores atuais do CRM (opt-out, autenticação, capability e RBAC): **4/4 em
  cada artefato**. Guarda fechada por ausência de arquivo nessas fixtures.
- Recuperação fechada/diagnóstico do marcador compartilhado: **2/2** no DB base.
- Builds backend candidato e recuperação: **PASS**; diff --check conferido antes
  do commit. Não repetidos suites amplas, smokes UI, migration/drift ou builds frontend.

Contagens incluem subconjuntos já executados, não somar como casos únicos. Durante
as fixtures novas, corrigidos escape do subprocesso e nome de campanha duplicado
que retornava 409 antes do cenário de EIO; nenhuma assertion enfraquecida. Evidências
anteriores intactas; novos logs/backups/hashes em `local-evidence/recovery/guard-findings/`.
Sem SQL durável nem marcador gravável, aceite pode permanecer só em memória;
retomada automática após reparo não é garantida segura: manter todos executores
sem admissão e reconciliar. Nenhuma operação remota autorizada/executada nesta etapa.
NOT DEPLOYED / OWNER UI PENDING. Primeira transição/CRA pendentes, sem quiescência
retroativa. 6683 CLOSED e divergência de materialização separada.


## Consolidação para a primeira transição — evidência ainda pendente

> Registro histórico de 4d282049. A consolidação do owner recebida em 27/09,
> registrada abaixo, supre as saídas antes indisponíveis. Não solicitar novamente
> aquele pacote; somente as lacunas novas e materiais discriminadas ao final.

Artefatos funcionais fixos: candidato `a1cc380eddcd1467b8e0d3a8e405f82689a25b3d`,
recuperação `03f930e5453efd313a91a16de3e22057a0573d9c`. NOT DEPLOYED / OWNER UI PENDING.
As seções anteriores são histórico, não confirmação de prontidão atual.

Os novos resultados privilegiados anunciados não foram encontrados nos anexos ou
nas evidências locais. O owner informou não saber localizá-los. Tentativa dirigida,
sem bypass: SSH existente reconfirmou HEAD produção `5ee2de6b`; nginx -T, nft,
iptables, ip6tables, ufw e crontab root via sudo -n ainda exigem senha. Unit PM2
reconfirmada enabled/inactive, com resurrect/reload all/kill. Isso NÃO comprova
configuração carregada, firewall ou ausência de outros supervisores.
Evidências privadas e hashes em `local-evidence/recovery/first-transition/`.
Nenhuma nova consulta DB, migration/drift, suíte/build ou probe de provider.

| Item | Prova disponível | Pendência exata |
| --- | --- | --- |
| HEAD alvo | Reconfirmado 5ee2de6b por SSH | Revalidar status/PIDs no gate da janela |
| Portas diretas 3000/3001 | TCP externo positivo do preflight anterior | Regras/políticas IPv4/IPv6 e painel do provedor pelo operador |
| Nginx/aliases | Includes/rotas em disco e duplicidade documentados | nginx -T + logs de reload/start + mtimes para correlação com memória |
| Frontend | Rewrite público do build anterior e UI /agent-api | Inventário atual de hosts/aliases; artefato frontend compatível antes de liberar campanhas |
| Scheduler | Startup + timer do código antigo documentados | Parada de TODOS os executores antigos; configuração não é hot fence |
| PM2 | Unit reconfirmada; dump/backup antigo observado no preflight | Inventário privilegiado de outros usuários/crons/automações; preservar e retirar referências antigas de saved/fallback/boot |
| Chamadas antigas | Instrumentação insuficiente já comprovada | Correlacionar sinais na janela e apresentar desconhecidos ao owner; impossível provar drain retroativo |
| Backup/restore | Snapshot antigo validado, retenção/offsite pendentes | Novo ponto fresco, restore isolado, segredos e duração medidos antes da janela |

Recomendação única: interrupção explícita da API antiga, com impacto amplo aceito
pelo owner e risco residual identificado, retorno inicial do atendimento pela
recovery fechada; depois migration/candidato fechado. Não propor bloqueio seletivo
Nginx como proteção suficiente do runner antigo. Decisão de interromper (A) e
liberar campanhas (B) são separadas. Se owner não aceita incerteza residual, não
prosseguir com A: o código antigo não permite comprová-la ausente.

[Plano condicionado, comandos futuros, responsáveis, critérios de parada e checklist de backup](../RUNBOOK_WHATSAPP_AGENT.md#primeira-transição--plano-condicionado-às-evidências-do-operador).
Esse plano contém comandos mutáveis somente como preparação; nada foi executado.
G0 pendente impede solicitar janela genérica ou declarar pronto para aprovação
final. Owner não precisa fornecer senha: operador executa pacote de leitura em
sessão própria e entrega matriz sanitizada. Sem números arbitrários de manutenção.
6683 CLOSED, owner UI/CRA pendentes, materialização separada, sem quiescência retroativa.


## G0 consolidado em 27/09/2026 — owner e leituras dirigidas

Candidato funcional `a1cc380eddcd1467b8e0d3a8e405f82689a25b3d`; recuperação
`03f930e5453efd313a91a16de3e22057a0573d9c`; plano anterior `4d282049`.
**NOT DEPLOYED / OWNER UI PENDING. G0 parcialmente fechado, não autorização de parada.**

### Evidência fornecida pelo owner (não executada pelo Codex)

Fonte: consolidação textual do owner de 27/09/2026, sessão deploy no alvo, com
saídas/capturas conferidas pelo owner. Não existem neste documento hashes, arquivos
locais ou anexos inventados para essas saídas originais. Não repetir nem pedir
reenvio desse pacote. Atribuir separadamente as leituras complementares abaixo.

| Assunto | Evidência recebida e consequência |
| --- | --- |
| Nginx | nginx -T: syntax/test successful; conflitos Converta IPv4 80/443, ignored. Includes modules-enabled/*.conf, conf.d/*.conf, sites-enabled/*. |
| Rotas | Alias admin 301 para Converta preservando URI; Converta encaminha /agent-api/ e realtime para API 3001, / para frontend 3000. API host oferece health/webhook e 404 residual; default IPv4/IPv6 80 serve arquivos/404 |
| Duplicidade | .bak de 10/08 também incluído, mesmos listeners/server_name/proxies, sem limite 10m do principal. Registro de higiene; não removido |
| Journal | Reloads 10/08 19:58:24 e 12/08 01:15:48; starts posteriores, último mostrado 15/09 07:00:15 successful, com warnings de conflito. Não prova igualdade integral disco/memória |
| Firewall host | IPv4 INPUT ACCEPT sem regras, IPv6 INPUT ACCEPT sem regras; UFW inactive. FORWARD/Docker não bloqueiam portas do host. Não observada regra 3000/3001; proteção do Postgres é distinta |
| Provedor | Captura DigitalOcean do droplet operacional sem Cloud Firewall associado. IPv6 do droplet não aberto/comprovado. Aviso de backups automáticos ausentes não invalida dumps locais nem prova offsite |
| PM2/systemd | Unit deploy: enabled/inactive, forking, Restart on-failure; boot resurrect, reload all e kill. Não significa que o daemon/apps estejam parados |
| Inventário apresentado | 243 units e 19 timers; nenhum outro explicitamente nomeado PM2/Converta, sem inferir ausência por nome. Root sem crontab; spool somente deploy; rc.local inexistente |
| Cron | Deploy: backup-data duplicado 03:15; media cleanup 03:00; retention 03:30; postgres backup+alert 03:20 e check 04:00. Cron.d persistent backup 02:40; demais entradas de sistema listadas pelo owner |

Portas diretas externas já comprovadas no preflight anterior; INPUT ACCEPT, UFW
inativo e ausência de Cloud Firewall são coerentes com essa exposição. Não houve
nova varredura, nem afirmação de que IPv6 público esteja ativo. Frontend direto e
rewrite /public-api continuam caminhos para a API; RBAC não é fence de manutenção.

### Leituras complementares feitas pelo Codex, sem executar scripts

- Lidos os scripts chamados: backup-data usa flock e remove arquivos antigos após
  14 dias; postgres backup faz dump/list/checksum, retenção configurável (default
  14 dias), e o wrapper/check pode enviar e-mail por canonicalMail. Não foi enviado
  alerta nem executado backup. Locks próprios não coordenam entre rotinas distintas.
- `/usr/local/sbin/re7-converta-backup`: dump custom + list, rsync dos três conteúdos,
  manifest/SHA256SUMS e link latest; retenção remove snapshots não selecionados.
  Não é operação puramente de leitura ou de captura sem descarte. Não inclui
  automaticamente o novo diretório da guarda. Nada foi executado.
- Cleanup de mídia remove arquivos; retention executa soft-delete/anonymize e
  atualiza identidades, OutboundMessage/Event e payloads conforme política. Pode
  alterar evidência necessária à reconciliação; suspender execuções concorrentes
  na janela aprovada. Não foi consultado nem alterado dado de tenant.
- Timezone do servidor lida diretamente: Etc/UTC. Agenda recebida passa a ser
  interpretada em UTC; horários críticos conhecidos vão de 02:40 a 04:00 UTC,
  sem afirmar que os jobs terminam nessa faixa.
- Nginx master/workers observados iniciados em 15/09 07:00:16; mtimes do principal
  e .bak de Converta são 10/08 19:58:24, anteriores ao start do journal do owner.
  Outros vhosts e snippets consultados também são anteriores. Correlação temporal
  compatível; sem imagem da configuração carregada, histórico integral de bytes
  ou todos os includes externos, igualdade disco/memória continua NÃO comprovada.
- Units personalizadas e cron.daily consultados não mostraram chamada adicional
  explícita à API nos trechos lidos. Per-boot cloud scripts vazio; user units de
  deploy ausentes. Isso não certifica automações externas ou unidades root privadas.
- **Novo achado material:** há daemon PM2 de root com PM2_HOME `/root/.pm2`, além
  de deploy. Na fotografia, não havia filhos imediatos desse daemon; seu cgroup
  pertence a sessão de root. Origem/controle de restart não deduzidos dessa sessão.
  Dumps principal/backup e user units root negaram leitura. Não iniciar CLI root
  cegamente (pode criar daemon), não matar esse daemon e não declarar inventário
  de supervisores completo só porque a unit nomeada era única.

Evidências complementares realmente coletadas nesta tarefa ficam privadamente em
`local-evidence/recovery/g0-owner-consolidation/`; essa referência NÃO representa
as saídas/capturas originais fornecidas pelo owner. Nenhum segredo/arquivo privado
entra no commit. Não repetidos implementação, testes, builds, migration ou drift.

### Bloqueadores restantes versus higiene

Bloqueador técnico novo: operador precisa conferir estado vivo/saved/fallback e
iniciadores do PM2 root, bem como automações externas capazes de recriar a API.
Sem isso, cessar a instância deploy não prova que outra não ressuscitará 5ee2de6b.
Pacote específico no runbook; não repetir nginx -T/firewall/crons já entregues.

Gates operacionais preservados: responsáveis nominados; artefatos/configuração
privada disponíveis; guarda host único/persistente; backup fresco + restauração
isolada + chaves/tempo/RPO; inventário de chamadas conhecidas e incertezas; decisão
A sobre primeira interrupção e impacto; validação de atendimento; decisão B
separada para abrir campanhas. Chamadas antigas não observáveis continuam como
incerteza explícita, não como zero. Não presumir needs_review produtivo.

Higiene planejada separadamente: retirar duplicidade do cron backup e mover .bak
Nginx para fora de sites-enabled após revisão própria. Nenhuma dessas correções
foi aplicada ou incluída automaticamente no escopo. A duplicidade Nginx não precisa
ser corrigida para a contenção temporária central proposta, que não depende da
precedência de vhost; a falta de prova disco/memória permanece registrada.

[Complemento executivo com contenção, reversão e gates](../RUNBOOK_WHATSAPP_AGENT.md#g0-consolidado--complemento-executivo-de-27092026).
Próxima aprovação concreta somente após lacuna PM2 root e demais gates: autorizar
contenção temporária da API, suspensão das rotinas concorrentes e parada da versão
antiga com incerteza apresentada, retornando atendimento pela recovery fechada.
Isso não libera migration/campanhas automaticamente. 6683 CLOSED; owner UI/CRA
pendentes; contratos anteriores e materialização DELIVERED/READ separados.


## Complemento PM2 root — leitura owner de 27/09/2026

Complementa 5b391ecb, preservando seu histórico. Fonte **owner**, em sessão
`deploy@re7online-api-01`, executando exatamente o Python do runbook: `dump.pm2
absent`, `dump.pm2.bak absent`, `root_user_units []`. Origens declaradas:
`/root/.pm2/dump.pm2`, `/root/.pm2/dump.pm2.bak` e
`/root/.config/systemd/user`. Não são saídas executadas pelo Codex; não lhes
atribuímos arquivo original ou checksum. Não solicitar novamente essa leitura
nem o pacote G0. Encerra a pendência de leitura desses dois dumps e desse diretório
na fotografia do owner; não atesta ausência de daemon, apps vivas, outros caminhos
PM2_HOME, units carregadas/transientes ou iniciadores.

Leitura complementar Codex, sem sudo/CLI PM2/mutação: o mesmo PID observado segue
com PPID 1 e cgroup de sessão root. Systemd descreve `session-54095.scope` como
`active/abandoned`, `Transient=yes`, em `user-0.slice`. Isso caracteriza um processo
remanescente da sessão; não revela usuário humano/comando histórico, nem cria uma
política de restart do PM2. A consulta loginctl não retornou propriedades úteis;
não foi convertida em prova de ausência. A fotografia anterior sem filhos imediatos
continua temporal, não é certificação de inventário vivo atual.

`user@0.service` está `active/running`, com `Restart=no`; é o gerenciador de user
units, não uma unit comprovada de PM2 root. Referências literais a PM2/API nos
arquivos acessíveis de `/etc/systemd/system`, `/run/systemd/system`,
`/etc/systemd/user` e `/usr/lib/systemd/user` apontaram somente para
`pm2-deploy.service` e seu link de enablement. Reutilizadas as leituras anteriores
de cron, units personalizadas e per-boot: nenhum iniciador automático root PM2
foi identificado nesse escopo. Busca literal não exclui wrappers indiretos ou
arquivos inacessíveis. Não repetir o inventário G0.

**Distinção:** origem histórica exata desconhecida; nenhum mecanismo automático
atual de restart do PM2 root foi comprovado. O mecanismo efetivamente comprovado
é o resurrect/restart de PM2 **deploy**, já tratado no plano. Root ainda pode
criar apps manualmente/por automação; ausência de dumps não impede `pm2 start`.
Não declarar que existe um supervisor root reiniciando a API sem evidência.

**Controle de supervisores ainda não integralmente comprovado:** falta a projeção
das units carregadas/habilitadas do gerenciador root ativo, inclusive transientes,
e identificar com o responsável automações externas/acessos de manutenção capazes
de invocar PM2 como root durante a janela. O runbook contém um único bloco mínimo
para a primeira lacuna; não lê env, argumentos de comandos, chaves ou histórico.
Origem histórica desconhecida, isoladamente, não é bloqueador: fechar o gate pelo
controle atual, não por uma investigação forense indefinida. Se nenhuma unit
iniciadora for encontrada e os responsáveis controlarem os outros iniciadores,
registrar esse escopo e rever a árvore imediatamente antes da parada autorizada.

Próxima ação: operador executa apenas a projeção residual e nomeia o responsável
pelo bloqueio de novas intervenções/automações; Codex relaciona eventuais entradas
aos controles específicos do plano. Backup fresco/restauração isolada, responsáveis
da transição e decisão owner sobre chamadas incertas são requisitos independentes,
ainda não satisfeitos por esta leitura. Sem operação, testes/builds ou mudança
funcional. NOT DEPLOYED / OWNER UI PENDING; 6683 CLOSED; materialização separada.
