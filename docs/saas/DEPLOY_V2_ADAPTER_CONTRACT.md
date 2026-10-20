# Contrato do adaptador operacional Deploy V2

**Status: CANÔNICO / ADAPTADOR PRODUTIVO AINDA NÃO IMPLEMENTADO**

O executor [`scripts/deploy-v2.py`](../../scripts/deploy-v2.py) controla autorização,
ordem, journal, decisão e rollback. O adaptador traduz ações estáveis para PM2,
launcher frontend e health do ambiente. Ele é autenticado por SHA-256 e copiado para
a raiz exclusiva da execução antes do primeiro efeito.

A autorização da janela vincula os hashes do manifesto, do executor e do adaptador.

## Interface

```text
ADAPTER ACTION --manifest MANIFEST --work-dir EXECUTION_ROOT
```

O stdout deve conter exatamente um objeto JSON sanitizado:

```json
{"result":"PASS","reason":null}
```

Qualquer exit code diferente de zero, JSON inválido ou `result` diferente de `PASS`
é negativa. Segredos, cookies, tokens, ambiente completo e identificadores tenant não
podem aparecer no stdout/stderr.

## Ações e pós-condições

| Ação | Obrigação |
| --- | --- |
| `capture` | Ler estado vivo uma vez, criar retorno compatível e persistir identidades antes de mutar. |
| `select_api` | Seleção direcionada da API candidata; operação tratada como possivelmente parcial. |
| `verify_api` | PM2, PID/start ticks, cwd/entrypoint, SHA, socket 3001 e health; GET tenant-scoped quando exigido. |
| `select_frontend` | Seleção direcionada do frontend pelo launcher/control canônico. |
| `verify_frontend` | PM2, identidade, BUILD_ID, HTTP e assets; sem POST automático de importação. |
| `verify_worker` | Provar que PID/start ticks/cwd/entrypoint do worker não mudaram. |
| `save_pm2` | Executar uma vez, somente depois de todos os gates anteriores. |
| `rollback_frontend` | Retornar idempotentemente ao frontend capturado. |
| `rollback_api` | Retornar idempotentemente à API capturada. |
| `verify_rollback` | Provar identidades anteriores, health e worker preservado. |

## Invariantes

- O adaptador não escolhe a ordem e não autoriza a execução.
- `capture` não pode inferir estado de documento antigo.
- Se uma seleção negar depois de efeito parcial, rollback continua obrigatório.
- Ações de rollback devem ser idempotentes.
- Nenhum `pm2 save` durante rollback; o retorno usa o snapshot capturado.
- Banco, schema, worker, credenciais, root/rede e Nginx ficam fora de `NORMAL_RELEASE`.
- Testes funcionais são GET-only e tenant-scoped, sem fabricar operação ou credencial.
- Não há fallback silencioso entre transportes, controles ou runtimes.

O adaptador produtivo será implementado somente após uma leitura fresca e
allowlisted do retorno supervisionado e do staging. Até lá, o executor está apto para
ensaio, não para promoção produtiva.

