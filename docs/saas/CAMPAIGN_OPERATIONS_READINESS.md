# Campanhas: disponibilidade, mídia e homologação

Atualizado em 26/10/2026: **GENERAL_OPERATIONS_OPEN / IMAGE E VIDEO HOMOLOGADOS EM ESCOPO CONTROLADO**. O deploy a959 foi concluído
conforme relatório do Codex local encaminhado pelo owner; não houve abertura da
guarda nem envio nessa janela. O editor documental não fez nova inspeção da VPS. Os históricos continuam válidos
no seu escopo e não são instruções para repetir recuperação ou envio.

## Causa e decisão operacional

A auditoria `guard37-provider-audit-20261010` comprovou aceitação pela Meta seguida
de falha de materialização CRM para número internacional. A tarefa filha ficou
pendente e a proteção global fechou as admissões. O encerramento canônico de
`out15-closure-20261012` cancelou o trabalho restante, preservando guarda 38
fechada, sem tarefas, sem autorizar reabertura. O estado atual deve ser novamente
observado; esses números históricos não são parâmetros de uma abertura futura.

O upload de campanha anteriormente não participava dessa admissão. Podia gravar
um asset antes de a criação do rascunho receber `campaign_operations_closed`.
O cliente também não traduzia esse código, exibindo erro genérico.

## Contrato da correção

- GET autenticado `/app/campaigns/availability`: ADMIN/SUPERVISOR, tenant ativo,
  feature campaigns, resposta sem cache e somente `operations.open`/`code`.
  Não publica tarefas globais, tenants, atores ou auditoria.
- Estado desconhecido ou consulta malsucedida mantém ações de escrita bloqueadas
  na tela. Upload/criação/envio/agendamento/retomada consultam novamente antes da
  ação. Consultas históricas e cancelamento/pausa não dependem dessa prévia.
- A prévia não é autorização. A API admite `purpose=CAMPAIGN` antes da primeira
  gravação de arquivo/asset e mantém a tarefa até a persistência terminar.
  Fechamento posterior impede novas admissões; trabalho já admitido participa do
  drain. Exemplos de templates continuam independentes da guarda de campanhas.
- A concorrência de upload cobre leitura e persistência, com liberação em finally.
- O código de suspensão recebe mensagem em português, inclusive nos envelopes
  de erro plano e estruturado. Falha de storage não é convertida em negativa de
  admissão: o resultado pode exigir investigação, não descarte automático.
- Mídia já carregada é preservada quando a criação é negada, inclusive por uma
  negativa definitiva. Essa negativa cobre a requisição atual; não exclui outro
  trabalho já admitido que possa estar vinculando o mesmo asset. O endpoint de
  descarte existente faz leitura de referências seguida de soft-delete e remoção
  física, sem provar exclusão concorrente de todos os escritores de referência.
  Portanto, não foi introduzido descarte automático de mídia por falha de criação.
  Uma retirada futura exige revisão de referências e exclusão desses escritores.
  Timeout, erro de transporte e 5xx genérico também preservam a mídia.
- Os dois assets órfãos históricos não são removidos por esta preparação.
  Reuso de hash entre campanhas não foi introduzido: requer contrato de posse,
  referência e descarte próprio, para não apagar mídia compartilhada.

## Conteúdo e categoria Meta

A mídia da campanha deve manter formato e finalidade do template. Promoção exige
marketing, inclusive quando combinada com conteúdo de utilidade. A aprovação do
exemplo não aprova antecipadamente qualquer arquivo usado posteriormente.
Templates com cabeçalho de imagem/vídeo mantêm corpo textual obrigatório.

Fontes oficiais consultadas:

- <https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components/>
- <https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization>
- <https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/utility-templates/utility-templates>

Não há promessa de classificação visual local nem de revisão prévia individual
de cada mídia de envio pela Meta.

## Gates de homologação e reabertura

1. Homologar em isolamento: guarda fechada/indisponível nega upload antes de
   storage; fechamento entre prévia e upload também nega; tarefa admitida impede
   drain até terminar; exemplos continuam disponíveis; RBAC/tenant/feature,
   tradução e preservação de mídia em negativa passam nos testes.
2. Revisar CI, impacto API/frontend e artefato único. Medir capacidade e pico,
   preservar retorno API/frontend e worker físico, aplicar o modelo canônico de
   implantação. Produzir uma única geração e classificar seus resíduos ao final.
3. Com a guarda ainda fechada, verificar interface autenticada: aviso visível,
   seletor de mídia e escritas bloqueados, histórico/CRM/Inbox saudáveis. Nenhum
   asset novo, campanha, job ou chamada Meta deve resultar dessa etapa.
4. Antes de propor abertura, obter inventário global fresco de campanhas,
   lotes, jobs, agendamentos, leases, intenções/resultados e referências de mídia.
   Cada trabalho não terminal precisa de disposição explícita. Zero tarefas no
   ledger sozinho não prova ausência de trabalho que o scheduler possa retomar.
   Verificar ledger/topologia, `.uncertain`, processos, boot/saved, backups e
   retorno. Não editar ledger, apagar locks ou repetir ack/recovery históricos.
5. Apresentar inventário e efeitos esperados. Abertura usa a operação canônica
   com CAS da geração fresca, ator e motivo, em janela autorizada. Não faz parte
   do deploy da UX nem dos testes. Não abrir automaticamente ao zerar tarefas.
6. Homologação de envio é outra ação explícita: tenant, destinatário controlado,
   consentimento, template aprovado, categoria, mídia, conta e custo definidos.
   Um único envio, sem retry automático; conferir aceitação, persistência CRM,
   webhook correlacionado e ausência de duplicação antes de liberar uso amplo.

## Evidência e encerramento

Registrar commit/CI, hashes do pacote e retorno, medições antes/depois,
processos/health, resultado de cada gate e resíduos por geração. Manter recibos
privados fora do Git; publicar somente o resumo sanitizado. Separar os estados
CODE_REVIEWED, DEPLOYED_GUARD_CLOSED, REOPENING_REVIEWED e SEND_ACCEPTED.
Nenhuma dessas transições é inferida de um build ou de uma tela HTTP 200.

## Sequência vigente após o deploy de 26/10/2026

Referência: [registro a959](releases/CAMPAIGN_AVAILABILITY_MEDIA_ADMISSION_2026-10-26_DEPLOYED.json).
API/frontend ativos relatados na release `immutable-a959129e-vps-20261026T023100Z`;
um save validado, marker/recibo finais, worker preservado e lock livre. Não repetir
deploy, build, save, ack ou cancelamento histórico para iniciar a homologação.
O status local dos templates observado em 24/10 é histórico e precisa ser reconferido;
não inferir aprovação Meta atual desse registro.

### 1. Trabalho imediato do Codex local — preparação e leitura

Usar o acesso já existente da máquina local à VPS; esta documentação não substitui
o operador. Confirmar a release/BUILD_ID, processos, health, dump final e ledger
persistente efetivamente usado por API/scheduler, com geração fresca, topologia/hostId,
variáveis de modo recovery, zero marcadores de incerteza e estado dos locks. Não
fixar geração 38 em comando futuro. Uma leitura administrativa de status canônico
pode criar lock temporário; para inventário estritamente somente leitura, reutilizar
leitor de arquivo estável e SQL read-only, sem importar entrypoint/runner/provider.

Inventariar globalmente todos os tenants em transação READ ONLY/RepeatableRead,
com timeouts e completude explícita, sem divulgar PII:

- campanhas e controladores/filhos, status, agendamentos e instante de elegibilidade;
- lotes/links e jobs por tipo/status, tentativas, owner/token/validade de leases;
- leases dos tenants, inclusive metadados expirados de jobs terminais, classificados
  sem tratá-los automaticamente como executores ativos nem apagá-los;
- intenções, aceitações/resultados persistidos, possíveis pendências/incertezas e
  disposição histórica de out.15; não reenviar aceitação já comprovada;
- rascunhos e mídia por finalidade/estado, vínculos e referência tenant-scoped;
- schedulers/consumidores, processos, boot/saved/cron e qualquer caminho capaz de
  admitir trabalho após a abertura, além da capacidade e retorno preservados.

Registrar quais trabalhos ficariam executáveis ao abrir. Zero tarefas no ledger não
substitui esse inventário. O job bloqueado histórico relatado no preflight não é
apagado nem retomado automaticamente. Cada trabalho não terminal tem disposição
explícita; se essa disposição exigir mutação, apresentar o ato concreto antes de agir.
Reutilizar consultas e leitores compatíveis, adaptados ao schema vivo; não executar
scripts históricos de recuperação. Entregar resumo sanitizado e custódia privada,
sem nova árvore de build ou cópias volumosas dispensáveis.

### 2. Aceite com guarda fechada

Conferir disponibilidade autenticada (`200/ok=true/open=false/campaign_operations_closed`),
RBAC/tenant e aviso em português. Para teste autorizado de negativa de upload
`POST /app/templates/media`, usar `purpose=CAMPAIGN` e arquivo sintético pequeno;
confrontar inventários antes/depois para comprovar que não nasceu asset/arquivo,
campanha, job ou chamada provider. Seleção desabilitada pela UI é um resultado
esperado; não forçar um caminho de escrita para alegar teste visual completo.
Distinguir teste direto da API, teste isolado de corrida e aceite real de interface.
A corrida prévia/upload e drain já têm testes: não fabricar corrida na produção.

**Antes de abrir Modelos/Campanhas**, revisar o carregamento de templates:
`GET /app/templates` pode chamar `triggerTemplateStatusSync`. Guarda fechada não
bloqueia essa sincronização. Sem autorização para Meta, não abrir essas páginas
indiscriminadamente. Preview com API simulada prova somente UI isolada; registrar
esse limite e deixar o aceite integrado da página para janela com sincronização
explicitamente autorizada, se necessária. Sessão autenticada pode ter atualização
normal de metadados, sem confundir isso com criação de dados de campanha.

### 3. Proposta de abertura — sem execução implícita

Apresentar o inventário fresco e a matriz de efeitos: abertura é global, não
restrita ao tenant de teste. Confirmar exclusão de outros operadores e ausência
comprovada de trabalho automaticamente elegível; o flock de implantação só exclui
procedimentos cooperativos, não bloqueia clientes HTTP nem o scheduler por si só.
Se não houver isolamento comprovado, não prometer janela exclusiva tenant-scoped.
Não inventar bypass por tenant, flag de teste ou provider substituto produtivo.

O mecanismo existente é `POST /admin/ops/campaign-execution`, autenticado como
superadmin, com `open`, `generation` fresca e `reason`; ele chama
`setCampaignOperations` com CAS, valida tarefas/topologia/uncertainty e audita ator
canônico. Não editar state.json, remover lock ou reutilizar helper/payload de out.14.
A geração observada pode mudar: conflito nega, sem retry automático.

A autorização deve nomear abertura global, tenant de teste, operadores, ações
permitidas (upload e rascunho), janela supervisionada e critério de encerramento.
Upload/rascunho não autoriza agendamento, envio, retomada, cancelamento ou descarte.
Usar mídia sintética sem PII, formato/categoria coerentes, preservar asset e rascunho
e verificar vínculo após reload. Não criar destinatários/agendamentos que liberem
envio acidental. Ao fim da janela controlada, fechar pelo mesmo mecanismo canônico
com geração então observada, sem apagar tarefas; conferir drain e deixar incerto
sob investigação. Planejar esse fechamento na autorização da própria abertura.
Não deixar guarda aberta indefinidamente por ter homologado um rascunho.

### 4. Envio controlado e encerramento

Envio requer decisão específica com tenant, conta, destinatário controlado e
consentido, template/idioma/categoria/aprovação, mídia/parâmetros e custo máximo.
Uma submissão, sem retry; comprovar resultado durável, CRM, webhook correlacionado
e ausência de duplicação. Timeout/aceitação incerta interrompe sem reenvio.
Sincronização de templates e envio são efeitos distintos: autorização de um não
implica a do outro. A homologação de envio não libera automaticamente os clientes.

Encerrar cada etapa com PASS/FAIL/PENDING, evidência vinculada e próximo ato.
Neste registro: deploy PASS; disponibilidade fechada PASS relatado; as etapas ainda não realizadas permanecem PENDING. O inventário e o resultado
posterior de um envio manual autorizado constam abaixo. Não há nova autorização de
abertura ou chamada Meta concedida por esta atualização documental.

## Inventário relatado de 26/10/2026 e decisão de continuidade

Fonte: auditoria do Codex local encaminhada pelo owner, snapshot PostgreSQL
`2026-10-26T11:14:04Z` (08:14:04 America/Fortaleza), RepeatableRead/ReadOnly.
O editor documental não repetiu a coleta. Guarda fechada, geração observada 38,
tarefas 0, sem lock do ledger ou marcador uncertain; topologia single-host válida,
scheduler habilitado e recovery-only desabilitado.

| Superfície | Resultado observado |
| --- | --- |
| Campanhas | 126; somente 2 rascunhos não terminais, em outro tenant |
| Campanhas vencidas / jobs reclamáveis / controladores recuperáveis | 0 / 0 / 0 |
| Jobs queued, running ou needs_review | 0 |
| Resultados pendentes / intenções sem terminal / aceitações sem terminal | 0 / 0 / 0 |
| Demo: aceitações explicadas | 82: 81 sent e 1 failed |
| Demo: lotes históricos | 3 completed, 1 cancelled, 1 failed, 1 blocked |
| Job bloqueado | batch_chunk, no_eligible_recipients, lease expirado; inerte |
| Lease desvinculado | expirado, sem job; não concede execução |
| Assets históricos de campanha órfãos | 2 VIDEO/stored, preservados |

Templates locais aprovados relatados: `imagem_previdenciario` (IMAGE) e
`video_previdencia_teste_20261024_v2` (VIDEO), ambos MARKETING/pt_BR no Demo.
Essa é observação local do inventário, sem consulta Meta nesta auditoria.
Evidência do inventário: SHA-256
`f9ad89081060ee69d9be443762b5775411bbf08b06bda49b34ec5cb079c0005d`;
índice privado: `566833683719ddb8e4bcc2df0f7beaf319c4bccde74c435902596b98121f3c35`.

O owner confirmou ausência de utilização de campanhas pelos demais tenants durante
a homologação de hoje. Essa confirmação é a exclusão operacional de outros usuários,
não uma barreira técnica tenant-scoped; deve continuar valendo durante a janela.
Revalidar somente o inventário necessário e a geração imediatamente antes do CAS,
sem repetir recuperação histórica ou abrir nova frente de diagnóstico sem negativa.

O [encerramento de out.15 em 12/10](../reviews/automation-freeform-window-release-af26/dynamic-integrated-prepared-20261012/out15-closure-20261012/RESULT_2026-10-12.md)
concluiu a disposição dos resultados e o cancelamento das cinco posições não enviadas,
com guarda 38 ainda fechada. Não exige fechamento permanente; também não certifica
correção genérica da identidade internacional. Não apresentar incidente encerrado
como ainda pendente, nem repetir seus ack/cancelamentos.

Próximo ato proposto: janela global supervisionada para um upload sintético e um
rascunho Demo via API, sem acessar listagem produtiva que dispare sync, sem enviar,
agendar, retomar ou excluir; preservar os dados de teste e fechar na mesma janela.
Abertura ainda não executada nem autorizada por este registro. O roteiro concreto
relatado usa `selectionMode=STATIC_RECIPIENTS`, contato de equipe autorizado,
MP4 válido sem PII abaixo de 16.000.000 bytes e deltas esperados +1 asset/+1 draft,
zero batch/job/agendamento/intenção/provider/outbound. Validar o contrato do payload
na API a959 antes da execução. Não exigir outro build/deploy/save.

## Homologação manual concluída — um vídeo, um destinatário

Resultado relatado pelo Codex local e encaminhado pelo owner em 26/10/2026:
**MANUAL CAMPAIGN HOMOLOGATION PASS / SEND_ACCEPTED_GUARD_CLOSED**.
O editor documental não executou a janela nem fez nova inspeção viva. A proposta
anterior foi sucedida pela autorização expressa do owner para envio real no Demo;
não há autorização de uso geral ou de repetição desse teste.

- Tenant Demo; destinatário único selecionado pelo owner, telefone não publicado.
- Template `video_previdencia_teste_20261024_v2`.
- Um upload VIDEO de 211.534 bytes, stored, vinculado à campanha; upload por conta
  confirmed, um attemptId e mediaId confirmado, mantidos privadamente.
- Uma campanha completed: total 1, enviados 1, bloqueados 0.
- Um job completed, tentativa 1; uma submissão provider, uma aceitação Meta,
  um evento de envio, zero falhas ou resultados incertos, sem repetição.
- Sequência: submit_started → provider_accepted → contact_bootstrap_ready → sent
  (HTTP provider 200) → webhook sent → webhook read.
- Conversa CRM resolvida/vinculada; sem crm_pending, persistência pendente ou
  reconciliação. O webhook read é status reportado, sem inferir confirmação humana
  adicional do destinatário.
- Guarda fechada canonicamente na geração 40: open=false, tarefas 0, drained=true,
  sem ledger fault. Zero jobs ativos, vencidos reclamáveis ou resultados pendentes.
- Health local/público ok=true/db=ok; mídia, campanha e evidências preservadas.

Índice privado final SHA-256:
`d0e8cb9eee4977bdb2225413db5b738232788ffa450300c0f52e803bc2c3466f`.
O hash prévio do ledger não deve ser reutilizado como hash da geração 40.

O aceite confirma a integração upload → campanha → Meta → CRM → webhook para
este único vídeo. Não certifica IMAGE, outros tenants, agendamento/multilote,
correção genérica internacional, regressões negativas da guarda ou isolamento
visual com fixtures que não tenham sido executados e relatados separadamente.
A guarda continua fechada por encerramento da janela, não por falha do teste.
Próximo ato: revisar o aceite e decidir as homologações restantes/liberação geral;
sem novo build/deploy/save ou reenvio para produzir prova repetida.

## Decisão posterior do owner — reabertura geral autorizada em 26/10

O owner autorizou a liberação geral após conferir atendimento ao ajuste documentado.
O ajuste de disponibilidade/admissão está implantado; CI do target a959 passou e o
PR documental #227 no head `c7007bed` passou em 4/4 jobs (run 40317358406).
O envio manual comprovou a integração VIDEO/Meta/CRM/webhook sem pendências, e o
inventário não encontrou trabalho antigo automaticamente elegível. O incidente
out.15 está encerrado desde 12/10; não é bloqueio remanescente a repetir.

**Estado da autorização: GENERAL_REOPENING_AUTHORIZED_PENDING_EXECUTION.**
Último estado efetivamente relatado: guarda fechada, geração 40, drained=true.
Este documento não declara a guarda aberta sem retorno do Codex local.

### Ato autorizado ao Codex local

1. Revalidar somente estado necessário imediatamente antes da abertura: release e
   health, ledger/generation/topologia, ausência de uncertain e tarefas pendentes;
   inventário de jobs reclamáveis, campanhas vencidas, controladores recuperáveis
   e resultados incertos, com disposição dos históricos preservada. Reutilizar
   leitores compatíveis; não repetir builds, homologação de vídeo ou recuperação.
2. Se o estado continuar compatível com a auditoria/encerramento, abrir uma vez por
   `POST /admin/ops/campaign-execution`, com autenticação canônica, geração então
   observada e motivo de liberação geral pelo owner. Não fixar 40 nem repetir CAS
   em conflito ou resposta incerta. Se houver trabalho inesperado, apresentar o
   efeito concreto antes de abrir; não cancelar ou reclassificar para passar.
3. Conferir resposta e ledger, geração posterior, availability autenticada aberta,
   health e ausência de pendência no encerramento do ato. Preservar recibo/auditoria
   e devolver evidência sanitizada ao owner; não chamar provider para fabricar teste.
4. Depois de confirmada a abertura, manter a admissão geral disponível. A regra de
   fechar ao fim de cada teste dizia respeito à janela manual anterior e não se
   aplica à liberação geral agora autorizada. Proteções canônicas de incerteza,
   idempotência, RBAC/tenant/feature, consentimento, categoria e limites continuam
   obrigatórias. Não alterar parâmetros de segurança, PM2, cron ou scheduler.

Abertura libera operações normais dos tenants e o scheduler já existente; não é
um novo envio, agendamento ou retomada por script. A exclusão de uso por outros
operadores durante o teste anterior não deve ser descrita como permanente após
esta liberação. A navegação normal pode sincronizar templates; a restrição zero
Meta era da preparação técnica, não um bloqueio novo à utilização autorizada.
Não excluir mídia/campanhas ou reenviar resultados aceitos. Não fazer novo save.

### Continuidade das homologações

- VIDEO manual de um destinatário: PASS; não repetir para obter a mesma prova.
- IMAGE: próxima homologação de mídia, com template aprovado, arquivo coerente e
  destinatário controlado definidos antes da operação. Confirmar mídia, campanha,
  CRM e webhook; não inferir esse aceite a partir do vídeo.
- Agendamento/multilote e cenários específicos de clientes continuam com seus
  roteiros e aceite próprios, sem impedir por si só a reabertura autorizada da
  admissão existente. Não declarar essas provas executadas.
- Negativas de guarda, tradução, RBAC/tenant e proteção de storage têm provas de
  código/CI; os cenários de interface que não receberam relato continuam separados.
- Testes adicionais com envio precisam de escopo/destinatário confirmados. A
  liberação geral permite uso normal, mas não autoriza o Codex a disparar testes
  adicionais indiscriminados nem retomar lotes históricos por conta própria.

Liberação comercial de funcionalidades/contratos específicos (incluindo CRA-PR)
não é automaticamente declarada por abrir a guarda. Registrar o resultado efetivo
da reabertura antes de marcar GENERAL_OPERATIONS_OPEN.

## Reabertura geral executada — geração 41

O Codex local relatou execução única autorizada: geração fresca 40, CAS único,
posterior 41/open=true/tarefas0/ledger fault ausente. Disponibilidade administrativa
autenticada confirmada. Gates pré/pós: zero jobs reclamáveis, campanhas vencidas,
controladores recuperáveis, jobs queued/running/needs_review, submissões iniciadas
pendentes, aceitações pendentes e marcadores de incerteza. Scheduler sem trabalho
histórico a executar. Health local/público ok=true/db=ok.

Recibo e disponibilidade autenticada:
`a89c999d631df355fdbd3d5be13bd62283d404ff574296309006e09671b9bff3`;
índice: `12f127ffad54a27a3f27ac1e1d43ca95335182472d3cc551717d6dab3bbad501`.
Hashes fornecidos pelo owner a partir da custódia privada; não é nova observação
viva do editor. Nenhum build/deploy/restart/save/envio de teste ou retomada histórica.

A pendência de execução da seção anterior está encerrada. Estado vigente:
**GENERAL_OPERATIONS_OPEN**. Não repetir CAS; não fechar ao fim de um teste normal.
Mantêm-se as proteções automáticas diante de resultado incerto e a ausência de
permissão para replay de aceitação. IMAGE, VIDEO e agendamento foram posteriormente
homologados e não devem ser repetidos; multilote e aceites específicos seguem separados.

## Homologação IMAGE concluída — dois destinatários

Relatório do owner/Codex local em 26/10/2026: **MANUAL IMAGE CAMPAIGN PASS**.
Campanha `Campanha teste out.27`, template `imagem_previdenciario`, completed.
Uma imagem stored/vinculada, upload Meta confirmed em uma tentativa, um job concluído.
O roteiro anterior previa um destinatário; o relato efetivo registra dois. Não
reescrever esse resultado como teste de um destinatário nem inferir autorização
anterior para o segundo. Trata-se de uma campanha com duas aceitações legítimas
relatadas, uma por destinatário, não duas campanhas ou evidência de repetição.

CRM persistido para ambos e webhooks correlacionados: um read e outro delivered.
Zero falhas, incertezas, duplicidade ou pendências globais. Guarda aberta, geração
41, íntegra e sem tarefas; health local/público ok=true/db=ok. Mídia/campanha e provas
preservadas; zero retry, build, deploy, restart ou save. Telefones, messageIds,
mediaIds e credenciais ficam na custódia privada, não neste documento.
Índice SHA-256:
`0b98ed13f0c4ca1c71a424c4ed8c3de02f2c02c20e59248aab506d280d21a0ae`.
Fonte: relato operacional; não é nova inspeção da VPS pelo editor documental.

O aceite cobre IMAGE para esses dois destinatários, além do VIDEO já homologado.
Não repetir imagem/vídeo para produzir provas equivalentes. A admissão geral segue
aberta; não há nova abertura ou fechamento a executar. Próximo ato: preparar o
escopo restante de agendamento/multilote ou aceite específico de cliente, conforme
prioridade do owner e seus roteiros, sem envio ou agendamento adicional implícito.

## Apresentação de mídia encerrada e sequência restante

O ajuste visual do composer foi aceito e implantado no frontend
`immutable-f1602787-vps-20261026T174702Z`, target
`f16027874e91c86e5f818d0888e6d735b07a6eda`, BUILD_ID
`HYTuoIlZopPMaTrcg6uiv`. Nome do rascunho e modelo aprovado estão alinhados; após a
seleção, a prévia substitui a área principal das instruções e as orientações ficam em
linha recolhível. O registro é
[`CAMPAIGN_MEDIA_LAYOUT_FRONTEND_2026-10-26_DEPLOYED.json`](releases/CAMPAIGN_MEDIA_LAYOUT_FRONTEND_2026-10-26_DEPLOYED.json).

Essa frente está encerrada. Não repetir build, ativação, `pm2 save`, IMAGE ou VIDEO
para obter a mesma prova. A sequência canônica restante é:

1. **Agendamento controlado:** primeiro preparar o escopo, template, destinatário,
   horário e critérios de aceite; somente depois pedir autorização explícita para a
   mutação. Provar uma única materialização/execução, ausência de duplicidade,
   resultado Meta, CRM/webhook e estado global final.
2. **Multilote:** começar por prova não produtiva/set-based e capacidade. Qualquer
   envio produtivo em volume exige universo de destinatários e autorização próprios;
   a homologação IMAGE com dois destinatários não certifica multilote.
3. **Aceites específicos de cliente, inclusive CRA-PR:** executar somente com
   conteúdo, categoria, template, tenant, destinatários e autorização daquele
   contrato. A guarda global aberta não substitui esse aceite.

Antes de cada ato mutante, fazer fotografia fresca somente dos gates pertinentes.
Não fechar/reabrir a guarda por rotina, não retomar históricos, não repetir provider
calls aceitas e não acoplar nova homologação a rebuild ou deploy sem mudança de código.

## Reconciliação do rascunho recém-criado — bloqueio antes de agendamento

Auditoria relatada pelo owner confirmou que as campanhas `.34` e `.35` possuem
UUIDs, modelos e estados independentes. A `.34` está concluída; a `.35` foi
persistida como `draft`, possui seu próprio `campaign.seed.saved`, dois contatos
elegíveis, zero jobs e zero mensagens de saída. Nenhuma chamada Meta ou execução foi
iniciada para a `.35`.

Classificação: **FRONTEND_POST_CREATE_RECONCILIATION_DEFECT**. O backend criou o
rascunho correto. A interface aguardava a listagem completa antes de selecionar o ID
retornado pelo POST; uma falha ou demora nessa leitura podia conservar visualmente a
campanha anterior.

Contrato da correção:

1. selecionar imediatamente o ID retornado pelo POST e limpar o snapshot anterior;
2. abrir o modal já vinculado ao novo ID;
3. carregar o detalhe pelo leitor autenticado, exigindo ID e tenant esperados;
4. atualizar a lista somente depois e de forma independente;
5. falha de detalhe ou lista não pode restaurar nem apresentar outro ID;
6. distinguir “rascunho criado; detalhe pendente” de “rascunho não criado”.

A regressão fixa o cenário `.34` selecionada → criar `.35` → detalhe/listagem
atrasados ou indisponíveis → modal continua obrigatório para `.35`. A correção de
código precisa ser revisada, implantada e aceita antes da homologação de agendamento.
Ela não autoriza envio, descarte do rascunho, nova chamada Meta ou repetição das
homologações IMAGE/VIDEO.

## Aceite manual das correções de rascunho e apresentação — 27/10/2026

O owner executou o roteiro na interface produtiva da release
`immutable-708f018c-vps-20261027T152109Z` e relatou PASS integral. O layout dos
campos ficou alinhado; prévia, orientações recolhíveis e responsividade passaram.
O novo rascunho permaneceu selecionado pelo ID recém-criado, sem conteúdo da
campanha anterior. Rascunho descartado e campanha cancelada exibiram seus estados
terminais próprios, mantendo eventual incerteza em alerta separado.

O aceite foi somente de interface/reconciliação: zero envio e zero agendamento.
Consequentemente, o bloqueio anterior à homologação de agendamento está encerrado.
Não repetir mídia, build, deploy ou a criação apenas para gerar a mesma prova. O
próximo ato mutante continua dependente de escopo explícito: tenant, template,
destinatário controlado, horário futuro, timezone e critérios de encerramento.

## Precedência entre lifecycle e observação operacional

O estado terminal persistido da campanha é a situação canônica apresentada na lista,
detalhe, fila e lotes. Um `executionState` transitório ou residual nunca substitui
`completed`, `failed`, `blocked` ou `cancelled` no badge. Para `cancelled`, o evento
persistido distingue `campaign.draft.discarded` (rascunho descartado antes de envio)
de `campaign.cancelled` (campanha iniciada com envios restantes encerrados).

Uma aceitação do provedor sem outbound local correspondente permanece observável,
mas em alerta operacional separado, com o predicado
`provider_acceptance_persistence_pending` e sua evidência. O alerta não altera nem
apaga o lifecycle terminal e não autoriza retry. Lista e detalhe usam a mesma função
de classificação; painéis de fila/lote preservam a mesma precedência.

A candidata `immutable-123ba7bd-vps-20261026T200100Z` e o PR #240 ficaram
superados pela correção desta precedência, mas permanecem preservados. Não instalar,
mesclar, apagar ou reaproveitar seus bindings implicitamente.

## Campanha teste nov.02 — suspensão global e continuidade por destinatário

Diagnóstico somente leitura do Codex local em 03/11/2026 para a campanha
`5d1e71b1-d2a4-497a-9c2d-25761d94416c`, tenant Demo. A criação persistiu os 963
destinatários aceitos de uma audiência com 1.152 solicitações e 189 bloqueios. Isso
comprova que o corte histórico em 25 não reapareceu nessa criação. Não autoriza
envio, retomada ou alteração da campanha.

A execução submeteu somente as posições 1–3. As posições 1 e 2 possuem resultado
durável. A posição 3 foi aceita pelo provedor e depois reportada como falha Meta
`130497`; a materialização CRM posterior à aceitação também falhou porque o número
internacional aceito pela elegibilidade não satisfazia o contrato brasileiro do
CRM. Não houve submissão da posição 4 em diante. A guarda global fechou com uma
tarefa `provider/persisting`, e o job permaneceu enfileirado com
`operational_suspension`. Portanto, a suspensão decorre de persistência
pós-provedor incompleta, não apenas do código Meta.

Contrato da correção proposta, ainda não implantada:

1. prévia, criação e execução usam a identidade operacional brasileira do CRM;
2. identidade inválida ou internacional não suportada é bloqueada e contabilizada
   por destinatário antes da chamada ao provedor, sem suspender a campanha;
3. aliases brasileiros, opt-out, deduplicação e isolamento por tenant permanecem
   obrigatórios;
4. falha definitiva conhecida daquele destinatário é persistida e permite o
   próximo; falha de conta/template continua encerrando a campanha; submissão
   incerta ou persistência incompleta continua fail-closed, sem retry automático;
5. a posição 3 recebe reconciliação histórica própria, preservando aceitação,
   falha e ausência de CRM, sem reenvio e sem reclassificação retroativa como
   bloqueio pré-provedor;
6. arquivar a tarefa reconciliada e reabrir a guarda são atos posteriores e
   separados. Reabrir pode iniciar os 960 destinatários restantes e exige nova
   autorização e recaptura operacional.

A guarda é global: enquanto fechada, protege todos os tenants. Essa abrangência
deve aparecer na revisão e impede tratar a retomada do Demo como mutação isolada.
O rascunho/campanha existente permanece preservado. O reconciliador dirigido é
dry-run por padrão e não cria CRM, não chama Meta, não altera contadores e não
abre a guarda.

Leitura dirigida de 04/11/2026 confirmou a origem da posição 3 sem nova mutação:
o `Lead` e a conversa já haviam sido criados pelo inbound de 30/10, antes da
campanha; não existe `Contact` nem `ContactChannelIdentity` para essa identidade.
Na execução, `conversation_resolved` apenas vinculou a conversa existente; não há
evento de criação ou reativação pela campanha. O telefone veio do inbound
normalizado e foi copiado para `Lead.phone`, `waIdCanonical` e `waId`. A campanha
então submeteu o mesmo destinatário ao provedor. Essa cronologia sustenta a
reconciliação histórica separada, mas não autoriza retomada.

Em 05/11/2026, já sob a release integrada `17cc77a8`, o Codex local recapturou os
bindings privados e executou somente o `dry-run` do reconciliador real. A guarda
permaneceu fechada na geração 42, com uma tarefa; `providerCalls=0`, os dois
resultados anteriores foram preservados e 960 destinatários permaneceram
pendentes. Bindings SHA-256
`dc67b3ebb9fb188d382c83b12dc5cdf44e7031dea9b87365aeb2658924fa1ad3`;
plano SHA-256
`bddc415429edd96e5e20333de12fddc3fd765866b61222d5bf3da1bb53837fde`.
Não houve `apply-sql`, arquivamento da tarefa, abertura da guarda, chamada ao
provedor ou continuidade da campanha. Cada ato posterior exige revisão e
autorização próprias.

Continuidade pós-cancelamento em 05/11/2026: a campanha permaneceu `cancelled`,
com `sentCount=2`, três submissões históricas e nenhuma submissão, aceitação ou
outbound da posição 4 em diante. O job continuou `queued` por
`operational_suspension`, sem lease; a guarda global continuou fechada na geração
42, com a mesma tarefa `provider/persisting`. Os bindings recapturados conservaram
o SHA-256
`dc67b3ebb9fb188d382c83b12dc5cdf44e7031dea9b87365aeb2658924fa1ad3`.

O plano anterior a esse cancelamento não é consumível no estado novo. O candidato
versionado `a1ee1154b5cfc1ee1cbd10437729cabc4c06f925` passou localmente pelo percurso
`sending -> cancelled`: o estado observado integra o hash do plano, o plano antigo
nega por drift e o receipt sucessor preserva `cancelled`. O `dry-run` dirigido do
candidato serializou o plano SHA-256
`0ba2823978c148ad6d144a7cc311cd00858a8660a36734b4edbf28431bac933a`,
com `providerCalls=0`, dois resultados preservados, 960 destinatários restantes e
continuidade não autorizada. A saída privada possui SHA-256
`4a0826260ff35551712fb51d09057117a470de4edae8143aa02b49feec5551cb`.

O primeiro lançador offline terminou depois da serialização com `-6` (`SIGABRT`),
sem stderr ou evento no journal do usuário. A causa foi reproduzida isoladamente:
o ambiente copiado do processo PM2 continha `NODE_CHANNEL_FD` e
`NODE_CHANNEL_SERIALIZATION_MODE`, mas o subprocesso Node não herdava esse canal
IPC. Uma sonda somente leitura concluiu `SELECT 1` e `$disconnect()`, abortou com o
ambiente integral e terminou `0` ao retirar exclusivamente as variáveis de
transporte IPC (`NODE_CHANNEL_FD`, `NODE_CHANNEL_SERIALIZATION_MODE` e o legado
`NODE_UNIQUE_ID`).

Com esse filtro, a repetição única do mesmo `dry-run`, usando os mesmos bindings e
bytes candidatos, terminou com código `0` e reproduziu exatamente o plano e a saída
privada SHA-256 já registrados. A fotografia independente posterior também terminou
`0`, gerou evidência SHA-256
`2bf7536c91a933a317c4dea90b7fcfc3c65c31750c7afe467fe0cfa112ef9106`
e confirmou campanha, job, tarefa, guarda e conjunto de efeitos inalterados. O
`dry-run` pós-cancelamento está concluído; seu plano continua sendo evidência para
revisão, não autorização de `apply-sql`. Aplicação, arquivamento da tarefa e abertura
da guarda permanecem atos separados e proibidos nesta etapa.

Fechamento posterior autenticado: o plano pós-cancelamento
`0ba2823978c148ad6d144a7cc311cd00858a8660a36734b4edbf28431bac933a`
foi aplicado uma única vez; o receipt
`272cb403-94cd-42ef-9187-e31e09d73246` passou no `verify-receipt`; e a tarefa de
hash `ffbfc9afc11515d45ff7bba6453dbde822bd084b67688e0193612edc9a898040`
foi arquivada por uma única execução de `ack-task`. A campanha permaneceu
`cancelled`, com `sentCount=2`, e nenhuma posição a partir da quarta foi submetida.
A guarda foi posteriormente reaberta por autorização própria, sem converter esse
fechamento em autorização para retomar a campanha. O plano anterior
`bddc415429edd96e5e20333de12fddc3fd765866b61222d5bf3da1bb53837fde`
permanece histórico e é incompatível com o estado pós-cancelamento.

A interface proposta pesquisa a lista gerada no conjunto integral no servidor,
mantém `Carregar mais` acumulativo e deduplicado dentro de uma área com rolagem
própria e exibe `Exibindo X de Y`. O detalhe do rascunho oferece `Limpar`, que
retorna à primeira página sem filtro. Ao iniciar processamento, a prévia deixa de
ser exibida e o painel de acompanhamento permanece. Essas mudanças não alteram a
seleção autenticada nem autorizam envio.

## Campanha teste nov.03 — resultado de submissão desconhecido

A leitura produtiva preservada em 05/11/2026 confirmou que a campanha chegou ao
ordinal 588 e fechou a guarda global na geração 45. Existe a intenção durável
`campaign.message.submit_started`, mas não existe `provider_accepted`, identificador
Meta, `OutboundMessage` nem resultado terminal para esse ordinal. Os retornos Meta
`131048` anteriores ocorreram depois de aceitações síncronas e não demonstram a
causa do fechamento. A evidência disponível também não comprova o limite inicial
de destinatários da Meta. Portanto, o ordinal 588 permanece **desconhecido**: não
pode ser reenviado nem convertido em falha definitiva.

Os reconciliadores anteriores só aceitam resultados conhecidos e não são aplicáveis
a este incidente. A disposição versionada específica deve:

1. reabrir seed, intenção de submissão, campanha, job e a única tarefa
   `provider/persisting`, vinculando tenant, run, ordinal e geração da guarda;
2. negar se surgir aceitação, outbound, resultado terminal ou qualquer drift;
3. registrar `providerAcceptance=unknown`, `definitiveFailure=false`,
   `retryAllowed=false`, `outboundMaterialized=false` e `providerCalls=0`;
4. preservar status e contadores da campanha e o job suspenso;
5. permitir arquivar somente a tarefa autenticada após verificação do receipt,
   usando o motivo `durable_submission_uncertain_no_retry`;
6. manter a guarda fechada. Reabertura e disposição dos destinatários restantes
   continuam decisões posteriores e separadas.

O fluxo é `dry-run` por padrão. `apply-sql` e `ack-task` exigem autorizações
distintas; nenhuma fase chama o provedor. Nesta entrega não há aplicação produtiva,
arquivamento de tarefa, reabertura da guarda ou retomada de campanha.

Fotografia pós-cancelamento de 06/11/2026: a campanha está `cancelled`, com
`sentCount=587`, job `queued/operational_suspension`, 374 destinatários posteriores
fora de execução e guarda fechada na geração 45 com uma tarefa
`provider/persisting`. O binding privado das custódias v2/v3 possui SHA-256
`00297e653ddb7dc1870662d82731e936205a08e314bf82ed57f2dc341893113b`.
O dry-run v2, ainda em `sending`, produziu o plano
`3f96d2baaaf3731089d26d5a30242f86d367515b12a33f4941a8b8da21fcb2df`
e não é consumível depois do cancelamento. O dry-run v3 terminou com código `0` e
produziu o plano pós-cancelamento
`afaf983128a092fd760d315d15ac7e12fcd4a0166f60079c792cbd45d52f4041`;
captura sanitizada SHA-256
`c2251de346fd4e6ec0fb1c3d638293cf71f4deb66247d2274bc33e2d51a49477`
e saída sanitizada SHA-256
`16e7be19b6b4ea6a483f11b15e55cc2b30eedfc0dd781dad1e927657a55b2654`.
Ele preserva `providerAcceptance=unknown`, `providerCalls=0`, `retryAllowed=false`
e continuidade não autorizada. O plano ainda não foi aplicado; receipt, `ack-task`
e reabertura da guarda permanecem pendentes e separados.

As correções de audiência e apresentação associadas permanecem independentes da
reconciliação: anonimizados ficam fora da prévia, criação estática e materialização
dinâmica pelo mesmo read model canônico; o aviso de divisão usa mais de 1.000
**elegíveis**, não o total bruto; há uma única ação de cancelamento; e a tabela
“Situação real por mensagem” possui rolagem vertical e horizontal própria. A
alternância visual posterior a um estado realmente incerto continua sem causa
comprovada e não é declarada corrigida por essas mudanças.

## Auditoria do agendamento estático e lacuna de audiência — 27/10/2026

Auditoria somente leitura relatada pelo owner para a campanha `Campanha teste out.36`
(`660f0eca-e6a8-4e49-9186-a40225fabdd1`) no tenant `demo-converta`.
O agendamento estático para `2026-10-27T23:35:00Z` (20h35 em
America/Fortaleza) foi executado uma vez e terminou `completed`: um job
`campaign`, `attempt=1`, dois destinatários distintos, dois outbounds e duas
aceitações do provider. Os dois resultados chegaram a `read`; CRM, contato, lead,
conversa, runtime e `campaign.recipient.contact_bootstrap_ready` foram confirmados.
Não houve terceiro destinatário, retry, duplicidade, resultado incerto, lease ativo,
job reclamável, reconciliação ou persistência pendente. Guarda aberta na geração 41,
tarefas zero e sem fault; health local e público após redirecionamento: PASS.

O contrato da API é fase-dependente e íntegro: enquanto `scheduled`, a audiência
pendente está em `draftReview.recipients`; depois de processada, os destinatários
saem desse vetor e seus resultados ficam em `messagesMetaStatus`. A interface 708f
consultava visualmente apenas o primeiro caminho no bloco de rascunho. Assim, uma
campanha concluída aparentava audiência vazia mesmo contendo os dois resultados.

Contrato obrigatório da correção:

1. rascunho e agendada exibem a audiência de `draftReview.recipients`;
2. campanha processada não repete resumo de destinatários: usa exclusivamente a
   seção “Situação real por mensagem”, alimentada por `messagesMetaStatus`;
3. nome, modelo, atualização e criação aparecem antes dos demais detalhes;
4. nenhum status interno cru, como `completed`, pode chegar à interface;
5. remover a explicação sobre serialização por tenant das telas de campanha;
6. a correção de apresentação não dispara novo envio nem altera o contrato da API.

O primeiro candidato foi ativado em `AWAITING_ACCEPTANCE` e passou nos itens de
identidade, texto removido e localização, mas o owner rejeitou a duplicação do resumo
em campanhas processadas; esse candidato foi revertido e retirado. A correção final
foi aceita na release `immutable-b96eb779-vps-20261028T025159Z`, estado
**DEPLOYED_SANITIZED**. A execução agendada e a apresentação estão homologadas e não
devem ser repetidas; multilote e homologações específicas permanecem escopos futuros.

Evidências privadas: 24 arquivos, índice SHA-256
`0b0079d064e343ba8727f11113aba600e1398896877d671e07a657446f8a39a8`.
O coletor saiu com código 134 apenas no teardown posterior à serialização, sem nova
consulta; o snapshot `READ ONLY / REPEATABLE READ` permanece válido no escopo
registrado.
