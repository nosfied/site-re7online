# Change Policy

Status: politica oficial de mudancas do Converta. Este documento nao altera runtime.

## Objetivo

Padronizar o nivel de validacao antes de commit, deploy e promocao de releases.

Toda mudanca deve ser classificada antes de ser entregue.

## Tipo A - Correcao Visual

Exemplos:

- ajuste de cor, spacing, fonte ou responsividade
- texto estatico
- docs
- componente visual sem alterar dados, API ou fluxo operacional

Replay:

- nao obrigatorio
- obrigatorio se a mudanca tocar automacao, IA, canais ou runtime indiretamente

Homologacao:

- validacao visual local ou em preview quando aplicavel
- mobile/desktop se a mudanca for responsiva

Validacao manual:

- `git diff --check`
- frontend build se tocar frontend
- rota afetada deve carregar

## Tipo B - Feature Nova

Exemplos:

- nova tela
- novo botao com acao operacional
- novo relatorio
- novo filtro
- nova configuracao em UI

Replay:

- obrigatorio se tocar chatbot, IA, fluxo de atendimento, handoff, mensagens ou tenant config
- recomendado para mudancas em inbox que afetem classificacao/status

Homologacao:

- obrigatoria em tenant de teste ou ambiente controlado
- smoke do modulo novo e dos modulos vizinhos

Validacao manual:

- backend/frontend build conforme escopo
- rotas 200
- RBAC/feature flag
- multitenancy
- ausencia de PII/secrets em logs/API/UI

## Tipo C - Mudanca Estrutural

Exemplos:

- alteracao em auth/session
- alteracao em tenant resolution
- mudanca em realtime/websocket
- mudanca em notificacoes/push
- mudanca em outbound/inbound de canais
- mudanca em storage ou fluxo compartilhado

Replay:

- obrigatorio se houver qualquer efeito em atendimento, automacao ou canais

Homologacao:

- obrigatoria
- deve incluir regressao dos canais nao alterados

Validacao manual:

- backend build
- frontend build se UI afetada
- testes focados
- health
- smoke inbox
- shadow compare WhatsApp se tocar canais, conversas ou identidade multicanal
- validacao de tenant isolation

## Tipo D - Migration

Exemplos:

- nova migration Prisma
- alteracao de schema
- backfill
- alteracao de origem de verdade de configuracao
- remocao de fallback

Replay:

- obrigatorio se tocar runtime, automacao ou dados de conversa

Homologacao:

- obrigatoria em staging/copia antes de producao
- backup obrigatorio antes de production deploy

Validacao manual:

- revisar SQL da migration
- `npx prisma validate --schema prisma/schema.prisma`
- `npm run db:generate`
- backend build
- migration deploy controlada
- smoke pos-migration
- rollback conceitual documentado

## Matriz Rapida

| Tipo | Replay | Homologacao | Validacao Manual |
| --- | --- | --- | --- |
| A - visual/docs | nao, salvo impacto indireto | leve | sim |
| B - feature nova | condicional/obrigatorio se toca runtime | sim | sim |
| C - estrutural | sim quando toca atendimento/canais | sim | sim, ampliada |
| D - migration | sim se toca runtime/dados | sim, staging/copia | sim, com backup |

## Regras Permanentes

- Mudanca em WhatsApp deve validar que Messenger/Instagram nao quebraram quando compartilharem superficie.
- Mudanca em Messenger/Instagram deve validar que WhatsApp permanece intacto.
- Mudanca em `tenants.json` deve citar fonte de verdade e plano futuro.
- Mudanca em AI/automacao deve passar por evaluation/replay.
- Mudanca que cria ou altera documentacao operacional deve atualizar `DOCUMENTATION_INDEX.md` quando relevante.
- Nenhum token, secret, dump, `.data` ou payload bruto deve ser commitado.

