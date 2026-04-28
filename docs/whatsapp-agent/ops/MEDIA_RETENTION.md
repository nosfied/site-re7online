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

Nao instalar automaticamente. Configurar manualmente:

```bash
crontab -e
```

Entrada sugerida:

```cron
0 3 * * * cd /opt/re7online/site-re7online/apps/whatsapp-agent && MEDIA_LOCAL_RETENTION_DAYS=7 npm run media:cleanup >> /var/log/re7-media-cleanup.log 2>&1
```

## Auditoria rapida

Comandos uteis:

```bash
du -sh /opt/re7online/site-re7online/apps/whatsapp-agent/.data/media/outbound
find /opt/re7online/site-re7online/apps/whatsapp-agent/.data/media/outbound -type f | wc -l
tail -n 50 /var/log/re7-media-cleanup.log
```
