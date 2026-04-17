# ADR-004 — Separação de superfícies: /admin vs /app

## Status
Aprovado

## Contexto
O produto possui hoje duas superfícies com responsabilidades misturadas:

- `/admin`: console técnico/token-based
- `/app`: portal do cliente com autenticação por usuário real

A análise técnica mostrou que parte da governança do cliente ainda está em `/admin`, embora `/app` já seja a superfície correta para RBAC por usuário, auditoria com identidade real e operação institucional.

## Problema
A mistura atual gera:

1. auditoria limitada para ações do cliente
2. governança do tenant dependente de token técnico
3. UX confusa entre área da plataforma e área do cliente
4. tendência de novas features de cliente continuarem sendo colocadas em `/admin`

## Decisão
A partir da Sprint 42.1:

- `/admin` = Re7 / plataforma / superadmin / operação interna
- `/app` = cliente / usuários reais / governança do tenant

## Regras
1. Não adicionar mais funcionalidades do cliente em `/admin`.
2. Tudo que depender de identidade humana real do tenant deve ir para `/app`.
3. `/admin` continua funcionando por compatibilidade durante a transição.
4. A migração será incremental, sem remoção imediata de endpoints antigos.

## O que permanece em /admin
- tenants
- onboarding
- embedded signup / Meta
- bootstrap de tenant
- observabilidade cross-tenant
- administração interna da plataforma

## O que migra para /app
- users
- departments
- reports
- demais funções de governança entregues ao cliente

## Ordem de migração
1. `/app/users`
2. `/app/departments`
3. `/app/reports`

## Estratégia
- reutilizar lógica existente
- trocar a fonte de autenticação para `requireClientAuth`
- manter `/admin/*` antigo funcionando temporariamente
- esconder menus de cliente no frontend `/admin`, sem remoção de backend nesta fase

## Critério de sucesso
A transição será considerada concluída quando:

- cliente operar governança apenas via `/app`
- auditoria registrar `userId` real
- RBAC ficar íntegro por usuário/role/department
- `/admin` ficar reservado à plataforma
- não houver regressão funcional

## Consequências
Positivas:
- governança correta
- auditoria forte
- UX coerente
- melhor aderência a edital

Negativas / custo:
- duplicação temporária de superfícies durante a transição
- necessidade de compatibilidade provisória em `/admin`
