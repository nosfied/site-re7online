# Converta — auditoria integral do projeto e prontidão do backlog

**Data:** 14/11/2026. **Estado:** `REPOSITORY_DOCUMENTATION_RECONCILED / RUNTIME_AND_FUNCTIONAL_AUDIT_NOT_YET_ATTESTED`.

Este documento define a fronteira entre a **reconciliação documental efetivamente realizada neste PR** e a **auditoria integral ainda dependente da inspeção do código-verdade, da VPS e dos testes de produto pelo Codex**. Não alegar auditoria integral PASS com base apenas em CI de documentação ou health HTTP. Ler primeiro [princípios vinculantes](../saas/WORKING_PRINCIPLES.md), [estado canônico](../saas/CURRENT_STATE.md) e [fechamento P00](CONVERTA_P00_TERMINAL_CLOSURE_AND_REUSABLE_RETIREMENT_METHOD_2026-11-14.md).

## A. Evidência consolidada neste PR

- **Retenção/capacidade:** 28 caminhos excepcionais ausentes segundo receipts, total 24.756.744.192 B e 855.823 inodes; P00 extraordinário encerrado. A custódia/restauração dos nove `.data` históricos permanece protegida; nenhum efeito é novamente autorizado.
- **Topologia reportada:** API/frontend `fa10f4f5`, worker `e2e7f17a`, três processos PM2 estáveis e saúde API/DB/frontend aprovadas na execução terminal. Essa fotografia não é um preflight novo.
- **Documentos cruzados:** `CURRENT_STATE.md/json`, `CAPACITY_RECOVERY_POLICY.md`, `DEPLOY_ARTIFACT_LIFECYCLE.md`, inventário de capacidade e backlog P00. Ponteiros legados `a838` em JSON são compatibilidade histórica, não seleção viva; não reformar o schema numa atualização documental.
- **Automação futura:** lifecycle de geração define orçamento físico e retorno necessário; nenhuma nova varredura P00 ou exclusão é tarefa implícita.
- **Limite da prova:** confirmação GitHub e CI não demonstram isoladamente segregação multitenant, regras de negócio, migrations, testes E2E reais, integridade de backups ou aceite contratual.

## B. Matriz de auditoria única — executar com Codex sobre o ambiente real

| Frente | Fonte de verdade a confrontar | Prova mínima a registrar | Condição de saída |
| --- | --- | --- | --- |
| Git/branches/PRs | Branch operacional, HEAD, PRs relevantes, worktrees, arquivos alterados | Mapa de commits efetivamente integrados, mudanças não publicadas e divergências com CURRENT_STATE | Nenhum código de revisão confundido com deploy |
| Inventário de arquitetura | `apps/`, serviços, API, frontend, worker, filas e integrações efetivas | Dependências entre módulos, pontos de entrada, versão runtime, variáveis sem divulgar segredo | Mapa de componentes consistente |
| Banco/tenancy | Schema real, queries/ORM, migrations, filtros e índices | Matriz de caminhos de leitura/escrita com tenant resolvido; testes negativos intertenant | Nenhum acesso cruzado ou regressão |
| Conversas/CRM | Contatos, conversas, atendimentos, CLOSED, filtros, responsabilidades, uploads | Contratos de tela/API e resultados de testes existentes, regressões apenas se faltarem | Fluxos preservados |
| Campanhas CRA-PR | TR/contrato, backlog, execução por lotes, relatórios, critérios de medição e aceite | Rastreamento requisito → componente → teste/receipt → pendência | Lacunas contratualmente priorizadas sem presumir aceite |
| SECULT-PE | TR/contrato, fluxo receptivo, CLOSED por agente, papéis supervisor/admin, templates ocasionais | Matriz de permissão e testes de acesso por papel/departamento | Comportamento aderente ao escopo real |
| Meta/WhatsApp | WABA, webhook, templates, janelas, tarifação, mensagens, mídias, sessões | Correlação de eventos, idempotência, isolamento tenant, falhas/retentativas e política de custos | Sem reenvio ou mutação de campanha para testar |
| Processamento/concorrência | Workers, transações, locks, filas, retries, execução de jobs | Reusar suíte existente (incluindo 207 testes de concorrência historicamente aprovados) e confrontar commits atuais | Falhas reproduzíveis com causa e owner |
| Segurança | Authn/authz, JWT/refresh, roles, log sanitization, segredos e uploads | Verificações estáticas dirigidas, isolamento e ausência de segredos em evidências públicas | Nenhum bloqueio crítico desconhecido |
| Deploy/rollback | PM2 vivo/dump, grafo/current, runbook e geração ativa | Snapshot de seleções/rollback e compatibilidade com registro canônico | Nenhum restart, save ou deploy desnecessário |
| Backups/restore | Volumes, DB, mídias, snapshots externos, cadência e testes existentes | Evidência da recuperabilidade dos dados vitais, sem copiar tudo novamente | Proteção dos tenants comprovada ou lacuna explícita |
| Capacidade/limpeza | Receipts P00 e budget por geração | Zero novas execuções para caminhos `DO_NOT_REPEAT`; release ativa + retorno; sem payload terminal | P00 encerrada e lifecycle aplicável |
| Docs/testes/CI | Documentação canônica, suites atuais, CI e issues | Divergências normativas/implementação, estado PASS/FAIL/SKIP por área | Próximas tarefas categorizadas |

## C. Forma de execução sem retrabalho

1. **Congelar ponto de partida:** HEAD/branch, snapshot atual, documentos e testes já válidos. Não criar build, release, deploy, backups redundantes nem rodar campanhas reais.
2. **Auditar por diferença:** citar caminho/função/commit e evidência para cada divergência; não repetir suites amplas sem lacuna concreta. Executar testes locais/CI sem efeitos externos apenas conforme segurança operacional.
3. **Classificar:** `COMPLIANT_WITH_EVIDENCE`, `DEFECT_REPRODUCED`, `CONTRACT_GAP`, `HISTORICAL_ONLY`, `UNKNOWN_REQUIRES_SPECIFIC_PROOF`. `UNKNOWN` não é PASS.
4. **Reconciliar documentos existentes antes de criar novos**: princípios, CURRENT_STATE, runbooks, lifecycle, operações Meta, campanhas, backlogs CRA-PR/SECULT-PE. Evitar duplicação de fontes de verdade.
5. **Concluir com um relatório único verificável:** baseline do repo, testes/suites efetivamente executados, referência de cada achado, severidade, impacto tenant, ação mínima, owner e backlog. Separar incidentes produtivos reais de melhorias técnicas.
6. **Retornar ao backlog funcional** com prioridade por: segurança e isolamento dos tenants; obrigações CRA-PR/SECULT-PE; regressões comprovadas; depois UX/CRM/campanhas, custo Meta e automações; dívida técnica justificada. Não transformar a auditoria em refactor geral.

## D. Critério formal de conclusão da auditoria integral

Só declarar `PROJECT_AUDIT_COMPLETE / BACKLOG_READY` quando o Codex entregar relatório com referências para **todas as frentes B**, incluindo testes/controles efetivamente checados e divergências reconciliadas em `CURRENT_STATE` e backlogs; CI aprovada após as alterações documentais. Onde não houver prova possível, registrar pendência com owner, risco e próximo passo **sem bloquear automaticamente** trabalho funcional não afetado.

**Estado deste documento agora:** apenas reconciliação documental e desenho auditável da verificação restante. Nenhuma auditoria total sobre VPS/runtime ou tenant foi executada por este PR.
