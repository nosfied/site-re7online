# Sprint 78N.2B - Load Test Tenant Provisioning Design

Data: 2026-06-26

Escopo: desenhar um tenant tecnico dedicado para testes de carga autenticados, sem codigo, banco, migration, alteracao funcional, alteracao de producao ou execucao de carga.

## Resumo Executivo

A Sprint 78N.2 validou a infraestrutura de fixtures autenticadas, mas revelou uma dependencia inadequada do tenant `demo-prefeitura`.

Achado principal:

- `demo-prefeitura` tem finalidade de demonstracao, POC e validacao funcional;
- o tenant ja esta no limite de usuarios ativos;
- Webchat estava habilitado apenas nele;
- testes de carga repetitivos podem poluir conversas, timeline, API keys e dados usados em demonstracoes.

Decisao de design:

```text
demo-prefeitura      = demonstracao, POC e smoke funcional
loadtest-prefeitura  = carga, fixtures, benchmark e smoke operacional
re7online            = operacao interna da plataforma
```

Classificacao atual: **ATENDE COM AJUSTE**. A base de fixtures existe, mas a execucao repetivel exige um tenant tecnico dedicado.

## Confirmacao De Nao Alteracao Funcional

Esta sprint nao:

- altera codigo;
- altera banco;
- cria migration;
- cria tenant em producao;
- altera feature flags;
- altera limites;
- altera Webchat, Search, Public API, Inbox ou login;
- executa fixtures;
- executa carga.

## Auditoria Obrigatoria

| Area | O que existe | Reaproveitamento | Gap |
| --- | --- | --- | --- |
| Bootstrap de tenant | `scripts/onboard-tenant.ts`, `/admin/tenants`, `Client`, `WaPhoneNumber`, `TenantOperationalConfig` | Reaproveitar para criar tenant tecnico por fluxo controlado | precisa roteiro especifico para tenant sem canal WhatsApp real |
| Seed demo | `scripts/seed-demo.mjs` cria `demo-prefeitura`, departamentos, usuarios e conversas demonstrativas | Referencia de dados e UX demo, nao deve ser usado como carga | mistura demonstracao com benchmark |
| Feature flags | `Client.features` controla `webchat`, `advancedSearch`, `advancedSearchRuntime`, `scheduling`, `webhooks`, etc. | Reaproveitar flags por tenant | precisa perfil tecnico padronizado |
| Limite de usuarios | `maxActiveAppUsers` via tenant config; fallback atual 5 | Manter validacao existente | carga precisa limite maior apenas no tenant tecnico |
| API Keys | `/app/api-keys`, scopes e rate limit por key | Reaproveitado pela 78N.2 | precisa criar multiplas keys temporarias por execucao |
| Webchat | settings, session, inbound, outbound humano e polling | Reaproveitado para Conversation/Contact/Timeline real | precisa habilitar somente no tenant tecnico para fixture |
| Search | `SearchIndex`, `/app/search`, `search:index-shadow` | Reaproveitar indexador real | precisa dataset reproduzivel e cleanup de indices de carga |
| Inbox | `/app/conversations`, detalhe e timeline | Reaproveitar para leitura/listagem/detalhe | precisa conversa fixture estavel |
| Fixtures 78N.2 | `load-test:fixtures prepare/status/cleanup` | Base operacional ja existe | precisa tenant com margem e flags corretas |

## Tenant Tecnico

Tenant recomendado:

```text
clientKey: loadtest-prefeitura
name: Prefeitura Load Test
profile: government
status: ACTIVE
finalidade: engenharia/carga, nunca demonstracao
```

Regras:

- nao usar em POC comercial;
- nao usar em apresentacao para clientes;
- nao conectar numeros reais de atendimento;
- nao configurar integrações externas reais desnecessarias;
- reset/cleanup pode apagar ou arquivar dados sem preservar historico demonstrativo.

## Features

Habilitar apenas o necessario para carga autenticada inicial:

| Feature | Valor | Motivo |
| --- | --- | --- |
| `webchat` | `true` | criar conversa/timeline pelo fluxo normal |
| `webchatOutbound` | `true` | gerar outbound humano para timeline |
| `advancedSearch` | `true` | permitir tela/API search |
| `advancedSearchRuntime` | `true` durante benchmark | permitir busca textual real |
| `scheduling` | `false` inicialmente | fora dos cenarios 78N.3 |
| `webhooks` | `false` inicialmente | fora dos cenarios 78N.3 |
| `audioTranscription` | `false` inicialmente | evitar custo/ruido |
| `mfa` | `false` inicialmente | evitar distorcer login de carga |
| `telegram` | `false` inicialmente | fora dos cenarios 78N.3 |

Public API nao precisa de flag de exposicao separada nesta fase; a habilitacao operacional ocorre via API keys tenant-scoped e scopes.

## Limites E Quotas

Metas iniciais do tenant tecnico:

| Recurso | Limite inicial | Observacao |
| --- | --- | --- |
| Usuarios ativos temporarios | 60 | cobre 5/10/20/50 VUs com folga para ADMIN/SUPERVISOR/AGENT |
| API keys temporarias | 60 | evita rate limit artificial por key sem alterar limite global |
| Conversas fixture | 100 por rodada | suficiente para inbox list/detail |
| Mensagens por conversa | 2 a 10 | inbound + outbound minimo, podendo ampliar em 78N.3 |
| SearchIndex | derivado por `search:index-shadow --record` | sem insert manual |
| Retencao de fixtures | ate 24h | cleanup deve ser executado ao final |

O limite de usuarios deve ser configurado no tenant tecnico, nao globalmente e nao em `demo-prefeitura`.

## Fixtures Reproduziveis

Fluxo alvo para `loadtest-prefeitura`:

1. Criar usuarios temporarios via `/admin/users?clientKey=loadtest-prefeitura`.
2. Login do ADMIN fixture via `/auth/login`.
3. Criar API keys temporarias via `/app/api-keys`.
4. Criar Webchat site/domino/session pelo runtime Webchat.
5. Enviar inbound pelo endpoint publico Webchat.
6. Criar outbound humano via Inbox/app.
7. Rodar `search:index-shadow --record` para popular `SearchIndex`.
8. Exportar `fixtures.env`.
9. Rodar k6.
10. Cleanup:
    - revogar API keys;
    - arquivar site Webchat;
    - desativar usuarios;
    - remover `fixtures.env`/manifest;
    - opcional futuro: limpar indices/conversas marcadas com `runId`.

## Separacao De Responsabilidades

| Tenant | Finalidade | Pode receber carga? | Pode ser resetado? |
| --- | --- | --- | --- |
| `demo-prefeitura` | Demonstracoes, POC, validacao funcional e comercial | Nao | Nao sem decisao explicita |
| `loadtest-prefeitura` | Testes de carga, benchmark, fixtures e smokes operacionais | Sim, controlado | Sim |
| `re7online` | Operacao interna da plataforma | Nao | Nao |

## O Que Permanece Exclusivo Da Demonstracao

Nao migrar para `loadtest-prefeitura`:

- dados narrativos de POC;
- usuarios demo conhecidos publicamente;
- scripts de apresentacao;
- conversas desenhadas para storytelling comercial;
- configuracoes visuais usadas em proposta/demo;
- credenciais de demonstracao.

## Cleanup E Reset

Requisitos do ciclo de cleanup:

- idempotente;
- nunca exigir insert/update direto para revogar recursos;
- manter manifesto de recursos ate cleanup;
- remover arquivo com segredos temporarios apos sucesso;
- reportar recursos que exigem saneamento manual;
- nao apagar dados de `demo-prefeitura`;
- preferir tenant tecnico descartavel a alteracoes em tenants reais.

## Roadmap

| Sprint | Objetivo | Escopo |
| --- | --- | --- |
| 78N.2C | Tenant bootstrap | criar/configurar `loadtest-prefeitura`, flags, limites e estruturas minimas sem usuario permanente |
| 78N.2D | Fixture prepare | executar `load-test:fixtures prepare`, indexar Search e validar cleanup completo |
| 78N.3 | External Load Test Full Run | rodar 5/10/20 VUs externos com login, Public API, Search, Inbox list/detail |

## Riscos

| Risco | Mitigacao |
| --- | --- |
| Teste poluir demo | proibir carga em `demo-prefeitura` |
| Usuario/API key temporario ficar ativo | cleanup obrigatorio e status final `prepared=false` |
| Rate limit artificial | multiplos usuarios e multiplas API keys no tenant tecnico |
| Search sem dados | indexador shadow real apos fixture |
| Webchat feature ausente | `webchat=true` apenas no tenant tecnico |
| Dado sensivel em resultado k6 | `fixtures.env` ignorado pelo Git e removido no cleanup |

## Criterio De Prontidao Para 78N.3

Antes da 78N.3:

- `loadtest-prefeitura` existe;
- `webchat=true`;
- `webchatOutbound=true`;
- `advancedSearch=true`;
- `advancedSearchRuntime=true` para benchmark;
- limite de usuarios suporta pelo menos 60 ativos temporarios;
- `load-test:fixtures prepare` conclui;
- `search:index-shadow --record` conclui;
- `inbox-detail` possui `CONVERSATION_ID`;
- `cleanup` deixa `prepared=false`.

## Result Report

- Tenant tecnico definido: `loadtest-prefeitura`.
- Quotas propostas: 60 usuarios/API keys temporarias.
- Features minimas definidas: Webchat e Search.
- Lifecycle de fixtures definido.
- Cleanup e reset definidos.
- Roadmap 78N.2C/78N.2D/78N.3 definido.
- Nenhuma alteracao funcional foi realizada.

## Atualizacao 78N.2C

O bootstrap operacional foi definido em `docs/saas/LOAD_TEST_TENANT_BOOTSTRAP.md` e exposto pelo script:

```bash
cd apps/whatsapp-agent
npm run load-test:tenant:bootstrap -- bootstrap --tenant loadtest-prefeitura --max-users 60 --execute --json
```

O script nao cria usuarios permanentes nem API keys permanentes. Usuarios/API keys continuam temporarios e pertencem ao ciclo `load-test:fixtures`.
