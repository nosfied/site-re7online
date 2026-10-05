# b9/V4 — implantação técnica de 05/10/2026

**DEPLOYED TECHNICALLY / OWNER VALIDATION PENDING.** A preparação `140fd813c7a2517e2fba3e8c9e41d1c595049446` foi executada uma vez, sob autorização existente, em `incident-6683-v4-hybrid-b9-capture-20261005T143500Z`. Este registro sucede o [estado preparado](HYBRID_B9_CAPTURE_COMPOSITION_PREPARED_2026-10-05.md), preservando seu histórico, manifests e ensaios. Não houve retorno, repetição de start, reparo histórico, envio provocado, migration ou restore produtivo.

## Releases efetivas e integridade

- API **b9b58177880e729854580def1180f3edb2fb83e8**, PID **2980770**, start ticks `2099843172`, zero reinícios, script/cwd da release isolada conferidos contra a configuração candidata.
- Worker **worker-minimal-hybrid-b9b58177-verified-v3**, PID **2980928**, start ticks `2099843568`, zero reinícios. Exclusivamente o tar validado **236c1d502df5767eb7cde726ce0d7ae7c6e8200489cac4d09a417b08d98c0e98**, com 7.036 arquivos/11 symlinks internos conferidos. Sem reconstrução ou worker completo da árvore da API.
- Frontend af26 **preservado**, PID **2537692**, start ticks `2081554427`, BUILD_ID **J5cHyVKiKEI5xxiGBY5If**, zero reinícios e sem stop/start.
- Helper inalterado **8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212**; apenas a política fresca **e57320ee60e00d4f641a311e64e8acde94cd2f06081da5d8ee4fdf540c65ef7f** foi instalada por Deifson, arquivando a anterior. Owner confirmou hash, cadeia root sem escrita indevida, helper 0644/política 0600/sudoers 0440, visudo e inspect de fase nula/processos vivos. Mesmos nove comandos sudo.
- Sequenciador **145cb7e3c2f2f0fc1baff5799c755e1ea5e6bc63aa2220b95b10392c5cc50460**, logger **93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a** e manifests completos da preparação reconferidos antes de habilitar os cinco gates.

Backup utilizado: dump **c17c45122a49e6945a7adbd5f05712e5d38a6011f5f56a05f5849dabfcd06a19**, 26.714.173 bytes, 614 objetos. Mesmo dump restaurado em PostgreSQL16.15 isolado às 14:48:43 UTC, 60 migrations concluídas/checksums compatíveis, banco temporário removido/servidor parado. Integridade do dump, arquivos auxiliares e resultado de restore reconferida imediatamente antes da janela. DB/auth atuais preservados; não houve novo backup redundante nem restore sobre dados novos.

## Checkpoints reais

Horários em UTC; Fortaleza corresponde a UTC−3. Tempos extraídos do journal do executor, não estimativas de SLA.

| Checkpoint | UTC | Fortaleza |
| --- | --- | --- |
| Guarda fechada por CAS, geração 28 | 15:26:54 | 12:26:54 |
| Início da contenção / enter | 15:26:55 | 12:26:55 |
| Contenção confirmada | 15:26:57 | 12:26:57 |
| Stop-pair único concluído/certificado | 15:27:08 | 12:27:08 |
| API candidata iniciada/verificada | 15:27:10 | 12:27:10 |
| Worker mínimo iniciado/verificado | 15:27:14 | 12:27:14 |
| Captura renovada e root unfence | 15:27:29 | 12:27:29 |
| Conclusão, guarda aberta geração 29/controles restaurados | 15:27:35 | 12:27:35 |
| Conferência final independente somente leitura | 15:29:43 | 12:29:43 |

Contenção observada: aproximadamente **34 segundos**, incluindo verificação de saída, banco/locks, propriedade V4 e inicialização. Isso não mede toda indisponibilidade por sessão nem garante ausência de perda inbound/outbound/auth. O risco residual do shutdown antigo permanece; horizonte de 15 minutos não foi atingido.

Ordem efetiva: baseline → CAS/guarda fechada/drain → prova preflight na geração resultante → controle de iniciadores/contenção → stop-pair único → certificado de saída/zero backends e advisory locks → API → prova V4 fresca → worker → controle HTTP sob nft → captura/saved/fallback → autorização root → renovação explícita da captura → root revalidação/unfence → validação completa → admissões/cron/boot.

Duas capturas foram preservadas: inicial **d444e52e419479174ff41ac76109b628062a2d7ac54ec364c2aa2bb5e5dfe692**, renovada **5234640b45479a497192ddb7f907757e4783ebfee23ac6d0333fe0767b0e588c**. Cada renovação obteve consistência na primeira tentativa. Não houve recusa privilegiada: todas as ações tiveram exit 0, stderr privado preservado; sequenciador terminou 0. Nenhum marcador/intenção foi apagado ou reutilizado. Modos de retorno não foram consumidos.

## Verificação e limites

- Health/DB local3001, rewrite frontend e API pública: HTTP200/ok/db ok, após retirada da barreira. Controle HTTP autenticado do worker passou também antes da retirada, fora das portas bloqueadas.
- Identidade real/configuração reduzida/watch=false, frontend/BUILD_ID e três processos online sem reinícios conferidos. Saved/fallback idênticos e apontando aos candidatos compatíveis.
- Quatro sessões connected/cinco registros auth antes e depois. Isso comprova continuidade observada do estado, não todas as operações em andamento.
- Guarda disponível, aberta **geração29**, tasks `{}`, sem falha de ledger; zero jobs/grupos/leases/agendamentos em envio no recorte final. Scheduler preservado habilitado (`CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=false`); inicialização `campaign.schedule.processor.started` observada. Não atribuir validação de execução de campanha à ausência de trabalho.
- Barreira ausente, cron de backup/crontab restaurados byte a byte, boot **inactive/enabled**, sem start do serviço de boot.
- Deifson confirmou, após recarregar sua sessão legítima: **“sim carregou normalmente.”** Inbox/CRM e sessão: PASS somente leitura. Não é aceite funcional b9/híbrido.

| Cenário | Estado |
| --- | --- |
| Implantação técnica, identidades, controles, saúde e sessões | PASS |
| Inbox/CRM autenticados somente leitura pelo owner | PASS |
| Continuidade híbrida/aliases e destino humano com nova interação autorizada | NOT EXERCISED nesta janela |
| META_CLOUD puro e WEB_SESSION funcional após esta troca | NOT EXERCISED nesta janela |
| Intervenção humana concorrente/status atrasados | Evidência local preservada; NOT EXERCISED produtivamente nesta janela |
| Saneamento das quatro conversas históricas | NÃO EXECUTADO; frente separada |

Retorno disponível continua API **879cb1fa**/worker mínimo af26, frontend preservado e DB/auth atuais. Nova operação exige preparação/provas/política compatíveis com os PIDs atuais; **não reexecutar esta preparação consumida**. Contingência worker ausente não foi necessária. Não remover observador/delegação enquanto procedimentos de retorno dependerem deles. Erros/JSON/configurações/dump/auth/capturas e journal operacional completo permanecem privados; publicação somente documental sanitizada.

Próximo passo: owner indicar caso novo autorizado para acompanhamento funcional, sem repetir os quatro históricos nem envios por iniciativa do executor. Campanhas/CRA aguardam validação funcional do owner; SECULT encerrada, inatividade no Guia pausada e reparo de setembro CLOSED. Nenhuma chave/configuração de tenant foi alterada nesta janela.
