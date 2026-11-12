# Converta — E1.4-R1: reconciliação do cache e recuperação dirigida

**Data:** 2026-11-12. **Base:**
`review/campaign-recovery-20260926@fa10f4f59c9a05328e536dd25a1668c3ba25939e`,
árvore `9ae01069b58e465eee1093132a5b4c5d421dcd40`. **Resultado local:**
`RECOVERY_PARTIAL`. Nenhum npm, build, pacote, deploy, retirada ou efeito na VPS
foi executado.

## Procedimento reutilizado e causa

E1.1 fixou o cache isolado em `<disposableRoot>/npm-cache`; E1.2-A e suas
fixtures usam esse mesmo layout. O produtor integrado também exige literalmente
os irmãos `npm-cache` e `temporary` antes do npm. O lifecycle, porém, validava
somente que cada raiz fosse um filho direto e distinto da raiz descartável. Isso
permitiu que o contrato real vinculasse a chave lógica `cache` ao filho físico
`cache`, incompatível com o produtor.

A correção mantém o schema e a chave `cache`. Ao abrir uma geração sem lifecycle
prévio, `disposable-builder-lifecycle.py` agora exige que o valor físico seja
exatamente `<disposableRoot>/npm-cache`. A negativa ocorre antes de criar locks,
lifecycle ou a raiz descartável. Contratos históricos continuam parseáveis nas
fases de exportação e retirada; seus bytes não são reescritos.

## Regressões

O conjunto dirigido passou com **22/22** testes:

```text
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest -v \
  scripts/ci/test-disposable-builder-lifecycle.py
```

As novas provas cobrem:

- `npm-cache`: aceito e autenticado pela função real do produtor;
- `cache`: negado por `disposable_contract_cache_root` antes da alocação;
- outro filho alternativo: mesma negativa antes da alocação;
- contrato histórico: continua aceito pelo parser comum para possibilitar o
  encerramento;
- nenhum lock, lifecycle ou root criado pelas negativas.

## Geração falha preservada

A geração `immutable-fa10f4f5-external-20261112T211724Z` permanece em
`EXPORTED / AUTHORITY_EXPORTED`, outcome `FAILED`. Foram reabertos sem alteração:

- contrato `7bbed2edecd77e4af2fa32a6f70b012cec70d04aa93e49850d08c9957d616089`;
- lifecycle `66f4ccc2c1fa9f3be765aad51a48570ccab7f6a752208623947668817c6e12dc`;
- export receipt `2693dff88496763121dfbf0ebcbb4205987be266d6d973cf8e3341f0950c7fc5`;
- evidência de falha `c18b40d97dd70281002ca33e6643987ba1d5ac33174af109ad0bc78dfed36ebe`.

O status Git tem somente um untracked:
`scripts/__pycache__/preparation_artifact_lifecycle.cpython-312.pyc`. Sua
identidade observada é:

| Campo | Valor |
| --- | --- |
| device:inode | `66306:3557348` |
| owner:group | `1000:1000` |
| modo | `0664` |
| tamanho lógico | `21.176 B` |
| blocos físicos | `24.576 B` |
| SHA-256 | `cbc487ca6e94cb0bdb86859f2d6bda9ef187041d537f59d1071bdc3d61c3feb4` |

A observação de `/proc` foi completa, com zero referências, zero writers e zero
falhas. O checkout continua no target e na árvore aprovados, com tracked e index
sem diferenças. O header CPython, o timestamp/tamanho da fonte e o code object
compilado correspondem à fonte rastreada
`preparation_artifact_lifecycle.py`, SHA-256
`36669ef654cb2f136d2072bd40f7ec96c7f9020a280c6402001d6dd0269178e9`.

## Disposição: primeiro gate

O lifecycle atual nega corretamente `prepare`: o arquivo aparece como untracked,
portanto o predicado é `disposable_worktree_dirty`. Não foi produzido intent.

Existe um consumidor versionado de bytecode em `generation-retirement.py`, mas
ele não é aplicável a esta geração. O perfil exige contrato de artefatos
`COMPLETE`, lifecycle correspondente, inventário detalhado anterior e a negativa
do retirement. Esta geração possui contrato do disposable lifecycle, e o
checkpoint anterior registra somente métricas agregadas, não o inventário por
entrada. Além disso, o perfil fechado exige modo sem escrita de grupo/outros,
enquanto o arquivo observado é `0664`. Fabricar baseline ou reescrever o contrato
violaria a custódia.

O complemento mínimo é no lifecycle existente, não em outro wrapper: uma
reconciliação fechada do único resíduo deve reutilizar as verificações de
linhagem do consumidor já aprovado, vincular contrato/lifecycle/export receipt,
target e árvore, exigir status Git com somente esse caminho, recapturar processos
sob os dois locks e selar comandos literais para retirar o arquivo e seu diretório.
Somente após receipt autenticado o `prepare` normal pode selar
`git worktree remove` sem `--force` e a disposição da raiz. Negativas obrigatórias:
path/hash/header/conteúdo divergente, conteúdo extra, tracked drift, referência,
writer, identidade ou lock divergente.

Nenhuma dessas mutações foi executada nesta etapa. A próxima ação mínima é revisar
e versionar esse complemento, ensaiá-lo em fixture e então preparar uma intenção
produtiva separada para autorização explícita.
