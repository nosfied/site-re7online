# Runbook canônico de deploy

Esta é a única instrução executável vigente para releases normais do Converta.
Arquitetura, identidades e razões dos gates ficam no
[modelo operacional](DEPLOYMENT_OPERATING_MODEL.md).

## Pré-requisitos

- release imutável de API e frontend já construída e autenticada fora da VPS;
- checkout do control plane limpo no SHA aprovado;
- PM2 `6.0.14` no caminho já autenticado;
- configuração privada canônica em raiz `0700`, com manifesto e arquivos `0600`;
- fontes/requests/definições `api|frontend-candidate|rollback` válidas;
- raiz de transação nova, privada e exclusiva;
- worker fora do impacto; migration e SQL não aplicáveis;
- autorização explícita para a janela.

O driver aceita somente `api,frontend`, usa `/opt/re7online/current/api` e
`/opt/re7online/current/frontend`, smoke GET-only e o readiness existente de
`pm2-definition-control.py`. Ele não constrói artefatos, não altera allowlist e não
implanta worker ou migration.

Informe explicitamente o manifesto privado canônico, calcule seu SHA-256 externo
antes da janela e defina os mesmos oito argumentos em todos os comandos. O caminho
e o digest não são inferidos pelo driver:

```bash
COMMON=(
  --release immutable-<id>
  --target <sha-completo-da-aplicacao>
  --control-plane <sha-completo-do-control-plane>
  --components api,frontend
  --config-root /opt/re7online/config/pm2-canonical/v1
  --config-manifest /opt/re7online/config/pm2-canonical/v1/final-hash-manifest.private.json
  --config-manifest-sha256 <sha256-autenticado-do-manifesto-informado>
  --transaction-root /opt/re7online/backups/converta-persistent/deploy-transactions/<id>
)
```

O manifesto autenticado usa `schemaVersion: 2`, raiz fechada e 18 entradas `files`
com os campos exatos `mode`, `name`, `sha256` e `size`. O driver confere esses
metadados com cada arquivo real e nega campo ausente, adicional ou divergente.
Ele é a única fonte dos caminhos relativos. Seus grupos
ordenados `definition`, `request`, `source` vinculam componente e papel pelo
conteúdo autenticado, independentemente do nome do arquivo. Caminho absoluto,
travessia, symlink, arquivo fora da raiz, modo/owner/tamanho/hash divergente ou alteração
durante a leitura encerram o comando. Não há procura por nome, glob ou fallback.

## Caminho feliz

```bash
python3 scripts/converta-deploy.py preflight "${COMMON[@]}"
python3 scripts/converta-deploy.py activate "${COMMON[@]}"
```

Resultados nominais: `PREFLIGHT PASS` e `AWAITING_ACCEPTANCE`. `activate` seleciona
API e frontend nessa ordem, chama o `wait-readiness` versionado e preserva o worker.
Ele não executa `pm2 save` e não cria `DEPLOYED`.

O owner valida tecnicamente o candidato sem POST, Meta ou envio. Depois do aceite,
crie na raiz da transação um arquivo regular `0600` chamado
`acceptance.private.txt`, contendo exatamente:

```text
ACEITE TÉCNICO PASS
```

Finalize uma única vez:

```bash
python3 scripts/converta-deploy.py finalize "${COMMON[@]}"
```

Resultado nominal: `DEPLOYED`. O comando revalida identidades, sockets, symlinks,
health e worker; executa um único `pm2 save`, valida o dump e só então cria o marker.

## Rollback

Antes do save, diante de rejeição ou negativa recuperável:

```bash
python3 scripts/converta-deploy.py rollback "${COMMON[@]}"
```

Resultado nominal: `ROLLED_BACK`. O comando restaura symlinks e definições
autenticadas, revalida API/frontend/worker, não salva o dump e não cria marker. Se
uma restauração for interrompida, o journal fica em `FAILED`, conserva o lock e o
mesmo comando `rollback` retoma pelos checkpoints já persistidos, desde que
`saveCount` continue zero.

## Estado

```bash
python3 scripts/converta-deploy.py status "${COMMON[@]}"
```

`status` é somente leitura e mostra apenas estado, release, target, control plane,
contagem de saves e presença lógica do marker. Nunca mostra ambiente ou segredo.

Qualquer `DEPLOY_DENY:<predicado>` encerra a etapa. Não editar o journal nem adaptar
artefatos durante a janela. Se `finalize` for interrompido, invoque o mesmo comando:
o journal e a identidade do dump determinam se o único `pm2 save` ainda precisa ser
executado ou já ocorreu. Estados `FINALIZING`/`FAILED` não autorizam um segundo save;
o driver conclui dump, marker, lock e journal de forma retomável. O rollback comum é
negado depois que o dump candidato foi persistido.
