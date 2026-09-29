# SECULT — plano de implantação para revisão, 29/09/2026

**PREPARAÇÃO LOCAL / PREFLIGHT READ-ONLY / NOT DEPLOYED.** Candidato
`a3d16d4bdc4b143deeb6b66d4e963b0b4b3f216b`, incluindo persistência `f06d49cb`,
funcionalidade `48e0fc2a` e correções revisadas. Nenhuma mudança produtiva autorizada
ou executada nesta preparação. Campanhas/CRA aguardam validação funcional do owner;
DB-only encerrada/aceita, inatividade no Guia pausada, 6683 CLOSED.

## Publicação de revisão — compatibilidade Node20 verificada

Node20.20.0 exato da evidência produtiva validado localmente: 65 módulos carregados
sem entrypoint, Baileys importado sem sessão, 104 testes PASS (29 worker, 45 regressões,
30 concorrência). Dependências preservadas. [Comandos e limites](../reviews/secult-worker-persistence/NODE20_RESULTS.md).
Fecha a lacuna de execução exercitada no Node20; não aprova shutdown ou reconexão real.
G1 revisão/configuração de release e G2 parada permanecem pendentes. As referências
anteriores a Node20 pendente abaixo são histórico das etapas anteriores.
Documentação nova sanitizada: detalhes operacionais permanecem em evidência privada.
Publicação apenas de fontes em patch/receita/manifesto e docs, sem deploy ou ativação.

## Direção confirmada — pacote reproduzível e primeira parada (29/09)

Owner escolheu o backport mínimo para revisão, preservando bf5f1d76. [Pacote de
fontes/diff/manifesto/receita](../reviews/secult-worker-persistence/README.md) e
[proposta completa de parada e retorno](../reviews/secult-worker-persistence/STOP_PROPOSAL.md).
Reconstrução limpa com npm ci pelos lockfiles reproduziu os 92 compilados, sem
aplicação iniciada. G1 permanece aberto para revisão/equivalência com runtime alvo;
G2 permanece aberto. Material local, sem publicação remota ou mudança produtiva.

A proposta agora separa futuras paradas instrumentadas da PRIMEIRA parada: handler
antigo pode liberar lock com socket vivo; não usar isso como drain nem iniciar
sucessor só porque lock ficou livre. Não há sequência graciosa comprovada para o
binário antigo. Contenção API existente pode interromper também Inbox/CRM/auth/META;
ausência de mecanismo seletivo comprovado impede prometer impacto só WEB_SESSION.
Owner precisará decidir explicitamente sobre incerteza residual de primeira
interrupção se não houver prova adicional aplicável ao antigo. Sem prazo em minutos
inventado; sem matar chamadas ou mudar supervisão nesta etapa.

Retorno preferencial mantém TODOS os escritores compatíveis e chave revogada. API
antiga e8 nega CLOSED, mas perde garantia concorrente; os cenários não são equivalentes.
Não restaurar DB/auth antigos sobre dados novos. Legados sem comprovação suficiente
não precisam ser disponibilizados; os que já satisfazem critérios permanecem cobertos.
Sem backfill, inferência ou corte temporal novo. SECULT NOT DEPLOYED; campanhas/CRA
aguardam owner. As evidências anteriores abaixo preservam seu escopo histórico.

## Atualização — alternativa mínima e ensaio dirigido do worker (29/09)

**RECOMENDAÇÃO: revisar o backport mínimo do worker e a proposta delimitada de
parada segura; não atualizar o worker completo apenas para incorporar persistência.**
Os dois gates continuam abertos: (G1) aprovar/empacotar a alternativa compatível;
(G2) implementar, após revisão, e comprovar admissão/drain/retorno seguros. A
preparação anterior abaixo permanece como histórico; esta seção refina sua escolha
de worker e rollback. Nenhuma produção foi acessada novamente ou alterada nesta
avaliação. API/frontend candidatos continuam a3d16d4b; SECULT continua somente leitura,
default false, sem ativação. Campanhas/CRA aguardam owner.

### Base rastreável e comparação das alternativas

A fonte `bf5f1d7610ca3f8144faa6f7b7994598e4a4017b` foi extraída via git archive em
área isolada e compilada. **91/91 JS correspondentes são byte a byte iguais ao
bundle produtivo preservado**, incluindo todos os 65 módulos alcançáveis do
entrypoint. package.json, package-lock.json e tsconfig.json também são idênticos.
O bundle antigo contém ainda `channels/whatsappDualReadShadow.js`, ausente dessa
reconstrução e fora do grafo do worker; não foi copiado avulsamente. Isto comprova
correspondência das fontes com o código carregável identificado, não autoria histórica
do build nem igualdade de todas as dependências instaladas. HEAD 5ee2de6b não deve
ser usado como fonte de reconstrução do bundle antigo.

Foi aplicado, **somente em cópia experimental**, o patch dos cinco arquivos de
persistência de f06d49cb sobre essa base. Aplicação limpa, sem resolução manual;
as cinco fontes resultantes são integralmente idênticas às respectivas fontes
revisadas em f06d49cb. Todo o worker foi compilado das fontes; nenhum JS foi trocado
avulsamente. Módulos restantes do grafo conservam bytes do bundle preservado.

| Critério | Backport mínimo recomendado para revisão | Worker completo a3d16d4b |
| --- | --- | --- |
| Grafo | 65 → 66 módulos; quatro alterados + helper novo | 65 → 75; 21 diferentes/novos |
| Persistência | tenantOperationalConfig, tenantOperationalConfigStore, assignmentPolicy, webSessionAuthorization, hybridIdentity de f06 | Mesma dependência, mais SECULT e demais mudanças |
| Comportamento adicional | Nenhum delta de fila operacional, CRM/origem/normalização ou realtime; preserva fontes correspondentes ao bundle | Incorpora os deltas adicionais discriminados na tabela do preflight abaixo |
| Dependências declaradas | package/lock/tsconfig preservados; sem pacote novo | Não exige troca do lock do worker, mas amplia o grafo compartilhado |
| Risco específico | Artefato próprio WORKER ONLY, requer revisão, identidade e manutenção explícitas; não executar API/scripts antigos presentes na árvore fonte experimental | Exige revisão/validação dos contratos adicionais no runtime worker; conveniência de release única não elimina o delta |
| Shutdown | Mesma lacuna comprovada do worker vivo | Núcleo do worker igual: mesma lacuna; atualização ampla não a resolve |
| Evidência comportamental nova | 45 regressões + 30 casos de concorrência PASS | Build anterior reaproveitado; não reclassificado como validação dos comportamentos adicionais |

Os cinco módulos abrangem conservadoramente **30 locais substitutivos**: 19 setters
config, 2 política/cursor, 4 autorização WEB_SESSION, 5 identidade híbrida. Não se
alega que todos sejam invocados pelo entrypoint. Chamadas comprovadas incluem
webSessionIdentity → markWebSessionAuthorizationOwned e webSessionInbound →
applyBalancedQueueAssignment. Canned replies e os três scripts não estão no grafo
worker e não foram backportados; API/scripts permanecem obrigatoriamente na release
compatível, não na árvore bf5 experimental. A guarda estrutural e o inventário de
f06 continuam válidos para API/scripts; o grafo e hashes delimitam o pacote worker.

Rodízio: fontes exatas de f06; mantém advisory transacional de escopo → lock config
→ releitura de política/cursor → locks/seleção de runtime. Não acrescenta lock em
ordem inversa ou rede no callback. Regressões executadas sobre o backport cobrem
rodízio concorrente, least-active concorrente e releitura de cursor preservando
revogação/outros escopos. Nenhuma nova mudança de algoritmo foi feita.

### Artefato, testes e limites precisos

Evidência privada: `local-evidence/secult-worker-options-20260929/`.
`baseline-comparison.json`, `minimal-comparison.json` e
`reviewed-source-comparison.json` comprovam as correspondências acima.
Patch SHA256: `9ce907c09adce3f196953a25780760de2c186c901585b5527ae9c584c3010dc1`.
Pacote experimental `worker-minimal-review.tar`: 1.505.280 bytes,
SHA256 `7ebfb5042f5b03170fa57d8e09b93e1726892683649b9a4d614584c8a6d03f1f`.
Contém dist reconstruído, package/lock/tsconfig e manifesto; **não é release produtiva
pronta**: não inclui ambiente privado nem instalação equivalente de dependências.
Receita: git archive bf5 → aplicar persistence-only.patch → dependências dos lockfiles
→ gerar/verificar Prisma compatível → npm run build do worker → comparar manifesto.
Nesta prova, dependências locais isoladas da preparação anterior foram reutilizadas.

- Build baseline e build backport: exit 0, `--noCheck`; Node22.13.0/TypeScript5.9.3.
  Runtime produtivo Node20.20.0 e dependências instaladas precisam ser conferidos no
  empacotamento final. Prisma local gerado 6.19.2 versus runtime inventariado 6.19.3
  continua limite de equivalência, não alteração de schema autorizada.
- **45/45 PASS**: assignmentPolicy, hybridIdentity e webSessionIdentity (testes de
  f06 executados contra fontes do backport e DB sintético local).
- **30/30 PASS**: 29 escritores exportados/setter de política contra revogação real
  SECULT, preservando campo independente/array/null; mais reprodução contrastiva
  de assinatura atrasada antiga versus compatível. Cursor coberto nas 45 regressões.
- Tsc estrito baseline/backport: ambos exit 2; **13 diagnósticos, logs completos de
  44 linhas idênticos**, não apenas contagens. Zero diagnóstico introduzido nesta
  comparação; tipagem integral continua não aprovada.
- **4/4 reproduções PASS**, mas **segurança do shutdown REPROVADA** nos cenários
  abaixo. Não somar esses PASS como sucesso de drain. Duração total 3,32s é do
  harness sintético, não estimativa de indisponibilidade/reconexão real.
- Builds/testes SECULT e worker completo anteriores não foram repetidos nem
  reatribuídos ao backport. Nenhum teste usou sessão/provider real ou DB produtivo.

### Admissão, conclusão e observabilidade existentes

| Caminho | Entrada/conclusão atual | Lacuna relevante na parada |
| --- | --- | --- |
| Controle outbound | HTTP /web-session/send-text, send-media e resolve-recipient; valida conta e socket; aguarda sendMessage/lookup ou timeout | index.ts chama server.close sem aguardar callback; não há registro comum de operação nem classificação durável de envio incerto no worker |
| Inbound/receipts | Socket factory registra messages.upsert, messages.update e message-receipt.update; handlers aguardam ingestão/DB internamente | Emissor não junta promises para shutdown; socket continua capaz de entregar eventos; ausência de log novo não comprova ausência de tarefa |
| Auth/Signal keys | creds.update → merge/save; keys.set → save; store serializa writes por escopo; staging/promoção na conexão | Fila interna não expõe flush ao shutdown; adapter ignora retorno `{ok:false}` do save; promise resolvida não prova gravação bem-sucedida |
| Conexão/identidade | onConnected executa save/reconciliação/promoção; lock dedicado PostgreSQL por conta | Callback de conexão não é aguardado pelo factory; final do loop apaga activeConnections e libera advisory lock sem fechar socket ou aguardar callbacks |
| Processo | SIGTERM/SIGINT abortam poll e chamam close do servidor HTTP | Não existe sinal público suficiente de drain completo. Health, campanhas zeradas, conexões DB idle e conversas HUMAN não substituem isso |

Referências: `apps/whatsapp-web-worker/src/index.ts`, `whatsappWebSessionWorker.ts`
(sendText/sendMedia, connectWebSessionAccount, handleWebSessionMessagesUpsert e final
runWhatsAppWebSessionWorker), `webSessionControlServer.ts`,
`web-session/baileysSocketFactory.ts`, `baileysAuthState.ts`,
`dedicatedPgAdvisoryLock.ts`; compartilhado `web-session/webSessionAuthStore.ts`.

Ensaio usa funções compiladas correspondentes ao bundle real, seam de conexão já
existente, socket/provider simulados, auth store sintético persistido em arquivo e
**duas conexões PostgreSQL locais reais**. Inbound representa o callback pendente
na fronteira real do factory, sem simular integração externa nem alegar ingestão
completa do payload de negócio. Não executou dois workers reais conectados ao provider.

1. Antes do abort, segundo lock recusado. Com inbound, sendMessage e save de auth
   retidos por barreiras, abort durante o loop encerra runWorker; socket não fechado,
   três operações pendentes. Segundo lock passa a ser adquirido. **Ausência de dois
   proprietários não comprovada: há janela de sobreposição reproduzida.**
2. Ao liberar as barreiras, a única chamada simulada retorna aceite, credenciais
   revision=2 e Signal key reaparecem na releitura. Sem clear/logout/retry. Isso
   prova conclusão controlada; não prova preservação após kill/SIGKILL ou reconexão
   real. Antes da liberação o arquivo continha a revisão antiga.
3. Aceite simulado chega depois do timeout: resultado exposto é 504, uma única
   chamada. Worker não repete automaticamente nesse ensaio; sem prova de resultado
   durável/reconciliação no worker. Não interpretar timeout como rejeição nem liberar
   reenvio. Com store reportando falha, auth.save resolve: falha precisa integrar
   o gate de parada, não apenas contador de promises.
4. server.close impede nova conexão HTTP local, mas requisição já admitida só
   termina após liberação. A API Node fornece conclusão de close; index atual não
   a aguarda e isso não drena callbacks do socket.

### Proposta delimitada para G2 — NÃO IMPLEMENTADA

Mudança independente de SECULT, a revisar antes de codificar. Alvos mínimos:
index.ts, worker/control server, factory e adapter/store de auth conforme interfaces
necessárias. Sem mudar distribuição, lifecycle de atendimento ou permissão CLOSED.

1. Estado de drenagem único no processo; registrar operações na admissão, antes de
   qualquer await. Bloquear novos comandos de envio/lookup e reconexão; acompanhar
   HTTP já admitido, inbound/receipts, conexão/identidade e gravações auth, incluindo
   falhas. Diagnóstico autenticado/sanitizado de contagens e pendências, sem segredos.
2. Parar admissão outbound e aguardar chamadas já entregues ao socket sem matá-las.
   Incluir envios derivados de callbacks inbound já admitidos, com vínculo entre
   operação-pai e operações-filhas; zero HTTP não autoriza fechar transporte.
   Callback que ainda depende do socket deve concluir antes desse fechamento.
   Enquanto isso inbound/auth podem continuar, portanto zero momentâneo não é drain.
   Depois, encerrar transporte sem logout/clear, mantendo posse do advisory lock;
   recolher callbacks finais e aguardar fila auth/DB. Confirmar que socket não pode
   produzir novo trabalho antes de declarar concluído. Sem promessa de replay inbound
   pelo provider; eventos externos não admitidos ficam como risco operacional explícito.
3. Somente após socket fechado e trabalho/auth confirmado, liberar ownership e
   permitir novo worker. Resultado incerto, save falho ou parada não concluída
   bloqueiam essa declaração. Prazo é escalonamento, não remoção de lock ou kill.
   PM2 timeout/restart precisa ser compatível com esse protocolo antes da janela.
4. Tratar timeout de envio como incerto: não retry automático. Reutilizar correlação
   e persistência existentes no chamador quando suficientes; provar isso no próximo
   ensaio. Se faltar mecanismo durável para classificar pendência após queda, trazer
   essa lacuna para revisão, sem inventar ledger/tabela dentro da permissão SECULT.
5. Validar com barreiras e processos locais distintos: envio aceito/resposta atrasada,
   auth falho/em fila, callback chegando no encerramento, lock disputado e retorno
   com estado auth novo. Nenhuma nova sessão assume antes da liberação segura.

**Primeira transição do worker antigo:** instrumentar a versão nova não produz
quiescência retroativa. A versão atualmente carregada não oferece o diagnóstico/drain
proposto; não há, nesta evidência, comando capaz de comprovar sua parada sem risco.
Mesmo após validar o protocolo novo, G2 inclui decidir como sair da versão antiga:
prova adicional de um mecanismo aplicável ao binário atual, ou decisão explícita do
owner sobre a incerteza residual e impacto de uma primeira parada controlada. Isso
não está autorizado nesta preparação e não transforma espera/log silencioso em prova.
Contenção externa não resolve callbacks já admitidos nem garante replay inbound.
Repetição contínua de trabalho, auth falho ou resultado incerto impedem prometer prazo;
a decisão operacional deve preceder qualquer interrupção, sem encerrar atendimentos.

O protocolo acima ainda não existe nem foi ensaiado como solução. O ensaio atual
justifica a necessidade; **nenhuma janela ou zero perda pode ser prometido**.
Não encerrar atendimentos HUMAN nem esvaziar filas de negócio para contornar G2.

### Retorno refinado e preservação de dados

**Preferência:** candidato reconhecedor de SECULT com chave false, worker mínimo
compatível e scripts compatíveis. Revogar pelo setter real, conferir commit e novas
leituras negadas; conservar todos os escritores protegidos. A reprodução demonstrou
que assinatura atrasada compatível não restaura true. Sem modificar conversas,
restaurar dump, apagar auth ou reverter dados novos; UI segue revalidação existente.

**Se precisar retornar API/frontend e8ebd776:** o código anterior nega CLOSED ao AGENT
independentemente da chave; isso desativa a experiência, mas **não preserva a garantia
de concorrência**, pois a API antiga também escreve config. Não confundir esse retorno
com revogar enquanto código SECULT continua servido. Procedimento futuro exige
quiescência/exclusão de todos os escritores, revogação ainda na release compatível,
verificação false, encerramento de processos/transações capazes de guardar snapshot
true e só então retorno. Manter worker mínimo quando compatível e não reintroduzir
scripts antigos. Se for inevitável worker antigo, gate de parada continua obrigatório.

Nenhuma instância reconhecedora de SECULT pode coexistir com escritores antigos
capazes de restaurar true. Não liberar essa combinação alegando que a chave foi
revogada: o ensaio **reproduziu true restaurado pelo setter antigo atrasado**. Sem
comprovar exclusão dos snapshots antigos, retorno não está aprovado. Após retorno
integral antigo, a chave não poderá ser ativada e deverá ser conferida/revogada de
novo sob exclusão de escritores antes de futura reintrodução do código SECULT.
Escritores legados continuam sujeitos a perda geral de campos concorrentes; esta
preparação não declara esse defeito corrigido no código de rollback.

Preservar DB atual, auth secrets/keys/staging, mídia e dados novos. Backup fresco e
restauração isolada continuam requisitos separados da futura janela, não executados
agora. Bundle antigo preservado serve contingência identificada, não atalho para
ressuscitar processos em paralelo. Revisar saved/fallback/boot e comandos manuais
na execução futura para que nenhuma versão obsoleta reapareça.

**Próxima decisão concreta:** revisar/aceitar o backport mínimo de cinco fontes e
aprovar o escopo acima de parada segura para implementação/ensaio local separado.
Ainda não autoriza implantação, ativação SECULT, restart, cron, fechamento de guarda
ou mudança produtiva. G1/G2 permanecem abertos; 6683 CLOSED, DB-only aceita, inatividade
no Guia pausada; campanhas/CRA aguardam validação funcional do owner.

## Recomendação e gates antes da janela — preflight inicial

**Não aprovar troca produtiva do worker como simples atualização do helper.** O
binário real incorpora módulos compartilhados anteriores ao checkout registrado.
Há delta adicional de fila operacional, CRM/identidade e normalização (abaixo).
Revisar esse delta no contexto do worker e ensaiar localmente sua parada/retorno
com sessões sintéticas antes de aprovar uma janela. Não produzir uma mistura de
arquivos antigos/novos ou backport silencioso para encobrir a diferença.

Outro gate independente: o shutdown atual do worker não demonstra drain completo
de inbound/outbound/auth writes. A guarda de campanhas não cobre todos esses
trabalhos. Enquanto não houver procedimento comprovado ou mecanismo mínimo revisto
para essa lacuna, a sequência de troca abaixo é condicional, não pronta para rodar.
A presente tarefa não implementou esse mecanismo nem mudou produção.

Responsável operacional previsto: Deifson Oliveira, execução única coordenada com
Codex; renovar confirmação de janela/intervenções antes de qualquer parada. Operador
executa sudo em sessão privada. Sem compartilhar senha, token ou configuração no chat.

## Estado efetivo observado (UTC; Fortaleza = UTC−3)

Leituras em 29/09, 11:26–11:55 UTC. São fotografias; repetir gates imediatamente
antes de executar. SSH utilizou alias previamente confiado `converta.re7online.com`.
A tentativa inicial via alias de API parou na verificação da host key; nenhuma chave
foi aceita/substituída e nenhum controle foi contornado.

| Componente | Estado comprovado | Consequência |
| --- | --- | --- |
| API | Release e8ebd776, processo real/cwd/script correspondentes, watch=false, 0 restarts; health 200/db ok; diagnóstico informa SHA completo e8ebd776 | Base para comparação e rollback da API |
| Frontend | Release e8ebd776, build `fNgALKLUIc78JDuyWHkRb`, 200, watch=false, 0 restarts | Retorno ao frontend existente disponível |
| Integridade API/frontend | 2.020 hashes de dist/server/static iguais à evidência preservada do deploy e8ebd776; zero divergências | Identidade não inferida apenas de nome PM2/HEAD |
| Worker | Wrapper npm e filho Node continuam ativos; checkout 5ee2de6b sem delta tracked; restarts históricos registrados, não reiniciados nesta tarefa | HEAD do checkout **não** identifica integralmente os módulos compilados |
| Worker real | Núcleo compilado whatsapp-web-worker idêntico ao candidato; módulos compartilhados com timestamps de 11/09 e diferenças materiais | Baseline efetiva é o bundle copiado/hashado, não uma declaração de SHA completo 5ee2de6b |
| Runtime alvo | Node v20.20.0; worker @prisma/client 6.19.3, Baileys 7.0.0-rc13, pg 8.23.0 | Confirmar instalação/engines no empacotamento final; build local usou Node22 |
| Guarda | Aberta, geração 3, tasks=0, ledgerFault=null, somente state.json; host único | `drained=false` com guarda aberta; não declarar quiescência |
| Campanhas | Sem sending/scheduled na fotografia; demais estados preservados | Não excluir/reconciliar registros; reconferir antes da janela |
| Fila | Jobs=0, grupos=0, leases=0, agendamentos vencidos/futuros=0; jobs/scheduled/sending novamente zero às 11:55 UTC | Reconferir antes de fechar/reabrir; se mudar, apresentar impacto |
| Atendimento | Atendimentos humanos abertos observados | Não são chamadas em execução e não devem ser encerrados para deploy |
| Concorrência observável às 11:55 UTC | Nenhum comando de deploy/escritor manual procurado em execução; root PM2 sem filhos diretos; sessões DB idle, nenhuma transação ativa observada | Não substitui confirmação de execução única nem prova de ausência de operações assíncronas |
| Canais | Sessões WEB_SESSION e META ativas; estados preexistentes também registrados | Preservar todas as sessões; não provocar pareamento como teste |
| Auth WEB_SESSION | Persistência de auth configurada observada | Preservar ciphertext/chaves/escopos; contagem não prova retomada |
| Saúde/atividade | Worker tem logs recentes de receipts, auth writes, inbound e outbound; leitura agregada de 5min teve zero novos registros | Janela de log não é intervalo fixo; zero em 5min não é drain |
| Configuração SECULT | Chave ausente no levantamento; tenant alvo ativo | Default false; nenhuma ativação executada |
| DB | 60 migrations; sem diferença de schema/migrations entre e8ebd776 e candidato; zero locks aguardando na leitura | Sem migration prevista; não corrigir drift |
| Backup | Destino persistente inventariado; dados detalhados em evidência privada | Reconferir espaço e backup fresco antes da janela |

Telegram apenas inventariado, sem validar canal nem corrigir segredo. Históricos
DELIVERED/READ e campanhas/CRA permanecem separados.

## Escritores e supervisores

- API: todos os setters/configurações, canned replies, distribuição/identidade e
  provisionamento create-only. Candidato tem 35 escritores substitutivos protegidos
  mais exceção create-only; reutilizar prova estrutural e concorrência da dependência.
- Worker WEB_SESSION: escritor direto via autorização/identidade e distribuição.
  Não basta apontá-lo à API nova: seu `dist/whatsapp-agent/...` precisa ser compatível.
- Scripts: backfill-tenant-operational-config.ts, load-test-tenant-bootstrap.ts,
  provision-demo-tenant.ts só poderão ser invocados na release nova. Nenhum estava
  presente no levantamento de processos ou nos crons lidos; isso não comprova
  inexistência de invocação externa/manual futura.
- Crontab deploy ainda referencia checkout antigo: backup-data duplicado 03:15,
  media:cleanup 03:00, retention:run 03:30, backup:postgres:alerted 03:20 e
  backup:postgres:check 04:00 UTC. Cron root de backup persistente 02:40 UTC.
  Esses agendamentos não são os três escritores de configuração inventariados;
  backup é leitura, cleanup/retention têm mutações próprias. Não migrar/corrigir
  incidentalmente seus contratos. Coordenar eventual conflito da janela pelo
  procedimento já aprovado, sem executar agora ou matar tarefa em curso.
- PM2 deploy e daemon root continuam presentes. Unit deploy inactive/enabled;
  saved/fallback idênticos apontam API/frontend e8 e worker antigo. Leituras G0/root
  anteriores reutilizadas; nenhuma CLI PM2 root executada. Não presumir ausência
  de iniciadores externos. Antes da troca: excluir execução paralela e atualizar
  saved/fallback/config de boot para não ressuscitar escritores antigos.
- Política operacional necessária: Deifson/Codex invocam escritores somente pela
  release verificada; inventário de fonte não bloqueia SQL/manual/root externo.
  Não usar REVOKE no papel compartilhado nem alterar permissões incidentalmente.

## Comparação de artefatos e delta completo do worker

API/frontend e8ebd776 → a3d16d4b: delta fonte de 28 arquivos de código/teste sob
apps/src; somente persistência compartilhada e SECULT. Dependências/lockfiles e
schema/migrations sem delta. Implementação própria do worker/package/lockfile
5ee2de6b → candidato não mudou, **mas o bundle real mudou**.

Comparação do `dist` vivo copiado por leitura com build isolado do candidato:
65 módulos alcançáveis antes, 75 depois; 21 módulos diferentes/novos alcançáveis,
26 JS diferentes no total emitido. Grafo de imports relativos estáticos/dinâmicos
literais; não prova que todas as funções exportadas sejam executadas. Nenhum módulo
relativo ausente. Manifesto privado contém cada hash e caminho de importação.

Todos os nomes abaixo são relativos a `whatsapp-agent/src/` dentro do dist worker:

| Módulos alterados/adicionados alcançáveis | Conteúdo / impacto |
| --- | --- |
| config/tenantOperationalConfig.js; config/tenantOperationalConfigStore.js | Persistência transacional + chave SECULT; escopo revisado |
| queue/assignmentPolicy.js | Advisory → config → runtime; decisão preservada conforme prova f06d49cb, agora protegida de snapshot obsoleto |
| web-session/webSessionAuthorization.js; web-session/hybridIdentity.js | Escritores protegidos; sem novo contrato de identidade nesta dependência |
| realtime/hub.js; realtime/agentReadAccess.js; inbox/ownClosedAccess.js | SECULT, autorização atual, escopo de invalidação e departamento; escopo revisado, sem inferir sockets de API hospedados no worker |
| bootstrap/defaultOperationalDepartment.js; departments/operationalQueue.js | **Adicional no worker real:** deixa upsert de Fila Geral e usa fila operacional vinculada; criação/resolução explícita. Os 44 departamentos ativos têm fila vinculada na fotografia, mas isso não substitui revisão funcional |
| chatbot/departmentAwareHandoff.js | **Adicional:** busca operationalQueue; sem fila pode bloquear handoff com no_queue_for_department |
| web-session/webSessionInbound.js; crm/crmContactUpsert.js | **Adicional:** inbound registra origem CRM e traz rotinas de import/upsert como dependências; novas gravações/eventos de origem, não apenas helper |
| crm/crmWhatsappIdentity.js | **Adicional:** validação BR/DDD, prefixo 55 condicionado ao comprimento, restrições de assinante e retirada do fallback internacional genérico |
| config/tenantConfig.js | **Adicional:** normalização de situação NEW (ativa/injetada, elegível salvo false explícito); getTenants strict opcional. Não chamar default de alteração de config já persistida |
| contacts/contactOperationalExclusion.js | Consulta em chunks >1000; incorporada ao grafo de import/CRM |
| campaigns/optOutRegistry.js | Agrupamento de aliases/identidades CRM para opt-out e revogação |
| campaigns/campaignRecipientImport.js; campaigns/campaignSeedPrivacy.js; routing/outboundReturnDestination.js; templates/templateRendering.js | Novos módulos trazidos por crmContactUpsert/import; presença no grafo não inicia campanha/provider por si só |

Outros 5 JS emitidos diferentes, fora do grafo do entrypoint identificado:
`campaigns/campaignLifecycle.js`, `campaigns/campaignService.js`,
`channels/whatsappDualReadShadow.js`, `web-session/hybridIdentity.test.js`,
`web-session/webSessionIdentity.test.js`. Não instalar executores/schedulers extras
por existirem arquivos no bundle. CampaignRunner/guarda/fila de campanhas não
apareceram como novos entrypoints do worker nesse grafo.

Proveniência das mudanças adicionais inclui b166bcac (fila operacional),
1f8304f8/2a652e69 (CRM/origem/identidade) e 3bcf4261 (DDD55), anteriores ao HEAD
nominal 5ee2de6b. A revisão de SECULT não comprova revisão/aceite de sua entrada no
**worker compilado produtivo**. Bloqueio explicitado antes de implantação; não se
alterou o candidato nem se montou backport alternativo nesta preparação.

## Artefatos locais e evidências

Diretório privado persistente:
`local-evidence/secult-deploy-plan-20260929/`, fora do Git.

- `candidate-source.tar`: git archive exato a3d16d4b, 38.645.760 bytes,
  SHA256 `f8f638a084d889fcb2a266c109d004e68685d8b59eccda1b1ed1b320d8280ee9`.
- `candidate/`: fonte isolada, dist API (418 arquivos), dist worker (102), build
  frontend `hyNdsxtFPVdqkO80fSTAk` (1.642 arquivos sem cache no manifesto).
  Builds API/frontend/worker exit 0. Worker usa --noCheck: não aprova tipos.
- Prisma generate local sobre schema candidato, cliente copiado pelo script
  existente para worker, em cópias próprias de dependências. Sem DB remoto/migrate.
  Schema gerado é semanticamente igual (normalização de whitespace/ordem de índices);
  queries READ ONLY pelos dois clientes em DB sintético local PASS, client 6.19.2.
- Root node_modules reutilizado por link local; não é pacote autossuficiente
  transferível para VPS. Empacotamento final deve materializar dependências conforme
  lockfiles/arquitetura/Node20.20.0 e conferir Prisma gerado, sem executar npm start
  ou prestart inadvertidamente. Nenhuma configuração privada produtiva foi copiada.
- `ARTIFACT_MANIFEST.json`, manifests por componente, `worker-delta.json`,
  `worker-runtime.diff`, `worker-live-code.tar.gz`, runtime/health-counts/details e
  comparação de 2.020 hashes sustentam o plano. Bundle vivo preservado para retorno;
  não recompilar o checkout 5ee2de6b presumindo que reproduz o worker atual.
- Reutilizados 31 testes/build/smoke finais de SECULT e evidências da dependência;
  builds desta etapa preparam artefatos, não validam comportamento adicional do
  worker. 112 testes anteriores são históricos. Tipagem frontend/worker mantém
  limitações registradas; nada foi reclassificado como tipagem integral aprovada.

## Configuração alvo e sequência futura (não executada)

Release alvo proposta `/opt/re7online/releases/a3d16d4bdc4b143deeb6b66d4e963b0b4b3f216b`.
Layout isolado: API em apps/whatsapp-agent; worker em apps/whatsapp-web-worker;
frontend no root do artefato candidato (diferente do subdiretório frontend da e8).
Config `.config.cjs` terá script/cwd explícitos, watch=false, uma instância por
componente, sem ambiente bruto PM2; iniciar worker por entrypoint Node compilado,
sem wrapper npm/prestart mutável. Ambiente reduzido deve ser conferido com a
configuração ativa da API e com o `.env` efetivamente lido pelo worker via dotenv.
Não presumir equivalência a `/proc/environ`: variáveis carregadas depois do exec
não foram inferidas de sua ausência nessa projeção.

Preservar DB, chaves APP_AUTH/criptografia de ChannelAccountSecret, tokens internos,
base da API, control host/port, armazenamento de mídia e conteúdo. `.data/tenants.json`
é resolvido por cwd; preparar vínculo/cópia privada equivalente na release nova,
nunca substituir pelo arquivo sintético/local. Guarda continua no mesmo arquivo
persistente `/var/lib/re7/campaign-operations/state.json`, mesmo host/topologia;
scheduler pode iniciar desabilitado na troca e ser restaurado mantendo guarda
fechada conforme runbook. Configuração operacional final ainda precisa ser renderizada
privadamente e validada no gate, sem iniciar processos nesta fase.

| Etapa futura | Responsável / ação e prova exigida |
| --- | --- |
| 0. Liberar gates | Owner revê delta adicional do worker; Codex/Deifson concluem ensaio de parada/retorno e compatibilidade Node/Prisma/paths; definir janela e prazo de recuperação medidos. Sem isso, abortar antes da contenção |
| 1. Releitura + backup | Codex lê versões, sessões, fila/agendamentos, trabalhos/locks e espaço; Deifson confirma execução única. Backup fresco e restore isolado aprovados, configurações/saved/fallback/worker vivo preservados |
| 2. Fechar campanhas | Superadmin legítimo: GET `/admin/ops/campaign-execution`; POST no mesmo endpoint `{open:false,generation:<atual>,reason:<auditável>}`; aguardar `available=true, open=false, drained=true, tasks=[]`, sem fault/uncertain. Não editar ledger ou encerrar provider |
| 3. Contenção coordenada | Após campanha drenada e plano WEB_SESSION comprovado, aplicar contenção/supervisores do runbook somente com autorização de janela. Controlar entradas HTTP, scripts e boot/saved; impedir alterações de configuração concorrentes. Barreira 3000/3001 não bloqueia socket WEB_SESSION externo e sozinha não drena worker |
| 4. Retirar escritores antigos | Parada controlada das APIs e worker apenas após evidência de trabalho concluído. Confirmar fim dos PIDs/filhos e conexões/locks, sem respawn; nenhum job de script escritor ativo. Não usar PM2 kill/reload all ou forçar parada de envio |
| 5. Iniciar versões compatíveis | Sem antigo escritor, iniciar API candidata com guarda fechada; depois único worker candidato com auth store/chaves preservados; frontend candidato. Validar identidade real/script/cwd, hash de dist compartilhado, Prisma, watch=false, sessões/health. Ordem evita worker tentando notificar API ausente |
| 6. Persistir supervisão | Guardar cópias anteriores; atualizar saved/fallback/boot/config para todos os componentes novos; scripts escritores passam a usar release candidata. Revisar novamente antes de retirar contenção; não ressuscitar worker antigo |
| 7. Atendimento sem SECULT | Retirar contenção somente após checks; login privado, Inbox/CRM/lista e detalhe, controles por papel; chave continua ausente/false em todos. Observar reconexão sem limpar auth, pedir QR ou disparar mensagem |
| 8. Campanhas | Recontar jobs/agendamentos; restaurar estado prévio de scheduler/admissão apenas por decisão da janela após condições seguras. Trabalho novo/inesperado exige decisão, não abertura automática; observar ticks sem fixture/envio |
| 9. Ativação separada | Só após compatibilidade integral/validação: decisão própria para secult-pe. Sessão legítima SUPERVISOR/ADMIN desse tenant, GET e PUT `/app/settings/inbox/closed-conversations` com somente `{allowAgentOwnClosedConversations:true}`. Verificar auditoria e escopo; nunca PUT global/SQL ou hardcode. Não executar nesta preparação |

### Limite concreto do drain WEB_SESSION

`whatsapp-web-worker/src/index.ts` sinaliza abort e fecha controlServer;
`runWhatsAppWebSessionWorker` sai do loop e libera advisory locks, mas não demonstra
await agregado dos handlers de mensagens/envios/auth saves. No laço final não chama
`active.close` antes de liberar cada lock. Encerrar wrapper npm via PM2 também não
é prova de propagação/espera sem SIGKILL. Control server só tem health, sem endpoint
de drain completo. Health, fila de campanha vazia e silêncio temporário não resolvem.

Menor prova/mecanismo a delimitar antes da janela: impedir novas operações no control
server e sockets worker, contabilizar/aguardar operações já admitidas (incluindo
persistência de auth), fechar sockets sem logout/clear e liberar locks apenas ao
final; demonstrar tudo com Baileys/provider simulados e chamadas em andamento.
Isso não foi implementado/autorizado como alteração de código nesta preparação.
Não recomendar timeout que mate chamada nem prometer inbound/retries integrais.

## Backup fresco, restauração e retorno

Não foi gerado novo backup produtivo nesta etapa. Na janela, usar preparação nova
no destino persistente, umask restrito, espaço/locks/rotinas conferidos. Reutilizar
fluxo sem descarte do deploy flows; não disparar script de retenção como atalho.
Copiar DB em formato custom, guarda e auxiliares, configurações privadas efetivas,
chaves de recuperação, `.data`/mídia/conteúdo necessários, PM2 saved/fallback, crons
e bundle **real** do worker com dependências. Registrar tamanho, SHA256/manifesto,
catálogo pg_restore e timestamps. Segredos só no backup privado.

Exemplo da etapa DB futura (apenas depois de definir PREP e lock exclusivos):

```bash
# NÃO EXECUTAR NESTA PREPARAÇÃO
umask 077
docker exec wa-agent-postgres pg_dump -U wa_agent -d whatsapp_agent -Fc > "$PREP/database.dump"
sha256sum "$PREP/database.dump" > "$PREP/database.dump.sha256"
docker exec -i wa-agent-postgres pg_restore --list < "$PREP/database.dump" > "$PREP/database.catalog"
```

Restaurar esse dump fresco em PostgreSQL isolado, sem integrações/schedulers,
validar catálogo/contagens e medir tempo. Nunca sobre produção. Ensaio anterior
restaurou dump de 28/09 em 3,712s (dump 4,695s), mas não valida um futuro dump nem
retomada do worker. Cópia live de auth/mídia não é snapshot atômico com DB; decidir
RPO e eventual captura final após drain. Offsite/retention não resolvidos aqui.

Retorno recomendado antes de ativação: e8ebd776 API/frontend + **bundle worker vivo
preservado**, DB atual; não usar a1cc380e como retorno de rotina (perderia correção
DB-only aceita), nem rebuild de 5ee como substituto do binário vivo. a1cc380e/recovery
03f930e5 continuam contingências históricas de campanhas, não solução automática
para compatibilidade da persistência. Schema candidato não muda o banco.

Após eventual ativação, rollback para escritores antigos só após: bloquear novas
mutações, drenar/retirar escritores compatíveis conforme procedimento seguro;
revogar SECULT pelo setter real ainda disponível com exclusão de escritores antigos;
verificar false persistido e ausência de transações antigas pendentes; encerrar
processos antigos/suspensos que poderiam carregar snapshot true antes de iniciar
qualquer binário legado. Se não puder comprovar revogação/exclusão, não abrir
atendimento com combinações de versões improvisadas; manter contenção e escalar.
Retornar e8 significa funcionalidade indisponível e garantia de concorrência perdida;
revisar config de novo antes de qualquer futura reativação. Não restaurar dump sobre
dados novos, não remover jobs, snapshots, resultados, locks ou auth secrets.

## Impacto, critérios de parada e sucesso

Impacto previsto: intervalo de API/frontend afeta Inbox/CRM/auth/realtime/webhooks;
parada worker desconecta as três sessões WEB_SESSION e interrompe processamento
inbound/control send/receipts, podendo exigir reconexão. META não depende do worker,
mas depende da API/webhook. Sessões de login e auth stores serão preservados, sem
promessa de continuidade do transporte. Janela anterior de API/frontend foi 3min21s;
**não é estimativa desta janela com worker**. Duração/limite precisam do ensaio
worker e medida de restauração; nenhuma janela genérica de 30–60min foi proposta.

Abortar antes de mutação: delta worker não aprovado, drain worker sem prova,
backup/restore/config/identidade não conferidos, escritora antiga/automação paralela,
locks incertos, fila/agendamento com impacto não decidido, chave inesperadamente
true fora do escopo, falta de acesso/sessão legítima ou espaço insuficiente.
Após fechamento: tarefa/fault/uncertain impede restart e reabertura; timeout é
escalonamento, não limpeza/kill. Falha de versão/chave/sessão na troca mantém
campanhas fechadas e aciona retorno de código controlado.

Sucesso técnico futuro: versões/hashes por componente e scripts compatíveis,
nenhum escritor antigo, schema/Prisma coerentes, health/DB, guarda/scheduler
no estado decidido, saved/fallback corretos, auth/sessões preservadas/reconectadas
ou divergências explicitadas, atendimento validado por sessão legítima, nenhuma
ativação fora de secult-pe e nenhuma mensagem artificial.

Validação SECULT após autorização separada: manager vê default false e AGENT não
altera; após ativação somente tenant alvo, AGENT consulta própria CLOSED com vínculo
atual ao departamento do snapshot, não outra responsabilidade/tenant; ativos e
SUPERVISOR preservam escopo e ações CLOSED bloqueadas. Usar registros existentes
com conteúdo autorizado, sem criar/transferir/encerrar atendimento real como fixture.
Casos sem dados/papéis legítimos ficam pendentes. Revogação de vínculo/config em
produção só com ação real autorizada; testes locais cobrem negativos/concorrência.
Remoção visual segue polling existente, não apaga conteúdo já recebido. Aceite real
da SECULT exige confirmação de seus usuários; health/build não o substituem.
