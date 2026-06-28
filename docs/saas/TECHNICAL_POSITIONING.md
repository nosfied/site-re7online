# Technical Positioning

Status: narrativa tecnica da Sprint 79A para comissoes de contratacao, equipes de TI e avaliadores de PoC. Nao e material de marketing.

## Visao Geral

O Converta e uma plataforma SaaS multi-tenant para atendimento digital, operacao omnichannel, automacao supervisionada, CRM/timeline, indicadores e governanca operacional. A plataforma foi evoluida em quatro fases:

1. Arquitetura e plataforma;
2. Observabilidade e seguranca;
3. Hardening operacional;
4. Bid Readiness.

O estado atual permite demonstrar atendimento humano e automatizado em canais oficiais, com segregacao por tenant, RBAC, historico, relatorios, Search, Public API, Webchat, Telegram, observabilidade, alertas e laboratorio de carga validado.

## Arquitetura

Componentes principais:

- backend `whatsapp-agent` em Node.js/TypeScript;
- PostgreSQL via Prisma;
- frontend administrativo e app operacional;
- PM2 para processos backend/frontend;
- Nginx/Cloudflare/TLS na borda;
- Meta Cloud API para WhatsApp/Messenger/Instagram;
- Bot API para Telegram texto;
- Webchat widget minimo via endpoints publicos controlados;
- feature flags por tenant.

Evidencias:

- `PRODUCT_MAP_CURRENT.md`;
- `GOVERNANCE_CONFIG.md`;
- `CHANNELS_GOVERNANCE.md`;
- `OPERATIONAL_BASELINE.md`.

## Diferenciais Tecnicos

| Diferencial | Evidencia |
| --- | --- |
| API oficial Meta | WhatsApp/Messenger/Instagram sem QR Code informal |
| Multi-tenant governado | `clientId`, features por tenant, RBAC e isolamento |
| Omnichannel real | WhatsApp, Messenger, Instagram, Webchat e Telegram MVP |
| Inbox performatico | `inbox-read vu20 p95 585ms`, 0% erro |
| Observabilidade interna | logs redigidos, metricas, dashboard e AlertManager |
| Public API | OpenAPI, API keys, read-only e webhooks controlados |
| MFA administrativo | TOTP/enforcement ADMIN controlado |
| Search textual | `SearchIndex`, runtime MVP e audio indexing |
| Backup/restore | restore validado e backup PostgreSQL hardening |
| Load Lab | fixtures autenticadas, tenant tecnico e resultados documentados |

## Seguranca

Controles implementados ou documentados:

- RBAC ADMIN/SUPERVISOR/AGENT;
- isolamento multi-tenant;
- feature flags por tenant;
- redaction de logs;
- criptografia de segredos para Webhooks, Telegram e MFA;
- MFA/TOTP para ADMIN em enforcement controlado;
- recovery codes hash-only;
- rate limits nos fluxos sensiveis;
- validacao de dominio no Webchat;
- SSRF hardening em Webhooks;
- LGPD/retencao e anonimização.

Documentos de apoio:

- `LOGGING_AUDIT_STANDARD.md`;
- `MFA_OTP_DESIGN.md`;
- `CHANNELS_GOVERNANCE.md`;
- `bid-package/03-seguranca.md`;
- `bid-package/04-lgpd.md`.

## Escalabilidade E Performance

O projeto nao declara HA plena no ambiente atual. A abordagem e transparente:

- VPS atual endurecida com swap e build sequencial;
- laboratorio de carga separado de demonstracao;
- tenant tecnico `loadtest-prefeitura`;
- k6 externo pelo caminho real Cloudflare/TLS/Nginx/PM2/backend/PostgreSQL;
- `health`, Public API, Search e Inbox medidos;
- gargalo Inbox identificado e corrigido por medicao;
- p95 final de `inbox-read vu20`: 585ms, 0% erro.

Documentos:

- `LOAD_TEST_RESULTS.md`;
- `INBOX_QUERY_PATH_AUDIT.md`;
- `HIGH_AVAILABILITY_SCALE_DESIGN.md`;
- `OPERATIONAL_BASELINE.md`.

## Observabilidade E Operacao

O Converta possui:

- logger padronizado;
- request/correlation/tenant context;
- metricas internas em memoria;
- endpoint administrativo protegido;
- dashboard operacional;
- AlertManager interno;
- health DB;
- release checklist;
- baseline operacional;
- backup/restore runbooks.

Limites assumidos:

- metricas historicas ainda nao persistidas;
- alertas ainda sem notificacao externa;
- HA/failover ainda nao implementado;
- backup offsite deve ser contratado/configurado para contratos maiores.

## Decisoes Arquiteturais Relevantes

| Decisao | Justificativa |
| --- | --- |
| Feature flags por tenant | Permite rollout controlado e rollback simples |
| Shadow antes de runtime | Reduz risco em Scheduling, Webhooks, Search, Audio, Telegram |
| Dispatch/envio controlado antes de automacao | Evita chamadas externas sem governanca |
| MFA em fases | Evita lockout administrativo |
| Load Lab separado do demo | Evita contaminar POC e gera benchmark reproduzivel |
| Sem cache/Redis prematuro no Inbox | Otimizacao baseada em medicao, nao intuicao |
| Swap controlado | Protege contra OOM sem vender performance artificial |

## Por Que Atende Orgaos Publicos

O Converta atende os principais objetivos de plataformas municipais de atendimento:

- atendimento oficial e rastreavel;
- multiatendimento por setores;
- historico integral;
- relatorios e SLA;
- governanca por usuario/perfil;
- canais digitais amplos;
- API e integracoes;
- LGPD e seguranca;
- observabilidade operacional;
- demonstracao em PoC;
- documentacao de limites e ressalvas.

## Limites Declarados

Para manter a proposta tecnicamente honesta:

- Telegram atual e texto-only;
- Webchat atual usa polling, nao realtime avancado;
- NPS ainda requer operacionalizacao completa;
- Scheduling automatico ainda nao e cron pleno;
- Audio transcription real precisa piloto controlado;
- HA/failover e storage 600GB dependem de infraestrutura contratada;
- app nativo mobile nao deve ser prometido se o edital nao aceitar PWA/web responsivo.

## Uso Em Licitacao

Este documento deve apoiar:

- proposta tecnica;
- respostas a diligencias;
- defesa de arquitetura;
- roteiro de PoC;
- matriz de aderencia;
- esclarecimentos sobre limites e ressalvas.
