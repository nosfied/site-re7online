# Converta — E1.1: admissão de geração independente em builder descartável

**Data da observação:** 2026-11-12 15:28:10 -03:00. **Resultado:**
`ADMISSION_PARTIAL`. **Base:**
`review/campaign-recovery-20260926@ccc23d6e9765003e6421c4ba63de5fac250d92a3`,
árvore `0fd1b4f7ef397adbe917a536b083d7f065578243`. **Escopo:** leitura,
modelagem e documentação; nenhum build, deploy, limpeza ou mudança de produto.

## Decisão

A nova geração pode ser independente das dívidas v1/v2, mas ainda não está
admitida para alocação. O bloqueio não é um booleano global: os controles
existentes avaliam reviews no `output parent` escolhido, lifecycle equivalente
na mesma `reservationRoot` e capacidade do host. Uma raiz nova, scope novo e
equivalência nova não herdam automaticamente o bloqueio da geração do piloto.

Faltam, porém, dois vínculos obrigatórios antes de `ADMISSION_READY`:

1. um target real da correção da pesquisa da Inbox, com árvore e impacto
   confirmados;
2. um lifecycle versionado que abra e encerre a **raiz inteira** do builder
   descartável, incluindo cache isolado, worktree, output e evidências
   exportadas. O ensaio sintético do PR #377 comprova pacote → instalação →
   falha de readiness → rollback, mas não constitui esse consumidor operacional.

Não alterar `nextBuildBlocked`, não reutilizar os worktrees v1/v2 e não iniciar
E1.2 a partir deste parecer.

## Autoridades e fotografia reutilizadas

- O PR #378 está integrado; o merge efetivo é a própria base `ccc23d6e…`.
- API selecionada: `immutable-a838bd33-external-20261110T130618Z`.
- Frontend selecionado: `immutable-b8d284b6-vps-20261108T132846Z`.
- Worker preservado: `immutable-e2e7f17a-20261022T005110Z`.
- Retornos autenticados: API `b8d284b6`; frontend `36b94c6d`.
- Guarda de campanhas: aberta, geração 47, zero tarefas, sem fault.
- Dívida v2: `PRESERVED_RETENTION_DEBT`, 1.027.608.576 B, prazo
  2026-12-10 20:59:59 America/Fortaleza.
- Dívida v1: lifecycle `FAILED`, 671.199.232 B.
- Runtimes do piloto: fechamento terminal, 982.900.736 B recuperados.

As dívidas permanecem protegidas. Prazo não concede autoridade de retirada.

## Semântica comprovada de independência

`converta-release.py::require_generation_reviews()` consulta somente gerações
diretamente sob o `output parent` informado. Estados negativos ou overrides
vencidos nesse parent bloqueiam uma nova geração ali.

`preparation_artifact_lifecycle.py::validate_existing_lifecycles()` exige que a
`reservationRoot` do contrato seja o parent consultado, agrega reservas nesse
parent e nega uma preparação anterior aberta apenas quando scope e equivalência
coincidem. Logo, uma geração genuinamente independente precisa de:

- top-level root exclusivo;
- `output parent` exclusivo;
- `reservationRoot` exclusiva;
- scope derivado do target e do payload;
- equivalência calculada sobre target, componentes, produtor, root policy e
  rota de instalação.

A capacidade continua sendo um gate físico do filesystem. A independência
lógica não cria bytes nem permite ignorar a reserva operacional.

## Identidade proposta — ainda não materializada

| Campo | Valor proposto |
| --- | --- |
| Target | `TBD_AFTER_INBOX_FIX_REVIEW` — não usar a base documental como target |
| Generation/release ID | `immutable-<target8>-external-<YYYYMMDDTHHMMSSZ>` |
| Payload do produtor | `api,frontend`, conforme contrato atual do produtor |
| Escopo de ativação provável | `frontend` somente; sujeito ao diff final |
| Scope do lifecycle | `release-build:<target40>:api-frontend-payload` |
| Equivalência | SHA-256 canônico de target + componentes + produtor + root policy + rota de instalação |
| Raiz exclusiva | `/tmp/re7-disposable-builder-e1-<target8>-<utc>/` |
| Worktrees | `<raiz>/build-worktrees/` |
| Output parent | `<raiz>/build-output/` |
| Reservation root | `<raiz>/preparations/` |
| Cache npm | `<raiz>/npm-cache/`, sem compartilhar `_cacache` histórico |
| Evidência protegida | `<raiz>/evidence/`, exportada antes do descarte |
| Release/staging de teste | `<raiz>/{releases,staging}/` |

Todos os diretórios devem nascer `0700`, com owner/grupo autenticados e sem
symlink. O lifecycle precisa existir antes da primeira alocação.

O retorno vigente permanece API `b8d284b6` e frontend `36b94c6d` enquanto não
houver ativação. Se o candidato final for frontend-only, o retorno imediato do
frontend na futura janela será o frontend atualmente selecionado `b8d284b6`;
API `a838bd33` e worker permanecem intocados.

## Percurso canônico — mecanismo, prova e lacuna

| Etapa | Mecanismo existente | Prova/teste existente | Lacuna para a nova geração |
| --- | --- | --- | --- |
| 1. Admissão e orçamento | `deploy-preparation-admission.py`, lifecycle e contrato de capacidade | testes de admissão, lifecycle e produtor | target e contrato ainda inexistentes |
| 2. Ambiente efêmero | root policy e validação estrita de paths | PR #377 / `verify-disposable-builder-lifecycle.py` | não há materializador operacional da raiz completa |
| 3. Materialização do código | worktree Git limpo e target exato exigidos pelo produtor | testes do produtor | criação ainda depende de orquestração externa |
| 4. Build | `converta-release.py build`, Node v20.20.0, payload API+frontend | `test-converta-release.py` | cache isolado não é obrigatório no contrato atual |
| 5. Pacote e verificação | pacote, manifesto, índice e extração independente | testes do produtor | nenhuma lacuna funcional conhecida |
| 6. Transferência | handoff externo schema 2 e admissão de instalação | testes de handoff externo | vincular à nova closure, não à custódia a838 |
| 7. Instalação inerte | `converta-release.py install`, staging e rename no mesmo filesystem | testes do produtor/instalador | orçamento exato depende do pacote novo |
| 8. Preflight | `converta-deploy.py preflight` e intenção de retenção | testes do driver e retirement | fotografia e grafo são futuros |
| 9. Ativação | driver canônico, seleção por componente e readiness | testes do driver e ensaio PM2 sintético | autorização futura; fora da E1.1 |
| 10. Aceite | `fixed-current-acceptance-materialize.py` | testes do materializador/driver | smokes dependem do escopo final |
| 11. Finalize/rollback | driver + finalizador, save único e retorno autenticado | testes de finalize/rollback | autorização futura; fora da E1.1 |
| 12. Retirada de temporários | `generation-retirement.py prepare/execute` | testes de generation retirement | não encerra por si só toda a raiz do builder |
| 13. Prova residual | receipt/journal/review e `review-preparation` | testes de lifecycle e receipts | falta provar raiz, cache e output todos ausentes |

`generation-retirement.py` autentica handoff schema 2, package/manifest/index,
instalação e closure do builder. `review-preparation` registra estado, mas não
remove artefatos. O consumidor especializado de worktrees de `deploy-control`
não deve ser generalizado silenciosamente para o worktree de source/build.

## Capacidade — duas máquinas

### Builder local, medição fresca

| Medida | Bytes/inodes |
| --- | ---: |
| Filesystem | `/dev/nvme0n1p2` |
| Livre | 198.780.182.528 B |
| Inodes livres | 27.994.598 |
| Cache npm compartilhado observado | 4.378.787.840 B |
| Raiz antiga a838 observada | 1.183.043.584 B |

O cache e a raiz antiga são ocupação observada, não candidatos autorizados à
limpeza. A nova geração deve usar cache próprio e limitado.

O último contrato medido é apenas baseline histórica e não pode ser reaplicado
como contrato do novo target:

| Rubrica histórica | Bytes |
| --- | ---: |
| Crescimento do workspace | 1.610.612.736 |
| Payload runtime | 1.342.177.280 |
| Temporário do pacote | 536.870.912 |
| Verificação independente | 1.342.177.280 |
| Evidência de falha | 268.435.456 |
| Reserva operacional | 4.294.967.296 |
| Gate com margem de admissão | 9.663.676.416 |
| Inodes exigidos | 800.000 |
| Margem atual contra esse baseline | 189.116.506.112 B / 27.194.598 inodes |

O pico precisa ser medido continuamente no novo build. O saldo líquido esperado
após closure é a ocupação exclusiva das evidências exportadas; o critério de
aceite é zero worktree, output, staging e cache residual fora da retenção.

### VPS, medição fresca

| Medida | Bytes/inodes |
| --- | ---: |
| Filesystem | `/dev/vda1` |
| Livre | 8.096.346.112 B |
| Inodes livres | 8.778.832 |
| Gate histórico de recepção/instalação externa | 5.700.927.488 B |
| Margem atual contra o gate histórico | 2.395.418.624 B |
| Pacote + release físicos do piloto, baseline | 1.137.524.736 B |

O gate da VPS é provisório até existir o pacote novo. A admissão futura deve
usar tamanho real do pacote, índice, pico de verificação, extração sequencial,
release instalada, evidência e reserva operacional. Não inferir economia total
nem repetir a afirmação de 41% fora do contexto medido do piloto.

## Primeiro candidato funcional: pesquisa da Inbox

O diagnóstico versionado aponta uma race no frontend: a mesma promise de
refresh é compartilhada entre chaves de consulta; a resposta antiga é
descartada e a consulta nova pode nunca ser emitida, enquanto a lista já foi
zerada. Há ainda refiltro local com semântica diferente da busca remota.

O backend já recebe `search` em `GET /app/conversations` e aplica tenant,
cliente autenticado, RBAC, departamento, canal e status antes de publicar os
resultados. O contrato cobre protocolo, nome, telefone, waId e última mensagem.

**Impacto preliminar:** frontend-only se a correção se limitar à geração de
request por query e à remoção/igualdade do refiltro local. Será API+frontend
somente se a reprodução demonstrar que o contrato do backend precisa mudar
(por exemplo, normalização ou semântica parcial de protocolo). Worker,
persistência, migrations, Meta e campanhas ficam fora do escopo.

Regressões obrigatórias antes de fixar o target:

- promessas fora de ordem e sequência `A → AB → vazio`;
- limpar após sucesso e após zero resultados;
- protocolo/nome/telefone/waId, com normalização definida;
- paginação, cursor e atualização realtime durante busca;
- dois tenants e negativos de RBAC/departamento/canal;
- classificação pelo `deploy-impact-matrix.sh` contra a API ativa.

Nenhuma correção funcional foi implementada nesta E1.1.

## Gates finais

| Critério | Estado |
| --- | --- |
| Dívidas antigas autenticadas e preservadas | PASS |
| Independência lógica da nova root/scope/equivalence | PASS |
| Saúde, seleções, guarda e locks preservados | PASS |
| Capacidade preliminar dos dois hosts | PASS, sujeita a contrato do target |
| Target, árvore e impacto finais | PENDENTE |
| Lifecycle terminal da raiz inteira do builder | PENDENTE |
| Cache isolado obrigatório e contabilizado | PENDENTE |
| Orçamento exato da instalação na VPS | PENDENTE até pacote real |

**Resultado final: `ADMISSION_PARTIAL`.**

## Próxima ação mínima — não executar automaticamente

Antes de E1.2, revisar e versionar um perfil fechado de admissão/closure do
builder descartável que:

1. abra lifecycle antes de worktree, cache ou output;
2. exija target, root policy, reservation root e cache estritamente exclusivos;
3. exporte pacote/manifesto/índice e evidência de sucesso ou falha para custódia
   protegida, com hashes e receipt;
4. em sucesso e falha, retire apenas os derivados da nova geração e comprove
   ausência de worktree, output, staging, cache e registro Git;
5. preserve rollback e evidência exportada;
6. exercite sucesso, falha de build, falha de transferência, falha de
   instalação, ativação/rollback e zero resíduo, reaproveitando o PR #377.

Em paralelo, implementar e revisar a correção mínima da Inbox em uma frente
própria para produzir o target real. Só então materializar contrato de
capacidade e pedir admissão da geração. E1.2 não foi iniciada.
