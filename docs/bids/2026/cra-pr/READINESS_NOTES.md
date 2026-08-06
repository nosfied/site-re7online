# CRA-PR Readiness Notes

Status: notas de prontidao para avaliacao contratual. Usar junto ao edital, termo de referencia e decisoes ja registradas.

## Enquadramento

O Converta deve ser apresentado como SaaS de atendimento omnichannel com foco em WhatsApp Oficial/Meta, Inbox humano, CRM operacional, campanhas controladas, modelos Utility, opt-out, LGPD e relatorios.

O caso CRA-PR e estrategico por exigir combinacao de atendimento receptivo, volume ativo controlado e governanca de custo Meta.

## Premissas conhecidas

- 30 atendentes.
- 1 numero WhatsApp.
- Volume receptivo estimado de 2.000 conversas/mensagens por mes, conforme premissa do processo.
- Volume ativo estimado de 10.000 por mes.
- Uso Utility-only para envios ativos.
- Sem campanha de marketing como posicionamento tecnico.
- Opt-out operacional ja suportado por eventos e bloqueio de envio ativo.
- Contatos anonimizados ficam ocultos no CRM e bloqueados em campanha.

## Aderencia atual

- Inbox humano com claim e controle operacional.
- Templates aprovados para janela fechada e envio ativo.
- Campanhas com previa, rascunho e envio explicito.
- CRM operacional por tenant.
- Mensagens prontas separadas de modelos Meta.
- Relatorio mensal Meta estimativo em JSON/CSV.
- Ledger por outbound e eventos de acompanhamento.
- RBAC e tenant isolation.
- Politica LGPD documentada.

## Custo Meta e risco

O volume ativo mensal exige controle de categoria, aprovacao e acompanhamento de consumo. O Converta possui ledger, preview, resumo e relatorio mensal estimativo.

O custo Meta deve ser tratado como risco operacional/comercial controlado, nao como valor definitivo. A politica de preco depende de categoria, pais, entrega e regra vigente do provedor.

## Gates recomendados antes de assinatura

1. Confirmar modelos Utility necessarios.
2. Confirmar se todos os modelos estao aprovados e ativos localmente.
3. Definir limite operacional mensal e alerta por tenant.
4. Validar relatorio mensal com amostra controlada.
5. Formalizar treinamento e matriz de usuarios.
6. Validar fluxo de opt-out e exportacao de campanhas.
7. Preparar roteiro de smoke sem envio em massa.

## Limites e proximos passos

- Bloqueio automatico por limite ainda nao deve ser ativado sem runbook.
- Relatorio Meta e estimativo e nao substitui demonstrativo oficial do provedor.
- A modelagem dedicada de opt-out pode ser evolucao futura se o contrato avancar.
- Evidencias visuais devem ser capturadas em ambiente sanitizado.
- Regras de retencao e privacidade devem constar no onboarding operacional.
