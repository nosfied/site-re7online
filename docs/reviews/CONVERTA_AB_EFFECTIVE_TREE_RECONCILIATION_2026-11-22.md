# CONVERTA — Reconciliação de árvore efetiva A+B (22/11/2026)

**Estado:** `MERGED / EFFECTIVE_TREE_VERIFIED / NOT_DEPLOYED`. Este documento registra um incidente de composição Git e o método de prevenção, não autoriza efeitos de produção.

## Autoridades e falha

Branch: `review/campaign-recovery-20260926`.

- PR #435: merge `2634bb46261dab97ef6157420d31b7f60bec07a7` — prioridades distintas e documentação.
- PR #436: merge `41a420540f1309b58b404eb3abe41080960e1054`, árvore `b0d9415b08b00986188b1f40d6bf046d09a4ed70` — persistência durável da Inbox, reconciliação, gate V2 e metodologia recorrente.
- PR #437: merge `611ecadfed0398e4158474e8ce3760a6ed02c487`, árvore `abd7c76116b724c0a16cc1a20c6e2573a97de026` — correção funcional claim/assign/transfer. Embora #436 constasse no primeiro pai, a árvore efetiva descartou 24 arquivos/alterações da Frente A. A CI anterior de #437 tinha passado em sua árvore isolada e não detectava a perda pós-merge.
- PR #438: correção `ebb5265907c9e453c96327421813e730d0757305` mais guarda CI `62b53f8824c592d72efb2ca6273ae497a84e5237`; merge `b6bfbc5b3b7375aa209ab4638558396a95efab0f`. Árvore resultante `754582eeb17ed4ff4dcecc4581c2b084eea7a7d3`.

## Composição comprovada

A reconstrução tomou a árvore #436 como base de conteúdo e reproduziu somente os 12 paths modificados pela Frente B a partir dos blobs SHA da árvore #437, preservando inclusive as entradas documentais comuns e o estado estruturado da Frente A. A comparação dirigida observou `A_preserved=true` e `B_preserved=true`; após o merge #438, Git confirmou identidade exata da árvore de destino com a árvore revisada.

O teste `scripts/ci/verify-converta-ab-effective-tree.py`, incluído em `.github/workflows/ci.yml`, exige a presença simultânea dos componentes e símbolos de A (read-state externo, reconciliação, gate V2 e callsites reais, PM2) e B (destino humano, CAS e interface). Não substitui testes semânticos, SQL, rollback ou os critérios de aceitação. A CI do #438 completou quatro jobs `PASS`; o teste de guarda passou no próprio HEAD composto.

**Regra para futuras integrações:** (1) verificar pais, base/HEAD e árvore; (2) compor deltas sem usar árvore de uma branch para substituir a outra; (3) exigir CI do HEAD composto; (4) verificar depois do merge que a árvore instalada no Git contém os contratos de todas as frentes preservadas. Histórico Git de merge não é prova de presença no working tree.

## Fronteiras independentes preservadas

**Frente A — arquitetura e metodologia:** merged, não implantada. Novo deploy API exige persistência externa autenticada e admission V3/runtime V4. Fontes read-state históricas: 41D (8 arquivos, 28 `lastReadAt`, 4 `manualUnread=true`); CB3721D4 (3 arquivos, 8 `lastReadAt`, 8 `manualUnread=true`) no inventário anterior. Dados divergentes devem ser reconciliados por tenant/scope e excluindo identidades anonimizadas por autoridade privada válida. Raiz proposta `/opt/re7online/runtime-data/inbox-read-state` ausente na qualificação. Backup/restore desse root não comprovados. Rollback histórico 41D permanece CWD-local: não declarar continuidade bidirecional.

**Frente B — produto:** merged, não implantada. Invariante de atendimento humano com departamento/fila efetivos, CAS transacional, RBAC e interface protetora, regressões em PostgreSQL isolado. A conversa final 3209 do `tendencia-modas` foi observada anteriormente com departamento/fila nulos; reparação real não foi executada.

**Última produção comprovada no contexto:** CB3721D4 API/frontend, ED74 worker, rollback 41D; privacidade 34/34 terminal. Nenhum deploy, SQL produtivo, transferência 3209, alteração de backups, limpeza ou PM2 save foi executado em #438. Staging VPS e P1 backup seguem em suas classificações separadas.

## Próxima decisão

Antes de `open/build` de nova geração, fechar **por decisões específicas**: provisão/custódia do root externo, proteção e restauração dos dados, autoridade de anonimização, reconciliação com CAS/receipts e caminho de rollback que não perca o read-state recente. Somente então qualificar admission schema 3, runtime manifest schema 4, cache Next V2, componentes API+frontend/worker ED74 e todo lifecycle contra os precedentes 41D/CB.

Nenhuma destas autorizações nasce da integração #438.
