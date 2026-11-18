# Consolidação do builder externo — 17/11/2026

Esta revisão reconcilia somente evidências existentes. Não executou build,
transferência, instalação, deploy, PM2, retirement ou limpeza.

## A. Inventário reutilizável

| Entrega | Implementação existente | Prova anterior | Estado efetivo | Lacuna remanescente | Ação mínima |
| --- | --- | --- | --- | --- | --- |
| Observação e lifecycle do builder | `capacity-proc-observer.py`, `disposable-builder-lifecycle.py` | PRs #375–#377; PR #417, CI `44289415895` | `INTEGRATED / NOT_PRODUCTION_HOMOLOGATED` | proteção durável integrada; reboot real e primeira geração produtiva sob a política ainda não homologados | preservar regressões; homologar somente numa futura geração autorizada |
| Cache e integração externa | lifecycle, produtor e handoff schema 3 | PRs #382–#384; FA10 | `INTEGRATED_AND_PROVEN` | nenhuma para os perfis já fechados | preservar |
| Pipeline API+frontend+worker | produtor, instalador, driver, PM2 bindings e handoff | PR #401; pacote ED74 | `INTEGRATED_AND_PROVEN` | nenhuma no perfil ED74 | preservar |
| Identidade PM2 real | normalização canônica de logs e teste PM2 6.0.14 | PRs #405 e #407 | `INTEGRATED_AND_PROVEN` | nenhuma conhecida | preservar a regressão real |
| Finalização e retomada | materializador, wrapper, ordinais e save único | PRs #410–#413; journal ED74 | `INTEGRATED_AND_PROVEN` | nenhuma no contrato fechado | preservar |
| Retirement 3/3 | mapa autenticado de rollback imediato | PR #414 | `INTEGRATED_AND_PROVEN` | ED74 não tem receipt porque sua raiz sumiu fora do executor | não repetir efeito físico |
| Sucessor de closure ED74 | `ed74-retirement-successor-closure.py` no PR #415 | CI do PR #415 | `DEVELOPED_NOT_INTEGRATED / SUPERSEDED_BY_REAL_STATE` | handoff real permanece `PENDING_RETENTION_DEBT`; raiz já ausente | encerrar sem merge, preservando histórico |
| Paridade de schema admissão → retirement | validações separadas | P00-D | `PARTIALLY_IMPLEMENTED` | admissão não consome integralmente o schema puro do retirement | compartilhar a validação já existente |

## B. Histórico e lições incorporadas

- A838 comprovou API-only externa e a separação entre deploy funcional e dívida
  do builder. O estado é precedente, não seleção produtiva.
- FA10 comprovou build único, export, upload, instalação inerte, ativação,
  aceite, save único e closure canônica do builder com receipt terminal.
- ED74 estendeu a cadeia a API, frontend e worker. Falhas de escopo do handoff,
  fonte PM2, logs reais, aceite 3/3, cache Next, continuidade ordinal e mapa de
  rollback foram corrigidas pelos PRs #401–#414 e preservadas em CI.
- ED74 está ativa e aceita, porém a raiz descartável desapareceu fora do
  lifecycle. A classificação é
  `ROOT_EXTERNALLY_ABSENT / CAPACITY_UNATTRIBUTED / CUSTODY_PRESERVED`; não há
  base para fabricar `DEPLOYED_SANITIZED`.

## C. Saneamento desta revisão

- `CURRENT_STATE.json` migra ao schema 9 e passa a apontar para a seleção ED74
  real, mantendo E0/A838/FA10 como fotografias históricas.
- Um registro ED74 fechado autentica release, artefatos, aceite, save, marker,
  retirement de zero comandos e disposição não canônica do builder.
- `CURRENT_STATE.md`, modelo operacional, lifecycle, índice e P00-D deixam de
  apresentar FA10 como release ativa ou o produtor de finalização como ausente.
- Os validadores admitem somente o perfil literal `api,frontend,worker` e negam
  transformar ausência externa em receipt de sanitização.

## D. Estado Git e PRs

| Item | Classificação | Decisão |
| --- | --- | --- |
| branch operacional `review/campaign-recovery-20260926` | `PRESERVE` | é a base que contém #375–#414; não substituir por `main` histórico |
| `main` remoto | `INVESTIGATE` | está muito atrás da linha operacional; nenhum merge geral é autorizado |
| PRs #375–#414 | `PRESERVE` | integrados; commits, testes e receipts continuam autoridades |
| PR #415 draft | `CLOSE_CANDIDATE` | não mergear: pressupõe closure sucessora incompatível com a ausência física não atribuída |
| worktrees históricos prunáveis | `PRESERVE` | não podar em saneamento documental; classificação individual é requisito prévio |
| workspace local original com mudanças | `PRESERVE` | esta revisão usa worktree isolado e não sobrepõe alterações do operador |

## E. Lacunas técnicas reais

1. A admissão ainda não chama integralmente o mesmo validador puro de estado
   operacional consumido pelo retirement, inclusive fingerprint PM2.
2. Subárvores mutáveis de runtime continuam em perfis literais por geração; falta
   um contrato reutilizável, enumerado e autenticado. Isso é melhoria não
   bloqueante para os perfis já comprovados.
3. A proteção de raiz durável foi integrada pelo PR #417: novas aberturas negam
   filesystem efêmero e regras efetivas de `tmpfiles`, e preservam o binding no
   lifecycle. A prova atual cobre interrupção/reabertura simulada, não reboot real
   nem homologação produtiva; estado `INTEGRATED / NOT_PRODUCTION_HOMOLOGATED`.

## F. Plano único de conclusão

1. Preservar a proteção durável integrada no PR #417 sem reabrir seu desenho.
2. Fazer a admissão chamar o validador puro existente do retirement antes de
   publicar, mantendo os perfis fechados.
3. Ensaiar em isolamento a mesma autoridade operacional passando por admissão e
   retirement, com negativas idênticas por schema, identidade, root policy e PM2.
4. Homologar API-only, API+frontend e API+frontend+worker sem alterar seus bytes
   semânticos.
5. Considerar concluído somente com CI integral, receipt terminal legítimo,
   builder/worktree ausentes por efeito atribuído e custódia preservada.

## G. Próxima implementação mínima

A próxima mudança deve tratar somente a paridade de schema admissão → retirement:
extrair sem alteração semântica o validador puro `validate_operational()` e suas
dependências de policy para um módulo versionado compartilhado, autenticar esses
bytes nos dois consumidores e provar produtor → admissão → retirement com o mesmo
payload. Perfis API-only, API+frontend e API+frontend+worker devem permanecer
byte-semanticamente compatíveis. Não são necessários novo pipeline, novo driver,
novo framework ou exceção ED74.
