# Superficies do /app, dados carregados e retencao LGPD

**Auditoria operacional15/10/2026 — continuidade:** [alcance por identidade, lifecycle e proposta mínima](../reviews/automation-freeform-window-release-af26/security-containment-20261012/cipher-controls-prisma-20261015/REPORT.md). Fonte efetiva33d36d97: políticas90d/365d preservadas; seleção por idade/atividade não exige closedAt. Semente original BOT e segunda que ultrapassou o cutoff HUMAN/WAITING/handoffACTIVE, sem atribuição: não confundir fila com atendimento atribuído. Identidade compartilhada não autoriza ação de titular; proposta de proteção lifecycle/escopo por conversa aguarda decisão, não implantada. No modo postgres do consumidor, cleanup transitivo pode remover RuntimeState e Assignment por cascade; não se limita a soft delete no serviço principal. --dry-run chama upsert e não é leitor puro. .env não reconciliado/retention não executada. Horário legado03:30UTC=00:30Fortaleza. Cifragem usa perfis selados independentes e não exige reabilitar esse cron; nenhuma política de tenant mudou.


Este documento registra a auditoria feita em 2026-04-30 nas telas do portal
do cliente (`/app`) do Converta / WhatsApp Agent, apos os ajustes de LGPD,
soft delete, limpeza controlada do tenant de teste e fallback de campanhas.

## Principio operacional

As telas do `/app` nao dependem todas da mesma base operacional.

- Inbox e relatorios dependem de conversas, mensagens, metricas e estado
  operacional.
- Campanhas, templates, chatbot, usuarios, setores e privacidade dependem de
  tabelas ou configuracoes proprias.
- Retencao LGPD curta reduz historico operacional e pode deixar relatorios
  vazios mesmo com o restante do portal funcionando.

## Estado observado no tenant `justa-advocacia`

Auditoria em producao na VPS `converta.re7online.com`, repo
`/opt/re7online/site-re7online`, em 2026-04-30:

| Item | Situacao observada |
| --- | --- |
| `Client.status` | `ACTIVE` |
| Conversas totais | 1 |
| Conversas ativas (`deletedAt = null`) | 1 |
| Conversas removidas da operacao | 0 |
| Runtime states | 0 |
| Inbound messages | 122 |
| Outbound messages | 79 |
| Events | 6385 |
| Leads | 1 |
| Campaigns | 15 |
| Templates | 6 |
| Template requests | 5 |
| Users | 4 |
| Departments | 6 |
| Chatbot flows | 2 |

Durante a auditoria foi encontrado `RetentionConfig.retentionDays = 1`.
Isso e arriscado para validacao, porque qualquer execucao de retencao remove
da operacao praticamente todo historico com mais de 1 dia.

Acao aplicada em producao:

- `RetentionConfig.retentionDays` do tenant `justa-advocacia` ajustado para
  `90` dias.

## Tela a tela

| Tela | Dados carregados | Status | Observacao |
| --- | --- | --- | --- |
| `/app/inbox` | `/app/conversations`, `/app/conversation/:waId`, lead, notas, usuarios, setores, realtime | OK | Conversas com `deletedAt != null` ficam ocultas. Novo inbound reativa a conversa operacionalmente. |
| `/app/campaigns` | campanhas, templates aprovados, detalhe da campanha | OK com ressalva | Se `OutboundMessage` foi removido, o detalhe usa fallback do evento `campaign.seed.saved`. Campanhas antigas sem seed nao podem ter destinatarios reconstruidos. |
| `/app/templates` | `Template` e `TemplateRequest` | OK | Independe de conversas/mensagens. Sincronizacao com Meta continua por template. |
| `/app/chatbot` | `ChatbotFlow` e settings do tenant | OK | Independe de historico operacional. Editor possui formatacao JSON, busca e validacao sintatica basica. |
| `/app/reports` | `ConversationMetrics` e estado operacional por conversa | OK com efeito esperado de retencao | Relatorios podem ficar vazios/reduzidos apos retencao ou limpeza do tenant. Foi adicionado aviso quando ADMIN estiver com retencao menor que 30 dias. |
| `/app/settings/users` | `User` e `Department` | OK | Independe de historico de conversas. |
| `/app/settings/departments` | `Department` | OK | Independe de historico de conversas. |
| `/app/settings/privacy` | `RetentionConfig`, acoes LGPD de conversa e anonimizacao por titular | OK / subject OWNER PASS / local validated / not deployed | Acoes exigem ADMIN. Retencao e exclusao usam soft delete/anonimizacao, sem delete fisico em cascata. Anonimizacao por titular parte de Contact canonico do mesmo tenant ou Lead-only quando `contactId = null`, possui previa read-only e confirmacao forte, e reutiliza primitivas existentes sem duplicar engine de anonimizacao. |
| `/app/login` | autenticacao e sessao | OK | Sem dependencia de historico operacional. |

## Campanhas e detalhe por numero

O detalhe por destinatario em campanhas usa preferencialmente registros
`OutboundMessage` ligados ao `campaignId` dentro de `rawPayload`.

Quando esses registros nao existem mais, o backend tenta reconstruir a lista
de destinatarios a partir do evento:

- `eventName = campaign.seed.saved`
- `messageId = campaign.id`
- `payloadJson.recipients`
- `payloadJson.templateParams`

Limite conhecido:

- se uma campanha antiga nao possuir `OutboundMessage` nem `campaign.seed.saved`,
  nao ha fonte confiavel para reconstruir destinatarios e parametros.

## Retencao LGPD

Politica atual:

- soft delete em `Conversation.deletedAt`;
- anonimizacao sem apagar auditoria;
- mensagens/eventos/metricas/leads/contacts nao sao removidos fisicamente nesta
  fase;
- `/app/conversations` oculta `deletedAt != null` por padrao.
- anonimizacao por titular reutiliza as primitivas existentes para minimizar
  Contact, ContactChannelIdentity, Lead, LeadNote, conversas associadas,
  runtime state, mensagens e eventos sanitizaveis; a previa nao executa mutacao.
- descoberta de titular em Privacidade nao usa a mesma visibilidade da lista
  operacional do CRM: `operationallyExcludedAt` continua ocultavel no CRM normal,
  mas nao impede previa/anonymizacao por titular.

Recomendacao de operacao:

- manter tenants de validacao em `90` dias, salvo teste controlado;
- se testar retencao curta, documentar antes e saber que relatorios/inbox podem
  ficar esvaziados;
- apos teste de retencao curta, voltar para `90` dias antes de continuar a
  validacao funcional.

Automacao atual na VPS:

- host: `converta.re7online.com`;
- usuario do crontab: `deploy`;
- escopo: global, para todos os tenants existentes no banco no momento da
  execucao;
- horario: diariamente as 03:30;
- log: `/opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/retention-global.log`.

Entrada instalada:

```cron
30 3 * * * cd /opt/re7online/site-re7online/apps/whatsapp-agent && npm run retention:run >> /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/retention-global.log 2>&1
```

Verificar:

```bash
crontab -l | grep retention
tail -n 50 /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/retention-global.log
```

Reativar somente se o crontab for removido, se a VPS/usuario `deploy` forem
recriados, ou se a pasta de producao mudar. Para novos tenants, nao e necessario
adicionar uma linha propria: a execucao global ja inclui todos os tenants,
criando `RetentionConfig` default de 90 dias quando ela ainda nao existir.

## Aviso em relatorios

`/app/reports` consulta `RetentionConfig` para usuarios ADMIN.

Se `retentionDays < 30`, a tela exibe aviso explicando que relatorios e historico
operacional podem ficar reduzidos quando a retencao for executada.

O aviso e apenas UX:

- nao altera backend;
- nao altera regras de retencao;
- nao bloqueia exportacao;
- nao aparece para usuarios sem acesso ADMIN.

## Comandos uteis de auditoria na VPS

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
node --input-type=module
```

Consulta resumida via Prisma:

```js
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const client = await prisma.client.findFirst({
  where: { clientKey: "justa-advocacia" },
  select: { id: true, clientKey: true, status: true },
});

console.log({
  client,
  conversations: await prisma.conversation.count({ where: { clientId: client.id } }),
  activeConversations: await prisma.conversation.count({
    where: { clientId: client.id, deletedAt: null },
  }),
  deletedConversations: await prisma.conversation.count({
    where: { clientId: client.id, deletedAt: { not: null } },
  }),
  inboundMessages: await prisma.inboundMessage.count({ where: { clientId: client.id } }),
  outboundMessages: await prisma.outboundMessage.count({ where: { clientId: client.id } }),
  campaigns: await prisma.campaign.count({ where: { clientId: client.id } }),
  templates: await prisma.template.count({ where: { clientId: client.id } }),
  chatbotFlows: await prisma.chatbotFlow.count({ where: { clientId: client.id } }),
  retention: await prisma.retentionConfig.findUnique({ where: { clientId: client.id } }),
});

await prisma.$disconnect();
```

## Delta local de retenção automática — 15/10/2026, não implantado

[Implementação e provas para revisão](../reviews/automation-freeform-window-release-af26/security-containment-20261012/cipher-v14-final-20261015/PRISMA_LOCAL.md). A antiguidade de uma conversa não autoriza a operação explícita por titular. O patch automático limita alterações a Conversation+Message por conversationId/tenant e runtime único compatível; identidades compartilhadas/ambíguas e perfil não PostgreSQL negam. Contact/CCI/Lead/notas/Inbound/Outbound/eventos/metrics/Assignment anteriores permanecem preservados. Runtime vira tombstone sem remoção física/cascata. HUMAN, IN_PROGRESS, atribuição, fila, handoff ACTIVE/PENDING e atividade recente protegem o candidato. BOT WAITING isolado não demonstra atendimento humano.

Prévia apenas SELECT, sem criar política default ou auditar execução. Execução futura revalida política/identidade/atividade sob locks+Serializable e CAS; item e auditoria são atômicos, conflito nega sem replay. A operação manual explícita por titular mantém seu alcance contratado e testes anteriores.42 provas locais PASS; nenhuma alteração de políticas, retenção dos tenants, dados produtivos ou.env nesta entrega. Revisão e implantação seletiva são decisões separadas da cifragem.
