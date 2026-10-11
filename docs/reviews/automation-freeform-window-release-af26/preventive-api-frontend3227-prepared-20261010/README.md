# Preparação consolidada: API preventiva sobre a26 + frontend3227

**PREPARED FOR REVIEW / NOT DEPLOYED.** Continuidade de `8f2e6024fb354eea8adabe79dc42e351d1cd74fd`. Produção permanece API a26 / worker mínimo afbb / frontend fa60 corrigido. Não houve instalação privilegiada, contenção, stop/start, promoção/save, abertura, envio ou nova recuperação histórica. Todos os gates continuam falsos.

## Escopo e fontes

A recuperação out.15/.6 está CLOSED: recibo e tarefa integral arquivada preservados, guarda **fechada38**, tarefas `{}`, job `queued/attempt1/operational_suspension` sem lease; lote `running`, seis resultados DELIVERED reportados e cinco posições .7–.11 sem submissão observada. Não terminalizar o job nem reinterpretar o congelamento como permissão de continuar.

[Prevenção aprovada](../guard37-local-proposal-20261010/PREVENTIVE_PROPOSAL.md), [fronteira webhook/CRM](../guard37-local-proposal-20261010/WEBHOOK_CRM_BOUNDARY_20261010.md), [recuperação encerrada](../position6-operational-preparation-20261010/README.md), [receita frontend3227 e provas anteriores](../frontend-3227b2d7-prepared-20261009/README.md). Contratos V4/PM2, observadores restritos e supervisão permanente existentes foram reutilizados.

A API foi composta a partir de `a26dbb0ed39f9484bbbb71c5e7c753d561f07b93`, cuja origem e arquivos foram conferidos contra a release ativa. Somente seis fontes e seus seis compilados mudam: campaignRunner/campaignAcceptedResult; webhook.controller/campaignProviderStatusPersistence; routes/campaignRecipientResultTruth. Os primeiros quatro vêm de `400b8b4b` (delta aceitação de `162edc79`); os últimos dois, do delta Result Truth de `3ca5efed`. [Patch mínimo](preventive-api-on-a26.patch), [proveniência por arquivo](api-overlay-manifest.json).

Não foi exportada a branch inteira. CLI histórico, disposição .6/ack, alterações alheias, schema/migrations/dependências/worker e expansão internacional não integram o candidato. CRM permanece obrigatório: resultado aceito durável e verificado precede CRM; falha CRM ainda suspende/preserva tarefa e fecha guarda. Status conhecido do provider persiste monotonicamente antes da materialização CRM, com pendência distinta. Result Truth distingue resultados duráveis, não fabrica entrega/recebimento humano.

## Artefatos exatos

| Artefato | SHA-256 / identidade |
|---|---|
| API overlay, 12 arquivos / 4.034.560 bytes | `b4a9a856eac456bfc5172056baa110272e5596dcee015e4f7af185500c8070c7` |
| API manifesto integral privado, 1.893 arquivos / 2 symlinks / 6.944 dependências | `a002bb781e0cd654c6273bffc261c2ca3070baf970cc0137cabfd184a8cc29fa` |
| API retorno integral, 8.821 arquivos / 11 symlinks | `fcc9e2260fa5a352dc182943ad34b1ad2131282353452341428752fc9486288f` |
| Frontend3227 tar preservado, 184.068.857 bytes | `9b54548e4a7763f5078ae0433aceb43a37567eccd988814dd82f2fab97229319` |
| Frontend manifesto, 23.795 arquivos / 31 symlinks | `32349250b8bd73fe30c37d761d43a47185a2c9b33c9e4715f5a25265dd581f60` |
| Frontend BUILD_ID | `8OqIZZxaW7_ogf6h7AVoe` |
| Retorno fa60 manifesto, 22.868 arquivos / 31 symlinks / 13 caches atuais | `378bb220d02e29e93ccd2edf4d83cb2e903912f5548dc498e28e6a4e914cd1bf` |
| Retorno fa60 BUILD_ID | `wBXX8kmp5RuCHCYt_ot8X` |
| CSS processado, 187.044 bytes | `1ddf8dca7f9965191239b7aef3b8ce92374ccf637ca421d3ad75a0cc964eab64` |

API inativa: `/opt/re7online/releases/campaign-preventive-a26-20261011T002421Z/apps/whatsapp-agent`. Retorno API: `/opt/re7online/releases/campaign-eligibility-recovery-final-reviewed-20261008/apps/whatsapp-agent`. Worker em ambos: `/opt/re7online/releases/worker-minimal-reactive-afbb7455-verified/apps/whatsapp-web-worker`, bytes funcionais inalterados.

Frontend inativo: `/opt/re7online/releases/3227b2d752110873f0eff4ee5253a6f06ca51549-front`. Retorno: `/opt/re7online/releases/fa60f0f6443f3e0a129dc707021cffdc408af817-front-css-17bd5fb8`. Tar já existente na preparação36 foi conferido, não reconstruído nem copiado novamente. Diretório36, diagnósticos, geração fa60 ativa/launcher/journals e referências saved/fallback permanecem intactos.

Manifestos públicos [API arquivos](api-files.public.sha256), [dependências/symlinks](api-dependencies.public.json), [grafo dos imports novos](new-imports-graph.json). O manifesto privado completo cobre `.env`; seu conteúdo não é publicado. `node_modules` do candidato aponta para as dependências atestadas da API de retorno e `.data` para o auth compartilhado: a release de retorno **não pode ser limpa enquanto referenciada**.

## Preparações novas e contratos operacionais

API: `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-preventive-env-v2-20261011T002421Z`.

Frontend: `/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-after-preventive-env-v2-20261011T002421Z`.

[Hashes completos](operational-hashes.json) cobrem sequenciador, três modos de 28 arquivos, controles/configurações, scripts/bindings frontend e políticas. JSON/ecosystem foram gerados juntos e validados nos três modos. Nenhum intent, certificado ou prova consumida foi copiado. A política da API não foi instalada: SHA `d3bd2043dfe56354165938075f03f6f180bf085b139b34f9c5abfd42adb4b6f7`. Frontend janela: `c67cf7327f236b4ad12ce34b7eee22f5251d2720958f7646ecce26a32746e121`; permanente: `ed28e68f46b768aa667df355121d2e27c0039de87582f9fa787dc127ba440a83`.

**Negativa preservada:** a geração inicial foi recusada por `environment_drift` na configuração de preservação do frontend. A API/worker tinham correspondência integral; o frontend ativo usa PM2 cluster, que injeta env JS depois do exec. `/proc/environ` conserva o ambiente inicial e o envelope `pm2_env`. O produtor havia usado a projeção PM2 da aplicação. A geração `env-v2` captura duas leituras integrais estáveis do ambiente efetivo, exige envelope válido e compara cwd/script/interpreter. Não houve relaxamento do checker. O snapshot é somente para preservação da origem na V4 API; não é usado para iniciar frontend. Geração inicial e falhas de laboratório permanecem como evidência.

O classificador antigo de trabalho esperando `attempt0/scheduled` não descreve o job suspenso atual. [frozen-work.cjs](frozen-work.cjs) exige inventário global exato, receipt/ref/hash e audit de acknowledgement exatos, guarda38 fechada/tarefas `{}`, sem markers/lease ativo. Classifica explicitamente queued/attempt1/operational_suspension + running/sending congelados; não ignora trabalho desconhecido ou leases expirados ainda vinculados. O job terminal histórico bloqueado com metadados de lease expirado é inventariado e comparado, sem ser apagado. Esse resultado não é um certificado de drain nem autorização de retomada.

A baseline inicial do frontend é verdadeira **antes da API**. Depois de uma V4 `complete/switch`, o [capturador de fase](capture-frontend-phase.py) arquiva baseline/bindings iniciais, exige certificates dos novos API/worker e observação permanente atual, compara preservações e grava a baseline efetiva **após API**. Não inventa PIDs futuros nem adapta a preparação36. Recusa/arquivo parcial bloqueia a parada frontend. Se a API retornar, não prosseguir automaticamente ao frontend usando expectativas de sucesso.

## Provas executadas e reutilizadas

| Conferência | Resultado / alcance |
|---|---|
| Compilação API Node20.20.0 e check dos seis módulos | PASS; sem novos diagnósticos tsc |
| Comparação compilado local versus pacote VPS | PASS: 264 módulos runtime idênticos, nenhum ausente/divergente |
| Testes compilados exatos com provider sintético/PG isolado | PASS: aceitação1, webhook/CRM5, Result Truth3; nove testes, sem provider real |
| Schema/Prisma/package/lock versus retorno | PASS bytes iguais; nenhuma migration |
| Producer real de suspensão → PG READ ONLY → classificador | PASS + 18 negativas injetadas; não são ensaios nft/OS |
| Snapshot frontend com Node20/PM2 6.0.14 cluster reais | PASS: ambiente inicial aceito/projeção errada negada pelo System.check_config efetivo |
| Contrato de transição da baseline frontend | PASS unidade sintética/8 negativas; produtor real recusou chamada antes de API complete, sem mutação |
| Captura positiva real após futura API complete | NOT EXERCISED nesta preparação: depende da execução futura, será gate antes da parada frontend |
| Frontend pacote/CSS/retorno na VPS sem start | PASS; arquivos, symlinks, referências CSS e BUILD_ID |
| Browser/estilos calculados/Node20/partida única/retornos/supervisão/observadores | Provas anteriores do tar exato e procedimento reutilizadas, sem atribuir nova execução nesta rodada |

[Resultados](verification-results.json), [comparação runtime](compiled-base-comparison.json). Reprodução PM2: `python3 test_preserved_frontend_pm2.py /caminho/isolado/ops-atestado /caminho/Node20.20.0 /caminho/pm2-6.0.14/bin/pm2`; argumentos de laboratório, nunca produção. A prova usa daemon/processo reais, sem provider/DB. Falhas anteriores foram preservadas: socket path longo ENOENT; sandbox EPERM; fixture fork sem envelope, corrigida para a forma cluster real. Não atribuir PASS a essas tentativas.

## Backup, espaço e estado datado

Dump pós-ack fresco privado/off-host: **35.018.004 bytes**, SHA `5604e18dff4fa68bd21d4a21c23d087738e6cec8dfddea97807f9dc2df8e6d1c`. Restore PG16 isolado, 70 tabelas/recibo/seis Outbounds/migrations restauradas iguais à base viva; nenhum executor/provider, banco temporário removido e catálogo confirmou ausência. [Resultado](restore-result.json). Existem diferenças preexistentes entre cinco migrations versionadas e os checksums registrados: documentadas, não corrigidas. Compatibilidade desta composição é comprovada por bytes schema/Prisma/deps ativos iguais e ausência de mudança schema, não por declaração falsa de migrações limpas.

Leitura final **11/10/2026 01:40:19–01:40:22 UTC / 10/10 22:40 Fortaleza**: frontend PID3438948/ticks2120147745, API3625739/ticks2128115907, worker3625960/ticks2128116272, restart0 nos três; daemon18676/ticks222727 preservado. Health/DB, guarda38/tarefas vazias/markers ausentes, boot inactive/enabled, cron e dumps preservados. Inventário global delimitado/baselines identifica o congelamento esperado nos dez tenants; nenhuma retomada foi disparada. Sessões persistidas conectadas preservadas; QR_REQUIRED histórico continua separado, sem conexão ao provider para atestá-lo.

Proxy real observado pelo helper instalado, PID/start/args/topologia íntegros; Docker29.2.1, docker-ce verificado sem divergência, live exe/arquivo hash `8cd3b929d0cbae223b017134f7e8a09a7da49089fe24ffc051b8c54f7718d7e1`. Proveniência/semântica 1:1 revisada anterior reutilizada; hash sozinho não é prova semântica.

Disco dimensionado **antes do staging**: compartilhamento das dependências 327.200.768 bytes; cópia API sem elas ~36MB + overlay4MB. Frontend candidato/retorno/tar já residentes, sem duplicação184MB. Depois de staging e evidências: deploy disponível **2.357.350.400 bytes**, 6.861.333 inodes, piso planejado **2.131.755.008**, margem **225.595.392 bytes**. Capacidade é datada e limitada; crescimento/WAL e usuários postgres/deploy devem ser reconfirmados antes da janela. Não autoriza novos volumes de log/dump ilimitados; backup seguinte deve continuar off-host e respeitar RPO vigente. Sem limpeza/prune/WAL/retention alterada.

## Próxima decisão e execução futura

Comandos completos e retornos: [COMMANDS_FOR_REVIEW.txt](COMMANDS_FOR_REVIEW.txt), [V4 installer](install-api-window-policy.sh), [frontend janela](frontend-install-window-policy.sh), [frontend permanente](frontend-install-permanent-policy.sh), [frontend roteiro integral](frontend-WINDOW-STEPS.txt), [instalação de contingência](install-post-unfence-return-policy.sh).

**Dependências reais de Deifson:** sessão sudo para substituir exclusivamente política V4; política observador frontend antes de seu preflight; política permanente frontend somente após confirmação das telas, antes de promoção/save. Helpers e regras literais não mudam/não ampliam sudo. Política root600 instalada não foi rehashada diretamente como deploy nesta rodada: os comandos futuros exigem hashes anteriores exatos/ownership e negam drift ou archive existente. Não apresentar proposta instalada como PASS.

Se V4 falhar pós-unfence, capturar estado real com o gerador canônico no destino explícito de contingência. Sua política tem identidades frescas, inclusive ausência comprovada do worker quando aplicável; o hash será produzido e conferido nesse estado, não pode ser inventado agora. Deifson precisa estar disponível para instalá-la antes do retorno; comando e arquivos já definidos. Sob contenção, retornos parcial/completo são coordenados pelo mesmo sequenciador, com comprovação de saída antes de qualquer sucessor. Falha do observador nega worker inclusive no retorno. Sem starts repetidos, limpeza de markers ou troca de binding para fabricar PASS.

Ordem proposta: instalar/verificar política V4 → revalidar estados/backup/capacidade/exclusividade → gates → única V4 API/mesmo worker → confirmar a26 retornada ou candidata correta, guarda sempre fechada38 → capturar fase frontend real → instalar/verificar política janela frontend e preflight falso → decisão/gate de troca frontend → partida única/prontidão30s/30tentativas → CSS efetivamente servido + confirmação owner sessão/layout/Inbox/CRM/Campanhas → política permanente/promoção/save/fallback. API pode ser revertida independentemente; retorno frontend é fa60 corrigido. Não retirar releases/diretórios referenciados por dependências, launcher ou dumps.

Estimativa operacional, não garantia: interrupção API/worker cerca de1–3min e frontend até1min + conferência owner; escalonar aos15min de contenção/parada, informando estado e contingência. Prazo não autoriza bypass/kill/restart. Cada preflight/exit/propriedade DB exige leitura fresca e nonce próprio; evidência preparatória não substitui gate da janela.

Validação posterior técnica: versão/PID/ticks reais, ownership DB/locks, workerHTTP antes de unfence pelo caminho compatível com nft, health/DB completo depois, sessões observáveis, frontend CSS/BUILD_ID, guarda38/job/recibo/proteções, cron/boot/barreira ausente, saved=fallback e supervisão. Sem envio/claim/replay. Aceite funcional separado; internacional/CSV-Syer/CRA-PR/multilote/AUTO e cinco posições restantes continuam pendentes próprios. Setembro e recuperação .6 CLOSED.

Branch de revisão sem auto-deploy: Vercel deploymentEnabled=false; CI push somente main/develop. Publicação inclui apenas arquivos versionados sanitizados; configurações, auth, ledger, nonces, logs, dump e tars privados fora do Git.
