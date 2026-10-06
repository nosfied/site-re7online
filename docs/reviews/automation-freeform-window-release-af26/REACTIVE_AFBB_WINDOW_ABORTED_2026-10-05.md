# Contingência reativa afbb — tentativa abortada antes da contenção

**ABORTED BEFORE CONTAINMENT / NOT DEPLOYED.** Execução única autorizada da preparação publicada em `9e94738f8f9648430736213c6a170ba11996e95b`, em 05/10/2026 Fortaleza. API afbb e worker reativo não foram iniciados. API/worker b9 continuaram atendendo; frontend af26 preservado. Não houve parada/restart, envio de validação, reparo, restore produtivo ou alteração de configuração de tenant.

## Instalação e gates

Deifson executou o bloco publicado: política anterior arquivada, política nova root:root 0600, helper root:root 0644 e sudoers root:root 0440. Visudo PASS; inspect confirmou política `e8e431efdb99655a0e1f63aa91cba6eae25dedb5ca8910762376408006c4ab98`, fase nula e processos de origem vivos. Helper permaneceu `8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212`; nove comandos sudo inalterados. Original da política preservado em `incident-6683-window-policy.pre-reactive-afbb-010000.json` no diretório root-owned do helper.

Antes da execução, reconferência real dos hashes de fontes/compilados API, tar/manifesto completo e closure do worker em extração limpa, symlinks operacionais, Prisma/schema/lockfile, modos, sequenciador, bindings de PID/ticks/env, proxy vivo, backup/restore e controles: PASS às 01:15:22 UTC. Cinco gates habilitados somente após instalação/inspect e essa reconferência; baseline anterior de gates preservado. Backup e restore são os já verificados nessa preparação; não houve novo dump/restauração por rotina.

## Sequência e erro demonstrado

| UTC 06/10 / Fortaleza 05/10 | Ação / resultado |
| --- | --- |
| 01:15:48.586 / 22:15:48.586 | Baseline capturado; guarda aberta geração 29. |
| 01:15:49.125 / 22:15:49.125 | CAS fechou guarda geração 30; drain de campanhas comprovado; preflight emitido depois do fechamento e passou. |
| 01:15:50.767 / 22:15:50.767 | `prepare-containment/execute` recusou; exit code 1. |
| 01:15:51.363 / 22:15:51.363 | Recuperação `prestop`: `abort-prestop` PASS e guarda restaurada aberta geração 31. |

**Causa comprovada:** `switch/delegated.py::DelegatedControls.prepare()` acessa `self.initial['supervision']` (linha 324), mas o `baseline.private.json` preparado contém apenas `auth`, `connected`, `flags`, `frontendBuild` e `observedAt`. Resultado: **`KeyError: 'supervision'`**, antes da instalação do crontab de janela e antes de `privileged enter`.

A cadeia efetiva foi `sequencer.action → Bridge.protocol → delegated.py execute → DelegatedControls.prepare`. Stdout vazio, stderr/código de saída preservados em `window/protocol-output.private.jsonl`; erro resumido no journal. Não houve `containment_begin`, `stop-pair`, start-intent ou start de sucessor. A ordem CAS → prova → preflight funcionou; o defeito é a composição incompleta do baseline para a etapa seguinte. Não é falha de provider, artefato funcional, PM2 ou renovação de captura.

Os quatro testes de composição anteriores usavam estado injetado e não exercitavam essa leitura real do baseline por `DelegatedControls.prepare`; portanto **não comprovaram esse contrato completo**. A evidência anterior continua limitada ao escopo registrado, sem reatribuição de PASS à cadeia recusada. A correção necessária é completar/validar o contrato de baseline de todos os consumidores e ensaiar esse caminho real antes de produzir outra tentativa. Não inserir um default permissivo nem editar o baseline consumido para relançá-lo.

## Estado final comprovado

Leitura às **01:16:30 UTC**: mesmos PIDs/ticks e zero reinícios, guarda aberta geração31 com `tasks: {}` vazio, scheduler habilitado, quatro sessões conectadas/cinco registros auth. Jobs/grupos/leases/sendingScheduled zero no recorte; não representa drain do worker. Proxy, cron de backup, crontab deploy, boot inactive/enabled, PM2 saved/fallback e barreira ausente conferidos contra baseline. Health API/DB e controle HTTP autenticado do worker PASS às **01:17:04 UTC**.

| Componente liberado ao tráfego | Identidade preservada |
| --- | --- |
| API b9 `b9b58177880e729854580def1180f3edb2fb83e8` | PID2980770 / ticks2099843172 / reinícios0 |
| Worker mínimo b9 `worker-minimal-hybrid-b9b58177-verified-v3` | PID2980928 / ticks2099843568 / reinícios0 |
| Frontend af26 | PID2537692 / ticks2081554427 / reinícios0; BUILD_ID `J5cHyVKiKEI5xxiGBY5If` |

**Contenção e interrupção de processos: não ocorreram.** Admissões de campanhas ficaram fechadas por aproximadamente 2,24 segundos entre fechamento e restauração; API/worker/frontend não saíram. Horizonte de escalonamento de 15 minutos de contenção não foi iniciado. Controles já intactos foram reconferidos, sem retorno binário necessário. Owner confirmou nesta rodada que sua sessão e Inbox/CRM carregam normalmente após recarregar somente em leitura. Essa verificação de atendimento não é aceite funcional da contingência afbb.

## Preservação e próximo passo

Preparação consumida: `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb7455-20261006T010000Z`. Política/fase, provas, intents/histórico, capturas e gates habilitados permanecem preservados. **Não relançar esta preparação**, apagar marcadores ou reutilizar nonces. A autorização funcional não foi revogada; o bloqueio técnico precisa de correção local e ensaio do contrato completo antes de nova preparação com bindings/provas próprios. Nenhum comando privilegiado adicional foi solicitado nem sudo ampliado.

Tar candidato permanece íntegro: `8b67292578090a2f564e4a9bf399b002e667bba723c936859fc438aa1221f5c8`. Não reconstruir o worker ou repetir suítes funcionais para corrigir esse contrato operacional. Retorno previsto continua API/worker b9; frontend e DB/auth atuais preservados.

Evidências privadas capturadas, não versionadas:

- Journal SHA-256 `653bcc557bb37c1ab0f2343f9ce6ebfe113f83233d7045ba351e93ede3312fb7`.
- Diagnóstico protocol stdout/stderr/exit SHA-256 `bbb255caaed7e318783c83366151b4bdc3563f74f8b0dbe7894dcdee57d54388`.

Audiência CRM, CSV e aceite específico CRA-PR continuam pendentes; ciclo avulso demo aceito não cobre essas frentes. Históricos intactos e reparo de setembro CLOSED. Contingência reativa afbb permanece NOT DEPLOYED / aceite funcional não exercitado.

Publicação somente documental na branch `review/campaign-recovery-20260926`, com exclusão de auto-deploy reconferida; sem merge. Política/configurações, tar, dump, credenciais, auth e logs privados ficam fora do Git.
