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

## Complemento E0.2 — confronto direto concluído

A leitura dirigida posterior autenticou o estado vivo sem repetir a auditoria
geral. A API selecionada é `immutable-a838bd33-external-20261110T130618Z`; o
frontend permanece em `immutable-b8d284b6-vps-20261108T132846Z`, BUILD_ID
`zguwjBfQne4CTh6dLIlfq`, e o worker `immutable-e2e7f17a-20261022T005110Z`
permanece preservado. Os retornos imediatos são b8d284b6 para a API e 36b94c6d
para o frontend. Health local e público passaram. O dump PM2 vigente é
`67006b02…2171`, o grafo `b41713ac…d156`, o estado operacional
`e239d8dc…20a` e o marker `50039ed6…ecad`.

A guarda de campanhas está aberta na geração 47, com zero tarefas e sem fault.
A transação API-only terminou com `saveCount=1` e permanece
`DEPLOYED_RETENTION_INCOMPLETE` exclusivamente por dívidas no builder externo.
O novo registro por componente preserva o fechamento agregado b8d284b6 como
histórico e como autoridade do frontend atualmente selecionado.

Capacidade histórica observada: VPS com 8.168.931.328 bytes e 8.778.841 inodes
livres, ocupação de 91%; builder com 198.923.218.944 bytes e 28.009.941 inodes
livres e cache npm compartilhado de 4.378.787.840 bytes. Os runtimes v2 têm
retirada terminal de 982.900.736 bytes. O worktree v2 mantém
`PRESERVED_RETENTION_DEBT` de 1.027.608.576 bytes até 10/12/2026 20:59:59
Fortaleza; o worktree v1 mantém lifecycle `FAILED` e 671.199.232 bytes. Nenhum
dos estados autoriza retirada automática.

## Processo histórico aguardando na VPS

A inspeção mínima confirmou uma sessão órfã iniciada em 07/11/2026: um shell
adotado pelo PID 1 aguarda um `grep -RIlE`, e um `sort` aguarda o pipe. A árvore
pertence ao usuário operacional, permaneceu sem CPU acumulada relevante e não
detinha locks canônicos nem descritores sob as raízes produtivas consultadas.
Ela não pertence aos três processos PM2, à transação a838bd33 ou a uma tarefa
ativa conhecida. Os identificadores numéricos completos ficam fora do documento
versionado e constam do relatório privado desta E0.2.

Nenhum sinal foi enviado. A proposta para autorização separada é reidentificar a
mesma árvore por PID, UID, PPID, início, executável e argv; negar se houver drift,
novos descendentes, locks ou referências à transação vigente; sinalizar somente
os PIDs autenticados, do `grep` ao `sort` e por último o shell, verificando a
saída após cada `SIGTERM`. Não usar `pkill`, `killall` ou sinal de grupo. Só
considerar escalada de sinal para o mesmo PID após nova autorização e nova prova
de identidade.

## Modelo de build e limite da E0

O build na VPS continua sendo o procedimento historicamente canônico, bloqueado
pelo orçamento conhecido. O builder externo descartável é o padrão-alvo
recomendado e tem ensaio sintético aprovado; a validação produtiva completa e a
decisão de adoção pertencem à E1. Esta E0.2 não executou build, deploy, limpeza,
mudança de guarda ou sinalização de processo.

## Complemento E0.3 — árvore histórica encerrada

Em 12/11/2026, a árvore histórica foi reidentificada integralmente antes de
qualquer sinal. O shell, a busca e o `sort` preservavam UID, parentesco, sessão,
grupo, start ticks, executáveis e argumentos da fotografia anterior. Não havia
locks, descendentes novos, descritores sob as seleções produtivas nem vínculo
com transação ou serviço ativo. A evidência sanitizada está em
[`CONVERTA_E0_HISTORICAL_AUDIT_PROCESS_TERMINATION_2026-11-12.json`](../saas/releases/CONVERTA_E0_HISTORICAL_AUDIT_PROCESS_TERMINATION_2026-11-12.json).

Foi enviado um único `SIGTERM`, exclusivamente à busca. O `sort` e o shell
encerraram naturalmente. Os três PIDs ficaram ausentes; não houve `SIGKILL`,
sinal de grupo, restart, limpeza, alteração de dados ou mudança de seleção. A
API permaneceu em a838bd33, o frontend em b8d284b6 e o worker foi preservado.
Health local/público continuou saudável, o dump PM2 permaneceu idêntico, a
guarda de campanhas continuou aberta na geração 47 com zero tarefas e sem
fault, e os locks canônicos permaneceram livres. Resultado: `E0_PASS`.

## Semântica do bloqueio da próxima geração

`nextBuildBlocked=true` é um gate documental de coordenação para a geração do
piloto e seus escopos equivalentes; não existe um booleano global mutável no
runtime. O código aplica três controles concretos: reviews da geração no output
parent selecionado, lifecycle equivalente na mesma reservation root e admissão
de capacidade do host. Dívida `OPEN`/`RETENTION_DEBT` impede o mesmo scope e a
mesma equivalência; operações independentes não são globalmente negadas apenas
por essa dívida.

A menor entrada segura em E1 é uma geração nova, em builder descartável e
reservation root nova, com identificador, scope e equivalência próprios. A
admissão deve autenticar as dívidas v1/v2 como custódia somente leitura,
revalidar capacidade e criar lifecycle novo antes de alocar. Não alterar o flag,
não reutilizar o worktree preservado e não iniciar em output parent cujo review
negado ou override vencido ainda seja impeditivo. E1 não foi iniciada.
