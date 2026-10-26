# Campanhas: disponibilidade, mídia e homologação

Atualizado em 26/10/2026: **DEPLOYED_GUARD_CLOSED**. O deploy a959 foi concluído
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
Neste registro: deploy PASS; disponibilidade fechada PASS relatado; UI integrada,
inventário global fresco, abertura e envio PENDING. Não há nova autorização de
abertura ou chamada Meta concedida por esta atualização documental.
