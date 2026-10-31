# Plano P00 — sanitização, retenção e higiene do projeto

**Status:** P00 / EXECUÇÃO LIBERADA APÓS TENDÊNCIA `DEPLOYED_SANITIZED`
**Abertura:** 30/10/2026
**Autoridade:** [princípios fundamentais](../WORKING_PRINCIPLES.md)
**Execução produtiva:** somente pelo [runbook canônico](../DEPLOY_RUNBOOK.md)

## Estado de partida

A janela Tendência encerrou em `DEPLOYED_SANITIZED`, sem repetição de build,
ativação ou retenção. O saldo relatado após a finalização foi 8.012.804.096 bytes.
Esse valor é um checkpoint histórico: cada lote deve medir capacidade e inodes uma
vez no início e uma vez no fim, sem transformar observações em novas tentativas.

O objetivo agora é recuperar capacidade sustentável, reduzir raízes/branches/PRs e
impedir que build, preparação e diagnóstico voltem a acumular resíduos sem destino.
A limpeza não autoriza excluir por idade, nome ou tamanho. Cada item recebe uma
classe e uma prova de ausência de referência antes da retirada.

## Fechamentos terminais

### Lote incremental 2026-10-31 — retornos `automation-20260929`

Estado terminal `COMPLETED`, sem autorização de repetição. A execução canônica
consumiu exatamente a intenção
`79158edad60917020df8f0a04342bc9ba4780520e845b5c7a877506c64063e2a` e dois
comandos `unlink` literais, SHA-256
`2d20972bc839fff090dedf11c641e8e3fbef34bb0fb88051ce5af14a21f54303`.
Foram retirados somente:

- `automation-20260929T220203Z/api-frontend-return.private.tar.gz`;
- `automation-20260929T220203Z/worker-return.private.tar.gz`.

O journal SHA-256 é
`7416d6b2f9de42d5a25167e3e0a49604d4e4e1503b6798b363c072158043c137` e o
receipt SHA-256 é
`466e4315a101a9225bf4a29cc3861e2a74c1beb6b704cb1232ba3525befac648`.
O ganho físico medido foi `375.603.200` bytes. A verificação posterior comprovou
os dois caminhos ausentes, produção preservada e `8.423.989.248` bytes disponíveis
após o pequeno custo da custódia. O índice de evidências SHA-256 é
`284f05514a7b1d561e81570b36240b06f3662b9429ca091f212bc2feeb371998`.

Este lote não volta para inventário, auditoria, preparação ou execução.

### Próximo lote classificado — ainda não autorizado

O próximo escopo fechado contém somente dois archives de retorno derivados da
preparação `runtime-fix-20260930T020103Z`. Seus hashes são reutilizados do
`backup-manifest.json` e do registro versionado
`AUTOMATION_RUNTIME_FIX_PREPARATION_2026-09-30.md`; não foram recalculados nesta
classificação:

| Caminho literal | Classe | SHA-256 registrado | Bytes físicos observados | Autoridade preservada |
| --- | --- | --- | ---: | --- |
| `/opt/re7online/backups/converta-persistent/preparations/runtime-fix-20260930T020103Z/api-frontend-return.private.tar.gz` | `RETIRE_DERIVED` / `CLOSED_PREPARATION_DERIVED_ARCHIVE` | `b39ee8b1d7f6add5634cdfc852781ce8f581840901f37dacd5cfa5f1056ea835` | 276.844.544 | release isolada `ba66c24112ccb10f2dfdcced54350f513d399bc6`, manifesto e registro versionado |
| `/opt/re7online/backups/converta-persistent/preparations/runtime-fix-20260930T020103Z/worker-return.private.tar.gz` | `RETIRE_DERIVED` / `CLOSED_PREPARATION_DERIVED_ARCHIVE` | `6faabcc7c17fc8f60463147ffe327dda358b7fc86994c07284cf782d4601ed72` | 95.993.856 | release isolada `worker-bf5f1d76-f06d49cb-91230f88-b66bb89a`, manifesto e registro versionado |

Ganho físico potencial: `372.838.400` bytes e dois inodes. Ambos são arquivos
regulares `deploy:deploy 0600`, `nlink=1`, sob a raiz canônica de preparações.
Ficam explicitamente fora do lote `content.private.tar.gz`, `database.dump`,
`runtime-data.private.tar.gz`, `configuration.private.tar.gz` e qualquer outro
caminho. A classificação não substitui a futura recaptura de referências e
identidades por `audit`; não há autorização de `prepare` ou `execute` neste
checkpoint.

Com a capacidade final observada do lote anterior, a projeção meramente aritmética
após este próximo lote seria `8.796.827.648` bytes. Ainda faltariam `866.848.768`
bytes para o alvo agregado de `9.663.676.416` bytes, que permanece uma meta entre
lotes e não um predicado de bloqueio para cada lote incremental seguro.

#### Negativa consumida e reconciliação nominal

A classificação preliminar acima foi consumida pelo `audit` único da custódia
`p00-capacity-runtime-fix-returns-2abddc80-20261031T133937Z` e não autoriza nova
tentativa. O plano negado SHA-256
`e9ceaffcf0123432a8e897a5e2111e640cc46d79146c92de7875b81888d125ee`
registrou conjuntamente:

- `PREPARATION_ARCHIVE_PROTECTED_MATERIAL` no retorno API/frontend;
- `PREPARATION_ARCHIVE_RECORD_SCOPE` no retorno worker;
- `MINIMUM_RECOVERY_NOT_MET` como consequência agregada.

A reconciliação somente leitura, sem extração e sem recalcular os hashes integrais,
reproduziu exatamente o predicado estrutural. O retorno API/frontend contém uma
ocorrência protegida real: `apps/whatsapp-agent/.env.example`, membro regular de
1.789 bytes. Pela decisão fail-closed do owner, o archive inteiro fica
permanentemente `KEEP_PROTECTED`; não se propõe exceção para o sufixo `.example`.

O worker permanece preservado. Seu request usa
`proof.kind=VERSIONED_PREPARATION_RECORD` e o documento específico
`AUTOMATION_RUNTIME_FIX_PREPARATION_2026-09-30.md`, SHA-256
`5500f19a563907d2d33ee568644baa42d64bf50b4bc8cb37662e78d55aed8973`.
A linha 18 vincula descritivamente o hash, mas não contém conjuntamente o basename
literal e o tamanho. O documento possui na linha 32 prova genérica de que os
arquivos compactados foram testados para leitura, porém não contém o literal
canônico `` `tar -tzf` dos arquivos compactados PASS ``. Portanto, estender apenas
o allowlist de documentos continuaria negando e não deve ser implementado. Uma
futura extensão continua condicionada a registro versionado específico que
satisfaça as mesmas provas exatas, sem aceitar documento genérico ou fabricar
evidência histórica.

Resultado da reconciliação SHA-256:
`a502e814bb192db7851d6724c50ae143a1fc50bf54fd88d8d722416dc7def036`;
índice SHA-256:
`5a6cf4f4a98ec0e8f1041634d0c68396f7dbeaa33945553324f99dc00750a23b`.
Não houve `prepare`, `execute`, `unlink` ou autorização substituta.

## Resultado obrigatório

1. Uma única fonte de estado atual; histórico não concorre como instrução.
2. Espaço para o orçamento real da próxima geração mais margem operacional.
3. Preparações, releases, outputs, worktrees, caches, branches e PRs classificados.
4. Todo efeito temporário nasce com owner, classe, orçamento e evento de retirada.
5. Gates previsíveis são validados juntos antes da primeira escrita produtiva.
6. Finalização terminal retira derivados e libera o lock no mesmo protocolo.
7. Toda retirada produz intenção, comandos fechados, recibo e medição posterior.

## Vocabulário fechado de classificação

| Classe | Destino |
| --- | --- |
| `KEEP_ACTIVE` | componente selecionado por current/PM2/dump |
| `KEEP_ROLLBACK` | rollback imediato comprovado e suas dependências |
| `KEEP_EVIDENCE` | manifesto, recibo, journal, índice ou prova compacta necessária |
| `KEEP_UNIQUE_DATA` | DB, configuração privada, runtime-data ou dado tenant-scoped |
| `RETIRE_DERIVED` | build-output, worktree, cache ou archive reproduzível e sem referência |
| `RETIRE_DUPLICATE` | cópia byte-identificada com autoridade preservada |
| `INVESTIGATE` | identidade, referência ou autoridade ainda inconclusiva |

`INVESTIGATE` nunca é sinônimo de removível. Preparações não são apagadas como
diretórios inteiros: payload derivado pode ser retirado enquanto recibos, DB,
configuração, runtime-data e evidência tenant-scoped permanecem protegidos.

## Sequência de execução

### Lote 1 — inventário único e orçamento

- congelar novos builds fora de P00 até recuperar o orçamento real;
- capturar uma única fotografia de bytes, inodes, current, PM2, dump, locks, grafo,
  transações abertas e processos com referência;
- enumerar por device/inode e bytes físicos, evitando somar hardlinks duas vezes;
- produzir tabela por caminho com classe, autoridade, referência, bytes, inodes e
  ação; não fazer hashing integral quando manifesto autenticado já responde;
- definir o ganho mínimo do lote pela diferença entre capacidade atual e orçamento
  da próxima geração, acrescida da margem operacional versionada.

### Lote 2 — derivados e duplicados de menor risco

Priorizar somente itens já comprovados por manifesto, começando pelos maiores ganhos:

- conteúdo repetido entre `automation-20260929` e `runtime-fix-20260930`;
- conteúdo/runtime repetido entre `night-20260927` e `migration`;
- archive repetido entre as duas preparações `hybrid-b9`;
- retornos repetidos dentro de `freeform-window-af26`;
- worktrees, runtimes e caches terminais não selecionados por grafo.

A cópia autoritativa é nomeada antes do plano. DB dumps, runtime-data, configuração
privada e dados de tenant ficam fora dos comandos.

Archives individuais derivados dentro de preparações usam exclusivamente a classe
`CLOSED_PREPARATION_DERIVED_ARCHIVE` do control plane de capacidade. A classe não
remove diretórios e admite somente os basenames fechados de retorno de runtime,
com registro versionado/cópia autoritativa autenticados e `unlink` literal. Lotes incrementais
podem recuperar parte do alvo, mas o receipt deve medir o ganho físico real antes
de qualificar o lote seguinte.

### Lote 3 — releases e preparações históricas

- classificar releases como ativa, rollback imediato, dependência transitiva,
  histórica sem retorno ou retirável;
- exigir que current, PM2, dump, transações, rollback e grafo não referenciem a
  candidata;
- separar evidência compacta de payload derivado;
- executar em lotes pequenos, com capacidade medida após cada receipt;
- interromper ao atingir o orçamento e a margem; limpeza não é pretexto para ampliar
  o escopo destrutivo.

### Lote 4 — Git, branches, worktrees e PRs

| Objeto | Prova antes da ação | Ação permitida |
| --- | --- | --- |
| Worktree verdadeiro | alterações locais e arquivos não rastreados inventariados | preservar; nunca limpar implicitamente |
| Worktree isolado | commit incorporado ou branch preservada, sem trabalho único | retirar pelo mecanismo Git |
| Branch remota | commits alcançáveis pela canônica ou PR supersedido comprovado | excluir somente após registro |
| PR aberto | conteúdo incorporado, substituído ou ainda necessário | merge, fechamento fundamentado ou permanência |
| Raiz documental | autoridade atual, links e validador | consolidar; histórico vira registro, não runbook |

PRs conhecidos para decisão: #286 deve consolidar o estado final; #291 deve ser
revisado como melhoria de retomada de pacote, sem confundi-lo com necessidade da
release já concluída. Nenhuma branch é removida apenas porque está antiga.

## Controles preventivos obrigatórios

### Antes de construir

Uma admissão somente leitura deve validar em conjunto:

- capacidade real, pico temporário, reserva e inodes;
- modos/owner/hashes do control plane;
- schema produzido contra os consumidores reais;
- `observations.pm2.fingerprintSha256`;
- paridade de symlinks entre produtor, índice e comparador;
- estado e protocolo do `deploy.lock`;
- destinos exclusivos e ausência de geração parcial incompatível.

A fixture de CI deve atravessar materialização → retenção prepare → preflight. Teste
unitário de cada script isolado não qualifica a fronteira.

### Durante o build

- um build por release; output e temporários vinculados ao lifecycle;
- compressão publica checkpoints retomáveis;
- perda de transporte não autoriza rebuild enquanto o produtor puder concluir;
- temporários usam raiz dedicada, orçamento e estado terminal explícito;
- nenhum build usa runtime ativo ou o worktree verdadeiro.

### No fechamento

- aceite decide finalize ou rollback; não abre nova geração;
- exatamente um `pm2 save` quando aplicável;
- retenção consome apenas a intenção já selada;
- lock terminal é removido sob o mesmo protocolo autenticado;
- derivados da geração terminam em `SANITIZED` ou dívida nominal com owner e prazo.

### Operação contínua

- alertas por dois níveis: aviso antes do orçamento e bloqueio antes do piso;
- relatório por geração: pico, saldo final, bytes/inodes criados e retirados;
- política de retenção por classe, não por cron/idade cega;
- artefatos duráveis candidatos a armazenamento externo com lifecycle e verificação;
- meta: um build por release, zero negativa produtiva por contrato conhecido, zero
  efeito repetido e 100% das gerações com fechamento e receipt.

## Patinadas desta janela convertidas em regressão

| Falha observada | Controle permanente |
| --- | --- |
| leitura `/proc` incompleta | observador privilegiado fechado e autenticado |
| symlink válido classificado como `other` | comparador comum e regressão produtor/consumidor |
| `processScan` volátil mudou candidato | identidade estável separada de observação fresca |
| alvo de espaço excedeu orçamento por poucos MB | orçamento e meta adicional são decisões distintas |
| snapshot sem fingerprint PM2 | materializador validado pelo consumidor real |
| lock terminal residual | criação, hold e remoção testados como um protocolo |
| SSH caiu após compressão | lifecycle retomável; observar antes de reconstruir |
| `ok=false` sem causa nominal | evento sanitizado com subpredicado obrigatório |
| CI modular verde e fronteira quebrada | teste integrado da transição completa |

## Critério de encerramento

A frente termina somente quando:

- orçamento e margem estão satisfeitos sem contar ganho estimado como ganho real;
- cada caminho analisado possui classe e autoridade;
- todos os lotes executados têm receipt e zero remanescente não explicado;
- branches/PRs/worktrees estão reconciliados sem perda de trabalho local;
- runbook, estado atual, lifecycle e validadores concordam;
- controles de admissão e fechamento possuem regressão ponta a ponta;
- a próxima geração normal pode seguir do início ao fim sem adaptação manual entre
  fases conhecidas.

Até lá, o backlog funcional pode ser analisado, mas novos builds normais não devem
competir com esta frente P00 por disco ou por mudança de control plane.
