# SECULT — consulta de conversas próprias encerradas

28/09/2026, America/Fortaleza. **LOCAL VALIDATED / NOT DEPLOYED** para o escopo
abaixo. Base `f06d49cb61fcf57b423603b93797acad4b797d33`, branch
`review/campaign-recovery-20260926`. Dependência de persistência permanece nesse
commit separado, revisado pelo owner. A entrega de 28/09 ficou somente no worktree;
em 29/09 a publicação foi autorizada exclusivamente para revisão. Sem migration,
acesso produtivo ou ativação de tenant real.

## Publicação para revisão — 29/09/2026

**LOCAL VALIDATED / NOT DEPLOYED — revisão Git.** 22 arquivos conferidos: 15 de
implementação/testes e 7 documentos. Os hashes dos arquivos entregues coincidiam
integralmente com as evidências preservadas. Nesta revisão só a documentação foi
atualizada; nenhum ajuste funcional, teste, build ou smoke repetido.
Dependência f06d49cb permanece parent separado, sem squash/merge.

Comparação de tipagem frontend reutilizada e conferida integralmente: **22 erros,
40 linhas de diagnóstico idênticas**, incluindo arquivo, linha, coluna, código,
mensagem e explicações subsequentes. Foi removido exclusivamente o prefixo do
caminho temporário da cópia-base. Seus arquivos src/ e tsconfig.json correspondem
byte a byte ao Git f06d49cb; as duas árvores resolvem o mesmo node_modules físico
e o mesmo compilador. Comando tsc --noEmit --incremental false em ambas; -p localiza
explicitamente o tsconfig da cópia-base, enquanto a árvore atual usa o mesmo
config pelo cwd. Não se comparou apenas a quantidade.

Distribuição: ChatbotFlowBuilder.test.ts (4), appChatbotDataLoader.test.ts (1),
appClientApi.test.ts (12), inboxRealtimeInvalidation.test.ts (5). **Zero diagnóstico
introduzido pelo delta** nessa comparação. Build frontend aprovado não significa
checagem integral aprovada. Worker conserva a limitação --noCheck e os 13 erros
estritos preexistentes descritos acima/abaixo, sem correções alheias.

Gatilhos conferidos: único workflow .github/workflows/ci.yml executa push apenas
em main/develop e PR destinado a essas branches; não contém deploy. vercel.json
mantém deploymentEnabled=false para review/campaign-recovery-20260926. Publicar
apenas essa branch, sem merge/force/deploy/ativação. Staging explícito exclui .data,
logs, patches e evidências privadas. Comparação completa, backup do delta e hashes
preservados localmente em publication-review-20260929/ dentro da evidência anterior.

Realtime indispensável: filtro de autorização no servidor, proteção após reentrada
e invalidação sem conteúdo ao perder acesso; não é redesenho de distribuição ou
histórico. Permanecem fora do escopo topologia multi-host, carga realtime, revisão
geral de projeções/notificações dos demais perfis e avisos de UI preexistentes.
Reutilizados os **112 testes PASS** e smoke com os limites já descritos. API, worker
e scripts compatíveis continuam condição de futura ativação; rollback a escritores
antigos perde a garantia. Campanhas/CRA aguardam o owner, sem aceite novo.

## Contrato e implementação

- `allowAgentOwnClosedConversations` em TenantOperationalConfig.config, default
  false; somente boolean true habilita. Sem fallback JSON, cadastro ou permissão
  global. Erro de leitura não autoriza. Novo setter lê e transforma após o lock
  transacional existente; usa a transação do handler, com auditoria no mesmo commit.
- GET/PUT `/app/settings/inbox/closed-conversations`: SUPERVISOR/ADMIN de tenant
  ativo. PUT aceita exclusivamente a chave booleana. AGENT é negado; não ganha
  edição de inboxVisibilityPolicy nem de outras configurações.
- UI reaproveita `/app/settings/inbox`, Inbox, filtro **Encerradas**, badge, detalhe
  e histórico existentes. Rótulo de modo CLOSED deixa de dizer “Automação ativa”.
  Não existe nova categoria, tela, arquivo por ciclo ou recorte novo de mensagens.
- “Própria” exige estado atual CLOSED, ausência de ciclo ativo e lastClosedServiceCycle
  coerente com closedAt. CompletedServiceSnapshot deve corresponder a tenant,
  conversationId, cycleId, protocol, closedAt e assignedUserId do usuário atual.
  closedByUserId não concede acesso; participação histórica não concede acesso.
  Registros sem prova suficiente permanecem inacessíveis ao AGENT.
- Lista e contagens fazem consulta de snapshots em lote. Detalhe, timeline e mídia
  repetem a autorização no backend, inclusive acesso direto. A exceção de acesso do
  responsável já existente no escopo departamental é aplicada ao responsável
  comprovado do encerramento, sem restaurar assignee, departamento ou fila. O
  filtro explícito de departamento continua filtrando pelos dados correntes.
  Perder vínculo departamental, por si só, não elimina a exceção de responsável já
  prevista no contrato; usuário/tenant inativo e revogação continuam bloqueando.
  SUPERVISOR/ADMIN conservam seus caminhos e escopos anteriores.
- Reentrada/transferência: novo estado ativo usa as políticas existentes shared e
  assignee_only_after_assignment. O responsável antigo não ganha acesso adicional;
  o novo responsável pode ler o histórico anterior conforme os controles atuais.
  Sem mudanças de seleção, distribuição, capacidade, disponibilidade ou lifecycle.
- Consulta não libera POST send/claim/transfer/status/release/read-state: as rotas
  reais devolvem 409 em CLOSED, sem mudança de runtime ou outbound. Composer e
  controles operacionais permanecem desabilitados. Sem provider no ensaio.

## Ajustes de segurança indispensáveis e fronteira

A divergência preexistente lista/detalhe permitia que acesso direto de AGENT a
conversa ativa considerasse apenas departamento. Os três GET envolvidos agora
aplicam também a política existente de Inbox, evitando acesso por URL antiga após
reentrada sob outro responsável quando a política exige exclusividade.

O hub preexistente distribuía conteúdo por tenant sem autorização individual no
backend. A nova consulta não poderia depender somente de filtro no navegador:
AGENT recebe eventos apenas após releitura de tenant ativo, usuário ativo, estado,
escopo e responsabilidade atuais. Leituras são agrupadas por evento, compartilhadas
pelas conexões, sem cache de autorização. Falha de consulta nega entrega. Mudança
de acesso/encerramento invalida decisões pendentes no processo. Usuários que não
podem receber o handoff recebem apenas invalidação sem identidade/conteúdo.
SUPERVISOR/ADMIN mantêm a distribuição anterior, sem nova ampliação.

A revogação publica invalidação e a Inbox revalida lista e detalhe, removendo o
painel em 403/404. CLOSED não recebe mapas agregados de read-state. Mídia da nova
consulta respeita historyVisibleAfter e management_only e usa no-store no storage
local. Não há promessa de apagar conteúdo já entregue/downloaded, nem quiescência
retroativa de requisições admitidas antes da revogação. A entrega websocket foi
ensaiada com conexões autenticadas reais no teste integrado. O smoke com dois
navegadores comprovou remoção após revalidação, sem isolar push do polling de
contingência. Isso não é um barramento entre hosts.
Novas leituras e novas entregas consultam o DB, mas não foi ensaiada uma topologia
multi-host ou carga sustentada do custo adicional de autorização realtime.

## Provas locais

PostgreSQL em loopback; DB sintético exclusivo `re7_secult_20260928`, schema de
fixture já existente. Nenhuma migration/schema do projeto alterada. API de ensaio
usa handleRequest e websocket reais, sem iniciar aplicação, scheduler ou provider.

| Grupo | Resultado e alcance |
|---|---|
| HTTP/DB/socket, ownClosedConversations.test.ts | **10/10 PASS**: default fechado; gestão e payload isolados; lista/contagem/detalhe/timeline próprios; outro agente/tenant negados; cutoff de privacidade com histórico anterior preservado; ciclo/protocol/data divergentes e responsável ausente negados; estados após transferência/fechamento por supervisor e reentrada; ações CLOSED sem escrita; mídia local, management_only e revogação; setter real concorrente; websocket autenticado; usuário/tenant inativo e erro do resolvedor. |
| Persistência, tenantOperationalConfigStore.test.ts | **37/37 PASS**, agora revogando pelo setter real contra famílias de escritores; criação concorrente, independência de alterações, arrays/exclusões, transação/rollback e reprodução anterior preservados. |
| Regressões afetadas | **65/65 PASS**: messageVisibility, serviceCycle, hub, guarda estrutural, inboxConversationFilters, appRealtime, inboxRealtimeInvalidation e inboxRealtimeTimeline. |
| Guarda estrutural | **35 substituições** protegidas (34 anteriores + setter novo); exceção create-only vazia e helper canned privado continuam explicitamente verificados. Não se manteve artificialmente a contagem antiga. |
| Backend | Build TypeScript com checagem PASS. |
| Frontend | `next build --webpack` PASS em cópia isolada do código final. Checagem tsc abrangendo testes: **22 diagnósticos idênticos à base**, em ChatbotFlowBuilder.test, appChatbotDataLoader.test, appClientApi.test e inboxRealtimeInvalidation.test; não é typecheck integral aprovado. |
| Worker | Build canônico `--noCheck` PASS; checagem estrita mantém **13 diagnósticos normalizados idênticos** aos já registrados na dependência. Não declara tipagem integral aprovada. |

Transferência/reentrada nesta suíte são estados sintéticos persistidos que exercitam
a autorização real, não execução produtiva do lifecycle ou de mensagens de serviço.
Regressão serviceCycle foi reutilizada/executada; não houve novo ensaio de distribuição.
A suíte ampla de 207 provas da dependência não foi repetida integralmente.

Smoke autenticado com usuários sintéticos: SUPERVISOR salva a chave na página
existente sem poder editar a política ADMIN-only; AGENT vê somente sua conversa em
Encerradas, abre histórico anterior, encontra controles de envio/transferência/status
bloqueados e vê o rótulo de encerramento. Revogação pela página de SUPERVISOR remove
lista/detalhe do AGENT; recarregar conserva a chave desligada. Acesso do AGENT à página
de configuração retorna à Inbox. Nenhum erro de página reportado pelo navegador.
Avisos de desenvolvimento/logo preexistentes não foram corrigidos incidentalmente.

## Implantação futura e limites

Antes de qualquer ativação real, API, worker WEB_SESSION e scripts escritores devem
usar persistência compatível. Escritor antigo ativo pode restaurar JSON obsoleto.
Rollback para escritores antigos elimina a garantia de concorrência: desligar a chave
isoladamente não resolve enquanto houver quem possa restaurá-la. Exige procedimento
operacional próprio e revisão; não foi implantado nem ensaiado produtivamente aqui.

Sem novo backfill de snapshots, schema ou migration. Sem garantia de cobertura de
registros antigos sem dono comprovável. Sem teste de carga realtime, provedor,
atendimento real ou aceite SECULT. Campanhas/CRA aguardam validação funcional do
owner; DB-only encerrada/aceita; inatividade no Guia pausada; 6683 CLOSED. Telegram
e DELIVERED/READ permanecem separados.

Evidências persistentes e privadas: `local-evidence/secult-implementation-20260928/`
(contagens, logs completos inclusive falhas corrigidas, comparação de tipos, smoke,
patch revisável e hashes). `.data/`, `local-db-setup.log` e evidências fora do Git.
