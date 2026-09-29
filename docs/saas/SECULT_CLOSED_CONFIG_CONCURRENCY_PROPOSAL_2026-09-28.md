# Persistência compartilhada — pré-requisito SECULT

## Continuidade após revisão de f06d49cb

A revisão da dependência foi concluída pelo owner sem bloqueador para avanço local.
A funcionalidade SECULT foi implementada e validada somente no worktree, com o 35º
escritor usando o helper e testes de revogação pelo setter real. Ver
[resultado e limites próprios](SECULT_OWN_CLOSED_LOCAL_2026-09-28.md).
A dependência permanece no commit separado f06d49cb; não implantada isoladamente.
Em 29/09, publicação da funcionalidade autorizada somente para revisão sobre essa
base, reutilizando as evidências locais; sem deploy nem ativação.
As afirmações “SECULT não implementada” abaixo são histórico da entrega anterior.


Atualização de 28/09/2026. Base local `3b891eb0c862c6767d57e7886f09cba85dc1ac2f`,
branch `review/campaign-recovery-20260926`. **LOCAL VALIDATED / NOT DEPLOYED**
para esta dependência. Publicação autorizada somente para revisão, sem migration
ou acesso produtivo.
SECULT permanece **NOT IMPLEMENTED / NOT DEPLOYED**, aguardando a revisão desta
validação e sua etapa funcional própria. O histórico da proposta está preservado
abaixo; seus status e afirmações de ausência de implementação referem-se àquela
etapa. Campanhas/CRA aguardam retorno funcional do owner; DB-only aceita,
Guia inatividade pausado e 6683 CLOSED. Telegram e DELIVERED/READ separados.

## Revisão local antes da publicação para revisão

Escopo revisto: **19 arquivos**, 9 de implementação/scripts, 7 de testes e 3
(documentação). Os hashes dos 16 arquivos de código/testes coincidem com a
entrega validada; não houve nova alteração funcional ou repetição das 207 provas.
34 escritores conferidos: 19 setters, canned (3 consumidores), 4 WEB_SESSION,
5 identidade híbrida, 2 distribuição e 3 scripts. O helper recebe callback,
não nextConfig anterior. O helper privado canned recebe documento derivado dentro
do callback; scripts refazem merges sob lock. Valores derivados somente do payload
podem preceder o lock; campos derivados de config são lidos depois dele.

**Rodízio:** comparação estrutural contra `3b891eb0` confirmou igualdade do comando
de advisory lock, do corpo de decisão inteiro (agora envolvido pelo helper) e de
selectRoundRobinUser, desconsiderando whitespace. A releitura de política já existia;
a mudança protege seu intervalo até atribuição/cursor. Ordem permanece advisory →
config → runtime. Mesmos dados atuais produzem a mesma decisão; sob concorrência,
usar cursor confirmado pode escolher outro atendente que uma leitura obsoleta —
isso não é alteração da fórmula de distribuição. Os 16 testes já concluídos cobrem
esse caso, round-robin e least-active concorrentes. Prova local preservada em
queue-review-proof.json.

**Tipagem:** executado adicionalmente `tsc -p tsconfig.json --noEmit --noCheck false`
no worker atual e numa cópia isolada do parent, com as mesmas dependências. Ambos
falham com **13 diagnósticos idênticos**, incluindo arquivo/linha/mensagem:

- baileysAuthState.test.ts:37,39 — TS2339, narrowing para never em trace/creds;
- dedicatedPgAdvisoryLock.test.ts:45,63,76 — TS2322, mocks sem contrato QueryResult;
- dedicatedPgAdvisoryLock.ts:14,61,62,86 — TS2344/TS2345/TS2349, genéricos e união
  PgClientLike/Client incompatíveis;
- whatsappWebSessionWorker.ts:1179,1222,1224,1529 — TS2322, contratos de logger e
  void/null/undefined do socket.

**Tipagem integral do worker NÃO APROVADA.** Nenhum diagnóstico novo na comparação;
backend com checagem (inclui os módulos compartilhados alterados) e os três scripts
já passaram. Isso não converte o build --noCheck em validação de tipos do worker.
Impedimentos preexistentes discriminados e não corrigidos incidentalmente.

**P2002:** `routes.ts` é idêntico ao parent e mantém o upsert com update vazio dentro
de `$transaction`. Se P2002 ocorrer, a transação é revertida; o catch registra
admin.tenant.provision.rejected e responde **HTTP 400**, `code: P2002`, mensagem
original do erro, via httpError; não há retry/tradução específica de conflito.
O saveTenantPatch posterior à transação não é alcançado nesse erro. Reprodução
local é do primitivo Prisma; propagação HTTP conferida por leitura do handler,
não por novo teste produtivo/HTTP. Tratamento genérico e mensagem bruta são
preexistentes, fora desta correção. Não se alterou o endpoint ou suas permissões.

**Publicação:** branch de revisão, sem merge/deploy. `.github/workflows/ci.yml`
é o único workflow versionado: push somente main/develop; PR contra essas branches
executa lint/build, sem deploy. `vercel.json` desabilita deploymentEnabled nesta
branch. A base remota conferida é `3b891eb0`, igual ao parent local. Não são
publicados estado operacional, evidências privadas, .data ou logs.

**Rollback futuro:** retornar a escritores antigos remove a garantia, mesmo sem
migration. Após eventual ativação SECULT, não basta rollback de código: é necessário
um procedimento específico que impeça escritores antigos concorrentes e controle
a revogação/autorização enquanto a garantia estiver ausente. Não está autorizado
nem ensaiado nesta publicação. API, worker e scripts precisam estar compatíveis;
SECULT segue não implementada, aguardando revisão desta dependência.

## Resultado implementado e fronteira do mecanismo

- Novo `src/config/tenantOperationalConfigStore.ts`: abre transação somente quando
  recebe PrismaClient; TransactionClient é reutilizado. O callback recebe a mesma
  transação, lê depois do lock e deriva a alteração delimitada. Não recebe documento
  inteiro pré-calculado, não faz retry automático nem chama provider/rede externa.
- Upserts garantem a linha por `createMany(skipDuplicates:true)` sob a unicidade
  existente de clientId, sem atualizar o vencedor. Depois adquirem `FOR UPDATE`.
  Criação concorrente e rollback da criação foram exercitados no DB isolado.
- Caminhos update-only/no-op usam `createIfMissing:false` e resultado `onMissing`.
  Se SELECT não encontrou linha, não executam o callback de mutação: isso impede
  que uma segunda leitura encontre uma inserção concorrente e grave sem lock.
  Não criam linha por efeito colateral. Caso concorrente reproduzido e aprovado.
- **34 substituições migradas em 8 arquivos existentes** (inventário histórico
  abaixo). 19 setters preservam merges/normalizadores de domínio. Canned replies
  carrega e altera o array dentro do lock nos três consumidores. WEB_SESSION e
  identidade híbrida reavaliam condições/exclusões dentro dele; efeitos posteriores
  sobre identidade META/eventos continuam fora da nova transação, como antes.
- Os três scripts releem config e refazem o merge dentro do lock. As leituras
  anteriores do backfill/demo servem ao relatório/planejamento, não ao documento
  gravado. Payloads explícitos, listas completas e valores de defaults continuam
  obedecendo à semântica anterior: não foi introduzido deep merge genérico.
- Um ajuste exclusivamente de tipo em load-test bootstrap anota o fallback de
  getTenants como TenantConfigMap. Corrige TS7053 preexistente no typecheck isolado;
  o catch/retorno vazio e comportamento de runtime não foram alterados.
- `schemaVersion` continua versão de formato, não versão de concorrência. Chaves
  desconhecidas/irmãs são preservadas; arrays são tratados pelo domínio; null e
  delete não são intercambiáveis. SECULT aparece somente como sentinela sintética
  nos testes, sem parser, UI, autorização nova ou ativação de tenant.

## Rodízio e ordem de locks

| Caminho | Ordem e limites |
|---|---|
| Setters/config/canned/scripts | Criação condicional quando cabível → config row → leitura/transformação/gravação; commit curto. Sem lock de fila. |
| Distribuição automática | Advisory de fila existente → config row → releitura de política/cursor, runtime, elegibilidade e carga → seleção e atribuição/evento na transação existente. |
| Reconciliação WEB_SESSION | Transação existente de ChannelAccount (incluindo escritas/evento anteriores quando aplicável) → config row para marcar OWNED → commit do chamador. |
| Identidade híbrida | Leitura META anterior preservada; config row protege JSON e leitura de autorização WEB_SESSION. Limpeza META/eventos após saída do helper, sem novo lock ChannelAccount dentro dele. |

A seleção do rodízio não é feita antes do novo lock: teste força mudança de cursor
na espera e comprova escolha do próximo atendente pelo cursor confirmado, mantendo
outro escopo e revogação. Fórmula, presença, carga, elegibilidade e regras de
capacidade permanecem as mesmas. O lock de configuração serializa também escopos
diferentes do mesmo tenant. Não foi encontrado caminho novo config → advisory de
fila ou config → escrita ChannelAccount; não há inversão introduzida entre esses
caminhos auditados. Chamadores futuros devem respeitar essa ordem.

A transação de distribuição já contém leituras, atribuição e evento no DB; o
callback desse caminho inclui esse trecho para manter decisão e cursor coerentes.
Isso especifica a proposta anterior de “transformação pura”: o helper não aceita
I/O externo, mas a transação existente inclui operações DB do domínio. Não muda o
algoritmo nem abre transação independente. O acesso read-only de disponibilidade
mantém o cliente anterior; não adquire lock de configuração/fila por outra conexão.

Limite: locks duram até o commit/rollback externo; não há garantia universal de
latência ou ausência de deadlocks de quaisquer outras tabelas. Mantidos timeouts
Prisma existentes; falhas propagam/rollback, sem retry de efeitos. Não há ensaio
produtivo de carga/contensão nesta etapa.

## Validação local comprovada

PostgreSQL em loopback, DB exclusivo `re7_config_persistence_20260928`, esquema
copiado de fixture local sintética preexistente, sem dados produtivos ou migration.
Testes entre arquivos executados serialmente; dentro deles há conexões/processos
concorrentes reais, barreiras explícitas e confirmação de espera em pg_stat_activity.
Scripts filhos usam cwd temporário, env mínimo e tenants sintéticos; não carregam
.env privado, sessões, providers ou schedulers.

| Verificação | Resultado |
|---|---|
| Suíte afetada de 9 arquivos | **185/185 PASS**, 0 skip, ~8,71 s |
| Store (incluído acima) | **36/36**: reprodução assinatura/revogação, 30 casos de escritores, criação concorrente, transação externa/rollback, outro tenant, arrays e ausência concorrente |
| Scripts (incluído acima) | **4/4**: 3 processos CLI com revogação sob lock, preservação de campos e dry-run; create-only existente verificado |
| Guarda AST (incluída acima) | **1/1**: 34 substituições, 3 consumidores canned protegidos, 1 exceção create-only |
| Distribuição (incluída acima) | **16/16**, incluindo round-robin/least-active concorrentes e releitura de cursor após espera |
| Worker simulado, arquivo whatsappWebSessionWorker.test.ts | **22/22 PASS**, 0 skip, ~0,65 s |
| Backend | `npm run build`: PASS (tsc com checagem) |
| Scripts | tsc estrito --noEmit nos 3 scripts: PASS |
| Worker | `npm run build`: PASS; comando canônico usa --noCheck, portanto não equivale a typecheck integral do worker |
| Diff | `git diff --check`: PASS |

Falhas intermediárias preservadas na evidência: mock antigo não expunha $queryRaw
(ajustado, assertions preservadas); fixture de contagem global interferiu com outro
arquivo concorrente (contagens agora por tenant e comando serial entre arquivos);
inferência de união no novo onMissing corrigida com NoInfer; dependências locais do
worker ausentes (npm ci --ignore-scripts pelo lockfile); TS7053 do script corrigido
somente por anotação de tipo. Sem fallback inseguro no código produtivo.

Exceção create-only `/admin/tenants`: `update:{}` não restaura configuração existente,
mas criações concorrentes com o upsert Prisma antigo podem produzir P2002 em um
concorrente. O teste comprovou um único registro e ausência de sobrescrita, e aceita
somente esse erro conhecido no perdedor. Não é promessa de sucesso de todas as
requisições de provisionamento; falha preexistente separada da proteção substitutiva.
Não foi alterada a rota. A criação pelo novo helper não apresentou esse problema.

Reprodução original, patches, hashes e logs permanecem em `local-evidence/`, fora
do Git. Relatório local: `config-persistence-20260928/RESULT_REPORT.md`.
Não houve frontend/smoke visual: esta dependência não muda UI. Os PASS não validam
consulta SECULT nem campanhas/CRA.

## Condição obrigatória para implantação futura (somente mapeada)

Não basta atualizar a API. Todos os processos com esses escritores devem carregar
a mesma correção, sem escritores antigos simultâneos:

1. Todas as instâncias da API e quaisquer executores do código compartilhado de
   distribuição/inbound/inatividade, além dos endpoints administrativos.
2. **Worker WEB_SESSION**: `whatsappWebSessionWorker.ts` importa
   `webSessionIdentity.ts` (reconcile → markWebSessionAuthorizationOwned) e
   `webSessionInbound.ts` (applyBalancedQueueAssignment). Usa Prisma diretamente;
   seu build incorpora fontes de whatsapp-agent. É escritor real, não só cliente
   HTTP. Artefato/configuração/cwd/supervisão de sua versão terão de ser conferidos
   numa preparação futura, preservando sessões; nada foi reiniciado agora.
3. Scripts backfill, load-test bootstrap e provision-demo, inclusive invocações
   manuais, jobs externos, checkout antigo ou dist armazenado. O inventário de
   fonte não comprova inexistência de automações externas.
4. Rollback para binários antigos desfaz a garantia de concorrência; migração não
   é necessária, mas SECULT não pode depender da nova garantia durante esse estado.

Um escritor antigo obtém lock de UPDATE no final, porém continua podendo gravar
seu JSON calculado antes e reativar a sentinela. A guarda AST é proteção proporcional
no código-fonte inventariado, não barreira contra SQL manual, aliases arbitrários,
binários antigos ou escritores externos. A futura revisão operacional deve
conferir a matriz de impacto/deploy e a identidade real de API/worker/scripts;
nenhum deploy, plano de restart executado ou alteração produtiva está autorizado
nesta etapa.

---

# Histórico — proposta delimitada anterior à implementação

Data: 28/09/2026. Base: `3b891eb0c862c6767d57e7886f09cba85dc1ac2f`,
branch `review/campaign-recovery-20260926`.
Status: **PROPOSED / NOT IMPLEMENTED**; SECULT continua
**BLOCKED BEFORE IMPLEMENTATION / NOT DEPLOYED**.

Não houve implementação, testes novos, produção, commit, push ou deploy nesta
etapa. Reprodução anterior e hashes preservados em
`local-evidence/secult-own-closed-20260928/`; inventário auxiliar em
`writers-inventory.tsv`. Campanhas/CRA continuam aguardando validação funcional
do owner. DB-only aceita; Guia inatividade pausado; 6683 CLOSED.

## Inventário completo dos pontos de escrita rastreados

Busca em arquivos versionados de aplicação e scripts, incluindo referências ao
modelo, SQL e possíveis escritas por relação. Encontrados **35 pontos em 9
arquivos**: **34 substituem config**, **1 só cria quando ausente**. Não foram
encontrados outros caminhos de escrita por relação, SQL direto ou interceptor
Prisma nesses arquivos. Inventário cobre esta revisão do repositório, não
comandos externos manuais nem binários de versões antigas.

### Módulo de configuração: 19 pontos diretos, sem helper comum de escrita

Todos em `apps/whatsapp-agent/src/config/tenantOperationalConfig.ts`; os
consumidores chamam os setters abaixo, mas cada setter executa seu próprio
findUnique + upsert do documento. Agrupamento no mesmo módulo não constitui
serialização compartilhada.

| Linha | Setter | Chave de domínio |
|---|---|---|
| 950 | saveWebSessionAlertEmails | webSessionAlertEmails |
| 1016 | saveRuntimeLimitsSettings | runtimeLimits |
| 1077 | saveSatisfactionPolicySettings | satisfactionPolicy |
| 1138 | saveServiceMessagePolicySettings | serviceMessages |
| 1204 | saveChatbotCloseMessageSettings | chatbotCloseCommand.closedMessage; preservar irmãos |
| 1287 | saveAgentSignatureSettings | agentSignature |
| 1361 | saveInteractiveContactStartPolicy | allowInteractiveContactStartViaWebSession |
| 1419 | saveWhatsappTransportRoutingEnabled | whatsappTransports; preservar outro transporte |
| 1478 | saveWhatsappTemplatePolicySettings | whatsappTemplatePolicy |
| 1520 | saveInboxVisibilityPolicy | inboxVisibilityPolicy |
| 1622 | saveFollowUpSettings | followUp |
| 1696 | saveHandoffLeadNotificationSettings | handoffLeadNotification |
| 1756 | saveMediaHandoffPolicy | mediaHandoffPolicy |
| 1815 | saveWhatsappMediaPolicy | whatsappMediaPolicy |
| 1897 | savePlanLimitsSettings | planLimits |
| 1977 | saveAutomationFlagsSettings | automationFlags |
| 2069 | saveAiAssistantConfigSettings | aiAssistantConfig |
| 2153 | saveAiIntentQualificationSettings | aiIntentQualification; aiQualification explícito normaliza para valor ou null |
| 2213 | saveCrmBusinessStatuses | crmBusinessStatuses |

### Demais escritores

| Arquivo (sob apps/whatsapp-agent) | Pontos | Caminhos/contrato |
|---|---:|---|
| src/config/cannedReplies.ts:127 | 1 | Helper local saveOperationalConfig usado por createCannedReply, updateCannedReply e setCannedReplyActive; arrays são derivados do JSON lido anteriormente. |
| src/queue/assignmentPolicy.ts:505,737 | 2 | saveQueueAssignmentPolicy e applyBalancedQueueAssignmentLocked; este último persiste cursor lastAssignedUserIdByScope, mas hoje regrava também todo o restante de config. |
| src/web-session/webSessionAuthorization.ts:116,154,180,208 | 4 | saveWebSessionAuthorization, markWebSessionAuthorizationOwned, markWebSessionAuthorizationReleased, markWebSessionAuthorizationInvalidatedByMetaIdentityChange. |
| src/web-session/hybridIdentity.ts:287,352,408,689,717 | 5 | startWhatsappNumberReplacement, cancelWhatsappNumberReplacement, completeWhatsappNumberReplacementIfMatched, saveWhatsappPrimaryTransport, clearWhatsappPrimaryTransport. |
| scripts/backfill-tenant-operational-config.ts:390 | 1 | main/mergeConfig; mescla domínios legados com snapshot carregado antes do loop de escrita. |
| scripts/load-test-tenant-bootstrap.ts:160 | 1 | upsertTenantConfig; planLimits, templates.manualHandoff, automationFlags. |
| scripts/provision-demo-tenant.ts:315 | 1 | main/mergeOperationalConfig; cannedReplies e queueAssignmentPolicy. Possui restrição de tenant Demo, mantida. |
| src/http/routes.ts:21059 | 1 seguro | POST /admin/tenants, upsert com update:{}; cria config:{} somente na ausência. Não restaura chave em linha existente. Manter e testar como exceção explícita. |

Os scripts não são executados nesta proposta, mas não podem continuar como
escritores antigos se o mecanismo for apresentado como proteção de todos os
caminhos suportados. Fixtures/testes são separados do inventário de runtime;
não se deve confundir configuração sintética direta de teste com API permitida.

## Mecanismos já existentes e limites

- `queue/assignmentPolicy.ts:480`: advisory lock transacional por escopo de
  distribuição; releitura da política dentro da transação. Protege concorrência
  de atribuição naquele escopo, não assinatura/WEB_SESSION/scripts ou outro
  escopo que escreve o mesmo documento.
- `billing/receptiveSessionMeter.ts:158` e `campaigns/campaignCsvBatch.ts:29`:
  advisory locks de outros domínios. Não reutilizar suas chaves para configuração.
- `campaigns/campaignExecutionQueue.ts:97,205,436` e `campaignRunner.ts:656`:
  locks de linha via SQL parametrizado `FOR UPDATE` dentro de Prisma transaction.
  Reutilizável como padrão, sem travar Client/fila de campanhas nesta dependência.
- `consent/contactConsent.ts:149`: Serializable com retry limitado P2034;
  é domínio próprio, não proteção automática do JSON de configuração.
- `db.ts`: PrismaClient sem $extends/$use que intercepte esses setters.
- TenantOperationalConfig tem updatedAt e schemaVersion; não há CAS nesses
  escritores. schemaVersion=1 é versão de formato, não contador concorrente.
- Não encontrado helper produtivo de patch JSONB (`jsonb_set`/jsonb_insert) nos
  caminhos rastreados. O jsonb_set da reprodução é somente o segundo escritor
  sintético e demonstrou que proteger só um lado é insuficiente.

## Estratégia escolhida: serializar a mutação na linha existente

Criar **um helper de persistência**, por exemplo
`src/config/tenantOperationalConfigStore.ts`, reutilizando PostgreSQL/Prisma e a
mesma tabela. Sem migration, trigger, tabela, nova infraestrutura ou versão
paralela. Contrato: recebe clientId, contexto Prisma/TransactionClient e uma
transformação pura do JSON ATUAL; não recebe um nextConfig completo produzido
por leitura anterior.

Sequência proposta:

1. Reutilizar a transação recebida; quando houver PrismaClient, abrir transação
   curta. Nunca abrir transação independente dentro de outra.
2. Para os atuais upserts, garantir a linha por inserção condicional sem atualizar
   a existente (ex.: createMany skipDuplicates), dentro da mesma transação.
   Manter id/defaults e timestamps Prisma. Para update-only ou clear/no-op,
   preservar ausência/erro/no-op originais, sem criar uma linha incidentalmente.
3. Obter lock de **TenantOperationalConfig** por clientId com `FOR UPDATE` e
   ler o JSON após o lock. Não usar Client como mutex nem lock de campanha.
4. Executar a transformação a partir dessa leitura; preservar chaves desconhecidas
   e irmãs. Persistir, devolver resultado e confirmar transação. O lock permanece
   até o commit do chamador quando já há transação externa.
5. Normalizadores/defaults atuais continuam nos setters; não serializar somente
   parseOperationalConfig, pois ele não representa todas as chaves armazenadas.
   Manter schemaVersion/updatedAt conforme contrato de cada escritor; não usar
   schemaVersion como contador. Campos omitidos não são instrução de apagar.

Todos os **34 pontos substitutivos** passam pelo helper. A garantia depende dessa
cobertura: um escritor antigo que continue gravando JSON inteiro pode desfazer
uma alteração mesmo que os novos escritores usem lock corretamente.

### Casos que exigem cuidado, sem redesenho de domínio

- Canned replies: mover a leitura e alteração do array para dentro da mutação;
  trocar apenas a última chamada de saveOperationalConfig deixa perda de atualização.
- Configurações parciais: mesclar campos fornecidos com o subobjeto atual sob lock,
  mantendo defaults, null/false/[] e a normalização vigente. Atualizações completas
  do mesmo campo continuam ordenadas por commit; não introduzir merge de produto.
- WEB_SESSION: preservar substituição intencional do subobjeto de autorização
  em RELEASED/INVALIDATED (não ressuscitar número autorizado com deep merge).
  Operações condicionadas ao valor anterior precisam avaliar esse valor fresco.
- Hybrid identity: start substitui whatsappNumberReplacement e remove
  whatsappPrimaryTransport; cancel/complete removem whatsappNumberReplacement;
  clear remove whatsappPrimaryTransport. Exclusão é delete, não null/undefined
  transformado em merge. Não reintroduzir valores de snapshots antigos.
- aiIntentQualification: preservar aiQualification=null quando o campo é enviado
  sem configuração válida; quando omitido, manter valor atual. O delete observado
  em applyAiIntentQualificationToTenant pertence à projeção TenantConfig, não ao
  JSON persistido; não converter null em exclusão na camada de persistência.
- Rodízio: preservar cálculo de elegibilidade, carga, presença, seleção e advisory
  lock existente. Dentro da transação já aberta, atualizar somente
  queueAssignmentPolicy.lastAssignedUserIdByScope[scopeKey] sobre config fresco,
  preservando outros escopos e flags; não regravar policy/config obtidos antes.
  saveQueueAssignmentPolicy preserva cursor corrente no mesmo mecanismo.
- Scripts: mergeConfig/mergeOperationalConfig devem receber config fresco na hora
  da escrita, não o incluído na consulta inicial. Dry-run continua sem escrita.
- Efeitos externos, provider, evento de domínio ou decisão de atribuição não são
  executados pelo callback. Nenhum retry automático de fluxo com efeitos externos;
  retry somente onde já existe e sobre trecho seguro, ou erro controlado/rollback.

## Por que essa é uma mudança compartilhada delimitada

Proteção somente no setter SECULT, mutex em memória, lock apenas da nova chave ou
jsonb_set apenas para ela não impedem a sobrescrita demonstrada. Outro campo/tabela
contrariaria o armazenamento aprovado; trigger ou interceptor global teria maior
alcance e esconderia regras de exclusão. CAS com coluna de versão exige migrar
os mesmos escritores e tratar conflitos/retries; não reduz este escopo.

Patch atômico por caminho em todos os escritores é alternativa viável, mas exige
expressar separadamente arrays, remoções, condições e merges normalizados. Neste
inventário, a serialização de leitura/transformação/escrita conserva mais código
existente e usa padrão já presente no projeto. Não é promessa de zero contenção:
há serialização breve por tenant, sem bloqueio global entre tenants.

O delta previsto é **8 arquivos existentes de persistência/scripts**, um helper
novo e testes. `routes.ts` tem apenas provisionamento create-only nesta dependência
(não precisa mudança funcional; deve ficar na whitelist testada). Rotas/UI SECULT
continuam bloqueadas e são uma etapa posterior, não incluídas nesta implementação
proposta. A distribuição de trabalho não será redesenhada.

## Riscos e condições de aceite da dependência

- Ordem de locks: manter queue advisory -> config row; auditar chamadores com
  transação externa (especialmente WEB_SESSION). Não criar caminho inverso
  config row -> queue lock. Callback não chama setters que recursam/abrem tx.
  Tempo sob lock deve ser curto; medir espera, duração e timeout sem provider.
- Linha ausente: testar duas criações concorrentes sem apagar a primeira gravação.
- Mesmo tenant/múltiplos escopos: preservar cursores independentes. Outro tenant
  não deve aguardar o lock do primeiro.
- Transação externa: falha deve reverter todas as suas alterações; não confirmar
  configuração fora da transação que controla a atribuição.
- Nenhuma garantia para binários/scripts antigos. Futuro rollout precisa impedir
  escritores da versão antiga em paralelo; não basta atualizar o setter SECULT.
  Preparação operacional será etapa separada, sem intervenção agora.
- Estado JSON legado inválido/defaults: testar comportamento dos normalizadores
  existentes sem limpeza incidental, reinterpretação ou ativação implícita.

## Testes focados propostos (não executados nesta etapa)

1. Reutilizar `config-race.ts` e a sequência já comprovada como regressão. Com
   helper novo, pausar dentro da seção crítica: segundo escritor deve aguardar;
   após commits, revogação permanece false. Também testar requisição de assinatura
   preparada antes da revogação, mas persistida depois: não pode restaurar true.
   Adaptar barreira para não esperar o segundo commit enquanto o primeiro lock
   está retido (isso criaria deadlock artificial do próprio teste).
2. Assinatura + chave SECULT, e cada família de escritor + revogação: mudanças
   independentes preservadas, chave ausente não criada e false não revertido.
3. Todos os 19 setters: payloads/normalização/retornos equivalentes; testar irmãos,
   unknown keys, null, false, [], propriedades omitidas e exclusões explícitas.
4. Canned replies concorrentes: duas inclusões e edições em registros diferentes;
   nenhuma perda de item/atributo não modificado.
5. Política + cursores de dois departamentos + revogação: preservar flags e
   lastAssignedUserIdByScope; manter testes existentes de distribuição e rollback
   da transação, sem provider ou alteração de decisões de elegibilidade.
6. WEB_SESSION/replacement/primary transport: condições e remoções mantidas;
   flags alheias preservadas. Simular integrações sem rede real.
7. Scripts: aplicar funções de merge contra fixtures sintéticas com chave já
   desativada; dry-run não altera nada. Provisionamento update:{} permanece no-op.
8. Concorrência real com conexões/processos independentes ao DB isolado; inserir
   config ausente, falha/rollback, espera limitada, tenants separados e lock order.
9. Teste estrutural/AST enumera escritores: substituir config fora do helper falha,
   com exceção explícita do create-only de /admin/tenants e fixtures de teste.
10. Builds backend/scripts pertinentes após implementação; não repetir frontend
    ou suítes sem delta. SECULT requer depois sua própria matriz funcional/smoke.

A reprodução anterior prova o defeito. Nenhum teste deste plano prova ainda a
solução, porque ela não foi implementada. A dependência só será encerrada após
cobertura do inventário, regressão concorrente e equivalência dos contratos.
