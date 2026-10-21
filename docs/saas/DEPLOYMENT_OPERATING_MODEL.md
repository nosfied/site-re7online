# Modelo operacional canônico de implantação do Converta

**Status: CANÔNICO / COMPROVADO EM PRODUÇÃO EM 20/10/2026 / RECONFIRMADO EM 21/10/2026**

Esta é a única fonte de instrução operacional vigente para deploy do Converta.
Runbooks, preparações e executores anteriores permanecem como evidência histórica e
não autorizam repetição.

## Topologia canônica

- O build ocorre fora da VPS em Linux `x86_64`, com Node `v20.20.0` e npm
  `10.8.2`.
- API e frontend são artefatos completos, versionados e validados por índice,
  manifesto, extração independente e SHA-256.
- Releases são imutáveis e residem em `/opt/re7online/releases/<release-id>`.
- O PM2 aponta somente para `/opt/re7online/current/api` e
  `/opt/re7online/current/frontend`.
- Cada caminho estável é um symlink trocado atomicamente para a release aprovada.
  `/proc/<pid>/cwd` resolve o symlink e mostra o destino físico.
- A API usa `/usr/bin/node` e o entrypoint integral da release.
- O frontend usa `/usr/bin/node`, `node_modules/next/dist/bin/next`, argumentos
  `start -p 3000`, `fork_mode` e uma instância. Next não roda em `cluster_mode`.
- O worker fica fora do deploy normal quando a matriz de impacto não o altera.

## Sequência de promoção

1. Validar o pacote fora da VPS e transferir somente o artefato imutável e hashes.
2. Extrair em raiz nova e comprovar igualdade integral antes da seleção.
3. Adquirir o lock global e capturar dump PM2 e definições completas de retorno em
   arquivos privados `0600`.
4. Criar symlinks temporários e promovê-los por rename atômico.
5. Selecionar primeiro a API. Exigir três amostras estáveis, identidade, CWD físico
   da release, entrypoint/hash, Node, socket 3001 e health local/público.
6. Selecionar o frontend em `fork_mode`. Exigir três amostras estáveis, BUILD_ID,
   socket 3000, Login, Inbox, CRM e asset `_next`.
7. Confirmar o worker inalterado e executar somente smoke GET/read-only. Aceite
   autenticado tenant-scoped é gate humano separado quando não houver sessão
   automatizável autorizada.
8. Executar `pm2 save` exatamente uma vez, somente depois dos gates e do aceite
   aplicável. Conferir dump regular, modo real `0600` e SHA-256.
9. Criar o marker `DEPLOYED` apenas depois da validação do dump.

O socket é válido quando pertence ao PID PM2 ou a um descendente comprovado por
uma cadeia contínua de PPIDs. Um socket pertencente ao daemon PM2 não comprova a
identidade do frontend. Igualdade direta entre PID PM2 e socket também não pode ser
exigida quando o launcher comprovado cria descendente legítimo.

O registro estruturado representa essa prova com `socketOwnerRelation` (`DIRECT`
ou `DESCENDANT`) e `socketOwnerChain`, ordenada do proprietário do socket até o PID
do processo de aplicação registrado pelo PM2. A cadeia nunca termina no daemon PM2.

## Retorno

Antes do primeiro efeito, preservar as definições PM2 completas, incluindo cwd,
script, interpreter, argumentos, ambiente, controle/run frontend e políticas de
log. Em negativa:

1. restaurar as definições anteriores de frontend e API;
2. restaurar ou remover os symlinks conforme o snapshot inicial;
3. validar identidades, sockets, health e worker;
4. não executar `pm2 save` nem tentar novamente.

`ROLLED_BACK` só pode ser declarado depois da restauração comprovada. Falha em
qualquer comando de retorno mantém a execução em falha.

## Mecanismos obsoletos

Os itens abaixo são históricos e **não utilizáveis**:

- build de API ou frontend diretamente na VPS;
- checkout produtivo como runtime ou destino de build/cópia;
- `scripts/deploy-normal-release.sh` e seu fluxo de cópia para o runtime ativo;
- pipeline experimental da PR #190;
- frontend Next em `cluster_mode`;
- gate que exige socket diretamente no PID PM2 sem considerar launcher/descendência;
- Deploy V2, controles single-use e preparações de incidente como rota normal.

## Release produtiva observada em 21/10/2026

O registro estruturado vigente é
[`CRM_CONTACTS_CURSOR_READ_MODEL_2026-10-21_DEPLOYED.json`](releases/CRM_CONTACTS_CURSOR_READ_MODEL_2026-10-21_DEPLOYED.json).
O target `c085e53f752a9b31fa7dd6d03896da07e3f159e3` foi promovido como
`immutable-c085e53f-20261021T094952Z`, com API e frontend nos caminhos estáveis,
worker preservado, um único `pm2 save` e resultado
`DEPLOYED / PRODUCTION HEALTHY`.
