# CRM CSV — resultado local para revisão

**LOCAL VALIDATED / FOR REVIEW / NOT DEPLOYED — 15/10/2026.** Auditoria e implementação autorizadas pela [retomada funcional](../FUNCTIONAL_RESUMPTION_2026-10-15.md). [Contrato canônico](../../../saas/CRM_CSV_IMPORT_OPERATION_CONTRACT.md), [provas sanitizadas](PROOFS_SANITIZED.json) e [hashes dos arquivos entregues](PUBLIC_FILES_SHA256.json).

## Resultado

A importação passa a registrar admissão, classificação, resultados de linha e terminal por operação/tenant na tabela Event existente. A gravação de cada contato e seu recibo são atômicos. Timeout e resposta perdida recuperam a mesma referência, sem repetir importação ou inferir rollback. Falha parcial fica UNKNOWN com progresso durável. Falha comprovada antes de qualquer linha fica FAILED. Não foi necessário schema/migration: a lacuna era o uso do contrato durável existente, não ausência de tabela.

A interface preserva somente UUID no navegador e consulta o GET protegido ao reentrar; resultados tardios/antigos não substituem terminal nem progresso maior. Uma operação não resolvida bloqueia importações concorrentes no tenant e não dispõe de resolução automática. Resumos duráveis não duplicam os nomes/telefones do CSV. Os cinco eventos de controle ganham classificação CRITICAL no código local, sem executar retenção.

As contagens deixam de usar prefixo de candidatos como total. A projeção em lotes de 500 calcula total visível permitido, filtrado e página no mesmo snapshot, com RBAC/exclusão/anonimização existentes. Amostra até 200 identificada; removida a soma duplicada de situação inválida no cartão da prévia. O caso 993/880/82/31 reconcilia 879 criações + 1 atualização, e 880 sem alterações em uma operação distinta explícita.

## Provas e alcance

| Camada | Casos distintos PASS | Evidência |
|---|---:|---|
| PostgreSQL 16 isolado | 9 | CSV completo, validação, parcial com rollback de uma linha, concorrência, commit com resposta perdida, observação obsoleta, 4.105 contatos/filtro/página vazia, controles de retenção/recibo mínimo e exclusão concorrente |
| HTTP real local | 21 | Suíte de capability CRM; endpoint novo com autenticação, RBAC, isolamento, recuperação, entrada divergente e ausência de replay |
| Upsert canônico | 27 | Regressões existentes sobre parser, identidade, prévia e resultado |
| Contratos do read model | 2 | Provas de fonte existentes, complementares ao PostgreSQL |
| Política de eventos | 3 | Regressões existentes de classificação |
| Cliente HTTP/estado | 5 | Um POST com resposta perdida ou timeout real por AbortController seguido apenas de GET; chave por escopo, resposta tardia, terminal e progresso monotônico |

**67 casos distintos**, sem contar skips ou reexecuções como casos novos. Após ajuste dos recibos, reexecutados somente os quatro HTTP afetados; os outros 17 foram reutilizados. O teste de 4.105 registros foi reexecutado após mudar para lotes de 500. O caso de exclusão concorrente foi executado separadamente após os oito primeiros. Prisma42PASS permanece evidência válida no alcance original; não foi reexecutado nem aplicado.

Typecheck backend PASS, fontes frontend PASS e teste novo do cliente PASS. Typecheck amplo frontend ainda encontra erros em testes preexistentes fora do delta (ChatbotFlowBuilder, appChatbotDataLoader, appClientApi); não é declarado PASS global. Sem erro nos arquivos de produção alterados. Não houve build funcional, reinstalação de dependências ou geração Prisma. O laboratório sintético retention_lab/porta55781 foi encerrado; o restore certificado de cifragem não foi alterado.

Os clientes HTTP foram exercitados com fetch sintético e os handlers reais com servidor HTTP/Prisma local. Isso não é ensaio visual ou navegador ponta a ponta. Não houve acesso à VPS, reimportação real, investigação histórica nova ou alteração de dados de tenants.

## Limites e próximos gates

- Revisão de código e interface; planejar entrega coordenada API/frontend e compatibilidade com o runtime ativo. POST sem UUID é recusado. Nenhum pacote produtivo foi montado/substituído.
- UNKNOWN não prova processo vivo nem falha; sem novo POST, retry, desbloqueio ou reparo automático. GET consulta progresso e terminal, não reinicia trabalho.
- Contagem exata usa snapshot e limite de 15s; avaliar desempenho/índices em bases maiores antes de deploy. O volume sintético não é benchmark de capacidade produtiva.
- Recibos por linha aumentam Event; orçar volume e revisar disposição futura, mantendo a recuperação enquanto pendente. Nenhuma política de tenant foi modificada ou CLI de retenção executada.
- Regressões visuais e aceite operacional ficam para uma etapa própria. Nenhum resultado sintético comprova reparação do CSV histórico relatado.

NEWauth+NEWDB+NEWcipher/reader, ambos crons, produção, guarda38 fechada e out.15 CLOSED preservados. Rotas externas adiadas por aceite do owner para 21/10 ou gatilhos; segurança OPEN, P0/A/B e resets suspensos. Sem .env, deploy, retenção, mensagem ou abertura da guarda. Responsável operacional: Deifson; revisão 15/10, próxima 21/10 ou após mudança.
