# Compatibilidade e troca coordenada — proposta para revisão

Sem execução, deploy ou autorização de janela nesta entrega. O delta funcional não substitui os contratos operacionais de preparação/retorno do runtime NEWauth+NEWDB+NEWcipher.

| Combinação | Comportamento | Decisão |
|---|---|---|
| Interface antiga + API antiga | Sem ledger de operação; timeout não prova falha | Estado legado; não atribuir retroativamente recibos novos |
| Interface antiga/aba aberta + API nova | Confirm sem UUID recebe 400 antes de admissão ou linha; prévia/lista continuam disponíveis | Importação fica indisponível nessa aba até recarga explícita; nenhum retry automático resolve |
| Interface nova + API nova | UUID antes de POST, recuperação GET e resumo correlacionado | Combinação suportada |
| Interface nova + API antiga | API antiga pode ignorar UUID e executar sem recibo novo; GET não existe | Combinação proibida; não publicar frontend primeiro nem misturar versões da API |

## Sequência mínima futura

1. Revisar/selar artefatos API e frontend coordenadamente, compatíveis com os consumidores atualmente ativos e retornos. Não usar um build antigo só porque esta prova usa as fontes do worktree.
2. Em janela autorizada, suspender novas confirmações de CSV pelo controle de admissão canônico aplicável, e provar saída de requisições antigas em andamento. Esta entrega não instala um novo mecanismo de suspensão. Ausência de requisição na UI ou timeout não comprovam saída; uma importação antiga sem ledger exige classificação própria antes de qualquer nova submissão. Não reimportar para descobrir o resultado.
3. Ativar somente a API nova, integralmente, sem balanceamento com backends antigos. Provar o contrato de UUID e GET em todos os caminhos antes de liberar o frontend novo. A recusa de clientes antigos é intencional e restrita à confirmação de importação.
4. Publicar frontend novo; informar que abas antigas abertas devem recarregar a página de CRM antes de confirmar importação. Não exige logout/limpeza genérica de sessão ou navegador; não copia tokens. Abas antigas não recebem código novo automaticamente por estarem abertas. Um 400 não autoriza repetir importação histórica desconhecida.
5. Conferir versão de API/frontend e recuperação por operação, com RBAC/tenant, antes de reabrir admissão de CSV. Aceite produtivo depende de roteiro próprio; sem CSV real de teste por inferência.

## Retorno e resultado incerto

Não retornar a API antiga e reabrir importações enquanto interface nova ou operações admitidas dependerem do contrato. Um retorno deve preservar endpoints/ledger/controle de replay, ou manter confirmação suspensa até nova decisão. Retornar apenas a interface antiga causa recusa segura de CSV na API nova, mas perde o acompanhamento na UI; preservar referências e consultá-las pelo consumidor compatível, sem replay.

O 400 por UUID ausente foi exercitado no navegador contra a API real sintética, sem contato gravado. A combinação frontend novo/API antiga foi auditada por código e deliberadamente não exercitada como importação, pois seu comportamento não oferece a garantia exigida. Este documento define restrição de rollout, não um handshake de versão implantado: não existe garantia automática contra encaminhamento incorreto para API antiga. Não há pipeline, proxy, feature flag ou política produtiva alterados.
