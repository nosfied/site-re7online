# Sprint 78N.2 - Authenticated Load Test Fixtures

Status: implementado como preparacao de ambiente de teste.

Atualizacao 78N.2B: o tenant recomendado para carga passa a ser `loadtest-prefeitura`. `demo-prefeitura` deve permanecer dedicado a demonstracoes, POC e validacao funcional.

Atualizacao 78N.2C: antes de executar `prepare`, validar o tenant tecnico com `npm run load-test:tenant:bootstrap -- status --tenant loadtest-prefeitura --json`. O bootstrap fica documentado em `docs/saas/LOAD_TEST_TENANT_BOOTSTRAP.md`.

Atualizacao 78N.2D: para popular SearchIndex, desligar temporariamente `advancedSearchRuntime` antes do `search:index-shadow --record` e religar ao final da preparacao. O cleanup remove API keys, usuarios temporarios, site Webchat, arquivos temporarios e `SearchIndex` do tenant tecnico.

Atualizacao 78N.2E: o `prepare` nao tolera mais outbound Webchat ausente. O fluxo deve criar inbound, executar claim pelo Inbox, persistir outbound humano e deixar a timeline completa para o `inbox-detail`.

Escopo: criar fixtures representativas para carga autenticada sem alterar regra de negocio, seguranca, rate limit global, banco/schema ou runtime funcional.

## Auditoria

| Area | Existe | Reaproveitamento |
| --- | --- | --- |
| Login | `/auth/login`, sessao exclusiva e rate limit por IP | Reaproveitado. A fixture cria varios usuarios para evitar login repetido do mesmo usuario. |
| Rate limiter auth | `LIMIT_AUTH=12/min` por IP em `/auth/login` | Mantido. Nao foi alterado. |
| Public API | API keys por tenant, scopes e rate limit por key | Reaproveitado. A fixture gera varias keys temporarias read-only. |
| Admin users | `/admin/users?clientKey=...` com `ADMIN_TOKEN` | Reaproveitado para criar usuarios pelo fluxo HTTP validado. |
| App users | `/app/users` e `/app/api-keys` | Reaproveitado para API keys apos login app. |
| Webchat runtime | session, inbound e outbound humano controlado | Reaproveitado para criar Conversation, Contact, Inbound e Outbound pelo runtime normal. |
| Inbox | `/app/conversations`, `/app/conversation/:id`, `/timeline` | Reaproveitado. A fixture gera `CONVERSATION_ID` visivel para os usuarios de carga. |
| Search | `SearchIndex`, `/app/search` e `search:index-shadow` | Reaproveitado. A fixture fornece `SEARCH_QUERY`; a populacao do indice deve usar o indexador shadow existente, sem inserts manuais. |

## O Que Nao Foi Alterado

- rate limit global de auth;
- rate limit global da Public API;
- politica de sessao exclusiva;
- RBAC;
- schema;
- migrations;
- canais;
- runtime de negocio;
- PM2/Nginx/Cloudflare.

## Script

Comando:

```bash
cd apps/whatsapp-agent
npm run load-test:tenant:bootstrap -- status --tenant loadtest-prefeitura --json
npm run load-test:tenant:bootstrap -- bootstrap --tenant loadtest-prefeitura --max-users 60 --advanced-search-runtime false --execute --json
npm run load-test:fixtures -- prepare \
  --tenant loadtest-prefeitura \
  --base-url https://converta.re7online.com/agent-api \
  --users 20 \
  --api-keys 20
npm run search:index-shadow -- --tenant loadtest-prefeitura --json --record
npm run load-test:tenant:bootstrap -- bootstrap --tenant loadtest-prefeitura --max-users 60 --advanced-search-runtime true --execute --json
```

Requisitos:

```text
ADMIN_TOKEN
```

Saidas padrao:

```text
load-tests/k6/results/fixtures.env
load-tests/k6/results/fixtures-manifest.json
```

Esses arquivos ficam em pasta ignorada pelo Git. Eles podem conter segredos temporarios e nao devem ser versionados.

## O Que O Prepare Cria

1. Usuarios temporarios por HTTP:
   - 1 ADMIN;
   - supervisores distribuidos;
   - agentes distribuidos.
2. API keys temporarias read-only:
   - `read`;
   - `contacts`;
   - `conversations`;
   - `messages`.
3. Webchat fixture:
   - site ativo;
   - dominio permitido;
   - sessao publica;
   - inbound;
   - claim pelo operador;
   - outbound humano;
   - timeline com inbound + outbound;
   - `CONVERSATION_ID` para k6.

4. Variaveis para Search:
   - `SEARCH_QUERY`;
   - opcionalmente rodar `npm run search:index-shadow -- --tenant loadtest-prefeitura --json --record` antes do k6 quando for necessario garantir indice fresco para a conversa fixture.

## Uso Com k6

Exemplo:

```bash
set -a
source load-tests/k6/results/fixtures.env
set +a

PROFILE=vu20 DURATION=30s load-tests/k6/run-load-profile.sh login
PROFILE=vu20 DURATION=30s load-tests/k6/run-load-profile.sh public-api
PROFILE=vu20 DURATION=30s load-tests/k6/run-load-profile.sh search
PROFILE=vu20 DURATION=30s load-tests/k6/run-load-profile.sh inbox-read
PROFILE=vu20 DURATION=30s load-tests/k6/run-load-profile.sh inbox-detail
```

## Cleanup

```bash
cd apps/whatsapp-agent
npm run load-test:fixtures -- cleanup \
  --tenant loadtest-prefeitura \
  --base-url https://converta.re7online.com/agent-api
```

O cleanup:

- revoga API keys temporarias;
- arquiva o site Webchat temporario;
- desativa usuarios temporarios.
- remove `SearchIndex` do tenant tecnico;
- remove `fixtures.env` e `fixtures-manifest.json` apos sucesso.

Preservar o arquivo `fixtures.env` ate o cleanup. Ele contem os segredos temporarios necessarios para revogar API keys e arquivar o site pelo fluxo app. Se o arquivo for removido antes do cleanup, usar o manifest para localizar recursos pendentes e fazer saneamento manual.

## Status

```bash
cd apps/whatsapp-agent
npm run load-test:fixtures -- status
```

## Riscos

| Risco | Mitigacao |
| --- | --- |
| Segredo temporario em disco | arquivos saem em `load-tests/k6/results`, ignorado pelo Git. |
| Usuario temporario ficar ativo | `cleanup` desativa todos os usuarios do manifest. |
| API key temporaria ficar ativa | `cleanup` revoga todas as keys do manifest. |
| Rate limit ainda acionar | usar `--users` e `--api-keys` compativeis com o perfil de VUs; nao reduzir protecoes globais. |
| Fixture Webchat acumular historico | site temporario e arquivado no cleanup; conversas ficam como historico de teste do tenant tecnico. |
| Search sem resultado representativo | rodar `search:index-shadow --record` apos o prepare para popular `SearchIndex` com dados recentes do tenant tecnico. |
| Tenant de teste sem margem de usuarios | para smoke minimo, usar `--users 1` em tenant interno com margem; para carga representativa, reservar tenant piloto com limite suficiente para ADMIN/SUPERVISOR/AGENT temporarios. |
| Claim/outbound Webchat falhar | o `prepare` deve falhar; nao executar carga ate corrigir o fluxo real de Inbox. |

## Result Report

- Auditoria concluida.
- Usuarios de carga criados pelo endpoint `/admin/users`, nao por insert direto.
- API keys criadas por `/app/api-keys`, com segredo exibido apenas no arquivo temporario.
- Inbox fixture criada por Webchat runtime, gerando Conversation/Contact/Inbound/Outbound no fluxo normal.
- 78N.2E corrigiu o bloqueio `claim_failed:500`; o criterio de aceite passa a ser inbound + claim + outbound + timeline completa.
- k6 atualizado para suportar multiplos usuarios/API keys.
- Cleanup definido.
- Nenhuma regra de seguranca foi relaxada.
