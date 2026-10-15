# Cifragem v14 e Prisma — resultados separados, 15/10/2026

A v14 está **certificada para revisão / NOT INSTALLED / NOT DEPLOYED**. Não houve admissão de gates, contenção, saída, selagem, SQL mutável ou partidas. A correção Prisma está **LOCAL VALIDATED / NOT DEPLOYED**, independente da janela de cifragem. [Certificado sanitizado](PROOFS_SANITIZED.json) e [roteiro integral A/B/C/D](COMMANDS_FOR_REVIEW.txt).

## Cifragem: bytes e provas efetivas

Backup único pelo `backup.lock` canônico: captura real14:27:42–14:27:53UTC (11:27Fortaleza),41.742.521B,614 objetos; integridade/catálogo/schema e custódia off-host conferidos. Dump SHA b049b2c6dc00db68070a4c46665a0b4a769161ba32d926b1cdd9239886791161. Não se repetiu inventário/snapshot/restore/conversões válidos. O laboratório certificado permanece retido/parado, `temporaryDatabaseRemoved=false`; a fronteira/schema é idêntica. Captura e ferramentas container16.12; catálogo adicional no computador16.15, sem declarar novo restore. Reutilizadas as provas integrais das dez conversões, Telegram opaco,147 históricos/v2 e CAS/retornos; nenhuma conversão produtiva ocorreu.

Quatro bindings/restore contracts/manifests/conductor atualizados coerentemente; originais arquivados antes da escrita. Política/instalador/runtime/SQL/grant/disposição e configurações funcionais preservados. Fonte root15b91a2a; proposta fa113e5259850f7b23188b81cd5279c2a95c318154a3b0737da7251b1064f251; instalador b3d242fc92ccf60275ec0f875e5c2530f565981519e0d243b4fb8035eae9376f.

Arquivo final **6fc272705700d405c8f1fa969607c15305593ba9f459a815ff91e712db4dc27c**; review **c6c0eaab668c199d8ab8705ff9457776cebfea683efaa3941437ae2d624a5fe5**; índice **fedc0612434754a437a9528fb06c8742f20d973733c3119397ed968c3c4d3d05**. Certificador compara população e bytes dos260 arquivos do tar com a geração concreta completa, inclusive índice, journals e dois stderr vazios da cadeia real. Nenhuma extração/build funcional repetida na VPS.

Cadeia canônica REAL READ ONLY14:44:50UTC (11:44:50Fortaleza):11gates PASS, incluindo controles cron separados, checker completo/quatro modos,147 históricos, consumidores/identidades, saved/fallback600, guard/supervisão/gatesfalse, SQL/proxy/healthDB. Mínimo deploy/PostgreSQL18.000.433.152B; piso8.794.603.520B; WAL352MiB (144MiB na amostra13:39UTC: crescimento208MiB, sem imputar causa). São amostras datadas, sem monitoramento contínuo ou garantia futura de crescimento.

Root owner READ ONLY14:47:15UTC:10 arquivos/cadeias/hash/modos,6 referências cron, incompletudes0/writersNode desconhecidos0; checker fonte15b PASS. Certificação integral14:52UTC conforme recibo. Backup válido estritamente até15:27:42UTC (12:27:42Fortaleza); root até14:57:15UTC (11:57:15Fortaleza). A publicação não prolonga esses prazos; expiração exige renovação pertinente e recertificação antes de eventual janela.

### Negativa preservada e correção do índice

A primeira renovação negou antes de intent/mutação por índice integral divergente. Somente dois journals passivos tinham um append canônico `db-owner-observe`, exit0, da leitura anterior; todos os demais arquivos eram idênticos. A negativa e os prefixos permanecem preservados. O renovador v2 verifica prefixos exatos e permite exclusivamente esse evento/ação/sucesso, arquiva índice/prefixos originais e separa journals append-only de referências imutáveis. Não se adaptaram bindings de cifras ou controles para PASS. Cinco negativas de prefixo/registro e quatro provas completas de renovação isolada passaram; na prova local o processo checker externo foi substituído, enquanto a cadeia na VPS executou o checker real. Dois novos stderr vazios são certificados externamente por população/hash, sem reescrever o índice selado.

### Gates futuros e limites

Todos os cinco gates e execution-authorized continuam falsos; seal-current vazio. Instalação/inspect da política nova, admissão, contenção/saída de TODOS os writers, ownership DB, selagem sob lock/CAS/commit/VERIFIED, sucessores e aceite posterior **não executados**. C1/C2 continuam decisões explícitas mutuamente exclusivas; incerteza nega replay, após VERIFIED jamais OLDcipher. O roteiro mantém NEWauth+NEWDB em todos os retornos. D exige preparação/política/identidades frescas e decisão própria.

Custódia privada permanente no computador do owner, fora de temporários e da VPS, com índice/hash/receita; não é réplica física independente. Risco residual de segredo+ciphertext históricos permanece. Telegram conserva bytes opacos sem ativação ou alegação de recuperação. Credenciais externas e propostas.env continuam separadas e não aplicadas. Segurança OPEN; auth/banco/console/cron recuperado concluídos; out.15 CLOSED e guarda38 fechada.

## Prisma: implementação e limites

[Contrato, deltas e provas locais](PRISMA_LOCAL.md).42 testes distintos PASS em Node20.20.0/PostgreSQL16.15 sintético, typecheck sem emissão PASS; nenhuma execução retention:run/--dry-run, política de tenant ou.env produtivo alterados. O patch não integra o runtime de cifragem selado e requer revisão/implantação separada. Não reabilita automaticamente o consumidor Prisma antigo.

Responsável operacional: Deifson. Última revisão15/10; próxima21/10, antecipar após mudança/janela. Próxima ação: decisão específica sobre v14 com provas ainda frescas ou renovação pertinente; revisar patch Prisma separadamente. Não solicitar/repetir sudo ou backup apenas para manter frescor enquanto se revisa documentação.
