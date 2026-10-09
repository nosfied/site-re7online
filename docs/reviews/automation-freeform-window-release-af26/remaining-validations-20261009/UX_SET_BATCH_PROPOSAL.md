# UX conjunto/lote — diagnóstico e proposta para revisão

**DIAGNOSIS / PROPOSAL ONLY / NOT IMPLEMENTED.** Pedido explícito do owner após leitura da out.14/filho e troca para out.13: reduzir repetição e telas encadeadas como padrão de Campanhas. Nenhuma mudança em frontend/backend, scheduler, persistência, transporte, envio ou configuração nesta rodada.

## Causa de apresentação encontrada

1. `src/app/app/campaigns/page.tsx:1531` — `openCampaignDetail(id)` substitui selectedCampaignId e abre o mesmo modal. A tabela de lotes em4535–4541 chama esse método para cada chunk.campaignId. O caminho muda a seleção; não é necessariamente uma nova instância de modal empilhada. O relato de várias telas é uma questão de navegação/percepção, não prova técnica de vários overlays coexistindo.
2. `page.tsx:4432` renderiza o cartão agregado `executionBatch` tanto ao ver controlador quanto ao ver seu filho, sempre que o payload contém esse vínculo. O filho também exibe os cartões próprios e a tabela de resultados. Isso explica repetição do resumo/contexto ao alternar entre os dois IDs, particularmente quando existe um só lote.
3. `routes.ts:36659` — `buildCampaignExecutionBatchSummary` resolve membership ou controlador e inclui metadados, progress/Meta summary e chunks. `routes.ts:36911` — `buildCampaignDetailPayload` devolve esse agregado também para o filho, mas seus resultados/progresso permanecem específicos. Para controlador que não é chunk, usa progress/Meta summary agregados. Remover esse contrato ou somar dados das duas projeções alteraria a verdade dos resultados; não é correção visual necessária.
4. `campaignPresentation.ts:51` mantém a representação única por vínculos explícitos de tenant/ID. A proposta não deve mudar esse mecanismo, ocultar filhos sem relação comprovada ou deduplicar por nomes iguais.

## Componentes/mecanismos existentes avaliados

- Composer em `page.tsx:3248`, CSV3633 e avulso3975 já oferece expandir/recolher com estado local, foco, teclado e aria-expanded/aria-controls. É o padrão visual indicado pelo owner; reaproveitar antes de acrescentar abstração.
- `ChatbotFlowBuilder.tsx:1693` contém `CollapsibleSection`, com botão semântico/summary/estado por ID. É um componente local específico do builder, não uma biblioteca genérica pronta para importação. Usá-lo como referência de acessibilidade; não acoplar Campanhas ao builder nem refatorar ambas as frentes sem necessidade.
- `page.tsx:408` contém `CampaignMessagePreview`, já compartilhado entre formas. Preservar essa composição; não recriar renderizadores de template.
- `campaignRelationReads.ts` oferece remember/read/version/session com fila2 e AbortSignal; detalhe carregado alimenta vínculos. Uma expansão deve reutilizar os leitores existentes e separar sua identidade da seleção do controlador, sem abrir nova camada de polling/cache.
- `CampaignItem.executionBatch.chunks` já traz campaignId, chunkIndex, recipientCount, status, fila e horários. Resultados completos de um filho exigem o GET autorizado desse ID; não inventar detalhes a partir do resumo.

## Menor proposta

Manter **um contexto de conjunto**: cabeçalho, total/progresso agregado, resultado global e ações do conjunto exibidos uma vez. Dentro da tabela de lotes, linha expandível pelo campaignId para conteúdo exclusivo do filho: posição, estado/fila, horários/falha, seus resultados e ações aplicáveis. Não repetir template, destinatário e cartões globais em cada expansão quando apenas duplicarem o contexto do conjunto.

Expansão é local e somente leitura. Consultar o detalhe do filho apenas quando necessário; reutilizar dados já observados e validade de sessão/versão. Falha de leitura deve permanecer visível na linha, sem travar o conjunto inteiro, ocultar registros ou usar resultado de outro ID. Resposta antiga não pode preencher uma linha da campanha/sessão seguinte. Sem consulta simultânea a todos os filhos por clique nem outro timer.

Manter link explícito **“Abrir lote por ID”** e rota/URL existentes para acesso direto, suporte e auditoria. Ao abrir um filho diretamente, mostrar resumo próprio e breadcrumb/link ao conjunto; o agregado pode ficar recolhível em vez de repetir todos os cartões. Mesmo conjunto de um lote usa o padrão, mas resumo próprio e agregado não são somados. Campanhas independentes de nomes iguais permanecem independentes.

## Invariantes para revisão e futura implementação

- Totais/resultados vêm dos read models atuais; aceitação, entrega e falha não se confundem. Não somar resumo global às linhas.
- Pausar/retomar/cancelar conjunto continuam no escopo batchId; ações de lote continuam no campaignId e elegibilidade atual. Nenhuma expansão executa ação mutável.
- Mesmo RBAC/tenant e APIs autorizadas. Link/expansão não amplia permissão nem expõe destinatários ao papel proibido.
- Preservar IDs/históricos, estado de horário independente do composer e detalhe, controles de geração/resposta antiga e leituras limitadas. Não acrescentar persistência local ou mudar scheduler/status.
- Acessibilidade: botão, foco, Enter/Espaço, aria-expanded/controls, contraste e mobile; linhas de dados não devem conter gatilhos interativos aninhados conflitantes.

## Decisão concreta solicitada ao arquiteto

Avaliar o padrão **resumo único do conjunto + dados exclusivos em linhas expansíveis**, mantendo link de detalhe por ID e agregado recolhível quando um filho é acessado diretamente. Delimitar quais cartões são globais e quais são exclusivos antes do delta. Nenhuma implementação está autorizada nesta etapa; não há build/teste/deploy a executar agora. Após decisão, validar sobre APIs simuladas um/vários filhos, parcial/falha, nomes iguais, links diretos, sessão/tenant e resposta antiga, preservando os aceites existentes sem novos envios.


## Continuidade autorizada — 09/10/2026

Owner autorizou a implementação frontend sobre4a910771. [Delta local, provas, hashes e limites](../campaign-batch-ux-20261009/README.md) substituem somente o estágio “proposta aguardando implementação”. O diagnóstico histórico acima foi preservado. Código para revisão, NOT DEPLOYED; nenhum aceite produtivo novo ou alteração de backend/tenant.
