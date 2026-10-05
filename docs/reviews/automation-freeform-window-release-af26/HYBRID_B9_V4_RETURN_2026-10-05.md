# b9/V4 — tentativa e retorno comprovado, 05/10/2026

**RETURNED TO COMPATIBLE SOURCE / b9 NOT DEPLOYED / OWNER VALIDATION PENDING.** Autorização de Deifson às 09:42 Fortaleza; execução única sobre a preparação `incident-6683-v4-hybrid-b9b58177-absent-20261005T121000Z`, publicada em `d7fa7f43`. O helper/política revisados foram instalados; o candidato não foi liberado ao tráfego. A tentativa consumida permanece preservada e não pode ser reexecutada.

## Integridade e instalação

Os hashes, fontes/compilados, tar exato, symlinks, Prisma, bindings, identidades PM2/proxy e backup/restauração da [preparação final](HYBRID_B9_V4_FINAL_PREPARATION_2026-10-05.md) foram reconferidos sem rebuild. Helper instalado SHA-256 `8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212`; política `2f8f384602e66dd5050cf37cf1558ce7b137deb115a6001fa3cc8c5edf6eb6e7`. Cadeia root-owned, sem symlinks/escrita por deploy, helper 0644/política 0600; sudoers literal dos mesmos nove comandos e visudo passaram. Originais arquivados. `inspect` confirmou política nova, fase nula e origens vivas antes dos gates.

Tar validado SHA-256 `236c1d502df5767eb7cde726ce0d7ae7c6e8200489cac4d09a417b08d98c0e98`; dump persistente `window/database.dump`, 26.508.828 bytes, SHA-256 `535601239db17240c6bac4f266e251f7a7ed2902e57c3be350d566221cc1fa09`. Restore isolado/checksums já verificados foram reutilizados após reconferir integridade; sem restore produtivo ou novo backup desnecessário.

## Sequência observada (Fortaleza, UTC−3)

| Checkpoint | Horário/evidência |
| --- | --- |
| Guarda fechada por CAS, drain comprovado | 10:04:55; geração 25→26, tasks objeto vazio; prova somente após fechamento |
| Início da contenção | 10:04:56; nft/cron/boot controlados |
| Saída do par original comprovada | 10:05:09; certificado, descendentes/sockets e DB/locks conforme V4 |
| Start API b9 / worker mínimo b9 | 10:05:12 / 10:05:16; um start por processo |
| Protocolo de preparação para unfence passou | 10:05:20; saved/fallback salvos, **não equivale a retirada nft** |
| Helper recusou unfence do candidato | 10:05:21; stderr do helper não foi persistido pelo Bridge, causa específica desta primeira recusa não comprovada |
| Retorno selecionado; candidatos saíram | 10:05:24 / 10:05:33; modo return, saída novamente certificada |
| API 879 / worker af26 iniciados | 10:05:36 / 10:05:39; sem repetição de start |
| Helper recusou unfence do retorno | 10:05:44; diagnóstico root posterior confirmou worker_capture_sockets_drift |
| Barreira ausente comprovada | 10:11:19; prova nova consumida de verify-unfenced |
| Guarda e controles restaurados | open auditado 10:11:21, geração 27; restore-controls comprovado 10:11:23 |
| Leitura final | 10:12:39; conjunto compatível e sessões conferidos |

Contenção até a prova de ausência: aproximadamente **6min24s**. Não foi atingido o horizonte de escalonamento de 15 minutos. A indisponibilidade efetiva por usuário e a perda/retry integral de inbound/outbound/auth não foram mensuradas; os tempos não são garantia de entrega.

## Bloqueio e conclusão do retorno

No retorno, o diagnóstico root executou as funções reais do helper sem ação mutante: guarda PASS, targets PASS, barrier PASS, capture `worker_capture_sockets_drift`. A captura tinha nove sockets; o mesmo worker vivo tinha 18, com PID/tempo de início/PGID/SID preservados. A recuperação das sessões pode abrir sockets entre captura e unfence; a igualdade exigida é pontual. Não se atribui automaticamente esta causa à recusa inicial do candidato, cujo stderr não foi capturado.

A captura do retorno foi arquivada integralmente (`worker-before-unfence.sockets-drift-preserved.private.json`, SHA-256 `0217b3f803d12bfdcbad6b84332b47133a510ec363dacf5f528d5ed2dadf939a`). A primeira recaptura foi negada por `worker_capture_changed`, antes de emitir arquivo novo ou retirar nft. O comparador do sequenciador inclui estado transitório R/S; o stderr não registra qual campo mudou, portanto a causa específica dessa recusa permanece indeterminada. Houve ainda erro de import do driver antes de qualquer ação, corrigido somente no caminho de imports do driver.

A conclusão assistida do retorno reconferiu as mesmas identidades, árvore por PID/tempo, releases, guarda e barreira; exigiu duas leituras consecutivas com sockets/árvore iguais e rejeição de zumbi. Preservou a captura antiga e gravou nova captura dos 18 sockets. O helper **sem alteração** revalidou seus critérios exatos e retirou nft. Em seguida passaram verify-unfenced, validate, open, restore-controls root/protocolo e check-absent. Nenhum start, stop ou intent consumido foi repetido; nenhum helper/gate foi relaxado. O sequenciador original terminou exit 1 com recovery_blocked; o sucesso posterior pertence à conclusão assistida, não a recuperação automática já implementada.

Antes de outra tentativa: incorporar e ensaiar renovação explícita da captura sob a mesma identidade, sem perder originais; eliminar comparação R/S como identidade no ponto de recaptura; persistir stderr/exit code das ações privilegiadas com saída sanitizada. Sem nova janela nesta rodada e sem atribuir aos testes anteriores cobertura destas lacunas observadas.

## Estado efetivo e validações

| Componente/controle | Resultado |
| --- | --- |
| API | `879cb1faa88493cd78dd789b71f85043d6c8ff9c`, PID 2958776, zero reinícios, watch=false |
| Worker | `worker-bf5f1d76-f06d49cb-91230f88-b66bb89a-af26-window`, PID 2958996, zero reinícios, watch=false |
| Frontend | af26 `af26f48a9c309b24ec4d23cfa97cc1e407c09d98`, PID original 2537692, zero reinícios; BUILD_ID `J5cHyVKiKEI5xxiGBY5If` |
| Health/DB, público/local, frontend e controle HTTP do worker | PASS na validação do retorno; leitura final PASS |
| Sessões/auth | Quatro sessões conectadas/cinco registros auth; identidades iguais ao baseline; não prova ausência de resultados externos incertos |
| Guarda | Aberta, geração 27, tasks vazio, sem ledgerFault |
| Scheduler | Configuração real disabled=false preservada; não se afirma novo tick natural medido nesta rodada |
| Saved/fallback | Scripts/cwds de retorno compatíveis, watch=false |
| Cron/boot/nft | Cron backup e crontab deploy iguais ao baseline; boot inactive/enabled, sem start; barreira ausente |
| Inbox/CRM autenticados | Deifson confirmou: “sim carregou tudo.” Apenas leitura |
| Funcional b9/híbrido | NOT EXERCISED nesta janela; candidato não liberado |

DB/auth atuais foram preservados. Sem provider call provocado, campanha de teste, reparo dos quatro registros históricos, fusão de conversas, reenvio, migration ou mudança de configuração de tenants. Frontend não foi parado. Backup/configurações/provas/intents/certificados/logs privados permanecem fora do Git. Campanhas/CRA e aceite funcional continuam pendentes; SECULT encerrada, inatividade no Guia pausada, reparo de setembro CLOSED. A atualização documental não autoriza outra janela nem é um deploy.
