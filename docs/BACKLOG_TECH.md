# BACKLOG TÉCNICO — WhatsApp Agent

## Sprint 1

### Endpoint de health
Confirmar se runbook deve usar:
/admin/health
ou
/health

Status por evidencia atual: **/health como endpoint operacional principal**.
- `deploy-vps.sh` usa `/health` para readiness.
- `smoke-admin.sh`, `prod-status.sh`, `deploy-check.sh` usam `/health`.
- `/admin/health` existe e e util para check autenticado/DB, mas nao e o readiness principal no fluxo de deploy.

### Nome do processo PM2
Confirmar nome do processo PM2 em producao.

Status por evidencia atual: **padrao operacional sustentado = `pm2 reload 0 --update-env`** no script oficial `deploy-vps.sh` (via `PM2_ID=0`).

Ambiguidade residual documentada:
- docs antigos ainda mostram `pm2 reload re7-whatsapp-agent --update-env` e `pm2 restart re7-whatsapp-agent`.
- manter alinhamento em um unico padrao operacional no proximo ajuste de docs.

### Storage inconsistente
Possivel coexistencia de:
- .data JSON storage
- Prisma
- Postgres

Confirmar fonte de verdade.

Status por evidencia atual:
- Conversas/estado operacional passam por storage com uso de `.data` (json storage + scripts de backup/status).
- Mensagens/metricas/admin usam Prisma/Postgres.
- Ha dualidade de persistencia (estado conversacional vs dados operacionais) que deve ser consolidada/documentada como decisao arquitetural.

## Sprint 5

### lastMessage nulo em parte da Inbox
A estrategia atual de derivacao de ultima mensagem nao cobre todos os casos historicos.

### leadName nao normalizado
Hoje o lead pode persistir com prefixos como "Nome:".

### Ambiguidade entre rotas de conversa
Documentar diferenca entre:
- /admin/conversations/:waId
- /admin/conversation/:waId

## Sprint 6

### Janela curta de indisponibilidade pós-reload
Backend e frontend podem falhar na primeira checagem imediatamente após restart.

### Erros antigos de Server Action no front
Observar e limpar logs do re7-admin-front para reduzir ruído operacional.

### Qualidade dos dados da Inbox
leadName ainda não normalizado
lastMessage pode vir nulo em alguns casos

## Sprint 7

### Normalização do nome do lead
Remover prefixos duplicados como "Nome:".

### Melhor captura de cidade
Parser atual nem sempre extrai cidade corretamente.

### Limpeza de logs do admin-front
Erros de Server Action continuam aparecendo em logs.

## Sprint 10

### Autenticação por usuário individual
Hoje a UI envia `userId`; ainda não existe login/sessão por usuário.

### Claim concorrente
Claim de conversa ainda é `last-write-wins`.

### CRUD de usuários incompleto
Existe criação e listagem, mas não edição/inativação/remoção.

### Auditoria de usuário
Ainda não há trilha de eventos detalhada por usuário.
