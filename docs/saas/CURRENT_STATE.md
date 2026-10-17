# Estado canônico do Converta

Este é o ponto de entrada vigente para decisões e continuidade. Relatórios datados
continuam válidos apenas no alcance e horário que declaram; não substituem esta síntese
nem uma leitura atual da VPS.

## Decisão atual

- Produção permanece viva e não foi alterada por esta correção de governança.
- O estado vivo precisa de preflight somente leitura antes de qualquer publicação.
- A correção CSV funcional já está no Git: backend `a27e2d16`, frontend `111cc543`.
- A preparação estática mais recente é `d7d37c4f`; ela não é autorização nem prova viva.
- Próximo ato permitido: `READ_ONLY_LIVE_PREFLIGHT`.
- Ações M1, SQL v1/v2 e diagnósticos consumidos não podem ser repetidos.
- A entrega é API primeiro e frontend depois; migration e worker estão fora do delta.
- Timeout, recarga ou reentrada recuperam o mesmo UUID por GET; nunca repetem o POST.

Os campos verificáveis, critérios de saída e limites estão em
[`CURRENT_STATE.json`](CURRENT_STATE.json). A CI valida esse contrato em toda alteração
da branch operacional.

## Critério de encerramento

A tarefa CSV só termina quando a identidade viva for comprovada, a janela for autorizada,
API e frontend forem promovidos nessa ordem e os smokes autenticados confirmarem
recuperação sem replay, isolamento entre tenants, totais reconciliados, CRM e Inbox.

Uma negativa de preflight deve atualizar a evidência privada da tentativa, sem criar novo
framework, nova família de manifests ou novo requisito não consumido pelo runtime.

## Branches

`review/campaign-recovery-20260926` é a linha operacional atual e está fortemente
divergente de `main`. Até a entrega CSV, são proibidos force-push, rebase destrutivo e
merge cego. A convergência começará por inventário da fonte realmente alcançável em
produção, seguida de uma linha de integração testada; histórico não será apagado.
