# Converta — E1.2-B — correção da pesquisa da Inbox

**Data:** 2026-11-12. **Base:** `review/campaign-recovery-20260926@1f1b10674fd427f7e2fdeb13a37511e8538afd47`. **Estado:** candidato local validado; PR draft e CI obrigatórios; não integrado e não implantado.

## Diagnóstico fechado

Três defeitos formavam o sintoma observado:

1. uma promessa global coalescia consultas de chaves diferentes; a resposta antiga era descartada, mas a consulta nova não chegava a começar;
2. a lista válida era apagada antes da resposta da API e ficava permanentemente vazia quando a corrida ocorria;
3. a API pesquisava nome e protocolo apenas entre as conversas recentes carregadas para a página e o frontend ainda refiltrava a resposta com outra regra.

## Contrato implementado

- A chave completa contém busca, status, departamento, atribuição, canal e cursor. Somente chamadas da mesma chave são coalescidas; chaves distintas executam independentemente.
- Apenas a chave corrente pode publicar. A paginação também revalida sua chave antes de anexar resultados.
- A lista válida permanece visível durante o carregamento. Limpar o campo agenda imediatamente a consulta sem termo; digitação não vazia usa debounce de 250 ms.
- A resposta remota é a fonte de verdade para o termo. Os filtros rápidos puramente locais continuam locais, sem refiltrar nome, telefone ou protocolo.
- Nome é comparado sem diferença de caixa ou diacríticos portugueses; telefone/waId ignora pontuação; protocolo aceita formato completo ou fragmento, com ou sem `Protocolo`/`CVT-`.
- A busca remota resolve candidatos fora da primeira página por Lead, identidade da conversa, runtime operacional, eventos de protocolo e snapshots de serviço encerrado. Depois disso, o pipeline já existente aplica tenant, RBAC, departamento, canal, status, política de Inbox e acesso a encerradas.
- Nenhuma migration foi criada.

## Lifecycle do protocolo

O protocolo nasce em `conversation/serviceCycle.ts` no formato `CVT-` mais 12 caracteres. Durante um atendimento ativo, fica em `ConversationRuntimeState.answers.operationalProtocol`; cada início/encerramento também gera evento tenant-scoped. Mensagens levam snapshot em `rawPayload.serviceCycle`. No encerramento, `CompletedServiceSnapshot` preserva protocolo e dimensões operacionais, e o runtime mantém `lastClosedServiceCycle` para apresentação. A listagem projeta o ciclo ativo ou o último encerrado e a busca consulta essas fontes sem atravessar `clientId`.

## Provas locais

- PostgreSQL 16 descartável, banco `re7_e12b`, sem acesso à Meta: 3/3 regressões HTTP passaram.
- Regressões puras/frontend: 10/10 passaram.
- Regressões adjacentes de cliente/realtime/timeline: 52/52 passaram.
- Backend TypeScript: PASS.
- Frontend `next build`: PASS.
- ESLint debt ceiling: PASS (`663` erros e `243` avisos, abaixo do teto `663/246`; dívida preexistente).

As provas cobrem nome com acento/case, telefone pontuado, protocolo completo/parcial ativo e encerrado, paginação, status, departamentos, dois tenants, falha/recuperação, `A → AB → vazio` fora de ordem, limpeza após resultado positivo/vazio e atualização repetida da mesma chave (realtime). O provedor externo não participa desses testes.

A suíte ampla preexistente `ownClosedConversations.test.ts` permaneceu em 17/18 tanto na base exata quanto no candidato. Em ambos, `closed actions and read-state denied without runtime/config changes` esperou `409` e recebeu `404` no `transfer`; a comparação em worktrees e bancos descartáveis separados classifica esse resultado como preexistente e fora do delta E1.2-B.

## Escopo de release

Há alteração no handler da API e na tela da Inbox. `scripts/deploy-impact-matrix.sh` classificou o candidato como **API + frontend**, sem worker, sem migration, sem impacto desconhecido e sem revisão manual adicional da matriz.

## Limites

Esta entrega não executa build de pacote, deploy, restart, mutação produtiva, banco produtivo, Meta, limpeza ou alteração de `nextBuildBlocked`. Homologação visual em navegadores reais e CI pertencem ao PR draft.
