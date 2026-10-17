# Change Policy

## Regra de encerramento e antiespiral

Cada mudança deve ter um estado canônico curto, próximo ato permitido e critérios de
encerramento verificáveis. Um preflight negado ou incompleto preserva a produção e registra
a evidência, mas não autoriza automaticamente novo framework, manifesto, coleta, requisito
ou replay. Só se adiciona gate quando houver consumidor real identificado e quando o dado
não puder ser obtido pelo mecanismo canônico existente. Provas válidas são reutilizadas.
Branches operacionais devem executar CI de frontend, backend e contratos críticos; deploy
não pode ser inferido de documentação nem de push. Estado vivo exige evidência atual da VPS.

### Nota de aplicação CSV17/10 — normas abaixo preservadas

O [estado e método vigente](../RUNBOOK_WHATSAPP_AGENT.md#continuidade-csv--estado-vigente-e-metodologia)
registra SQL CONSUMED/DENY e lacuna de equivalência do ambiente de ensaio. A obrigação
existente de validação local real não permite tratar SQL real com transporte/PG* substituído
como prova do lançamento completo. Esta é a explicitação do alcance do ensaio, não regra,
privilégio, autorização ou gate novo. Princípios permanentes completos permanecem abaixo.


Status: politica oficial de mudancas do Converta. Este documento nao altera runtime.

## Objetivo

Padronizar o nivel de validacao antes de commit, deploy e promocao de releases.

Toda mudanca deve ser classificada antes de ser entregue.

## Princípios permanentes de retenção operacional

Antes de copiar, buildar ou compactar, comparar conteúdo existente por hash, runtime,
compatibilidade e dependências. Reutilizar bytes e provas válidos quando o contrato
permitir; registrar motivo e orçamento de cada nova cópia volumosa. Não introduzir
hardlinks ou symlinks em preparação selada sem revisão do contrato e dos destinos.

Cada geração tem finalidade, responsável, estado e encerramento explícitos. Histórico
não implica permanência de todos os executáveis na VPS. Preservar componentes ativos,
retorno compatível e dependências; classificar o restante para custódia verificável,
acessível ao owner, sem alterar manifests históricos. Retirada tem índice/recibo próprio.
Retenção de dados, contratos e evidências dos tenants é obrigação distinta da retenção
de pacotes executáveis; esta regra não altera retenção LGPD, logs, snapshots ou segredos.

A revisão é semanal e obrigatória após janela, recusa, substituição ou encerramento.
Preparação sem orçamento medido e retirada sem autorização específica não avançam.
Idade não autoriza exclusão; prune genérico e replay de resultado incerto são proibidos.
O procedimento único está no [runbook](../RUNBOOK_WHATSAPP_AGENT.md#retenção-operacional-permanente),
com [capacidade](OPERATIONAL_BASELINE.md#capacidade-e-retenção-operacional)
e [checklist](RELEASE_CHECKLIST.md#retenção-de-releases-e-preparações).
Documentação publicada não significa rotina implantada ou limpeza automática ativa.

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

