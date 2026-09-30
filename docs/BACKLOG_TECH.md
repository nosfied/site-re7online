# BACKLOG — RE7ONLINE WHATSAPP AGENT

**Atualização operacional 30/09, 02:30 UTC — correção 91230f88 DEPLOYED TECHNICALLY / INCIDENT OPEN.** [Troca, backup, validações e limites](saas/AUTOMATION_RUNTIME_FIX_ROLLOUT_2026-09-30.md). API b66bb89a e worker mínimo com backport específico efetivos; frontend ba66 preservado; guarda e scheduler no estado inicial. Falta prova em conversa nova Syer: outbound aceito, nó/flow persistido e resposta seguinte avançando. META_CLOUD puro e híbrido API→WEB permanecem não exercitados.

**Atualização 30/09 — incidente 91230f88: PREPARED / NOT DEPLOYED / INCIDENT OPEN.** [Plano operacional e backup fresco verificado](saas/AUTOMATION_RUNTIME_FIX_PREPARATION_2026-09-30.md): API b66bb89a + worker mínimo com backport específico preparados; frontend atual permanece. Decisão final da janela, troca com barreira de saída e prova funcional de avanço em Syer ainda pendentes. META_CLOUD e híbrido não exercitados após correção permanecem pendentes. Campanhas/CRA seguem aguardando validação funcional do owner.

## Incidente prioritário 91230f88 — correção local para revisão, 29/09/2026

**INCIDENT OPEN IN PRODUCTION / FIX LOCAL VALIDATED / NOT DEPLOYED.** [Matriz de todos os tenants, causa, testes e retorno compatível](saas/AUTOMATION_RUNTIME_SELF_WRITE_INCIDENT_2026-09-29.md). Syer: escrita própria de atividade outbound invalidava updatedAt e impedia persistir avanço. Tendência: conflito correlacionado com encaminhamento humano legítimo; não atribuído ao loop. Demais tenants inventariados, sem prova de ocorrência no período observado.

Fix mantém CAS e reconhece apenas a escrita própria condicional; protege tenant/identidade, ciclo, inbound e transições humanas. API inclui projeção de identidade Meta condicional; worker exclusivamente mínimo bf5+f06+912 com patch específico de quatro fontes. 15 casos integrados API; caso Meta/IA revalidado após projeção; 14 aplicáveis no worker Node20.20.0, também nos compilados; 89 regressões afetadas PASS, sem somar reexecuções. Backend tipado PASS; worker --noCheck PASS e 13 diagnósticos --noEmit idênticos à base, sem aprovação integral de tipos.

Publicação somente para auditoria; nenhum restart, alteração da guarda/scheduler, fluxo, transporte ou runtime produtivo. Retornos estreito/abrangente e riscos estão no incidente, sem execução autorizada nesta etapa. Recuperação exige avanço persistido após publicação controlada, não health. Chave Automação permanece ligada somente em Syer; sua validação não equivale a CRA. Resposta automática tardia e frente maior pendente continuam separadas. Campanhas/CRA aguardam owner; SECULT e DB-only encerradas; inatividade Guia pausada;6683 CLOSED.


## Syer — acompanhamento ativado, validação parcial; regressão de consentimento separada

**ACTIVATED IN SYER / FUNCTIONAL VALIDATION PARTIAL.** [Setter/auditoria, verificações e limitações](saas/SYER_AUTOMATION_ACTIVATION_2026-09-29.md). Tenant canônico `syer-rodrigues`, confirmado pelo owner; sequência ADMIN true→false→true, estado final ligado somente nele. Owner relatou leitura por papel e filtro SUPERVISOR zerado na revogação; anexos restritos, novos eventos realtime e intervenções reais não receberam PASS produtivo. Nenhum atendimento assumido/encaminhado; leitura preservou fingerprint de controle. Demais tenants não ativados. Não equivale a aceite CRA-PR.

**Regressão a corrigir separadamente:** no WEB_SESSION, atividade do próprio outbound altera updatedAt e invalida o token91230f88; persistência do avanço do chatbot é rejeitada e o consentimento reinicia. Código/logs/estado do caso autorizado + reprodução sintética em DB local confirmaram o mecanismo. Não corrigir removendo proteção humana nem trocar pelo worker completo; requer ajuste dirigido e cobertura do outbound simulado/conflitos nos artefatos API/worker mínimo. Nenhuma correção ou deploy nesta etapa. Limitação de resposta automática tardia permanece distinta. Campanhas/CRA aguardam owner; SECULT encerrada; inatividade Guia pausada;6683 CLOSED.

## Release Automação implantada — 29/09/2026, Fortaleza

**DEPLOYED / AUTOMATION NOT ACTIVATED.** [Execução, versões, backup, retorno e limites](saas/AUTOMATION_ROLLOUT_2026-09-29.md). API/frontend ba66c241 (funcional d06a92b8); worker exclusivamente mínimo bf5+f06+backport91230f88. Correção912 separada do acompanhamento BOT. `allowAutomationConversationsInInbox` permanece false/ausente em todos; nenhum tenant ativado. Owner confirmou sessão, Inbox, CRM e configurações em leitura; não equivale a aceite funcional de Automação. Contenção de 3min20; processos antigos/sockets ausentes e barreira DB/locks zero antes do sucessor. Sessões preservaram 3 connected / 1 disconnected / 1 pending; risco residual inbound/outbound/auth não é eliminado por essa contagem. Guarda reaberta na geração 7, scheduler preservado e dois ciclos naturais observados; crons/boot/saved/fallback restaurados com referências compatíveis. Registros anteriores de NOT DEPLOYED permanecem históricos, superados apenas quanto ao deploy técnico por esta entrada.

Escritores compatíveis e retorno a3/minimal-f06 preservados; rollback não restaura DB/auth antigos nem autoriza dois proprietários. Respostas automáticas em andamento seguem limitação separada, sem promessa de cancelamento. Campanhas/CRA aguardam validação funcional do owner; ativação/aceite BOT posteriores; SECULT encerrada/aceita; inatividade no Guia pausada; DB-only encerrada; 6683 CLOSED.

## Automação — preparação remota concluída, janela pendente

**PUBLISHED FOR REVIEW / NOT DEPLOYED.** [Evidências de releases, backup fresco e restauração isolada](saas/AUTOMATION_RELEASE_PREPARATION_2026-09-29.md). Pacote API/frontend ba66c241 mantido; worker mínimo f06+912 separado. Configs privadas resolvidas sem início; restore local PASS/60 checksums, banco temporário removido. Guarda/scheduler/processos/sessões preservados; Automação desligada. Pendem início/fim da janela, horizonte de escalonamento/retorno e aceite do risco residual inbound/outbound/auth. Entradas históricas abaixo preservam o estado de cada etapa; não representam pendência atual de preparar releases/backup. Campanhas/CRA aguardam owner; SECULT encerrada.

## Automação — plano de publicação controlada, aprovação pendente

PUBLISHED FOR REVIEW / NOT DEPLOYED. [Plano ba66c241 e worker mínimo91230f88](saas/AUTOMATION_RELEASE_PLAN_2026-09-29.md): pacotes locais verificados, Prisma compatível sem migration; produção só lida. Pendentes backup fresco/restauração, releases/configs remotas, janela/fim e decisão sobre risco residual do worker; não confundir zero tarefas com drain. Ownership individual lock→PID não comprovado pela projeção disponível, barreira conservadora obrigatória antes do sucessor. Deploy com chave Automação false; ativação tenant/aceite posteriores. Sem mudança de guarda/scheduler/cron/boot nesta preparação. Campanhas/CRA aguardam validação funcional do owner; inatividade Guia pausada; limitação de resposta automática separada; SECULT encerrada;6683 CLOSED.

## Automação — publicação para auditoria GitHub

**PUBLISHED FOR REVIEW / NOT DEPLOYED.** Código até d06a92b8, mantendo c6884100 e 91230f88 separados; [pacote versionado do worker mínimo e relatório final](reviews/automation-worker-backport/README.md). Sem deploy, ativação ou novos testes nesta publicação. Limitação de respostas automáticas separada; Campanhas/CRA aguardam owner, inatividade no Guia pausada.

## Automação — auditoria dirigida de c6884100

**LOCAL VALIDATED / NOT DEPLOYED.** Confirmados e corrigidos localmente: evento BOT restrito após CLOSED escapava para caminho humano; leitura REST podia usar grant BOT após handoff fora do vínculo. Proveniência do evento preservada e checkpoints nos builders/antes de JSON e mídia. 4 novos testes dirigidos PASS e build backend PASS; sem repetir suítes anteriores. [Reprodução, correção e limites da autorização](saas/INBOX_AUTOMATION_LOCAL_2026-09-29.md#auditoria-dirigida-posterior-a-c6884100--corridas-de-leitura). Correção separada de c6884100/91230f88; sem push/deploy/ativação. Respostas automáticas em andamento são limitação técnica separada. Campanhas/CRA aguardam validação funcional do owner; inatividade no Guia continua pausada.

## CRA-PR — acompanhamento BOT, escopo final local

**LOCAL VALIDATED / NOT DEPLOYED.** Decisão do owner substitui o gate departamental abaixo: SUPERVISOR/ADMIN do próprio tenant, sem vínculo departamental para leitura, somente filtro Automação, fora de TODAS; AGENT sem exceção. Default false, gestão ADMIN, helper transacional (36 escritores). [Implementação, provas e limites](saas/INBOX_AUTOMATION_LOCAL_2026-09-29.md). Código sobre 91230f88, revisão final aprovada para commit local separado, sem push/deploy. Matriz de operações e roteiro funcional registrados no relatório; código byte-idêntico ao validado.

**Limitação técnica separada, sem redefinir a frente maior pendente:** coordenação entre intervenção humana e resposta automática em andamento; não resolvida pela chave de acompanhamento nem pela proteção de persistência 91230f88. Sem cancelamento prometido. Campanhas/CRA aguardam validação funcional do owner; SECULT encerrada; inatividade no Guia pausada; 6683 CLOSED.

## Acompanhamento BOT — verificação departamental sobre 91230f88

**BLOCKED BEFORE IMPLEMENTATION**, conforme gate do owner. O contrato humano compara departamento/vínculo, sem marcador de confirmação, mas não estabelece autorização BOT por fallback Meta ou contexto de nó/opção do chatbot compartilhado com WEB_SESSION. “Destino confirmado” era condição proposta, não regra comprovada do resolvedor. [Evidência e decisão concreta](saas/INBOX_AUTOMATION_VISIBILITY_PROPOSAL_2026-09-29.md#verificação-do-contrato-departamental--etapa-local-sobre-91230f88): definir se departamento persistido, inclusive fallback/contexto, autoriza acompanhamento; alternativa mínima é ADMIN-only até essa definição, sem criar marcador. Nenhuma implementação/ativação, nem delta no worker.

Correção automação × rodízio 91230f88 preservada separadamente, somente revisão. SECULT encerrada; campanhas/CRA aguardam validação funcional do owner; inatividade no Guia pausada; 6683 CLOSED.

## Automação × rodízio e acompanhamento BOT — 29/09/2026

- **Defeito automação × rodízio: correção LOCAL VALIDATED / NOT DEPLOYED**, publicação somente para revisão. Distribuição exige controle humano; conclusão obsoleta não apaga transição concorrente. 115 testes afetados PASS e refinamento de 13 reexecutado; worker mínimo Node20 validado com seleção de 15 casos. Limites de tipagem, storage legado e resposta automática tardia explícitos no [relatório](saas/AUTOMATION_QUEUE_RACE_LOCAL_2026-09-29.md). O guard de envio não demonstra exclusão de toda intervenção humana: revisar contrato antes de ampliar a correção.
- **Acompanhamento BOT: PROPOSTA, NÃO IMPLEMENTADA.** Reutilizar filtro Automação e Inbox, chave ADMIN/default false, leitura por escopo departamental e intervenção separada. [Matriz, caminhos e decisões](saas/INBOX_AUTOMATION_VISIBILITY_PROPOSAL_2026-09-29.md).
- **Preexistente separado:** realtime SUPERVISOR tem caminho amplo por tenant. Novos eventos BOT não podem herdar esse alcance; autorização BOT indispensável não autoriza reformulação geral de eventos humanos.

SECULT DEPLOYED / CLIENT ACCEPTED conforme relato do owner. Campanhas/CRA aguardam validação funcional do owner; inatividade no Guia pausada; DB-only encerrada; 6683 CLOSED. Nenhuma mudança produtiva nesta frente.

## Fechamento SECULT — confirmação do owner em 29/09/2026

**DEPLOYED / CLIENT ACCEPTED.** Deifson informou: “SECULT aprovou. Já está
utilizando a nova atualização.” Ativação e uso registrados conforme esse relato;
não foram informados horário, executor da ativação ou casos específicos exercitados.
A confirmação do cliente é distinta das verificações técnicas e testes locais.
A pendência de ativação registrada na janela anterior fica superada pelo relato,
sem reescrever sua evidência histórica ou afirmar nova leitura técnica da chave.
Permanecem os limites de shutdown, tipagem e rollback documentados; escritores
compatíveis são necessários para preservar a garantia de concorrência.
Campanhas/CRA aguardam validação funcional do owner; inatividade no Guia pausada;
DB-only encerrada/aceita; 6683 CLOSED. Telegram e DELIVERED/READ separados.


## Estado vigente — janela SECULT de 29/09/2026

**Código implantado; ativação SECULT e aceite funcional pendentes.** API/frontend
`a3d16d4b`, worker mínimo `bf5f1d76` + cinco fontes `f06d49cb` (pacote `042e386a`).
[Fechamento técnico, backup, horários, limites e retorno](saas/SECULT_ROLLOUT_2026-09-29.md).
Campanhas reabertas (geração 5), scheduler observado; Inbox/CRM confirmados pelo
owner. Chave permanece desligada em todos os tenants: falta sessão legítima ou
grant de suporte existente para o setter SECULT. Sem contorno de RBAC/SQL.
Compatibilidade de API/worker/scripts deve ser mantida; retorno a escritores antigos
perde a garantia concorrente. Primeira interrupção autorizada não comprova drain
retroativo do worker. Campanhas/CRA aguardam validação funcional do owner; DB-only
encerrada, inatividade no Guia pausada, 6683 CLOSED. Registros abaixo preservam
o escopo e o estado histórico de cada etapa.


## SECULT — publicação para revisão após Node20 — 29/09/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Node v20.20.0 exato: 65 módulos carregados sem
entrypoint, 104 testes PASS (29+45+30), dependências inalteradas. [Provas e limites](reviews/secult-worker-persistence/NODE20_RESULTS.md).
Material somente para revisão: patch de cinco fontes, receita/manifesto, proposta
de parada e plano. G1 revisão/configuração e G2 parada continuam abertos. Primeira
interrupção não tem drain comprovado; sem implementação de shutdown. Campanhas/CRA
aguardam owner; legados sem prova não precisam ser liberados; 6683 CLOSED.


## SECULT — backport escolhido, pacote fonte reproduzido — 29/09/2026

**REVISÃO LOCAL / NOT DEPLOYED.** Direção do owner: worker mínimo sobre bf5f1d76;
cinco fontes f06 separadas da API/frontend. Reconstrução limpa pelos lockfiles:
92 compilados idênticos. [Diff exato, manifesto e proposta completa](reviews/secult-worker-persistence/README.md).
G1 revisão/runtime alvo e G2 parada continuam abertos. Nova correção de shutdown não
implementada; primeira interrupção antiga tem risco próprio, sem prova retroativa.
Retorno preferencial compatível+chave false não se confunde com API antiga sem SECULT,
que perde garantia de persistência. Legados sem comprovação não precisam ser
liberados; sem backfill/inferência/corte temporal. Campanhas/CRA aguardam owner.


## SECULT — alternativa mínima do worker e gate de parada — 29/09/2026

**AVALIAÇÃO LOCAL CONCLUÍDA / G1 E G2 ABERTOS / NOT DEPLOYED.** Base bf5f1d76
reproduz 91 JS do bundle real e todos os 65 módulos alcançáveis; pacote/lock/tsconfig
idênticos. Backport experimental de cinco fontes exatas de f06 altera somente quatro
módulos + helper; recomendado para revisão em lugar dos 21 módulos do worker completo.
45 regressões e 30 testes de concorrência PASS; tipagem mantém 13 erros, logs de
44 linhas idênticos baseline/backport. Builds --noCheck não aprovam tipos.

Quatro ensaios dirigidos reproduzem a **falha do shutdown atual**: libera ownership
com socket/inbound/outbound/auth pendentes; store de auth pode reportar falha ignorada
pelo adapter; timeout não é rejeição comprovada. Não existe drain seguro demonstrado.
Proposta mínima de admissão/contagem, conclusão auth e fechamento de transporte antes
de liberar lock apresentada, **não implementada**. Não encerrar HUMAN para deploy.

Rollback feature-aware exige todos os escritores compatíveis; voltar à API antiga
nega CLOSED, porém perde garantia de persistência e exige exclusão de snapshots
antigos antes de qualquer retorno à funcionalidade. Reprodução confirma que escritor
antigo restaura true revogado. Nenhuma produção alterada ou nova implementação SECULT.
[Comparação, artefato, ensaios, proposta de parada e retorno](saas/SECULT_DEPLOY_PLAN_2026-09-29.md).
Campanhas/CRA aguardam owner; DB-only encerrada; Guia inatividade pausado; 6683 CLOSED.


## SECULT — preparação de implantação a3d16d4b — 29/09/2026

**PREFLIGHT READ-ONLY / ARTEFATOS LOCAIS / NOT DEPLOYED.** API/frontend efetivos
e8ebd776; 2.020 hashes conferidos. Worker: checkout 5ee2de6b, mas módulos compartilhados
compilados mais antigos; 21 módulos alcançáveis diferentes/novos no candidato,
incluindo fila operacional, origem CRM e normalização além da dependência SECULT.
**Gate material:** revisar delta adicional do worker e comprovar parada/retorno
WEB_SESSION antes de aprovar janela. Guarda de campanhas não drena todo o worker.
Três WEB_SESSION conectadas; fila/agendamentos vazios são fotografia, não quiescência.
Chave ausente nos dez tenants; nenhuma ativação. Builds isolados API/frontend/worker
passaram, sem converter --noCheck em aprovação de tipos ou aceite produtivo.
[Plano único: versões, delta, artefatos, backup, sequência, retorno e gates](saas/SECULT_DEPLOY_PLAN_2026-09-29.md).
Backup fresco e restauração desse dump ficam para janela autorizada; não realizados
agora. Implantação de todos os escritores compatíveis precede ativação separada
somente secult-pe. Rollback legado perde garantia, exige revogação/exclusão de
escritores antigos. Campanhas/CRA aguardam owner; DB-only encerrada, Guia inatividade
pausado, 6683 CLOSED. Sem commit/push/deploy/restart/cron/admissão nesta preparação.


## SECULT — decisão departamental aplicada localmente — 29/09/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Owner definiu vínculo departamental atual
obrigatório ao departamento do snapshot do encerramento. Perda efetiva do vínculo
revoga consulta; departamento ausente/inativo não concede exceção. Helper único
reutiliza resolvedor canônico com fallback legado, sem estender dispensa de assignee
atual ao responsável histórico. Lista, contagens, detalhe, timeline, mídia e realtime
cobertos; ativos e SUPERVISOR/ADMIN preservados. Mesma Inbox/filtro/histórico.

Código final: **31/31 testes afetados PASS**, build TypeScript backend PASS e smoke
AGENT autenticado com revogação do vínculo e remoção automática do painel/lista.
UI usa polling existente, com atraso visual e sem promessa de revogação instantânea
do conteúdo já exibido. Novas consultas/entregas são negadas. Duas correções anteriores
revalidadas na suíte. As 112 provas/smoke anteriores ficam como histórico, sem
reatribuição integral ao delta; limites de tipagem frontend/worker preservados.
[Decisão, provas e limites](saas/SECULT_OWN_CLOSED_LOCAL_2026-09-28.md). Sem commit/push/deploy/ativação.
API/worker/scripts compatíveis exigidos antes de ativar; rollback a escritores
antigos perde a garantia. Campanhas/CRA aguardam owner; DB-only encerrada, inatividade
no Guia pausada; 6683 CLOSED. A pendência departamental abaixo foi resolvida por esta
nova decisão; registros anteriores preservados como histórico.


## SECULT — revisão local de 48e0fc2a — 29/09/2026

**CORREÇÕES LOCAIS VALIDADAS / NOT DEPLOYED; decisão departamental pendente.**
Falha isolada da nova permissão nega CLOSED sem derrubar os caminhos ativos da
Inbox; erros gerais continuam propagados. Realtime separa invalidação por conversa
e por tenant: handoff de B preserva mensagem pendente de A; transferência/reentrada
na própria conversa e revogação continuam protegidas. Reprodução: 3 falhas em seis
casos antes; 6/6 depois. Regressões afetadas 25/25 e build TypeScript backend PASS.
As 112 provas e smoke anteriores permanecem históricas, sem reatribuição integral
ao delta. UI/worker não alterados nem novamente validados nesta revisão.

Não foi encontrado contrato explícito estendendo a exceção departamental do assignee
atual ao responsável histórico. A afirmação documental anterior foi corrigida;
regra não alterada silenciosamente. Owner deve definir se perda de vínculo revoga
consulta própria CLOSED antes de preparar deploy. [Detalhes, referências e evidências](saas/SECULT_OWN_CLOSED_LOCAL_2026-09-28.md).
API/worker/scripts compatíveis continuam necessários; rollback para escritores
antigos perde garantia de revogação. Campanhas/CRA aguardam owner; DB-only encerrada,
inatividade no Guia pausada; 6683 CLOSED. Sem commit/push/deploy ou ativação.
Os registros anteriores abaixo descrevem as respectivas etapas históricas.


## SECULT — funcionalidade local sobre f06d49cb — 28/09/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Consulta AGENT de sua conversa atualmente CLOSED,
chave `allowAgentOwnClosedConversations=false` por default, gestão SUPERVISOR/ADMIN
na página Inbox existente. Snapshot comprova o responsável do encerramento atual;
sem arquivo por ciclo, nova categoria ou permissão operacional. Dependência de
persistência continua em commit separado. Entrega local de 28/09 preservada;
publicação exclusivamente para revisão autorizada em 29/09, sem deploy/ativação.

Provas: HTTP/DB/socket **10/10**, persistência com setter real **37/37**, regressões
**65/65**; builds backend/frontend PASS. Worker build --noCheck PASS; tipagem estrita
mantém 13 erros preexistentes. Tsc frontend amplo mantém 22 diagnósticos idênticos à
base. Smoke autenticado confirma configuração, Encerradas, consulta, controles
bloqueados e revogação do painel. [Implementação, matriz e limites](saas/SECULT_OWN_CLOSED_LOCAL_2026-09-28.md).

API, worker e scripts precisam ser compatíveis antes da ativação; retorno a escritores
antigos perde a garantia de revogação. Campanhas/CRA aguardam validação funcional do
owner; DB-only encerrada/aceita, inatividade no Guia pausada, 6683 CLOSED. Sem produção.
Revisão de publicação: 22 arquivos; comparação completa das 40 linhas dos 22
diagnósticos frontend idêntica à base f06d49cb, mesmas dependências/compilador,
zero diagnóstico novo. Código validado sem mudanças; 112 provas e smoke reutilizados.
CI push restrito a main/develop; Vercel desabilitado na branch de revisão.
Os registros anteriores abaixo preservam o estado histórico de cada etapa.


## Persistência compartilhada — dependência local separada — 28/09/2026

**LOCAL VALIDATED / NOT DEPLOYED.** [Implementação, provas e limites](saas/SECULT_CLOSED_CONFIG_CONCURRENCY_PROPOSAL_2026-09-28.md).
34 escritores substitutivos migrados para lock transacional + leitura/transformação
atual; criação concorrente sem sobrescrita e no-op de linha ausente protegidos.
Rodízio decide após releitura sob lock; sem alteração de algoritmo, autorização
WEB_SESSION ou identidade híbrida. Sem schema/migration ou configuração SECULT.

Validação: **185/185** na suíte afetada e **22/22** do worker simulado; builds de
backend/worker e typecheck dos três scripts PASS. Build worker canônico usa
--noCheck; não representa typecheck integral. Evidências privadas preservadas.
Implementação local encerrada; publicação somente para revisão autorizada depois,
sem deploy/produção. Revisão adicional: worker estrito falha com 13 diagnósticos
idênticos ao parent; tipagem integral NÃO APROVADA, sem correção alheia. Backend e
scripts alterados checados. Rodízio conserva corpo de decisão/selector e ordem
advisory → config → runtime. P2002 preexistente propaga HTTP 400 com código/mensagem
Prisma após rollback, sem retry. Retorno a escritores antigos elimina a garantia;
rollback futuro, especialmente após SECULT, exige tratamento explícito da permissão.

SECULT continua **NOT IMPLEMENTED / NOT DEPLOYED**, aguardando revisão desta
validação e implementação funcional própria. O bloqueio por persistência está
tratado localmente, sem declarar garantia em produção. API, worker WEB_SESSION
(escritor via fontes compartilhadas) e scripts precisam usar a correção para essa
garantia valer; escritor antigo ainda pode restaurar JSON obsoleto. Rollout separado.

Pendência preexistente separada: `/admin/tenants` com update vazio preserva config,
mas disputa de criação pode retornar P2002; rota não alterada, sem perda de dados
no teste. Não confundir com criação segura do novo helper. Campanhas/CRA aguardam
retorno funcional do owner; DB-only aceita; Guia inatividade pausado; 6683 CLOSED.

O registro SECULT abaixo é o histórico da parada/proposta anterior, preservado;
“não implementado/validado” naquele registro não é o estado atual desta dependência.

## SECULT — consulta AGENT de CLOSED — 28/09/2026

Delimitação técnica posterior: [proposta compartilhada de persistência](saas/SECULT_CLOSED_CONFIG_CONCURRENCY_PROPOSAL_2026-09-28.md).
Inventário: 35 pontos/9 arquivos, sendo 34 substitutivos e um create-only seguro.
Proposta: helper transacional com lock da linha de configuração e transformação
do JSON fresco; migrar 34 escritores, sem alterar decisões de domínio. Sem nova
tabela/migration. Ainda não implementado/validado; SECULT mantém o bloqueio.
Reprodução anterior íntegra; nenhuma mudança produtiva ou de prioridade CRA.

**BLOCKED BEFORE IMPLEMENTATION / NOT DEPLOYED.** Frente prioritária; Guia
inatividade pausado. Requisito: allowAgentOwnClosedConversations=false por default,
gestão SUPERVISOR/ADMIN na configuração Inbox existente, consulta da conversa
atualmente CLOSED pelo responsável comprovado em CompletedServiceSnapshot.
Sem nova tela/categoria, arquivo ou segmentação de mensagens por ciclo; histórico
e privacidade existentes preservados. Reentrada remove somente essa exceção;
nenhuma permissão operacional, alteração de distribuição/lifecycle ou ampliação
de inboxVisibilityPolicy ADMIN-only.

Impedimento local reproduzido em PostgreSQL isolado, dados sintéticos e duas
conexões: saveAgentSignatureSettings leu config com chave true; outra conexão
confirmou false; o upsert do salvador real restaurou true com o JSON antigo.
Os salvadores atuais substituem o documento inteiro; não há proteção concorrente
reutilizável nesse caminho. Escritores de rodízio e WEB_SESSION também compartilham
o JSON. Proteger apenas o novo setter não resolve; é necessário tratar a escrita
concorrente das chaves compartilhadas, preservando as decisões de distribuição.

Aplicada a parada exigida por ampliação material. Próximo passo depende de
delimitar essa proteção como pré-requisito local, sem mudar armazenamento aprovado
nem aceitar revogação insegura. Nenhum código funcional alterado; reprodução
confirma falha existente, não PASS da funcionalidade. Evidências privadas em
local-evidence/secult-own-closed-20260928/RESULT_REPORT.md; sem produção, providers,
envio, build/smoke, commit/push/deploy. Realtime amplo e divergência lista/detalhe
registrados separadamente, sem alegar resolução. DB-only permanece aceita;
campanhas/CRA implantadas aguardam validação funcional de Deifson. 6683 CLOSED.


## Atualização produtiva — flows DB-only — 28/09/2026

**DEPLOYED / CLIENT ACCEPTED — correção de flows DB-only.** Backend/frontend
`e8ebd776` implantados por procedimento controlado, com backup fresco restaurado
em DB local isolado, fechamento/drain e reabertura geração 3. Campanhas abertas,
scheduler observado em dois ciclos; worker/sessões e dados preservados. Owner
confirmou sessão, Inbox, CRM e leitura de flows. Na validação técnica, não foram
gravados fluxos reais nem provocados envios. Em 28/09/2026, Eduardo confirmou:
“Funcionou, obrigado Deifson” (relato encaminhado pelo owner). Aceite funcional
restrito à correção de gravação DB-only implantada em `e8ebd776`; não identifica
operações ou modos exercitados e não comprova as quatro combinações Guia/Avançado.
Não constitui aceite global CRA nem validação integral de lotes.
[Registro único, backup, rollback e limitações](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#deploy-técnico-da-correção-de-flows-db-only--28092026).
Os estados LOCAL VALIDATED / NOT DEPLOYED abaixo são históricos da publicação
para revisão. Quatro PASS locais preservados: Guia criar/editar e Avançado
criar/editar. Avisos React key e Next/workspace separados, sem correção incidental.
6683 CLOSED; Telegram e DELIVERED/READ permanecem separados.


## DB-only chatbot flow writes — 2026-09-28

Publicação para revisão autorizada em 28/09/2026, exclusivamente na branch
`review/campaign-recovery-20260926`, sem deploy. Os registros “sem commit/push”
abaixo descrevem a etapa local anterior. Código testado conferido por SHA-256;
apenas esta nota documental foi acrescentada para publicação. Quatro PASS
preservados: Guia criar/editar e Avançado criar/editar. Status continua
**LOCAL VALIDATED / NOT DEPLOYED**; aviso React key permanece separado.
Auto-deploy desabilitado para esta branch em `vercel.json`; workflow CI com
push restrito a main/develop. Evidências privadas e estado operacional excluídos.


Status desta correção: **LOCAL VALIDATED / NOT DEPLOYED**. Sem commit/push,
sem aceite CRA e sem alteração produtiva. Base `01989157`, branch
`review/campaign-recovery-20260926`, worktree persistente
`tmp/worktrees/re7-campaign-recovery-20260926`; contém `a1cc380e` e preserva
fila/guarda de campanhas. Checkout do worker não foi usado como base.

Defeito separado do encerramento de visibilidade de 15/09 (`363ce3ab`):
POST/PUT de `/app/chatbot/flows` exigiam entrada no JSON legado, embora GET e
configurações suportassem Client somente no banco. Não atribuir contagens
HTTP globais ao CRA. Nenhuma nova investigação ou consulta produtiva nesta etapa.

Correção mínima: após auth/ADMIN/Client ativo/feature chatbot, as duas rotas
usam o tenant legado ou `buildDbBackedTenantFallback(client)`. O helper e
`resolveAutomationFlagsSettings` não foram alterados: flags persistidas no DB
continuam prioritárias, inclusive sobre JSON permissivo. Defaults existentes
permanecem; `disableChatbot` não equivale a bloqueio de edição;
`operationalServiceMessages` não libera nem bloqueia edição de flows.

O carregador legado já ocultava erros de leitura/validação. Foi adicionada
leitura estrita opt-in, usada apenas por essas duas rotas: lê novamente o
arquivo, não confia em cache de fallback e propaga falha não-ENOENT. Arquivo
inexistente mantém o default existente; entrada ausente admite fallback por
Client; JSON corrompido, mapa inválido/vazio ou erro de leitura bloqueiam a
gravação com erro seguro. Não grava cadastro/configuração como efeito colateral.
O comportamento dos demais consumidores permanece inalterado.

UX: mensagens PT-BR pelo tratamento central para permissão, bloqueio,
definição/referência inválida, recurso indisponível e falha interna. O smoke
Avançado revelou reformatação do JSON antes da resposta; removida essa
reescrita nas duas ações para preservar literalmente o texto não salvo na
falha. Builder/modos, transações e semântica de entryPoint não foram redesenhados.

Provas locais (DB dedicado `re7_flow_db_only_20260928`, loopback:55432, schema
copiado do banco local auditado sem dados; fixtures sintéticas):

- Controle negativo restaurando somente as condições antigas: reproduziu
  `404 tenant_not_found`; código corrigido restaurado byte a byte em finally.
- Teste focado de rotas: 7/7 PASS (pai + seis subcasos).
- Regressão de rotas chatbot: 14/14 PASS (oito testes principais, seis subcasos).
- Suítes unitárias afetadas finais: 164/164 PASS; inclui leitura estrita 4/4.
- Casos negativos com comparação de todas as linhas de ChatbotFlow antes/depois:
  RBAC AGENT/SUPERVISOR, cliente inativo/inexistente, feature desabilitada,
  bloqueio DB, referências estrangeiras, definição inválida, resolvedor falho,
  arquivo ilegível/corrompido e falha de escrita dentro da transação após demissão
  do entryPoint anterior. Nenhum fluxo/entryPoint alterado nesses casos.
- Tenant legado, leitura SUPERVISOR, defaults sem criação de configuração,
  edição com mensagens operacionais desligadas e isolamento preservados.
- Build backend PASS; build frontend final PASS; `git diff --check` PASS.

| Smoke autenticado com ADMIN DB-only | Rota real | Resultado |
| --- | --- | --- |
| Guia — criar | POST /app/chatbot/flows | PASS |
| Guia — editar existente, inclusive texto de menu | PUT /app/chatbot/flows/:id | PASS |
| Avançado/JSON — criar | POST /app/chatbot/flows | PASS |
| Avançado/JSON — editar existente | PUT /app/chatbot/flows/:id | PASS |

Em cada combinação: falha real por configuração local inválida (500), mensagem
segura, conteúdo de campos preservado e DB inalterado; retirada da falha,
mesmo payload salvo, recarga/reabertura e conferência de name/definition/
isActive/entryPoint no DB. Guia e Avançado usam os mesmos handlers, comprovado
por captura local das requisições. No Guia, criação manteve flags default
false/false; edição exercitou flags e alteração de menu. Não houve reconstrução
de fluxo existente para forçar sucesso. Avançado preservou inclusive JSON
não formatado após falha.

Evidências persistentes no worktree: `local-evidence/flow-db-only-20260928/`
(RESULT_REPORT, logs, snapshots JSON, capturas, patch e hashes). Sem dados CRA,
provider real ou envio; API local sem bootstrap de schedulers/integrações,
fetch externo bloqueado e contador do smoke zero. Não há schema/migration.

Limites: validação sintética local, sem aceite dos usuários CRA ou implantação;
não cobre todos os tipos possíveis de fluxo nem altera os contratos de runtime.
O histórico de visibilidade permanece CLOSED/DEPLOYED/CUSTOMER VALIDATED;
esta entrega de gravação ainda exige revisão e autorização de publicação.
6683 CLOSED; Telegram, DELIVERED/READ → HUMAN/WAITING e validação de lotes
permanecem separados, sem nova alegação de PASS.

Aviso visual separado: console React indicou key ausente em lista do
ChatbotFlowBuilder, que não foi alterado nesta correção. Não bloqueou os quatro
smokes; não se declara console integralmente limpo nem se corrige o builder
incidentalmente.

Pendência separada: inventariar futuramente os demais consumidores de tenants
legados e seu fallback permissivo. Não houve auditoria geral nem correção
incidental desses caminhos; a opção estrita não foi ativada globalmente.


## Inicio efetivo e ensaio operacional local — 2026-09-26

Status: LOCAL ROLLOUT / SUSPENDED ROLLBACK REHEARSED; NOT DEPLOYED / OWNER UI PENDING.
Base `fedef1e1965aa6a1e53222426c6b55424e2d83fa`, branch
`review/campaign-recovery-20260926`; historico e owner PASS anteriores preservados.

- `effectiveStartedAt` passa a ser preenchido somente quando nulo, sob lock do
  grupo; materializacao/recuperacao preservam o valor. `job.startedAt` continua
  informando o claim do lote/tentativa, ja exposto pela API/UI. Nenhum ajuste visual.
- Testes focados: os dois casos reproduziram a sobrescrita e passaram apos a
  correcao (2/2); fila afetada 8/8; build backend PASS. Sem repetir suites amplas,
  build frontend ou smokes anteriores.
- Cluster PostgreSQL local separado, `127.0.0.1:55434/re7_rollout_local`, com
  ambiente limpo e provider em memoria. Base `6d664d0b`: 59 migrations e tres
  campanhas antigas; migrate deploy aplicou apenas a fila, totalizando 60.
  Campanhas antigas preservadas; checksum da migration conferido com Prisma.
- Falha injetada apos migration/antes da ativacao: runtime sem permissao de
  campanhas e admissao fechada; zero jobs criados. Banco migrado foi mantido.
- Codigo novo processou fila; pausa drenou uma chamada com aceite conhecido.
  Morte de outro processo apos submissao, antes da resposta local, deixou uma
  pendencia explicitamente marcada needs_review. Snapshot sem filhos sobreviveu
  a interrupcao e alteracao do CRM.
- Rollback ensaiado **com processamento suspenso**, ingresso HTTP em manutencao
  e papel runtime sem privilegios nas tabelas. Runner real de `6d664d0b` recebeu
  permission denied; zero provider. Jobs, leases, snapshots, resultados e demais
  registros permaneceram iguais no intervalo do rollback. Health nao foi usado
  como prova de rollback funcional; o backend antigo nao e uma alternativa de envio.
- Retorno exclusivo ao novo codigo: dois grupos completos, quatro aceites
  conhecidos, uma submissao incerta ainda retida e zero duplicacoes entre cinco
  submissoes simuladas. Todos os jobs/eventos anteriores e o inicio original dos
  grupos foram preservados. Admissao permaneceu fechada ao final do ensaio.
- Drift: 16 objetos do inventario anterior identicos antes/depois; diff somente
  leitura igual ao ja registrado, sem diferenca nas tabelas de fila. Nao impede
  este rollout aditivo, desde que defaults/indices/constraints sejam preservados.
  Nenhuma correcao incidental de drift, down migration, reset ou limpeza de filas.

Procedimento, condicoes de parada e limites: RUNBOOK_WHATSAPP_AGENT.md, secao
"Ensaio operacional local da fila — procedimento executado". Evidencias preservadas
em `local-evidence/recovery/rollout-local/`, incluindo tres dumps e manifestos.
Pendencias para decisao: validar cercas/permissoes e parada de todas as instancias
no ambiente alvo, reconciliacao de pendencias incertas, owner UI e aceite CRA.
Nao houve deploy, banco/provider de producao ou envio real. DELIVERED/READ →
Conversation/HUMAN/WAITING continua separado; reparo 6683 CLOSED.

## Correcoes da revisao Git 109c9f15 — 2026-09-26

Status: LOCAL REVIEW FIXES VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
Base desta correcao: `109c9f1544003750d29930bd7b10ce6a4cf50c03`, branch
`review/campaign-recovery-20260926`. Historico `6d664d0b` e owner PASS do lote
anterior preservados; esta nota nao concede aceite CRA nem prontidao para deploy.

- CSV: grupo, filhos, seeds e resultado idempotente na mesma transacao; falha
  no segundo filho deixa zero registros. Retries concorrentes produzem um unico
  conjunto. Chave vinculada ao tenant/operacao/hash do payload; conflito = 409.
- Estados: locks de grupo preservam pausa/cancelamento/needs_review; falha
  impeditiva bloqueia os proximos lotes, inclusive rejeicao recebida apos pausa.
  Cancelado nao vira completed. Dinamica sem filhos pode pausar/retomar.
- Fila: tenants ocupados excluidos antes do limite; um candidato por tenant,
  ate 20 por consulta (teto 100), rechecado sob lock. Caso com 25 jobs antigos de
  A nao impede B; exclusividade e continuidade contra avulsa/test-send mantidas.
- Dinamica: recuperacao reutiliza o snapshot persistido, mesmo com CRM alterado;
  filhos e enqueue sao atomicos. Recuperacao do intervalo legado filhos/sem jobs
  nao duplica filhos nem snapshot. Apenas controlador sem provider recupera lease.
- UI/API: Enviar conjunto agora exige confirmacao e RBAC, entra na mesma fila,
  e retry nao duplica jobs. Agendamento futuro permanece sem antecipacao.

Validacao final: 13/13 focados novos; suites afetadas de campanhas **198/198**
(fila 8, runner 10, revisao 11, rotas 128, importacao 7, exclusao 5, UI 29),
compostas por 188 casos fora do runner e sua repeticao final 10/10; Webchat 17/17.
Builds backend/frontend PASS. Smoke visual de confirmar/recusar envio agregado,
pausa, retomada e cancelamento PASS; zero outbound/provider. Nao houve repeticao
da bateria visual anterior. Evidencia local: `local-evidence/recovery/review-fixes/`.

A primeira suite teve interrupcao SIGKILL do runner durante diagnostico de I/O
JSON; as demais suites passaram. A repeticao isolada revelou dois testes longos
com relogio congelado emitindo leases vencidas. Fixture corrigida para tempo
atual, sem reduzir audiencia, assertions ou concorrencia; runner final 10/10.
O build expos tipagem incorreta da nova fixture CSV e filtro startsWith sobre
UUID no Webchat, ja presente na base. Corrigidos TemplateContext e intervalo UUID
equivalente; quatro testes de protocolo e limites SQL locais validados. O mock
da auditoria compartilhada foi isolado (antes tentava gravar tenant_a no DB real).
O registro historico de build PASS nao substitui esta nova evidencia compilada.

Schema/SQL migration sem alteracao; DB local `re7_recovery_audit` com 60 migrations
concluidas e zero pendentes. Nenhum migrate adicional, db push/reset ou correcao
de drift historico. Continuam pendentes ensaio operacional de rollout/rollback,
owner UI, aceite CRA e drift residual inventariado no runbook. CI de push apenas
main/develop; bloqueio Vercel da branch de revisao preservado. Sem deploy/DB de
producao/provider real. DELIVERED/READ → Conversation/HUMAN/WAITING continua
separada e sem alteracao funcional; reparo 6683 CLOSED.

## Persistencia para revisao Git — 2026-09-26

Status desta frente: TECHNICAL LOCAL VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
Branch dedicada `review/campaign-recovery-20260926`, com parent/base `6d664d0b9ffcf52f5315bfeca96f0622f4d25792`.
A base de reconstrucao foi `5d925973`; os 80 acrescimos documentais de `6d664d0b`
foram conferidos e seu historico permanece ancestral. O owner PASS do lote anterior
(normalizacao/settings/contraste, head funcional `5ee2de6b`) continua OWNER VALIDATED / CLOSED;
nao se estende automaticamente a esta frente de lotes/fila.

Delta e fontes foram arquivados antes da troca de branch. Reaplicacao sobre `6d664d0b`
restaurou os mesmos 23 arquivos, com hashes conferidos; nao houve conflito funcional,
reset/clean ou alteracao da branch original. Implementacao, testes, schema/migration,
os quatro docs e este runbook compoem o escopo; .data, evidencias, dumps, arquivos
compactados, credenciais e fixtures de ambiente ficam fora do Git.

As 18 anotacoes UUID correspondem a tipos SQL ja existentes, sem ALTER TYPE novo.
O inventario por objeto e impacto do drift residual anterior esta no
`docs/RUNBOOK_WHATSAPP_AGENT.md`, secao "Drift historico residual — revisao da fila".
Nenhum desses defaults, indices ou nomes foi corrigido nesta frente.

Validacao preservada: fila/runner/rotas 144/144, apoio 41/41 e rechecagem dos casos
falhos 4/4; builds e Prisma validados anteriormente. Sem repeticao de testes/builds
porque esta persistencia nao muda comportamento funcional. Staging e whitespace
sao conferidos separadamente. CI versionada: push apenas main/develop; PR apenas
com destino main/develop. `vercel.json` bloqueia auto-deploy somente desta branch
via git.deploymentEnabled=false para seu nome exato; demais branches inalteradas.
Push de revisao nao autoriza merge, deploy, producao DB, provider ou envio real.

Pendencias: ensaio operacional de rollout/rollback, drift residual anterior,
owner UI e aceite CRA. Divergencia DELIVERED/READ → Conversation/HUMAN/WAITING
permanece separada e sem alteracao funcional. Reparo 6683 continua CLOSED.

## Auditoria da recuperacao — 2026-09-26

Status tecnico: PRONTO PARA COMMIT DE REVISAO / NOT DEPLOYED / OWNER VALIDATION PENDING.
Esta nota atualiza o fechamento local abaixo; nao declara prontidao para deploy ou aceite CRA.

- Worktree persistente: `/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926`. HEAD detached `5d9259739754816d570470a30d52eb7eb53541bc`;
  referencia do ultimo HEAD anterior `6d664d0b9ffcf52f5315bfeca96f0622f4d25792`
  (branch original `zero-eligible-crm-eligibility-20260923`). Nao houve novo commit.
- Integridade: SHA-256 do patch e tar original conferidos; ambos coincidiam com
  o codigo no inicio desta auditoria. Replay independente das edicoes historicas
  confirmou migration, fila, runner e testes. API/UI e consultas CRM receberam
  as correcoes posteriores discriminadas em `local-evidence/recovery/audit/`.
  Nao existe snapshot integral do filesystem anterior: DB e capturas perdidos
  nao sao declarados recuperados byte a byte. Comportamentos criticos foram testados.
- Falhas fechadas: `CompletedServiceSnapshot.clientId` text versus cast SQL uuid;
  joins Client.id/WaPhoneNumber.clientId e Conversation.id/ConversationMetrics.conversationId
  com uuid/text na copia parcialmente criada. Banco novo `re7_recovery_audit`,
  127.0.0.1:55432, criado exclusivamente por `prisma migrate deploy`, corrigiu o ambiente.
  A fixture de agendamento ja teve o `idempotencyKey` obrigatorio reposto na retomada.
  Nenhuma assertion removida ou relaxada; concorrencia preservada.
- Schema: 18 anotacoes `@db.Uuid` alinhadas aos tipos das migrations existentes;
  Prisma Client 6.19.2 regenerado e semanticamente correspondente. SQL da fila intacto.
  Diff somente leitura ainda registra defaults, indices e nomes historicos;
  nao foi aplicado e nao ha diferenca de tipos ou estrutura da fila nesse diff.
- Migration validada: registro anterior de 60 migrations PASS recuperado; novo
  `migrate deploy` 60/60 PASS necessario porque o DB de teste recuperado havia
  sido substituido por schemas divergentes. Checksums de 60 SQLs iguais ao ledger.
  "Ensaio pendente" dizia respeito a rollout/rollback operacional, nao a falha
  da migration. Nao foi usado db push, reset ou SQL manual nesta auditoria.
- Testes finais: casos anteriormente falhos 4/4; fila 8/8 + runner 10/10 + rotas
  126/126 = 144/144; importacao/exclusao/contratos UI 41/41; zero skips/falhas.
  Backend build e prisma validate/generate PASS. Build frontend anterior preservado
  porque UI nao mudou nesta auditoria. Os quatro smokes aprovados nao foram repetidos.
- Contratos: 3.001 → quatro lotes, snapshot unico, variaveis CRM/CSV, isolamento por
  tenant/exclusividade, scheduler concorrente, retomada, aceite apos perda de lease
  e bloqueios antes do provider cobertos. Provider apenas simulado nos testes.
- Pendencias efetivas: rollout/rollback operacional, drift residual historico de
  defaults/indices, owner validation, aceite CRA e decisao de dominio DELIVERED/READ →
  Conversation/HUMAN/WAITING. Divergencia de dominio permanece separada e sem alteracao
  funcional; 6683 segue encerrado. Sem commit/push/deploy, producao DB ou envio real.

## Atualizacao de recuperacao e fechamento local — 2026-09-26

Status: TECHNICAL LOCAL VALIDATED / OWNER VALIDATION PENDING / NOT DEPLOYED.
Esta atualizacao substitui, para o smoke tecnico local, as lacunas visuais
registradas anteriormente; preserva o historico e nao representa aceite CRA.

- CRM estatico: selecao/filtro, previa e confirmacao clicados na UI; 3.001
  destinatarios persistidos em quatro filhos (1.000 / 1.000 / 1.000 / 1).
- CRM dinamico: estimativa e confirmacao de agendamento exercitadas na UI;
  zero filhos antes da execucao. Uma etapa do processador com relogio local
  controlado criou o snapshot de 3.001 destinatarios/quatro filhos, sem envio.
- CSV: upload, mapeamento, previa e confirmacao pela UI; um unico conjunto,
  3.001 destinatarios/quatro filhos. A UI trata a resposta agrupada; timeout
  especifico e chave de idempotencia reutilizada protegem a repeticao local.
- Acoes agregadas: agendamento atomico dos quatro lotes, reload, pausa,
  retomada e cancelamento confirmados no DB. Nenhum outbound foi criado.
- Test-send ocupado: clique real com input React preenchido, mensagem PT-BR,
  zero chamadas adicionais ao provider simulado, zero outbound e zero job novo.
- Corrigidos limites de parametros SQL em consultas de identidades CRM/CSV e
  exclusao operacional; a previa de campanha deixa de limitar a contagem a
  janela inicial de 800 contatos. Leitura de audiencia limitada a 5.000.
- Evidencias locais: `local-evidence/recovery/result-summary.json`, capturas e
  logs no worktree persistente `tmp/worktrees/re7-campaign-recovery-20260926`.
  Capturas antigas que estavam somente em `/tmp` nao sobreviveram ao reboot;
  seus resultados historicos foram recuperados do registro da sessao.
- Resultado historico da primeira retomada: builds PASS, suites 41/41 e 43/43;
  a suite ampla entao falhou nos bancos divergentes. Essas falhas foram diagnosticadas
  e fechadas na auditoria acima. O drift residual de defaults/indices continua documentado.
- Sem commit, push, deploy, banco de producao ou provider real. Guided Builder
  permanece pausado. Owner validation, aceite CRA e ensaio controlado de
  rollout/rollback da migration continuam pendentes.


---

## FASE ATUAL DO PRODUTO

Produto SaaS operacional validado com:

- multi-tenant real em produção
- Postgres como source of truth
- campanhas assíncronas operacionais
- controle de uso por tenant
- UI administrativa funcional
- onboarding via Meta validado (Embedded Signup)
- onboarding interno assistido implementado (Sprint 26)
- observabilidade real da Meta integrada na UI de campanhas (Sprint 28)
- área do cliente operacional com login próprio e auto-scope (Sprint 29)

---

## ESTADO ATUAL

Produto operacional com observabilidade real da Meta e área do cliente funcional.

O onboarding interno foi implementado, porém ainda não validado com novo tenant via UI.

### Campaign CRM audience split into numbered drafts - 2026-09-25

Status: LOCAL PARTIAL IMPLEMENTATION / FOCUSED TEST VALIDATED / NOT DEPLOYED /
OWNER UI PENDING / NOT CRA-READY FOR COMPLETE BATCH OPERATION. New local
campaign draft split flow keeps the existing 1,000-recipient campaign draft
limit and adds an explicit backend-authoritative split path for CRM audiences
that exceed that capacity. The normal paginated preview remains a preview
surface; the split preview/confirmation resolves the selected CRM audience
again in the backend, same tenant, deterministic order, up to the existing
5,000 analysis ceiling. It returns the eligible total, draft count and planned
distribution before confirmation. Confirmation creates static draft chunks named
`Campanha X — 01/03`, `02/03`, etc., preserving template, variable mappings and
return destination, without sending, scheduling, Outbound, Conversation,
Runtime or provider calls.

Dynamic CRM filters are not cloned as dynamic filters across multiple drafts.
The UI offers explicit conversion to static selection at split time and informs
the operator that future matching contacts will not be added automatically.
If the audience signature changes between split preview and confirmation, the
backend returns `audience_changed` and requires review. Unsupported full-split
post-filters such as conversation/origin/city currently block with a controlled
message instead of truncating silently. This front is separate from the previous
normalization/settings/contrast lot, which is already DEPLOYED / OWNER
VALIDATED / CLOSED at functional production head
`5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`.
Validation on the dedicated local DB covered 1,000 existing behavior, 1,001
split into two drafts, 3,000 split into three drafts, union/no overlap, `limit:
25` not reducing the split set, no Outbound/Conversation/Runtime/provider side
effects and idempotent retry. `campaignsPageContract.test.ts` 28/28 PASS,
backend/frontend builds PASS and `git diff --check` PASS. Authenticated browser
smoke was not exercised in this step because no isolated local frontend/session
was available; OWNER UI validation remains pending.

Audit follow-up for CRA operation above 3,000 recipients: the current local
split is a preparation convenience, not a complete batch-campaign control
model. Current code has these effective limits/contracts:

| Modality | Current behavior | Limit / batching status | Gap |
| --- | --- | --- | --- |
| CRM static current preview | `Criar rascunho com audiencia` uses the eligible items already loaded by `/app/campaigns/audience-preview` | UI preview is paginated (`limit=25` in the current screen); draft route rejects `selectedLeadIds.length > 1000` | Operator can confuse preview page with complete filter result. |
| CRM static all eligible filter | Local split preview/confirm resolves Leads directly by basic CRM filters and creates numbered static drafts | Up to 5,000 analyzed; creates independent campaigns of <=1,000 | No durable parent batch identity; unsupported full filters such as conversation/origin/city currently block. |
| CRM dynamic schedule | Existing production contract stores `selectionMode=DYNAMIC_CRM_FILTER`; scheduler snapshots once at execution | `materializeDynamicCampaignSnapshot` queries `take: 1001` and fails `dynamic_match_limit_exceeded` over 1,000 | No dynamic batch snapshot splitting; conversion to static is optional but not equivalent to true dynamic scheduling. |
| CSV | CSV import accepts up to `CAMPAIGN_IMPORT_MAX_ROWS = 10_000`; draft/send still constrained by campaign recipient limit | No automatic CSV split into grouped campaigns | Need chunking from validated import plan without re-parsing or duplicating recipients. |
| Manual | Manual immediate route dedupes and rejects over 1,000 recipients | No batching | Manual remains small-list operation. |
| Reuse | Reuses stored `draftSeed`; static/dynamic/CSV restoration depends on persisted evidence | No batch-group awareness | Reusing one numbered draft does not mean reusing the whole batch set. |
| Send/schedule | Send/schedule operate per Campaign; scheduler claims up to 10 due campaigns per tick and starts each campaign run | `runningCampaigns` dedupes only by `campaignId`; throttle is per campaign run (`CAMPAIGN_THROTTLE_MS = 1000`) | Scheduling many chunks for the same time can multiply tenant throughput. |
| Test-send | Sends one test message from one campaign seed using simulated or real transport depending environment | Not a batch operation | Must remain single-destination and not mark participation. |

Minimum architecture recommendation for CRA-ready large audiences: introduce a
durable `CampaignBatch`/`CampaignGroup` domain (schema migration likely needed)
instead of using numbered names as identity. It should own the operator intent,
tenant, source mode, filter/import signature, requested execution time,
recipient snapshot id/version, chunk membership/order, aggregate progress,
pause/resume/cancel state and idempotency key. For dynamic campaigns, the group
must keep the filter until due time, create one immutable recipient snapshot at
execution, split that snapshot into disjoint chunks, then coordinate chunk
dispatch with a tenant-level scheduler/throughput guard. Existing Campaign,
seed, runner, opt-out, operational exclusion, identity alias, delivery truth,
billing and provider mechanics should be reused per child chunk. Acceptance
requires proving no duplicate sends under concurrent confirm/retry/restart,
no provider call during split/schedule preparation, no artificial Conversation,
batch-wide and per-chunk progress/actions, and preserved zero-eligible behavior.

Owner decision added on 2026-09-25: campaign execution must be sequential per
tenant. The platform must never run more than one campaign executor at the same
time for the same tenant, including standalone campaigns and grouped chunks,
immediate and scheduled. Different tenants may execute independently.

Local implementation update on 2026-09-26: the batch/tenant-queue front is
BACKEND CORE IMPLEMENTED / INTEGRATED FOCUSED VALIDATED / NOT DEPLOYED /
OWNER UI PENDING.
Additive schema models were introduced for `CampaignExecutionBatch`,
`CampaignExecutionBatchCampaign`, `CampaignExecutionJob` and
`TenantCampaignExecutionLease`. `Campaign` remains the execution chunk. Send
now, scheduled execution and resume now enqueue a job and reuse the existing
runner after a tenant-level claim. Test-send acquires a temporary tenant lease
and persists a running technical job so it is blocked while the tenant has any
running campaign/test execution. Follow-up on 2026-09-26 added deterministic
chunk sequencing and a post-provider lease check so an executor that lost
ownership stops before persisting/continuing after a provider return.
`campaignExecutionQueue.test.ts` PASS 8/8 proved: only one job is claimed for
one tenant, different tenants claim independently, test-send blocks a campaign
claim atomically, expired running campaign jobs still block the tenant until
explicit finish, expired test-send leases still block until explicit release,
`needs_review` invalidates the old executor token before the next tenant job,
and batch chunks are claimed in `chunkIndex` order. The backend orchestrator now
executes grouped CRM dynamic and CSV jobs through the same tenant queue and
runner. `campaignRunner.test.ts` PASS 10/10 proved: accepted provider evidence
is preserved after lease loss without sending the next recipient; CRM dynamic
scheduled 3,001 eligible recipients resolve one snapshot and execute four
sequential chunks; CSV grouped 3,001 recipients execute four chunks, preserve
per-recipient variables and exclude a recipient blocked after planning before
provider. Focused `campaignsFeatureRoutes.test.ts` PASS 125/125 covered split
3,000, lifecycle pause/resume/cancel/test-send and scheduled opt-out
revalidation. Backend build PASS and `git diff --check` PASS. Frontend browser
smoke and aggregate UX validation are explicitly pending. `prisma migrate
deploy` was validated successfully on an isolated local database
`127.0.0.1:55432/re7_campaign_batches_migrate_check`; Prisma Client read the
new tables. The earlier generic local `Schema engine error` was isolated to
the previously manipulated local test DB/workaround path and is not treated as
proof against the migration.

Implemented contract for that front:

- `runningCampaigns` remains useful only as an in-process guard and is not a
  correctness guarantee. A durable per-tenant queue is required, with jobs
  claimed transactionally and protected by a tenant execution lease.
- Additive model: `CampaignExecutionBatch` for operator intent and aggregate
  state; `CampaignExecutionBatchCampaign` mapping ordered chunk index to
  existing `Campaign` rows; `CampaignExecutionJob` for queued standalone or
  chunk execution; and `TenantCampaignExecutionLease` keyed by `clientId`.
- Claim: a worker selects the next due job for one tenant using deterministic
  ordering, acquires or renews the tenant lease with a lease token and expiry,
  marks the job running, then invokes the existing campaign runner with a guard
  that checks the lease token before every provider attempt and again after the
  provider returns, before persisting the result or advancing to another
  recipient.
- Renewal/loss: the runner heartbeats the lease periodically and before each
  recipient. A running durable job blocks the tenant even if the lease timestamp
  expires, so another executor does not start merely because a provider call was
  slow. If a worker actually loses ownership, it must observe token mismatch
  and stop before the next provider call. Terminal states, pause, cancel,
  explicit release and controlled failure release the queue.
- Ordering recommendation: `eligibleAt` ascending, then creation sequence/id.
  Inside a group, chunks run by `chunkIndex` with group continuity: once a group
  starts, its next chunk stays ahead of newly due standalone jobs until the
  group completes, pauses, is cancelled or fails. A schedule that matures during
  a group waits; it does not interrupt or run in parallel.
- `Enviar agora` creates a queued job with `eligibleAt=now`. A scheduled
  campaign/group uses `eligibleAt=scheduledAt` as the earliest execution time,
  not a guarantee of immediate start when the tenant is busy.
- Pause releases the tenant lease and keeps the campaign/group paused until
  explicit resume. Resume creates/reenables a due queue job. Cancel removes
  pending jobs and stops further chunks. Provider/system failure should default
  to fail-stop for the group until operator action; empty chunks are skipped and
  do not hold the queue. Paused or failed items must not pin the tenant lease.
- CRM dynamic groups must resolve the filter only after acquiring the tenant's
  turn, persist one immutable group snapshot, then split that snapshot. Resume
  reuses the same snapshot. Static/CSV groups preserve the confirmed selection
  and per-recipient variables, with opt-out/exclusion/identity revalidated
  before provider dispatch.
- Already accepted/submitted recipients must not be resent on resume. Result
  uncertainty continues to use the existing campaign/result-truth mechanisms;
  the product must not promise exactly-once delivery beyond proven provider
  evidence.
- Test-send remains unitary and does not dispatch a group. Proposed safety
  policy: if the tenant has an active campaign execution lease, test-send is
  blocked or queued as a distinct low-priority test job by explicit product
  decision; it must not become an untracked provider-send path running in
  parallel with campaign execution.
- UX must show wait position/state, requested time versus effective start,
  group/current chunk, aggregate and per-chunk progress, pause/block/failure
  reason and available actions. Numbered names are presentation only, not group
  identity. "Attempts completed" must remain distinct from delivery result.
- Migration proposal: additive tables/indexes only. `CampaignBatch` indexed by
  `(clientId, status, eligibleAt)` and unique `(clientId, idempotencyKey)`;
  child links unique by `(batchId, chunkIndex)` and `(clientId, campaignId)`;
  `CampaignExecutionJob` indexed by `(clientId, status, eligibleAt, sequence)`
  plus lease expiry; `TenantCampaignExecutionLease` unique by `clientId`.
  Existing campaigns without a group remain compatible.
- Rollout/rollback requirement: queue-managed scheduled work must not be
  visible to the old scheduler as normal due `Campaign.status=scheduled` rows.
  Use an explicit queue-managed representation such as queue job `eligibleAt`
  with legacy `scheduledAt` neutralized or guarded, and enable the queue only
  after the old scheduler path is disabled. Rollback must restore the previous
  code and executable build and must not let old code dispatch queued group work
  in parallel.
- Planned validation: two workers contending for one tenant, distinct tenants
  independent, standalone competing with scheduled group, simultaneous
  schedules, restart/expired lease without overlap, pause/resume/cancel/failure
  release, one dynamic snapshot per group, zero-eligible chunks, no provider
  call during preparation, no duplicate recipients, preserved opt-out/exclusion,
  12/13 alias behavior, RBAC and tenant isolation.

Remaining gaps before production: UI/smoke for the full group flow, aggregate
browser experience for wait position/progress/actions, deploy runbook rehearsal
with migration artifacts, owner UI validation and production rollout. Backend
proof is local only; no production DB, provider real, real send, commit, push or
deploy was performed in this step. Owner-approved policies now settled: no
manual reprioritization, test-send is blocked rather than queued while tenant
execution is active, and group continuity outranks newly due standalone
campaigns until completion/pause/cancel/failure.

### Privacidade / LGPD por titular - 2026-09-20

Data Subject Privacy / LGPD contact-centric anonymization: OWNER PASS / LOCAL
VALIDATED / CLEAN DELIVERY DEPLOYED / PRODUCTION HEALTH VALIDATED. A nova frente adiciona preview e execucao de
anonimizacao por titular a partir de `Contact` canonico do mesmo tenant, com
fallback para `Lead.id` quando `Contact.id` ainda e nulo, busca/seleção pelo CRM
autenticado, confirmacao forte
`ANONIMIZAR TITULAR`, bloqueio de identidade ambigua e evento auditavel
sanitizado `privacy.subject.anonymized`. A implementacao reutiliza as primitivas
de `privacyRetentionService.ts`; a logica comum de minimizacao de Contact,
ContactChannelIdentity, Lead, LeadNote, OutboundMessage e Event foi extraida
para helper compartilhado, preservando a anonimizacao/retencao de conversa
existente. Nao houve schema, migration, hard delete, provider call, envio real,
ou deploy. Distincoes preservadas: exclusao operacional no CRM nao e
anonimizacao LGPD; exclusao de conversa e anonimizacao de conversa permanecem
com seus contratos atuais; retencao continua sendo rotina separada; reentrada
cria/usa novo ciclo operacional sem reidratar historico anonimizado.

Owner UX addition/correction: Contacts agora possui atalho compacto
`Privacidade` com icone de cadeado entre `Abrir contato` e `Retirar da
operação`, visivel para ADMIN, que apenas abre `/app/settings/privacy` com o
titular preselecionado. O atalho nao depende de conversa: quando a linha ainda
nao materializa `Contact.id`, a tela de Privacidade usa `Lead.id` como alvo sem
criar Contact artificial, sem telefone cru como chave de mutacao e sem segunda
engine de anonimizacao. A busca de titular em Privacidade passou a usar endpoint
governamental proprio que reutiliza o read model do CRM para contatos ativos,
Lead-only e operacionalmente excluidos, sem alterar a lista operacional normal
do CRM. Invariante permanente: OPERATIONAL EXCLUSION DOES NOT REMOVE SUBJECT
FROM PRIVACY GOVERNANCE DISCOVERY.

Production deploy, 2026-09-20: clean privacy head
`2527eb6cd01261c2825e2127191c1e3edcf88692` was fast-forward deployed over
`9bb5f88f6a10ff3280e5adcdc777e9df0b0f7657` after persistent PostgreSQL backup
`/opt/re7online/backups/converta-persistent/postgres/privacy-clean-20260920T200352Z-predeploy.dump`.
Backend/frontend builds passed, `re7-whatsapp-agent` and `re7-admin-front`
were reloaded, and `re7-whatsapp-web-worker` was preserved. Health returned
`ok`/`db=ok`. Domain counts for Contact, Lead, ContactChannelIdentity,
Conversation and OutboundMessage stayed unchanged during validation. No
`privacy.subject.anonymized`, provider send, `crm.contact.created` or
materialization event was emitted. Authenticated visual smoke was not exercised
because no valid current production app credential was available and an old
demo-prefeitura ADMIN session was rejected as expired by runtime auth policy;
no real anonymization was executed.

Invalid phone UX mapping: OWNER PASS / LOCAL VALIDATED / CLEAN DELIVERY DEPLOYED. Erros
`invalid_phone` vindos da validacao canonica de CRM agora mostram
`Informe um número de WhatsApp válido com código do país 55 e DDD.` no app. O
backend, normalizador canonico, CSV, campanhas e regras de persistencia nao
foram alterados; nao ha segundo validador frontend.

Lead-only operational exclusion materialization: DEPLOYED / PRODUCTION HEALTH
VALIDATED / REAL LEAD-ONLY E2E NOT EXERCISED. A acao operacional `Retirar da operação` agora suporta linhas
Lead-only usando resolucao canonica de identidade e materializando `Contact`
somente quando o operador executa explicitamente essa acao. Antes da
materializacao, o guard de conversa ativa e aplicado; conflitos de identidade
bloqueiam a mutacao com erro seguro; CCI canonico e reutilizado/criado sem
duplicar contato; reativacao usa o mesmo `Contact`. A materializacao registra o
evento `crm.contact.materialized_for_operational_exclusion` e exibe origem CRM
como `Integração / sistema`. Privacidade/LGPD permanece separada e preservada:
anonimizacao Lead-only continua usando o fluxo de titular existente, sem criar
`Contact` para privacidade. Deploy de producao em `fa7744ac01292f78e094302e932a4d2bd73cb9c9`
foi validado com backup, FF-only, build backend, reload apenas de
`re7-whatsapp-agent`, health/db OK e PM2 estavel. A busca read-only encontrou
candidatos Lead-only no tenant Demo, mas nenhum fixture com identidade WhatsApp
valida e comprovadamente seguro para mutacao; por isso o E2E real ficou
`NOT EXERCISED` e nenhum dado de CRM foi fabricado. Divida do teste
`crmConversationStartRoutes.test.ts`: 2 falhas de expectativa de masking foram
confirmadas identicas no base `fa507507` e nao sao regressao deste follow-up.

P1 Privacy subject atomicity, 2026-09-21: LOCAL FIX PREPARED / NOT COMMITTED /
NOT DEPLOYED. Incidente confirmado no tenant Demo para titular `****6787`,
requestId `46f4aba3-23d6-422b-b018-520c540839d5`: a anonimizacao por titular
executou a anonimização de conversa antes da transacao do titular e depois
falhou em `ContactChannelIdentity` por colisao no indice unico
`(clientId, channel, provider, channelAccountId, externalUserHash)` quando mais
de uma CCI do mesmo tuple recebia o mesmo hash anonimo. A correcao local coloca
conversa, runtime DB state, Contact, CCI, Lead, LeadNote, mensagens/eventos e
evento final `privacy.subject.anonymized` na mesma transacao Prisma; cleanup de
runtime JSON ocorre somente apos commit e e best-effort. CCI deixa de usar
`updateMany` amplo com hash compartilhado e passa a receber hash deterministico
non-PII por identidade. Ate deploy dessa correcao, NAO EXECUTAR anonimizacao
real por titular em producao; preview/busca continuam utilizaveis e
anonimizacao de conversa isolada preserva contrato existente. Nenhum repair de
`****6787` foi executado neste lote local.

Extensao local do mesmo P1: a anonimizacao por titular tambem desvincula o
titular de sementes privadas de campanha dentro da mesma transacao. Campanhas,
templates, datas, agregados, ledger/billing e evidencias anonimas permanecem;
o seed `campaign.seed.saved` remove apenas `leadIds`, destinatario privado,
`recipientRefs` e `componentsByWaId` do titular, preservando destinatarios nao
relacionados. Eventos `campaign.recipient.import_blocked` deixam de carregar
recipient bruto do titular. Re-cadastro posterior do mesmo telefone nao deve
ressuscitar campanhas antigas no CRM.

---

## PRIORIDADE ATUAL

Roadmap funcional/produto apos hardening de producao de 08-10/09.

Itens em `WATCH` nao bloqueiam a fila de execucao e nao devem virar frente ativa
sem novo incidente comprovado. Performance residual de Inbox deve ser medida em
janelas representativas futuras, mas nao e a prioridade corrente de
desenvolvimento.

### Auditoria canonica de backlog — 2026-09-13

Fonte de verdade auditada: branch canonico `flow-executor-quote-hardening`,
origin/production HEAD `69bedc38396b8f837a236b0af4a5446397919403`, producao
online, health `ok/db ok`, PM2 online, Prisma migrations up to date e CRA
`/admin/chatbot/settings` validado em runtime DB-backed.

Fechado / validado:

- Guided Builder 2.4: CLOSED / DEPLOYED / OWNER APPROVED LOCAL / PRODUCTION
  NON-DESTRUCTIVE VALIDATED. Entrega frontend-only em `ca34e123`, 54/54 testes
  PASS, build PASS, sem schema/migration, sem reload de backend/worker, hashes
  de `ChatbotFlow.definition` inalterados no smoke de producao e rotas
  `/app/chatbot` e `/admin/tenants/:tenantId/chatbot` saudaveis.
- Syer `****9614`: CLOSED. A correcao generica de handoff foi publicada em
  `597d7030`; o atendimento pre-fix foi reparado uma unica vez apos backup,
  preservando mensagens, protocolo, ciclo, fechamento e responsavel.
- Human handoff / queue contract: CLOSED / REAL VALIDATED. `WAITING` humano
  exige `departmentId` + `queueId` concreto. `queueId=null` nao representa fila
  padrao. O Guided Builder expõe `Setor`; fila unica e resolvida internamente,
  zero fila bloqueia e 2+ filas mostram seletor condicional.
- Canonical mail transport: CLOSED / DEPLOYED / REAL VALIDATED em `fec3a489`.
  Password reset, first access/invitation, Web Session disconnect alerts,
  template review e PostgreSQL backup alerts usam a camada canonica de mail.
  Fallback Resend API e SMTP `2465` centralizado permanecem preservados.
- Hybrid transport / identity / recovery: CLOSED / REAL VALIDATED para routing
  Web Session passivo, fresh-flow E2E, Meta duplicate dedupe, Lead/P2002,
  claim-before-downstream recovery e exactly-once coexistence.
- SECULT `presenceMode=AVAILABLE`: REAL VALIDATED por trafego organico. Nao e
  frente ativa; fairness e cursor round-robin permanecem somente WATCH.
- SECULT report truth/current-state, Maria 2/2 capacity diagnosis, Maria apos
  AVAILABLE, stale-heartbeat exclusion, AGENT closed access, CLOSED claim
  invariant, close observability, close terminal lifecycle e presence panel
  wording: CLOSED / VALIDATED ou CLOSED / DEPLOYED conforme historico abaixo.
- Inbox performance: IMPROVED / WATCH. `48c206fa` e `1aae26b5` estao REAL
  VALIDATED; `94882d76` foi REVERTED por regressao real; `4bc8befd` esta
  DEPLOYED. `last_message_lookup` permanece KNOWN RESIDUAL HOTSPOT / NO ACTIVE
  PATCH.
- Internal multitenant support access: IMPLEMENTED / P2 WATCH-HARDENING. O
  produto ja possui grant temporario, sessao de suporte, auditoria e banner de
  modo suporte; melhorias futuras devem focar evidencia operacional e least
  privilege, nao recriar o mecanismo.
- Users x Departments M2M: IMPLEMENTED. Existe
  `UserDepartmentMembership`, UI de usuarios com multiplos setores e uso no
  RBAC/assignment. Gap restante e refinamento de relatorios/filtros, nao modelo
  relacional basico.
- CRA admin chatbot settings: CLOSED / REAL VALIDATED em
  `69bedc38396b8f837a236b0af4a5446397919403`. Em 2026-09-13 a
  auditoria do toast inicial em
  `/admin/tenants/cra-pr/chatbot?clientKey=cra-pr` mostrou que CRA existe como
  `Client` DB-backed, mas `/admin/chatbot/settings` retornava
  `tenant_not_found` por exigir entrada legada em `.data/tenants.json`. A rota
  passa a montar tenant efetivo em memoria a partir do `Client` e dos resolvers
  DB-first, preservando fallback legado e sem criar entrada artificial em
  `tenants.json`. Smoke de producao: settings 200, resources 6 departamentos /
  6 filas, flows 1, health ok/db ok, `.data/tenants.json` ausente.
- Admin chatbot loading/badge: CLOSED / REAL VALIDATED em `69bedc38`. A UI
  admin hidrata flows/recursos mesmo se settings falhar parcialmente, o estado
  de loading nao depende mais de `settings != null`, o bug de badge permanente
  "Carregando" foi fechado e erro verdadeiro e exibido quando settings nao
  estiver disponivel.
- Abandoned automation / BOT flow lifecycle: LOCAL E2E VALIDATED / P2 RESIDUAL
  HARDENING. Em 2026-09-14, o comportamento existente foi validado em DB
  local seguro, sem runtime change, sem producao e sem deploy. `resetAfterMinutes`
  reinicia menu/submenu/captura no proximo inbound e nao move para HUMAN nem
  CLOSED; `timeoutMinutes/action=HANDOFF` promove uma vez para HUMAN/WAITING
  com department/queue concretos, protocolo e mensagem de posicao quando o
  destino e valido; nova varredura nao duplica handoff. Caveats abertos:
  limpeza de `flowContext` em reset stale, copy/UX de timeout e paridade
  provider-independent do processor. Auto-close generico de atendimento HUMAN
  continua fora do requisito.
- Inbox visibility policy audit: CLOSED / AUDITED / NO CODE CHANGE. A politica
  `shared`/`assignee_only_after_assignment` permanece apenas como regra de
  projecao/visibilidade para lista/detalhe/timeline; nao altera criacao de
  conversa, handoff, fila, capacidade, presenca, claim, transferencia, envio,
  fechamento, atribuicao automatica ou RBAC canonico. A restricao de acesso de
  AGENT a conversas `CLOSED` permanece mais forte e preservada.
- P1 Auth malformed claim process crash: CLOSED / DEPLOYED / PRODUCTION HEALTH
  VALIDATED. Em 2026-09-20, smoke pos-deploy revelou que token assinado com
  `clientId` malformado podia chegar ao Prisma em `AppAuthSession.clientId`
  (`@db.Uuid`), gerar `P2023`, escapar como `unhandledRejection` e reiniciar
  `re7-whatsapp-agent` via PM2. O fix `8f15eedf4eb11dd8f0bea4f1dd79bb50cae3be9e`
  valida claims UUID-backed antes de qualquer lookup Prisma e adiciona boundary
  de promise/erro ao ciclo HTTP de `handleRequest`: claim malformada retorna
  `401 invalid_token`; falha inesperada de request retorna 500 generico sem
  stack, mensagem Prisma, token, PII ou segredo no cliente. Global
  `unhandledRejection` permanece como last-resort fora do ciclo HTTP. Deploy
  production FF-only feito sobre `1a28cf2a82a8bc37dec0343f0487f2faf6be2962`,
  backend build PASS, reload somente de `re7-whatsapp-agent`, admin-front e
  web-worker preservados. Smoke seguro usou sessao real existente e token
  claramente invalido; NAO houve reproducao de token assinado malformado em
  producao. Health `ok/db=ok`, PID do agent preservado apos smoke, logs sem
  `process.unhandledRejection` e sem Prisma `P2023`.
- Campaign flow integrity review: IMPLEMENTED LOCAL / VALIDATED / NO DEPLOY.
  Campaign CSV uses the generic mapping model `Contato`, `Campo 1`, `Campo 2`
  and `Campo 3`; template variables can only source those mapped generic fields,
  and generic fields do not mutate CRM name or CRM situation. Authenticated
  campaign CSV preview/report exposes full normalized WhatsApp identifiers and
  renders ready, blocked and error rows in one operational table with reusable
  copy/export evidence. Campaign names are unique per tenant after trim,
  case-insensitive and whitespace-normalized comparison, returning
  `campaign_name_conflict` with PT-BR UX copy. Draft reopen/send/schedule and
  runner use persisted seed truth. Variable-template test-send uses the target
  recipient's own values when the test number belongs to the campaign audience,
  or an authorized deterministic sample from the campaign seed when the target
  is external; incomplete tests stop before provider calls or campaign aggregate
  mutation. CRM campaign history remains actual-send evidence only: draft, seed,
  import, test-send and scheduled-not-run data stay excluded.
- Campaign flow follow-up CSV readiness, 2026-09-22: LOCAL FIX PREPARED /
  NOT DEPLOYED. Owner production feedback after head
  `77e087a724fd53bcf06ed6d19267a655a06118b8` found that Campaign CSV generic
  fields and template-variable mapping were visually mixed, unmapped generic
  fields could appear as variable sources, CSV preview lacked copy/report
  affordance, draft detail still masked recipients, and static CSV drafts such
  as Demo `Campanha teste set.9` (`a1e01fb2-09f2-4be1-a180-3679a3ba008f`)
  could have empty `templateVariableMappings` with valid per-recipient
  `componentsByWaId`. Local fix expands Campaign CSV mapping to required
  `Contato` plus optional `Campo 1` through `Campo 10`, exposes only mapped
  generic fields as variable sources, separates CSV column mapping from message
  variable mapping, adds copyable preview errors/blocks, shows authenticated
  draft recipients with full WhatsApp identifiers, and treats static
  components-only seeds as ready without DB repair. Dynamic CRM-filter
  campaigns still require canonical `templateVariableMappings`. Production
  deploy and owner validation remain pending.
- Campaign execution truth + CRM UX follow-up, 2026-09-22: LOCAL FIX PREPARED /
  NOT DEPLOYED. Campaign CSV preview/draft/schedule/discard no longer creates
  Contact/Lead/CCI or writes CRM situation; it only persists the campaign-owned
  private recipient seed and per-recipient components. Contact/Lead/CCI
  bootstrap now happens only when an eligible recipient reaches effective
  campaign execution after send preflight and an actual provider request. A
  provider-returned `FAILED` attempt is effective campaign evidence and
  materializes/reuses Contact/CCI/Lead without creating a new Conversation or
  RuntimeState; pre-provider blocks and discarded drafts do not create contacts.
  CRM-filter audience preview is
  eligible-only, removes the "Envio ativo" filter concept from the operator
  flow, hides blocked contacts from the count/table and shows full authenticated
  identifiers. Draft/discarded/never-sent campaigns remain excluded from contact
  campaign history. Result filters and CSV mapping selects were hardened for
  dark-theme readability, campaign reuse restores available modality,
  destination and variable mapping state, and Contacts CSV preview table header
  alignment was corrected. No schema, migration, provider call, real send,
  production DB mutation, commit, push or deploy in this local pass.

ACTIVE P0:

- NONE.

ACTIVE P1:

1. Operational Queue production rollout:
   CLOSED / DEPLOYED / PRODUCTION RECONCILED / SMOKE PASS. The
   deployed baseline supports
   creation/import now requires explicit `returnDestination` in the
   `campaign.seed.saved` contract: `human_department` with concrete
   `departmentId` + `queueId`. The local successor UI accepts Department only,
   resolves explicit `Department.operationalQueueId`, blocks unavailable
   mappings and never exposes a multi-queue selector. Strict production cutover
   resolved all 54 departments on 2026-09-18, including the five owner decisions
   recorded on 2026-09-18.
   `automated_flow` uses any
   active same-tenant `ChatbotFlow` persisted as `chatbot:<flowId>` at runtime.
   `entryPoint` is not required for explicit campaign invocation; it remains the
   default selector for unqualified/new inbound only.
   Direct CRM contact initiation no longer falls back to generic operational
   defaults; it uses the initiating user's valid primary department and blocks
   before provider send when missing. Legacy campaigns without this seed remain
   compatible through the old operational default fallback, but new campaign
   configuration has no implicit name-based destination. Tests/builds: focused
   `operationalQueue.test.ts` 8/8 PASS, runtime routing 30/30 PASS, identity
   12/12 PASS, `campaignsFeatureRoutes.test.ts` 114/114 PASS,
   `ChatbotFlowBuilder.test.ts` 53/53 PASS, backend build PASS, frontend build
   PASS. Production advanced by FF-only to
   `b166bcac8bf443d34ba7f3821016b6bae8069728`; backup
   `/opt/re7online/backups/operational-queue-rollout-20260918-104054` passed
   (`20,664,912` bytes, 578 objects, SHA256
   `a5898b277a82e5d0317314c9decaeb75dede023f76a8d55afc2044c4da230ddf`);
   migration `20260917213000_add_department_operational_queue` applied; first
   reconciliation updated 44 explicit mappings and created/linked 2 internal
   queues; second reconciliation was idempotent. Post-verify: 54 departments, 44
   active resolved, 0 active unresolved, 8 inactive null, 2 inactive with queue,
   0 cross-tenant/department links. Backend/frontend builds, targeted PM2 reload
   and HTTP smoke passed. No real Meta send and no `****6787` repair occurred.

2. Campaign UX / result truth canonical integration:
   INTEGRATED LOCAL / OWNER REVALIDATION PENDING / NO DEPLOY. The
   owner-approved Campaign UX delta was recovered from
   `.codex-recovery/re7-cra-crm-integration-20260917T2015.tar.gz` and
   reapplied on the current canonical Operational Queue baseline
   `6eec15c4c4725079c3dd5e48e3eb10d81643c2db`, without schema/migration,
   queue-domain changes, production deploy, Meta send or `****6787` repair.
   Customer UX now keeps campaign destination Department-only, removes
   customer-facing price/cost/tariff surfaces from Campaigns and the Inbox
   template shortcut, exposes persisted lifecycle tabs `Enviando`,
   `Agendadas` and `Concluídas`, keeps the progress/detail modal closeable
   while backend execution continues, and renders recipient-level blocked,
   skipped, pending and opt-out states from persisted backend data. Backend
   execution remains authoritative; the frontend only observes persisted
   campaign state. Final local result-detail audit for Demo campaign `Campanha
   teste set.2` / `lembrete_vencimento_anuidade` confirmed that the repeated
   `****6787` line was a projection/fallback duplication, not a duplicate
   provider send. Detail now reconciles one current outcome per intended
   recipient when identity evidence exists, shows the full phone only inside
   the authenticated campaign detail, preserves masking in draft/review, and
   classifies mixed delivered/blocked evidence as partial delivery. Recovery artifact:
   `codex-recovery/campaign-ux-result-truth-delta-20260918.patch`, 36,387
   bytes, SHA256
   `5967b2baab3ceffa3333b6f04ec31b622652e2399e2cbcf69de60379a53db490`.
   Root-cause closure for `****9614`: the runner blocked before provider
   because canonical resolution found two same-tenant Contact candidates and
   one Lead. The duplicate Contact is historical residue from the former
   campaign bootstrap, created before Identity P1; no current creation bypass
   was reproduced. The same recipient remains blocked until a separately
   owner-authorized transactional data repair. Counters are separated as
   delivered 1, blocked 1, pending 0 and technical failures 0, with campaign
   wording `Entrega parcial`. Evidence and dry-run repair package:
   `docs/saas/DEMO_9614_CAMPAIGN_IDENTITY_CLOSURE_2026-09-18.md`.
   Validation: `campaignsPageContract.test.ts` 9/9 PASS,
   `campaignsFeatureRoutes.test.ts` 115/115 PASS on safe local DB
   `re7_campaign_result_truth_test`, backend build PASS, frontend build PASS,
   `git diff --check` PASS. Production remains protected at
   `b413eea04af15cef2cf7667dbc3fa84bca3f49bc`; production health/db/migrations
   PASS read-only. Owner visual revalidation on this integrated branch is still
   pending.

   P1 canonical 12/13-digit corrective, 2026-09-18: READY FOR OWNER REVIEW /
   NO DEPLOY. The first synthetic result-truth test did not reproduce the real
   persisted shape. Production validation at HEAD `6f63133d7c3bb09097a11c0b49eefa7b9f8383c3`
   exposed a 13-digit seed and 12-digit delivered outbound for the same
   `****6787` identity, creating a false missing-history failure. The hard gate
   stopped validation. The projection now reuses
   `buildCrmWhatsappIdentityCandidates`; it does not add a campaign normalizer
   or rewrite history. Exact and reverse shapes, multiple real attempts,
   genuine fallback, cross-tenant isolation and `****9614` blocked semantics are
   covered. Read-only replay of the real records returns exactly 2 rows: 1
   delivered, 1 blocked, 0 pending, 0 technical failures, `Entrega parcial`.
   Validation: campaign backend 118/118, complementary matrices 56/56 and
   72/72 PASS. Schema unchanged, migration none, no send, no repair. Canonical
   record:
   `docs/saas/CAMPAIGN_RESULT_TRUTH_CANONICAL_RECONCILIATION_2026-09-18.md`.

   Open controlled data action: Demo `****9614` historical identity residue.
   DATA REPAIR PREPARED / OWNER AUTHORIZATION REQUIRED / NO RESEND. Factory is
   fixed; do not reopen Identity P1 as an active product bug without new
   creation evidence contradicting the focused identity-path tests.

   Campaign composer cleanup: IMPLEMENTED LOCAL / OWNER REVIEW PENDING / NO
   DEPLOY. Unsaved composition is now governed by one dirty-state contract and
   one idempotent reset. Explicit discard and Campaign-tab navigation clear
   name, template/variables, recipients, CRM/CSV previews, mappings,
   destination and errors; stale async preview responses are invalidated.
   Preview creates no server record. Explicit drafts, CRM upserts committed by
   CSV draft creation, scheduled/sending/completed campaigns, outbound, billing
   and history remain preserved. Canonical lifecycle:
   `docs/saas/CAMPAIGN_COMPOSER_LIFECYCLE.md`.
   Local gate on 2026-09-18: composer/page contracts 18/18 PASS, Campaign
   backend 115/115 PASS, import/CRM 23/23 PASS, both builds and focused lint
   PASS. Authenticated smoke confirmed clean discard/re-entry, clean CSV cancel
   and intentional draft preservation. Owner visual review remains pending.

3. CRA Demo Utility Recipient B controlled send: COMPLETED / DEMO PRODUCT
   CAPABILITY VALIDATED / CRA ACCEPTANCE STILL SEPARATE. On 2026-09-16 the
   owner authorized exactly one Utility send to Recipient B `****6787` through
   campaign `bb1d30e2-3a98-471a-9531-1f5e5d76a214`. Preflight passed:
   `demo-converta` active, `data_exame` approved Utility `pt_BR`, B-only
   audience, A excluded, no active opt-out, outside 24h by 143.72h, explicit
   HUMAN return destination `Atendimento Geral`
   (`cmsiwk1o100014sdzl5cqd2ki`) -> `Fila Geral`
   (`cmsiyb2k200n94sdpu5khkee0`), and department OPEN. Backup:
   `/opt/re7online/backups/demo-b-controlled-send-20260916/pre-demo-b-controlled-send-20260916T132038Z.dump`
   (20M, 593 objects, SHA256
   `e73be155604ae0c7e7fe42b44dc87a1213755030cfa1c0d5d585f33e0319253a`).
   Result: exactly 1 Meta call, accepted with Meta id
   `wamid.HBgMNTU4NDk0Nzg2Nzg3FQIAERgUQ0UzOTE0Q0UyNUY0QjQ3OUZCQ0EA`,
   local OutboundMessage `076910ef-ce6f-43d6-bfc2-2f30c4b41930`,
   `campaign.message.submit_started` PASS, `campaign.message.provider_accepted`
   PASS, `campaign.message.reconciliation_required` absent, webhook `sent=1`,
   `delivered=1`, `read=0`, `failed=0`, billing event
   `billing.active_message.delivered` count=1, duplicate billing NO. Campaign
   status `completed`, `sentCount=1`, `blockedCount=0`. A external sends in
   this run: 0. Sanitized evidence:
   `docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_C_RECIPIENT_B_CONTROLLED_UTILITY_RESULT_2026-09-16.md`
   and `.csv`. Opt-out E2E was later completed on Demo; CRA real
   acceptance/report package still needs owner/customer acceptance evidence.

3. CRA Demo opt-out E2E: COMPLETED / DEMO PRODUCT CAPABILITY VALIDATED /
   CRA ACCEPTANCE STILL SEPARATE. On 2026-09-16 the owner explicitly authorized
   opt-out creation, one controlled blocked campaign and reversal for B
   `****6787`. Canonical `recordContactOptOut` created
   `contact.opt_out.recorded` (`88361d0f-89df-41fc-852b-ce84cbb43cc4`);
   campaign `d260bdc6-326f-4487-8d15-21c2a98dd741` blocked before provider via
   `campaign.recipient.opt_out_blocked`
   (`80d6ca1d-94f2-4465-81b7-74888c1d0edc`), `blockedCount=1`,
   `sentCount=0`, Meta calls 0, real messages 0, OutboundMessage 0 and billing
   events 0. Canonical `revokeContactOptOut` created
   `contact.opt_out.revoked` (`a5b58132-79fe-49dd-8aff-49fb78bf4566`); B is
   eligible again and history is preserved. A `****9614` was untouched
   (outbounds 125/125, billing 1/1, opt-out events 0/0). Evidence:
   `docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_D_OPT_OUT_E2E_2026-09-16.md`
   and `.csv`.

4. CRA reports / exports / billing acceptance audit: COMPLETED FOR DEMO
   PRODUCT CAPABILITY / CRA ACCEPTANCE STILL SEPARATE. On 2026-09-16 a
   docs/evidence-only audit reviewed the official clarification and product
   routes without sending campaigns, changing opt-out or mutating ledger data.
   Sources confirm export may be CSV/XLSX or equivalent open/widely used format
   and active-message billing is Utility outside 24h effectively delivered;
   read does not add billing. Production read-only evidence: A campaign
   `d9874c03-10e8-4061-a92e-6caa7b3001c3` remains truthful as
   `failed`/reconciled with one outbound and one
   `billing.active_message.delivered`; B campaign
   `bb1d30e2-3a98-471a-9531-1f5e5d76a214` is `completed` with one delivered
   outbound and one billing event; opt-out campaign
   `d260bdc6-326f-4487-8d15-21c2a98dd741` has `blockedCount=1`, zero outbound
   and zero billing. `demo-converta` and `cra-pr` both have `campaigns` and
   `reports` enabled. CSV/open-equivalent evidence PASS; native XLSX is not
   claimed; formatted PDF exists in reports but campaign consumption remains
   CSV/open-equivalent. Provider cost, estimated USD payload and CRA
   contractual BRL price remain separate; CRA final contract unit remains NOT
   PROVEN. Evidence:
   `docs/bids/2026/cra-pr/evidence/demo-contract-validation/PHASE_E_REPORTS_EXPORTS_BILLING_2026-09-16.md`
   and `.csv`. Next front: CRM import/upsert/report with optional
   `Situacao no CRM`.

5. CRA campaign import - optional CRM situation column: IMPLEMENTED /
   TEST VALIDATED / PRINCIPLES AUDIT PASS / OWNER APPROVED LOCAL / DEPLOYED /
   PRODUCTION NON-DESTRUCTIVE VALIDATED.
   Campaign/contact audience files may optionally contain
   `Situacao no CRM` / `Situação no CRM`. When populated, the value must resolve
   deterministically against CRM situations/statuses already configured for the
   same tenant, persist the canonical internal id/reference, never use
   cross-tenant values, never create a CRM status silently and report unknown
   values truthfully in preview/import validation. Unsafe fuzzy matching is not
   allowed. This front is a safe tenant-scoped CRM upsert, not only a new
   column: if imported identity matches an existing CRM contact, update the
   canonical record and do not create another contact. Blank uploaded cells
   preserve existing name/status values; valid imported name may update the
   existing contact according to current CRM semantics; valid resolved
   `Situação no CRM` may update the existing situation reference. Repeated
   identities inside the file must not create duplicate contacts. After import,
   a detailed operator report is mandatory with totals, created/updated/
   unchanged/skipped/errors, duplicate/consolidation evidence and per-row safe
   result details; downloadable evidence should reuse existing export/report
   infrastructure. Audit completed: CRM status model,
   canonical identity/normalization/deduplication mechanism, current import
   schema, segmentation usage, status naming/uniqueness, update-vs-create
   semantics, duplicate-row policy, partial-success behavior and report/export
   infrastructure were reviewed. Implemented local result: `Lead.status` is the CRM situation
   model; campaign CSV import now previews/applies tenant-scoped CRM upsert via
   existing identity helpers, updates valid nonblank names, preserves blank
   name/status cells, resolves `Situação no CRM` by same-tenant active status id
   or label with deterministic normalization, blocks unknown/ambiguous
   situations at row level, prevents duplicate contact creation for repeated
   identities, records per-row import evidence and exposes downloadable CSV
   report in the app campaign import flow. CRA customer import run is still
   pending owner-approved sample data.
   Audit history preserved: owner result was PARTIAL PASS; the 2026-09-17
   principles audit blocked the front on four P1 findings (transaction
   consistency, duplicate winner order, parallel identity matching and missing
   CRM capability). The corrective batch now uses the canonical CRM resolver,
   commits CRM mutation/status/campaign seed per row, validates before claiming
   duplicate identity, requires `campaigns` plus `crm` (and `contacts` scope in
   the public API), and neutralizes spreadsheet formulas in the result CSV.
   Focused rollback, hash-only identity, duplicate-order, authorization and CSV
   tests pass. Residual P2: canonical preview resolution is sequential per row
   (100 rows about 231 ms; 1,000 rows about 1.76 s locally) and may need later
   bulk performance hardening without a parallel identity engine. Residual P3:
   normalize internal operation/error labels exposed to the operator. Owner
   revalidation passed locally on 2026-09-17 for preview, import, no-duplicate
   behavior, hash-only identity, CRM situation, blank preservation, duplicate
   winner, report/download, CSV safety, history preservation and regressions;
   no real send occurred. Canonical integration was then prepared from
   `819cd9b5` with the audited corrective delta preserved. Production reached
   `cad9489c` by FF-only on 2026-09-17 after verified persistent backup; backend
   and frontend builds/reloads and non-destructive runtime/bundle/DB checks
   passed. No real production import or send was executed, and CRA/customer
   acceptance remains pending. The authorized operational untracked directory
   `apps/whatsapp-web-worker/.data/` remained intact and its process was not
   reloaded; this is operational state, not a product defect. Completion
   telemetry and the broader lint baseline remain WATCH.

6. Contacts - campaign relationship view: CANONICALLY INTEGRATED / TEST
   VALIDATED / OWNER PASS / PRODUCTION DEPLOY PENDING / CRA CAMPAIGN-CRM FOLLOW-UP. Implemented
   in the CRM/Contacts area as a read-only projection from canonical
   `Campaign`, `OutboundMessage` and campaign event evidence. Contact list now
   shows compact campaign count, latest campaign/date/template/status, and the
   contact detail drawer shows recent campaign history with navigation to the
   existing campaign detail route. No Contact-owned shadow campaign-history
   model, schema or migration was added; no campaign/billing history was
   rewritten. Scope is same-tenant only and the list uses one bounded aggregate
   projection for the current page plus on-demand detail to avoid per-row N+1.
   Customer UX exposes operational statuses only, with no price/cost fields.
   Validation on safe local DB `re7_queue_domain_test_20260917`:
   `crmCapabilityRoutes.test.ts` 19/19 PASS including same-phone/cross-tenant
   isolation, delivered status, opt-out block, identity conflict, detail link
   and no financial strings; backend build PASS; frontend build PASS; diff
   check PASS. CRA customer acceptance and production deployment remain pending.

7. Contacts + Campaigns UX refinement, 2026-09-19: IMPLEMENTED LOCAL / OWNER
   PASS / NO DEPLOY. This is visual/interaction polish on already
   closed domain behavior. Contacts now use clickable rows, compact
   Inbox/Departments-like action buttons, full phone display only inside the
   authenticated same-tenant CRM read model, no duplicate top-level CRM
   Situation/active-send/template-eligibility summary, active-send control as an
   ON/OFF switch backed by the canonical opt-out record/revoke path, and one
   expandable "Campanhas relacionadas" section instead of repeated standalone
   campaign cards. Final owner rule: contact deletion is available only from the
   contact list row; the contact detail keeps close/edit/save/cancel semantics
   and has no delete action. Contact exclusion remains the existing guarded
   operational exclusion path; active/open conversations still block with
   explicit instructions and no auto-close/transfer/delete. Campaigns removed the
   redundant top counter panel, moved counts into tabs, made campaign rows open
   detail directly, right-aligned compact actions, removed the technical
   provider/persistence note and normalized detail counters so "Processadas"
   and "Aceitas pelo provedor" are distinct. Campaign detail now has view-only
   recipient/result filters by result status, same-tenant CRM Situation and
   name/phone search; the filtered set can be copied as tabular text or loaded
   into the existing composer as current canonical contacts with explicit
   excluded-without-current-contact counts. This prefill does not send and the
   normal composer path rechecks opt-out/identity at draft/send time. Dynamic
   CRM-filter scheduled campaigns are now a separate OWNER PASS / LOCAL
   VALIDATED / NOT DEPLOYED front documented in
   `docs/saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md`: schedule-time stores
   only the CRM Situation filter, execution-time creates one immutable snapshot,
   and static campaigns remain unchanged. No schema/migration, no real send, no
   financial customer UX and no campaign/history rewrite.

8. Contacts UX finishing + phone normalization/import validation hardening,
   2026-09-19: OWNER PASS / DEPLOYED / PRODUCTION NON-DESTRUCTIVE VALIDATED. Final local
   polish keeps the active-conversation delete guard in the Contact list row but
   makes the blocking toast closable, removes the redundant active-conversation
   warning/action block from Contact detail, and makes `Abrir campanha` navigate
   to the existing campaign detail route. Contact CSV preview now disables while
   pending and ignores stale duplicate responses; preview/confirm report created,
   updated/reused, skipped, failed rows and detailed formula-safe errors with
   copy/download actions. Permanent invariant: NO NEW CONTACT/RECIPIENT PHONE MAY
   BE PERSISTED WITHOUT CANONICAL NORMALIZATION + VALIDATION. Manual Contact
   create, Contact CSV import and Campaign CSV import now share the canonical CRM
   WhatsApp identity normalizer, reject missing DDD, unsupported/non-Brazil and
   structurally invalid phone numbers before persistence, and preserve approved
   12/13-digit Brazilian identity equivalence. Follow-up convergence completed
   locally: Contacts CSV now reuses the Campaign CSV parser/status resolver where
   domain-compatible, supports `Situação no CRM`, validates that CRM statuses
   already exist in the same tenant, rejects invalid status rows before
   persistence, preserves existing status when the CSV cell is blank, and uses the
   same preview/report philosophy with row-level errors and copy/download
   evidence. No provider call, schema, migration, production mutation, real send,
   opt-out rewrite, result-history rewrite or tenant hardcode. Production
   deployment `1f8304f8624e76ba3efc507b9eccd80060447adb` was applied by
   fast-forward only from `5208de159dd11b94dd5db2382446c66b38705c52` after
   verified PostgreSQL backup
   `/opt/re7online/backups/converta-persistent/postgres/contacts-phone-integrity-20260919-233044/whatsapp_agent.dump`
   (`sha256=e4c965d219c85aaeff211d12161b49cc74e8b553e47f34758c34b621e2b153cf`).
   Production validation used Demo preview/read-only paths only: Contact CSV and
   Campaign CSV preview produced zero Contact, Lead, Campaign or Outbound
   mutations; no provider call, real send, billing event or schema/migration
   occurred. Existing historical invalid phone rows remain an audit/repair topic
   and were not mass-corrected by this gate.

   Contacts CSV complete UX/data-integrity lot, 2026-09-20: OWNER PASS / LOCAL
   VALIDATED / NOT DEPLOYED. Owner production feedback required the Contacts
   CSV modal to converge visually and behaviorally with the Campaign CSV import
   flow. Local delta removes the initial `Confirmar importacao` action until a
   preview exists, locks duplicate preview/import actions during pending/result
   states, provides an explicit cancel/reset path, renders preview/report/errors
   with Campaign-style cards, badges and tables, localizes operation/reason
   labels, and shows full authenticated phone evidence in the Contacts CSV
   preview/report. Preview validity is tied to the exact selected phone/name/CRM
   Situation column mapping; mapping changes keep the stale preview visible,
   block import and require `Atualizar previa`. Domain behavior remains
   unchanged: preview before import, same-tenant CRM Situation resolution,
   canonical phone normalization, formula-safe report CSV, no provider call, no
   real send, no schema/migration.

   CRM post-deploy hardening, 2026-09-21: LOCAL VALIDATED / COMMIT PENDING /
   NOT DEPLOYED. Contact origin semantics were hardened without adding a
   persistence field: CRM CSV confirm now persists individual per-contact
   canonical provenance through the existing `crm.contact.created` audit event;
   `crm_manual` maps to `Cadastro manual`, `crm_import` maps to `Importacao CSV`,
   campaign/audience evidence maps to `Campanha / audiencia`, explicit
   conversation/inbound/system sources map to their user-facing categories and
   legacy records without reliable evidence show `Nao identificado` rather than
   fabricated provenance. Origin is first reliable CRM entry provenance: a
   manually created contact later updated by CSV remains `Cadastro manual`,
   while a CSV-created contact shows `Importacao CSV`. Contacts CSV modal state
   now exposes one secondary action per state: `Cancelar` before processing and
   `Fechar` after the completed summary; no redundant close/cancel pair remains.
   CRM conversation actions now preserve historical count/history while exposing
   `Abrir conversa` only when the selected conversation is projectable by the
   canonical Inbox policy `shouldProjectConversationToHumanInbox(...)`. BOT-only
   or otherwise non-projectable historical conversations remain historical CRM
   evidence and no longer create false Inbox-open actions. No schema/migration,
   no provider call, no real send, no runtime mutation and no new conversation.

7. Campaign post-Meta persistence / operational default: CLOSED / DEPLOYED /
   TEST VALIDATED / PROD NON-DESTRUCTIVE VALIDATED. Em 2026-09-15, Phase C autorizada para exatamente
   2 mensagens Utility `data_exame` via META_CLOUD no `demo-converta` parou com
   bug operacional. Prechecks passaram, a primeira chamada Meta para `****9614`
   foi aceita e o owner confirmou recebimento real, mas o runner falhou em seguida com
   `default_operational_department_missing` antes de persistir OutboundMessage,
   ledger e report; `****6787` nao foi enviado. Campanha
   `d9874c03-10e8-4061-a92e-6caa7b3001c3` ficou `failed`, `sentCount=0`,
   `blockedCount=0`. Meta message id foi recuperado nos eventos runtime e
   webhooks `sent` e `delivered` foram encontrados em `webhook.status.received`,
   mas nao correlacionaram porque o OutboundMessage local nao existia. Causa:
   `ensureCampaignOutboundConversation` exigia default operacional depois da
   mutacao externa Meta; no Demo havia departamento/fila, mas sem default ativo
   `Atendimento Geral/Fila Geral`, e a dependencia nao era preflight. Fix
   local generico aplicado sem tenant hardcode: preflight de default operacional
   antes de Meta, eventos idempotentes `campaign.message.submit_started` e
   `campaign.message.provider_accepted`, bloqueio de retry com
   `campaign.message.reconciliation_required`, e registro
   `webhook.status.orphaned` para status sem OutboundMessage sem criar billing
   sintetico. Auditoria read-only de risco confirmou que nao e Demo-only:
   `cra-pr`, `demo-converta`, `secult-pe` e `syer-rodrigues` nao possuem
   `defaultDepartmentId/defaultQueueId` nem default geral ativo; `re7online`
   possui default geral ativo. Testes locais PASS: `campaignRunner.test.ts` 5/5,
   `campaignsFeatureRoutes.test.ts` 113/113, billing 4/4, preview 4/4,
   backend build PASS e `git diff --check` PASS. Deploy FF-only em producao em
   2026-09-15 no commit `b8c8f616`; backup persistente
   `/opt/re7online/backups/campaign-post-meta-20260915/pre-campaign-post-meta-20260915-210808.dump`
   (`20M`, 578 objetos, SHA256
   `e4e2dc141ff23f5afef9bc4504ef7951d4038ddc39cb623754e51dded455ca27`);
   reload somente `re7-whatsapp-agent` (`3253772` -> `3319619`), frontend e
   web worker preservados, health/db PASS. Smoke nao destrutivo no bundle
   implantado confirmou preflight antes de send, marker accepted,
   reconciliation guard e orphan status path. Nao houve novo envio real; A nao
   deve ser reenviado e B requer novo owner gate. Auditoria manual de Recipient
   A em 2026-09-15 concluiu SAFE CONSTRAINED RECONCILIATION POSSIBLE e o owner
   aprovou a reparacao restrita. Backup persistente criado em
   `/opt/re7online/backups/recipient-a-reconciliation-20260915/pre-recipient-a-reconciliation-20260915T213115Z.dump`
   (`20M`, 593 objetos, SHA256
   `d0957043bcf2a137bbe700c7517606ac0d716ec85da24b89d2bd68d897d43122`).
   Reparacao aplicada somente em `demo-converta`: 1 OutboundMessage criado para
   `****9614` (`1375f639-b3df-425a-987e-545d2ffcddd1`), Meta id recuperado
   anexado, delivered real aplicado por billing canonico idempotente
   (`billing.active_message.delivered`), `sentCount=1`, `status=failed`
   preservado e audit event unico registrado. A nao foi reenviado; B nao foi
   enviado. RECIPIENT A RECONCILIATION = RECONCILED / NEVER RESENT; RECIPIENT B
   historical 2026-09-15 attempt = NOT ATTEMPTED / BLOCKED PRE-META BY DEMO
   OPERATIONAL DEFAULT, later superseded by 2026-09-16 explicit destination
   draft preparation with no real send.
   Owner autorizou B-only em 2026-09-15, mas o preflight imediato bloqueou antes
   da Meta: `demo-converta` possui `Atendimento Geral` inativo e `Fila Geral`
   ligada ao departamento inativo; nao existe par active default
   `Atendimento Geral` + `Fila Geral`. Como `failed -> sending` e proibido, a
   campanha original nao pode ser retomada; caminho correto seria nova campanha
   controlada B-only depois de reparo config-only do default operacional Demo.
   Meta calls para B nesta tentativa: 0. Auditoria de
   default operacional Demo em 2026-09-15 concluiu CONFIG PENDING / OWNER GATE:
   o mecanismo canonico existente nao usa `defaultDepartmentId/defaultQueueId`;
   ele resolve por `Atendimento Geral` ativo + `Fila Geral` em
   `ensureDefaultOperationalDepartmentAndQueue`. O Demo ja possui o departamento
   `cmsiwk1o100014sdzl5cqd2ki` (`Atendimento Geral`,
   `atendimento-geral`) com a fila `cmsiyb2k200n94sdpu5khkee0`
   (`Fila Geral`) e membro ativo, mas o departamento esta inativo. Proposta
   preparada e nao executada: reativar esse departamento existente; nao criar
   setor/fila novo, nao escolher setor tematico SECULT/CRA e nao enviar Meta.
   Owner approval obrigatorio antes da mutacao DB config-only.
   Auditoria de
   unidade de billing em 2026-09-15 confirmou que `R$ 0,32` veio da premissa
   interna central `R$ 3.200,00 / 10.000 mensagens ativas`, nao de Meta, nao de
   override de tenant e nao de proposta final CRA encontrada. O ledger de A esta
   correto como elegibilidade/contagem delivered Utility fora de 24h. A prova
   oficial estreita de custo Meta para B foi obtida em 2026-09-15: Brazil
   Utility, BRL, efetivo em 2026-07-01, tier 0-250.000, R$ 0,0350/mensagem
   entregue. A unidade BRL final CRA permanece NOT PROVEN;
   OPT-OUT E2E e REPORTS/EXPORT/BILLING permanecem pendentes ate nova evidencia
   valida de campanha.

P2 / PRODUCT + META CAPABILITY:

1. Meta Marketing template media support: OPEN. Audit and implement
   professional support for MARKETING templates with IMAGE and VIDEO headers,
   Meta media/example requirements, upload/handle lifecycle, preview,
   variables, supported buttons, submission, approval/rejection status,
   rejection reason, approved-template send path and current official Meta
   Marketing pricing source. This must not be mixed with the current CRA Utility
   controlled campaign. If CRA Contract/TR evidence later proves Marketing media
   templates are required for current acceptance, flag for owner decision and
   potentially promote it to the CRA contract front.

WATCH / EXTERNAL OPERATIONS:

1. Demo channel continuity: WATCH / SEPARATE META AND WEB SESSION TRACKS.
   Auditoria somente leitura de 2026-09-15 preserva o historico do incidente
   externo Meta de 2026-09-14 (`status=BANNED`, WABA `REJECTED`, business
   `not_verified`, templates `SCAM`) sem tratar isso como causa de Web Session.
   A evidencia atual em producao mudou: `npm run meta:readiness -- --tenant
   demo-converta` retornou `WARN` sem `FAIL`/`WAITING_EXTERNAL`, com
   `TenantMetaConfig` presente, token presente, WABA/phone mapeados e validacao
   externa de subscription ainda requerida. A Web Session do Demo, que entrou em
   `QR_REQUIRED` em 2026-09-13 22:40:23Z com `action=auth_clear`, foi
   reemparelhada em 2026-09-14 16:31Z e esta `CONNECTED` em producao para
   `****5328`; material `baileysAuthState.v1` aprovado esta configurado. Nao
   limpar, desconectar, resetar, trocar numero/WABA ou reexecutar onboarding sem
   diagnostico e autorizacao explicita do owner.
2. CRA-PR contractual readiness: UTILITY READINESS AUDIT CLOSED / CONTRACT
   ACCEPTANCE OPEN / CONTRACT GAPS TRACKED OUTSIDE RUNTIME P1 UNLESS CODE GAP
   IS PROVEN. A matriz canonica
   `docs/bids/2026/cra-pr/CONTRACT_ADHERENCE_MATRIX.md` mapeia 52 requisitos
   do Contrato/TR contra produto, configuracao CRA e evidencia de producao.
   Nao reabrir CRA active flow visibility nem CRA business hours: ambos estao
   fechados, respectivamente CUSTOMER VALIDATED e CONFIGURED / OPERATIONALLY
   VALIDATED. Atualizacao de 2026-09-15: a frente ativa e aceite contratual da
   campanha Utility controlada; a copia CRA aprovada ainda nao foi encontrada,
   portanto nao ha autorizacao para submissao Meta nem envio real. Instagram
   Direct, Facebook Messenger e Website/Webchat seguem contratados, mas estao
   CUSTOMER-DEFERRED / DELIVERY WINDOW PENDING e nao bloqueiam esta fase.
   Snapshot somente leitura CRA: Meta/WhatsApp configurado, `campaigns=true`,
   `templates=true`, 0 templates, 0 pedidos de template, 0 campanhas, 0 eventos
   de billing/opt-out de campanha. Checklist canonico atualizado em
   `docs/bids/2026/cra-pr/UTILITY_CAMPAIGN_ACCEPTANCE_CHECKLIST.md`.
   Proibido submeter template Meta ou envio Meta real sem copia CRA aprovada e
   aprovacao explicita do owner cobrindo template, destinatarios, janela, custo
   esperado, nome da campanha e quantidade de mensagens. Gate local de DB em
   `re7_cra_contract_test2`: migrations 58/58, campanha/import/runner 5/5 PASS,
   billing/preview/lifecycle 5/5 PASS; suite ampla `campaignsFeatureRoutes`
   111/112 PASS com timeout em runtime de chatbot inativo, fora da frente
   Utility/campaign. Ordem atual: Utility/campaign acceptance, opt-out,
   relatorios/exportacoes/billing, acceptance pack; canais adiados so reabrem
   com janela do cliente.
   Demo contract validation Phase A, 2026-09-15: `demo-converta` foi auditado
   como mirror multitenant, nao clone CRA. Snapshot read-only: ACTIVE/business,
   Meta Cloud configurada, 1 Utility aprovado, 0 campanhas, 0 eventos de
   billing/opt-out de campanha, 15 departamentos, 19 filas, 4 fluxos e 50 linhas
   de horario. Plano canonico criado em
   `docs/bids/2026/cra-pr/DEMO_CONTRACT_VALIDATION_PLAN.md`: 36/52 requisitos
   demo-validatable, 19 ja product-validated, 8 capacidades validadas nesta
   leitura, 12 CRA-specific only, 4 customer-deferred, 1 product gap. Nenhuma
   submissao Meta, envio real ou dado CRA usado no Demo.
   Phase B owner gate, 2026-09-15: template Demo aprovado `data_exame`
   (Utility/pt_BR, 1 variavel Data) e adequado apenas para homologacao Demo com
   dados de teste; testes locais de precheck 13/13 PASS; custo de referencia
   anterior para 2 mensagens = R$ 0,64, agora reclassificado como referencia
   central de planejamento pendente de reconciliacao de unidade. Sem envio real.
   Correcao de backlog: HUMAN
   waiting-on-customer 1h e SUPERSEDED / NOT REQUIRED; atendimento humano pode
   permanecer aberto sob controle do atendente. O front correto e BOT/FLOW
   lifecycle, ja validado para resetAfterMinutes, stale pending question reset e
   inactivity handoff, com residual cross-provider e Guided lifecycle UX em P2.
   Phase C controlled gate, 2026-09-15: owner autorizou os dois numeros
   Demo/RE7 conhecidos por finais `9614` e `6787`. Preflight read-only PASS:
   producao health/db ok, Demo ACTIVE/business, `campaigns=true`,
   `templates=true`, Meta config presente, Web Session conectada, template
   `data_exame` ainda `approved`, migrations 58 up to date. Ambos os
   destinatarios estao fora de 24h por ultimo inbound em 2026-09-10, sem
   opt-out ativo encontrado, dedupe reduz `6787` a um alvo final apesar de
   historico duplicado de provider. Preview: 2 mensagens META_CLOUD; custo BRL
   pausado para reconciliacao de unidade. REAL SEND = NO; parar no owner
   real-send hard gate ate aprovacao explicita deste envio exato apos preview
   final e unidade de billing validada.
   Phase C controlled send, 2026-09-15: OWNER AUTHORIZED / PARTIAL REAL META
   ACCEPTANCE / PRODUCT ISSUE FOUND / STOP. Campanha
   `d9874c03-10e8-4061-a92e-6caa7b3001c3` criada no Demo. Meta Cloud aceitou 1
   template `data_exame` para `****9614`, mas o runner falhou imediatamente com
   `default_operational_department_missing` antes de persistir OutboundMessage,
   ledger e report; `****6787` nao foi enviado. Resultado real: accepted=1,
   delivered webhook recuperado=1, read=0 observado, ledger local billable=0,
   total local evidenciado R$ 0,00. Testes locais de
   billing/idempotencia/lifecycle 10/10 PASS, mas sao evidencia de teste.
   Proibido retry sem owner repair gate.

RECENTLY CLOSED:

- CRA active flow tenant visibility: CLOSED / DEPLOYED / CUSTOMER VALIDATED.
   Real CRA ADMIN Eduardo reproduced the original absence and later confirmed
   after the production fix that the active CRA flow is visible in tenant-side
   `/app/chatbot` and can be opened from `Fluxos cadastrados`. Root cause
   history preserved: the flow always existed correctly in DB/runtime/admin API,
   `/agent-api/app/chatbot/flows` returned it, but
   `/agent-api/app/chatbot/settings` returned 404 because app settings still
   depended on legacy `.data/tenants.json` for a DB-backed `Client`; coupled
   `Promise.all()` hydration then prevented the successful flows response from
   reaching UI state. Runtime commit `363ce3ab` made `/app/chatbot/settings`
   DB-backed and split flows/settings/resources hydration. Flow
   `cmtkhhxtq002p4spns3fp0yux` / `CRA-PR - Atendimento Institucional` was not
   recreated, cloned, regenerated, reactivated or rewritten; production
   definition hash stayed
   `d7026abdbcfd00e05cb6b9121bfad1f63fab7a9506e2b88e8f8d5b701ad7bac4`.
   Validation levels: LOCAL OWNER PASS, SERVER-SIDE PRODUCTION PASS, CUSTOMER
   CRA ADMIN PASS. Detailed record:
   `docs/saas/CRA_ACTIVE_FLOW_VISIBILITY_AUDIT_2026-09-15.md`.
- User deactivation active-conversation guard: CLOSED / DEPLOYED / OWNER
   APPROVED / PRODUCTION NON-DESTRUCTIVE VALIDATED. Entrega em producao em
   `c40c44dc205b2324a9197322334141c5e7f079f0`, apos backup PostgreSQL
   persistente
   `/opt/re7online/site-re7online/apps/whatsapp-agent/backups/postgres/20260914-175614.dump`
   (`19734685` bytes, 578 objetos, sha256
   `07de59fb2a7d30e05170a57ac50e713627d6655ffcd351716d9c92e2c8a97592`).
   Predicado canonico: mesmo tenant, `ConversationRuntimeState.assignedUserId`
   do usuario, `closedAt=null`, `status IN (WAITING, IN_PROGRESS)` e `mode`
   ausente ou diferente de `BOT`. `WAITING` sem atribuicao, `CLOSED`, outro
   tenant e BOT nao bloqueiam. A desativacao nao fecha, transfere, remove
   atribuicao, troca fila ou altera lifecycle de conversa silenciosamente;
   retorna `user_has_active_conversations` com mensagem acionavel. Backend guard
   aplicado em `/app/users/:id` e `/admin/users/:id`; UI tenant-side mostra a
   mensagem especifica e mantem estado persistido ativo em rejeicao. Validacao
   local: regressao backend focada 1/1 PASS, contrato frontend 7/7 PASS, builds
   backend/frontend PASS, `git diff --check` PASS, schema unchanged, migration
   none. Suite completa `campaignsFeatureRoutes` ficou 109/110 PASS com timeout
   pre-existente e nao relacionado, mantido em WATCH. Deploy FF-only recarregou
   apenas `re7-whatsapp-agent` e `re7-admin-front`; `re7-whatsapp-web-worker`
   preservado. Smoke producao: health ok/db ok, `/app/users` 200,
   `/app/settings/users` 200, API `/app/users` sem auth 401, guard presente no
   codigo em producao e tenants `demo-converta`, `cra-pr`, `secult-pe` e
   `syer-rodrigues` ACTIVE em consulta somente leitura.
- Users Management 2.0: CLOSED / DEPLOYED / OWNER APPROVED / PRODUCTION
   NON-DESTRUCTIVE VALIDATED. Inactive user disappearing
   root cause: `GET /app/users` filtrava `User.isActive=true` no backend,
   enquanto a UI ja possuia filtro de status e serializer preservava
   `isActive=false`. Ajuste local inclui inativos no modo Todos, filtros
   `Todos/Ativos/Inativos`, linhas expansivas em `/app/users`, contador
   `activeUsers/maxActiveAppUsers` usando o mesmo resolver/enforcement do
   backend e micro-ajustes finais de owner: filtro com regiao visual distinta,
   botao explicito expandir/recolher, hierarquia tonal header/body e botao
   Salvar preenchido. Contrato de draft: expandir inicializa do estado
   persistido; recolher, trocar linha ou alterar filtros descarta alteracoes
   nao salvas; filtros, contador e disponibilidade de assentos derivam somente
   de `users` persistido, nunca de `userDrafts`. Test gate local: frontend
   focado PASS, backend focado PASS, builds PASS, schema unchanged, migration
   none. Entrega em producao aplicada em 2026-09-14 no commit
   `5ad40c10eda77076bc2a069e432663ac2271f0a8`; smoke pos-deploy confirmou
   health, rotas `/app/users` e `/app/settings/users`, backend online e dados
   reais com usuarios inativos por tenant sem mutacao.
- Departments Management UX 2.0: CLOSED / DEPLOYED / OWNER APPROVED /
   PRODUCTION NON-DESTRUCTIVE VALIDATED.
   Aplicacao local em `/app/settings/departments` reaproveita o padrao visual
   aprovado em Users Management 2.0 e Guided Builder: linhas recolhiveis, botao
   circular explicito expandir/recolher, um setor aberto por vez, header com
   resumo persistido e corpo expandido em tom subordinado para edicao. Contrato
   de draft: expandir inicializa a partir de `departments` persistido; recolher,
   trocar linha ou alterar filtros descarta alteracoes nao salvas; resumo/filtro
   nao deriva de draft local. Sem alteracao de rota, fila, horario, RBAC,
   autoassign, capacidade, presenca, Inbox visibility, schema ou migracao.
   Refinamento aprovado tambem fixa a coluna direita dos controles expansivos
   em Users Management 2.0 e Departments Management UX 2.0 com
   `grid-cols-[minmax(0,1fr)_auto]`, impedindo que conteudo quebrado empurre o
   botao circular para uma segunda linha. Entrega em producao aplicada em
   2026-09-14 no commit `5c051f83df6bc99aa998985ba93301e601e502df`; smoke
   pos-deploy confirmou health, `/app/users`, `/app/settings/departments`,
   estrutura right-anchor em producao e tenants demo-converta, cra-pr,
   secult-pe e syer-rodrigues ACTIVE sem mutacao.

ACTIVE P2:

1. Question conditional branching: PRODUCT GAP / OPEN. Runtime atual suporta
   captura sequencial (`capture.next`) e o Guided limita ate 3 perguntas
   consecutivas; nao ha predicados por valor capturado, sim/nao ou fallback por
   resposta livre. Nao e bug do Guided Builder.
2. Reporting context enhancements: ENHANCEMENT / OPEN. Adicionar contexto AUTO
   vs MANUAL, policy, `presenceMode`, carga/capacidade atual e filtros
   ativo/inativo onde fizer sentido, sem reabrir bugs de verdade de relatorio ja
   fechados.
3. Guided Builder final review summary: UX BACKLOG / OPEN. A etapa "Revisar
   antes de aplicar" hoje mostra resumo parcial orientado ao caminho humano mais
   relevante quando existe handoff. O backlog e evoluir para resumo completo por
   opcao/submenu/caminho, sem alterar runtime ou `ChatbotFlow.definition` ate
   haver contrato de UX aprovado.
4. Meta Cloud unlink/removal cleanup semantics: PRODUCT/OPS GAP / OPEN.
   Consolidar semantica de disconnect/unlink, limpeza de token, associacoes
   phone/WABA, estado de coexistencia, remocao de canal por tenant e fallback
   seguro.
5. Meta pricing source of truth / FinOps hardening: P2 / GENERIC PRODUCT
   BACKLOG. Futuro escopo: rate cards Meta versionados, resolver por
   pais/categoria, datas de vigencia, ingestao de fonte oficial, snapshots
   historicos de custo provedor, politica FX, separacao custo Meta vs preco
   cliente e deteccao de staleness. Nao e frente bloqueadora ampla da aderencia
   CRA agora. Para a campanha Demo controlada, a prova estreita ja obtida e:
   Brazil Utility, BRL, efetivo em 2026-07-01, tier 0-250.000, rate oficial
   R$ 0,0350 por mensagem entregue via endpoint oficial WhatsApp Business
   Platform Pricing. Recipient B Demo foi enviado e entregue em 2026-09-16;
   FinOps generico continua P2. Doc canonico:
   `docs/saas/META_PRICING_SOURCE_OF_TRUTH.md`.
6. Internal support access hardening: P2 / WATCH-HARDENING. Mecanismo existe;
   manter evolucao em auditoria, expiracao, evidencias e menor privilegio.
7. Chatbot Flow `isActive` vs `entryPoint` semantics: WORKING AS DESIGNED /
   P2 DOMAIN HARDENING. Auditoria de 2026-09-15 atualizada: `entryPoint` e o
   seletor padrao de novas conversas (`clientId + isActive=true +
   entryPoint=true`), enquanto `isActive` e o gate de execucao por id explicito
   e continuidade de runtime. Active non-entrypoint nao e redundante: Support
   Hub e destino automatizado de retorno de campanha executam por flow id
   explicito, exigem `isActive=true` e nao exigem `entryPoint=true`. Modelo
   atualizado: MULTI-ACTIVE RUNTIME COM UM ENTRYPOINT PADRAO. Gaps P2:
   clarificar UX normal de Active vs Principal; invariantes
   `entryPoint=>isActive`, um entrypoint por tenant e corrida de troca de
   principal sao application-only ou ausentes no DB. Registro:
   `docs/saas/CHATBOT_FLOW_ACTIVE_ENTRYPOINT_SEMANTICS_AUDIT_2026-09-15.md`.
8. CAMPAIGN RETURN FLOW DEACTIVATED AFTER SEND: P2 LIFECYCLE DECISION / OPEN.
   Auditoria local: runtime explicito tenta carregar `{ id, clientId,
   isActive=true }`; se o flow selecionado da campanha for desativado apos o
   envio e antes da resposta, o loader atual nao continua esse flow e cai no
   seletor de entryPoint. Nenhum fallback novo foi implementado neste patch.
9. Abandoned automation / BOT flow lifecycle: P2 RESIDUAL HARDENING. O
   comportamento existente ja foi validado: `resetAfterMinutes` reinicia
   menu/submenu/captura no proximo inbound sem HUMAN/CLOSED, e
   `timeoutMinutes/action=HANDOFF` promove uma vez para HUMAN/WAITING com
   department/queue concretos, protocolo e posicao na fila quando o destino e
   valido. Residuais: limpeza/copy de `flowContext`, UX de timeout e paridade
   cross-provider do hardening, sem auto-close HUMAN.
10. Guided Builder - BOT inactivity policy UX: P2 / UX + PRODUCT CLARIFICATION /
   OPEN. Futuro Guided deve explicar em linguagem de negocio duas politicas
   independentes: por quanto tempo a pessoa pode voltar e reiniciar a
   automacao no proximo retorno (`resetAfterMinutes`) e se abandono de
   automacao deve gerar handoff humano automatico
   (`inactivityPolicy.timeoutMinutes` + `action=HANDOFF`).
   Antes de implementar, auditar valores/defaults reais em producao e exigir
   que owner veja valores atuais, entenda consequencias, escolha duracao
   conscientemente e veja resumo no review. Nao criar nem reabrir
   `WAITING_FOR_CUSTOMER 60m`; HUMAN auto-close permanece NOT REQUIRED.

P3:

- polish de nome social/display name;
- acao rapida de retificacao;
- melhorias menores de UX/filtros que nao bloqueiam contrato.

WATCH only:

- Inbox performance residual e CPU;
- `last_message_lookup` residual;
- SECULT fairness e round-robin cursor;
- SECULT Web Session non-content suppression organic validation;
- scale/load validation em janelas representativas;
- Syer Dashboard transient error / refresh loop: BUG NOT PROVEN / WATCH. Owner
  observou `/app/dashboard` lento, toast vermelho breve e recuperacao posterior
  em tenant com pouco dado; auditoria anterior nao provou endpoint falho, refresh
  loop, relacao com `/app/conversations` ou regressao de CPU. So promover a frente
  com reproducao ou evidencia nova.
- billing/ledger Meta como conciliacao futura.

Proximas quatro frentes:

1. P2 Guided Builder - BOT inactivity policy UX. Why now: o runtime ja suporta
   `resetAfterMinutes` e handoff automatico por `inactivityPolicy`, mas a
   configuracao guiada precisa expor isso em linguagem operacional clara e
   separar reset de retorno vs handoff por abandono. Dependencia: auditar
   valores/defaults reais antes de propor UI. Code esperado: sim, futuro.
   Risco: medio por semantica de lifecycle. Done: owner ve valores atuais,
   escolhe duracao conscientemente e review resume o comportamento.
2. P2 Abandoned automation / BOT flow lifecycle hardening. Why now: cidadao pode iniciar
   menu/pergunta/captura e abandonar antes de concluir. Valor: endurece reset,
   expiracao e UX de automacao incompleta sem afetar HUMAN. Dependencia:
   validar comportamento atual de `resetAfterMinutes` e
   `timeoutMinutes/action=HANDOFF` em E2E local. Demo validavel: sim. Code
   esperado: talvez, reaproveitando executor/processador existente. Config
   esperado: flow-level primeiro. Risco: medio por lifecycle. Done: abandono de
   menu/captura/submenu, inbound tardio, restart e tenant isolation testados.
3. P2 Question conditional branching. Why now: lacuna descoberta durante 2.4 e
   valor direto para fluxos institucionais. Valor: respostas sim/nao e caminhos
   por resposta. Dependencia: desenho de runtime/predicados. Demo validavel:
   sim. Code esperado: sim. Config esperado: nao. Risco: medio/alto. Done:
   predicates testados sem quebrar fluxos existentes.
4. P2 Reporting context enhancements. Why now: transforma validacoes de fila em
   evidencia operacional sem mexer no core de atribuicao. Valor: auditoria para
   supervisao/contratos. Dependencia: definir campos e filtros. Demo validavel:
   sim. Code esperado: sim. Config esperado: nao. Risco: medio. Done:
   relatorios mostram contexto sem distorcer historico.

Reconciliation note: CRA business hours remain CONFIGURED / OPERATIONALLY
VALIDATED and are not an implementation-pending front.

---

## RISCOS E PENDÊNCIAS ATUAIS — 2026-05-03

### Atualizacao operacional consolidada — 2026-09-01

Estado fechado/validado:

- hybrid exactly-once: CLOSED / REAL VALIDATED;
- Meta template routing in configured modes: CLOSED / REAL VALIDATED;
- HYBRID template outbound: CLOSED / REAL VALIDATED;
- Meta-to-Web echo safety: CLOSED / REAL VALIDATED;
- HYBRID inbound dedupe after Meta template reply: CLOSED / REAL VALIDATED;
- HYBRID claim-before-downstream recovery: HARDENED / REAL VALIDATED;
- HYBRID full fresh-flow E2E: CLOSED / REAL VALIDATED;
- exactly-once coexistence path exercised: CLOSED / REAL VALIDATED;
- post-reply freeform routing in HYBRID/AUTO: CLOSED / REAL VALIDATED;
- multichannel Lead identity reconciliation / P2002: CLOSED / REAL VALIDATED;
- Meta usage accounting for template vs Web Session freeform: CLOSED / REAL VALIDATED;
- flow/runtime coherence: CLOSED / REAL VALIDATED;
- closed HUMAN reentry: CLOSED / REAL VALIDATED;
- SECULT CompletedServiceSnapshot: CLOSED / REAL ORGANIC VALIDATED;
- SECULT current-state report truth: CLOSED / REAL VALIDATED;
- Maria capacity diagnosis: CLOSED / CORRECT PRODUCT BEHAVIOR;
- SECULT completed-service reporting: CLOSED / PRODUCTION VALIDATED;
- Inbox Timeline Phase 1: CLOSED / PRODUCTION VALIDATED;
- Inbox Phase 2 WebSocket-driven invalidation: CLOSED / PRODUCTION VALIDATED;
- multichannel reconciliation migration: CLOSED / PRODUCTION VALIDATED;
- Web Session wrapped media normalization: CLOSED / SAFE NORMALIZATION PATCH;
- SECULT Web Session non-content control event suppression: DEPLOYED / TESTED in
  `c308198a`; organic validation pending;
- SECULT auto-assignment incident 2026-08-31: AUDITED / BUG NOT CONFIRMED; UX clarification deployed in `c91671e9`;
- SECULT `presenceMode=AVAILABLE`: REAL VALIDATED on 2026-09-10; after
  activation on 2026-09-09 11:38:31 -03, 30 organic auto-assignments selected
  11 distinct agents, Maria Helena received one automatic assignment after
  becoming available below capacity, `no_eligible=0`, and stale heartbeat alone
  produced zero exclusions. Fairness and round-robin cursor remain WATCH, not
  proven algorithm defects.
- SECULT Inbox/CPU correlation: CLOSED FOR PHASE 2 DECISION / CPU IMPROVED /
  WATCH;
- Backend CPU residual load watch after hybrid claim recovery deploy: IMPROVED /
  WATCH.
  Samples on 2026-09-10 held near 67-69% and later near 60-61% CPU with health
  PASS, memory stable around 230-278 MB, DB pressure NORMAL, SECULT real traffic
  active, `runtime_state_fallback=0`, `multichannel.dual_read=0`, and no
  retry/reconnect/error loop evidence. Current residual hotspot remains
  `/app/conversations` list reads: 21 req/min produced 246
  `inbox.list.query_count`/min, approximately 11.7 queries/request.
- `/app/conversations` fixed-cost lookup optimization: REAL VALIDATED. The
  route is already mostly batched and did not show
  current runtime-state N+1 in production (`runtime_state_fallback=0`). A small
  backend patch now reuses the `Client.features/profile` already loaded by
  request auth, removing one duplicate `client.findUnique(features/profile)` DB
  read per app Inbox list request. Comparable 2026-09-10 measurement after
  `1aae26b5` showed ~10.7 queries/request under real SECULT Inbox polling, with
  `tenant_features` effectively zero-cost in the app list path. No global cache,
  current-state cache or response cache was introduced.
- `/app/conversations` channel state batch hotspot: REAL VALIDATED / IMPROVED.
  Production audit on 2026-09-10 showed no external
  provider call and no per-row query fan-out in `channel_state_batch`, but
  SECULT's 251 Web Session identities caused the switch-warning lookup to
  materialize about 10.3k historical outbound rows per refresh. The selected
  patch keeps the same tenant-scoped provider truth and query count, but fetches
  only the latest outbound row per identity with bounded SQL result sets.
  Comparable post-deploy measurement showed SECULT `channel_state_batch`
  interval avg ~189ms and cumulative p95 ~692ms, down from the previous
  ~445-615ms avg / ~782-1411ms p95 observed baselines. No global cache, stale
  channel-state cache, schema change or migration was added.
- `/app/conversations` bounded outbound preview lookup experiment: REVERTED /
  REAL PERFORMANCE REGRESSION. The `94882d76` patch was semantically correct, but production
  evidence on 2026-09-10 showed a PostgreSQL plan regression for SECULT:
  `JOIN LATERAL` executed a per-identity plan with sequential scans and estimated
  cost around 150k versus around 1.6k for the previous broad outbound lookup.
  Comparable 5-minute window showed `last_message_lookup` around 5.9s average
  and `/app/conversations` around 5.8s average, while the pre-change comparable
  baseline was about 275ms for `last_message_lookup`. Runtime was rolled back by
  `4bc8befd`; keep the semantic oracle and plan evidence for a future design.
- Browser Push / PWA notifications: CLOSED / REAL VALIDATED;
- true foreground Web Push detection: CLOSED / REAL VALIDATED in `670f392d`;
- hidden desktop local sound: CLOSED / REAL VALIDATED in `c50fb73c`;
- supervisor team presence panel: DEPLOYED / VISUAL SMOKE PENDING;
- deploy impact matrix hardening: CLOSED / SCRIPT + DEPLOY INTEGRATION + RUNBOOK;
- closed-conversation access hardening: CLOSED / PRODUCTION VALIDATED in
  `93cd0e06`;
- CLOSED claim invariant: CLOSED / PRODUCTION VALIDATED;
- Inbox close action observability: IMPLEMENTED / VALIDATED FOR ROOT-CAUSE
  FORENSICS;
- Inbox close terminal lifecycle: FIXED / DEPLOYED in `f62f1288`;
- Web Session operational disconnect alert delivery: FIXED / DEPLOYED in
  `b31fd976`; SMTP port `2465` now uses TLS, retryable transport failures have
  bounded retry, and delivered alerts still dedupe by incident fingerprint;
- Canonical mail transport cleanup: CLOSED / IMPLEMENTED. Password reset,
  first-access invitations, Web Session disconnect alerts, template-review
  alerts and PostgreSQL backup alerts now share one canonical mail provider and
  config resolver. Business callers still own recipients, content, dedupe and
  retry policy.
- CRA Demo V1: READY FOR CUSTOMER VALIDATION.
- CRA-PR real HYBRID operational validation: CLOSED / PASS;
- CRA-PR approved flow -> consent -> menu -> handoff: CLOSED / PASS;
- CRA-PR human Inbox + human outbound/inbound + normal close: CLOSED / PASS;
- CRA-PR `CompletedServiceSnapshot`: CLOSED / exactly 1 snapshot in validation;
- CRA-PR CSAT score/responded and optional comment in same response: CLOSED / PASS;
- CRA-PR Browser Push background: CLOSED / REAL VALIDATED;
- CRA-PR ready for training 2026-09-09: YES.
- Guided Builder 2.1 business-first: DEPLOYED / LOCAL + PRODUCTION READ-ONLY
  VALIDATED;
- Guided Builder second-flow stale JSON incident: CLOSED / REAL VALIDATED;
- Guided Builder new-flow entrypoint safety: FIXED. Creating a new chatbot
  flow must not replace the tenant entrypoint unless the operator explicitly
  marks it as the main entry flow.

Fila ativa historica substituida pela "Auditoria canonica de backlog —
2026-09-13" acima. Nao usar listas antigas como fila corrente quando houver
conflito.

WATCH only:

- Inbox performance residual: IMPROVED / WATCH. `48c206fa` e `1aae26b5` estao
  REAL VALIDATED; `94882d76` foi REVERTED por regressao real de plano e
  `4bc8befd` esta DEPLOYED. Proxima acao e apenas medicao em futura janela
  SECULT representativa, nao novo patch.
- CPU residual: WATCH. Nao ha evidencia atual de dual-read, runtime fallback,
  reconnect loop, retry hibrido ou pressao de DB.
- `last_message_lookup`: KNOWN RESIDUAL HOTSPOT / NO ACTIVE PATCH. Nao retornar
  ao desenho lateral per-identity sem indice/plano comprovado.
- SECULT fairness/round-robin cursor: WATCH. `presenceMode=AVAILABLE` ja tem
  comportamento funcional validado.
- SECULT Web Session non-content suppression: DEPLOYED / TESTED / WATCH.
  Validacao organica permanece observacao passiva; nao reabrir frente ativa sem
  nova evidencia representativa de bolhas `Mensagem nao suportada`.

Dividas tecnicas abertas:

- `multichannel.shadow_write.failed` / `missing_channel_account_id`: preexistente, non-strict, sem retry loop, associado a projection/data-quality gap de Web Session, non-blocking;
- drift historico global Prisma schema/migrations: separado da migration de reconciliacao multichannel ja validada;
- SECULT Web Session `UNKNOWN` media historical rows: no backfill; exact original subtype is
  not recoverable from the sanitized persisted payload;
- SECULT closed-conversation RBAC incident 2026-09-09: fixed generically. AGENT
  users no longer list or directly access `CLOSED` conversations; SUPERVISOR and
  ADMIN historical access is preserved. Claim/assume against `CLOSED`
  conversations is rejected with `conversation_closed` before assignment capacity
  checks.
- SECULT Inbox close terminal telemetry incident 2026-09-09: fixed generically.
  `close.requested` is followed by an awaited terminal client event,
  `close.succeeded` or `close.failed`, before post-close UI reconciliation can
  clear selection or remove the row. Backend close semantics, CSAT, protocol
  closure and snapshots remain unchanged.
- Demo Web Session recovery: CLOSED / REAL VALIDATED after controlled reconnect.
  Inbound, outbound, close, CSAT and post-send stability passed without
  401/conflict recurrence.
- CRA/SECULT business hours audit, 2026-09-14: CLOSED / DOCS-ONLY. Canonical
  HEAD and production HEAD match `56c4a392d1eb017ad8fcafffbad5fbd442e7152f`.
  The core runtime already resolves `DepartmentBusinessHour` /
  `DepartmentBusinessHourException` by department with tenant timezone fallback.
  SECULT keeps the approved contract: departments have Mon-Fri 08:00-17:00
  `America/Recife` hours, resolve `OPEN` at 12:00 BRT and `CLOSED` at 20:00
  BRT, and `QUEUE_FOR_NEXT_OPEN` queues closed handoff without autoassign. CRA
  has no department hours configured, so every audited department resolves
  `NO_SCHEDULE` both inside and outside the copied 09:00-17:00 text. This is a
  configuration/operational validation item, not a runtime P1. Detailed record:
  `docs/saas/CRA_SECULT_BUSINESS_HOURS_AUDIT_2026-09-14.md`.
- CRA business hours operational configuration, 2026-09-15: CLOSED /
  PRODUCTION CONFIG VALIDATED. Backup
  `/opt/re7online/backups/converta-persistent/postgres/pre-cra-business-hours-20260915-001956.dump`
  captured before mutation (`19737083` bytes, SHA-256
  `1a0fa2daff91f5c290b7308782d10e274142be7a9a4833bea5b5a9315a6568ae`,
  578 objects). `cra-pr` timezone set to `America/Sao_Paulo`; all 6 active
  departments configured Mon-Fri 09:00-17:00 with weekends closed and zero
  exceptions; each preserves one concrete `Fila Geral` queue.
  `closedHandoffPolicy.action=QUEUE_FOR_NEXT_OPEN` preserved. Resolver
  validation passed for all departments at Monday 10:00/16:59 `OPEN`,
  Monday 17:00/17:01/20:00 `CLOSED`, and Saturday 10:00 `CLOSED`.
  Flow-aware validation passed on Cobrança and Fiscalização. SECULT timezone,
  08:00-17:00 schedules, policy and resolver status were read-only verified
  unchanged. No code, schema, migration, PM2 reload or deploy.
- baselines CRA versionados nesta consolidacao como evidencia de validacao, nao como dump operacional:
  - `docs/bids/2026/cra-pr/CRA_PR_DEMO_FLOW_V1_CUSTOMER_VALIDATION_BASELINE.md`;
  - `docs/bids/2026/cra-pr/cra-pr-demo-flow-v1-customer-validation.definition.json`.
- CRA department hours: CLOSED / PRODUCTION CONFIG VALIDATED. Under the current
  domain rule, any future department without schedule would still resolve
  `NO_SCHEDULE` / open, but the six active CRA departments now have
  `America/Sao_Paulo` Mon-Fri 09:00-17:00 configured and validated;
- billing measurement items ainda abertos: ciclo receptivo logico, template Utility fora de 24h entregue, ledger Meta apos 2026-10-01 e relatorio contratual mensal.
- alteracoes externas de `.env`/segredos continuam como procedimento
  operacional separado; a matriz de deploy cobre impacto derivado de diff Git.

### Guided Builder — reconciliacao do patch local

Em 2026-09-10 o patch local antigo/quarentenado de Guided Builder foi portado
limpamente para worktree isolado baseado no HEAD canonico `fec3a489`, sem tocar
o worktree principal e sem misturar com o hardening de producao:

- `src/components/app/ChatbotFlowBuilder.tsx`;
- `src/components/app/ChatbotFlowBuilder.test.ts`;
- `src/app/app/chatbot/page.tsx`;
- `src/app/admin/tenants/[tenantId]/chatbot/page.tsx`.

Estado reconciliado:

- STRATEGY: clean isolated worktree from current canonical HEAD + explicit port
  of only Guided Builder files.
- SOURCE OF TRUTH: same `ChatbotFlow.definition`; Guided and Advanced modes
  mutate/read the same draft JSON through `onDefinitionTextChange`.
- SHADOW MODEL: no wizard/planning schema persisted in the flow definition.
- SUPPORTED OBJECTIVES: direct human handoff, menu, consent, capture, text and
  custom/advanced.
- NEXT TASK: detects missing start, missing menu option, missing option
  destination, missing handoff destination, invalid queue/department pairing,
  consent destination, capture field/next, broken references and orphan nodes.
- TRANSFORMATIONS: deterministic node creation for menu/text/capture/consent/
  handoff; existing orphan content is preserved for review instead of silently
  deleted.
- EXISTING FLOWS: Syer-style direct handoff and CRA-style complex consent/menu
  flows load without objective reset and preserve advanced metadata.
- VALIDATION: `ChatbotFlowBuilder.test.ts` 22/22 PASS; frontend build PASS;
  `git diff --check` PASS.

Smoke local de 2026-09-10:

- temporary non-versioned harness rendered the real `ChatbotFlowBuilder`
  component in desktop, tablet and mobile;
- new flow entry experience, supported objective cards, next-task panel,
  journey preview and checklist rendered coherently;
- Syer-style direct handoff fixture loaded without reset/destructive rewrite;
- CRA-style consent/menu/handoff fixture loaded without corruption and kept
  Advanced mode as the escape hatch for complex structures;
- responsive layout did not show horizontal overflow or clipped controls in the
  captured viewports;
- authenticated route smoke was completed in an isolated local worktree with an
  ephemeral Postgres database, 58 migrations applied, supported `demo:seed`, a
  real `/auth/login` app session and the local admin token;
- `/app/chatbot` loaded inside the real App shell with tenant context, existing
  flow list, create-flow entry and no alert/loading gate;
- `/admin/tenants/demo-prefeitura/chatbot` loaded inside the real Admin shell
  with tenant context, save controls and no login gate;
- existing flow expand/edit exercised Guided and Advanced modes against the same
  draft JSON;
- Advanced -> Guided reflected a JSON text edit immediately in the guided
  summary, fields and preview;
- Guided -> Advanced reflected a guided destination change in the advanced JSON;
- explicit save persisted to the local ephemeral database and survived route
  reload;
- desktop, tablet, mobile, dark/light theme and keyboard focus smoke passed
  without horizontal overflow.

Status: REAL VALIDATED in local authenticated route smoke and deployed by the
frontend-only production rollout ending at `9b5bdb34`. No production tenant flow
mutation was performed by this validation.

### Guided Builder 2.1 — business-first flow creator

Em 2026-09-11 o redesign local do Guided Builder foi reorientado para o modelo
aprovado pelo owner: em vez de mostrar um painel tecnico com passos detectados,
o editor novo comeca perguntando qual fluxo de negocio sera criado, faz poucas
perguntas por vez, gera uma definicao real de `ChatbotFlow.definition`, mostra
preview/checklist e aplica o resultado ao rascunho somente por acao explicita.

Estado atual:

- STATUS: GUIDED BUILDER 2.1 / LOCAL IMPLEMENTED / HUMAN VALIDATION ROUND 2.
- WORKTREE: isolado em `/tmp/re7-guided-wizard`, baseado no HEAD canonico
  `06256cc2`.
- SCOPE: frontend/editor somente.
- SOURCE OF TRUTH: preservado em `ChatbotFlow.definition`.
- SEMANTICA: sem alteracao de runtime, parsing, transitions, handoff, save
  payload, schema ou migration.
- UX: novo fluxo abre em modelos de negocio: atendimento institucional com
  menu, encaminhamento direto, coleta antes do atendimento, mensagem
  informativa ou modo avancado.
- WIZARD: cada modelo usa perguntas curtas sobre mensagem inicial,
  consentimento, opcoes, destinos, validacao de entrada, horario futuro,
  mensagem de handoff e preview.
- SUBMENUS: o modelo institucional agora representa um subconjunto CRA-like com
  menus aninhados gerados como nodes reais `type=menu`, sem node type novo.
- NAVIGATION: submenus podem expor `9 - Voltar ao Menu Anterior` e
  `0 - Voltar ao Menu Principal`, seguindo a convencao ja observada nos fluxos
  CRA. O menu principal nao recebe retorno redundante.
- HOURS: o wizard explica que o autoatendimento pode continuar funcionando e
  que horario humano pertence ao cadastro de departamentos; sem horario salvo,
  a regra de dominio atual permanece `NO_SCHEDULE`/aberto.
- APPLY DRAFT: "Aplicar ao rascunho" atualiza apenas o JSON local e mostra
  feedback explicito de sucesso, erro ou "nenhuma alteracao"; salvar continua
  sendo acao separada da pagina.
- EXISTING FLOW EDIT: fluxos existentes exibem landing separada com Revisar
  jornada, Editar etapas simples e Abrir modo avancado. A edicao simples mostra
  hierarquia de menus/submenus, permitindo abrir opcoes como Registro sem
  expor a arvore inteira ou misturar com criacao.
- MODE STATE: Assistente guiado e Modo avancado agora comunicam estado exclusivo
  e finalidade; "Abrir modo avancado" deixou de parecer selecionado dentro da
  landing de fluxo existente.
- RESET: apos criacao bem-sucedida de novo fluxo em `/app` ou `/admin`, o
  rascunho transiente volta ao estado inicial.
- OUTPUT: os geradores criam nodes reais (`menu`, `text`, `capture`,
  `consent`, `handoff`) sem persistir metadata de wizard ou shadow model.
- EXISTING FLOWS: abrir fluxo existente mostra resumo seguro e acoes explicitas
  de revisar jornada, editar informacoes simples ou abrir modo avancado; nao
  executa reset, reclassificacao destrutiva ou mutation automatica.
- MARKET PATTERN: alinhado ao padrao observado em builders atuais de mercado:
  selecao de template/use case, perguntas progressivas, preview antes de
  publicar, fallback para editor visual/avancado e protecao contra alterar
  automacoes existentes sem confirmacao.
- VALIDACAO TECNICA LOCAL: `ChatbotFlowBuilder.test.ts` 32/32 PASS; frontend
  build PASS; `git diff --check` PASS.
- STATUS: DEPLOYED / PRODUCTION READ-ONLY VALIDATED. Criacoes reais de teste
  no tenant Syer foram usadas apenas para validar a sequencia de criacao; o
  fluxo ativo real foi preservado.

### Guided Builder 2.1 — segundo fluxo com JSON invalido

Em 2026-09-11 foi auditado o incidente P1 em que a criacao de um segundo fluxo
guiado para o tenant real Syer Rodrigues terminava com a mensagem
`JSON invalido` antes de chegar ao backend.

Conclusao:

- ROOT CAUSE: estado transiente do builder de novo fluxo permanecia montado apos
  uma criacao bem-sucedida; o parent limpava o texto do novo fluxo, mas a
  sessao interna do wizard podia carregar dados mutaveis da criacao anterior.
- ESCOPO: bug de estado client-side no editor guiado; nao houve evidencia de
  problema de backend, schema, migration ou configuracao especifica da Syer.
- SYER REAL: auditado em read-only. O fluxo real existente permaneceu
  inalterado.
- FIX: o wizard passou a criar defaults frescos por sessao e o builder de novo
  fluxo em `/app` e `/admin` e remontado apos criacao bem-sucedida.
- VALIDACAO LOCAL: fixture Syer-like comprovou primeira, segunda e terceira
  criacoes sequenciais com JSON serializavel/parseavel e destinos validos.

Validacao real: em 2026-09-11, na producao `96220ea4`, a UI admin do tenant
`syer-rodrigues` criou dois fluxos guiados de teste inativos em sequencia, sem
`JSON invalido` e sem estado stale. A abertura de um terceiro novo fluxo
iniciou limpa, sem salvar. O fluxo ativo real manteve o mesmo hash de
definition.

Status: REAL VALIDATED / CLOSED.

### Guided Builder 2.1 — seguranca de entrada principal em novos fluxos

Em 2026-09-11 foi auditado um incidente P1 durante a validacao real da Syer:
um fluxo novo podia herdar `entryPoint=true` no formulario de criacao e
substituir temporariamente o fluxo principal do tenant.

Conclusao:

- ROOT CAUSE: default client-side inseguro nos formularios de novo fluxo de
  `/app/chatbot` e `/admin/tenants/:tenantId/chatbot`. O backend estava
  correto ao tratar `entryPoint=true` como acao explicita de troca.
- ESCOPO: bug generico de UX/seguranca de criacao; sem tenant hardcode, sem
  schema, sem migration e sem alteracao de runtime.
- FIX: novo fluxo passa a iniciar com `entryPoint=false` por default
  compartilhado; apos `create` bem-sucedido, o rascunho tambem reseta para
  `false`.
- CONTRATO: criar fluxo novo nunca troca a entrada principal silenciosamente.
  A troca continua permitida somente por acao explicita do operador/admin.
- VALIDACAO: teste backend cobre create sem `entryPoint`, create com
  `entryPoint=false` e troca explicita posterior por `PUT entryPoint=true`.

Status: FIXED / DEPLOY TARGET. Validacao pos-deploy deve confirmar que o fluxo
principal ativo da Syer permanece preservado.

### Guided Builder 2.2 — baseline recovery apos selecao local divergente

Em 2026-09-11 o resultado local inicial do Guided Builder 2.2 foi invalidado
para validacao de produto. O HEAD de producao estava atual; o problema foi a
selecao local de worktree/bundle/servidor, contaminada por uma linha antiga e
divergente do Guided Builder ja aprovado e publicado. O owner abriu o ambiente
local e viu uma UI anterior, sem os refinamentos aprovados de producao, provando
que aquele ambiente nao era baseline confiavel.

Impacto:

- PRODUCAO: nao afetada; nao houve commit, push ou deploy do resultado
  invalido.
- RESULTADO 2.2 ANTERIOR: INVALID FOR HUMAN PRODUCT VALIDATION.
- CAUSA OPERACIONAL: desenvolvimento/servidor local misturou worktrees e portas;
  `3010`/backend antigo apontavam para `/tmp/re7-guided-wizard`, enquanto uma
  tentativa posterior servia outro bundle em porta diferente.
- REGRA DE PROCESSO: qualquer trabalho de UX deve reproduzir localmente o
  baseline de producao aprovado antes de aplicar novos deltas.

Reconstrucao correta:

- BASE: worktree limpa `/tmp/re7-guided-22-current` criada a partir do HEAD
  canonico de producao `bf5f1d76`.
- BASELINE LOCAL: backend local isolado e frontend em `3022`, `demo:seed` e
  login real `admin@demo-prefeitura.local`; `/app/chatbot` respondeu no bundle
  da base aprovada. Para evitar CORS em desenvolvimento, o frontend deve usar
  `/agent-api` relativo via rewrite local.
- PORT 2.2: aplicado cirurgicamente sobre a base atual, sem copiar arquivos
  inteiros da linha divergente.
- DELTAS PORTADOS: cancelar/excluir opcao do wizard, excluir submenu simples ja
  criado, cancelar submenu em criacao, confirmacao destrutiva antes de remover
  caminhos com filhos, protecao de estruturas compartilhadas/avancadas pelo
  modo avancado, limpeza de submenu aninhado ao trocar destino, botao inferior
  "Voltar ao nivel anterior", tons por nivel de menu, texto unificado
  "Encaminhar para atendimento humano", fluxo Setor -> Fila condicional,
  explicacoes para "Mostrar outra mensagem" e "Fazer uma pergunta", e suporte a
  texto livre/emoji digitado pelo usuario no wizard, preview e JSON gerado.
- VALIDACAO TECNICA: `ChatbotFlowBuilder.test.ts` 37/37 PASS; frontend build
  PASS; `git diff --check` PASS.
- STATUS: GUIDED BUILDER 2.2 / DEPLOYED / PRODUCT OWNER REAL VALIDATION. A
  entrega frontend-only foi publicada em producao no commit `db34d83c`, sem
  alteracao de backend, worker, schema ou migration. O proximo marco e o owner
  concluir os testes reais em producao.

### Guided Builder 2.3 — refinamento de criacao e edicao por opcoes

Em 2026-09-11 o owner aprovou a base 2.2 e registrou feedback de uso real para
reduzir atrito do criador guiado antes de nova publicacao.

Escopo 2.3 aprovado:

- remover as decisoes "Ativo" e "Entrada principal" do cadastro de novo fluxo;
  novos fluxos continuam com `entryPoint=false` e ativacao como acao operacional
  separada;
- no modelo "Atendimento institucional com menu", iniciar pelo consentimento e
  depois seguir para mensagem/opcoes do menu principal;
- substituir copy especifica por texto neutro: "Quais opcoes estarao
  disponiveis no menu?";
- editar opcoes e destinos ja na primeira tela do menu principal, em linhas
  expansivas, uma opcao aberta por vez, com submenu, exclusao e pendencias
  dentro do proprio bloco;
- aplicar o mesmo padrao recursivo para submenus e preservar tons/bordas por
  nivel hierarquico;
- padronizar resultados de acao em toast global visivel independentemente do
  scroll, mantendo validacao de campo inline;
- restaurar foco/scroll para a secao ativa apos voltar nivel, cancelar submenu,
  remover opcao ou aplicar rascunho.

Status:

- GUIDED BUILDER 2.3 / DEPLOYED / OWNER APPROVED LOCAL / PRODUCTION REAL VALIDATION.
- Sem schema, migration, backend, worker ou semantica runtime.
- Owner aprovou a UX final local; validacao real em producao permanece aberta
  ate exercicio humano em tenant real apos deploy.

Nota de recuperacao 2026-09-12:

- A worktree temporaria usada durante a validacao local foi perdida apos reboot
  da maquina; isso confirmou que `/tmp` nao e suficiente como preservacao de
  trabalho do owner.
- A primeira reaplicacao pos-reboot recuperou uma versao antiga e foi descartada
  como referencia funcional.
- Producao nao foi mutada, nao houve commit, push ou deploy da 2.3 durante a
  recuperacao.
- A versao local atual foi reconstruida a partir dos patches da sessao Codex e
  confrontada contra o HEAD canonico de producao/origin antes da continuidade.
- A aprovacao local final do owner foi aplicada sobre worktree limpa baseada no
  HEAD canonico atual antes de commit/push/deploy; qualquer revisao futura deve
  manter backup de diff fora de `/tmp`.
- Ajuste final do owner: ao excluir opcao, submenu/linha aninhada ou registro
  editavel, a UI nao deve abrir automaticamente o proximo irmao. O item e
  removido, irmaos permanecem colapsados, e o foco volta ao contexto pai ou a
  secao atual.
- Entrega final 2.3 e frontend-only: sem mudanca de `ChatbotFlow.definition`,
  sem tenant hardcode, sem migration e sem reload de backend/worker.

### Contact Timeline / Histórico do contato

Status:

- implementado como view derivada, sem tabela nova
- endpoint `/app/conversation/:waId/timeline` em produção
- acesso pelo inbox na coluna CRM

Riscos conhecidos:

- cursor atual usa apenas `createdAt`; em volume alto com muitos registros no mesmo milissegundo, pode haver borda rara de paginação. Evoluir para cursor composto `createdAt + id`.
- timeline agrega `InboundMessage`, `OutboundMessage`, `Event` e `LeadNote` em memória por lote. Está limitado, mas deve ser revisado se tenants tiverem alto volume histórico.
- eventos são exibidos sem `payloadJson` bruto por segurança; caso a operação peça detalhes ricos, criar normalizador por tipo de evento, não expor payload integral.
- `Contact` existe, mas o CRM operacional ainda usa `Lead`. Evitar criar nova entidade ou duplicar histórico até consolidar o modelo pessoa/contato.
- `Contact` não possui `waIdCanonical`; se ele virar entidade principal, avaliar migration específica.
- LGPD: timeline respeita `deletedAt`/`historyVisibleAfter`; manter testes sempre que alterar anonimização, retenção ou reentrada.

Pendências recomendadas:

- adicionar cursor composto `createdAt + id` na timeline.
- criar testes de endpoint para: mensagens, eventos, notas, paginação, escopo por setor e corte LGPD.
- avaliar se histórico deve ter busca por termo em fase futura.
- avaliar tela dedicada de contato apenas após uso real validar necessidade.

### Runtime / Operação

Status:

- producao atual em `STORAGE_MODE=postgres`
- leitura operacional estrita a Postgres para runtime state
- JSON permanece apenas como compatibilidade historica/local quando configurado

Riscos conhecidos:

- manter rotina `state:validate` documentada após alterações em handoff, claim, transfer, release, retenção e reentrada.
- qualquer novo write operacional precisa atualizar Postgres e manter compatibilidade com o fallback JSON enquanto a transição não for encerrada.

Pendências recomendadas:

- definir critério para encerrar escrita JSON ou mantê-la como fallback permanente.
- incluir validação de runtime no checklist de deploy quando houver mudança operacional.

---

## SPRINT 26 — ONBOARDING INTERNO ASSISTIDO

Status:

- implementado (backend + UI)
- não validado com novo tenant real

Classificação:

- item latente (não bloqueante)

Diretriz:

- NÃO priorizar validação neste momento
- retomar apenas quando houver novo cliente real

---

## SPRINT 28 — OBSERVABILIDADE META (COMPLETED)

- status real da Meta integrado na UI de campanhas
- delivered / read / failed visíveis
- billing visível por mensagem
- correção de regressão de status (prioridade)
- consistência UI = banco validada

Impacto:

- elimina ambiguidade operacional
- aumenta confiança do operador
- permite operação profissional com cliente real

---

## SPRINT 29 — ÁREA DO CLIENTE (COMPLETED)

- login por usuário implementado
- auto-scope via token (`clientId`)
- rotas `/app/*` criadas
- inbox operacional com claim/release, status e notas
- campanhas completas com criação, cancelamento e replay
- criação de usuário via UI implementada
- reset de senha via API implementado
- onboarding interno consolidado
- fluxo completo sem script validado
- login e acesso do cliente funcional
- isolamento total por tenant
- isolamento por tenant validado
- uso independente sem admin validado

Impacto:

- sistema passou a ser utilizável pelo cliente final
- elimina dependência do `/admin`
- transforma a plataforma em SaaS real
- elimina dependência técnica no onboarding
- permite criação de clientes em minutos
- habilita operação com múltiplos tenants
- sistema passa a ser operacional em escala inicial

---

## PRÓXIMAS ETAPAS (ORDEM ESTRATÉGICA)

---

### 1. Uso real com clientes

- execução de campanhas
- operação assistida
- coleta de feedback real

---

### 2. Ajustes baseados em uso

- melhorias de UX
- redução de fricção operacional
- correções pontuais

---

### 3. Evolução incremental do produto

- filtros avançados
- melhorias de interface
- ajustes de fluxo

---

## FUTURO (NÃO PRIORITÁRIO)

- onboarding self-service para cliente
- fila persistente (Redis/Bull)
- retry automático
- scheduler de campanhas
- segmentação avançada

---

## DIRETRIZ IMPORTANTE

Priorizar:

- uso real
- operação com cliente
- estabilidade

ANTES de:

- novas features
- refatorações grandes
- otimizações prematuras

---

# HISTÓRICO DE SPRINTS (MARCOS)

- Sprint 14 -> shadow write completo
- Sprint 15 -> leitura híbrida
- Sprint 16 -> consistência validada
- Sprint 17 -> Postgres como source of truth
- Sprint 18 -> controle de uso
- Sprint 19 -> campanhas base
- Sprint 20 -> execução assíncrona
- Sprint 21 -> API operacional
- Sprint 22 -> operação assistida
- Sprint 23 -> UI de campanhas
- Sprint 24 -> refinamento de UX
- Sprint 25 -> onboarding real validado (JUSTA)
- Sprint 26 -> onboarding interno assistido
- Sprint 28 -> observabilidade Meta
- Sprint 29 -> área do cliente

## Incidente P1 — handoff humano com setor sem fila concreta

Em 2026-09-12 foi auditado em producao o tenant `syer-rodrigues`, contato
`****9614`: o inbound chegou, o bot respondeu, o handoff foi ativado e o runtime
ficou `mode=HUMAN`, `handoffStatus=ACTIVE`, `status=WAITING`,
`departmentId=Campanha 2026`, `queueId=null`, sem responsavel e sem fechamento.
A conversa nao projetou para a Inbox humana porque o invariant operacional da
Inbox exige destino humano completo: setor + fila.

Conclusao de dominio: `queueId=null` nao e um destino operacional humano valido
para atendimento aguardando atribuicao. O caminho correto e resolver uma fila
concreta antes de criar/projetar atendimento humano; nao afrouxar a visibilidade
da Inbox para aceitar aguardando sem fila.

Auditoria read-only em producao: 10 fluxos ativos; 7 handoffs ativos com
`departmentId` e sem `queueId`, distribuidos em 2 tenants
(`syer-rodrigues`: 6; `lab-websession`: 1). Os setores afetados tinham
exatamente uma fila existente (`Fila Geral`), permitindo resolucao deterministica
sem hardcode de tenant.

Fix local: `departmentAwareHandoff` resolve automaticamente a unica fila
existente do setor quando o fluxo legado/guiado traz apenas `departmentId`; se o
setor nao tem fila ou tem multiplas filas sem escolha explicita, bloqueia o
handoff em vez de criar `WAITING` invisivel. O Guided Builder passa a exigir fila
concreta, auto-selecionando a unica fila do setor e exibindo erro acionavel
quando nao ha fila cadastrada.

Contrato preservado: Inbox, SLA, relatórios, posicao de fila, claim,
transferencia, notificacoes e atribuicao automatica continuam operando sobre
destino humano completo (`departmentId` + `queueId`).

Fechamento operacional em 2026-09-12: apos backup fresco de pre-reparo, o atendimento ja existente
`****9614` foi reparado com uma unica mutacao de campo em
`ConversationRuntimeState.queueId`, de `null` para a fila existente
`cmtoekafy00014s4lg41vs5i0` (`Fila Geral`). Nenhuma mensagem, historico,
protocolo, ciclo, fechamento ou atribuicao foi alterado. A prova pos-reparo
mostrou `mode=HUMAN`, `handoffStatus=ACTIVE`, `status=WAITING`, setor
`Campanha 2026`, fila `Fila Geral`, sem responsavel, conversa aberta,
projecao canonica na Inbox humana exatamente uma vez e posicao de fila `1`.
Incidente fechado.

Guided Builder 2.4 local: consolidar UX sem alterar runtime ou schema. Navegacao
do wizard (selecionar modelo, Continuar, Voltar) preserva a posicao atual de
scroll e usa foco com `preventScroll`; expansao de linha editavel ancora o
cabecalho da propria linha; exclusao/cancelamento/retorno recupera o contexto
pai sem abrir o proximo irmao. Cancelar submenu em criacao remove apenas o
estado transiente, mantem o pai expandido e devolve foco ao cabecalho do pai.
Destino "Fazer uma pergunta" exige pergunta, tipo de resposta e proximo
comportamento definido; permite no maximo 3 perguntas consecutivas antes de
outro destino. Auditoria de runtime classificou branching por resposta
capturada como PRODUCT GAP: o runtime atual tem captura sequencial por
`capture.next`, mas nao possui predicados por valor capturado, igualdade,
sim/nao ou fallback branch para resposta livre.

Registro historico do Guided 2.4: `WAITING` humano precisava de
`departmentId` + `queueId` concreto. Auditoria local de cardinalidade encontrou
24 setores ativos sem fila, 56 com uma fila e 5 com duas ou mais filas. Os 5
casos multi-fila foram classificados como `default` = INTERNAL DEFAULT/Re7 Demo
e `campaigns-feature-*` = AUTOMATED TEST ARTIFACT por metadados reais
(`phoneNumbers=0`, `channelAccounts=0`, fixture em
`campaignsFeatureRoutes.test.ts`); nenhum fluxo ativo ou runtime usa multiplas
filas dentro do mesmo setor. A UX 2.4 resolvia fila unica internamente sem
label/seletor/texto de fila; setor sem fila bloqueia com "Este setor ainda nao
esta preparado para receber atendimentos."; somente setor com 2+ filas exibe
seletor "Fila" como excecao. Esse comportamento foi SUPERSEDED localmente pelo
dominio explicito: a UX mostra apenas Setor e bloqueia se
`operationalQueueId` estiver ausente. Fluxos existentes com `departmentId` e
`queueId=null` exibem aviso e nao sao reescritos automaticamente ao abrir.

Backlog 2.4: GUIDED BUILDER 2.4 = APPROVED FOR FRONTEND-ONLY DELIVERY /
PRODUCTION VALIDATION; HANDOFF QUEUE UX = SIMPLIFIED / CONDITIONAL EXCEPTION;
QUESTION CONDITIONAL BRANCHING = PRODUCT GAP.

Micro-ajuste final de UX 2.4: o owner apontou redundancia no bloco visual
"Escolha o setor que recebera o atendimento." apos selecionar "Encaminhar para
atendimento humano". O bloco/cartao instrucional foi removido; o editor agora
mostra diretamente `Setor`/selector, mantendo fila unica interna, bloqueio de
setor sem fila, seletor excepcional para 2+ filas, preview e JSON gerado sem
alteracao. Status historico local antes da entrega: GUIDED BUILDER 2.4 =
OWNER APPROVED LOCAL.

Entrega aprovada do Guided Builder 2.4: delta validado aplicado sobre o HEAD
canonico e publicado em `ca34e123c72de2e96f0dcff27b4e17f29e5b630b`, sem
migracao, sem hardcode de tenant, sem reload de backend/worker e preservando
`ChatbotFlow.definition`. Status: GUIDED BUILDER 2.4 = CLOSED / DEPLOYED /
OWNER APPROVED LOCAL / PRODUCTION NON-DESTRUCTIVE VALIDATED; HANDOFF QUEUE
CONTRACT = CLOSED / REAL VALIDATED; QUESTION CONDITIONAL BRANCHING = PRODUCT
GAP / OPEN; SYER ****9614 = CLOSED.

---

# BACKLOG LATENTE (RETOMAR QUANDO NECESSÁRIO)

- validação onboarding assistido
- validação real do onboarding (novo cliente)
- relatorios por atendente com historico persistido em Postgres para producao em `STORAGE_MODE=json`
- padronização tenantId vs clientId
- limpeza de `.data/default`
- revisão do tenant `cliente-demo`

---

# BACKLOG LEGADO (BAIXA PRIORIDADE)

- normalização de leadName
- lastMessage nulo
- limpeza de logs antigos
- ajustes de parsing
- melhorias menores de inbox

---

# DECISÕES ARQUITETURAIS

- NÃO implementar recursos não oficiais de WhatsApp
- manter foco 100% na API oficial da Meta
- manter arquitetura simples e evolutiva
- Sprint 42.1: separar superfícies /admin (plataforma) vs /app (cliente), migrando users, departments e reports para /app com requireClientAuth e auditoria por userId real

## Canonical Identity P1 delivery - 2026-09-17

- **IDENTITY P1: DEPLOYED / PRODUCTION NON-DESTRUCTIVE VALIDATED.** Production
  advanced by fast-forward from `cad9489c` to `ed329ec8` on 2026-09-17. Meta
  inbound/capture and campaign CRM bootstrap reuse the existing canonical
  resolver. The clean delivery passed 119 focused tests; the production backend
  build, targeted agent reload, health/DB checks and read-only route/module
  smokes passed without schema, migration, backfill or tenant hardcode. A real
  post-deploy identity event has not yet been exercised.
- **QUEUE DOMAIN: CLOSED / DEPLOYED / PRODUCTION RECONCILED / SMOKE PASS.**
  Nullable `Department.operationalQueueId`, composite same-tenant/same-department
  FK, atomic Department lifecycle and explicit routing are implemented in the
  isolated worktree. Local migration/tests/builds pass. Read-only production
  audit of all 54 departments found 34 auto-safe exactly-one mappings, 8
  inactive null-allowed rows, 7 resolved multi-queue mappings and 5 active
  owner-resolved rows: `demo-converta` Setor Teste and `lab-websession`
  Department Lunch get owner-approved internal queues; `demo-converta` FUNDARPE,
  `re7online` Comercial and `re7online` Governo e Licitações get exact
  owner-selected existing queues. Runtime name/order/usage inference remains
  prohibited. Production cutover on 2026-09-18 applied the nullable schema
  migration and reconciled 54/54 departments by explicit IDs. First production
  reconciliation: 44 explicit updates, 2 internal queues created/linked; second
  run: idempotent. Post-verify active unresolved = 0 and cross-tenant/department
  links = 0. Owner decision package:
  `docs/saas/OPERATIONAL_QUEUE_OWNER_DECISION_PACKAGE_2026-09-17.md`.
- **CAMPAIGN UX: OWNER PASS / QUEUE-DEPENDENT DELIVERY DEPLOYED.** The
  normal UX selects only Setor and persists the exact internal queue. Production
  delivery is now backed by `Department.operationalQueueId`; no queue selector is
  exposed to the customer-facing admin UX.
- Demo `****6787`: pre/post read-only snapshots of both historical Contacts and
  Leads matched exactly; no production mutation occurred and repair remains a
  separate gate.

## CRM origin + full Contacts CSV + campaign block guards - 2026-09-23

Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI VALIDATION PENDING.

Production deploy 2026-09-23:
- Previous head: `31a65a2bc6a74d7dd8fc5d5086133735155c64d4`.
- Deployed head: `2a652e693a4bce5cfaa7e0a1fa5ef667537f154a`.
- Backup:
  `/opt/re7online/backups/postgres/pre-crm-origin-csv-campaign-guards-2a652e69-20260923T004417Z.dump`
  (`21677788` bytes,
  sha256 `99d2bbccd613dada93d27c19ee6d05a3f941cbe5a311d759036a10cb9f4688aa`,
  `596` objects).
- Production health after reload: `/agent-api/health` PASS (`ok=true`,
  `db=ok`); `/app/crm`, `/app/campaigns`, `/app/inbox` and
  `/app/settings/crm` returned HTTP 200.
- Reloaded only `re7-whatsapp-agent` and `re7-admin-front`; worker PID/restart
  count preserved.
- Authenticated owner UI smoke and real CSV/campaign mutation evidence were not
  exercised; no fabricated session, no real campaign send and no provider call
  were used for smoke.

- CRM origin preserves earliest reliable provenance and records inbound/contact
  materialization as `Atendimento / conversa` without a new persistence field.
- Contacts CSV import removes duplicated selected-file text and supports phone
  plus optional name, CRM situation, company, city, email and service/interest
  mappings.
- Unmapped or blank optional Contacts CSV fields preserve existing CRM data;
  preview reports the fields that will change.
- CRM `NEW` is a mandatory system status: active and restored if tenant
  settings omit it. It does not create campaign ineligibility by itself;
  eligibility remains governed by campaign status configuration and explicit
  send guards such as opt-out, operational exclusion, anonymization and valid
  WhatsApp identity.
- Campaign manual/CSV guards and Inbox template guards preserve pre-provider
  opt-out/active-send blocking and show user-facing reasons.
- Customer Campaigns/Inbox UX remains free of billing/price notices, and the
  CRM audience panel uses neutral administrative styling.
- Local validation: frontend contracts 46/46 PASS; backend focused
  unit/contracts 25/25 PASS; `campaignRecipientImport` 7/7 PASS;
  `crmCapabilityRoutes` 19/19 PASS; `campaignsFeatureRoutes` 118/118 PASS;
  backend/frontend builds PASS; schema unchanged, migration none, provider
  calls 0, real send NO.

## P1 campaign delivery truth + alias-safe blocking - 2026-09-23

Status: LOCAL FIX VALIDATED / NOT DEPLOYED.

- Campaign CSV preview/import now preserves arbitrary CSV headers and requires
  explicit phone-column mapping when no safe phone alias is detected. It no
  longer silently selects the first CSV column as WhatsApp.
- Active send blocking/opt-out lookup now evaluates Brazilian 12/13 digit
  identity aliases as one canonical identity group and applies latest event wins
  across record/revoke.
- Provider accepted/submitted is not treated as delivered, read or Inbox-ready
  evidence. Campaign execution persists outbound/submission and CRM attempt
  materialization only; operational Conversation/Runtime is created or
  reactivated only after Meta delivered/read webhook evidence.
- Campaign result truth keeps submitted/accepted separate from delivered/read,
  failed and blocked. Provider acceptance alone does not make a successful
  delivery. Current `Campaign.sentCount` remains a legacy submitted/accepted
  counter; it is not delivered count, read count or final success count.
- Meta Cloud reaction-only webhook payloads are non-content events and do not
  create inbox bubbles, unread/sound, bot transitions, CRM or runtime side
  effects.
- Real `****6683` controlled repair was executed in production on 2026-09-24
  after backup
  `/opt/re7online/backups/converta-persistent/postgres/20260924-105431.dump`
  (`sha256=0b0905dbb115737fd9975438b0b750829d92b52a198eeddb5e2958fa049cb747`).
  The repair deleted only false operational projections:
  `ConversationRuntimeState 38012577-8dbb-43d5-8bdd-2ef8ba541038` and
  `Conversation 9a07b043-6657-4dc3-9e7f-2b904caf939c`. Persistent repair
  artifact:
  `/opt/re7online/backups/converta-persistent/repairs/6683-2026-09-24-1057/`.
  Campaign `ad354ce4-35dc-4fca-85e5-3108cc9a2332`, Outbound
  `b5193677-2f28-41ea-879f-1dfebdfe08d9`, Event references, billing/meta usage,
  Contact, Lead and CCI were preserved. Meta failed evidence `131026` /
  `Message undeliverable` remains preserved as campaign failure history.
- Local validation: focused campaign/import/webhook/runner/opt-out tests
  23/23 PASS; `campaignsPageContract.test.ts` 21/21 PASS;
  `campaignsFeatureRoutes.test.ts` 118/118 PASS. Schema unchanged and
  migration none.

## Final CSV inspection + Campaign Detail UX - 2026-09-23

Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI VALIDATION PENDING.
Production head: `9cfb0d439ed3acd8447659cb033519fa3507b3b3`.

- Contacts CSV now separates file inspection from mapped import preview. The
  operator can load/inspect a valid CSV, see all headers and then explicitly
  select an arbitrary phone column when no safe `Telefone`/`Numero`/`Phone`/
  `WhatsApp` alias exists. No contact mutation occurs during inspection.
- Missing safe phone alias is a normal mapping state, not a generic preview
  failure. Preview/confirmation still require a selected phone column; invalid
  values in the chosen column remain row-level preview errors.
- Optional Contacts CSV mappings preserve the existing tri-state semantics:
  `undefined` permits auto-detection, `null` explicitly unmaps, and `string`
  selects a column.
- Campaign Detail now localizes known blocked/result reason codes in PT-BR
  before display/copy where supported, while preserving provider details for
  unknown diagnostics. Refresh keeps icon `↺`; `Nova campanha com filtrados`
  uses a distinct creation icon `＋`.
- Production deploy validated backend health (`ok=true`, `db=ok`) and app
  shell reachability for `/app/crm`, `/app/campaigns` and `/app/inbox`.
  Authenticated owner UI smoke was not exercised in this gate because no
  genuine owner session was available to reuse without fabricating
  authentication.

## P1 - Campaign Reuse Contract + Owner-Facing Error Normalization - 2026-09-23

Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / READ-ONLY DOMAIN VALIDATED /
OWNER UI PENDING.

- `Reaproveitar campanha` and `Nova campanha com filtrados` now share one
  campaign reuse contract: rebuild the original composer semantics as far as
  persisted `draftSeed` and result evidence allow, instead of maintaining two
  divergent reconstruction paths.
- Full reuse preserves method semantics for manual, static CRM audience,
  dynamic CRM filter and CSV. CSV reuse restores template/destination and asks
  for file re-selection when the original raw file is not retained.
- Filtered-result reuse preserves the original method where compatible.
  Manual campaigns remain manual with filtered recipients prefilled. Dynamic
  CRM and CSV filtered subsets are explicitly frozen into a static recipient
  subset with an operator warning.
- Template variables are restored as editable composer state. Missing required
  variables are normalized as `template_variables_required` with PT-BR copy and
  are not misclassified as `no_eligible_recipients`.
- Campaign owner-facing errors/toasts now map campaign error codes first and
  translate known blocked/result reasons and status labels to PT-BR. Structured
  `no_eligible_recipients` summaries can explain known block reasons such as
  active-send block without exposing backend English strings.
- Local follow-up, 2026-09-24: campaign reuse preview hydration is being
  corrected so static CRM reuse preserves the original `draftSeed.leadIds`
  selection but refreshes each selected contact from the same-tenant CRM read
  model before showing `Situacao no CRM` and eligibility. Persisted static
  audience filters are not available in historical seeds, so the UI must not
  infer filters from recipients or add new contacts. Dynamic CRM reuse can
  restore the persisted `dynamicFilter.crmBusinessStatusId`. Status:
  LOCAL FIX PREPARED / NOT DEPLOYED.
- Local validation complement, 2026-09-24: post-reuse active-send blocking was
  exercised with simulated providers. A recipient that participated in the
  original campaign and was later opted out becomes ineligible on reuse without
  expanding the preserved static `leadIds`; if blocking happens after preview
  but before send, `sendScopedCampaignDraft` revalidates through
  `resolveCampaignDraftRecipientsFromLeadIds` and stops with zero additional
  OutboundMessage, Conversation, RuntimeState or provider call. Scheduled
  static campaigns are revalidated by `campaignRunner` before provider calls;
  mixed audiences send only eligible recipients and all-blocked audiences keep
  the zero-eligible contract. CRM `Situacao` remains descriptive only and is
  not treated as a send block by itself. Current frontend hydration uses exact
  per-lead CRM detail reads because no batch-by-leadIds endpoint exists yet.
- Review follow-up for commit `be4f2d51`, 2026-09-24: reuse hydration now
  distinguishes missing contact, auth/permission and network/query failures in
  the preview instead of labeling every failure as "Sem situação"; stale
  hydration responses cannot change the composer after cancel/reset/another
  reuse; the composer opens immediately with explicit loading and limited
  concurrency while the current CRM data is refreshed. Status remains NOT
  DEPLOYED / OWNER UI PENDING.
- Behavioral validation: `campaignReusePreview.test.ts` 6/6 PASS covers
  successful current CRM detail without Situation, 404 vs auth vs network
  failure, late response after another reuse, late response after cancel/reset,
  selected order/current block preservation and max four concurrent CRM detail
  reads. `campaignsPageContract.test.ts` 25/25 PASS and frontend build PASS.
- Production deploy, 2026-09-24: functional head
  `1ea1fef7556e161a9cf938dbbf23442fdfd1e1f6` was deployed by FF-only from
  `b1a528a00d63b5dc3fea6c9ff45f9273e23f4294` after persistent PostgreSQL
  backup
  `/opt/re7online/backups/converta-persistent/postgres/campaign-reuse-preview-1ea1fef-20260924T200821Z/20260924-200822.dump`
  (`sha256=3d87e903c379e63e7ccd60ea3c0f583fd7ac3929a4f6f0d8e8965f1148f5124c`,
  581 objects). Frontend build PASS; only `re7-admin-front` was reloaded.
  `re7-whatsapp-agent` and `re7-whatsapp-web-worker` were preserved. Health and
  `/app/campaigns`, `/app/crm`, `/app/inbox` returned PASS. Authenticated owner
  reuse smoke for `Campanha teste set.27` was NOT EXERCISED from the deploy
  shell because no genuine session was available. Status:
  DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING.
- Local refinement, 2026-09-25: campaign detail/reuse UX was tightened without
  schema/runtime changes. CRM audience preview now separates filter controls
  from result counters; campaign detail removes the redundant status counter
  card, places the state badge beside refresh, groups send/schedule/discard
  actions separately from test-send and keeps the progress area adjacent to the
  action group. Draft detail no longer shows the composer-only variable mapping
  block, shows real draft recipient data in a fixed-height scroll area, removes
  relative timestamps from this context and only renders "Situacao real por
  mensagem" when real provider/result evidence exists. Test-send now accepts
  only the recipient number in the UI and relies on the backend resolver for
  explicit variables, seed recipient components or fixed template params;
  insufficient campaign sample data still returns `campaign_test_variables_required`
  before any provider call.
  Reuse now loads full campaign detail with `getAppCampaign` before deciding
  mode when the list item lacks `draftSeed`, avoiding silent fallback to manual.
  Historical static filters remain unrecoverable when not persisted; draft
  recipient current-vs-historical provenance is not invented when the API does
  not expose it. Validation: campaign page/reuse contracts 32/32 PASS,
  backend focused campaign routes 2/2 PASS, frontend build PASS, backend build
  PASS. Authenticated local browser smoke on 2026-09-25 used backend `3047`,
  frontend `3048`, tenant `campaign-refinement-local`, simulated providers and
  local DB `127.0.0.1:55432/re7_contacts_campaigns_ux_test`: desktop and narrow
  screenshots confirmed no redundant Situation counter, status badge adjacent
  to refresh, send/discard/schedule grouped with progress below, test-send
  separated with only a recipient-number field, no detail variable-mapping
  block, no relative timestamps, hidden real-message status when only fallback
  seed data exists, draft recipient scroll above five rows, detail fetch before
  reuse mode selection and no silent manual fallback. Evidence stored in
  `.codex/evidence/campaign-refinement-2026-09-25/`. Status: LOCAL FIX
  PREPARED / NOT DEPLOYED / OWNER UI PENDING.
- Review follow-up for `efbcc62`, 2026-09-25: reuse now advances the
  generation guard before the initial `getAppCampaign` detail fetch, so a late
  response/error from campaign A cannot update selected campaign, form, mode,
  tab, modal or toast after campaign B or cancel/reset. Draft confidence copy is
  neutral ("Rascunho — envio ainda não iniciado") and no longer claims send
  readiness from `status=draft` alone. Detail-result evidence no longer depends
  on matching the Portuguese missing-history text: the backend marks seed rows
  without individual history as `missing_individual_history`, while real
  `failed_or_blocked`, `status_unconfirmed` and provider result evidence
  remains visible. `pricingBillable` counts as evidence only when it is an
  explicit boolean. Validation: campaign page/reuse contracts 32/32 PASS;
  backend focused campaign routes 3/3 PASS on local DB
  `127.0.0.1:55432/re7_contacts_campaigns_ux_test`; frontend build PASS;
  backend build PASS. Authenticated local smoke on frontend `3068` / backend
  `3067` confirmed no draft readiness claim, no result section for
  draft/seed-only placeholder without execution, reuse opening without silent
  manual fallback and bounded draft table. Follow-up correction: completed
  campaigns with `missing_individual_history` remain visible as historical
  inconsistency, not as proven provider failure. Evidence stored in
  `.codex/evidence/campaign-review-efbcc62-2026-09-25/`. Status: LOCAL FIX
  PREPARED / NOT DEPLOYED / OWNER UI PENDING.
- Production deploy, 2026-09-25: functional head
  `d172b0e65a5237d835acd6ef5ece7ee50af5d241` was deployed by FF-only from
  `1ea1fef7556e161a9cf938dbbf23442fdfd1e1f6` after persistent backup snapshot
  `/opt/re7online/backups/converta-persistent/snapshots/20260925T102510Z`
  (`database.dump` sha256
  `33003b892ae5b4f8d0228177017aa7c3c68707b910c36b7da6eb39affc070c13`,
  22,330,663 bytes, 581 objects, `SHA256SUMS` verified). Backend and frontend
  builds PASS; `re7-whatsapp-agent` and `re7-admin-front` were reloaded, while
  `re7-whatsapp-web-worker` was preserved after confirming the changed backend
  route/test files are not in the worker compile graph. Health/db and basic
  `/app/campaigns`, `/app/crm`, `/app/inbox` route checks PASS. Authenticated
  campaign-detail/reuse UI smoke was NOT EXERCISED from the deploy shell because
  no legitimate owner session/case was available there. No draft, schedule,
  test send, campaign send, opt-out mutation, provider call, schema change or
  migration was performed by validation. Status:
  DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING.
- Owner visual validation, 2026-09-25: owner confirmed PASS for the deployed
  campaign detail/reuse visual refinements at `d172b0e65a...`. Remaining local
  follow-up is test-send sample resolution: the UI keeps only the destination
  number field and the backend may use values from the same campaign's first
  eligible complete recipient as a deterministic sample, sending exclusively to
  the number typed by the operator. The sample is not added to campaign
  participation/history, destination opt-out/exclusion is revalidated, and lack
  of a complete sample blocks before provider. The same local lot removes the
  duplicated draft-detail summary block (`Solicitados`, `Aceitos`,
  `Bloqueados`, `Duplicados` and technical reason chips) while preserving
  campaign main counters, draft recipient review, backend validation and
  eligibility data. Status:
  LOCAL FIX PREPARED / NOT DEPLOYED / OWNER UI PENDING.
- Local correction, 2026-09-25: test-send sample resolution now re-prioritizes
  the typed number after canonical draft readiness rebuilds CRM mapping-derived
  components. A test destination that belongs to the audience, including 12/13
  digit aliases, uses its own current data; if that recipient lacks required
  variables, the request blocks instead of silently using another person's
  sample. External test destinations may still skip incomplete candidates and
  use the next eligible complete sample. Focused local coverage passed for
  static CRM audience, dynamic CRM filter, alias matching, exact typed
  destination, zero provider call on incomplete known recipient, and unchanged
  draft campaign status. Status:
  LOCAL VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
- Production deploy, 2026-09-25: functional head
  `aba600989eda77f6cb1258256f5aa0ba2f40ba03` was deployed by exact checkout
  from `d172b0e65a5237d835acd6ef5ece7ee50af5d241` after persistent backup
  `/opt/re7online/backups/converta-persistent/snapshots/20260925T130420Z`
  (`database/database.dump`, 22,377,789 bytes, SHA256
  `1ed097a1ded0c14c0e75dc97ba6af1ba3ccadf985080bc612ff3cd4db0df3bb5`,
  581 objects in manifest). Backend and frontend builds PASS; only
  `re7-whatsapp-agent` and `re7-admin-front` were reloaded, with
  `re7-whatsapp-web-worker` preserved. Health/db and `/app/campaigns`,
  `/app/crm`, `/app/inbox`, `/app/login` route checks PASS. Authenticated
  draft-detail UI inspection was NOT EXERCISED from the deploy shell; owner UI
  remains pending. Validation did not click test-send, create drafts, schedule,
  send campaigns, change opt-out, call providers, change schema or run
  migrations. Backup script reported a retention-cleanup permission issue for
  an old snapshot after the new backup was created and validated; deploy used
  the valid new snapshot. Status:
  DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING.
- Owner validation, 2026-09-25: owner confirmed PASS for the deployed
  test-send sample + draft-detail cleanup lot at
  `aba600989eda77f6cb1258256f5aa0ba2f40ba03`.
- Local follow-up, 2026-09-25: campaign test-send now accepts valid Brazilian
  national numbers with DDD and no explicit `55`, using the existing CRM
  WhatsApp identity normalizer before provider dispatch. Complete international
  inputs, 12/13 aliases and destination opt-out/exclusion guards are preserved;
  incomplete or ambiguous national input returns a specific PT-BR validation
  message before provider. `/app/settings/crm` was reorganized into
  department-style expandable rows while preserving CRM status values,
  permissions and the distinction between `Situação no CRM` and active-send
  blocking. Campaign light-theme select/options and the `Envio manual` label
  now use theme-aware tokens. Follow-up smoke diagnosed the earlier CRM load
  error as local environment configuration: `/app/crm/settings` requires the
  legacy `.data/tenants.json` entry, and the local smoke process had no entry
  for the selected test tenant. A minimal ignored local `.data/tenants.json`
  restored the supported local fixture path; the endpoint returned 200 with
  `configSource.crmBusinessStatuses=db`. Authenticated browser smoke validated
  mouse and keyboard expand/collapse, edit/save/reload persistence, abandoning
  an unsaved edit by reload, desktop/narrow and light/dark screenshots. Focused
  backend coverage includes BR national number without `55`, full `55` form,
  international destination preservation, incomplete/ambiguous rejection and
  alias opt-out blocking with provider mocked. Status:
  LOCAL VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
- Pre-deploy review correction, 2026-09-25: the shared CRM WhatsApp identity
  parser now distinguishes Brazilian DDD `55` from country code `55` by input
  length. National `55 99140-0002` and full `55 55 99140-0002` converge to the
  same canonical destination; campaign test-send preserves the selected
  recipient data and opt-out/alias blocking for both forms before provider.
  Focused normalizer and campaign route tests plus backend build passed. Status:
  LOCAL VALIDATED / NOT DEPLOYED.
- Focused local audit, 2026-09-25: ordinary campaign execution paths now reuse
  the canonical CRM WhatsApp normalizer before opt-out and provider dispatch.
  CSV/import, persisted CRM static/dynamic recipients, reuse and scheduled runs
  converge national DDD `55` input and full `55` input to the same destination,
  preserve other Brazilian DDDs, block alias opt-out/exclusion before provider
  and avoid duplicate recipients. CSV/import remains a typed-input surface and
  continues to reject unsupported international input as controlled row
  validation with zero provider calls; CRM/Inbox template sends are
  conversation/identity-backed paths, not arbitrary typed-phone entry points.
  Provider calls were simulated only. Status:
  LOCAL VALIDATED / NOT DEPLOYED.
- Review follow-up, 2026-09-25: campaign runner normalization now preserves the
  original recipient-to-components association when a national DDD `55` entry
  is normalized to full canonical form. Static seeds with
  `componentsByWaId["55991400002"]` send to `5555991400002` using that exact
  recipient's variables; national/full collisions dedupe to one send without
  mixing data from another recipient. Focused runner and route tests plus
  backend build passed with providers mocked. Status:
  LOCAL VALIDATED / NOT DEPLOYED.
- Production deploy, 2026-09-25: functional head
  `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e` was deployed by FF-only from
  `aba600989eda77f6cb1258256f5aa0ba2f40ba03` after persistent backup
  `/opt/re7online/backups/converta-persistent/snapshots/20260925T161546Z`
  (`database/database.dump`, 22,438,545 bytes, SHA256
  `a7812cccd56a5f398ee7664aea44591b933997d74fc8199bc1a9ea6c2a5a2860`,
  581 manifest objects). Backend and frontend production builds PASS; `git
  diff --check` PASS. Only `re7-whatsapp-agent` and `re7-admin-front` were
  reloaded; `re7-whatsapp-web-worker` and `.data/` were preserved. Health/db
  and unauthenticated route reachability for `/app/campaigns`, `/app/crm`,
  `/app/inbox`, `/app/settings/crm` and `/app/login` PASS. Authenticated
  read-only UI smoke was NOT EXERCISED because no legitimate session was
  available in shell; OWNER UI remains pending. Validation did not click
  test-send, create drafts, schedule, send campaigns, save CRM settings, call
  providers, change schema or run migrations. Backup retention cleanup still
  has the previously documented old-snapshot permission issue, separate from
  the validated new backup. Status:
  DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER UI PENDING.
- Owner validation, 2026-09-25: owner confirmed PASS for the deployed
  normalization/settings/contrast lot. This closes the product lot as
  DEPLOYED / OWNER VALIDATED / CLOSED at functional head
  `5ee2de6b8878aefa733a6fbe1b7f1553fd78ae2e`; it is product-owner acceptance,
  not formal CRA contractual acceptance. The old backup-retention permission
  issue remains a separate operational follow-up, and the transient Prisma
  reload error recovered with health/db OK and did not require rollback.
- Audience size audit, 2026-09-25, published behavior before the local batch
  backend: CRM static audience preview requests
  `/app/campaigns/audience-preview` with `limit=25`; backend analyzes up to
  5,000 CRM rows but returns paginated eligible items, and `Criar rascunho com
  audiencia` sends only the eligible items currently present in that preview
  response. Static draft creation rejects `selectedLeadIds.length > 1000`, and
  the shared resolver also caps sanitized selected IDs at 1,000. There is no
  implicit "all 3,000" selection and no automatic batching.
- Dynamic CRM-filter audit, 2026-09-25, published behavior before the local
  batch backend: dynamic scheduling stores only
  `selectionMode=DYNAMIC_CRM_FILTER` plus the same-tenant CRM status filter; it
  does not freeze recipients at schedule time. At execution, the runner queries
  `take: 1001` and fails explicitly with `dynamic_match_limit_exceeded` when
  more than 1,000 leads match, before provider dispatch. There is no silent
  truncation in the runner and no automatic split into batches. UX gap remains:
  the preview/estimate can show the current count, but the product should make
  the 1,000-recipient campaign/execution limit and dynamic overflow failure
  clearer before draft/schedule. Status: OPEN / P2 CAMPAIGN UX PREFLIGHT.
- Campaign batches + tenant execution queue, local update 2026-09-26:
  BACKEND CORE + GROUP UI INTEGRATED LOCALLY / FOCUSED VALIDATED / NOT DEPLOYED /
  OWNER UI PENDING.
  Additive Prisma migration was validated with `prisma migrate deploy` in an
  isolated local DB. The local queue persists batch/chunk/job/lease records,
  enqueues immediate/scheduled/resume paths, makes test-send acquire a durable
  technical tenant job, and blocks new tenant execution while any running job is
  active or uncertain even after lease expiry. New focused recovery coverage
  proves that an expired running job does not unblock the tenant by timeout; an
  explicit `needs_review` classification records the reason, releases the lease,
  invalidates the old executor token and allows later queued work without
  resending the uncertain job. Additional queue coverage proves batch chunks are
  claimed in deterministic `chunkIndex` order, and the runner preserves accepted
  provider evidence after lease loss while stopping before the next provider
  call. Integrated local backend coverage proved CRM dynamic scheduled 3,001
  recipients -> one snapshot -> four sequential chunks, and CSV grouped 3,001
  recipients -> four sequential chunks with per-recipient variables preserved
  and a post-plan blocked recipient excluded before provider. UI list displays
  "Revisao operacional" and the block reason for that state. Local UI/API
  integration now exposes the execution batch summary in Campaign detail:
  group identity, source, total recipients, numbered chunks, per-chunk
  status/progress, tenant queue state, requested/effective times and operational
  block reasons. Focused validation after this UI hook: backend build PASS,
  `campaignsPageContract.test.ts` 29/29 PASS, frontend build PASS,
  `campaignsFeatureRoutes.test.ts` 125/125 PASS and `git diff --check` PASS.
  Authenticated local API smoke on isolated ports `3007`/`3061` loaded
  supervisor/admin campaign detail for fixture `batch-smoke-20260926`, confirmed
  `executionBatch` with 3,001 recipients / four chunks and confirmed AGENT
  403; sanitized evidence is stored in ignored local directory
  `local-evidence/20260926-batch-ui-smoke/`. Follow-up Chrome headless/CDP
  smoke used fixture `batch-visual-20260926` with future `eligibleAt` and
	  captured desktop/narrow screenshots: SUPERVISOR and ADMIN saw the group
	  detail, tenant queue copy, four chunks and progress; AGENT direct URL showed
	  restricted campaign access and no batch detail. Follow-up CDP smoke clicked
	  aggregate `Pausar conjunto`, `Retomar conjunto` and `Cancelar conjunto`,
	  then confirmed persisted DB state: paused jobs=4, resumed queued jobs=4 and
	  cancelled jobs/campaigns=4. Test-send occupied was confirmed as no outbound
	  delta while tenant busy, but the UI toast click remains visually inconclusive
	  because the controlled input did not update in the CDP script. Visual flows
	  still NOT EXERCISED: CRM/CSV grouped creation confirmation and occupied
	  test-send toast by UI click. Remaining blockers are production-safe
  migration rollout/rollback rehearsal, complete browser flow smoke, owner UI
  validation and deployment. Do not mark this CRA-ready until those operational
  validations are complete.
  Contract audit note: current production head `5ee2de6...` already calls
  `ensureCampaignOutboundConversation(...)` from the Meta webhook path when a
  campaign outbound receives `DELIVERED` or `READ`; tests using
  `deliverCampaignOutbound(...)` assert `Conversation` and
  `ConversationRuntimeState` creation with `lastInboundAt=null` and HUMAN/WAITING
  runtime. This was not introduced by the batch lot, but it conflicts with the
  stricter principle "campaign attempt does not equal operational conversation"
  if that principle covers delivered outbound-only attempts. Publication of the
  batch lot must remain blocked for owner/architecture decision on this contract;
  do not reopen repair `6683` and do not legitimize the divergence as CRA-ready.

## P1 - Zero-Eligible Campaign + CRM Eligibility Counts - 2026-09-23

Status: LOCAL FIX PREPARED / NOT DEPLOYED.

- Immediate manual campaign creation now stops before campaign creation when
  every requested recipient is blocked before provider execution. It returns a
  controlled `no_eligible_recipients` response with PT-BR message and safe
  summary; no campaign, outbound, runtime or provider call is created.
- Mixed blocked + eligible requests still create the campaign and preserve the
  blocked audit/result context, but only eligible recipients reach outbound
  execution.
- Contact campaign history now excludes pre-provider opt-out/active-send block
  events. Campaign-level audit evidence remains preserved in canonical events;
  real provider attempts such as failed/delivered/read remain campaign history.
- CRM settings and campaign recipient preparation now use the same eligible
  campaign-audience projection, excluding anonymized, opt-out/active-send
  blocked, operationally excluded and invalid-identity subjects from eligible
  counts.
- Owner UX polish: campaign reuse success toast uses a distinct high-contrast
  tone, and campaign name/template controls share the same height/alignment.
- Local validation: `campaignsFeatureRoutes.test.ts` 120/120 PASS;
  `crmCapabilityRoutes.test.ts` 20/20 PASS; campaigns frontend contracts
  27/27 PASS. Backend build PASS; normal production frontend build
  `npm run build` PASS with real local `node_modules`; final diff check PASS.
- Production deployment: head `b8166b1cafea08f183646976a28b5649550729cd`
  fast-forwarded from `332672508347836e2c4d4dbdd0aeb61272129b2c` after
  persistent PostgreSQL backup. Backend and normal frontend production builds
  passed; only `re7-whatsapp-agent` and `re7-admin-front` were reloaded, and
  `re7-whatsapp-web-worker` was preserved.
- Production read-only validation: health/db OK through `/agent-api/health`;
  `/app/campaigns`, `/app/crm`, `/app/settings/crm` and `/app/inbox`
  reachable. Demo CRM campaign-audience projection returned raw lead total 251
  and eligible total 4; anonymized, opt-out/active-send blocked,
  operationally excluded and invalid-identity exclusions remain governed by the
  shared preparation helper. Pre-provider block sample `****6787` had no
  outbound evidence for the same campaign/waId; real failed attempt `****9614`
  and delivered evidence remained represented. No provider call, no real send
  and no intended production test mutation were performed during validation.

## P1 - Campaign RBAC / Active Sends Authorization - 2026-09-23

Status: DEPLOYED / PRODUCTION HEALTH VALIDATED / OWNER VALIDATED / CLOSED.

Publication note: commit `69f71222e851ef05b23d40e5cb984b69cfef69f2` was
published to GitHub for review first. Complement commit
`b1a528a00d63b5dc3fea6c9ff45f9273e23f4294` was then published and deployed to
production on 2026-09-24. Owner later declared "validação passou"; this is the
owner acceptance record, distinct from the earlier technical smoke where
role-specific production sessions were not available.

Previous audit problem: app navigation had `feature: "campaigns"` but no
`minRole`, so the UI omission/visibility contract was not explicit enough, and
backend campaign routes were mainly guarded by authenticated tenant session
plus `campaigns` feature, not by explicit SUPERVISOR/ADMIN role enforcement.

Local implementation:
- `AppShell` marks `/app/campaigns` as `minRole: "SUPERVISOR"`, so AGENT no
  longer sees Campanhas/Comunicados in app navigation.
- `/app/campaigns` page performs local role gating before loading protected
  campaign data. AGENT direct URL shows a controlled no-permission state and
  does not run campaign list/template/destination/CRM status loading while
  authorization is checking or denied.
- Backend now centralizes app campaign authorization through
  `requireCampaignsAppAccess(...)`, reusing current client-session,
  `isAdminOrSupervisorRole`, scoped client lookup and `campaigns` feature gate.
  AGENT and unknown/non-manager app roles receive controlled 403 before body
  parsing, payload validation, mutation or provider execution.
- Protected app campaign routes covered locally: list, detail, export,
  audience preview, return destinations, CSV preview, CSV draft, CRM draft,
  manual create, discard, send, schedule, pause, resume, test-send and cancel.
- Opt-out routes `/app/campaigns/opt-out` and `/app/campaigns/opt-out/revoke`
  were audited and intentionally preserved because CRM consumes them for
  contact opt-out/revoke behavior. No broad prefix block was applied there.

Domain rule:
- AGENT: no Campaign access and no active campaign operations.
- SUPERVISOR: allowed.
- ADMIN: allowed.
- Backend is authoritative; UI omission is not sufficient.

Local validation:
- `campaignsFeatureRoutes.test.ts` 121/121 PASS against local dedicated DB
  `127.0.0.1:55432/re7_contacts_campaigns_ux_test`. Added regression proves
  AGENT gets 403, including invalid payload attempts, and negative attempts do
  not change existing Template/Campaign records or Campaign, OutboundMessage,
  Conversation, ConversationRuntimeState and Event counts. The provider
  transport is mocked and asserted at zero calls. SUPERVISOR and ADMIN are
  exercised across the same protected route set with explicit expected
  functional responses.
- Complement on 2026-09-24: the same backend test now also exercises
  SUPERVISOR and ADMIN with valid fixtures for CSV preview, CSV draft, CRM
  draft, manual immediate creation, explicit send, schedule, resume and
  test-send. Provider calls remain simulated; the AGENT negative block still
  proves zero provider calls and unchanged preexisting records/counts.
- `campaignsPageContract.test.ts` 24/24 PASS. Added contract proves app
  navigation role gate, direct page denied state and no protected list/detail
  or polling data loading unless `campaignAccess === "allowed"`.
- Isolated local browser validation on 2026-09-24 used backend `3039`,
  frontend `3000`, tenant `rbac-local-smoke` and local DB
  `127.0.0.1:55432/re7_contacts_campaigns_ux_test`: AGENT navigation omitted
  Campaigns, direct `/app/campaigns` showed the controlled restricted state
  without protected backend campaign API calls, and SUPERVISOR/ADMIN loaded
  Campaigns with campaign API requests returning controlled 204/200 responses.
  Evidence stored locally in ignored development evidence directory
  `.codex/evidence/campaign-rbac-2026-09-24/`.
- Builds after the final gap closure: backend `npm run build` PASS and frontend
  `npm run build` PASS.
- Required campaign regressions mapped and rechecked locally: delivery truth
  via `campaignRunner.test.ts` 7/7 PASS; zero eligible/reuse via
  `campaignsPageContract.test.ts` 24/24 PASS; CRM eligibility/import via
  `campaignRecipientImport.test.ts` 7/7 PASS and `tenantConfig.test.ts` 3/3
  PASS. The loading failures observed during this closure were sandbox IPC
  `tsx` failures (`listen EPERM /tmp/tsx-1000/*.pipe`) and passed when rerun
  with approved local execution; `campaignRunner` and `campaignRecipientImport`
  also passed against the local test DB.
- No schema/migration, production DB access, provider call, real send, commit,
  push or deploy occurred in this local implementation step.

Production deployment on 2026-09-24 followed
`docs/DEPLOY_TOPOLOGY_RE7.md`, `docs/RUNBOOK_WHATSAPP_AGENT.md` and
`docs/whatsapp-agent/ops/DEPLOY_VPS_PM2.md`: production moved by fast-forward
from `957f19caced77693188a387bb7f7840a24092c67` to
`b1a528a00d63b5dc3fea6c9ff45f9273e23f4294` after persistent PostgreSQL backup
`/opt/re7online/backups/converta-persistent/postgres/campaign-rbac-b1a528a-20260924T143728Z/20260924-143729.dump`
(22,212,175 bytes, sha256
`215049ecb9aafdb6bd1e209b5a2f414b0ef8b0247447ec5719207de039a9ef58`, 581
objects). Backend and frontend production builds passed; schema unchanged and
no migration ran. PM2 reload scope was only `re7-whatsapp-agent`
(`686274 -> 838501`) and `re7-admin-front` (`700707 -> 838522`);
`re7-whatsapp-web-worker` stayed online and unchanged (`3747763`). Health
returned `ok=true` / `db=ok`; `/app/campaigns`, `/app/crm`, `/app/inbox` and
`/app/login` returned 200; unauthenticated `/app/campaigns` returned controlled
401. No legitimate AGENT/SUPERVISOR/ADMIN production session was available to
exercise role-specific UI/API smoke, so AGENT 403 and manager read smoke remain
NOT EXERCISED in automated production smoke. Owner validation subsequently
passed and closes the RBAC front. No POST campaign/opt-out mutation, provider
call or real send was executed; rollback was prepared but not needed.

Next front audit - P2 Guided Builder BOT inactivity policy UX:
- Existing runtime/config: `ChatbotFlow.definition.inactivityPolicy` is already
  normalized and persisted by the chatbot flow definition path. Existing keys
  are `resetAfterMinutes`, `timeoutMinutes` and `action`; runtime accepts
  `HANDOFF`, `CLOSE` and `RESET_TO_ROOT`, while the background processor only
  acts on `timeoutMinutes` with `action=HANDOFF`.
- Existing behavior: `resetAfterMinutes` is inline on the next inbound and
  resets BOT flow to the start node without moving HUMAN/CLOSED; the inactivity
  processor promotes eligible BOT runtimes once to HUMAN/WAITING with concrete
  department/queue, protocol/queue messaging and skip events for invalid
  consent/destination. HUMAN/WAITING remains under human control and must not
  auto-close.
- Existing UI: `ChatbotFlowBuilder` preserves `inactivityPolicy` as a simple
  top-level field and the review currently only summarizes reset as
  "Inatividade: N minuto(s) para reiniciar"; it does not offer clear Guided
  controls for automatic handoff timeout/action nor explain the distinction.
- Minimal implementation proposed: add a dedicated Guided lifecycle section
  using current definition fields only, with two separate controls/copy blocks:
  "Reiniciar automacao quando a pessoa voltar depois do intervalo" mapped to
  `resetAfterMinutes`, and "Encaminhar ao atendimento humano apos abandono"
  mapped to `timeoutMinutes` + `action=HANDOFF`, showing current
  values/defaults in the review step. This does not resume from the previous
  node and does not run by timer; it is applied on the next inbound after the
  threshold. No schema, runtime, provider, production data or HUMAN auto-close
  change.
- Acceptance criteria: owner sees current values, can consciously set/clear
  each policy, review explains practical effect, Advanced JSON remains
  equivalent, existing reset/handoff tests pass, and no human service is closed
  automatically.

## Decisao de dominio pendente — materializacao por DELIVERED/READ

Status: OPEN / DOMAIN DECISION REQUIRED / PUBLICATION BLOCKED.
O webhook historico pode materializar Conversation/Runtime HUMAN/WAITING ao
receber DELIVERED/READ de outbound de campanha, mesmo com lastInboundAt=null.
Este comportamento e anterior ao lote e conflita com o principio de que uma
tentativa de campanha nao equivale a conversa operacional. Nao foi resolvido
nem legitimado por esta entrega. Webhook e campaignOutboundConversation foram
preservados. A decisao permanece explicita para revisao final; reparo 6683 fechado.


### Preflight do alvo — 2026-09-26 (somente leitura)

Produção `5ee2de6b`; candidato `2ecfc91a`: **NOT DEPLOYED / OWNER UI PENDING**.
[Preflight único, condições de parada e recuperação](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md) atualizado após `66b9cf2b`: portas 3000/3001 alcançáveis externamente, rewrite público do frontend e risco PM2 resurrect confirmados. Leituras privilegiadas de Nginx/firewall negadas; comandos exatos para o operador constam no preflight.

Recomendação: não avançar à migration; preparar e ensaiar guarda de admissão/drain e artefato de recuperação do atendimento com campanhas fechadas, em tarefa separada. Código atual não comprova quiescência de test-send/runners, nem retorno seletivo seguro. A estimativa preliminar de 30–60 min não constitui janela proposta para aprovação. Sem promessa de inbound/retries; sem REVOKE do papel compartilhado. Migration/drift/ensaio anteriores não repetidos; nenhuma alteração de runtime. Owner PASS anterior preservado, 6683 CLOSED, CRA pendente e DELIVERED/READ → HUMAN/WAITING separados.


### Guarda operacional e recuperação — implementação local 2026-09-26

Base `2b5697b6`, sem commit/push/deploy. Guarda persistente fechada por padrão,
controle superadmin e drain durável integram as entradas de campanha e a fila
existente; suspensão administrativa preserva intenção, snapshot e aceites.
Pause/cancel em execução, RBAC e exclusividade preservados; Inbox outbound não
foi bloqueado. Worktree de recuperação separado em `5ee2de6b` com campanhas
permanentemente fechadas e Client privado, sem dependência das tabelas novas
para atendimento. [Resultados exatos e limites do ensaio](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#resultados-comprovados-do-ensaio-local): execução 40/40, rotas 44/44 + caso final 1/1; guarda final 8/8;
atendimento antigo 4/4 sem fila e 5/5 com fila; retorno entre artefatos 1/1;
ambos builds backend PASS. Subconjuntos não são soma de casos únicos.

LOCAL IMPLEMENTED / TECHNICALLY VALIDATED / NOT DEPLOYED / OWNER UI PENDING.
Primeira instalação ainda exige acesso/inventário operacional, decisão sobre
interrupção da API antiga e reconciliação de chamadas sem observabilidade;
a guarda nova não fornece prova retroativa. Sem promessa de inbound/retries,
sem nova migration ou mudança de privilégios. Owner PASS anterior preservado,
aceite CRA pendente, Guided Builder pausado, 6683 CLOSED e DELIVERED/READ →
HUMAN/WAITING separados, sem mudança funcional desses contratos.


### Publicação dos artefatos de guarda e recuperação — 2026-09-26

NOT DEPLOYED / OWNER UI PENDING. Candidato em `review/campaign-recovery-20260926`
(parent `2b5697b6`, histórico funcional `2ecfc91a` preservado); recuperação separada
em `review/campaign-service-recovery-20260926`, commit `e6a12bc9f4ae77ada191f7bdc7d835ee704d5bac`,
parent direto `5ee2de6b`, atendimento funcional com campanhas fechadas em código.
Guarda candidata exige host único declarado e identidade local compatível; não
coordena hosts nem substitui inventário. 11/11 testes da guarda e build candidato
PASS; demais resultados anteriores preservados no preflight único
`docs/saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md`; procedimento/configuração em
`docs/RUNBOOK_WHATSAPP_AGENT.md`, seção de publicação dos dois artefatos.
Backups e estado privado permanecem locais; branches excluídas de auto-deploy.
Primeira transição, acessos operacionais, janela/impacto, owner UI e CRA pendentes.
Sem quiescência retroativa. Histórico owner PASS preservado, 6683 CLOSED,
Guided Builder pausado e DELIVERED/READ → HUMAN/WAITING separado.


### Correções incrementais da guarda — 2026-09-26

Sobre 889a1c7c/e6a12bc9: consentimento opt-out/revoke preservado com política e
RBAC existentes nos dois artefatos; aceite conhecido alcança SQL apesar de
contenção/EIO do ledger. Pendência compartilhada .uncertain impede abertura,
novos envios e drain; recuperação permanece permanentemente fechada. Nenhum
retry cego ou limpeza de lock/tarefa por timeout. Se SQL e filesystem falham,
a resposta pode ficar só em memória: coordenação/durabilidade não são prometidas.
Resultados afetados: guarda 15/15, runner 11/11, rotas candidatas 5/5; recuperação
consentimento 1/1 e fechamento 2/2; CRM 4/4 em cada artefato; ambos builds PASS.
Detalhes sem duplicar relatório: preflight `docs/saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md`
e procedimento em `docs/RUNBOOK_WHATSAPP_AGENT.md` (seção de consentimento/aceite).
Histórico/evidências preservados. NOT DEPLOYED / OWNER UI PENDING; primeira
transição, owner UI/CRA e incertezas antigas pendentes. 6683 CLOSED; divergência
DELIVERED/READ → HUMAN/WAITING separada, sem quiescência retroativa.


### Preparação documental da primeira transição — 2026-09-26

Candidato funcional a1cc380e e recovery 03f930e5 preservados; nenhum teste/build,
implementação ou migration repetido. HEAD alvo 5ee2de6b e unit PM2 reconfirmados
somente por leitura. Novas saídas privilegiadas não localizadas; tentativas
sudo -n continuam exigindo senha. Configuração efetiva Nginx/IPv4/IPv6 e inventário
completo de supervisores NÃO estão confirmados. Gate G0 pendente.
Procedimento futuro e pedido preciso ao operador no runbook, seção “Primeira
transição — plano condicionado às evidências do operador”; consolidação no
preflight único `docs/saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md`.
Recomendação: parada explícita da API antiga, recovery fechada para atendimento,
depois candidato fechado. Owner decide interrupção/incerteza (A) e abertura (B)
separadamente; backup fresco/restore e validação de atendimento são gates.
NOT DEPLOYED / OWNER UI PENDING; primeira transição e CRA pendentes. Sem prova
retroativa de drain, sem promessa inbound/retry. 6683 CLOSED, histórico owner
PASS preservado e DELIVERED/READ → HUMAN/WAITING separado. Nenhuma operação mutável.


### Consolidação G0 do owner — 27/09/2026

Evidências de Nginx/rede/DigitalOcean/systemd/cron recebidas e atribuídas ao owner,
sem repetir coleta nem inventar hashes/arquivos das saídas originais. A pendência
histórica de reenvio dessas saídas está superada. Leituras dirigidas de scripts e
metadados identificaram rotinas destrutivas de retenção e um PM2 root adicional;
saved/fallback/user units root ainda precisam de leitura privilegiada específica.
G0 parcialmente fechado: não presumir inventário completo ou disco=memória Nginx.
Plano exato de contenção central API, suspensão/restauração de cron, prevenção de
resurrect e reversão no RUNBOOK_WHATSAPP_AGENT, complemento executivo 27/09;
matriz observado/proposto/pendente no preflight único. Backup duplicado/.bak Nginx
são higiene separada, sem correção incidental. Backup fresco+restore isolado,
responsáveis e decisões A (primeira parada/incerteza) e B (abrir campanhas)
continuam gates. Recuperação fechada → migration aditiva → candidato fechado →
validação de atendimento; sem dump sobre produção como rollback automático.
Candidato a1cc380e/recovery 03f930e5 inalterados; nenhuma suíte/build/migration ou
implementação repetida. NOT DEPLOYED / OWNER UI PENDING, sem aceite CRA, sem
quiescência retroativa ou garantia inbound/retries. 6683 CLOSED; contratos prévios,
HUMAN/WAITING, worker/sessões e DELIVERED/READ separado preservados.


### Complemento dirigido PM2 root — 27/09/2026

> Histórico: projeção recebida posteriormente; pendência de coleta encerrada abaixo.

Owner encerrou leitura de dump.pm2/dump.pm2.bak (ausentes) e user units root ([]).
Não repetir pedido nem interpretar como inexistência de daemon/apps/iniciadores.
Leitura dirigida confirma daemon em scope de sessão active/abandoned, PPID 1;
origem histórica desconhecida, sem mecanismo automático root PM2 comprovado.
Manager user@0 ativo: pendência exata é projeção das units carregadas/habilitadas
(inclusive transientes), com bloco único sanitizado no runbook, e responsável por
intervenções/automações externas. Resurrect deploy continua mecanismo comprovado.
Controle atual demonstrado pode encerrar gate sem recuperar origem histórica.
Preflight é fonte da evidência; plano/impacto/reversão anteriores preservados.
Backup/restore, responsáveis e decisão sobre chamadas incertas seguem separados.
Somente documentação; candidato/recovery inalterados; NOT DEPLOYED / OWNER UI
PENDING; 6683 CLOSED; divergência de materialização separada.


### Root user manager — projeção encerrada, decisão operacional pendente

Owner forneceu PYROOTLIVE sem erros em 27/09/2026. Não repetir leitura/dumps/G0.
Preflight registra estados, origem e limites; runbook encerra a coleta dirigida.
Sem iniciador automático root PM2 comprovado, sem inferência de inexistência de
indiretos pelo nome e sem investigação indefinida da origem histórica. Nenhuma
leitura de produção, teste/build ou implementação nesta consolidação.
Pendência material passa a ser confirmação owner de responsáveis/controles sobre
intervenções e automações externas. Backup fresco/restore isolado, operador/DBA,
RPO/indisponibilidade e decisão A sobre chamadas incertas continuam independentes.
Depois desses gates, decidir contenção/parada antiga/retorno recovery fechada;
migration e abertura B separadas. NOT DEPLOYED / OWNER UI PENDING; 6683 CLOSED;
CRA pendente, DELIVERED/READ separado e worker/sessões preservados.


### Preparação operacional da noite 27/09 — decisão A pendente

Owner nomeou Deifson Oliveira e confirmou execução única Deifson/Codex; coleta G0
não repetida. Produção 5ee2de6b e processos preservados. Backup novo sem retenção,
dump 21.738.573 bytes/checksum, restore PostgreSQL isolado PASS em 4,299 s;
conteúdos/config também extraídos e conferidos. 85/85 seeds decriptados; 9/10
segredos de canal: Telegram restante tem ciphertext malformado (IV/tag 4/9 bytes),
sem correção incidental ou provider. Não declarar recuperação integral do canal.
Releases exatas a1cc380e/03f930e5 independentes e verificadas, env privado/storage
preservados, inativas; guard ainda não provisionado. Compilação de empacotamento,
sem repetir suítes. Recovery local sem rede externa e role read-only: bootstrap/
health 0,829 s; não comprova retorno produtivo; SIGTERM do probe não encerrou em
10 s e somente o processo local foi finalizado. Runtime produtivo não alterado.
104 campanhas, zero scheduled; 61 intents/61 aceites correlacionados; 16 test-sends
com resultado. Chamadas sem registro continuam desconhecidas; não reenviar.
Preflight centraliza caminhos/hashes/recursos/limites, runbook comandos revisados.
Pendências para A: check nft por Deifson, disposição Telegram, fim de janela e
contingência confirmados, acesso superadmin privado para validação. Proposta até
23:00 + reserva operacional de 20 min, condicionada ao owner, não SLA. Nenhuma
parada/firewall/cron/boot/migration/deploy executados. Migration/abertura separadas;
NOT DEPLOYED / OWNER UI PENDING; 6683 CLOSED; CRA e materialização separados.


### Etapa A executada — 27/09/2026 à noite

Recovery03f930e5 ativa com campanhas permanentemente fechadas; API antiga retirada;
frontend/worker preservados. Contenção 21:22:54–21:30:53 (7min59s), Inbox/CRM demo
confirmados pelo owner, GET superadmin guard available/closed/build correto.
Saved/fallback seguros, boot inactive/enabled e crons originais restaurados.
Dois defeitos de configuração encontrados/corrigidos durante contenção: nome CJS
não reconhecido como ecosystem e env com metadados PM2 sobrescrevendo script/cwd.
Houve inicialização indevida do código antigo entre 21:27 e 21:28, com barreira
mantida/scheduler campanhas inibido, seguida de parada e configuração corrigida.
Não omitir o incidente nem alegar quiescência por contagens iguais. Configuração
válida recovery: stage-a.ecosystem.config.cjs; versões prepared são inválidas.
Configuração preparada do candidato também exige correção antes da ativação.
Preflight registra horários/limites, runbook invocação corrigida. Nenhuma mudança
funcional nos artefatos, migration, abertura, reenvio ou provider provocado na
validação. Telegram não usado/limitação aceita pelo owner, canal não validado.
Próxima decisão: autorizar migration aditiva separadamente, com novo backup,
status esperado e condições de abortar; manter recovery fechada. Candidato
NOT DEPLOYED / OWNER UI PENDING; CRA pendente, 6683 CLOSED, materialização separada.


### Migration aditiva com recovery fechada — 27/09/2026

[Registro operacional e limites](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#migration-aditiva-aplicada-com-recovery-fechada--27092026).
Após 87335585, backup persistente fresco verificado e somente migration da fila
aplicada via Prisma em 3,238 s: 59→60 concluídas, checksum/catálogo/status conferidos.
Recovery 03f930e5 ATIVA, campanhas permanentemente fechadas; frontend/worker
preservados. Owner confirmou Inbox/CRM demo pós-DDL, sem envio provocado.
Configuração candidata limpa .config.cjs resolvida pelo PM2 isoladamente, sem start;
artefatos inválidos preservados. Dump fresco não restaurado: reutilizado ensaio
do dump anterior identificado no preflight. Sem alteração de drift histórico.
STOP: candidato a1cc380e NOT DEPLOYED / OWNER UI PENDING; ativação fechada e abertura
exigem decisões separadas, CRA pendente. Não inferir quiescência retroativa ou
validar todos os tenants/webhooks por health/demo. Telegram separado/não validado;
6683 CLOSED, owner PASS anterior e divergência DELIVERED/READ preservados.


### Candidato implantado fechado — 27/09/2026

[Estado e limites comprovados](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#candidato-ativado-com-campanhas-fechadas--27092026).
Backend e frontend a1cc380e ativos; worker 5ee2de6b preservado, recovery 03f930e5
disponível para retorno. Frontend compilado isoladamente uma vez; troca sequencial
sob contenção 2min09s, crons/boot e saved/fallback seguros restaurados. Health,
guarda fechada e BUILD_ID servido conferidos; owner confirmou telas/sessão/detalhe.
Grupo de execução não comprovado (DB sem grupos); nenhum fixture/envio produtivo.
Às 22:27:39: zero jobs/grupos/leases/agendamentos/sending. Guarda fechada e scheduler
desabilitado permanecem; abrir guarda pode admitir envio manual mesmo sem timer.
**DEPLOYED / CAMPAIGNS CLOSED / SCHEDULER DISABLED**, sem aceite CRA ou validação
completa de lotes/owner UI. Abertura e habilitação do scheduler exigem decisões
separadas e nova leitura do estado. Sem quiescência retroativa/inbound garantido.
6683 CLOSED, Telegram/materialização separados, histórico owner PASS preservado.


### Liberação controlada — 27/09/2026

[Registro auditado e limites](saas/CAMPAIGN_TARGET_PREFLIGHT_2026-09-26.md#liberação-controlada-concluída--campanhas-abertas-e-scheduler-habilitado).
Após 84e92930 e autorização explícita, somente API a1cc380e reiniciada para habilitar
scheduler com guarda fechada; atendimento confirmado pelo owner. Fila novamente
vazia antes do POST superadmin: abertura 22:43:42.139, geração 0→1, motivo auditado.
Duas varreduras reais consecutivas observadas com intervalo 60s, sem trabalho
pendente/envio observado; nenhum fixture ou envio provocado. Frontend/worker
preservados, saved/fallback/configuração persistente e crons/boot conferidos.
**CAMPAIGNS OPEN / SCHEDULER ENABLED**; lotes completos/validação funcional e CRA
continuam pendentes. Restart com guarda aberta não ensaiado, incertezas antigas
não encerradas. Próxima validação owner exige audiência/destinatários controlados
e revisão de template/variáveis antes de qualquer envio. 6683 CLOSED, Telegram e
DELIVERED/READ separados; histórico owner PASS preservado.
