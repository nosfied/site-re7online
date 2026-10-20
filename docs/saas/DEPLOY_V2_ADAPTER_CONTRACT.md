# Contrato do adaptador operacional Deploy V2

**Status: CANÔNICO / ADAPTADOR GENÉRICO IMPLEMENTADO E VALIDADO LOCALMENTE**

O executor [`scripts/deploy-v2.py`](../../scripts/deploy-v2.py) controla autorização,
ordem, journal, decisão e rollback. O adaptador traduz ações estáveis para PM2,
launcher frontend e health do ambiente. Ele é autenticado por SHA-256 e copiado para
a raiz exclusiva da execução antes do primeiro efeito.

A autorização da janela vincula os hashes do manifesto, do executor e do adaptador.
Ela também vincula o SHA-256 do runtime binding privado e o `releaseId`.

## Runtime binding

`scripts/deploy-v2-pm2-adapter.py` não contém identidade de release ou estado vivo.
O binding privado autenticado fornece nomes PM2, staging, candidatos, retorno
capturado, dump/rollback, identidade API/frontend/worker, supervisão, destinos
single-use e aceite GET-only tenant-scoped. O executor lê esses bytes uma vez com
`O_NOFOLLOW`, verifica estabilidade de inode, vincula o hash à autorização e copia
os mesmos bytes para a raiz exclusiva antes de qualquer efeito.

Cada ação contém apenas argv estruturado para executável absoluto autenticado por
SHA-256. Shell, `sudo`, ambiente completo e texto arbitrário de erro são negados.
`NOT_AVAILABLE` em qualquer campo fecha a execução antes da criação da raiz.

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
| `activate_frontend_supervision` | Ativar e verificar pelo helper allowlisted somente após frontend aprovado. |
| `verify_worker` | Provar que PID/start ticks/cwd/entrypoint do worker não mudaram. |
| `verify_acceptance` | Executar somente o aceite GET-only tenant-scoped autenticado no binding. |
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

O adaptador e o executor estão aptos para ensaio local. A release de contatos ainda
nega prontidão porque a leitura disponível não contém comandos genéricos autenticados
de runtime/supervisão, referência autorizada para o GET tenant-scoped nem destinos
single-use. Esses dados devem vir de nova preparação privada; não podem ser inferidos.

