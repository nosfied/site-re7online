# 6683 — tentativa V4 sequenciada e retorno compatível, 03/10/2026

**RETURNED TO AF26 / API 879cb1fa NOT DEPLOYED.** Esta é a tentativa posterior a `b0c39167`, distinta da preparação abortada antes da contenção. Evidências privadas, logs, política, provas, certificados e backups permanecem na preparação `incident-6683-v4-sequenced-20261003T165710Z`, fora do Git. Nenhum dos registros 0604, 6787, 9614 ou 6683 foi reparado ou reenviado.

## Resultado e tempos (UTC)

| Marco | Evidência sanitizada |
| --- | --- |
| 22:40:58 | Guarda fechada por CAS, geração 17→18; `tasks: {}` e drain de campanhas confirmados. Preflight foi solicitado apenas após o fechamento. |
| 22:41:01 | Contenção efetiva; cron de backup em modo de janela e boot PM2 desabilitado. Frontend permaneceu em execução. |
| 22:41:11–22:41:17 | API/worker antigos saíram com certificado; API 879cb1fa e o mesmo worker mínimo af26 iniciaram em sequência. |
| 22:41:19 | `authorize-switch` negado pelo helper antes do unfence. A API candidata não foi exposta ao tráfego. |
| 22:41:21–22:41:38 | Sequenciador selecionou `return`, par candidato saiu; API af26 e worker mínimo af26 iniciaram. `authorize-return` encontrou a mesma negativa, mantendo guarda fechada e contenção. |
| 22:46:09 | Após correção restrita do helper e prova da identidade real dos processos de retorno, `authorize-return`/`unfence` passaram; barreira removida. Contenção de aproximadamente **5 min 08 s**. |
| 22:46:49 em diante | Prova nova de barreira ausente, validação técnica, guarda reaberta na geração 19 e cron/boot/crontab restaurados. Owner confirmou Inbox e CRM em leitura. |

O helper revisado em `b0c39167` exigia que o script da aplicação fosse um argumento literal de `/proc/PID/cmdline`. O PM2 produtivo lança um wrapper e ajusta o título do processo: API e worker possuíam cwd correto e eram filhos únicos do daemon esperado, mas nenhum tinha aquele argumento. O diagnóstico dirigido reproduziu `target_process_ambiguous` tanto para a ida quanto para o retorno. O helper de recuperação passou a exigir, para cada filho, PID/start ticks e pai PM2 esperados, cwd exato, `name`, `pm_cwd` e `pm_exec_path` únicos e iguais à política em `/proc/PID/environ`, hash do script alvo e saved/fallback idênticos. O teste real sobre os processos af26 retornados passou; a mesma política rejeitou tratá-los como candidato. O helper instalado tem SHA-256 `24bdba2bde2c6835f699bdc79b269e4a458a8013aa8a03a2a9a25627619b0198`; o helper anterior foi arquivado. Política root-owned SHA-256 `e80cd68d2ac8bd39dddd52b604e63f3f747215a466728973581cf69ea20d0b83` e os nove comandos sudo literais não mudaram. Fases e evidências abortadas foram preservadas.

## Verificações e limites

Antes da contenção, helper `inspect`, proxy Docker 29.2.1/observador e binding, scripts dos três modos, origem/destino das releases, Prisma schema/Client, frontend BUILD_ID, `.data`/auth compartilhados, PM2, guarda, cron, boot e ausência de trabalho de campanha passaram. As contagens sintéticas do preflight foram reconfirmadas no banco: zero jobs/grupos/leases/campanhas sending ou scheduled; quatro sessões WEB_SESSION conectadas, cinco registros de auth e duas chaves de acompanhamento BOT ativas, idênticos ao baseline privado. Um backup adicional foi capturado às 22:22 UTC, SHA-256 `910f9118efd497d9384eb0a53a38185fb89e7d0e116002d7be2a1cee0ab4f061`, 24.715.433 bytes; o mesmo dump foi restaurado em PostgreSQL 16 local isolado, com 614 objetos e 60 migrations, e o banco temporário foi removido. O backup anterior e sua prova vinculada ao pacote permaneceram intactos. Não houve restore em produção.

No estado final, API af26 e worker mínimo af26 estão online com zero reinícios; frontend af26 manteve PID/BUILD_ID. Os três processos conferem com a configuração privada de retorno, PM2 saved e fallback são iguais, health/DB local e externo passaram, barreira ausente, guarda aberta geração 19 sem tasks/fault, scheduler habilitado e controles `inactive/enabled` e crons originais restaurados. As contagens de sessões/auth e os flags de tenant continuam iguais ao baseline. Deifson confirmou sessão, Inbox e CRM funcionando. Isso **não comprova** ausência de operações inbound/outbound/auth incertas durante a interrupção nem valida o comportamento funcional da API 879cb1fa. Nenhum envio foi provocado, reconciliado ou repetido.

Na primeira execução local da correção de identidade, o teste sintético anterior falhou porque ainda modelava script como argumento direto. Ele foi adaptado para o wrapper PM2 e passou; o caso também nega um script diferente com bytes iguais. Com o código final, **21/21** testes do sequenciador/helper passaram, incluindo os dois testes de sistema que a revisão externa não concluiu. A prova contra os processos reais da VPS foi somente leitura e passou para o retorno. Nenhuma nova troca foi iniciada. A preparação usada está consumida e com gates novamente falsos; não reutilizar seus intents, nonces ou marcadores.

O defeito novo 6683 continua **FAIL**, e 0604/6787/9614 não foram saneados. A API 879cb1fa requer um pacote novo, revisão do helper de identidade PM2 e novo preflight antes de outra janela. O reparo homônimo de setembro segue **CLOSED**. Campanhas/CRA continuam aguardando validação funcional do owner; META_CLOUD puro e híbrido permanecem não exercitados para esta correção.
