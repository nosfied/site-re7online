# Converta — E1.4-R2: reconciliação fechada do bytecode residual

**Data:** 2026-11-12. **Base:**
`review/campaign-recovery-20260926@39c4eecc4c785f1134f56d75d3b4cf40f39bd73b`,
árvore `3bd25870e3ba698176813fece4c97160bf7f357f`. **Resultado de
desenvolvimento:** `RECOVERY_IMPLEMENTED`. Este registro não autoriza nem relata
uma retirada real.

## Lacuna e alteração mínima

A E1.4-R1 comprovou que a geração falha permanece em
`EXPORTED / AUTHORITY_EXPORTED`, outcome `FAILED`, e que o `prepare` normal é
corretamente negado por um único bytecode não rastreado. O consumidor histórico
de `generation-retirement.py` não aceita essa geração sem fabricar um inventário
retroativo.

O complemento foi feito no supervisor existente
`scripts/disposable-builder-lifecycle.py`, com duas operações novas:
`prepare-residue` e `execute-residue`. Elas são restritas a:

- `scripts/__pycache__/preparation_artifact_lifecycle.cpython-312.pyc`;
- seu diretório `scripts/__pycache__`, que precisa conter apenas esse arquivo;
- a fonte rastreada `scripts/preparation_artifact_lifecycle.py`.

Não há descoberta por nome, glob, remoção recursiva, `--force` ou autorização
para qualquer outro artefato. O lifecycle original continua `EXPORTED` até o
fechamento normal posterior.

## Contrato da reconciliação

`prepare-residue` reabre por hash contrato, lifecycle e export receipt, mantém os
dois locks canônicos e sela:

- target, árvore, registro do worktree, tracked files e index;
- status Git contendo exatamente o bytecode esperado e nenhum ignorado adicional;
- identidade física, UID/GID, modo, tipo, link count, tamanho, blocos e SHA-256;
- inventário físico da fonte, diretório e bytecode;
- header, magic, flags e code object CPython vinculados ao blob Git da fonte;
- observação completa de processos, sem referência nem writer;
- os dois comandos literais `/usr/bin/rm -- <arquivo>` e
  `/usr/bin/rmdir -- <diretório>`.

`execute-residue` exige `AUTHORIZE_ONCE` vinculada ao hash da intenção e aos dois
caminhos, recaptura a prova sob os locks e só então grava o primeiro `ATTEMPT`.
O journal durável exige, para cada ordinal,
`ATTEMPT → RESULT(exitCode=0) → VERIFIED(absent=true)`. O receipt terminal cobre
somente os dois efeitos, autentica journal, intenção e autorização e preserva o
worktree. Replay terminal com a mesma autorização é somente leitura; autorização
divergente é negada. Retomadas após `ATTEMPT` e após `RESULT` não duplicam efeitos
já comprovados.

Depois do receipt, a fixture comprova status Git limpo, `prepare` normal aceito,
remoção do worktree sem `--force` e terminal `SANITIZED / CLOSURE_RECORDED`, com
as sentinelas v1/v2 intactas.

## Regressões locais

O conjunto dirigido passou com **33/33** testes. Junto dos testes existentes, as
novas regressões cobrem sucesso, conteúdo/hash, symlink, hardlink, device/inode,
modo/owner, conteúdo extra e ignorado, tracked/index dirty, processo, writer,
observação incompleta, lock ocupado, negativa antes de `ATTEMPT`, interrupções,
retomada, replay, autorização divergente e adulteração de receipt/journal.

```text
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest -q \
  scripts/ci/test-disposable-builder-lifecycle.py
```

Os sete testes adjacentes de `preparation_artifact_lifecycle.py`, os 14 testes do
materializador de retirement e os cinco testes de estado histórico também
passaram. A suíte integral de `generation-retirement.py` preserva na base e no
candidato a mesma negativa preexistente em quatro casos legados
`residue_identity`; a reprodução na base imutável `39c4eecc...` confirma que ela
não foi introduzida por R2.

As métricas da fixture são sintéticas: pico de **126.976 B / 28 inodes**, raiz
terminal em **0 B / 0 inodes** e custódia preservada em **65.536 B / 17 inodes**.

## Geração real e próxima ação

Permanecem preservados, sem reescrita:

- geração `immutable-fa10f4f5-external-20261112T211724Z`;
- contrato `7bbed2edecd77e4af2fa32a6f70b012cec70d04aa93e49850d08c9957d616089`;
- lifecycle `66f4ccc2c1fa9f3be765aad51a48570ccab7f6a752208623947668817c6e12dc`;
- export receipt `2693dff88496763121dfbf0ebcbb4205987be266d6d973cf8e3341f0950c7fc5`;
- o bytecode real e as dívidas históricas.

Após integração, a menor ação é executar **somente `prepare-residue`** na geração
real, recapturando todas as identidades. O intent resultante deve ser revisado e
receber autorização própria. Qualquer diferença de caminho, identidade, hash,
owner, modo, conteúdo, Git, processo, lock ou autoridade termina em negativa antes
do primeiro efeito. A retirada e o fechamento normal continuam etapas separadas.

