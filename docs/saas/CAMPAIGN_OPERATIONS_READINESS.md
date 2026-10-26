# Campanhas: disponibilidade, mídia e homologação

Preparação de 25/10/2026. Alteração de código e plano de aceite; não registra
deploy, abertura da guarda ou envio produtivo. Os históricos continuam válidos
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
