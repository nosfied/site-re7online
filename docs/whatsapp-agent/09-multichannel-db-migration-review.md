# Review de arquitetura DB e plano de backfill multicanal

Status: revisao tecnica, sem migration aplicada.

Sprint: 65Y - DB Architecture Review & Backfill Plan.

Base revisada:

- `docs/whatsapp-agent/08-multichannel-persistence-schema-proposal.md`
- `apps/whatsapp-agent/prisma/schema.prisma`
- `apps/whatsapp-agent/prisma/migration-drafts/20260515165000_multichannel_persistence_schema_draft.sql`

## Veredito do draft

O desenho geral esta correto para uma evolucao incremental:

- preserva `waId` legado para WhatsApp;
- adiciona campos multicanal nullable;
- introduz `ContactChannelIdentity`;
- nao exige migracao destrutiva;
- permite backfill e dual-write por fases.

Ainda nao esta pronto para migration real em producao.

Antes de aplicar qualquer migration, e obrigatorio validar em staging/copia do banco, revisar indices, definir criptografia de `externalUserRef`, atualizar LGPD/retention e testar backfill WhatsApp com dados reais anonimizados/amostrados.

## Ajustes feitos nesta revisao

### 1. Remocao de `@@unique` multicanal nullable do schema Prisma

O draft 65X inicialmente usava `@@unique` em campos nullable como:

- `clientId + channel + provider + channelAccountId + externalUserHash`
- `tenantId + channel + provider + channelAccountId + externalUserHash`
- `clientId + provider + channel + channelAccountId + externalMessageId`

Risco:

- no Postgres, `NULL` nao e igual a `NULL` em unique indexes;
- isso permite multiplas linhas com campos incompletos;
- ao mesmo tempo, o Prisma nao representa partial unique indexes;
- deixar `@@unique` no schema geraria indices nao ideais e passaria a falsa impressao de garantia total.

Ajuste:

- removidos os novos `@@unique` multicanal nullable do `schema.prisma`;
- mantido `@@unique` apenas em `ContactChannelIdentity`, onde os campos sao obrigatorios;
- o SQL draft agora usa partial unique indexes revisaveis manualmente.

### 2. Partial unique indexes no SQL draft

Os indices unicos multicanal em modelos operacionais devem ser partial indexes:

```sql
CREATE UNIQUE INDEX "Conversation_multichannel_identity_uniq"
ON "Conversation"("clientId", "channel", "provider", "channelAccountId", "externalUserHash")
WHERE "channel" IS NOT NULL
  AND "provider" IS NOT NULL
  AND "channelAccountId" IS NOT NULL
  AND "externalUserHash" IS NOT NULL;
```

Mesma regra para:

- `Contact`;
- `Conversation`;
- `ConversationRuntimeState`;
- `Lead`;
- idempotencia de `InboundMessage`;
- idempotencia de `OutboundMessage`.

Motivo:

- protege somente registros que ja foram preenchidos com identidade multicanal completa;
- nao interfere em registros legados WhatsApp ainda sem backfill;
- evita bloqueios inesperados durante a fase nullable.

## Riscos avaliados

### Unique indexes com nullable no Postgres

Risco alto se usado diretamente via Prisma `@@unique`.

Decisao:

- usar partial unique index manual no SQL revisado;
- nao depender de `findUnique` Prisma para identidade multicanal nesta fase;
- criar helpers de lookup por `findFirst`/queries compostas ate a estabilizacao.

### Nomes truncados de indices

O diff gerado pelo Prisma cria nomes truncados como:

- `ConversationRuntimeState_clientId_channel_provider_channelA_key`
- `InboundMessage_clientId_provider_channel_channelAccountId_e_key`

Risco:

- baixa legibilidade;
- maior chance de colisao em futuras migrations;
- rollback mais dificil.

Decisao:

- no SQL draft revisado, indices manuais receberam nomes curtos e claros:
  - `Conversation_multichannel_identity_uniq`
  - `ConversationRuntimeState_multichannel_identity_uniq`
  - `InboundMessage_multichannel_message_uniq`
  - `OutboundMessage_multichannel_message_uniq`
  - `Lead_multichannel_identity_uniq`

### FKs opcionais

`ContactChannelIdentity.contactId` e `Lead.contactChannelIdentityId` sao opcionais.

Risco:

- registros orfaos se nao houver governanca;
- associacao errada de lead/contact.

Decisao:

- manter opcionais na primeira fase;
- usar `ON DELETE SET NULL`;
- nao fazer merge automatico de contatos entre canais;
- reconciliacao de contatos deve ser fluxo operacional futuro.

### Performance do inbox

Novos filtros por canal exigem indices por:

- tenant/client;
- channel;
- status;
- updatedAt;
- assignedUserId;
- queueId.

Risco:

- inbox multicanal ficar lento se depender dos indices antigos por `waIdCanonical`.

Decisao:

- manter indices novos nullable;
- validar `EXPLAIN ANALYZE` em staging antes de ativar leitura multicanal;
- nao mudar inbox nesta sprint.

### Backfill WhatsApp

Risco:

- preencher `channelAccountId` errado se `phoneNumberId` nulo;
- gerar hash divergente entre tabelas;
- duplicar `ContactChannelIdentity`;
- afetar constraints parciais se houver dados duplicados inesperados.

Decisao:

- backfill deve ser idempotente;
- usar uma funcao unica de hash;
- registrar contagens antes/depois;
- validar duplicidades antes de criar/enforcar partial unique indexes, ou criar indices depois do backfill conforme resultado.

### LGPD/retention

Novos campos precisam entrar no servico central de privacidade:

- `externalUserHash`;
- `externalUserRef`;
- `legacyWaId`;
- `ContactChannelIdentity`;
- novos campos em Lead/Conversation/Runtime/Messages.

Risco:

- anonimizar `waId` legado mas deixar identidade multicanal recuperavel.

Decisao:

- nenhuma persistencia real de Messenger antes de atualizar retention/LGPD;
- `externalUserRef` deve ser criptografado ou evitado;
- logs continuam usando hash curto/redigido.

### Compatibilidade Prisma Client

Depois de alterar `schema.prisma`, o client precisa ser regenerado.

Risco:

- codigo atual usar tipos antigos em build/deploy.

Decisao:

- `prisma generate` obrigatorio no pipeline de migration/staging;
- build backend obrigatorio;
- nao depender de novos `@@unique` no Prisma para lookup multicanal.

### Rollback

Rollback e simples enquanto nao houver runtime escrevendo nos campos novos.

Risco aumenta depois de dual-write.

Decisao:

- primeira migration deve ser additive-only;
- rollback deve remover FKs, indices, tabela nova e colunas novas;
- nao fazer `DROP` sem backup e janela de manutencao;
- antes de ativar dual-write, criar rollback logico separado.

## Campos que devem permanecer nullable

Na primeira migration real, devem continuar nullable:

- `channel`;
- `provider`;
- `channelAccountId`;
- `externalUserHash`;
- `externalUserRef`;
- `externalMessageId`;
- `legacyWaId`;
- `contactChannelIdentityId`.

Motivo:

- preservar registros legados;
- permitir backfill em fases;
- evitar lock/erro em tabelas grandes;
- permitir rollback sem perda operacional.

## Campos que exigem hash/criptografia

### `externalUserHash`

Deve ser hash deterministico, calculado a partir do identificador externo real.

Recomendacao:

- usar SHA-256 com salt/pepper de aplicacao quando precisar reduzir risco de reidentificacao;
- padronizar comprimento armazenado;
- documentar funcao de hash usada no backfill.

### `externalUserRef`

Nao deve armazenar PSID/Instagram id puro.

Opcoes:

1. nao preencher inicialmente;
2. preencher com valor criptografado;
3. guardar referencia indireta gerenciada por storage seguro.

Recomendacao:

- fase inicial: deixar `externalUserRef` nulo;
- so preencher quando outbound real exigir;
- antes disso, definir criptografia, rotacao e LGPD.

### `legacyWaId`

Para WhatsApp, pode receber `waId`.

Na anonimimizacao:

- deve seguir a mesma politica de `waId`;
- nao pode sobreviver como identificador pessoal quando conversa/lead for anonimizado.

## Plano de backfill WhatsApp

Ainda nao implementar sem sprint propria.

### Pre-checks

1. Contar registros por tabela:
   - `Conversation`;
   - `ConversationRuntimeState`;
   - `InboundMessage`;
   - `OutboundMessage`;
   - `Lead`;
   - `Contact`.
2. Contar registros com `waId` nulo onde o campo e esperado.
3. Contar `phoneNumberId` nulo em conversas/mensagens.
4. Verificar duplicidades por identidade proposta:
   - `clientId + whatsapp + meta + phoneNumberId + hash(waId)`.
5. Validar se `waIdCanonical` deve ser usado em vez de `waId` para hash em algum caso.

### Regra de preenchimento

Para cada registro WhatsApp com `waId`:

- `channel = 'whatsapp'`
- `provider = 'meta'`
- `legacyWaId = waId`
- `externalUserHash = hash(waId)`
- `channelAccountId = phoneNumberId`, quando existir

Fallback para `channelAccountId`:

1. usar `phoneNumberId` do proprio registro;
2. para runtime/lead/contact, resolver pelo tenant se houver um unico `WaPhoneNumber`;
3. se houver multiplos numeros e nao for possivel resolver, deixar nulo e registrar para revisao.

### ContactChannelIdentity

Criar de forma idempotente:

- `clientId`;
- `contactId`, quando houver match seguro;
- `channel='whatsapp'`;
- `provider='meta'`;
- `channelAccountId`;
- `externalUserHash`;
- `legacyWaId`;
- `firstSeenAt`;
- `lastSeenAt`.

Nao fazer:

- merge automatico entre contatos;
- associar Messenger/Instagram a contato WhatsApp por nome;
- usar telefone ou nome para unificar identidades.

### Idempotencia

O script futuro deve poder rodar mais de uma vez.

Regras:

- atualizar somente campos nulos ou ja iguais ao valor esperado;
- se campo preenchido com valor divergente, registrar conflito e nao sobrescrever;
- usar upsert para `ContactChannelIdentity`;
- gerar relatorio de conflitos.

### Validacoes pos-backfill

- contagem de registros preenchidos por tabela;
- contagem de nulos restantes por motivo;
- amostra por tenant;
- duplicidades por identidade;
- storage report;
- retention dry-run;
- evaluation replay;
- WhatsApp E2E.

## Plano de staging

1. Criar backup/snapshot do banco de producao ou copia sanitizada.
2. Subir ambiente staging isolado.
3. Aplicar migration draft em staging, depois de revisao.
4. Rodar `prisma generate`.
5. Rodar build backend.
6. Rodar script de backfill em modo dry-run.
7. Conferir relatorio de conflitos.
8. Rodar backfill real em staging.
9. Criar partial unique indexes depois de validar duplicidades, se necessario.
10. Rodar:
    - `npm run evaluation:replay`;
    - testes de qualification;
    - testes de channel/meta webhook;
    - smoke WhatsApp inbound/outbound;
    - smoke inbox;
    - storage report;
    - retention dry-run.
11. Rodar `EXPLAIN ANALYZE` nas queries principais de inbox.
12. Executar rollback dry-run em copia secundaria.

## Plano de rollback

Enquanto runtime real multicanal nao escrever dados:

1. parar aplicacao ou colocar em manutencao;
2. dropar FK de `Lead.contactChannelIdentityId`;
3. dropar FKs de `ContactChannelIdentity`;
4. dropar partial unique indexes e indices novos;
5. dropar `ContactChannelIdentity`;
6. dropar colunas multicanal nullable;
7. regenerar Prisma Client com schema anterior;
8. build e reload;
9. validar WhatsApp E2E.

Depois de dual-write:

- rollback fisico ainda e possivel, mas perde dados multicanal;
- deve haver plano de export/backup dos campos novos antes de remover.

## Checklist de producao

Nao aprovar migration real sem:

- revisao arquitetura/DB concluida;
- backup validado;
- staging migration OK;
- staging backfill OK;
- duplicidades resolvidas;
- partial unique indexes revisados;
- Prisma Client gerado;
- backend build OK;
- evaluation replay PASS;
- WhatsApp E2E PASS;
- inbox smoke PASS;
- storage report antes/depois;
- retention/LGPD atualizado;
- rollback testado;
- feature flags continuam bloqueando Messenger real;
- janela de deploy aprovada.

## Recomendacao

Nao aplicar a migration ainda.

Proximo passo recomendado:

- criar Sprint 65Z para script de backfill WhatsApp em modo dry-run, sem alterar banco por padrao;
- em paralelo, revisar o SQL com foco em partial indexes, nomes de indices e ordem de criacao;
- somente depois preparar uma migration staging.
