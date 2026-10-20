# CRM Contacts — paginação por cursor e overlay de processamento

Status: `LOCAL VALIDATED / NOT DEPLOYED`

## Problema confirmado

A primeira recuperação da lista separou contatos de situações, adicionou timeout de
20 segundos e protegeu a tela contra respostas obsoletas. O read model ainda percorria
candidatos em lotes de 500 e construía projeções amplas antes de entregar uma página de
50 itens. Em tenants grandes, o custo crescia com a população total, inclusive quando a
tela precisava apenas da próxima página.

Não havia componente compartilhado para o estado bloqueante da tela CRM. A lista e a
importação exibiam indicadores independentes, baseados em booleanos, que não
representavam operações concorrentes.

## Delta local

- A listagem interativa seleciona no banco no máximo `limit + 1`, com limite padrão 50
  e máximo defensivo 200.
- A ordem é `updatedAt DESC, createdAt DESC, id ASC`. O cursor opaco contém somente
  essas chaves técnicas, versão, página e fingerprint SHA-256 dos filtros. Não contém
  nome, telefone, e-mail ou outra informação pessoal.
- Cursor malformado, cursor de outro conjunto de filtros e `page > 1` sem cursor são
  negados com `invalid_cursor`.
- A volta usa histórico local de cursores já observado. Alterar ou limpar filtros
  descarta esse histórico. A tela não simula salto por offset nem oferece salto para a
  última página.
- `filtered` e os escopos usados por `tenantVisible` são obtidos por contagens próprias.
  A sondagem tenant-scoped continua evitando a contagem de excluídos quando não existe
  contato excluído. `pageCount` continua sendo a quantidade efetivamente retornada.
- Conversas, estados operacionais, opt-out, procedência e campanhas são carregados em
  lote somente para os IDs selecionados na página. O caminho analítico de audiência de
  campanhas conserva sua paginação legada separada.
- `ScreenProcessingOverlay` centraliza carga inicial, aplicação/limpeza de filtros,
  próxima/anterior, recargas da lista, mutações bloqueantes do CRM e etapas bloqueantes
  da importação. Um registro por token impede que uma operação encerrada esconda outra
  ainda ativa. Situações/status permanecem independentes e não seguram o overlay da
  lista.
- O GET continua sem mutação; RBAC, tenant, recuperação CSV e acesso de ADMIN a
  excluídos permanecem no mesmo limite da rota.

## Formato e custo das consultas

Por página, a seleção e a contagem filtrada são duas consultas independentes dentro do
snapshot repeatable-read. O enriquecimento usa consultas em lote restritas aos no
máximo 200 IDs/identidades da página; não há consulta por item. Totais de escopo podem
adicionar uma contagem ativa e, somente após a sondagem existente, uma contagem de
excluídos. Nenhuma contagem monta o payload funcional completo.

## Índice recomendado, sem migration nesta entrega

O schema vigente não possui um índice que cubra a ordem keyset. Antes de implantar em
tenant de alta cardinalidade, avaliar em banco isolado:

```sql
CREATE INDEX CONCURRENTLY "Lead_tenantId_updatedAt_createdAt_id_idx"
ON "Lead" ("tenantId", "updatedAt" DESC, "createdAt" DESC, "id" ASC);
```

Cardinalidade esperada: muitas linhas por `tenantId`, com páginas de 50. A consulta a
medir por `EXPLAIN (ANALYZE, BUFFERS)` é a seleção tenant-scoped com a condição keyset e
`LIMIT 51`. Esta tarefa não cria migration e não executa SQL em produção.

## Compatibilidade

`pagination` permanece na resposta para totais e indicação visual. `pageInfo` acrescenta
`nextCursor`, `hasNextPage`, `hasPreviousPage` e `limit`. A tela CRM usa cursor. O
consumidor analítico de campanhas continua no caminho explicitamente separado por
`audienceAnalysisLimit`, evitando uma quebra implícita de sua análise integral.

## Validação

Os testes cobrem `limit + 1`, total acima de 500, cursor seguinte, retorno por histórico,
desempate, cursor inválido/incompatível, isolamento tenant, escopos ativo/excluído,
contagens sem projeção ampla, resposta obsoleta, status independente, timeout, zero
POST, concorrência do overlay e recuperação CSV. Builds backend/frontend e validadores
documentais fazem parte do gate da branch.

Produção não foi acessada nem alterada. Não houve deploy, PM2, SQL, migration,
importação ou envio.
