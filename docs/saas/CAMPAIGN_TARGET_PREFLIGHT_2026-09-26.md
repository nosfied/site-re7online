# Preflight somente leitura — campanhas, 2026-09-26

## Estado vigente — janela SECULT de 29/09/2026

**Código implantado; ativação SECULT e aceite funcional pendentes.** API/frontend
`a3d16d4b`, worker mínimo `bf5f1d76` + cinco fontes `f06d49cb` (pacote `042e386a`).
[Fechamento técnico, backup, horários, limites e retorno](SECULT_ROLLOUT_2026-09-29.md).
Campanhas reabertas (geração 5), scheduler observado; Inbox/CRM confirmados pelo
owner. Chave permanece desligada em todos os tenants: falta sessão legítima ou
grant de suporte existente para o setter SECULT. Sem contorno de RBAC/SQL.
Compatibilidade de API/worker/scripts deve ser mantida; retorno a escritores antigos
perde a garantia concorrente. Primeira interrupção autorizada não comprova drain
retroativo do worker. Campanhas/CRA aguardam validação funcional do owner; DB-only
encerrada, inatividade no Guia pausada, 6683 CLOSED. Registros abaixo preservam
o escopo e o estado histórico de cada etapa.


> Atualização local 29/09 — [alternativa mínima e parada do worker](SECULT_DEPLOY_PLAN_2026-09-29.md):
> base bf5f1d76 reproduz o bundle alcançável; backport de cinco fontes f06 recomendado
> para revisão. G1/G2 continuam abertos. 45+30 testes PASS; quatro reproduções mostram
> shutdown inseguro, não drain aprovado. Proposta de correção separada não implementada.
> Rollback antigo perde garantia de concorrência; revogar em código SECULT exige
> escritores compatíveis. Produção intacta, SECULT não ativada; campanhas/CRA aguardam owner.


> Atualização vigente: etapa A executada em 27/09 à noite, registrada ao final.
> API em recovery 03f930e5, campanhas permanentemente fechadas. Candidato a1cc380e
> NOT DEPLOYED / OWNER UI PENDING. Seções anteriores preservam o histórico.

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

> Histórico de 082a8946: a projeção PYROOTLIVE foi recebida e encerrada no
> complemento seguinte. Não repetir a solicitação residual registrada abaixo.

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


## Root user manager — projeção recebida e coleta encerrada

Fonte: leitura manual do **owner em 27/09/2026**, bloco PYROOTLIVE de 082a8946,
reportado sem erros. Não executada pelo Codex; não inventados arquivo original ou
hash dessa saída. Pendência de obter a projeção **ENCERRADA**, sem solicitar
repetição de PYROOTLIVE, dumps ou pacote G0.

| Evidência fornecida | Resultado |
| --- | --- |
| Serviços carregados | dbus, dirmngr, gpg-agent, keyboxd, launchpadlib-cache-clean, pk-debconf-helper e snapd.session-agent: inactive/dead; systemd-remount-fs: not-found/inactive/dead |
| Sockets carregados | dbus, dirmngr, gpg-agent-browser/extra/ssh, gpg-agent, keyboxd, pk-debconf-helper e snapd.session-agent: active/listening |
| Timer carregado | launchpadlib-cache-clean.timer: active/waiting |
| Metadados carregados | Transient=no e DropInPaths vazio em todas as units exibidas; serviços Restart=no; FragmentPath /usr/lib/systemd/user/<unit>, exceto not-found |
| Unit files enabled | session-migration.service; dirmngr.socket; gpg-agent-browser/extra/ssh e gpg-agent.socket; keyboxd.socket; pk-debconf-helper.socket; launchpadlib-cache-clean.timer |
| Generated | autostarts app-at\x2dspi\x2ddbus\x2dbus@autostart, app-snap\x2duserd\x2dautostart e app-xdg\x2duser\x2ddirs@autostart (services) |
| Disabled | systemd-tmpfiles-setup.service, snapd.session-agent.socket, systemd-tmpfiles-clean.timer |
| Static | services at-spi-dbus-bus, dbus, dconf, dirmngr, gpg-agent, keyboxd, launchpadlib-cache-clean, pk-debconf-helper, snapd.session-agent, ssh-agent, systemd-exit, systemd-tmpfiles-clean; dbus.socket |

Não houve unit explicitamente PM2/Converta na projeção. Essa observação **não**
exclui iniciadores indiretos pelo nome. Correlacionada às leituras anteriores dos
arquivos acessíveis de systemd/cron/per-boot, sem referência root PM2 encontrada,
a projeção não fornece indício material novo que justifique abrir outra rodada
de leitura de conteúdo. Não foram acessados produção, serviços ou CLI PM2 nesta
consolidação. Units enabled/generated não foram confundidas com serviços ativos;
sockets ativos podem ativar serviços, e Restart=no não exclui outras ativações.

O daemon root observado permanece evidência histórica distinta: PPID 1 em scope
de sessão active/abandoned. O scope de sessão era transiente; as user units agora
reportadas não são transientes — não há contradição entre objetos diferentes.
Dumps ausentes, user dir vazio e ausência de filhos na fotografia anterior não
provam ausência de daemon/aplicações atuais. Nenhum mecanismo automático root PM2
foi comprovado; o resurrect/restart deploy continua mecanismo conhecido a controlar.
Origem histórica desconhecida não sustenta investigação indefinida: **coleta dirigida
PM2 root encerrada no escopo disponível**, sem certificar ausência universal de
iniciadores nem declarar controle operacional já implantado.

**Pendências materiais:** owner ainda não confirmou responsáveis e controles de
intervenções manuais/automações externas capazes de criar API/PM2 como root ou
deploy. Nomear quem controla acessos/deploy hooks e quem executa/verifica o plano
na janela; se uma automação concreta for declarada, mapear seu controle específico.
Não pedir prova abstrata de inexistência de todos os iniciadores possíveis.
Backup fresco + restauração isolada, operador/DBA nominados, RPO/limite de
indisponibilidade e decisão sobre chamadas antigas conhecidas/incertas continuam
requisitos independentes. A verificação de árvore/portas e saved/boot antes da
parada é controle temporal de execução, não repetição da auditoria G0.

**Próxima decisão concreta:** owner nomeia os responsáveis e confirma o controle
de intervenções/automações durante a janela. Com backup/restore e incertezas
apresentados, decidir A: contenção API, suspensão das rotinas selecionadas,
parada antiga e retorno pela recovery fechada, com impacto/reversão já descritos.
Nenhuma autorização operacional inferida desta leitura; migration e abertura B
permanecem separadas. NOT DEPLOYED / OWNER UI PENDING; CRA pendente; 6683 CLOSED;
DELIVERED/READ → HUMAN/WAITING separado; nenhuma quiescência retroativa.


## Preparação da noite de 27/09/2026 — decisão A ainda não executada

Referência documental 8d2b0e01. Owner informou plataforma sem uso por ele nesta
noite (America/Fortaleza), nomeou **Deifson Oliveira** responsável operacional e
confirmou intervenções somente Deifson/Codex, em execução única sem deploy paralelo.
Deifson executa comandos com senha na própria sessão; Codex não solicita senha.
Isso encerra a pendência de nomeação/coordenação, não prova ausência de webhooks,
trabalho de outros tenants, schedulers ou chamadas em voo. Horário final do owner
foi solicitado e permanece não informado nesta preparação.

### Estado e ações realmente executadas

Produção reconfirmada em 5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e; tracked limpo,
apenas dados do worker untracked. API/front/worker mantiveram os mesmos PIDs,
status online e contadores de restart antes/depois. pm2-deploy continua
inactive/enabled. Nenhum serviço produtivo parado/iniciado/recarregado, cron/boot/
firewall alterado, migration executada, provider chamado ou envio realizado.
Releases novas foram escritas fora do checkout ativo, sem ativação. Não repetido G0.

Antes: disco 42.591 MiB livres, RAM disponível 911 MiB, swap usada 283 MiB;
após preparação: disco 41.196 MiB livres, RAM disponível 971 MiB, swap usada
371 MiB, load 0,11/0,11/0,04. São amostras, não medição de pico nem prova de ausência
de impacto. Restore/builds ficaram na máquina local (cerca de 7,9 GiB RAM disponível
antes), para não disputar essa carga com a VPS. Nenhuma limpeza/permissão histórica
corrigida. Diretórios/arquivos novos privados; retenção problemática anterior intacta.

### Backup fresco e restauração comprovada, com limites

Destino persistente privado:
`/opt/re7online/backups/converta-persistent/preparations/night-20260927T233110Z`.
Captura 20:31:10–20:31:21 Fortaleza; pg_dump custom: **4,432 s**, 21.738.573 bytes,
SHA256 `c731aac4d9f93a500b64ab945f950b77c3a7079a1dbb54ec4220cf3d7e41770a`.
Checksum + catálogo conferidos. Rotina própria sem descarte, com lock do backup,
sem executar scripts de retenção, sem atualizar latest e sem apagar snapshots.
Conteúdo 471.470.080 bytes (4,321 s); dados runtime 17.121.280 bytes (0,328 s);
configuração/chaves/PM2 saved+fallback privados 71.680 bytes. Manifests/hashes no
destino. Configurações das releases também preservadas em tar privado separado.

Dump copiado com hash idêntico e restaurado em **cluster local PostgreSQL 16 novo,
sem listener TCP**, socket privado e sem aplicação/integrações durante restore.
pg_restore --exit-on-error --no-owner --no-privileges: **4,299 s, exit 0**;
66 tabelas, 10 tenants, 104 campanhas, 13.477 inbound, 12.924 outbound,
172.617 eventos, zero constraints não validadas. Cliente pg_restore: RSS máximo
8.152 KiB (não inclui o servidor PostgreSQL). Primeiro startup falhou somente
pelo path de socket >107 bytes; corrigido para path privado curto, sem reset/dados
apagados. Cluster local desligado ao fim; cópia preservada, nunca restore produtivo.
Conteúdo/runtime/config também copiados, hashes conferidos e extraídos isoladamente:
715/395/4 arquivos; transferência+extração 47,469/4,139/2,431 s respectivamente.
Não é backup offsite automatizado/gerenciado; há cópia local privada nesta estação.

**Chaves:** 85/85 ciphertexts de seed de campanha decriptados no restore; 9/10
segredos de canal. O restante é telegramBotToken, registro configured e conta
connected, com IV de 4 bytes/tag de 9 bytes, incompatível com a estrutura emitida
pelo código (12/16). A chave efetiva preparada coincide com .env copiado; saved
PM2 não contém outra chave. Não presumir que rotação de chave corrigiria o formato.
Nenhum segredo/destinatário foi exposto e nenhum provider foi consultado.
MFA/webhook: chaves presentes, zero ciphertexts no dump; não alegar decriptação
exercitada nesses domínios. A limitação Telegram já está na cópia do banco anterior
à troca; não foi criada por migration/recovery e não foi corrigida incidentalmente.
Owner precisa dar destino explícito a essa limitação antes de afirmar atendimento
integral: esclarecer/restaurar segredo em tarefa autorizada separada, ou aceitar
essa restrição de canal de forma explícita. Não mascarar como recuperação total.

Filesystem capturado vivo não é atômico com DB e sessão Web ativa não teve restore
funcional validado; worker/sessões originais seguem preservados in-place. Writes
posteriores ao dump continuam possíveis: RPO não é zero e novo ponto de preservação
será necessário antes de migration, em decisão separada. Não usar dump como rollback
normal, pois perderia inbound/aceites/escritas posteriores.

### Releases e tempo de recuperação medido

Preparadas em `/opt/re7online/releases/<SHA>`:
- candidato a1cc380eddcd1467b8e0d3a8e405f82689a25b3d;
- recuperação 03f930e5453efd313a91a16de3e22057a0573d9c.

Fontes por git archive do SHA exato, dependências próprias, Prisma Client gerado
somente na área nova e compilação de empacotamento (77,235/52,063 s locais); sem
suítes repetidas e sem migration. Client anterior apresentava formatação/ordem de
atributos; artefato novo gerado do schema fixo. Um pacote inicial de recovery tinha
links externos de dependências: marcado **não utilizável**, preservado; substituído
por recovery-standalone.tar.gz, com materialização adicional de 40,481 s. Release
instalada não contém esses links; .data foi vinculada intencionalmente ao storage
persistente original APÓS validação das dependências.

Hashes dos arquivos de release conferidos no alvo (7.913/7.895), extração+verificação
9,669/9,209 s. Sintaxe e construção de PrismaClient sem conectar no Node 20.20.0
produtivo passaram. private prepared.ecosystem.cjs em cada release preserva env
efetivo/configuração/chaves, cwd/script exatos, paths absolutos de conteúdo e .data
existente, host único e guard compartilhado. Ambos com scheduler de campanhas
inibido na configuração preparada. Recovery permanentemente fechada em código.
Candidato não é ativado em A; sua configuração final de scheduler exige fase própria.
Guarda `/var/lib/re7/campaign-operations/state.json` **ainda não provisionada**.

Medição local da recovery exata: **0,829 s até bootstrap DB read + health 200**, em
namespace de rede novo com somente loopback, role somente leitura sobre restore,
sem segredos produtivos, fallback de tenants desligado e schedulers campaign/chatbot
desativados. Node local 22.13.0, diferente do alvo: não é medição de startup real da
VPS nem validação de Inbox/CRM/webhooks/provider. Ao encerrar o probe, SIGTERM não
terminou em 10 s; somente esse processo isolado foi finalizado forçadamente.
Não atribuir drain à parada PM2 nem tratar limite técnico local como SLA de retorno.

### Campanhas, sinais e decisão

Às 20:39:06: 104 campanhas (85 completed/12 cancelled/5 failed/2 draft), zero
scheduled vencidas/futuras. 61 submit_started e 61 provider_accepted, todos com
OutboundMessage correlacionado por tenant+messageId; 16 test-send requests, todos
com resultado (10 sent/6 failed). Nenhum evento de reconciliation_required nas
consultas. Tail limitado dos logs: quatro erros históricos do scheduler em 18/09
e seis falhas de template em 21/09; sem transformar leitura parcial em prova de
quiescência. Chamadas antigas sem registro continuam com **quantidade desconhecida**.
Não reenviar, reconciliar ou classificar incerteza como rejeição.

Comandos privados preparados, **não aplicados**, no destino de preparação:
DECISION_A_COMMANDS.md, api-fence.nft, originais e versões propostas de crontab
(6 entradas deploy + 1 cron.d). nft --check privilegiado e inexistência da tabela
proposta ainda precisam da leitura de Deifson; comandos enviados sem pedir senha.
Permanece necessário acesso superadmin privado para conferir guard no retorno;
OPS_CURL não foi criado/autenticado nesta etapa.

**Janela recomendada, condicional:** não iniciar A enquanto faltarem check nft,
disposição da limitação Telegram e horário final confirmado. Como limite de
planejamento desta noite, propor início **até 23:00 Fortaleza**, escalonamento
imediato se retorno/validação não fechar em **20 minutos**, e replanejar se isso
invadir o horário final do owner. Esses 20 minutos são reserva operacional proposta
para etapas manuais/validação, NÃO duração comprovada de recuperação nem autorização
ou disponibilidade presumida. Primeiro cron concorrente conhecido 23:40 (02:40 UTC);
não deixar a execução avançar até ele sem controle explícito dos holds. Medidas de
restore/bootstrap não garantem retorno se houver falha de configuração/atendimento;
nesse caso campanhas ficam fechadas e pode persistir indisponibilidade, sem retorno
automático ao runner antigo. Owner precisa aceitar essa contingência em A.

Próxima decisão concreta, após gates: autorizar somente contenção → parada antiga →
retorno pela recovery fechada, com intervalo finito e limitação Telegram explícita.
Migration e abertura de campanhas continuam decisões separadas. NOT DEPLOYED /
OWNER UI PENDING; CRA pendente; 6683 CLOSED; materialização DELIVERED/READ separada.


## Etapa A concluída — 27/09/2026, America/Fortaleza

Autorização explícita do owner após preparação 0e98af9a: contenção, parada antiga,
retorno pela recovery 03f930e5; NÃO migration/candidato/abertura. Deifson confirmou
acompanhamento até a conclusão, execução única Deifson/Codex, ausência de uso
informada sem atribuir quiescência, aceitação das incertezas e do ponto de
escalonamento de 20 min. Telegram não usado; limitação preexistente aceita para
trabalho futuro, sem correção ou validação daquele canal. Owner forneceu nft check
sem erro/tabela ausente; não foi pedido reenvio. Login privado confirmado; GET
administrativo com credencial global já configurada, autorizada pelo owner,
usada somente em memória no VPS, sem expor senha/token.

### Linha do tempo e atribuição

Horários Fortaleza de 27/09; registros UTC correspondem a 28/09 após 00:00.

| Horário | Ação / evidência |
| --- | --- |
| 21:08–21:10 | Hashes recovery/backup, config, processos, ausência de tarefas concorrentes e fotografia de campanhas conferidos por Codex; nenhuma divergência de dados detectada |
| 21:18:19 | Codex suspendeu exatamente seis entradas cron deploy; original preservado |
| Até 21:21:43 | Deifson suspendeu cron.d e desabilitou boot; Codex confirmou inactive/disabled, holds exatos, API/front/worker intactos e ausência de jobs concorrentes |
| 21:22:54 | Deifson aplicou tabela inet temporária; loopback recusado; Codex confirmou porta direta recusada e proxies HTTPS 502 |
| 21:23:46–21:23:48 | Codex retirou somente API antiga; PID/listener encerrados, saved/fallback sem API, worker/front preservados |
| 21:25:36 | Após mkdir privado por Deifson, Codex criou state.json com O_EXCL, 0600 e fsync, fechado; nenhum estado anterior sobrescrito |
| 21:25–21:28 | Tentativas de startup expuseram dois defeitos da configuração preparada, descritos abaixo; contenção mantida |
| 21:29:56–21:29:59 | Recovery efetiva iniciada/verificada no cwd/script corretos; PID 1478445, watch=false, scheduler campanhas desativado |
| 21:30:53 | Deifson removeu somente tabela temporária; 64 pacotes/3.632 bytes no contador antes da remoção |
| 21:31:26 | Owner confirmou health DB ok; Codex confirmou HTTP 200 em Converta/API/alias admin e frontend |
| Até 21:33:50 | Owner confirmou Inbox e CRM do tenant demo funcionando com sessão; Codex confirmou GET superadmin da guarda, salvou/fixou fallback seguro e restaurou cron deploy |
| Até 21:35:28 | Deifson restaurou cron.d e boot; Codex verificou originais exatos, inactive/enabled e runtime seguro |

Interrupção HTTP por contenção: **7 min 59 s**, de 21:22:54 a 21:30:53.
Retorno/validação ocorreram antes do escalonamento 21:42:54. Esse resultado não
é promessa para próximas janelas, nem comprovação de ausência de perda/retry inbound.

### Incidentes da execução — não omitir nem reutilizar configurações inválidas

1. Crontab rejeitou o caminho absoluto longo, truncando o filename. Cadastro foi
   conferido intacto; aplicado/restaurado o MESMO arquivo com nome relativo no cwd
   de preparação. Sem alteração de conteúdo ou correção de duplicidade histórica.
2. `prepared.ecosystem.cjs` não foi reconhecido como arquivo de configuração pelo
   PM2; foi iniciado como script `prepared.ecosystem`, sem API. A entrada incidental
   foi removida isoladamente. Sufixo `.config.cjs` é necessário nesse PM2.
3. A cópia do ambiente inicial continha metadados internos PM2. Após corrigir o
   sufixo, esses campos sobrescreveram cwd/script e criaram **uma instância do código
   antigo** (PID 1477765), apesar do build/env pretendido. Bootstrap observado
   21:27:05; detectada 21:28:15 e parada 21:28:17. A contenção permaneceu aplicada,
   scheduler de campanhas estava `true` para DISABLED; nenhum saved/fallback dessa
   tentativa foi publicado. Isso foi uma inicialização indevida, não retorno
   planejado à versão antiga. Não afirmar que o código antigo permaneceu ausente
   durante toda a troca. Não inferir ausência absoluta de efeitos não registrados.

A correção removeu 72 chaves internas/herdadas inadequadas da configuração da
recovery, preservando variáveis de aplicação, e fixou script/cwd/watch explicitamente.
Configuração vigente privada:
`/opt/re7online/releases/03f930e5453efd313a91a16de3e22057a0573d9c/stage-a.ecosystem.config.cjs`.
SHA256 `3f30d92c466ce0f5ba21e8fc125045048be56966fd0558bbe8fcc07311e11790`.
Arquivos anteriores e logs preservados. Sem modificação funcional do artefato Git.
**Não usar prepared.ecosystem.cjs nem prepared.ecosystem.config.cjs da tentativa.**
A configuração preparada do candidato compartilha esse defeito de montagem e
permanece inválida para ativação; corrigir e verificar em autorização futura, sem
iniciar candidato agora. Manifest de código não valida semântica de configuração PM2.

### Estado final comprovado

API: recovery **03f930e5453efd313a91a16de3e22057a0573d9c**, script/cwd sob seu release,
PID 1478445, online, zero restarts, watch=false. Frontend 1039702 e worker 3747763
mantiveram PIDs/restarts; subprocesso frontend e sessões worker não foram trocados.
Checkout original continua HEAD 5ee2de6b, tracked limpo: isso descreve frontend/
worker, NÃO a versão efetiva da API. Saved e fallback idênticos, inspecionados com
API apontando para recovery e flags fechadas; boot restaurado inactive/enabled,
sem start/reload da unit global. Não ensaiado reboot/resurrect real nesta janela.
Cron deploy e cron.d restaurados byte a byte, sem catch-up ou retenção manual.
Tabela temporária removida pelo owner; rotas retornaram, nenhuma regra global limpa.

Guarda persistente `/var/lib/re7/campaign-operations/state.json`, diretório
deploy:deploy 0700, arquivo 0600; filesystem ext4 e ancestrais sem symlink.
GET `/admin/ops/campaign-execution` autenticado: HTTP 200, available=true,
open=false, generation=0, build03f930e5, taskCount=0, drained=true; sem lock ou
marcador uncertain no check final. **drained só descreve o novo ledger**, não
encerra chamadas antigas/incertezas aceitas pelo owner. Recovery bloqueia abertura
em código, não depende apenas do scheduler inibido. Não houve POST para abrir.

Às 21:32:55, agregados iguais ao antes: 104 campanhas, zero scheduled, 61 intents
+61 aceites com Outbound correspondente, 16 test-sends com resultado. Nenhum
reenfileiramento/reenvio/reconciliação executado. Essa evidência não comprova
inexistência de chamada antiga sem registro. Não foi provocado provider/send na
validação; não prometer observabilidade completa de tráfego de fundo.
Owner confirmou somente leitura de Inbox/CRM no tenant demo; demais tenants,
webhooks reais, envio e retries não receberam aceite funcional por essa leitura.
Telegram permanece não validado, separado. Nenhum aceite CRA ou owner UI do candidato.

### Requisitos para a próxima decisão (migration)

- Autorização específica para **somente migration aditiva**, mantendo recovery
  fechada/atendimento; ativação do candidato e abertura não ficam implícitas.
- Novo ponto de backup imediatamente antes da migration, sem descarte, hashes e
  capacidade conferidos: o backup 20:31 foi restaurado, mas houve writes possíveis
  após ele. Incluir guarda completa/auxiliares e configuração ativa corrigida.
  Reutilizar prova de restore, sem alegar RPO zero ou restore produtivo.
- Conferir que somente `20260925143000_add_campaign_execution_queue` está pendente,
  que checksums/artefatos não mudaram e que recovery/guarda/supervisão continuam
  corretos. Não repetir auditoria de drift nem alterar drift histórico incidental.
- Definir ponto de abortar/escalonar diante de locks/erro de migration, preservar
  dados/aceites e permanecer em recovery; não down/reset/db push ou dump sobre
  produção como rollback normal. Plano de observação de impacto aprovado pelo owner.
- Antes de qualquer ativação futura do candidato: gerar configuração sem metadados
  internos PM2, sufixo reconhecido, paths/host/guard corretos; comprovar resolução
  efetiva. Essa correção operacional é gate da ativação, não autorização para fazê-la.

**Etapa A concluída; recovery ATIVA. Candidato a1cc380e NOT DEPLOYED / OWNER UI
PENDING. Migration NÃO executada.** 6683 CLOSED; DELIVERED/READ → HUMAN/WAITING
continua separado; sem reabertura de desenho, testes/suítes ou implementação.


## Migration aditiva aplicada com recovery fechada — 27/09/2026

Complemento ao fechamento **87335585**, sob autorização explícita do owner para
backup novo, somente `20260925143000_add_campaign_execution_queue` e preparação
inativa da configuração candidata. Este registro atualiza o estado; os registros
anteriores de migration pendente/configuração inválida permanecem como histórico.

### Backup e gates efetivamente conferidos

Antes do DDL: recovery 03f930e5 PID 1478445/zero restarts, guarda fechada, frontend e
worker com os mesmos PIDs; saved/fallback idênticos e seguros, boot inactive/enabled,
crons originais. Manifest recovery 7.895 e candidato 7.913 arquivos conferidos; SQL
idêntico ao commit a1cc380e. Espaço antes 43.206.623.232 bytes, depois 42.691.031.040.
Nenhuma rotina concorrente, transação longa ou lock esperando. Três advisory locks
de aquisição de sessão existentes, idle/sem transação, não conflitam com a chave
Prisma; preservados, sem encerramento de sessões alheias.

Backup persistente novo:
`/opt/re7online/backups/converta-persistent/preparations/migration-20260928T005604Z/`.
Captura 21:56:04–21:56:15 America/Fortaleza; pg_dump custom 5,005 s, catálogo
`pg_restore --list` e SHA256SUMS verificados. `database.dump`: **21.742.438 bytes**,
SHA256 `2b4a0a1d325914b5251be25c7dc18194e92ff3e1506439e6b571766ce4d5c847`.
Inclui content.tar, runtime-data.tar, private-config.tar (guarda/auxiliares presentes,
configuração recovery corrigida, .envs, saved/fallback, cron.d e configuração candidata
nova), crontab deploy e unit PM2. Guarda estável/fechada durante cópia. Diretório
privado, sem descarte, sem atualizar latest, sem executar rotinas de retenção.

**Distinção de restore:** foi reutilizada a restauração isolada do dump anterior
`night-20260927T233110Z/database.dump`, SHA256
`c731aac4d9f93a500b64ab945f950b77c3a7079a1dbb54ec4220cf3d7e41770a`, 4,299 s,
66 tabelas/104 campanhas. O dump fresco NÃO foi restaurado: hash e catálogo foram
verificados, conforme autorização para reutilizar o ensaio. Cópia viva de arquivos
não é snapshot atômico com DB; sem prova de consistência de restauração das sessões,
RPO zero ou cópia offsite. Worker/sessões permaneceram em execução.

### Resultado real da migration e impacto observado

Antes: 59 migrations concluídas (65 registros históricos, incluindo rollback antigo),
zero falhas pendentes e somente a fila pendente. Todos os checksums concluídos
correspondem ao release. `Prisma migrate deploy --schema <release>/apps/whatsapp-agent/prisma/schema.prisma`
do candidato a1cc380e, sem iniciar aplicativo/scheduler. Execução 21:57:40–21:57:44,
**3,238 s**, exit 0. Registro PostgreSQL iniciou 00:57:43.843413Z e terminou
00:57:44.031119Z (aproximadamente 188 ms). Depois: **60 concluídas, zero falhas,
nenhuma pendente**, migrate status exit 0. Checksum no Git/release/banco:
`3c2d73af6aa9612854856b5763e1fab76d3fac79ed725daeb7851fe55e9791ad`.

Conferidos quatro objetos novos: CampaignExecutionBatch, CampaignExecutionBatchCampaign,
CampaignExecutionJob e TenantCampaignExecutionLease; 60 colunas/tipos/nullability,
4 PKs, 8 FKs validadas com destinos/colunas e CASCADE corretos, 17 índices incluindo
PKs, ordem/unicidade/validade dos índices explícitos. Zero linhas nas quatro tabelas.
Não houve db push/reset/resolve/down, outra migration ou correção de drift histórico.

Limites somente nas conexões da operação: lock_timeout 5s, statement_timeout 30s,
connect_timeout 5s, socket_timeout 40s, subprocesso 60s. Settings confirmados pelo
Prisma Client usando a mesma URL parametrizada; sem ALTER ROLE/configuração global.
Uso de `options` suportado pelo [conector Prisma PostgreSQL](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql).
Se prazo/erro: preservar estado/logs, permanecer em recovery fechada, nenhum
resolve/down/restore automático; eventual término limitado ao grupo de processos
da própria invocação. Nenhum timeout ou cancelamento ocorreu.

Coordenação: flock exclusivo de backup durante captura e novamente no deploy;
nenhuma tarefa concorrente nos gates. Limite de início definido em 02:10 UTC/23:10
Fortaleza, antes da primeira rotina 02:40 UTC/23:40. Execução terminou 21:57, sem
necessidade de suspender crons/supervisão. Não confundir com os holds da etapa A.

Depois do DDL: API recovery 03f930e5 no mesmo PID/zero restarts; frontend/worker
preservados. Health loopback e duas entradas públicas HTTP 200/db ok. GET superadmin
guarda HTTP 200, available=true/open=false/generation 0/build 03f930e5/tasks 0. Owner
confirmou **Inbox e CRM funcionando**, na sessão privada demo, somente leitura.
Nenhuma interrupção de atendimento observada; não houve monitoramento contínuo de
latência, aceite de todos os tenants ou prova de inbound/retries. Contagens 104
campanhas (85 completed/12 cancelled/5 failed/2 draft), zero scheduled, 61 intents
+61 aceites com Outbound, 16 test-sends com resultado, permanecem iguais. Sem
campanha de teste/envio/provider provocado. Incertezas antigas não são encerradas
por essas contagens nem pelo drained do ledger novo.

### Configuração candidata preparada, sem ativação

Novo arquivo privado 0600 no release a1cc380e:
`migration-prepared.ecosystem.config.cjs`; SHA256
`84175271e80f847e5d196d0c7a0ef996e50d34f021968cb23b18eaf666b8c60a`.
78 chaves de aplicação da .env, valores efetivos da configuração recovery válida,
PATH explícito e flags de campanha; sem copiar ambiente bruto/metadados PM2/SSH/SUDO.
Script/cwd absolutos do candidato, node explícito, uma instância fork, watch=false.
Mesma guarda persistente/host single-host, scheduler desabilitado; recovery-only=false
apenas no arquivo candidato inativo, sem alterar flags do processo recovery.

**Prova de resolução:** PM2 instalado 6.0.14, funções puras Common.isConfigFile,
parseConfig e prepareAppConf, em processo separado com ambiente reduzido. Verificados
script/cwd/exec_mode/watch e ausência de chaves env capazes de sobrescrever identidade
no merge. Não houve daemon RPC/start, importação do app, scheduler nem provider.
Isso comprova resolução, **não comprova startup produtivo do candidato**. Arquivos
prepared antigos inválidos preservados e continuam proibidos para uso.

Evidência privada completa junto ao backup novo e localmente em
`local-evidence/recovery/migration-20260927/`, fora do Git. Apenas documentação
publicada. **STOP operacional:** recovery ATIVA/fechada; migration APLICADA;
candidato a1cc380e **NOT DEPLOYED / OWNER UI PENDING**, CRA pendente. Próxima decisão
separada é ativar candidato inicialmente fechado, após reconfirmar gates/configuração;
abertura é outra decisão. Telegram não validado/sem correção, 6683 CLOSED,
DELIVERED/READ → HUMAN/WAITING separado; owner PASS anterior preservado.


## Candidato ativado com campanhas fechadas — 27/09/2026

Complemento a **06f27fb1**, sob autorização explícita para backend a1cc380e e
frontend correspondente, sem abertura e sem habilitar scheduler de campanhas.
Este estado sucede os registros históricos de candidato NOT DEPLOYED; não altera
aceites anteriores nem transforma a validação de atendimento em aceite CRA/lotes.

### Preparação e artefatos

Reconfirmados 60 migrations concluídas/sem pendências, quatro tabelas da fila
vazias, guarda closed/generation 0/tasks 0/sem marcador uncertain, recovery e
supervisores esperados. Backend: 7.913 arquivos do manifest e configuração corrigida
conferidos. Nenhuma rotina concorrente nos gates; nenhum filho imediato no daemon
PM2 root observado, sem repetir G0 ou executar CLI PM2 root.

Backup DB e auxiliares `migration-20260928T005604Z` reutilizados: hashes conferidos,
feito cerca de 24 minutos antes da troca; esta etapa não altera schema nem usa
restore como retorno. Reutilizado ensaio isolado anterior já identificado no registro
da migration. Não há garantia de RPO zero/restauração de sessões. Nova captura
**somente operacional**, necessária para preservar o estado exato antes da troca:
`/opt/re7online/backups/converta-persistent/preparations/activation-20260928T011150Z/`.
Inclui configurações, guarda, saved/fallback, frontend env/manifest/BUILD_ID,
crons e configuração limpa para retornar ao frontend anterior. Sem descarte.

Frontend compilado uma vez em área local isolada a partir do git archive exato
**a1cc380eddcd1467b8e0d3a8e405f82689a25b3d**, com env frontend privado existente;
package/lock/Next config iguais à base anterior. Build Next 16.1.5 concluído; aviso
sobre inferência de workspace root registrado, sem falha de compilação. Artefato
26.471.174 bytes, SHA256
`aa8cfdd1c30d6dd4fa6dca57bff1c2057689a2aa5123436affcb012d6937763d`,
1.843 arquivos no manifest. Instalado em `<release-a1cc380e>/frontend`, dependências
copiadas para esse diretório, sem sobrescrever a árvore servida anteriormente.
BUILD_ID **esJVODIxT1rETZKxEPdX5**. Frontend anterior permanece intacto no checkout
5ee2de6b, BUILD_ID Ywhs03ZOWIsb-IppyXqEJ; recovery 03f930e5 também disponível.
Não repetidas suítes aprovadas/build backend, pois código não mudou.

### Execução e estado efetivo

Horários America/Fortaleza, em 27/09 (UTC em 28/09):

- 22:19:05: crontab deploy temporariamente suspenso pelo Codex após gates.
- 22:19:42: Deifson suspendeu cron.d backup, desabilitou boot sem --now e aplicou
  contenção revisada/check nft nas portas 3000/3001. Nenhuma regra anterior removida.
- 22:20:16–22:20:25: Codex retirou somente API recovery, iniciou candidato com
  `migration-prepared.ecosystem.config.cjs` e ambiente reduzido; conferiu identidade;
  depois retirou somente frontend anterior e iniciou frontend correspondente.
  Sem duas APIs concorrentes, kill/reload all, reinício de worker ou env PM2 bruto.
- 22:21:14: listeners, processos, guarda e saved/fallback candidato conferidos;
  logs novos de erro API/frontend vazios, zero restarts. Arquivos anteriores salvos.
- 22:21:51: Deifson retirou somente tabela temporária; 31 pacotes rejeitados.
  Contenção total **129 segundos (2min09s)**; não é garantia de inbound/retries.
- 22:25:41: após health/diagnóstico e confirmação visual do owner, Codex restaurou
  crontab deploy original. Deifson restaurou cron.d e habilitou boot, sem iniciar
  unit global. Às 22:27:38, ambos crons byte a byte e boot inactive/enabled conferidos.

| Componente | Versão/identidade efetiva | Estado final |
| --- | --- | --- |
| API | a1cc380e; PID 1489424; `<release>/apps/whatsapp-agent/dist/index.js` | online, zero restarts, watch=false |
| Frontend | a1cc380e; PID 1489466; `<release>/frontend/node_modules/next/dist/bin/next`; BUILD_ID acima | online, zero restarts, watch=false |
| Worker | checkout 5ee2de6b; PM2 PID 3747763/filho 3747829 | preservado; restarts 626 inalterado |
| Recovery | 03f930e5; stage-a.ecosystem.config.cjs | disponível para retorno; não ativa |

Identidade não inferida apenas do nome/build env: cwd/exe reais em /proc, entrypoint
pm_exec_path do processo (carregado pelo fork container PM2), script/cwd PM2,
hash do entrypoint/manifest, flags reais e host conferidos. O título/argv do Node
pode truncar caminho; não foi usado como prova isolada. API efetiva confirmou build
via diagnóstico e frontend confirmou BUILD_ID no HTML servido local/publicamente.
Configuração frontend explícita `frontend.ecosystem.config.cjs`; nunca usados
prepared.ecosystem* inválidos. Saved/fallback idênticos com candidato fechado e
worker preservado; boot habilitado apenas após verificação. Sem ensaio de reboot.

Guarda compartilhada `/var/lib/re7/campaign-operations/state.json`, single-host,
host conferido; open=false/generation 0/tasks 0, sem lock/uncertain no check final.
**CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=true** no processo real e saved; nenhum
POST de abertura, provider call/envio ou mutação de negócio provocado na validação.

### Validação e limites

Health loopback e entradas converta/api HTTP 200/db ok. Diagnóstico superadmin HTTP 200:
available=true, open=false, drained=true, build a1cc380e, tasks 0. Frontend local e
público /app/campaigns HTTP 200 com BUILD_ID esperado. GET /app/campaigns e diagnóstico sem
credenciais retornam 401; nenhum token exposto ou sessão fabricada.

Owner confirmou sessão/telas funcionando após recarregar e relatou detalhe e grupo
abertos. **A identidade desse “grupo” não está comprovada**: consultas atuais
mostram zero CampaignExecutionBatch. Clarificação solicitada; não contar relato
como prova de navegação/execução de lotes. Inbox/CRM/lista e detalhe existentes
receberam relato visual de funcionamento, não validação de envio. Não criado fixture
produtivo. Matriz AGENT/SUPERVISOR/ADMIN permanece coberta pelas evidências anteriores;
esta janela não exerceu sessões legítimas distintas de cada papel, nem mudou RBAC.
Health/UI não validam fluxo completo, concorrência real, todos os tenants ou inbound.
Drained do ledger novo não prova quiescência retroativa das chamadas antigas.

### Próxima decisão: abertura e scheduler, separadamente autorizados

Leitura nova às **22:27:39**: jobs 0, grupos 0, leases 0, scheduled vencidas 0/futuras 0,
sending 0. Às 22:23, campanhas anteriores: 85 completed/12 cancelled/5 failed/2 draft.
Nenhuma fila existente para despachar observada; isso é uma fotografia, reconferir
imediatamente antes de qualquer decisão. Não reenviar/reconciliar resultados antigos.

**Abrir a guarda permite admissões manuais/test-send conforme RBAC/política.**
Rotas de envio imediato chamam processamento de fila diretamente; desligar o timer
NÃO é bloqueio global de envio após abertura. Habilitar scheduler inicializa também
uma varredura imediata e ticks periódicos, podendo admitir elegíveis presentes no
momento futuro. Não prometer “abertura sem envios” com base apenas na fila vazia.

Permanecem gates: autorização específica, releitura de jobs/agendamentos/ledger,
identidade/topologia single-host confirmada, motivo/geração da mudança e observação
operacional; sem inventar quiescência antiga. Retorno preparado é recovery 03f930e5
sobre DB atual e frontend anterior, mantendo guarda fechada; sem down/reset/dump
sobre produção ou API 5ee2de6b. **STOP: DEPLOYED / CAMPAIGNS CLOSED / SCHEDULER DISABLED.**
Aceite funcional de lotes/owner UI completo e CRA pendentes. Telegram não validado,
6683 CLOSED, DELIVERED/READ → HUMAN/WAITING separado e owner PASS anterior preservado.

Evidências privadas junto à preparação activation e em
`local-evidence/recovery/activation-20260927/`, fora do Git. Publicação exclusivamente
documental na branch de revisão; sem gatilho adicional de implantação.


## Liberação controlada concluída — campanhas abertas e scheduler habilitado

Complemento a **84e92930**, em 27/09/2026 America/Fortaleza, sob autorização explícita
do owner. Sucede o estado histórico fechado, sem alterar código do candidato
**a1cc380eddcd1467b8e0d3a8e405f82689a25b3d**, schema ou frontend. Não houve criação
de campanha/fixture nem envio provocado para validar. Aceite funcional de lotes e
CRA continuam pendentes; não confundir liberação operacional com esses aceites.

### Gates, preservação e reinício somente da API

Leitura 22:34:43: jobs/grupos/leases/agendamentos vencidos/futuros zero; estados
anteriores 85 completed/12 cancelled/5 failed/2 draft. Os rascunhos não estavam
enfileirados. Guarda disponível/fechada, geração 0, tasks 0, sem lock/uncertain/fault;
host único conferido na configuração, processo e identidade local, dentro da
topologia single-host previamente inventariada. Sem quiescência retroativa inferida.

Estado/configuração preservados privadamente em
`/opt/re7online/backups/converta-persistent/preparations/opening-20260928T013618Z/`:
configuração fechada anterior, guard-before.private.tar, saved/fallback e crons.
Novo arquivo ativo: `<release-a1cc380e>/scheduler-enabled.ecosystem.config.cjs`,
SHA256 `747c2b624abb221e08cc871ed7474f6eb8823932655f58016bc53430bc13a31a`.
Única alteração de aplicação: CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED true→false.
Parser/normalizador PM2 conferido sem startup prévio. Configuração corrigida anterior
permanece preservada para retorno fechado; não reutilizados prepared.ecosystem*.

- 22:38:07: Codex suspendeu crontab deploy previsto, sem tarefa concorrente.
- 22:38:54: Deifson suspendeu cron.d backup/boot sem --now e conteve somente 3001;
 frontend e worker não foram parados nem trocados.
- 22:39:35–22:39:40: fila reconferida vazia, API anterior removida e única API nova
 iniciada com ambiente reduzido. Identidade real /proc cwd/exe/pm_exec_path,
 script/configuração, host, watch=false e CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=false
 conferidos. Guarda
 permaneceu FECHADA; evento campaign.schedule.processor.started observado.
- 22:40:40: Deifson retirou a tabela temporária, 23 pacotes rejeitados;
 contenção 106s (1min46s). Health loopback/público 200/db ok e diagnóstico superadmin
 confirmaram candidato correto, guarda fechada geração 0/tasks 0/sem ledgerFault.
 Owner confirmou Inbox/CRM funcionando na sessão privada, somente leitura.

API efetiva PID 1493326, online/zero restarts; frontend a1cc380e PID 1489466/build
esJVODIxT1rETZKxEPdX5 e worker 5ee2de6b PID 3747763/filho 3747829 preservados.
Scheduler com intervalo existente de 60.000ms, sem alteração de implementação.
Nenhuma abertura ocorreu antes da validação de atendimento e nova leitura de fila.

### Abertura auditada e observação efetiva

Às 22:43:41.923, releitura imediata: jobs 0/grupos 0/leases 0, scheduled vencidas 0/
futuras 0, sending/paused 0. Às **22:43:42.139**, POST superadmin existente abriu a
guarda usando geração atual **0→1**, HTTP 200. Actor auditado `platform-superadmin`;
segredo somente em memória do processo, sem exposição. Motivo persistido:

> Owner Deifson authorized controlled campaign release after 84e92930; queue/schedules empty, scheduler enabled while closed, service validated; no validation sends

Não editado ledger diretamente, não removidos locks/tarefas/marcadores. Abertura
vinculou o arquivo compartilhado ao host validado. Zero tarefas e ledgerFault=null
na resposta; drained=false é esperado com guarda aberta, mesmo sem tarefas.

Observação passiva via inotify dos renames atômicos do ledger, sem lock de leitura,
sem invocar scheduler manualmente e sem fixtures. Primeiro probe capturou scheduler
às 22:44:38, mas classificou seu filho normal `claim` como inesperado e parou. Código
existente confirmou esse filho como parte da varredura; fila/leases/saídas continuavam
zero. Evidência inicial preservada; corrigida somente classificação do observador,
sem alteração funcional ou nova abertura da guarda.

Dois ciclos consecutivos completos observados no PID 1493326/build a1cc380e/geração 1:

| Início Fortaleza | Duração observada da tarefa | Resultado |
| --- | --- | --- |
| 22:46:38.623 | 49,82ms | scheduler + claim interno; tarefa retirada, guarda aberta|
| 22:47:38.623 | 95,92ms | scheduler + claim interno; tarefa retirada, guarda aberta|

Intervalo observado 60s; 8 renames e 2 claims no probe completo. A admissão e conclusão
do caminho real de varredura foram observadas, não apenas o log de inicialização
ou uma espera arbitrária. Não houve tarefa de provider/campanha nesse probe;
nenhum erro registrado nos logs consultados. Isso não valida envio/lotes vazios
como se fossem uma execução funcional completa.

Às 22:47:58.632: jobs/grupos/leases/scheduled vencidas/futuras/sending zero,
ledger sem tarefas, open=true/geração 1/sem fault. Desde a abertura até essa leitura:
**zero novos OutboundMessage**; deltas de intents/aceites/test-send todos zero
(baselines 61 submit_started, 61 provider_accepted, 16 test_send.requested, 10 sent,
6 failed). Nenhum envio de campanha/test-send observado ou provocado no período.
Não afirmar ausência universal de tráfego externo sem registro nem encerrar as
incertezas antigas; qualquer tráfego real futuro não é ação desta validação.

### Supervisão, persistência e limites finais

Saved/fallback idênticos apontam para candidato com scheduler habilitado,
script/cwd/host/guarda corretos e watch=false. Configuração ativa é a nova
scheduler-enabled.ecosystem.config.cjs, não a cópia de scheduler desabilitado.
Codex restaurou crontab deploy 22:48:30; Deifson restaurou cron.d backup e boot sem
start/reload. Às 22:49:56: ambos crons byte a byte, boot **inactive/enabled**, três
processos esperados estáveis e guarda aberta/geração 1/sem tarefas, host vinculado.
Não houve retenção manual, mudança de frontend/worker ou rollback da migration.

Comportamento previsto após restart, **não ensaiado com guarda aberta**: a
configuração persistida inicia scheduler e a guarda persiste aberta no mesmo host
se o estado estiver válido e sem tarefas abandonadas/fault. Scheduler faz varredura
inicial e ticks. Estado ilegível/corrompido, host divergente, lock ou tarefa abandonada
bloqueiam admissão; não apagar/reabrir por timeout. Não prometer retomada automática
de resultado incerto, nem coordenação entre hosts. Reboot/resurrect não foi provocado.

**CAMPAIGNS OPEN / SCHEDULER ENABLED.** Próxima validação funcional é do owner:
revisar audiência/template/variáveis e papéis; definir campanha e destinatários
controlados com consentimento antes de qualquer envio; validar lote/snapshot/ordem,
pausa/retomada e resultado com evidência. Não executar casos produtivos artificialmente
nesta etapa. Se surgir divergência, fechar admissões via API superadmin com geração
atual e motivo, observar tarefas em andamento, sem matar provider/limpar ledger ou
reenviar incertos; recovery fechada só pelo procedimento coordenado se necessária.
Aceite de lotes/CRA pendente; 6683 CLOSED, Telegram e DELIVERED/READ separados.
Evidências privadas junto à preparação opening e localmente em
`local-evidence/recovery/opening-20260927/`; publicação somente documental.


## Deploy técnico da correção de flows DB-only — 28/09/2026

**DEPLOYED / CLIENT ACCEPTED — correção de flows DB-only.** Registro posterior
às etapas históricas anteriores: backend e frontend efetivos em
`e8ebd776ba7c92cc9013fefb29035eae3ab1af4e`, antes `a1cc380e`. Comparação entre
artefatos restringiu o delta funcional à correção aprovada de flows e UX;
schema e dependências sem diferença. Nenhuma migration aplicada: permanecem 60.
Release isolada, sem usar checkout do worker como base da API; 3.129 hashes de
arquivos conferidos. Builds de artefatos backend/frontend passaram; não se
repetiram suítes locais já aprovadas (7/7, 14/14, 164/164 e quatro smokes Guia/
Avançado criar/editar). Estes continuam provas locais, não aceite produtivo.

### Backup e retorno

Preparação persistente: `/opt/re7online/backups/converta-persistent/preparations/flow-write-20260928T192050Z`.
Backup fresco 19:20:50–19:21:04 UTC, com espaço previamente conferido (~39 GiB),
lock de backup e sem descarte. `database.dump`: 22.006.795 bytes, SHA-256
`de422b0199feb7b635204c64417a86a8aa7d64947726d40afff64ab47c96aee5`;
catálogo 614 entradas; manifesto SHA256SUMS conferido. Também preservados conteúdo,
configuração privada ativa, guarda/auxiliares, dados operacionais, saved/fallback
PM2 e crons. Dump produzido em 4,695 s. **Este mesmo dump fresco** foi restaurado
em DB local isolado `re7_flow_deploy_restore_20260928` (loopback), em 3,712 s,
sem aplicações/integrações/schedulers/providers conectados: 60 migrations,
10 clients, 21 flows, 104 campanhas, zero jobs/grupos. Cópia live de arquivos e
sessões não é snapshot atômico com DB nem prova de recuperação integral de inbound;
não há prova adicional de cópia offsite. Retenção não alterada.

Retorno de código disponível em `/opt/re7online/releases/a1cc380eddcd1467b8e0d3a8e405f82689a25b3d`,
API `scheduler-enabled.ecosystem.config.cjs` e frontend `frontend.ecosystem.config.cjs`.
Compatível com o DB atual: era a versão efetivamente ativa sobre essas mesmas
60 migrations e o novo delta não altera schema. Retorno exige fechar admissões,
comprovar drain, conter entradas/controlar supervisão e trocar apenas processos
necessários, preservando guarda compartilhada. Não restaurar DB sobre dados novos,
não usar API do checkout antigo do worker nem down/reset. Recovery `03f930e5`
permanece alternativa fechada conforme runbook, sem retorno automático.

### Execução e evidências

Horários UTC (Fortaleza = UTC−3):

- 19:27:50.983: fechamento superadmin, geração 1→2; 19:27:51.020: drain comprovado,
  tasks=0, ledgerFault=null. Fila, grupos, leases, sending e scheduled zerados.
- 19:29:23: owner aplicou contenção 3000/3001 e suspendeu boot/cron conforme plano.
- 19:30:20–19:30:31: troca sequencial API/frontend; nenhum worker reiniciado.
- 19:32:20: identidade real, script/cwd, host, watch=false, scheduler habilitado
  com guarda fechada, saved/fallback conferidos antes da retirada da barreira.
- 19:32:44: owner retirou contenção; duração 3min21s. Não equivale a garantia
  de ausência de impacto em requests/webhooks durante a janela.
- 19:33:43: health local e dois caminhos públicos 200/db ok; frontend local e
  público 200 com BUILD_ID `fNgALKLUIc78JDuyWHkRb`. Diagnóstico superadmin fechado
  e leitura de configuração/flows autorizada. Owner confirmou sessão, Inbox,
  CRM, lista e abertura de fluxo existente somente em leitura.
- 19:36:13.540: abertura superadmin auditada, geração 2→3, após nova leitura da
  fila vazia. Motivo: deploy autorizado concluído, identidade/health/UI conferidos,
  retomada da admissão anterior sem envio de validação. Sem edição direta do ledger.
- 19:36:26.557 e 19:37:26.560: dois ciclos reais do scheduler admitidos e concluídos,
  observados pelas gravações atômicas do ledger; nenhuma tarefa inesperada.
- 19:43:18: health/frontend/diagnóstico novamente conferidos; guarda aberta geração 3,
  tasks=0, fault=null; jobs/grupos/leases/sending/scheduled=0; flows e fingerprint
  preservados. 19:44:15: contagens de submissão/aceitação e test-send sem incremento
  desde a abertura. Não provocados envios; observação não prova chamadas históricas
  ausentes de registros.

API PID 1632829, frontend PID 1632888, ambos sem restarts e em release e8ebd776.
Worker PID 3747763 e filho 3747829 preservados, contador preexistente 626 inalterado.
Guarda `/var/lib/re7/campaign-operations/state.json`, mesma identidade de host,
`single-host`; não coordena múltiplos hosts. Configuração ativa API
`<release-e8ebd776>/flow-write.ecosystem.config.cjs`, frontend
`<release-e8ebd776>/frontend.ecosystem.config.cjs`, sem ambiente bruto PM2.
Saved/fallback idênticos e apontando para nova release; deploy crontab restaurado
por comparação exata. Owner confirmou restauração do cron root de backup e boot
`inactive/enabled`; não iniciou serviço systemd nem executou reboot de teste.

Logs da inicialização: API sem erro; frontend com aviso Next sobre múltiplos
lockfiles/inferência de workspace, sem crash ou restart. Não houve correção
incidental; aviso React key do smoke local é outro item. Scripts de swap/open
na preparação são históricos e não devem ser reaplicados. Evidências privadas
persistentes em `local-evidence/flow-deploy-20260928`, fora do Git.

### Pendências e limites

No fechamento técnico, a confirmação funcional do cliente ainda estava pendente.
Em 28/09/2026, o owner encaminhou a confirmação de Eduardo: “Funcionou, obrigado
Deifson”. Registrado aceite funcional do cliente para a correção de gravação de
flows DB-only em `e8ebd776`, encerrando essa pendência específica. A mensagem não
informa quais operações ou modos foram usados: não comprova que Eduardo testou
Guia criar/editar e Avançado criar/editar. Essas quatro combinações têm evidência
local separada. A validação técnica produtiva foi somente leitura, sem gravações
de fluxos reais ou envios provocados. Este aceite não abrange CRA global,
lotes completos ou todos os papéis por sessões distintas. Campanhas abertas e
scheduler habilitado ao final, preservando incertezas históricas. 6683 CLOSED;
Telegram e DELIVERED/READ → HUMAN/WAITING continuam frentes separadas.

Verificação final às 19:46:41 UTC: crons deploy/root comparados aos originais,
boot inactive/enabled, saved/fallback idênticos, worker/filho preservados e
API/frontend sem restarts. Após a inicialização, API registrou às 19:43:53
um WARN `multichannel.shadow_write.failed`, modelo OutboundMessage, motivo
`missing_channel_account_id`; sem erro estruturado/crash observado. Não
atribuído à gravação de flows sem evidência causal; acompanhar separadamente,
sem correção incidental. Nenhum identificador de registro exposto nos docs.


## Preflight SECULT a3d16d4b — 29/09/2026, somente leitura

[Plano consolidado e evidências sanitizadas](SECULT_DEPLOY_PLAN_2026-09-29.md).
API/frontend continuam e8ebd776, 2.020 hashes iguais à evidência de deploy; worker
continua no checkout 5ee2de6b, porém seu dist compartilhado é anterior e difere em
21 módulos alcançáveis do candidato. Não atribuir SHA de checkout ao bundle inteiro.
Três WEB_SESSION conectadas; chave SECULT ausente nos dez tenants; guarda aberta
geração 3/tasks zero/fault null, `drained=false`. Jobs/grupos/leases/sending/scheduled
zerados na leitura, sem inferir ausência de operações WEB_SESSION. Sem mutation.

Próxima decisão é revisão do delta adicional do worker e resolução/ensaio do drain
worker antes da janela, não autorização genérica de deploy. Plano especifica backup
fresco futuro, preservação de ciphertext/chaves/sessões, exclusão de escritores
antigos, rollout default false e ativação posterior exclusiva secult-pe. Nenhuma
admissão fechada, cron modificado, configuração aplicada ou processo reiniciado.
Campanhas/CRA aguardam owner; Telegram/DELIVERED-READ separados; 6683 CLOSED.
