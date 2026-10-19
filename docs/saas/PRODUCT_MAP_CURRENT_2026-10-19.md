# Mapa vigente do produto — 19/10/2026

Este mapa é uma síntese operacional. A fonte de decisão permanece
[CURRENT_STATE.md](CURRENT_STATE.md), acompanhada de
[CURRENT_STATE.json](CURRENT_STATE.json).

## Produção

- Estado: `DEPLOYED / VERIFIED`.
- CSV, normalização de telefone, recuperação durável e reentrada terminal:
  `LIVE VERIFIED`.
- API e frontend saudáveis na última evidência registrada.
- Worker preservado.
- Nenhum POST CSV, importação, SQL ou migration foi executado nas últimas janelas
  de documentação e credenciais.

## Credenciais

- OBS-2: `CONTINGENCY CLOSED / SAFE POST-ROTATION RETURN READY`.
- OBS-1: `PREPARED / SCHEDULED WINDOW REQUIRED / NO CHANGE`.
- OBS-1 afeta o aplicativo Meta compartilhado e exige restart somente da API.
- De segunda a sexta-feira, 08:00–17:00 em Fortaleza, ficam negados reset no
  provedor, restart da API, seleção PM2 e `pm2 save` relacionados à OBS-1.
- O segredo anterior não é retorno confiável depois do reset; a recuperação é
  progressiva com o novo segredo ou novo reset no provedor.

## Trabalho permitido durante o expediente

1. Documentação sanitizada e CI.
2. Preparação inerte da convergência de branches, sem mover `main` e sem deploy.
3. Confirmação manual do aplicativo Meta correto no navegador habitual, parando
   antes de revelar ou redefinir o segredo.
4. Planejamento e comunicação da janela OBS-1.

## Próximas frentes

1. Fase 1 inerte do
   [plano de convergência](BRANCH_CONVERGENCE_PLAN_2026-10-18.md).
2. Confirmação manual da identidade do aplicativo Meta, sem reset.
3. Agendamento e autorização da rotação OBS-1 fora do horário protegido.
4. Após a rotação, fechamento da contingência e eliminação controlada das cópias
   anteriores, sem inferir retorno pelo segredo invalidado.

O arquivo `PRODUCT_MAP_CURRENT.md` anterior permanece apenas como histórico extenso.
Ele contém estados datados e não é roteiro operacional.
