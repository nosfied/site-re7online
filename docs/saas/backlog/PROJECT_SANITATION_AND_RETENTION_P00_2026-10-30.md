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
