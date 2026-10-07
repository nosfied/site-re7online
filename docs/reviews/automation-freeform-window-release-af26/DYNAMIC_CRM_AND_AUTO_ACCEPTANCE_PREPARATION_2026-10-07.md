# Audiência dinâmica e AUTO — preparação separada, 07/10/2026

**AUDIT / PREPARATION ONLY.** Sem consulta produtiva nova, envio, edição de CRM/configuração, desconexão, teste ou build nesta rodada. API/worker afbb e frontend9f preservados. Pré-condições abaixo ainda dependem de destinatário e situação CRM indicados pelo owner; não afirmar que já existem.

## Audiência CRM dinâmica — mínimo discriminante

Contrato: `DYNAMIC_CRM_FILTER`, situação pelo ID do próprio tenant, previsão não congela destinatários; snapshot único quando a fila adquire a execução, então população imutável. Fonte: `routes.ts`, `campaignRunner.ts` e `page.tsx::handleCreateDynamicScheduledCampaign`. A UI atual cria controlador/conjunto dinâmico e agenda; não usar conversão `DYNAMIC_FILTER_AS_STATIC`. Filtros texto/canal da prévia estática não restringem a execução dinâmica, cujo predicado é situaçãoCRM. A estimativa vazia é permitida pelo handler; selectedLeadIds=[].

O documento histórico `DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md` descreve o caminho antigo individual/limite1.000 e status NOT DEPLOYED da sua etapa. O código integrado atual também possui caminho batch, snapshot `campaign.dynamic_batch_snapshot.created` e divisão após snapshot; não transportar o limite antigo ou o status histórico para o controlador da UI atual. Provas reutilizadas: contrato/source tests e integração `campaignRunner.test.ts`3.001/quatro filhos, snapshot único e variáveis, providers simulados; smoke26/09 sem envios. Nenhuma reexecução ou PASS produtivo novo.

**Menor prova positiva: uma campanha, um destinatário canônico sob controle do owner, uma submissão Meta.** Exige mudança autorizada de associação CRM entre estimativa e execução; apenas esperar com o mesmo público não distingue dinâmica de estática.

1. Owner indica número controlado/template (data_exame se adequado) e uma situaçãoCRM ativa existente com zero outros Leads correspondentes. Conferir por leitura todos os matches da situação, aliases, elegibilidade/opt-out, conta/template/variáveis e baseline. Não criar situação/configuração nesta etapa. Se não existir filtro isolável sem atingir terceiros, parar e apresentar esse impedimento; não confiar na pesquisa textual para limitar o público.
2. Owner, em Campanhas → Audiência CRM → Filtro dinâmico do CRM, seleciona essa situação, template/variável fixa, Atendimento Geral/Fila Geral e horário futuro Fortaleza. Estimativa deve ser0. Owner confirma agendamento; Codex verifica filtro/ID/schedule, seed sem destinatários finais, sem snapshot/filhos/outbound. **Essa ação autoriza envio futuro e requer indicação explícita do owner.**
3. Antes do horário e com margem para conferência, owner move somente o Lead controlado para essa situação pela interface CRM, preservando histórico. **É mutação CRM deliberada, requer autorização específica; não será feita por iniciativa do Codex.** Leitura confirma1match único elegível e nenhum terceiro. Se o público deixar de ser controlado, pedir cancelamento pela interface antes da execução, sem editar banco.
4. Na execução natural, conferir snapshot que inclua esse Lead ausente na estimativa, um filho de1destinatário, job/ownership, uma submissão Meta, variáveis/destino preservados, terminal e Result Truth. Recebimento confirmado pelo owner separadamente. Janela deve manter lastInboundAt/expiry anteriores, sem inbound inventado; se já aberta, não afirmar teste desde janela fechada. Nenhuma resposta/claim necessária para provar reavaliação.
5. Imutabilidade pós-snapshot/restart já tem prova local; não provocar corrida, restart ou segunda edição produtiva para ampliar este aceite. Não restaurar situação CRM automaticamente após o teste: eventual alteração posterior depende de indicação do owner. Alternativa zero-envios: estimativa1→retirada autorizada do único Lead antes da execução→snapshot0; comprova reavaliação vazia, mas não envio dinâmico positivo.

## Contingência reativa HYBRID/AUTO

Contrato canônico `docs/saas/whatsapp-transport-policy.md`, relatório `REACTIVE_TRANSPORT_CONTINGENCY_LOCAL_2026-10-05.md` e `reactiveOutboundPolicy.test.ts`: três intenções INTERACTIVE_REPLY/PROTOCOL_NOTICE/REACTIVE_AUTOMATION. Auto prefere Web pronto; apenas lifecycle disconnected + observedState DISCONNECTED, com alternativaMeta habilitada e identidade híbrida compatível, permite Meta **antes** da submissão. QR_REQUIRED, unknown, disabled, credencial/conta alterada, política recusada e janela expirada negam. Seleções explícitas sem alternativa. Timeout/resultado ambíguo não autoriza novo sender; campanhas/templates sempreMeta-only.

Negativas locais já comprovadas e reutilizadas: expiração após preparo, inbound não comprovável, tenant/conta/identidade divergentes, intervenção humana, mudança de decisão, timeoutWeb/Meta com uma tentativa e sem segunda submissão. Readiness é pontual; nenhuma garantia de cancelamento de chamada já submetida. Registro de FAILED não prova que o provider não entregou.

**Prova possível em demo sem afetar sessões: rota normal Auto, uma resposta humana autorizada numa conversa controlada com inbound legítimo recente e janela aberta.** Reconfirmar seleçãoAuto atual (a mudança do owner em07/10 não elimina necessidade de leitura no momento), Meta/Web habilitados, conta/número equivalentes, Conversation/runtime canônicos, responsável e RBAC. Owner envia uma resposta curta pela Inbox; conferir decisão INTERACTIVE_REPLY/auto/Web, um outbound, recebimento e identidade/ciclo/janela preservados. Não claim/reentrada/envio de protocolo extra apenas para ampliar teste. Isso **não é PASS de contingência**.

**Prova positiva de contingência sem desconectar: aguardar indisponibilidade natural comprovada da sessão demo.** Com janela ainda válida, seleçãoAuto e Meta autorizada/mesma identidade, owner indica uma resposta única. Codex reconfirma elegibilidade antes da ação; backend revalida antes do provider. Conferir decisão/motivo de contingência, uma submissãoMeta, um outbound e recebimento. Se sessão reconectar/decisão mudar, negação é resultado válido e não se tenta novamente automaticamente. Não tocar em sessão compartilhada, firewall, configuração, auth ou outro tenant para fabricar indisponibilidade. Sem ocorrência natural, positivo permanece NOT EXERCISED; laboratório isolado existente sustenta apenas prova local.

## Sequência restante do backlog

1. Audiência dinâmica demo: identificar filtro isolado e destinatário; uma campanha futura e mudançaCRM deliberada somente após indicação do owner. Separada do estático e do agendamento individual já aceitos.
2. Auto normal demo: caso reativo controlado com janela legítima; envio único autorizado. Contingência positiva só por indisponibilidade natural/caso conhecido, sem desconexão artificial.
3. Agrupamento: execução natural autorizada pelo próprio tenant; correlacionar lotes/variáveis/submissões/resultados quando houver caso concreto, sem campanha técnica em massa.
4. CRA-PR: demanda de acompanhamento BOT e aceite pelo próprio tenant continuam separados dos aceitesdemo. Confirmar escopo/configuração legítima/casos reais antes de qualquer interação; leitura atual sem campanhas não constitui aceite. Não habilitar chave nem inferir aceite por prova de outro tenant.
5. Históricos e eventual saneamento dos quatro registros ficam em frente separada com diagnóstico/dry-run/decisão; não reparar nesta sequência. Status atrasados com intervenção humana apenas por observação natural. SECULT/DB-only encerrados, reparo de setembro CLOSED, Guia inatividade pausado; nenhum item encerrado reaberto sem evidência nova.


## Consulta dirigida demo — 07/10,11:13:59 Fortaleza

Resolvedor canônico de situações executado nos compilados API afbb em transação READ ONLY, fonteDB; sem iniciar aplicação/provider. Consultas com timeout e limites; evidência privada local, sem números completos ou conteúdo no Git. Prévia canônica reutilizada para elegibilidade, além de contagem bruta do predicado dinâmico Lead.status: **zero elegíveis isoladamente não basta**, porque a execução reavalia Leads e a prévia tem seu recorte próprio.

- Situações ativas campaignEligible=true com **zero Leads e zero elegíveis**: `FOLLOW_UP`/Follow-up, `LOST`/Nao fechado, `NO_RESPONSE`/Sem resposta.
- `QUALIFIED`, `OPEN`, `COBRANCA`, `VENCIDO` têm zero elegíveis na prévia, mas4/2/2/1Leads respectivamente: não escolhidas como filtro vazio isolado. `WON` vazio, porém campaignEligible=false: não escolhido.
- Contato controlado4366: um Lead e um item elegível, situação **NEW/Novo**, sem bloqueio na prévia; controle do número estabelecido no aceite avulso anterior.6787 também tem um Lead elegível emNEW.9614 tem dois Leads históricos NEW/NURTURE e um elegível; evitar essa ambiguidade desnecessária na prova dinâmica.

**Combinação proposta, ainda não autorizada para alteração:4366 + FOLLOW_UP/Follow-up.** Preservados ID do Lead e situação originalNEW nas evidências privadas. Efeito de uma futura mudança pela interface: o único Lead4366 passa a satisfazer Lead.status=FOLLOW_UP; expectativa0→1antes da execução, se nenhum outro contato mudar. Não altera situação dos demais, identidade ou histórico; restauração aNEW somente mediante autorização posterior, sem automatismo. Reconfirmar público integral antes do agendamento/execução.

A UI9f permite agendar com estimativa0: o botão dinâmico exige situação/horário/template/variáveis, sem exigir eligibleItems>0; handler usa selectedLeadIds=[] e exige data futura. O filtro dinâmico atual restringe por situaçãoCRM; campos q/canal/opt-out/conversa do formulário estático são desabilitados/omitidos, portanto não constituem alternativa para limitar a um celular. Não é necessário novo filtro: FOLLOW_UP está vazio no predicado real.

Aguardar indicação explícita de Deifson da combinação antes de criar/agendar ou mover. Depois conferir template aprovado/permitido, variável preenchida, Atendimento Geral/Fila Geral e horário futuroFortaleza. Nenhuma autorização ou valor desses itens foi inferido nesta consulta. AUTO normal poderá ser acompanhado numa interação futura explicitamente indicada, após conferir janela legítima/conta/identidade/seleção e correlacionar transporte efetivo/uma submissão; contingênciaMeta permanece aguardando indisponibilidade natural.


### Combinação escolhida e pré-requisitos — 07/10,11:17Fortaleza

Owner respondeu “perfeito” à proposta4366→Follow-up, tratada como escolha da combinação, não como execução de agendamento/mutaçãoCRM. Consulta read-only seguinte: data_exame approved/UTILITY/pt_BR, posição{{1}} exigida; políticaDB permiteUTILITY; templateMeta ready/hybrid_template. Atendimento Geral ativo e Fila Geral vinculada encontrados. Resolver reativo atual ready/Web/hybrid_auto: confirma rota pronta, não submissão/aceiteAUTO. A primeira consulta auxiliar selecionou isActive inexistente no modeloQueue e foi recusada pelo Prisma; seleção corrigida, sem mutação/código funcional. Ainda pendentes horário futuroFortaleza e valor fixo da variável indicados pelo owner. Não agendado, não movido; originalNEW preservado.


### Horário e variável indicados — 07/10,11:19Fortaleza

Owner definiu11:30Fortaleza em07/10/2026 (14:30Z) e valor fixo de{{1}} `24/06/2027`. Leitura dirigida11:19:06 reconfirmou FOLLOW_UP com0Leads e Lead4366 aindaNEW. Margem observada cerca de11min; ação pela interface deve continuar futura. Orientado agendar filtro dinâmico (não destinatários fixos), manter contatoNEW até conferir persistência do agendamento e só então realizar mudançaCRM explicitamente indicada. Nenhuma ação de gravação pelo Codex.


### Agendamento pelo owner conferido — 07/10,11:23:28Fortaleza

Campanha teste out.11, `cced263e-dd8f-49d9-89be-ef8a8ab45e96`, scheduled, horário14:30Z/11:30Fortaleza; DYNAMIC_CRM_FILTER/FOLLOW_UP, valor fixo{{1}}24/06/2027 e Atendimento Geral/Fila Geral salvos. Controlador batch `06df74d4-aafd-4698-8cc5-aaf3b126e96b`, scheduled, chunkCount0/totalRecipients0; seed sem destinatários, zero snapshots. FOLLOW_UP ainda0Leads, contato4366 aindaNEW. Não declarar execução ou público congelado. Próxima ação orientada exclusivamente ao owner: mudar somente4366 paraFollow-up e informar conclusão antes deT para conferir público1.


## Execução dinâmica controlada — 07/10/2026

**CONTROLLED DYNAMIC CASE PASS / OWNER RECEIPT AND UI CHECK CONFIRMED.** API/worker afbb, frontend9f; interação exclusivamente pelo owner, acompanhamentoCodex read-only.11:25:41: Lead4366 FOLLOW_UP, updatedAt11:24:32.508; único match. Controlador ainda scheduled/0recipients,0snapshots/filhos/outbounds; jobqueued/attempt0. Conversation canônica `8dd94507-f721-4015-b6e5-e5693748c1a5`: inbound05/10 12:50:18 e expiry06/10 12:50:18, janela já expirada.

Após execução natural: snapshot único `campaign.dynamic_batch_snapshot.created`11:30:06.353, exatamente1destinatário final4366 (ausente do seed ao agendar). Filho `26a58fb3-a8ee-43c3-82c6-2715c7014fb0`, chunkIndex1/recipientCount1, criado11:30:06.412. Variável fixa24/06/2027 e Atendimento Geral/Fila Geral preservados. Jobs de materialização e filho completed/attempt1; duas etapas internas não são duas submissões. `submit_started`11:30:07.141, `provider_accepted`11:30:07.967; um outbound `17246295-24b8-4668-83c2-fb495b33fb89`, Meta/SENT11:30:08.377 e messageIddeterminístico do filho. Filho completed1/1; controlador e conjunto completed1/1 às11:30:08.694. Snapshot0→1 comprova reavaliação dinâmica, não repete o aceite estático.

Leituras11:31:16/11:32:02: timestamps inbound/expiry da Conversation iguais ao baseline, sem janela fabricada. Evento billing.active_message.delivered11:30:17; meta.usage.updated delivered11:30:18.876 e read11:30:50.287; Outbound continuaSENT, não reinterpretado como entrega. Owner confirmou recebimento com24/06/2027 e atualização do detalhe após11:30, separadamente dos eventos. PúblicoFOLLOW_UP permanece1; situação originalNEW não restaurada automaticamente. O recorte inicial de eventos não alcançava payload.campaignId do filho; corrigida somente a consulta auxiliar para conferir submissão/aceitação, sem mutação funcional.

Não exercitados: mais de um lote, reavaliação após snapshot/restart, falha/parcial, retorno humano deste ciclo, AUTO reativo ou CRA-PR. Não solicitar resposta/claim para ampliar o teste. Provas anteriores preservadas; sem deploy, retry, reparo ou novas suítes.

Confirmação do owner nesta rodada: “sim. sim.” ao recebimento/valor e atualização do detalhe. Não houve resposta pelo celular/claim solicitado. Caso encerrado com os limites acima; próxima provaAUTO permanece separada.
