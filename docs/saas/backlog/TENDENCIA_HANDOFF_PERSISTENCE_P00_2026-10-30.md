# Tendência handoff persistence loop — P00

Status: `DEPLOYED_SANITIZED / OWNER ACCEPTANCE PASS / CLOSED`.

## Evidence and scope

The read-only audit of tenant `tendencia-modas`, controlled recipient ending
`3009`, found ten inbound and eight outbound messages. Recent inbound messages
had one automated response each, with no Meta retry, duplicate webhook or
provider failure. The user accepted human handoff and the system persisted
`handoff_confirmation.accepted` and `handoff_activated`, but the effective
runtime remained `BOT/NONE` without assignee, department or queue. The next
inbound re-entered AI and repeated the handoff offer.

The defect is platform-wide, not a Tendência-only branch. The accepted-handoff
path persisted the confirmation inbound and then attempted the human transition
with the pre-write `runtimeWriteToken`. The write fence correctly rejected the
stale token, while the caller continued to publish activation events.

## Required invariant

After an accepted handoff:

- the state returned by the confirmation write is the only input to the
  activation write;
- effective state is at least `HUMAN/PENDING|ACTIVE/WAITING`;
- missing attendant, department or queue cannot return the conversation to AI;
- `handoff_confirmation.accepted`, `handoff_activated`, realtime notification
  and the handoff reply are emitted only after the persisted state passes the
  invariant;
- a rejected transition emits only
  `handoff_activation.persistence_failed`.

No schema migration is required.

## Tenant configuration and visible flow

The September CRA incident was a UI hydration defect: a settings 404 prevented
an existing DB flow from rendering. That correction is already active. The
Tendência observation is different if PostgreSQL has no active entrypoint flow.
Do not recreate the CRA fix and do not clone Demo/CRA data implicitly.

Before a Tendência configuration write, an authenticated read-only plan must
prove:

- whether the intended behavior is AI-only or an active `ChatbotFlow`;
- the exact source definition and its hash if a flow is to be provisioned;
- tenant-owned department and operational queue;
- one active entrypoint after the operation;
- no mutation to Demo, CRA or any other tenant.

The operation must be dry-run first, tenant-scoped, idempotent and separately
authorized.

## Bounded capacity exception

The owner extended the P00 static-floor exception exclusively to this remaining
handoff/flow recovery front. It may waive only
`MINIMUM_BUILD_FREE_BYTES` for a time-bounded, target-bound build authorization.
It does not waive aggregate coexistence budget, operational reserve, inode
budget, immutable package verification, retirement preparation, global reviews,
single-build discipline or post-deploy retention. An external builder remains
preferred.

## Acceptance

Code acceptance:

- fresh write token reaches the activation write;
- stale/BOT/NONE result cannot emit activation;
- a route-less accepted handoff remains HUMAN/WAITING;
- other tenants and channels remain unchanged;
- backend build and directed regression pass.

Operational acceptance requires a separately authorized Tendência test proving
one acceptance, one human pending state, no AI re-entry and a visible
tenant-owned flow/route when configured. No Meta send is part of this PR.


## Checkpoint operacional — 30/10/2026

Fonte: execução relatada pelo owner/Codex local, sem inspeção independente da VPS
pelo editor. A correção #280 está integrada e sua CI 40981724130 passou 4/4.
A recuperação mínima anterior terminou COMPLETED 3/3; recibos no
[lifecycle](../DEPLOY_ARTIFACT_LIFECYCLE.md). Não reabrir essa retirada.

A admissão agregada passou; um único build terminou exit 0. A release foi instalada
inertemente e verificada integralmente, com 34.370 entradas. Ela ainda não está ativa.

| Identidade/evidência | Valor |
| --- | --- |
| Release | `immutable-059ea95a-vps-20261030T122714Z` |
| Target | `059ea95aaf73f3e143774d60a8fef4df88c7c0ba` |
| BUILD_ID | `pYwUYAQ0Hg8HcPcEvwRr6` |
| Capacity contract | `c9a1580373defc5be8eca24568273e5546441432f64434d9728c77ad6b15164e` |
| Override P00 emitido | `9595dd88f5dfce75661867a069bb45a1f4c948088d263a42a5a3cdf7903cf589` |
| Pacote (hash relatado) | `f8e06961db3e2ace0f24eef33d5ba856e633697f59b549f4682fccf5bdcc7b1c` |
| Tar | `5eef6f940406f30374175dacdd5341389ae1bb18a7168a7f32d8ec695766fe17` |
| Manifesto | `8e6ceea7ee5c4cd3c9e579ca32956a5472bc141f8ccfe391844a91f0be641441` |
| Índice | `6e0f8b0394bb674cced6ae6b1336fa3651b81d31e399328c75cf999a99211d77` |
| API entrypoint | `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1` |

A retenção prepare negou uma vez com
`GENERATION_RETIREMENT_DENY:operational_pm2_observation`: a fotografia omitiu
`observations.pm2.fingerprintSha256`. Não houve intenção/comandos/review de
retenção, preflight, transação, seleção, restart, save ou Meta. Produção relatada:
API 754281d3 (PID 1176373, restart 9), frontend aa9527cc (PID 1210937, restart 13),
worker e2e7 (PID 2233, restart 0), health local/público ok=true/db=ok e locks livres.
Saldo naquele checkpoint: 6.186.803.200 bytes; exige medição fresca para decisão futura.

### Próxima ação, com reuso obrigatório

1. Nova leitura operacional e custódia privada, preservando a fotografia negada.
   Calcular o fingerprint sobre PM2 jlist pelo algoritmo do consumidor autenticado;
   distinguir do SHA do executável. Recapturar current/dump/grafo conforme contrato.
2. Validar o schema inteiro e todos os predicados conhecidos do consumidor antes
   da nova invocação, incluindo modos, cópias do control plane e estado operacional.
3. Preparar retenção uma vez com a fotografia corrigida e destinos exclusivos,
   reutilizando contrato, lifecycle, pacote e release inerte desta geração.
4. Prosseguir ao preflight e à janela API-only conforme autorizações aplicáveis;
   revalidar capacidade, retorno, health e validade dos documentos temporários.
   O override emitido não é declarado vigente por este registro.
5. Fazer o aceite mínimo já definido, um save quando cabível e retenção da geração.

Não repetir build, extração ou instalação. Nenhuma criação de fluxo ou alteração
de configuração tenant-scoped foi demonstrada necessária. A nova leitura não
amplia autorização de deploy, envio ou exclusão. A lacuna preventiva da admissão
permanece no [P00-D](DEPLOY_PREPARATION_PREFLIGHT_CONVERGENCE_2026-10-29.md).

## Encerramento operacional — 30/10/2026

A geração anterior `059ea95a` foi rejeitada somente pela confirmação outbound,
revertida canonicamente e sanitizada. O diagnóstico confirmou
`late_reply_dropped`: a atribuição automática avançava o runtime humano e
invalidava o token anterior. O PR #289 corrigiu o fence e adicionou o evento
sanitizado `ai.orchestrator.handoff_confirmation.outbound_failed`.

A geração substituta foi construída uma vez e concluída sem rebuild após a queda do
transporte SSH. O produtor sobrevivente promoveu o pacote existente e publicou o
lifecycle `COMPLETE`.

| Identidade/evidência final | Valor |
| --- | --- |
| Release ativa | `immutable-fa63994a-vps-20261030T153352Z` |
| Target | `fa63994acd5655bd499a328679a0f8c11e0740e2` |
| Tree | `aa4cf6bedfc1c0cbd7bab5dcbda4f5ded06e0161` |
| BUILD_ID | `1b-P3r73eOn-H8gNJeas_` |
| Pacote | `c397b392ced3c3e676b028adb3cc1002c35f3baab4c62a199e0585e82644ca11` |
| Manifesto | `dd3fdf37f6182f616a6c0dc3ec49d35f0e7a60adb489630e9e77ab505f073f3d` |
| Índice | `b347956578e1652b4de104d031620a050860b57af2f238ffdc632b3848ab35e7` |
| Dump final | `440c5ed4631ff8715a33af0938bd032dff86451f0f79039273d067234d28b280` |
| Marker DEPLOYED | `99bdae5577e9f205ae030ed46770224e1dde6795b6a97fd3967fa3be24d50614` |
| Retention receipt | `d7c7630bb4ca7b9a9ee47fdb3fb45e726af0832120229faabaee9636657ac7fc` |
| Journal final | `cfb74cd7ad5c58bceaae1ca5b8b9f93d4186ad4c2592f4b9bf9039f0becf2f2c` |

### Aceite do owner

O teste novo no final `9614` passou integralmente:

- confirmação de encaminhamento entregue;
- estado humano e handoff corretos;
- presença na fila/Inbox;
- zero reentrada da IA;
- frontend validado;
- frontend e worker preservados.

`/app/chatbot` sem fluxo visual cadastrado permanece compatível com o
orquestrador AI-only da Tendência e não exigiu copiar fluxo de outro tenant.

### Fechamento

A transação terminou em `DEPLOYED_SANITIZED`: um único `pm2 save`, retenção
3/3, marker criado, health local/público `ok=true, db=ok` e lock canônico
removido. API permaneceu no PID 1371244/restart 12; frontend no PID
1210937/restart 13; worker no PID 2233/restart 0. Saldo final relatado:
8.012.804.096 bytes.

Não repetir build, preparação, preflight, ativação, aceite, save ou retenção desta
geração. A próxima frente é o
[plano P00 de sanitização](PROJECT_SANITATION_AND_RETENTION_P00_2026-10-30.md).
