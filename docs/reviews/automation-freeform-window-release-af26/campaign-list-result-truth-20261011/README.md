# Result Truth da lista — correção local, 11/10/2026

**LOCAL VALIDATED / REVIEW READY / NOT DEPLOYED.** Base `2c28e6e7`. Corrige somente leitores da API; frontend3227, worker mínimo, runner, webhook, scheduler e dados históricos não foram alterados. Nenhum SSH, provider real, envio, replay produtivo, abertura, retomada, instalação ou deploy nesta tarefa.

## Causa demonstrada e desenho reutilizado

A lista somava Outbounds diretamente: não projetava as posições pendentes do seed e só herdava o resumo do filho por `campaign.accepted_failure.reconciled`. Um controlador não tem submissões próprias; seus contadores persistidos de seleção não representam o resultado de seus lotes. A recuperação delivered não acionava aquela exceção. Além disso, o detalhe substitui a linha da tabela durante sua atualização; deixar seus campos de primeiro nível sem agregação faria a tabela regredir depois de abrir o modal.

O mesmo teste dirigido, com a fonte original, reproduziu **0 enviados em vez de 6**. A fonte corrigida usa `buildCampaignRecipientReadModel`, `buildCampaignRecipientResultStatuses`, os candidatos de identidade existentes e `summarizeCampaignMetaStatuses`. Lista e detalhe compartilham fontes delimitadas, projeção dos campos e agregação de conjunto. Não foi criado resolvedor de identidade ou nova máquina de estados.

Vínculos: tenant explícito; controlador pelo `clientId/idempotencyKey = dynamic:<campaignId>` canônico; filhos por `CampaignExecutionBatchCampaign`, com filtro de tenant também na Campaign. Cada campaignId relacionado entra uma vez; o controlador não é somado como execução. O mesmo destinatário em execuções distintas conta em cada execução. Nomes, telefones, horário e recibos não são chaves de conjunto. Filhos fora da página são lidos pelos vínculos; paginação conserva os IDs, ordem e limite da consulta original.

## Semântica dos campos

| Campo | Projeção corrigida |
|---|---|
| `sentCount` | Soma de sent/delivered/read do leitor canônico; entrega reportada não vira confirmação humana. Conserva o fallback histórico canônico quando não há resultado individual. Não soma recibos ou contadores do controlador aos filhos. |
| `totalRecipients` | Público conhecido da execução, conservando o total materializado e evidências individuais; lote não materializado usa seu público previsto explícito. Controlador sem filhos conserva seu público previsto. Nunca reduz o total abaixo dos resultados individualmente representados. |
| `plannedRecipientCount` / `materializedRecipientCount` | Campos aditivos que distinguem público previsto pelo lote/conjunto do total materializado persistido. Não inventam destinatários ou submissões. `chunks.totalRecipients=0` permanece zero; `recipientCount` preserva a previsão do lote. |
| `blockedCount` | Bloqueios de execução: máximo entre contador histórico da execução e blocked/opt_out/skipped explícitos. Não descarta evidência durável de falha ou bloqueio. |
| `audienceBlockedCount` | Exclusões de seleção do conjunto. Os244 do caso histórico não passam a ser bloqueios das11 posições materializadas; o valor permanece exposto separadamente e em `executionBatch.blockedCount`. Nenhum contador SQL foi reescrito. |
| `metaSummary` | Projeção canônica por destinatário de cada execução: sent, delivered, read, failed, blocked, opt_out, skipped e pending. Seeds em processamento conservam pending; plano ainda sem materialização não fabrica status de provider. |
| `progress.pendingCount` | Posições aguardando processamento/materialização, descontando sucesso, bloqueio e falha conhecidos e conservando pending explícito. Inclui público previsto ainda não materializado, mesmo sem linhas individuais de provider. |

Listas e detalhes usam os mesmos campos de primeiro nível que a tabela consome. Nenhuma alteração de componente, timer, polling, filtro ou controle de sessão foi necessária.

## Consultas e limites

A lista seleciona só os conjuntos vinculados aos IDs paginados e só suas execuções do mesmo tenant. Fontes individuais são lidas em grupos de até100 IDs, com páginas SQL de até1000 registros/cursor; todas as páginas são consumidas, sem truncar resultados silenciosamente. Predicados explícitos `rawPayload.campaignId` ou prefixo de `messageId`, revalidados pelo resolvedor canônico; nunca varredura de todo histórico do tenant baseada apenas na data. Seeds e bloqueios também são delimitados por tenant/IDs e eventos canônicos.

**Até8 consultas SQL** nas provas com2 e32 campanhas, sem leitura de Contact/Lead, enriquecimento CRM ou chamada ao detalhe por linha. A quantidade pode crescer com o número de páginas de evidências e grupos de IDs, não por uma consulta de detalhe para cada linha. O leitor do detalhe mantém seu enriquecimento CRM existente. Não é um benchmark de carga produtiva, nem mudança na consulta de posição da fila já existente.

## Provas executadas

- Node **20.20.0**, PostgreSQL **16.15** real isolado; compilação TypeScript final exit0/zero diagnósticos.
- **9 testes novos PASS:** filho/controlador6delivered+5pending sem recibo; lista/detalhe/nova lista; controlador sozinho na página; várias execuções com destinatário compartilhado/nomes iguais; controlador não materializado; recibos FAILED131026 e delivered coexistindo e retirados somente da fixture; bloqueios explícitos; tenant estrangeiro/vínculo inválido; HTTP401/AGENT403/ADMIN200;32 linhas sem N+1; counters defasados; lote não materializado com público conhecido.
- **1 regressão existente PASS:** SQL sintético FAILED131026,1SENT+1FAILED+4blocked, replay sem duplicação e read models de filho/controlador/página. Apenas o caso diretamente afetado foi reexecutado; não reatribuir os demais testes de recuperação a esta execução.
- Browser real sobre o frontend3227 extraído e reutilizado: APIs/auth simuladas, respostas da lista e detalhe exportadas do teste PostgreSQL, relógio de polling controlado. CSS/JS reais, HTTP/MIME/Tailwind e estilos calculados conferidos. Lista → detalhe → novo polling conserva6/11 e cards6entregues/5pendentes; filtro Enviando preserva os contadores. Só GET; sem gravação, campanha ou mensagem.
- Os logs privados conservam as execuções intermediárias: erro de fixture de vínculo único/limpeza corrigido, espera de título incorreta do smoke corrigida e uma observação inicial anterior ao evento de rede de um asset. A espera final dos assets tem orçamento10s, mantém todas as negativas HTTP/MIME/estilos e registra as observações; não relaxa o detector.

Hashes de fonte, compilado e resultados sanitizados: [validation.json](validation.json). [Patch executável mínimo](api-read-model.patch) contém somente `http/routes.ts`, em formato zero-contexto (`git apply --unidiff-zero`), vinculado ao hash da fonte original. Logs, fixture exportada, screenshots e compilados locais ficam fora do Git. O módulo canônico `campaignRecipientResultTruth.js` mantém o hash43a23008… já conferido na implantação; a alteração executável desta rodada é `http/routes.js`.

## Reprodução local

Banco abaixo deve ser exclusivamente sintético, sem dados, providers ou executores produtivos. Reutilizar Prisma gerado/dependências verificadas. Nenhum index/entrypoint backend é executado.

```bash
createdb -h 127.0.0.1 -p 55439 re7_list_truth_20261011
DATABASE_URL=postgresql://deifson-oliveira@127.0.0.1:55439/re7_list_truth_20261011 /tmp/re7-b9-node20.20.0 apps/whatsapp-agent/node_modules/prisma/build/index.js db push --schema apps/whatsapp-agent/prisma/schema.prisma --skip-generate
/tmp/re7-b9-node20.20.0 apps/whatsapp-agent/node_modules/typescript/bin/tsc -p apps/whatsapp-agent/tsconfig.json --outDir /tmp/re7-list-truth-compiled
```

O diretório compilado deve conter package.json `type:module` e referência somente às dependências locais verificadas do agente. Teste nega outra URL/db ou versão Node. Exportação opcional contém somente a fixture sintética.

```bash
DATABASE_URL=postgresql://deifson-oliveira@127.0.0.1:55439/re7_list_truth_20261011 NODE_ENV=test LIST_TRUTH_BROWSER_FIXTURE=/tmp/re7-list-truth-browser-fixture.json /tmp/re7-b9-node20.20.0 --test /tmp/re7-list-truth-compiled/campaigns/campaignListResultTruth.test.js
/tmp/re7-b9-node20.20.0 tests/browser/campaignListResultTruth.mjs http://127.0.0.1:3082 /tmp/re7-list-truth-browser-fixture.json
```

Frontend local servido pelo pacote3227 existente em Node20, sem rebuild. Nenhum start produtivo é indicado ou autorizado por esses comandos.

## Alcance e próximo passo

Delta API de leitura, comum às três modalidades; não altera importação, execução imediata/agendada, identidade, RBAC ou transporte. Worker mínimo não importa estes leitores e não precisa de backport funcional. Frontend permanece3227. Branch de revisão tem auto-deploy desabilitado; publicação somente fast-forward.

Próximo passo: revisão independente do patch e das provas. **Produção ainda tem a projeção anterior**; esta publicação não encerra o FAIL produtivo da lista ou autoriza implantação. Uma futura decisão deve compor esse módulo sobre a API preventiva efetiva, preservando os deltas já aceitos, e então conferir as listas/detalhes existentes sem envio.

Aceitação/webhook aceitos e frontend3227 concluído permanecem preservados. Recuperação.6/recibo/tarefa arquivada/guarda38/job suspenso/seis resultados/cinco sem submissão e setembro CLOSED não foram acessados ou alterados nesta tarefa. CSV/Syer, internacionais, agrupamento multilote, contingência AUTO e CRA-PR permanecem separados.
