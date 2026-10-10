# Drivers revisáveis — lógica dos bytes preparados preservada

As quatro fontes `.in` são templates **não executáveis**, com fragmentos privados retirados. Nenhuma lógica de controle foi corrigida, simplificada ou substituída: substituição reversível e SHA-256 demonstram igualdade byte a byte com os drivers já preparados/ensaiados na VPS. Valores de bindings permanecem no arquivo privado, fora do Git. Hash do input, Node e contrato fechado37 são públicos; não há credenciais, números completos ou conteúdo de env.

[DRIVERS_MANIFEST.json](DRIVERS_MANIFEST.json) fixa, por arquivo, template/hash, chaves de binding e **hash do arquivo efetivamente preparado**. Os mesmos hashes estão em [administrative.sha256](../administrative.sha256) e [ADMIN_MANIFEST.json](../ADMIN_MANIFEST.json). A revisão pode rastrear todo o caminho `run-admin → CLI` e `inspect-current → capture-readonly → query-current`. A captura importa somente Prisma e o decoder puro de seed; não importa index.ts/runner/scheduler/provider. O driver administrativo mantém a allowlist de env, flock, identidade PID/start ticks, guarda/task/markers, hashes, O_EXCL e diagnósticos/timeout. A inspeção não pressupõe geração37 após um eventual ack.

Renderização **LOCAL**, sem SSH/SQL e sem sobrescrever arquivos:

```bash
python3 docs/reviews/automation-freeform-window-release-af26/position6-operational-preparation-20261010/drivers/render-reviewed-drivers.py local-evidence/position6-operational-20261010T224151Z/driver-bindings.private.json /tmp/re7-position6-driver-review-new-output
```

O diretório de saída precisa ser novo. Executado nesta rodada em diretório isolado próprio: quatro hashes iguais aos preparados, Python AST e `query-current.cjs` em Node20 syntax PASS. Alteração de binding API produziu `prepared_bytes_mismatch` **antes de criar saída**. Isso não executa CLI ou comprova nova recuperação produtiva; não substitui os testes A/B/C anteriores.

## Bundle administrativo: receita e grafo

[Grafo original completo](../BUNDLE_GRAPH.json), SHA-256 `931c8b1f5319e5d6752f0f6fcb5033d699ccccef3685994927e42023f9b95b1c`, idêntico ao metafile empacotado. Doze fontes de c2623d97 com hashes em ADMIN_MANIFEST; imports externos Node e `@prisma/client`. Não alcança provider/entrypoint/scheduler/runner. O código emitido tem SHA-256 `32e4eededcf3aaf64bce3cf37543d803739c7b9d0954f70aa831849514edf4a0`; bibliotecas/engine Prisma do pacote completo estão manifestadas separadamente.

Receita de geração para reprodução isolada futura (documentada, **não executada nesta rodada**, sem reconstruir pacote/API/worker):

```bash
/tmp/re7-pm2-lab/node docs/reviews/automation-freeform-window-release-af26/position6-operational-preparation-20261010/drivers/generate-reviewed-bundle.cjs /tmp/re7-position6-bundle-review-new-output
```

Execute da raiz do worktree cujas 12 fontes tenham os hashes revisados. Node20.20.0 e esbuild0.27.2 são exigidos. Flags preservadas: bundle, platform=node, format=esm, target=node20, external=@prisma/client, metafile; sem minify/sourcemap/entrypoint da aplicação. O gerador nega saída existente, fonte divergente, grafo diferente ou bundle diferente **antes de gravar**. Syntax Node20 PASS; não atribuir a isso um rebuild reproduzido. O caminho da saída altera a chave de outputs do novo metafile; o hash do bundle e o conjunto das fontes precisam continuar iguais. O grafo ORIGINAL fica íntegro, sem normalização silenciosa de seu hash.

Tar preparado `09172dde…0715`, manifest completo e input originais foram reconferidos na VPS nesta rodada sem executar dry-run novamente. Não refazer tar ou substituir os bytes usados no dry-run anterior. Helpers, sudoers e releases ativas não receberam estes templates/renderer/gerador.

### Delta exclusivo de ambiente dcbeea48

Capture descarta as quatro chaves herdadas antes das fontes legítimas /proc/PM2; DATABASE_URL original ausente nega antes da conexão. Teste: `python3 docs/reviews/automation-freeform-window-release-af26/position6-operational-preparation-20261010/drivers/test-capture-environment.py` (6 provas AST efetivo, fontes externas simuladas). Renderer/DRIVERS_MANIFEST agora vinculam capture corrigido; três drivers e CLI/bundle inalterados. Originais e manifestos preparados preservados. `storage-root-readonly.py` é leitor manual via sudo existente, stdout PRIVADO, sem instalação. `withdraw-four-for-review.py` é apenas proposta futura, não executada; comandos/prazos/limites no relatório único.
