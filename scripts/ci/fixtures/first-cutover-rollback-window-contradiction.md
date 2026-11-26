# First-cutover rollback window fixture

Contrato temporal de recuperação: antes de `AGGREGATE_VERIFIED`, CB somente
quando segura; de `AGGREGATE_VERIFIED` até `CANDIDATE_API_HEALTHY`, #444 sem
retorno release-local; depois de `CANDIDATE_API_HEALTHY`, somente rollback
durável. `AGGREGATE_VERIFIED` não é o compromisso irrevogável.

A fronteira de commit é `CANDIDATE_API_HEALTHY`. Antes dela, qualquer falha
retoma CB no symlink original, mesmo quando o aggregate já está verificado.
