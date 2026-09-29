# Acompanhamento de automação na Inbox — implementação local

## Publicação para auditoria independente

**PUBLISHED FOR REVIEW / NOT DEPLOYED.** Candidato funcional `d06a92b84f4308170a6f22a53cb6171cfbe6d6a2`, sobre c6884100/91230f88. [Patch, manifesto e composição do worker mínimo](../reviews/automation-worker-backport/README.md) versionados em commit documental separado. As seções seguintes preservam a evidência LOCAL VALIDATED e seus limites; publicação não é deploy nem aceite funcional. Sem nova execução de testes nesta etapa.

**LOCAL VALIDATED / NOT DEPLOYED.** Branch `review/campaign-recovery-20260926`; base `91230f8884faaab7adfc5cbc4a49967dee91a89a`. Delta revisado para commit local separado, sem push nesta etapa. Sem produção, migration, provider real ou ativação produtiva. Ativações/revogações abaixo ocorreram exclusivamente em tenants sintéticos do DB local.

## Contrato final e reaproveitamento

A decisão do owner substitui a proposta de destino confirmado/ADMIN-only. SUPERVISOR e ADMIN autenticados podem acompanhar todo o próprio tenant, independentemente de vínculo departamental, com opt-in. AGENT não recebe exceção. O departamento de BOT pode ser fallback Meta ou contexto intermediário de nó/opção; ele não fundamenta a nova autorização. Nenhum marcador, tabela, schema ou migration.

Reaproveitados Inbox, filtro/badge Automação, settings `/app/settings/inbox`, autenticação, isolamento por clientId, resolvedores operacionais e helper transacional. Chave `allowAutomationConversationsInInbox`, default false, GET para managers e PUT exclusivamente ADMIN em `/app/settings/inbox/automation-conversations`. Setter delimita um único campo, adquire lock e transforma configuração atual; audit event participa da transação. Escritores protegidos passam de 35 a 36 na guarda estrutural, sem enfraquecer a verificação. Campos SECULT e demais configurações preservados.

Critério do filtro existente centralizado: mode BOT; status nulo/WAITING/WAITING_USER; handoff NONE/none/ausente; sem assignedUserId/assignedAt. A consulta base já exige atividade inbound/outbound da Conversation, exclui registros apagados/anonimizados e usa isolamento tenant. Não interpreta qualquer WAITING como BOT: HUMAN, handoff ACTIVE/PENDING e atribuição humana ficam fora da exceção. IA/chatbot são modos de execução representados por esse controle BOT; não se cria categoria separada. CLOSED não entra; reentrada volta conforme o runtime atual, não por participação histórica.

Os itens aparecem **somente em Automação**: não entram em TODAS, Minhas, Não atribuídas ou contadores humanos. O contador Automação é separado. Limites/paginação da consulta existente permanecem; não se redesenhou contagem global. Na UI, não se apresentam unread/timer humano para a consulta BOT; não se alteram timestamps ou métricas persistidas. Auto-read e marcação de não lida não produzem escrita para BOT.

## Autorização, privacidade e realtime

Lista/contagens, detalhe, timeline/mensagens e mídia usam o mesmo classificador e resolução atual da chave; acesso direto nega a exceção quando desligada/ausente ou papel AGENT. Falha somente dessa resolução nega o grant e registra erro; não mascara outras falhas de banco. Permissões humanas e consulta SECULT continuam separadas.

Histórico segue `historyVisibleAfter`, exclusão de management_only e regras existentes; anexos da nova leitura reaplicam corte e conteúdo restrito antes de baixar, com no-store. Mensagens de consentimento/CSAT restritas não se tornam visíveis. Nenhum payload bruto de evento BOT é liberado pelo novo escopo.

WEB_SESSION usa management_only também como sinal de evento fora da fila humana, enquanto Meta pode publicar humanInboxVisible=true. A solução reutiliza **inbox.access.updated** para eventos BOT: hub consulta estado/chave/usuários e envia somente invalidação sem conteúdo a SUPERVISOR/ADMIN do tenant; REST recarrega o conteúdo permitido. AGENT e outro tenant não recebem nova entrega. Epoch de revogação existente impede entrega autorizada antes da alteração. Eventos de CLOSED/CSAT não entram na nova exceção. Sem novo protocolo ou infraestrutura; o caminho humano amplo preexistente de SUPERVISOR não foi reformulado.

Revogação nega novas leituras/entregas. Na revalidação/polling, UI remove BOT revogado inclusive quando selecionado (o merge anterior preservava o selecionado; corrigido pontualmente). Não promete remoção instantânea nem apagar conteúdo já recebido. Smoke exercitou revalidação por foco existente após revogação.

## Intervenções existentes: não são concedidas pela chave

- Claim/assign já aceita BOT quando controles existentes permitem: departamento/escopo, usuário elegível, capacidade aplicável e estado não CLOSED. O claim manual não verifica presença online; não confundir seus controles com os da distribuição automática. Transita explicitamente a HUMAN/ACTIVE/IN_PROGRESS e cria/preserva ciclo pelos mecanismos existentes.
- SUPERVISOR pode ler sem departamento, mas seu claim nessa condição continua negado por escopo. Com departamento autorizado, claim funciona. ADMIN mantém seus poderes anteriores; leitura não equivale a atribuição.
- Transferência explícita existente respeita escopo, responsável/papel e elegibilidade do destino; teste ADMIN→agente confirma transição humana. Não se alteraram handlers de claim, transfer, send ou lifecycle.
- Composer continua condicionado a controle humano/responsabilidade e canal. Ler BOT não habilita envio; atender após claim usa o caminho anterior. Nenhum teste fez envio real. Transferência/claim local não chamou provider.

**Limitação material preservada:** resposta automática em andamento pode ter sido submetida ou ainda vir a ser submetida após intervenção. 91230f88 protege persistência obsoleta, não cancela provider. A coordenação de admissão/resposta em andamento permanece uma limitação técnica separada, não uma redefinição da frente maior pendente. Não prometer interrupção instantânea por “Assumir”.

## Evidências locais

DB isolado `re7_secult_20260928`, tenants/usuários/conversas sintéticos; testes de rotas reais com fetch externo proibido. Artefatos privados em `local-evidence/bot-inbox-20260929/`, fora do Git.

| Prova | Resultado / alcance |
| --- | --- |
| Rotas BOT finais | **10 PASS**: chave ausente/false/true, ADMIN setter, SUPERVISOR read, AGENT/outro tenant negativos, campos alheios, lista/contagem/TODAS, detalhe/timeline, mídia e corte, revogação, concorrência com assinatura, leitura sem alterar runtime, claim e transferência reais |
| Suíte afetada final | **36 PASS**, inclui os 10 anteriores + ownClosedConversations (SECULT/realtime/revogação), messageVisibility e guarda de escritores. Não somar como casos independentes |
| Lifecycle WEB_SESSION selecionado | **22 PASS** em CSAT, CLOSED/reentrada, human takeover/WAITING. Seleção por nomes; não reatribuir toda a suíte histórica a esta versão |
| Backend | `npm run build --prefix apps/whatsapp-agent`: PASS sobre código final |
| Frontend | `next build --webpack` em cópia isolada: **PASS sobre o código final**. `tsc --noEmit --pretty false`: **22 erros preexistentes**, diagnósticos idênticos à referência f06d49cb auditada após normalizar somente caminho; sem novos diagnósticos. Build não equivale a tipagem integral aprovada |
| Smoke autenticado | Login real com usuários sintéticos. ADMIN salva opt-in; Todas 0/Automação 2; SUPERVISOR acompanha e tem setter desabilitado; sem unread/timer humano; detalhe abre. ADMIN revoga enquanto SUPERVISOR mantém painel; foco/revalidação remove itens/seleção. Sem enviar/assumir no smoke visual |

Correções de fixture preservadas nos logs: email sintético com maiúsculas incompatível com normalização do login; bytes inválidos sob MIME PNG. Ajustadas fixtures sem alterar autenticação/validação de mídia. Falha inicial de conexão resolvida por proxy somente na cópia privada de UI; dev server preexistente preservado. Erros de browser da verificação final: nenhum registrado.

## API / frontend / worker mínimo

API: configurações, autorização/filtros de leitura e hub realtime. Frontend: settings, tipos e Inbox existente. Worker: **nenhum delta necessário para esta funcionalidade**. A base mínima preservada `bf5f1d76` + cinco fontes f06d49cb já tem callback `notifyAgentWebSessionMessageCreatedRealtime` em `whatsappWebSessionWorker.ts`, que encaminha eventos a `/internal/web-session/message-realtime`; ingest usa callback quando fornecido. O formato não mudou; a autorização/invalidação nova ocorre na API. A fonte `whatsappWebSessionWorker.ts` é byte-idêntica à cópia mínima preservada (SHA-256 f377b98b4850f08b5adcc715db754d69688201ebd25d624609f87c7401a71a61). Escritores f06d49cb já transformam configuração atual sob lock, preservando a nova chave. Sem rebuild/substituição do worker nesta etapa, sem atualização ampla para a árvore da API.

A correção automação × rodízio 91230f88 e seu backport local do worker são outra entrega, preservada; acompanhamento não substitui essa correção. Em futura implantação, API/worker/scripts escritores devem permanecer compatíveis; retorno a escritores antigos perde a garantia de revogação concorrente. Limites de tipagem/shutdown do worker continuam documentados; não se declara nova validação de worker nem de produção.

SECULT DEPLOYED / CLIENT ACCEPTED; DB-only encerrada; 6683 CLOSED; inatividade no Guia pausada. Campanhas/CRA continuam aguardando validação funcional do owner, sem aceite produtivo inferido desta prova local. Telegram e DELIVERED/READ separados.


## Revisão final e roteiro do owner

Revisão dos 17 arquivos contra `91230f8884faaab7adfc5cbc4a49967dee91a89a`: os hashes coincidiram integralmente com o manifesto da validação local. Nesta revisão, apenas documentação foi refinada; os 11 arquivos de código/testes permanecem byte-idênticos aos validados. Reutilizados 36 PASS (incluindo os 10 de Automação), 22 selecionados, builds e smoke; nenhuma suíte repetida sem mudança. Staging deve conter somente os 17 caminhos do escopo, excluindo `.data/`, `local-db-setup.log` e `local-evidence/`. Commit local autorizado; sem push, deploy ou ativação. A correção 91230f88 permanece parent separado.

### Matriz de intervenção existente (não concedida pelo opt-in)

| Ação em BOT puro | SUPERVISOR | ADMIN | Transição e restrições |
| --- | --- | --- | --- |
| Consultar | Todo o próprio tenant com chave ligada, inclusive sem vínculo/departamento | Igual | Nenhuma escrita operacional; privacidade/corte do histórico continuam |
| Assumir/atribuir | Exige acesso ao departamento atual; sem departamento ou fora de seu vínculo, 403 | Passa pelo escopo administrativo, mas o destinatário da atribuição continua sujeito à elegibilidade | `claim/assign`: usuário ativo do tenant, vínculo no departamento quando houver e capacidade aplicável. ADMIN sem vínculo não pode assumir para si uma conversa com departamento apenas por ser ADMIN (409 de elegibilidade); pode indicar destinatário elegível. Sem departamento, claim permite destinatário sem vínculo. Resultado HUMAN/ACTIVE/IN_PROGRESS e ciclo canônico |
| Transferir para usuário | Exige escopo departamental; não precisa ser responsável, pois o papel já permite gerenciamento | Não exige vínculo departamental do executor | `/transfer` exige departamento atual e destinatário ativo/mesmo tenant/capacidade. A rota existente usa `requireDepartmentMembership:false` para o destinatário; não foi endurecida nem ampliada neste delta. Resultado HUMAN/ACTIVE/IN_PROGRESS com destinatário |
| Mover para departamento | Exige acesso ao departamento de origem; BOT sem departamento não passa | Pode encaminhar BOT sem departamento ou de outro departamento | Destino ativo do próprio tenant, fila operacional canônica. Entra HUMAN/ACTIVE/WAITING, sem responsável; distribuição existente pode atribuir e tornar IN_PROGRESS |
| Enviar texto/mídia/template | Ler BOT não habilita envio | Igual | UI exige atendimento humano sob responsabilidade; backend mantém controles anteriores de modo, papel, departamento e transporte. Depois da intervenção, continuam condições do canal e permissões humanas existentes |

Referências: `http/routes.ts::hasConversationDepartmentAccess`, `canManageOwnedConversation`, handlers `/claim`, `/assign`, `/transfer`, `/transfer-department`; `queue/assignmentPolicy.ts::assertQueueAssignmentUserEligible`; `inbox/page.tsx::canSessionTransferConversation` e `canReplyToConversation`. O botão Assumir pode aparecer ao SUPERVISOR sem vínculo, pois a apresentação anterior não calcula toda a elegibilidade; o backend nega com erro, sem atribuir. Não houve redesenho de ações nem alteração desses handlers. Testes exercitaram claim SUPERVISOR negado/permitido e transferência ADMIN; as demais condições acima são revisão dos handlers existentes, não novos PASS de teste.

### Roteiro funcional posterior (ambiente autorizado, sem execução produtiva nesta revisão)

1. Com ADMIN, conferir chave ausente/desligada: BOT não aparece em Automação/TODAS e acesso direto é negado. Habilitar apenas no tenant de validação autorizado; SUPERVISOR não pode salvar a chave e AGENT não pode gerenciá-la.
2. Com SUPERVISOR e ADMIN, conferir conversa sintética/autorizada ainda em Meta/IA e WEB_SESSION/chatbot: Automação mostra, TODAS e contagem humana não incluem; abrir mensagens e anexo permitido sem atribuição ou alteração de estado. Conteúdo restrito continua ausente. AGENT e usuário de outro tenant não acessam nem por URL direta.
3. Com SUPERVISOR sem vínculo na conversa, acompanhar normalmente e confirmar negativa ao tentar assumir; depois usar conversa/departamento em que tenha vínculo e capacidade. Assumir explicitamente deve mover para atendimento humano e retirar de Automação. Usar conteúdo previamente autorizado; não enviar apenas para obter PASS.
4. Com ADMIN, encaminhar uma conversa autorizada para destinatário elegível ou departamento: conferir responsável/fila e a transição acima. A leitura anterior não deve ter consumido capacidade. Não presumir que ADMIN sem vínculo possa atribuir a si em qualquer departamento.
5. Manter painel de SUPERVISOR aberto e revogar pelo ADMIN. Novas consultas/anexos/entregas BOT devem ser negadas; revalidação/polling/foco remove seleção e lista. Não se promete instantaneidade nem apagamento do conteúdo já recebido. Repetir conferência com AGENT para garantir ausência da exceção.

**Resposta automática tardia:** limitação preexistente a este delta e registrada na correção 91230f88. Se a chamada já foi submetida antes de assumir/encaminhar, o contato pode receber a resposta automática depois da transição humana; não há cancelamento garantido. Há também lacuna anterior para resposta ainda não submetida quando o controle muda: a persistência protegida não constitui barreira atômica de admissão do envio. Esta implementação não toca os transportadores nem resolve essa coordenação. Não reenviar resposta incerta e não interpretar proteção de estado como garantia de ausência de resposta tardia.

Estado final: **LOCAL VALIDATED / NOT DEPLOYED**; aceite funcional futuro separado. Campanhas/CRA continuam aguardando validação funcional do owner.


## Auditoria dirigida posterior a c6884100 — corridas de leitura

**LOCAL VALIDATED / NOT DEPLOYED.** Dois riscos confirmados com reprodução negativa local sobre c6884100, sem consulta/mutação produtiva. Correção em commit separado; mantém o parent c6884100 e a correção 91230f88 distintos.

1. **Realtime confirmado:** evento message.created de origem BOT/none com conteúdo management_only, bloqueado antes da resolução, seguido de runtime CLOSED, era liberado como payload humano ao SUPERVISOR. A condição `state?.status !== CLOSED` removia a proveniência BOT. Removida somente essa dependência do estado atual: evento identificado como automação permanece no caminho sem conteúdo (invalidação ou nenhuma entrega) mesmo após CLOSED/HUMAN. Chave revogada nega entrega. A identidade inclui waIdCanonical e aliases; eventos humanos legítimos permanecem no caminho humano anterior. O status declarado em conversation.handoff.updated distingue uma notificação legítima de encerramento (CLOSED) de message.created antigo de automação, que não pode perder sua origem. Não se reformulou o realtime humano amplo preexistente.
2. **REST confirmado:** barreira na leitura inicial da chave seguida de transição para HUMAN em departamento alheio permitia que builder entregasse conteúdo sob a exceção BOT anterior. Agora a concessão BOT é vinculada à requisição: o builder valida seu alvo/estado resolvido e há nova verificação imediatamente antes do JSON/headers. Reutiliza resolveConversationTarget, loadInboxConversationState e resolveAutomationReadPermission; mesmo conversation ID e historyVisibleAfter, ainda BOT e chave válida. Se mudou para humano, a requisição anterior recebe 404; uma nova requisição passa pelas regras humanas/departamentais existentes, sem herdar o grant BOT. Falhas gerais de DB continuam pelo tratamento de erro; não viram sucesso vazio.

Mídia local e suporte: checkpoint após resolver arquivo e antes dos headers; mídia remota: checkpoint antes da busca e após o provider devolver resposta, antes de repassar corpo/headers. Se negada depois da busca, cancela-se o corpo remoto ainda não repassado. Sem transação/lock durante provider ou streaming. Corte de histórico/management_only permanecem; mudança de alvo ou corte durante preparação nega esta requisição.

**Momento e limite:** autorização é conferida nas leituras do checkpoint final anterior à entrega, não apenas antes da preparação. São leituras canônicas, não uma transação serializável entre banco e socket. Alterações posteriores às observações finais ou ao início da entrega não cancelam bytes já admitidos/recebidos; revogação não equivale a recolhimento de conteúdo. Não se promete atomicidade global entre alteração de política e rede nem interrupção retroativa de stream. Os testes demonstram as janelas solicitadas durante preparação e antes desse checkpoint, não todas as intercalações possíveis de infraestrutura. Nenhum mecanismo de envio automático foi alterado.

### Evidência nova, sem reatribuir suítes anteriores

- `automationConversations.test.ts`, seleção `--test-name-pattern='audit:'`: **4 PASS**, 0 falhas. Duas reproduções iniciais falharam antes da correção, confirmando os riscos.
- Primeiro caso: 4 combinações CLOSED/HUMAN × chave ligada/desligada com barreira no resolvedor de evento, identidade com alias/canonical, conteúdo restrito nunca entregue; controles humanos legítimos e notificações explícitas de encerramento preservados.
- Segundo: 6 combinações detalhe/timeline/mídia × handoff para fora do vínculo/revogação, entre autorização e builder/resolução.
- Terceiro: 6 combinações detalhe/timeline/mídia × handoff/revogação após busca de conteúdo e antes dos headers.
- Quarto: leitura BOT estável ADMIN/SUPERVISOR mantém sucesso/corte e não altera runtime; leitura humana autorizada continua com chave desligada.
- Build backend final PASS. Frontend/worker não alterados; não repetidos smoke, build frontend, 36/22 históricos ou suítes do worker. Essas evidências permanecem da versão anterior nos seus escopos; não são novos PASS desta correção.
- Provas privadas preservadas em `local-evidence/automation-audit-races/`, sem incluí-las no Git. Não houve teste com provider real; a revisão de streaming remoto foi de código, enquanto mídia local teve barreiras reais no harness.

**Pendências distintas:** (a) limitação técnica preexistente de resposta automática já submetida ou ainda em admissão durante intervenção, não resolvida aqui; (b) frente de Campanhas/CRA aguardando validação funcional do owner e inatividade no Guia pausada, mantidas como registradas. O rótulo anterior “demanda maior” para (a) foi corrigido; não substitui nem redefine as frentes pendentes. SECULT aceita/encerrada; 6683 CLOSED.
