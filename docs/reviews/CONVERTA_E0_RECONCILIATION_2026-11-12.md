# E0 — Reconciliação dirigida: fotografia documental e controle de pendências

**Data:** 2026-11-12. **Escopo:** leitura de repositório e registro de diferenças; sem inspeção de máquina local/VPS. **Base de trabalho:** `review/campaign-recovery-20260926@0433b06012eba74a48316eac0fe898ba24c6f176`.

## Fatos comprovados em documentos versionados
- `docs/saas/WORKING_PRINCIPLES.md` é vinculante e anterior ao runbook, proíbe reinvestigações sem lacuna específica e proíbe concluir sem conferir código/estado.
- `docs/saas/CURRENT_STATE.json` apresenta `schemaVersion=7`, `updatedAtUtc=2026-11-08T15:43:33Z`, `activeDeploymentRecord`, `activeOperationalRecord` e `activeApiDeploymentRecord` apontando todos para `CAMPAIGN_RECIPIENT_RESULT_B8D284B6_2026-11-08_DEPLOYED_SANITIZED.json`. O `CURRENT_STATE.md` igualmente anuncia B8D284B6 como estado vigente.
- Documento de fechamento do piloto v3 (Biblioteca, 12/11/2026) declara **API a838bd33 implantada e aceita**, frontend b8d284b6 preservado, worker e2e7f17a preservado, retorno imediato de API em b8d284b6. **A identidade viva ainda não foi observada diretamente nesta sessão.**
- O mesmo registro v3 informa encerramento dos dois runtimes externos e preservação temporária do worktree; não repetir a retirada. O inventário histórico integral e a cobertura privilegiada própria ao worktree são lacunas de prova; prazo da retenção: 10/12/2026 20:59:59 Fortaleza, sem autorização automática após a data.
- `docs/saas/DEPLOYMENT_OPERATING_MODEL.md` e `docs/DEPLOY_TOPOLOGY_RE7.md` continuam descrevendo build VPS como padrão e builder externo como exceção. O documento v3 propõe builder externo descartável como **padrão-alvo**, dependente de validação produtiva com custo e limpeza ponta a ponta. Não fazer troca silenciosa do padrão.
- PR #377 integrado na branch de trabalho; ensaio sintético com PM2 real e CI 4/4 PASS. A ativação e o rollback do driver integral da VPS não são demonstrados somente por esse ensaio.
- `main` versus branch operacional: linhas divergentes (1938 commits à frente / 126 atrás na comparação de 12/11). Não confundir `main` com release ativa nem propor merge massivo.

## Inventário de PRs abertos em 12/11 (GitHub API)
| PR | Categoria | Base | Estado | Tratamento mínimo |
| --- | --- | --- | --- | --- |
| #365 | Documentação campanhas multibatch | review/campaign-recovery-20260926 | aberto, não draft | Conferir se a decisão já está documentada após implantação a838; evitar integrar documentação obsoleta |
| #344 | Documentação saneamento de staging CRM | review/campaign-recovery-20260926 | draft | Conferir recibo/closure já existente e equivalência com o estado canônico |
| #332 | Documentação custódia cadeia grande | review/campaign-recovery-20260926 | aberto | Reconciliar dívida P00 e proteções; não autoriza retirada |
| #313 | Documentação de classificação ef7 | review/campaign-recovery-20260926 | draft | Reconciliar negativas históricas, sem limpeza |
| #291 | Código de retomada do empacotamento | review/campaign-recovery-20260926 | aberto | Verificar se código já está na base por outra integração; evitar duplicar correção |
| #57 | Tenants summary | main | aberto | Tratar como frente antiga independente, verificar finalidade e conflito antes de decidir |
| #378 | Auditoria de transição | review/campaign-recovery-20260926 | draft | Evidência inicial; complementar antes de merge |

**Estado aberto não prova que a mudança ainda falta na base.** A classificação acima é uma triagem, não aprovação de merge ou encerramento.

## Próximo gate E0: consulta proporcional no Codex (somente leitura)
1. Identidades: comparar `git rev-parse HEAD`, `git status --porcelain` (sem alterar), branch efetiva e provas da release implantada com hashes e recibos privados.
2. Runtime: registrar seleções de `/opt/re7online/current/{api,frontend}`, PM2 API/frontend/worker, dump, saúde local/pública, origem do frontend `BUILD_ID` e correspondência com registros de implantação.
3. Capacidade: usar inventários recentes de `df`/inodes e custódia; medir somente valores faltantes; **nenhum** `rm`, `clean`, `prune`, rebuild, coleta integral ou criação de outra árvore no escopo E0.
4. Segurança funcional: preservar a guarda global de campanhas, jobs com resultado de envio `unknown`, sessões Meta e todos os tenants; smoke somente leitura sem efeitos externos.
5. Documentação: produzir matriz `componente → ativo → retorno → prova → divergência`; atualizar `CURRENT_STATE.md`, `CURRENT_STATE.json` e modelo de deploy somente após confronto da VPS e validação de frescor.
6. PRs antigos: comparar patches à árvore, identificar duplicatas integradas e decidir manter/fechar separadamente, sem merge automático.
7. Contratos CRA-PR e SECULT-PE: auditoria funcional por escopo próprio após fechar risco P0, sem usar dados privados em arquivos versionados.

## Regra de continuidade
A pesquisa da inbox é demanda de produto registrada à parte; **não implementar durante a reconciliação E0**. Ela é candidata à validação produtiva da E1 após teste local, isolamento, orçamento de bytes/inodes e aceite da transação canônica. Não antecipar o deploy.

**Nenhuma conclusão desta auditoria representa leitura ao vivo da VPS ou uso de Codex local. Nenhuma mutação produtiva realizada.**
