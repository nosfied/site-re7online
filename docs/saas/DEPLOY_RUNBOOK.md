# Runbook canônico de deploy

Esta é a única instrução executável vigente para releases normais do Converta.
Arquitetura e razões dos gates ficam no
[modelo operacional](DEPLOYMENT_OPERATING_MODEL.md).

As fases preservam a nomenclatura de estado `preflight`, `activate`, `finalize`,
`rollback` e `status`; seus resultados nominais são `PREFLIGHT PASS`,
`AWAITING_ACCEPTANCE`, `DEPLOYED` e `ROLLED_BACK`.

## Pré-requisitos

- target e control plane aprovados em CI;
- release imutável de API/frontend selada por `scripts/converta-release.py`;
- build único em worktree Linux x86_64 isolado, Node v20.20.0; builder externo é
  preferencial e uso da VPS exige autorização explícita e capacidade comprovada;
- pacote, manifesto, índice, BUILD_ID e entrypoint integralmente verificados;
- release extraída em destino novo sob `/opt/re7online/releases`;
- configuração privada e retorno autenticados, dump anterior e symlinks capturados;
- PM2 6.0.14, worker fora do impacto, lock global livre e autorização da janela;
- migration/SQL classificados antes da janela.

Nunca construir no runtime ativo, reconstruir durante ativação, importar ambiente do
shell, derivar definição executável de introspecção, usar `--update-env`, executar
`pm2 flush` ou repetir automaticamente uma tentativa negada.

O health público da API é
`https://converta.re7online.com/agent-api/health`: exigir HTTP 200, JSON, `ok=true`
e `db="ok"`. `/health` no domínio do frontend não comprova a API.

## Build once

```bash
TARGET=<sha-completo>
RELEASE=immutable-<sha-curto>-<timestamp-utc>
EPOCH=$(git show -s --format=%ct "$TARGET")
python3 scripts/converta-release.py build \
  --repo "$PWD" --target "$TARGET" --release-id "$RELEASE" \
  --components api,frontend --output <saida-exclusiva> \
  --source-date-epoch "$EPOCH"
python3 scripts/converta-release.py verify \
  --package <saida-exclusiva>/$RELEASE.tar.xz \
  --target "$TARGET" --release-id "$RELEASE" --components api,frontend
```

`RELEASE BUILT` e `RELEASE VERIFIED` são obrigatórios. Diagnosticar primeiro
`failure-evidence.private`; seu conteúdo não vai para stdout ou Git. Rebuild cria
nova release. Retry reutiliza o mesmo pacote autenticado.

O produtor exclui uploads/dados operacionais da aplicação, mas preserva dependências
sob `node_modules`, inclusive diretórios internos chamados `uploads`. O índice fechado
e a extração independente comprovam que não há cache, segredo, worker ou arquivo
adicional.

## Preflight (`preflight`)

1. Adquirir o lock e confirmar ausência de outra janela.
2. Revalidar hashes do pacote/release, target, BUILD_ID e entrypoint.
3. Confirmar symlinks e releases viva/candidata, dump `0600`, retorno autenticado,
   PM2 e configuração privada completa já armazenada.
4. Capturar PID, start ticks, CWD, script, argumentos, sockets e restart count de
   API/frontend/worker.
5. Confirmar health, espaço/inodes, zero trabalho impeditivo e impacto de migration.
6. Preparar evidência privada e destinos exclusivos; não executar `pm2 save`.

## Ativação fixed-current

1. Promover atomicamente `/opt/re7online/current/api` ao runtime candidato.
2. Reiniciar `re7-whatsapp-agent` pelo registro PM2 existente, sem `--update-env`.
3. Exigir três amostras consecutivas com PID/start ticks estáveis, symlink correto,
   um listener 3001 DIRECT ou DESCENDANT, sem restart novo; então health local/público.
4. Só após API PASS, promover `/opt/re7online/current/frontend` atomicamente.
5. Reiniciar `re7-admin-front` pelo registro existente, sem `--update-env`.
6. Exigir três amostras estáveis, listener 3000, BUILD_ID, Login, Inbox, CRM,
   Modelos, Campanhas e asset por GET-only.
7. Provar o worker byte-operacionalmente preservado e parar em aceite técnico.

A ausência transitória do listener permite polling limitado; listener estrangeiro,
PID instável, restart, identidade/hash/BUILD_ID divergente ou health inválido nega a
janela. Preserve o primeiro erro de startup. Não ampliar timeout antes de diagnosticá-lo.

## Aceite, persistência e retorno

Após `ACEITE TÉCNICO PASS`, revalidar o trio sem restart, executar `pm2 save`
exatamente uma vez, conferir dump regular `0600` e hash, criar `DEPLOYED` somente
depois do dump e liberar o lock.

Antes do save, qualquer negativa restaura atomicamente frontend e API aos symlinks
anteriores, reinicia os registros existentes sem atualização de ambiente e comprova
identidades, sockets, health e worker. Só então declarar `ROLLED_BACK`; zero save e
zero retry. Depois do save, usar a evidência transacional para completar dump, marker,
lock e journal sem segundo save.

As tentativas de 24/10 com `scripts/converta-deploy.py` ficam preservadas como
histórico e não devem ser repetidas. Preparações anteriores, Deploy V2,
`deploy-normal-release.sh` e executores em `/tmp` não são rotas vigentes.
