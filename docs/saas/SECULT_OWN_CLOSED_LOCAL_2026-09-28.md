# SECULT — consulta de conversas próprias encerradas

> Decisão complementar do owner, 29/09: não há obrigação de disponibilizar legados
> sem comprovação suficiente. Os que já satisfazem todos os critérios implementados
> permanecem elegíveis. Sem backfill, inferência de responsável ou corte temporal novo.
> Nenhuma alteração funcional decorrente desta decisão; SECULT NOT DEPLOYED.


> Atualização local 29/09 — [alternativa mínima e parada do worker](SECULT_DEPLOY_PLAN_2026-09-29.md):
> base bf5f1d76 reproduz o bundle alcançável; backport de cinco fontes f06 recomendado
> para revisão. G1/G2 continuam abertos. 45+30 testes PASS; quatro reproduções mostram
> shutdown inseguro, não drain aprovado. Proposta de correção separada não implementada.
> Rollback antigo perde garantia de concorrência; revogar em código SECULT exige
> escritores compatíveis. Produção intacta, SECULT não ativada; campanhas/CRA aguardam owner.


28/09/2026, America/Fortaleza. **LOCAL VALIDATED / NOT DEPLOYED** para o escopo
abaixo. Base `f06d49cb61fcf57b423603b93797acad4b797d33`, branch
`review/campaign-recovery-20260926`. Dependência de persistência permanece nesse
commit separado, revisado pelo owner. A entrega de 28/09 ficou somente no worktree;
em 29/09 a publicação foi autorizada exclusivamente para revisão. Sem migration,
acesso produtivo ou ativação de tenant real.

## Publicação do delta de revisão — 29/09/2026

**LOCAL VALIDATED / NOT DEPLOYED — publicação somente para revisão.** Parent
`48e0fc2a5117126d492ff6530fe832bb45643dcc`, branch
`review/campaign-recovery-20260926`; dependência `f06d49cb` permanece separada.
Nove arquivos revisados: três de implementação, um de testes e cinco documentos.
O código abaixo coincide byte a byte com o validado em
`local-evidence/secult-department-20260929/SOURCE_SHA256SUMS`; só esta nota documental
foi acrescentada depois. Portanto são reutilizados **31 testes, build TypeScript
backend (exit 0) e smoke final**, sem repetição e sem reatribuir os 112 históricos.

Identificação precisa do conteúdo validado (SHA-256):

| Arquivo | SHA-256 |
| --- | --- |
| `apps/whatsapp-agent/src/http/routes.ts` | `1de59c9ecc6d153e157d17eefb889853b6380f72a20352fdbfb481f90b872549` |
| `apps/whatsapp-agent/src/inbox/ownClosedAccess.ts` | `d0b0d5a7c16f9dd957527a9ab1b0182efe7f02e3e88d5bc74dcb94e899d494c4` |
| `apps/whatsapp-agent/src/realtime/hub.ts` | `718ff4c0406cba3f1e50418b2594e23452b8d66b6c480d8bc9d51c0ee5757f0e` |
| `apps/whatsapp-agent/src/http/ownClosedConversations.test.ts` | `81d014ba7bd8767e70181d40e668cc04c87a926e2034af557e15b65f69626385` |

Escopo conferido: fallback false somente na leitura da nova chave; geração realtime
por conversa sem perder revogação do tenant; vínculo departamental atual sobre
snapshot pelo resolvedor canônico. Lista/contagens, detalhe/timeline, mídia e realtime
compartilham a decisão. Ativos e SUPERVISOR/ADMIN preservados. Novas leituras/entregas
são negadas após revogação; conteúdo já recebido não é apagado retroativamente e a
remoção visual depende da revalidação/polling existente, sem instantaneidade.

Gatilhos conferidos antes do push: único workflow `ci.yml`, push em main/develop
(e PR direcionado a elas), apenas lint/build; `vercel.json` desabilita implantação
Git desta branch. Publicação sem merge/force/deploy/reinício/ativação. Staging
exclusivo dos nove arquivos; .data, logs, patches e evidências privadas ficam locais.
API, worker e scripts devem ser compatíveis antes da futura ativação; voltar a
escritores antigos perde a garantia de revogação. Campanhas/CRA aguardam owner.

## Decisão departamental implementada localmente — 29/09/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Decisão do owner: próprio CLOSED exige
acesso departamental atual ao departamento do snapshot daquele encerramento.
Perda do vínculo revoga a exceção; responsabilidade histórica não herda a dispensa
departamental do assignee atual. Departamento ausente não concede acesso.
Esta seção sucede a pendência registrada na revisão abaixo, preservada como histórico.

Menor delta funcional desta etapa: `inbox/ownClosedAccess.ts` seleciona
`CompletedServiceSnapshot.departmentId` e exige sua presença nos vínculos resolvidos
por `getUserDepartmentMemberships`. Preserva o fallback legado e o filtro canônico
`membership.isActive && membership.departmentIsActive !== false`, já usado por
`loadActiveUserDepartmentIds`/escopo HTTP. Nenhum resolvedor paralelo, alteração de
membership, seleção, distribuição ou lifecycle foi introduzido. A exceção é negada
se não existir snapshot/owner/ciclo/departamento correspondente ou vínculo atual.
A ausência de memberships ativos pode usar User.departmentId legado conforme o
resolvedor existente; remover o vínculo pelo sincronizador canônico também limpa
esse campo. Não se deve interpretar desativação isolada da linha de membership,
com legado ainda válido, como revogação completa: isso preserva o contrato anterior.

O helper comum cobre lista/contagens, detalhe, timeline, mídia e realtime. Estado
corrente sem departamento não impede prova pelo snapshot. Histórico anterior segue
os mesmos cortes de privacidade; não há recorte novo por ciclo. Caminhos de ativos,
SUPERVISOR/ADMIN e ações CLOSED não mudam. Em particular, SUPERVISOR sem departamento
corrente comprovável na conversa sintética continua recebendo 403 no detalhe; não
foi ampliado seu acesso para aproveitar a nova exceção histórica de AGENT.

### Evidência executada sobre o código final

- Dois testes dirigidos PASS: matriz departamental por HTTP/DB/socket autenticado
  aberto e remoção durante autorização pendente com barreira determinística.
- Suíte afetada **31/31 PASS**: `http/ownClosedConversations.test.ts` **18**,
  `realtime/hub.test.ts` + `inbox/messageVisibility.test.ts` **9**,
  `users/departmentMemberships.test.ts` **4**. Inclui vínculo legado válido,
  membership válido/removido, outro departamento, departamento inativo, snapshot
  sem departamento, restauração de vínculo, assignee ativo sem vínculo e limites
  anteriores de SUPERVISOR/ADMIN. Lista/contagens/detalhe/timeline/mídia e entregas
  ao socket aberto são negados após perda efetiva de acesso.
- Os seis casos da revisão anterior foram reexecutados nessa suíte: falha isolada
  da chave preserva consulta ativa; erro geral não é mascarado; handoff de B não
  perde mensagem de A; transferência/reentrada e revogação continuam protegidas.
- Build TypeScript backend final PASS. A primeira execução foi interrompida no
  retorno da ferramenta; a verificação final registra exit code em arquivo.
- Smoke autenticado AGENT na Inbox/filtro Encerradas existentes: consulta própria
  com histórico anterior permitido, controles de ação bloqueados; revogação pelo
  sincronizador canônico em fixture sintética e revalidação automática do painel.
  Sem recarregar página ou publicar invalidação artificial: contagens zeraram,
  histórico foi removido e cartão desapareceu. Sem erro de página/overlay.
  Revogação às 11:09:12.183Z; histórico ausente observado às 11:10:00.235Z e cartão
  ausente às 11:11:02.667Z (limites de observação, não latências exatas).
- Revalidação visual usa polling existente: lista 30s, timeline 60s verificada no
  tick da lista; cartão selecionado pode sobreviver até atualização seguinte.
  Não há garantia de apagamento instantâneo de conteúdo já recebido ou prazo sob
  suspensão/throttling do navegador. Novas consultas e eventos usam autorização
  atual. O socket real foi testado separadamente, sem atribuir sua prova ao polling.
- Evidência privada nova: `local-evidence/secult-department-20260929/`. O ensaio
  inicial corrigiu apenas fixture PNG inválida e expectativa indevida de 200 para
  SUPERVISOR sem departamento; logs anteriores foram preservados. Smoke usou
  frontend isolado com proxy local, sem mudança na aplicação. Sem providers/envios.

Frontend e worker não mudaram nesta etapa: não se repete nem se declara tipagem
integral aprovada; permanecem os limites anteriores (22 diagnósticos frontend
preexistentes; worker --noCheck não valida tipos). As 112 provas anteriores são
históricas; os resultados acima são do delta final. API, worker e scripts compatíveis
continuam requisito para futura ativação; rollback a escritores antigos perde a
garantia de revogação. Sem commit/push/deploy, migration ou ativação produtiva.
Campanhas/CRA aguardam owner; DB-only encerrada; inatividade no Guia pausada;
6683 CLOSED. Nenhum aceite produtivo novo.

## Revisão de 48e0fc2a — correções locais em 29/09/2026

**CORREÇÕES LOCAIS VALIDADAS / NOT DEPLOYED — decisão departamental pendente
antes de preparar deploy.** HEAD permanece `48e0fc2a5117126d492ff6530fe832bb45643dcc`;
dependência `f06d49cb` separada. Sem commit/push, ativação ou acesso produtivo.

1. `buildConversationListPayload` captura somente falha de
   `resolveAllowAgentOwnClosedConversations`, registra
   `inbox.own_closed.permission_read_failed` e usa false. Lista/contagens não
   concedem CLOSED; consulta ativa autorizada continua funcionando. Dependências
   próprias da Inbox continuam propagando seus erros. Acesso direto CLOSED com
   resolvedor indisponível continua negado por erro (500), sem resposta com conteúdo.
2. `realtime/hub.ts` separa geração de autorização por tenant (revogação de
   configuração) e por identidade de conversa (handoff). B não descarta mensagem
   pendente de A no mesmo tenant. Mudança na própria conversa e revogação do tenant
   continuam invalidando autorização pendente; o resolvedor de acesso permanece.
   Identidades raw/canonical são consideradas, sem reduzir IDs de canais sintéticos
   aos seus dígitos. Escopo continua sendo o processo do hub, sem nova promessa de
   coordenação entre instâncias. Não houve mudança de distribuição ou lifecycle.
3. Referência concreta disponível: `hasConversationDepartmentAccess`, em
   `apps/whatsapp-agent/src/http/routes.ts`, dispensa vínculo para **assignee atual**
   (`currentUserId === conversationAssignedUserId`). Ela não define dispensa para
   proprietário de `CompletedServiceSnapshot`. Não foi localizada outra definição
   explícita nos documentos consultados. **Decisão necessária:** o responsável no
   encerramento mantém a consulta após perder vínculo departamental, ou a consulta
   deve exigir vínculo atual ao departamento do atendimento encerrado? A segunda
   opção exige ajuste consistente de lista/detalhe/mídia/realtime e teste próprio.
   Nenhuma dessas opções foi adotada como nova regra nesta revisão.

### Evidência desta revisão (separada da entrega anterior)

- Antes da correção: seis casos dirigidos, **3 PASS / 3 FAIL**. Reproduzidos 500
  da lista e descarte de mensagem A tanto com chave false quanto true.
- Depois: mesmos seis casos **6/6 PASS**. Barreiras determinísticas suspendem a
  autorização depois da leitura do estado e antes da entrega; sem espera arbitrária.
  Cobrem B independente, transferência/reentrada na própria conversa e revogação
  pelo PUT real. Injeção somente no resolvedor da chave prova consulta ativa 200,
  CLOSED ausente/count zero e acesso direto CLOSED negado; falha geral de consulta
  continua 500.
- Regressão: `ownClosedConversations.test.ts` **16/16** + `realtime/hub.test.ts`
  e `inbox/messageVisibility.test.ts` **9/9** = **25/25 PASS**, DB PostgreSQL local
  isolado e fixtures sintéticas. `npm run build --prefix apps/whatsapp-agent` PASS,
  incluindo checagem TypeScript do backend e testes alterados.
- Frontend, worker, 37 testes de persistência e smoke anterior não foram repetidos.
  Os 112 testes/smoke de 28/09 continuam evidência histórica do código anterior,
  não resultado integral reatribuído ao delta. Frontend/worker mantêm as limitações
  de tipagem já documentadas; build --noCheck não é aprovação de tipos.
- Evidências privadas preservadas em `local-evidence/secult-review-fixes-20260929/`:
  reprodução, casos focados, regressão, build, relatório, patch e hashes. Nenhuma
  fixture, configuração privada ou estado operacional vai para Git nesta etapa.

API, worker e scripts escritores compatíveis continuam requisito da futura ativação;
rollback a escritores antigos perde a garantia de revogação. Campanhas/CRA aguardam
validação funcional do owner; DB-only encerrada, inatividade no Guia pausada,
6683 CLOSED. Mesma Inbox/filtro/histórico e ações CLOSED bloqueadas.

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
  responsável atual foi estendida na implementação ao responsável comprovado do
  encerramento, sem restaurar assignee, departamento ou fila. O filtro explícito de
  departamento continua filtrando pelos dados correntes. **Correção documental em
  29/09:** essa extensão não possui definição contratual explícita localizada. A
  afirmação anterior de que a perda de vínculo não revogava por contrato era uma
  inferência indevida. Após decisão explícita do owner em 29/09, o helper passou a
  exigir vínculo atual ao departamento do snapshot, conforme seção mais recente.
  Usuário/tenant inativo e revogação da chave continuam bloqueando.
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


## Preparação operacional posterior à revisão de a3d16d4b

Owner concluiu revisão sem novo bloqueador no delta. [Plano de implantação de
29/09](SECULT_DEPLOY_PLAN_2026-09-29.md) mantém NOT DEPLOYED e separa gates de worker,
backup/retorno, implantação de código e ativação exclusiva secult-pe. O preflight
read-only encontrou dist compartilhado do worker mais antigo que seu checkout:
atualizá-lo introduz fila operacional/origem CRM/normalização além da persistência.
Essas mudanças e a falta de drain worker comprovado precisam de revisão/ensaio;
os 31 testes SECULT não são prova dessas transições produtivas. Nenhuma ativação,
parada, fechamento de admissões ou alteração produtiva executada.
