# Guarda37 — implementação preventiva local e revisão .6/frontend3227

**Revisão posterior de162:** [fronteira webhook/CRM corrigida e provas novas](WEBHOOK_CRM_BOUNDARY_20261010.md); [checklist único .6](POSITION6_RECOVERY_CHECKLIST.md). Históricos abaixo preservados; sem apply/ack/deploy.

**LOCAL IMPLEMENTED AND VERIFIED / FOR REVIEW / NOT DEPLOYED.** Continuidade de `85a4674811f87eb3297ce257c5f0b18e34a38bb4`. Nenhum SSH, leitura atual da VPS, provider real, envio, SQL de recuperação, ack, abertura, instalação ou janela. Estado produtivo não reatestado: as referências guarda37/provider persisting, API a26/worker afbb/frontend fa60 são históricas da auditoria anterior. As provas antigas permanecem válidas em seu escopo; o teste original do incidente deve ser executado na origem85, onde esperava zero Outbound, e não é uma regressão a ser tornada verde no código corrigido.

## Delta preventivo executável

`campaignRunner.ts`: `submit_started → provider → provider_accepted durável → Outbound criado e relido/verificado → CRM → usage → campaign.message.sent → persisted() → cleanup`. A captura do resultado não confunde timestamps: aceitação é posterior à intenção e à chamada; não reconstrói o início da submissão como createdAt.

`campaignAcceptedResult.ts` introduz somente uma fronteira local de campanhas. O shared `persistOutboundMessage` não mudou. Registro existente é conferido, nunca atualizado nesta fronteira: tenant/messageId/MetaID, waId/canonical, phoneNumberId, canal/provider/conta quando presentes, TEMPLATE/nome/idioma/corpo e snapshot de componentes/retorno/campanha/run devem corresponder. P2002 exige releitura e a mesma conferência. Uma linha diferente nega; não prova sucesso por unicidade. SENT é aceitação, não entrega. FAILED só é compatível com status failed do mesmo MetaID. READ/DELIVERED concorrentes em rawPayload são preservados; a política monotônica existente continua no webhook.

Compatibilidade legada explicitamente limitada: canal/provider/channelAccountId nulos são tolerados em linhas legadas, mas phoneNumberId deve corresponder exatamente, inclusive null. Conta desconhecida não vira prova de identidade de conta; o patch conserva o contrato de entrada e não inventa credenciais ou bindings. Linhas novas fixam whatsapp/meta e channelAccountId a partir do phoneNumberId existente. Divergência de conta conhecida nega.

CRM continua obrigatório. Quando falha, o Outbound já gravado permanece, mas não se antecipa `persisted()`: filha persisting, suspensão do job, corte antes do próximo destinatário e fechamento da guarda seguem o código existente. Falha SQL antes do Outbound mantém acceptedEvent/ledger e também suspende. Não há transação aberta durante provider, segundo envio, resolvedor paralelo, expansão internacional, alteração de schema ou migration. O ramo de falha do provider continua usando o shared helper, agora antes de CRM; sua regressão dirigida passou.

### Alcance das três modalidades

| Modalidade | Handlers reais / convergência |
|---|---|
|Manual/avulsa|`http/routes.ts::createScopedCampaign`, enqueue `manual_campaign_send` → `processDueScheduledCampaigns`|
|Audiência CRM (estática/dinâmica)|`createScopedCampaignDraft[Split]`, `sendScopedCampaignDraft`, `scheduleScopedCampaignDraft`; dinâmica materializa batch `DYNAMIC_CRM_FILTER` e filhos antes do runner|
|Importação CSV|seed/importação e `createScopedCampaignDraft[Split]`, mesmos send/schedule de rascunho; execuções de filho/lote chegam ao mesmo runner|

`campaignRunner.ts::processDueScheduledCampaignsAdmitted → startCampaignRun → runCampaignInBackground` contém a fronteira comum. Imediato/agendado e variantes internas não ganham outro provider. Auditoria de imports do worker mínimo não encontrou runner nem o novo módulo: **delta funcional da API apenas; worker/frontend preservados**. Alcance demonstrado por código, não três novos envios pela interface. Reutilizadas provas anteriores de materialização, elegibilidade e modalidades; a nova prova integrada usa execução específica/queue real, não entrypoint ou scheduler global.

## Provas executadas e limites

Node **20.20.0**, PostgreSQL16 isolado, bases sintéticas novas `re7_guard37_prevention_20261010` e `re7_guard37_regression_20261010`; nenhum dado produtivo. Testes negam provider real e só usam resposta simulada. SQL, Prisma, CRM, ledger/job e webhook são efetivos. Falha SQL é uma violação real de FK provocada em laboratório após aceitação; concorrência usa conexões reais, não certifica o timing produtivo.

| Prova | Resultado |
|---|---|
|Runner aceito → CRM BR-only rejeita internacional|PASS: 1 submissão/aceitação/Outbound; 0 Contact/Lead; persisting/suspensão/guarda fechada; próximo não submetido|
|Falha SQL pós-aceitação|PASS: acceptedEvent preservado, 0 Outbound, etapa outbound_persistence, filha persisting e nenhum retry|
|Resultado compatível/incompatível; corrida de unicidade|PASS: 8 gravações concorrentes → 1 linha; mismatch de MetaID/wa/conta/template/run nega; outro tenant isolado|
|Webhook real READ concorrente + replay DELIVERED antigo|PASS: READ e janela legítima preservados, 1 Conversation/Outbound, 0 chamadas de rede. Não afirma materialização internacional nem intervenção humana completa nesta fixture|
|Verificador .6/recibo/replay e negativas|PASS em SQL sintético; resultado e recibo não duplicados, drift/forja recusados, ackEligible=false|
|Regressões afetadas existentes|5 PASS; 14 SKIP intencionais: aceitação BR/DD55 e fences humanos/inbound, falha provider, snapshot anonimizado e identidade/aliases/tenant em PostgreSQL|
|Contrato frontend fechado37|PASS do predicado efetivo extraído de check-preparation; drift de geração/open/tasks nega. Não é preflight VPS|

São **10 testes Node PASS**, zero FAIL na execução final, mais a prova Python do predicado; noEmit da API em Node20 PASS. Dois testes finais de webhook/verificador: 744.66684ms; primeira composição 3 testes: 934.154405ms; regressões:3314.609207ms. Logs privados preservam uma recusa inicial de fixture webhook sem mapeamento WaPhoneNumber; corrigida somente a fixture, não o resolver. O typecheck acidental do projeto frontend raiz encontrou diagnósticos fora do delta; não foi atribuído PASS ao frontend. Nenhum build/tar/release foi gerado.

O teste original85 reproduz zero Outbound; o novo teste documenta a prevenção. Não apagar ou reinterpretar essa evidência como prova do patch. [Resultados/hashes finais](IMPLEMENTATION_MANIFEST.json), [reprodução](REPRODUCE_IMPLEMENTATION.md).

## Posição .6 — verificador e recibo locais, nenhuma recuperação

`campaignAcceptedDeliveryReview.ts` é **leitor offline**, sem import no entrypoint/rotas, sem apply ou generic ack. Recebe bindings explícitos e captura de ledger; exige closed37/tarefa única provider persisting/hash/ref, relações tenant/campanha/pai/lote/link/job/run, queued attempt1 operational_suspension sem lease, cinco linhas preservadas por hash completo, ausência de submissão/Outbound7–11, uma intenção/aceitação .6, mesmo MetaID nos orphan sent/delivered e timestamp provider válido. Chamador de teste usa transação READ ONLY RepeatableRead, statement_timeout5s/timeout10s.

Recibo Event específico `campaign.accepted_delivery.reconciled`, chave tenant+acceptedEventId, vincula planHash/evidenceHash/OutboundId/resultHash/MetaID SHA256 e fontes; seu builder é puro. Releitura compatível retorna alreadyApplied, drift nega. O teste cria **fixtures** SQL e recibo em laboratório: não é implementação de apply nem prova de recuperação produtiva. Campos originais de tempo ficam separados: submit_started; provider_accepted.createdAt como âncora explicitamente reconstruída do resultado; payload.acceptedAt; timestamp delivered. Não fabrica createdAt de um Outbound que nunca existiu nem confirmação do owner.

Limites deliberados: ausência de recibo retorna não aplicado, sem autorizar uma gravação; não é um dry-run produtivo completo. Não atesta captura root atual, ausência de .uncertain/fault, todos os status contraditórios possíveis ou read models agregados pós-apply. Esses controles pertencem ao futuro plano completo. O recibo é **transport_result_only / ackEligible=false**, sempre.

Faltam fontes congeladas de conta efetiva .6, seed/components/rendered body/retorno exatos (snapshot fields nulos), estado atual e decisão CRM internacional. Antes de qualquer ack: Outbound exato durável/status monotônico; CRM obrigatório ou disposição separada explicitamente revisada; usage e evento de resultado duráveis; totais reais de filho/conjunto/lote sem incremento duplicado; recibo e tarefa/ref/hash atuais; revisão própria do contrato de ack de sucesso. Não alterar o motivo genérico FAILED nem usar out.13/131026. Cinco Outbounds existentes, cinco pendentes, job queued/lote running devem permanecer; resultado recuperado não autoriza retomada/terminalização/abertura.

## FRONTEND3227 — conclusão separada

**Tecnicamente admissível pelo contrato existente, mas nenhuma preparação nova está pronta ou montada.** `frontend-3227b2d7-prepared-20261009/check-preparation.py` compara o ledger inteiro ao baseline: não exige guarda aberta nem tasks vazias. `frontend-action.py` atua somente no frontend; core identities e controles precisam permanecer iguais. Os observadores de janela/permanente verificam processos/sockets, sem ack/campanha/provider. Assim, uma nova baseline verdadeira closed37/tarefa preservada pode ser protegida durante uma troca exclusivamente frontend, sem resolver backend. Isso não torna válido o baseline36 anterior; ele permanece inalterado e corretamente negado.

Proposta apenas: diretório novo, controles/nonces próprios, execution-authorized=false, tar3227/build/provas existentes e retorno fa60 íntegros, captura atual consistente do ledger/taskHash como estado a preservar. Antes de montar ou decidir janela: leitura atual autorizada de frontend/API/worker/daemon/boot, release/BUILD_ID/hashes/tar/assets, saved/fallback/launcher referenciado, políticas/helpers literais instalados, configurações/caminhos, sessões e cron/boot/scheduler; duas observações completas root para sockets/árvore e ledger consistente com lock/.uncertain preservados. Divergência bloqueia, sem adaptar binding. Instalação de políticas root novas e eventual janela exigem decisões específicas e sessão sudo Deifson; não são executadas aqui. Preflight preparatório não substitui observação fresca de saída.

CSV/Syer, suporte internacional, CRA-PR, multilote e AUTO permanecem separados. Próximo passo: revisão independente do delta API e do verificador .6; decidir as lacunas de proveniência/CRM/ack separadamente. Frontend pode ser retomado como frente independente mediante autorização da preparação nova, sem aguardar ack por exigência técnica inventada.
