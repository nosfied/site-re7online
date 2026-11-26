### Papéis temporais do primeiro cutover

**A. Grafo operacional histórico vigente.** CB3721D4 permanece selecionada em
API/frontend, ED74 permanece selecionado no worker e 41D permanece o rollback
imediato da última ativação concluída. O predecessor aparece em
`immediateRollbackReleases`. Ainda assim, `immediateRollbackReleases=41D` e
`rollbackReleases` continua protegendo 41D e #444.

**B. Plano da transição futura.** O runtime manifest schema 6 declara
`predecessorReleases=CB3721D4`, `candidate=A+B` e
`runtimeManifest.rollbackReleases=#444`; esses papéis não reescrevem o grafo
histórico.

**C. Journal da operação em curso.** Registra quiesce, fotografia final,
aggregate, promoção, rollback e compromisso durável.

**D. Grafo operacional sucessor.** Mesmo depois dos efeitos comprovados e da
publicação pela autoridade canônica, a transação futura é requisito retroativo do
produtor histórico.
