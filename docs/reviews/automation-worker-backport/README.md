# Automação — pacote versionado para revisão independente

**PUBLISHED FOR REVIEW / NOT DEPLOYED.** Nenhuma ativação ou implantação integra esta publicação. Evidência de implementação: LOCAL VALIDATED, com limites no relatório final.

## Referências e deltas separados

- Produção de referência API/frontend: `a3d16d4bdc4b143deeb6b66d4e963b0b4b3f216b`.
- Correção automação × rodízio: `91230f8884faaab7adfc5cbc4a49967dee91a89a`.
- Acompanhamento Inbox: `c68841006a1a68b3ad99dc921b11ca9e1333e36d`.
- Correção dirigida de autorização REST/realtime: `d06a92b84f4308170a6f22a53cb6171cfbe6d6a2`.
- [Relatório final, autorização, testes dirigidos e limites](../../saas/INBOX_AUTOMATION_LOCAL_2026-09-29.md).
- [Diff acumulado de produção ao candidato funcional](https://github.com/nosfied/site-re7online/compare/a3d16d4bdc4b143deeb6b66d4e963b0b4b3f216b...d06a92b84f4308170a6f22a53cb6171cfbe6d6a2).

API/frontend do candidato incluem os três deltas funcionais. O worker permanece na base mínima: **não** usar o build completo da árvore da API. c6884100/d06a92b8 não exigem novo delta no worker; 91230f88 tem o backport específico abaixo.


## Complemento 01/10 - gate de janela freeform WEB/BOT

**LOCAL VALIDATED / NOT DEPLOYED.** Complemento sobre `4f8f9869ab44cac0f46557b94ae0ef1d8699452d`, sem producao, provider real, envio real, migration, commit ou push. O delta da API nega `sendPassiveOutboundText` quando o runtime esta ausente (`window_unavailable`), a janela e invalida (`window_invalid`) ou expira apos o preparo (`window_closed`) antes do provider. O caminho WEB/BOT usa resultado explicito de envio; quando `sendWebSessionBotText` retorna `window_closed`, registra `web_session.bot_reply.not_sent` e nao persiste avanco dependente de resposta nao enviada.

Backport minimo do worker: [worker-freeform-window-gate-20261001.patch](worker-freeform-window-gate-20261001.patch), `sha256=0b09cbcfa2b6c26624c332a3e7cb53e27691b2e4b391d513dd1d436b74d6d8be`, 515 linhas, sem bundles. O patch aplica sobre a composicao minima preservada `bf5 + f06 + 912 + b66`, mantendo os patches anteriores e alterando somente fontes necessarias (`webSessionInbound`, helper CRM minimo exigido pelo source e `runtimeWriteFence` compativel com o Prisma antigo).

Evidencia separada:

- Fonte/API: `automationOwnActivity.test.ts` 18/18 PASS; `campaignsFeatureRoutes.test.ts` focado 1/1 PASS; backend build PASS.
- Worker fonte recomposta: `apps/whatsapp-web-worker npm run build` PASS.
- Worker compilado recomposto: prova dirigida privada `local-evidence/freeform-window-gate-worker-20261001/compiled-worker-proof.mjs` PASS para `botWindowExpired` e `ownActivityB66`; hashes dos compilados alterados estao no manifesto.

A suite historica compilada completa nao e usada como gate desta correcao porque contem fixtures anteriores ao contrato de janela e foi tratada como diagnostico, nao como aprovacao integral. META_CLOUD puro e hibrido API->WEB continuam pendentes de validacao produtiva separada.

## Worker mínimo reproduzível

Base `bf5f1d7610ca3f8144faa6f7b7994598e4a4017b`, com as cinco fontes de persistência f06d49cb do [pacote pré-requisito](../secult-worker-persistence/README.md), revisado em 042e386a. Sobre essa árvore aplica-se [worker-automation-91230f88.patch](worker-automation-91230f88.patch). O [manifesto](manifest.json) informa hashes de fontes/dependências e todos os compilados base/candidato; não inclui os compilados.

Em checkout isolado da base:

1. Aplicar o patch e seguir a receita do pré-requisito f06d49cb, mantendo lockfiles.
2. Executar `git apply --check /caminho/worker-automation-91230f88.patch`, depois `git apply /caminho/worker-automation-91230f88.patch`.
3. Usar as versões/receita de build existentes e comparar os hashes com manifest.json. Não iniciar aplicação, sessões, scheduler ou providers para reconstruir.

Patch contém seis fontes (cinco modificadas + runtimeWriteFence novo). Compilados: 92→93, três alterados (assignmentPolicy, dualWriteStorage, webSessionInbound), um adicionado; nenhum removido. Dependências inalteradas. Aplicação do patch foi conferida sobre as fontes mínimas preservadas, comparando os seis resultados com o candidato anteriormente testado. O patch anterior de trabalho não incluía o arquivo novo não rastreado; este pacote completo o inclui explicitamente.

Evidências reutilizadas: build/backport e 15 casos selecionados Node20; não repetidos para publicar documentos. Isso não comprova shutdown seguro nem tipagem integral do worker. Os 4 testes dirigidos e build backend da correção d06a92b8 pertencem à API; os 36/22 históricos e smoke mantêm seus escopos anteriores. Não somar casos sobrepostos nem reatribuir provas históricas a código modificado.

## Publicação e limites

Destino exclusivo: review/campaign-recovery-20260926, origin nosfied/site-re7online. Configuração versionada vercel.json desabilita deploymentEnabled para esta branch. Único workflow .github/workflows/ci.yml: push somente main/develop; PRs para main/develop executam build, sem deploy. Nenhum merge/ativação produtiva faz parte desta publicação. Documentação em commit separado do código revisado.

Compatibilidade API/worker/scripts escritores continua necessária; retorno a escritores antigos perde a proteção de revogação concorrente. Limitação técnica de resposta automática em andamento permanece separada, sem promessa de cancelamento. Campanhas/CRA aguardam validação funcional do owner; inatividade no Guia pausada; SECULT encerrada/aceita; 6683 CLOSED. Sem credenciais, dados de clientes, sessões, bundles ou evidências operacionais privadas.
