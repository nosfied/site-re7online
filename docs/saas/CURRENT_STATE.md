# Estado canônico do Converta

**DEPLOYED / PRODUCTION HEALTHY / META APPROVALS PENDING**

Esta é a entrada vigente de continuidade. A topologia operacional está no
[modelo de implantação](DEPLOYMENT_OPERATING_MODEL.md), e a implantação ativa está
no [registro estruturado](releases/TEMPLATE_ADMIN_SYNC_ORDERING_2026-10-24_DEPLOYED.json).
Registros anteriores continuam no [índice documental](DOCUMENTATION_INDEX.md) como
histórico e retorno; eles não substituem este estado.

## Produção viva — observação de 24/10/2026

- Target ativo de API e frontend:
  `d7de6453aeab6d117e8d79a1dc3a0722875f39cc`.
- Release ativa: `immutable-d7de6453-vps-20261024T221500Z`.
- API: `/opt/re7online/current/api`, PID observado `118102`, start ticks
  `3652796`, entry SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend: `/opt/re7online/current/frontend`, PID observado `118502`, start
  ticks `3663031`, BUILD_ID `PkRjG2UDVfxCmwp-DKMQz`, Next direto em
  `fork_mode`, uma instância.
- Worker preservado no runtime `immutable-e2e7f17a-20261022T005110Z`, PID
  observado `2233`, start ticks `17758`, restart count `0`.
- Dump PM2 final:
  `5d9ae04d6df29856318992638a66deccd29a68719c129be47453d4fd4b757e13`,
  modo `0600`, persistido por exatamente um `pm2 save`.
- Dump de retorno preservado:
  `8168216ccd7421a3dd2df19459f12f11a7d490d497a376bdf97cf8e24c509f15`.
- Marker `DEPLOYED`:
  `1d2be9be3fd5e257700257988bb4cd946dac0f7cb47b6b3a4f861facedd7c543`.
- Aceite técnico: `2026-10-24T20:01:04-03:00`.
- Finalização: `2026-10-24T20:04:40-03:00`, America/Fortaleza.
- Journal final: `DEPLOYED`; lock canônico liberado.
- API local e pública: HTTP 200, `ok=true`, `db="ok"`.
- Login, Inbox, CRM, Modelos, Campanhas e asset: HTTP 200 por GET-only.

PIDs são observações datadas. Release, hashes, BUILD_ID, dump e marker são as
identidades duráveis; qualquer janela futura precisa revalidar os processos.

## Escopo e retorno

O build único ocorreu na VPS em worktree e saída isolados, com Node v20.20.0 e
npm 10.8.2, sem interromper os serviços vivos. A ativação promoveu API e frontend
por troca atômica dos caminhos `/current` e restart dos registros PM2 existentes
sem `--update-env`. O worker e a configuração tenant-scoped foram preservados.

O retorno imediato é componente por componente:

- API: `immutable-3630e16-vps-20261024T195842Z`;
- frontend: `immutable-ec2a9fde-vps-20261024T162005Z`;
- worker: permanece em `immutable-e2e7f17a-20261022T005110Z`.

Não houve migration, SQL mutante, chamada Meta, upload, submissão, sincronização,
campanha, importação ou envio durante a janela. A migration vigente de mídia
continua histórica e aplicada; para este deploy a classificação foi
`NOT_APPLICABLE_NO_SCHEMA_CHANGE`.

## Templates de Utilidade — leitura local

Uma consulta PostgreSQL local e `READ ONLY`, sem chamada Meta ou sincronização,
confirmou no tenant `demo-converta`:

| Template | Header | Estado local | Categoria/idioma | Identidade Meta | Template / solicitação / evento |
| --- | --- | --- | --- | --- | --- |
| `justa_confirmacao_agendamento_imagem_v1` | IMAGE | `pending` | UTILITY / pt_BR | presente | 1 / 1 / 1 |
| `justa_preparo_atendimento_video_v1` | VIDEO | `pending` | UTILITY / pt_BR | presente | 1 / 1 / 1 |

As duas solicitações estão em `submitted_to_meta`; as mídias estão `ready` e
possuem handle, sem que o valor seja publicado. `pending` significa submissão
confirmada e aprovação ainda pendente. Esta leitura não prova aprovação remota.

A homologação anterior de `video_previdencia_teste_20261024_v2` permanece como
submissão aceita com aprovação `PENDING`. A tentativa anterior
`video_previdencia_teste_20261024` permanece `failed`; sua causalidade histórica
continua `NOT_PROVEN`.

## Capacidade e retenção

A fotografia somente leitura de capacidade está em
[VPS_CAPACITY_AUDIT_2026-10-24.md](VPS_CAPACITY_AUDIT_2026-10-24.md). Ela classifica
candidatos para revisão, mas não autoriza remoção, arquivamento, retenção, alteração
de cron ou execução de scripts. Nenhum arquivo ou serviço foi alterado na auditoria.

## Rota operacional

A única instrução executável vigente é o [runbook canônico](DEPLOY_RUNBOOK.md).
O modelo é build once / promote the same artifact, com release imutável, seleção
API→frontend, worker apenas quando impactado, três amostras de readiness, smoke
GET-only, aceite e um único `pm2 save`.

Build no checkout/runtime ativo, `deploy-normal-release.sh`, Deploy V2, PR #190,
Next em `cluster_mode` e executores temporários em `/tmp` são históricos e
obsoletos. Instruções históricas de cron ou retenção descrevem o estado de sua época;
não autorizam instalação, reativação, alteração ou limpeza atual.
