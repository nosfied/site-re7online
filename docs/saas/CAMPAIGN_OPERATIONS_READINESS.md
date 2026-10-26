# Campanhas: disponibilidade, mídia e homologação

Atualizado em 26/10/2026: **SEND_ACCEPTED_GUARD_CLOSED — UM ENVIO DE VÍDEO HOMOLOGADO**. O deploy a959 foi concluído
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
