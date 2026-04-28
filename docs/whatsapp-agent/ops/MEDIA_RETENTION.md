# Retencao de midia local

O inbox salva uma copia local de midias outbound enviadas pela aplicacao em:

```bash
apps/whatsapp-agent/.data/media/outbound/
```

Essa copia melhora a experiencia ao reabrir imagens, audios, videos e documentos enviados, porque o backend tenta servir o arquivo local antes de recorrer ao download pela Meta.

## Configuracao

Variaveis suportadas pelo script de limpeza:

```bash
MEDIA_LOCAL_CLEANUP_ENABLED=true
MEDIA_LOCAL_RETENTION_DAYS=7
```

Defaults:

- `MEDIA_LOCAL_CLEANUP_ENABLED`: `true`
- `MEDIA_LOCAL_RETENTION_DAYS`: `7`

Se `MEDIA_LOCAL_RETENTION_DAYS` estiver ausente ou invalido, o script usa `7` dias e registra warning.

## Execucao manual

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
MEDIA_LOCAL_RETENTION_DAYS=7 npm run media:cleanup
```

O script:

- percorre apenas `.data/media/outbound`;
- remove arquivos com `mtime` mais antigo que a retencao configurada;
- ignora symlinks;
- remove diretorios vazios quando possivel;
- registra resultado em JSON.

Exemplo de log:

```json
{"level":"info","event":"media.cleanup.completed","retentionDays":7,"baseDir":"/opt/re7online/site-re7online/apps/whatsapp-agent/.data/media/outbound","totalScanned":120,"totalDeleted":35,"bytesDeleted":12345678,"emptyDirsDeleted":2,"skipped":0,"errors":0}
```

## Cron recomendado na VPS

Estado atual da VPS `admin.re7online.com`:

- rotina instalada no `crontab` do usuario `deploy`;
- horario: diariamente as `03:00`;
- retencao: `7` dias;
- log: `/opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/media-cleanup.log`;
- commit de implantacao inicial: `dbfcbd5`.

Para conferir se esta ativo:

```bash
crontab -l | grep media:cleanup
```

Entrada instalada:

```cron
0 3 * * * cd /opt/re7online/site-re7online/apps/whatsapp-agent && MEDIA_LOCAL_RETENTION_DAYS=7 npm run media:cleanup >> /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/media-cleanup.log 2>&1
```

Se precisar instalar ou reativar manualmente:

```bash
crontab -e
```

E adicionar a mesma entrada acima.

Reativar somente quando:

- a VPS for substituida;
- o usuario `deploy` for recriado;
- alguem remover o crontab com `crontab -r`;
- o projeto mudar de pasta em producao;
- a politica de retencao precisar mudar.

Para alterar a retencao, edite apenas o valor:

```cron
MEDIA_LOCAL_RETENTION_DAYS=7
```

## Auditoria rapida

Comandos uteis:

```bash
du -sh /opt/re7online/site-re7online/apps/whatsapp-agent/.data/media/outbound
find /opt/re7online/site-re7online/apps/whatsapp-agent/.data/media/outbound -type f | wc -l
tail -n 50 /opt/re7online/site-re7online/apps/whatsapp-agent/.data/logs/media-cleanup.log
```

## Deploy realizado em 2026-04-28

Resumo do que foi implantado:

- `dbfcbd5 fix: retain outbound media with cleanup`;
- backend salva copia local de midias outbound enviadas pelo `/app/inbox`;
- `rawPayload.media` recebe `localPath` e `localSize`;
- endpoint de midia serve arquivo local primeiro e usa Meta como fallback;
- resposta de envio de midia devolve `message.media`, permitindo exibicao imediata da bolha com download/reproducao;
- script `npm run media:cleanup` remove arquivos locais antigos;
- cron diario instalado no usuario `deploy`.

Validacao executada:

```bash
cd /opt/re7online/site-re7online/apps/whatsapp-agent
npm run media:cleanup
curl -sS http://127.0.0.1:3001/health
curl -I -sS https://admin.re7online.com/app/inbox
pm2 status re7-whatsapp-agent re7-admin-front
```

Resultado:

- cleanup executou com `errors:0`;
- backend respondeu `ok/db ok`;
- `/app/inbox` respondeu `HTTP/1.1 200 OK`;
- PM2 ficou online para frontend e backend.
