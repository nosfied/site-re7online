# Converta — E1.2-A: lifecycle completo do builder descartável

**Data:** 2026-11-12. **Base:**
`review/campaign-recovery-20260926@b1d773ec77cf6fddf9805f066cab94f869263932`.
**Escopo:** desenvolvimento e ensaios locais isolados; nenhum build produtivo,
deploy, restart, banco, Meta, campanha ou retirada histórica.

## Diagnóstico

O ensaio integrado pelo PR #377 já provava pacote verificado, instalação sintética,
ativação e rollback PM2. O produtor e `generation-retirement.py` também fechavam
artefatos conhecidos. Faltava uma autoridade única para a **raiz inteira** do
builder: abrir antes de worktree/cache/output, exportar a autoridade para fora da
raiz e comprovar zero resíduos depois de sucesso ou falha. Sem isso, cache,
staging, temporários e auxiliares podiam ficar fora da intenção de retenção.

## Complemento implementado

Foi adicionado `scripts/disposable-builder-lifecycle.py`. Ele não é outro sistema
de deploy: não instala, seleciona symlink, reinicia processo, salva PM2 ou remove
release. O supervisor fecha somente a raiz efêmera da geração e entrega pacote e
evidências aos consumidores já existentes.

O contrato schema 1 fixa geração, target, repositório, raiz, custódia, UID/GID,
modo, orçamento, worktree, locks, caminhos protegidos e sete subraízes. O percurso
é:

1. `open`: valida isolamento/capacidade e registra `ALLOCATION_STARTED` antes da
   primeira alocação; depois identifica toda a árvore em `ROOT_ALLOCATED`;
2. produtor canônico: usa `--npm-cache-root` e `--temporary-root`, ambos exclusivos;
3. `export`: publica por hash, `fsync` e destino exclusivo a autoridade de sucesso
   ou a evidência de falha na custódia externa;
4. `prepare`: reabre a autoridade, observa processos, sela inventário físico e os
   comandos exatos;
5. `execute`: exige `AUTHORIZE_ONCE`, recaptura tudo sob dois locks, remove o
   worktree sem `--force`, encerra somente a raiz e grava journal/receipt;
6. terminal: `SANITIZED/CLOSURE_RECORDED`, raiz ausente e registro Git ausente.

Qualquer falha antes do terminal deixa `RETENTION_DEBT` ou uma negativa sem efeito.
A retomada reconhece eventos duráveis e não repete comandos já verificados.

## Regressões e resultados

O novo conjunto cobre sucesso, falha antes do pacote, exportação interrompida,
falhas posteriores de transferência/instalação registradas na custódia, temporário
parcial, interrupção durante a finalização, queda depois da remoção do worktree,
retomada e replay terminal. Também nega evidência ausente, observação incompleta,
referência nova, conteúdo extra, identidade divergente, worktree com conteúdo
único, intenção que omite o worktree e sobreposição com as gerações v1/v2.

Comando isolado:

```text
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest -v scripts/ci/test-disposable-builder-lifecycle.py
```

Resultado local: **19/19 PASS**.

A suíte do produtor/instalador foi executada com o umask canônico:

```text
umask 0022 && PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/ci/test-converta-release.py
```

Resultado local: **59/59 PASS**. O workflow continua executando o ensaio PM2 real
do PR #377 e passou a executar a regressão terminal do novo supervisor no mesmo
candidato.

## Medição da fixture

Os números abaixo são blocos/inodes físicos da fixture sintética; não são orçamento
produtivo:

| Medida | Resultado |
| --- | ---: |
| Raiz antes da alocação | 0 B / 0 inodes |
| Pico observado da raiz | 106.496 B / 26 inodes |
| Raiz após o terminal | 0 B / 0 inodes |
| Custódia preservada após o terminal | 65.536 B / 17 inodes |

O receipt terminal registra separadamente bytes/inodes retirados. Pacote e
evidências continuam íntegros na custódia e as sentinelas v1/v2 permanecem
inalteradas.

## `release_directory_identity`

A negativa local foi reproduzida sob `umask 0002`. O filtro seguro de extração do
Python não reaplicava o modo do diretório em algumas versões, recriando diretórios
canônicos `0755` como `0775`; a validação estrita recusava corretamente a release.
Não era um path incorreto nem justificava relaxar o índice.

`safe_extract()` agora normaliza **somente diretórios** extraídos para o modo
canônico `0755`, já exigido pelo pacote, antes de `verify_root()`. Arquivos,
symlinks, modos e hashes continuam comparados entrada por entrada. A regressão com
`umask 0002` passa. Duas fixtures históricas ainda dependem do umask `0022` ao criar
cópias privadas fora da extração; o workflow canônico já usa esse ambiente e não
há mudança no contrato produtivo por causa delas.

## Proteções e limites

- Checkout principal e dívidas v1/v2 não foram modificados.
- Tenant, worker, banco e Meta não são alcançados pelo novo consumidor.
- A custódia deve estar fisicamente fora da raiz e permanece após o fechamento.
- A limpeza não autoriza retirada de releases nem reduz a capacidade de rollback.
- O ensaio PM2 existente é reutilizado; não houve repetição produtiva nem novo
  deploy.
- A futura geração ainda precisa de target, orçamento medido e autorizações próprias.

## Veredito

**`E1_2A_PASS`**, condicionado à CI do mesmo HEAD e à revisão do PR. A condição de
integração é manter todos os jobs aprovados e a árvore do candidato idêntica à
testada. Nenhuma geração real deve ser iniciada por este registro.
