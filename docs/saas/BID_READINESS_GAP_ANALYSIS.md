# Bid Readiness Gap Analysis

Status: analise de lacunas da Sprint 79A. Documento de consolidacao; nao altera runtime.

## Objetivo

Separar pendencias reais de produto de pendencias documentais, comerciais, juridicas e operacionais. A regra da Fase IV e evitar desenvolver funcionalidade que ja existe, mas ainda nao esta comprovada.

## Resumo Executivo

| Categoria | Leitura | Risco |
| --- | --- | --- |
| Produto | Poucas pendencias bloqueadoras para editais WhatsApp-first; lacunas avancadas permanecem condicionais | Medio |
| Documentacao | Principal lacuna da Fase IV | Alto |
| Comercial | Precisa pacote de proposta, SLA, treinamento e precificacao de infra | Alto |
| Juridico | Fora do codigo; pode bloquear habilitacao | Alto |
| Operacional | Forte para porte atual; HA/offsite/restore recorrente ainda condicionais | Medio |

## Pendencias De Produto

| Pendencia | Status | Quando bloqueia | Acao recomendada |
| --- | --- | --- | --- |
| NPS operacional completo | Parcial | Editais que exigem pesquisa automatica pos-atendimento e relatorio NPS/CSAT | Implementar apenas se edital alvo exigir |
| Audio real em piloto | Parcial | Editais que exigem transcricao comprovada em audio real | Rodar piloto controlado com 1-3 audios |
| Telegram midia/grupos | Parcial | Editais que exigem Telegram avancado | Manter fora ate demanda explicita |
| Webchat avancado/realtime | Parcial | Editais que exigem widget completo, roteamento avancado ou SSE/WebSocket | MVP atual atende canal basico |
| Scheduling automatico/cron | Parcial | Editais que exigem lembretes automaticos recorrentes | Implementar scheduler automatico apenas com aprovacao |
| OTP cidadao | Pendente | Editais que exigem autenticacao do cidadao | Sprint separada, nao misturar com MFA interno |
| API escrita/eventos automaticos | Parcial | Editais que exigem integracao transacional completa | Expandir Public API conforme requisito real |
| HA/failover runtime | Pendente | Editais com SLA elevado, redundancia ou alta escala | Proposta de infraestrutura dedicada |
| App nativo Android/iOS | Pendente/parcial | Editais que rejeitam PWA/web responsivo | Definir parceiro/app nativo se necessario |

## Pendencias Documentais

| Pendencia | Status | Prioridade | Acao |
| --- | --- | --- | --- |
| Manual do Administrador | Nao criado | Obrigatorio | Criar a partir de `/admin`, tenants, canais, flags e operacao |
| Manual do Operador | Nao criado | Obrigatorio | Criar a partir de Inbox, CRM, Search, Scheduling e relatorios |
| Guia de Implantacao B2G | Nao consolidado | Obrigatorio | Reaproveitar `RELEASE_CHECKLIST.md`, `go-live-checklist.md`, runbooks |
| Roteiro PoC municipal | Parcial | Obrigatorio | Atualizar `DEMO_SCRIPT.md` para Webchat, Telegram, Search, MFA e Ops |
| Matriz edital-item | Parcial | Obrigatorio por disputa | Derivar de `BID_COMPLIANCE_MATRIX.md` |
| Manual de backup/restore | Parcial | Importante | Consolidar `BACKUP_RESTORE_*` em runbook operacional |
| Politica de incidentes | Nao criada | Importante | Criar guia de incident response |
| Dossie API oficial Meta | Parcial | Importante | Criar declaracao formal assinavel |
| Evidencias de performance | Pronto/parcial | Importante | Resumir `LOAD_TEST_RESULTS.md` em anexo executivo |

## Pendencias Comerciais

| Pendencia | Status | Prioridade | Acao |
| --- | --- | --- | --- |
| Proposta tecnica modelo | Nao criada | Obrigatorio | Criar template por edital |
| Memorial descritivo | Parcial | Obrigatorio | Atualizar bid-package com Fases II/III |
| Deck institucional atualizado | Parcial | Importante | Atualizar executive deck |
| Plano de treinamento | Nao criado | Obrigatorio quando edital exigir | Criar carga horaria, turmas e material |
| SLA comercial | Parcial | Obrigatorio em contratos maiores | Definir tempos, suporte, janelas e exclusoes |
| Precificacao de storage/HA | Nao criada | Importante | Criar modelo por porte |
| Modelo de PoC | Parcial | Importante | Criar roteiro e criterios de aceite |

## Pendencias Juridicas

| Pendencia | Status | Prioridade | Acao |
| --- | --- | --- | --- |
| Certidoes fiscais/trabalhistas | Fora do repositorio | Obrigatorio | Emitir antes de cada disputa |
| Contrato social/poderes | Fora do repositorio | Obrigatorio | Separar pacote societario |
| Balanco/DRE/indices | Fora do repositorio | Obrigatorio | Validar com contador |
| Atestados de capacidade tecnica | Fora do repositorio | Obrigatorio | Coletar, classificar por objeto e escopo |
| Declaracoes formais | Fora do repositorio | Obrigatorio por edital | ME/EPP, inexistencia de impedimento, conhecimento local etc. |
| Garantia contratual | Condicional | Importante | Avaliar por edital |
| LGPD/DPA | Parcial | Importante | Preparar anexo contratual |

## Pendencias Operacionais

| Pendencia | Status | Prioridade | Acao |
| --- | --- | --- | --- |
| Backup offsite | Pendente | Importante | Definir bucket/servidor externo |
| Cron DB em producao | Parcial | Importante | Ativar em sprint controlada se ainda nao ativo |
| Restore drill recorrente | Parcial | Importante | Agenda mensal/trimestral |
| Readiness/liveness separados | Pendente | Desejavel | Criar antes de HA |
| Historico persistente de metricas | Pendente | Desejavel | Avaliar stack externa futura |
| Alertas com notificacao | Pendente | Desejavel | Slack/email/webhook futuro |
| HA/replica/failover | Pendente | Condicional | Propor para contratos grandes |

## Decisao De Governanca

Para Fase IV, cada nova demanda deve ser classificada antes de virar sprint:

1. comprovacao documental;
2. ativo comercial;
3. ativo juridico;
4. operacao/infra contratual;
5. produto novo.

Somente o item 5 deve gerar desenvolvimento funcional.
