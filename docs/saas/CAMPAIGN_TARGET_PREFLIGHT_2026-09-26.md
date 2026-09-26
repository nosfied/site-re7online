# Preflight somente leitura — campanhas, 2026-09-26

Candidato: `2ecfc91a35775326ffa90693b3ff4f77ac37c9ca`; branch
`review/campaign-recovery-20260926`. **NOT DEPLOYED / OWNER UI PENDING**.
Este documento registra leitura do alvo, não autorização nem execução de rollout.

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
Nginx publica a API por `/agent-api/` e webhooks pelo host de API; frontend pode
intermediar chamadas. Portas 3000/3001 escutam em wildcard, não só loopback.
Leitura privilegiada do firewall indisponível: acesso direto externo NÃO foi
comprovado nem descartado. Há arquivo de backup com server_name duplicado em
sites-enabled; precedência efetivamente carregada precisa ser conferida pelo
operador antes de qualquer fence. Não houve reload nem alteração desse arquivo.
Crons lidos executam backup, retenção e limpeza; nenhum deles inicia campanhas.

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

## Procedimento proposto — depende de aprovação operacional

Reserva sugerida: **30–60 minutos de manutenção**, após preparar artefatos e
backup fora da janela; estimativa de planejamento, não SLA medido. Se houver
chamada em andamento ou submissão incerta, duração indeterminada até reconciliação.
Não usar reload rolling: sobrepor runner antigo/novo rompe a garantia da fila.

1. Operador com acesso ao proxy/firewall confirma todas as entradas, inclusive
   portas diretas, aliases, frontend e acessos locais; aprova o impacto abaixo.
   Preparar artefatos do candidato e do SHA funcional em diretórios separados,
   preservando o worker em execução e seus módulos/dados de sessão. Conferir
   supervisores/autorestart para não ressuscitar API antiga durante a janela.
2. Fazer backup fresco verificado e registrar baseline de contagens, migrations
   e eventos. Em janela sem campanhas agendadas/ativas, fechar admissão nos caminhos
   de campanha/test-send em todas as entradas. Só o proxy não interrompe scheduler.
   Reconsultar estados e tráfego em andamento; não prosseguir com chamadas pendentes.
   Não existe drain administrativo comprovado no código antigo: se não for possível
   demonstrar quiescência de test-send, ABORTAR a transição, não matar chamadas para
   alegar drain. Qualquer dúvida pós-interrupção exige reconciliação, nunca reenvio.
3. Parar somente a API antiga via supervisor e confirmar ausência de TODOS os seus
   processos/listeners e possibilidade de respawn. Essa parada é o fence efetivo
   disponível para o papel superuser, sem revogar acesso do worker. Frontend pode
   mostrar manutenção; worker e PostgreSQL permanecem ativos. Executar migration
   Prisma apenas depois dessa comprovação; usar timeout de lock definido na janela
   e abortar se houver contenção em Client/Campaign, sem matar sessões incidentalmente.
4. Subir o candidato inicialmente sem scheduler, mantendo admissão de campanhas
   bloqueada inclusive em acessos diretos; validar migrations, fila e leituras antes
   de liberar. Flag sozinha NÃO é fence das rotas. Ativar processamento e retirar
   bloqueios somente com owner presente e após confirmar que nenhum runner antigo
   pode retornar. Não usar envio real como verificação automática deste procedimento.
5. Se houver falha após migration ou após novas submissões, manter o fence,
   preservar tabelas, snapshots, jobs, leases, accepted/results e incertezas.
   Não executar down migration/restaurar dump sobre dados novos. Preferir correção
   e retorno ao código novo; validar ausência de duplicação antes de reabrir.

**Impacto do caminho comprovável:** com API parada, Inbox/CRM/autenticação e APIs
operacionais ficam indisponíveis; realtime cai; webhook Meta não é processado e
pode depender de retry externo (janela/garantia não verificada). Worker Web fica
conectado e pode persistir inbound diretamente no banco, mas callbacks realtime,
handoff e integrações com a API falham; não prometer recebimento completo ou
atendimento normal. Site institucional Vercel não precisa ser desligado. O diff
entre produção e candidato não muda worker nem os módulos compartilhados
inspecionados (db, web-session, crypto, features, logger).

**Rollback seguro comprovado:** deixar a API antiga PARADA e campanhas suspensas;
frontend de manutenção e worker preservado. Não é rollback funcional do atendimento.
Reiniciar código antigo com scheduler=false + apenas bloqueio de proxy NÃO foi
comprovado seguro (rotas manuais, portas diretas, ausência de exclusividade da fila).
Para recuperar Inbox/CRM com código antigo enquanto campanhas ficam isoladas, é
necessário comprovar um fence seletivo completo em todas as entradas e impedir
scheduler; isso NÃO está implementado/ensaiado no alvo e fica fora deste preflight.
A indisponibilidade da API pode ultrapassar a reserva de 60 min em rollback.

## Decisão e limitações

Sem impedimento identificado nos 16 objetos de drift nem nos checksums aplicados.
Impedimentos operacionais: aprovação da indisponibilidade ampla; acesso para
conferir proxy/firewall/portas diretas e controle de todos os supervisores; drain
comprovado (incluindo test-send); backup fresco; estratégia de retorno sem API
antiga executando campanhas. O alvo não possui o fence de privilégios do ensaio.
Não há autorização de deploy decorrente deste documento. Nenhuma suíte/build/smoke
local repetida; somente leitura remota e revisão documental. Owner validation e
aceite CRA desta frente pendentes. Encerramento owner PASS do SHA funcional
anterior preservado; reparo 6683 CLOSED; divergência DELIVERED/READ → HUMAN/WAITING
permanece separada e sem alteração funcional.
