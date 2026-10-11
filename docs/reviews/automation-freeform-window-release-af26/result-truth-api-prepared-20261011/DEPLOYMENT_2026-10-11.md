# Result Truth — implantação API concluída em 11/10/2026

**DEPLOYED TECHNICALLY — complete/switch, exit0.** Preparação autorizada `1216c9bfe8272076609727d2dc9e025d8aa20a39`; runtime `2ed9dccc490ad1bb9501f387efb09eebe574fef3`. [Resultado sanitizado e hashes das evidências](deployment-result.json). [Preparação e comandos preservados](README.md).

## Execução e versões efetivas

Política V4 `620a119f…ee62f` instalada na sessão sudo do owner pelo instalador `0554745e…fa60e0`; política antiga `d3bd2043…b4b6f7` arquivada, helper `8de358fd…1b212` e regra literal sudoers preservados. Baselines, JSON/ecosystem dos três modos, manifests, ownership/modes/root chain/visudo/inspect PASS com fase nula e gates falsos. Nenhuma política frontend ou helper foi substituído.

Conferência imediata pós-instalação **21:32:05 UTC /18:32:05 Fortaleza**: origens/configs/identidades, proxy DB, inventário congelado, auth/sessões, recuperação.6/recibo e guarda38 sem tarefas/markers PASS. Dump adicional capturado off-host **21:25:56 UTC /18:25:56 Fortaleza**; hash `8c25745e14bea57a5d4d2963fc46e7056e112da7b960a26bd729bb6280717578`. Catálogo íntegro, restore PostgreSQL exclusivamente local isolado70 tabelas e comparação integral migrations/recibo/seis Outbounds/job com a fonte READ ONLY PASS; banco temporário removido. Tar privado dos controles/auth/saved/fallback íntegro. Bindings e manifests preparados não foram adaptados: backup pré-janela é prova suplementar preservada separadamente. Código, schema e ferramentas da prova anterior continuam iguais.

Capacidade/WAL **21:25:33 UTC**: 2.299.195.392bytes disponíveis ao executor e filesystem PostgreSQL, piso2.131.755.008, WAL80MiB, sem slots/replicação, archiveoff. Leitura final2.258.395.136bytes, margem126.640.128bytes. PASS delimitado ao piso observado; produção permaneceu viva. Sem limpeza, mudança de retenção, restore produtivo ou garantia de pico máximo.

| Transição | UTC | Fortaleza |
|---|---|---|
| Início instrumentado da contenção |21:33:07.748|18:33:07.748|
| Stop API/worker + saída comprovada concluídos |21:33:18.687|18:33:18.687|
| Partida única API concluída |21:33:21.147|18:33:21.147|
| Partida única mesmo worker concluída |21:33:24.906|18:33:24.906|
| Retirada efetiva da barreira — helper exit0 |21:33:45.572|18:33:45.572|
| complete/switch, controles restaurados |21:33:49.251|18:33:49.251|

**Contenção medida37,824s**, do evento `containment_begin` ao retorno exit0 do helper `unfence`. Essa medida inclui overhead das ações; não é latência de cada request/tenant. Uma partida por API/worker; zero partidas de retorno. Certificados novos de saída/ownershipDB foram consumidos e preservados. Prazo15min não atingido. Não houve start repetido, retorno, bypass ou abertura de campanhas.

API efetiva: `/opt/re7online/releases/campaign-result-truth-2ed9dccc-20261011T184000Z/apps/whatsapp-agent`, PID18413/ticks2153880211/restart0, `CAMPAIGN_BUILD_ID=2ed9dccc490ad1bb9501f387efb09eebe574fef3`. `dist/http/routes.js` ativo SHA `0118b7d3d4a9ca619863b4dd6c52d41717f1454049e8112c974238836163402f`; conferência integral final1.893arquivos/2symlinks/6.944dependências PASS, só esse runtime e fonte correspondentes diferem da base preventiva. Retorno preventivo completo preservado.

Mesmo worker afbb: `/opt/re7online/releases/worker-minimal-reactive-afbb7455-verified/apps/whatsapp-web-worker`, PID18585/ticks2153880582/restart0. Frontend3227 **PID4121573/ticks2150012070 e BUILD_ID `8OqIZZxaW7_ogf6h7AVoe` preservados**, sem stop/start. Daemon18676 preservado. Health DB três caminhos HTTP, controle HTTP worker, auth/sessões/flags, cron/crontab/boot, supervisão permanente frontend/leitura root duas amostras, saved/fallback versus configs efetivas, barreira ausente PASS. Unit PM2 bootenabled conserva o estado prévio ActiveState=inactive/UnitFileState=enabled; não foi iniciada incidentalmente.

## Aceite discriminado

| Critério | Resultado | Evidência/limite |
|---|---|---|
| Composição e implantação técnica |PASS|Compilado ativo exato, full manifests, complete/switch, processos/DB/controles|
| Result Truth produtivo, lista → detalhe → nova lista |PASS|Leitor canônico READ ONLY RepeatableRead, queryExit0, sem scheduler/provider; lista filho/controlador e detalhes6/11,6delivered reportados+5pending,0blocked; nova lista igual|
| Ausência de duplicação e preservação histórica |PASS no escopo|Seis Outbounds únicos posições1–6, rawPayload metaStatus delivered; posições7–11 sem Outbound observado; recibo intacto e jobqueued/operational_suspension sem lease|
| Interface/polling na sessão legítima owner |PASS específico|Owner confirmou as três leituras com6 entregas reportadas/5pendentes, sem duplicação/mistura; observou status Enviando, coerente com o job suspenso|
| Aceitação antes do CRM e webhook antes do CRM |Aceites anteriores preservados|Testes/compilados e limites já documentados; nenhum novo caso natural ou falha/webhook fabricado nesta janela|

Status de transporte dos seis Outbounds permanece **SENT**; entrega reportada provém de `rawPayload.metaStatus`/resultados canônicos. Não se transforma SENT em confirmação humana. A verificação do dump preservou exatamente essa distinção; uma asserção auxiliar local inicialmente esperava equivocadamente `delivered` no campo de transporte e foi corrigida conforme o schema/read model, sem alterar produção/bindings. Restore e comparação live/restored já tinham concluído iguais; diagnóstico local preservado.

**Guarda fechada38**, `tasks:{}`, hash do ledger inalterado, sem lock/.uncertain/ledgerFault. Recuperação.6/tarefa integral arquivada/disposição CRM histórica preservadas; job continua suspenso e campanha/lote conservam sending/running/queued. Resultado conhecido6delivered+5pendentes não autoriza terminalizar, reenviar ou retomar os cinco restantes. Inventário congelado não é certificado global de drain.

## Diagnósticos e controles de encerramento

Duas amostras `worker_capture_churn` negadas antes da retirada; terceira observação consistente passou dentro do limite3. Renovação final antes do helperunfence passou na primeira tentativa. Capturas anteriores e logs privilegiados stdout/stderr/exit foram preservados off-host. Não se atribuiu identidade nova à alternância R/S nem se ignorou leitura incompleta.

Os cinco gates voltaram a falso, com histórico dos valores true arquivado. A primeira gravação false usou espaços diferentes no JSON e produziu recusa do checksum superior para esse único arquivo. Arquivou-se essa serialização e restituíram-se **os bytes falsos originais atestados** (`c4649d78…865b`); nenhum valor/hash esperado/manifests foi alterado para aceitar drift. Conferência final de16entradas PASS. `execution-authorized=false`; intents/certificados da tentativa permanecem consumidos, nunca reutilizáveis.

Evidências privadas: dump, auth/configs, ledger, leitores, diagnósticos e geração operacional final integral off-host. Sem envio, claim, replay, apply/ack, abertura, retomada, migrations, limpeza ou reparo. Frontend3227 e recuperação.6/setembro CLOSED preservados. CSV/Syer, suporte internacional, multilote/AUTO naturais e CRA-PR continuam separados.

**Aceite Result Truth no escopo observado concluído:** lista/detalhe/polling canônicos e confirmação específica do owner PASS. O status **Enviando** permanece conforme os estados persistidos sending/running/queued do job suspenso; não é indicação de seis submissões ainda desconhecidas. A disposição das cinco posições restantes exige decisão própria, sem retomada ou terminalização nesta janela. Contingências/históricos e demais frentes continuam separados.
