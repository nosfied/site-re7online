# Estado canônico do Converta

**DEPLOYED / SINGLE VIDEO CAMPAIGN ACCEPTANCE PASS / GUARD CLOSED / PRODUCTION HEALTHY**

Esta é a entrada vigente de continuidade. A topologia operacional está no
[modelo de implantação](DEPLOYMENT_OPERATING_MODEL.md), e a implantação ativa está
no [registro estruturado](releases/CAMPAIGN_AVAILABILITY_MEDIA_ADMISSION_2026-10-26_DEPLOYED.json).
Registros anteriores continuam no [índice documental](DOCUMENTATION_INDEX.md) como
histórico e retorno; eles não substituem este estado.

## Implantação relatada em 26/10/2026

Fonte: relatório do Codex local encaminhado pelo owner, com hashes dos recibos
privados. O editor documental não realizou nova inspeção da VPS. O horário exato
de finalização não foi fornecido; não é inventado neste registro.

- Target API/frontend: `a959129e39a07c52881fb7f5cbf21a7f6f1a80ff`.
- Release: `immutable-a959129e-vps-20261026T023100Z`.
- API: `/opt/re7online/current/api`, PID 441355, ticks 16603839,
  entry SHA-256 `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend: `/opt/re7online/current/frontend`, PID 441646, ticks 16604558,
  BUILD_ID `CbNbnlr0VJVv5mME_hvxm`, `fork_mode`, uma instância.
- Worker: `immutable-e2e7f17a-20261022T005110Z`, PID 2233,
  ticks 17758, restart count 0; preservado.
- Dump final: `e54db82c63cea7200c4215ac16a923b0ec3d05a5e2bc0398c1bcb06ee3e68325`; exatamente um `pm2 save`.
- Marker: `9da2428b15f8eb8b307603556fffb0ef75536829109e4be282ce03caa19cdb80`.
- Recibo: `3567a10a165af03377ce912ed44f7628646a33cdfb33c70ffc597f926f353dc8`.
- Journal: `991d549a1bc7f93b88cd1b51e1fdafaef13162555e20eac2b2471566e0804240`.
- Health local/público: HTTP 200, `ok=true`, `db=ok`.
- Disponibilidade autenticada: HTTP 200, `ok=true`, `open=false`,
  `campaign_operations_closed`.
- Guarda fechada, zero tarefas; lock canônico livre e arquivo preservado.

PIDs e contagens são observações datadas, não prova de estado vivo futuro.

## Escopo, retorno e próximo ato

API/frontend foram ativados com o mesmo pacote canônico, sem rebuild, migration,
chamada Meta ou envio. A consulta autenticada pode atualizar metadados da sessão;
não deve ser descrita como ausência absoluta de escritas no banco.

O retorno de ambos os componentes é
`immutable-d7de6453-vps-20261024T221500Z`, com dump anterior
`5d9ae04d6df29856318992638a66deccd29a68719c129be47453d4fd4b757e13`.
Retornos transitivos e evidências anteriores permanecem preservados.

## Homologação manual posterior — 26/10/2026

Fonte: relatório do Codex local encaminhado pelo owner, sem nova inspeção da VPS
pelo editor. Uma campanha de vídeo no Demo para um destinatário controlado: um
upload, um job, uma submissão e uma aceitação Meta; campanha/job completed,
tentativa 1. CRM vinculado, webhook sent seguido de read, sem falha, pendência,
reconciliação ou retry. Telefone e IDs privados não são publicados.

Ao final: guarda fechada na geração 40, tarefas zero, drained=true, sem ledger fault,
zero jobs ativos/vencidos reclamáveis e resultados pendentes. Health local/público
ok=true/db=ok. Mídia e campanha preservadas. O hash anterior do ledger não identifica
este estado posterior; o novo hash do ledger não foi fornecido.

Índice privado da janela:
`d0e8cb9eee4977bdb2225413db5b738232788ffa450300c0f52e803bc2c3466f`.
Estado: **SEND_ACCEPTED_GUARD_CLOSED**. O aceite cobre esse envio de vídeo, não
IMAGE, agendamento, multilote ou uso amplo. Próximo ato: revisão do resultado e
decisão do owner sobre demais homologações/liberação operacional, conforme
[roteiro](CAMPAIGN_OPERATIONS_READINESS.md). Não repetir o envio de teste.

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
