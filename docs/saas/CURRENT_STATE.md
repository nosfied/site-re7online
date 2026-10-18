# Estado canônico do Converta

Este é o ponto de entrada vigente para decisões e continuidade. Relatórios datados
continuam válidos apenas no alcance e horário que declaram; não substituem esta síntese
nem uma leitura atual da VPS.

## Decisão atual

- A entrega CRM/CSV foi promovida e verificada em produção em 17/10/2026
  (Fortaleza): API selecionada às 23:08:55, frontend às 23:25:24 e commit
  operacional concluído às 23:31:09.
- API está no runtime candidato com PID `1238268` e entrypoint SHA-256
  `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.
- Frontend está no runtime candidato com PID `1241028` e BUILD_ID
  `7IRWBhOwtCfwsLkfI9S0K`.
- Worker foi preservado no runtime anterior, PID `936540`.
- Os PIDs são evidência observacional datada; após qualquer restart devem ser
  revalidados. As identidades duráveis são os hashes, BUILD_ID e dumps registrados.
- O dump PM2 vigente tem SHA-256
  `521f941394c451891f661d06abf00cfd3cf90153dd5678b979293d2a12cd73e2`;
  o rollback anterior permanece preservado com SHA-256
  `05fd82d48d240f82043f33c792abcb8456727e76149da5d93748c47940ac5157`.
- A correção CSV funcional já está no Git: backend `a27e2d16`, frontend `111cc543`.
- O candidato funcional promovido é `d7d37c4f`; o control head que documentou e
  validou a entrega é `3868cc0a`.
- Isolamento negativo entre tenants: `LIVE VERIFIED` por respostas
  `HTTP 200 + UNKNOWN` sem progresso, resumo, totais ou metadados cruzados.
- Recuperação positiva durável: `LIVE DEFERRED` até a primeira importação legítima.
- As duas ocorrências históricas de 993 linhas permanecem
  `LEGACY_UNCORRELATED / NOT CLAIMED`.
- A janela executou zero POST, importação, SQL ou migration.
- Próximo ato: observar a primeira importação legítima e validar sua recuperação
  exclusivamente por GET, sem repetir o POST.
- Ações M1, SQL v1/v2 e diagnósticos consumidos não podem ser repetidos.
- Timeout, recarga ou reentrada recuperam o mesmo UUID por GET; nunca repetem o POST.

Os campos verificáveis, critérios de saída e limites estão em
[`CURRENT_STATE.json`](CURRENT_STATE.json). A CI valida esse contrato em toda alteração
da branch operacional.

## Estado de encerramento

A promoção foi encerrada como `DEPLOYED / VERIFIED`: API e frontend candidatos
estão online, CRM e Inbox passaram, o worker permaneceu intocado e o novo dump PM2
foi salvo uma única vez. O rollback timestampado anterior continua disponível.

O caminho positivo vivo não foi fabricado durante a janela. Na primeira importação
legítima futura, deve-se registrar tenant e operation UUID, aguardar a conclusão e
validar reentrada e totais somente por GET. Essa validação pendente não altera o
resultado da promoção nem permite repetir uma importação.

## Branches

`review/campaign-recovery-20260926` é a linha operacional atual e está fortemente
divergente de `main`. Até a entrega CSV, são proibidos force-push, rebase destrutivo e
merge cego. A convergência começará por inventário da fonte realmente alcançável em
produção, seguida de uma linha de integração testada; histórico não será apagado.
