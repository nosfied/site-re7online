# A1 — PASS durável e falha posterior de apresentação

Estado na captura do diagnóstico: **B não executado; zero bytes retirados; CAPACITY DENY então observado**. Continuidade posterior: [B único concluído e CAPACITY PASS](WITHDRAWAL_RESULT_2026-10-13.md). A autorização do owner para o lote de `47008ee6` permanece. A1 foi invocado uma vez, exit1; C foi invocado uma vez, exit0. Nenhum código/input produtivo foi alterado e A1 não será repetido.

## Evidência e causa

O export root-owned, efetuado pela sessão sudo legítima do owner, contém `dry-run.private.json`: result=DRY_RUN_PASS, removed=false, duas observações, proprietários0/incomplete0. SHA-256 `3f91704250440abb1c317641557610c346ddcbc10d158d0272bb1f97f65273bf`,181B. O CLI publicou DENY/TypeError depois desse recibo, com stderr vazio. Não existe intent, receipt de retirada ou apply-result.

No driver exato `0f85b527…`, `run(..., apply=False)` retorna removed=false. A escrita exclusiva/fsync do recibo ocorre antes de `len(r.get('removed',[]))`; a impressão lança `TypeError: object of type 'bool' has no len()`. A causa foi reproduzida usando a AST do CLI real, sem executar retirada. Não é recusa de hashes, referências, identidade, capacidade projetada ou observação. A aplicação retorna uma lista em removed; seu caminho de apresentação foi validado separadamente, sem executar os efeitos produtivos.

C: POST_READ_COMPLETE, withdrawalComplete=false, capacityPass=false, mínimo executores2.041.073.664B, cache6.007entradas/main preservados, quatro arquivos ainda presentes, healthCode0, duas amostras completas sem owners. Recibo SHA `b8ec3a2348a4ef99e04c636456cc6d1b5e2932631674ab03be74029ee02dfb04`,1300B. DENY SHA `2cd55235489058a005bd1bbc9b26b46697b2a79c9d6ccedf89b53697be5c704b`,110B.

## Continuação sem alterar a autorização ou os bytes

O requisito DRY_RUN_PASS é comprovado pelo recibo integral; não se transforma uma recusa operacional em PASS. B permanece o bloco autorizado, uma única invocação, com driver0f85/input73002641 intactos e verificações frescas internas. Em nova divergência, negar/preservar, sem adaptação/replay. Nenhum defeito do reporter foi corrigido no driver publicado; correção futura requer artefato próprio e revisão, sem substituir esta geração.

Como C original já existe, a leitura posterior à eventual aplicação usa `post-after-apply-20261013T133000Z`, diretório700 de evidências sob a preparação original. Somente cópias byte-a-byte do driver, post-reader e input, conferidas por hashes; mesmos paths absolutos e contratos. Importar post-reader não chama run(). Nenhum recibo antigo é sobrescrito. Não executar A1 no diretório novo. Em B parcial/timeout, C e exportação dos diagnósticos continuam obrigatórios; inspecionar sem repetir B.

Custódia reconferida antes de B: hashes dos dois blobs e manifesto final conferidos; resultado privado A0 SHA94cd098d…. Recusa/exportações preservadas no diretório permanente do owner fora de temporários/Git, manifesto SHA `27d2b737a0de1e0a06c9d11d16b14d05d668f796dd88712b43e804d08cecf3c5`. Uma réplica física off-host; não alegar duas mídias independentes.

## Provas e limites

`python3 test-cli-reporting.py`: dois testes PASS. Usam CLI AST/gravador reais, runner apenas fornece resultados sintéticos para isolar apresentação; não comprovam remoção, permissões root ou espaço liberado. Treze testes anteriores e observações root reais reaproveitados, sem repetição ampla. B/C já enviados para a sessão sudo do owner; este diagnóstico registra a dependência então existente, não a conclusão posterior de retirada.

Após B/C: conferir recibo, espaço mínimo6.468.665.344B, WAL/erros e estado produtivo, preservar evidências off-host. Somente com CAPACITY PASS real continuar backup/RPO fresco e reconferência bancária. Nenhuma instalação, ALTER ROLE, restart, envio ou abertura autorizada nessa continuação. Auth concluída/NEWauth, out.15 CLOSED, guarda38 fechada preservados.
