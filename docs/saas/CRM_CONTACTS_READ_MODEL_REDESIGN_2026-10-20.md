# CRM Contacts — redesenho set based do read model

Status: `REDESIGN_VALIDATED_READY_FOR_REVIEW / LOCAL ONLY / NOT DEPLOYED`

Base: `7f17da83d8456061d53b7214e3ab80bc68343c00`

Branch: `fix/crm-contacts-read-model-set-based`

## Causa confirmada

O read model merged selecionava `limit + 1` somente depois de decidir a elegibilidade
de cada Lead. Lifecycle, exclusão, anonimização, conversa e opt-out eram resolvidos por
subconsultas correlacionadas e predicados `OR` de aliases. Em uma carga local com
100.000 Leads no tenant principal e 10.000 no segundo tenant, 11 dos 13 cenários A–M
atingiram o timeout de 15 segundos ou expiraram a transação. O índice experimental de
ordenação keyset não alterou o operador dominante porque o custo estava antes do
`LIMIT`: no gate estrito, seleção/contagem tiveram medianas de 15.038/15.038 ms sem o
índice e 15.039/15.042 ms com o índice, sempre com cinco timeouts em cinco medições.

## Implementação

A consulta monta uma vez, dentro do tenant, conjuntos materializados para Leads base,
contatos por alias e fatos efetivos de contato. O vínculo direto
`Lead.contactChannelIdentityId → ContactChannelIdentity.contactId → Contact` tem
prioridade. Os aliases legados são consultados apenas quando não há contato direto.

Filtros de conversa e último opt-out também produzem conjuntos tenant scoped antes da
seleção. Não existe mais subconsulta de `Contact` ou `ContactChannelIdentity` executada
uma vez por Lead. A escolha entre até três aliases de um Lead usa somente três valores
já materializados em memória pelo plano.

A seleção preserva `updatedAt DESC, createdAt DESC, id ASC`, cursor e fingerprint. Ela
retorna no máximo `limit + 1`; o enriquecimento continua recebendo no máximo `limit`
IDs. O total exato vem do mesmo conjunto `eligible_leads`, na mesma consulta e no mesmo
snapshot, sem reconstruir lifecycle/exclusão/anonimização em uma segunda consulta. O
contrato HTTP e o caminho analítico de campanhas permanecem compatíveis.

## Matriz de desempenho A–M

Cada cenário redesenhado teve um aquecimento e cinco medições. Cada SQL distinta teve
um `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` de aquecimento e cinco medições. O timeout
foi 15 segundos.

| Caso | Escopo | Baseline | Mediana redesenho | Pior parede | Pior `EXPLAIN` |
|---|---|---:|---:|---:|---:|
| A | primeira página | timeout 15.137 ms | 1.181 ms | 1.198 ms | 1.309 ms |
| B | segunda página | timeout 15.004 ms | 1.221 ms | 1.229 ms | 1.351 ms |
| C | página 20 | timeout 15.003 ms | 1.220 ms | 1.303 ms | 1.389 ms |
| D | busca textual | 778 ms | 156 ms | 170 ms | 168 ms |
| E | telefone formatado | 249 ms | 161 ms | 164 ms | 154 ms |
| F | status | timeout 15.002 ms | 333 ms | 338 ms | 364 ms |
| G | com conversa | timeout 15.004 ms | 277 ms | 300 ms | 342 ms |
| H | opt-out | timeout 15.003 ms | 1.466 ms | 1.520 ms | 2.519 ms |
| I | excluídos | timeout 15.002 ms | 1.115 ms | 1.129 ms | 1.277 ms |
| J | contagem filtrada | timeout 15.005 ms | 334 ms | 372 ms | 419 ms |
| K | totais do tenant | timeout 15.006 ms | 2.265 ms | 2.323 ms | 1.278 ms |
| L | read model completo | erro/timeout 15.024 ms | 1.251 ms | 1.322 ms | 1.326 ms |
| M | segundo tenant | timeout 15.003 ms | 113 ms | 116 ms | 128 ms |

Nenhum cenário redesenhado atingiu o timeout. O pior plano foi H, com 2.519 ms. No
caso A, o plano retornou 51 linhas, leu 100.000 Leads uma vez, 20.000 identidades uma
vez e 10.000 contatos duas vezes, com 5.591 blocos em cache e 4.374/4.678 blocos
temporários lidos/escritos. O custo agora soma populações tenant scoped; não multiplica
Leads por contatos/identidades.

Nos filtros G e H, aliases de conversa/evento chegam a Leads por índices e os vínculos
diretos chegam a identidade/contato por chave primária. Esses lookups têm loops iguais
ao conjunto previamente filtrado, mas não varrem `Contact` ou
`ContactChannelIdentity` por Lead. A população tenant scoped de contatos continua
percorrida uma vez.

A sequência até a página 20 não teve duplicação nem perda. Todas as seleções retornaram
no máximo 51 linhas, o enriquecimento do caso L recebeu 50 IDs e o caso M devolveu
somente linhas do segundo tenant.

## Índices

Nenhum índice novo é necessário para este redesenho. Os planos aprovados usam os
índices existentes de tenant/alias e as chaves primárias para vínculos diretos. A lista
exata observada nos planos é `Lead_pkey`, `Lead_tenantId_waId_key`,
`Lead_tenantId_waIdCanonical_idx`, `ContactChannelIdentity_pkey`, `Contact_pkey`,
`Conversation_clientId_waId_key`, `Conversation_clientId_waIdCanonical_idx`,
`Event_clientId_eventName_createdAt_idx` e
`Event_clientId_waIdCanonical_createdAt_idx`. O índice experimental
`Lead(tenantId, updatedAt DESC, createdAt DESC, id ASC)` não foi usado para resolver o
custo dominante e não integra a implementação. Não há migration.

## Validação funcional

- Backend CRM/PostgreSQL: 55 testes aprovados, incluindo cursor, totais, recuperação
  CSV, identidade, importação, vínculo direto, fallback legado, lifecycle, exclusão,
  anonimização, conversa e opt-out.
- Rotas CRM: 22 testes aprovados, incluindo RBAC, isolamento entre tenants, filtros,
  campanhas, opt-out e mais de 500 contatos.
- Frontend: 28 testes aprovados para três páginas, voltar página, falha/retry, resposta
  obsoleta, overlay, reentrada e zero POST de recuperação.
- Builds completos de API e frontend aprovados.
- Busca literal preservada para `%`, `_`, `\\`, acentos e telefone formatado.

## Evidência privada local

- Resultado redesenhado: `/tmp/crm-contacts-read-model-redesign-20261020/evidence/benchmark-results.json`
  — SHA-256 `16a78958c504b0104ace78c0f1d5681070e49735b8c733e940197e4e773f0d3a`.
- Baseline A–M: `/tmp/crm-contacts-read-model-redesign-20261020/evidence/baseline-matrix.json`
  — SHA-256 `bfd94462c4b983f57d6224a029f76c70daf2f71ad27910e77a16e9c25fb722c8`.
- Harness redesenhado — SHA-256
  `c2db777f1a5aa7255233cf356275782c064eda7ee7438057098b029ec9ab65eb`.
- Harness baseline — SHA-256
  `f3a39fc9414748d1035fbd55f2e71885356aefbda10c02b5769315e20d075bbd`.
- 150 planos JSON preservados localmente.

Os dados são sintéticos e a medição ocorreu em PostgreSQL local descartável. Não houve
acesso à VPS, deploy, SQL produtivo, migration, POST funcional, importação, campanha
ou envio.
