# af26 V4 — testes sanitizados

Estas fontes são anexáveis e não contêm sessões, configuração produtiva, dump, bundle ou endereço privado. Os números **45/35/3/13** do relatório V4 foram obtidos no pacote local com PM2 simulado e, nos dois últimos grupos, Docker bridge, `docker-proxy`, PostgreSQL e API compilada reais em laboratório isolado. Os testes de PID/proxy divergente, observador indisponível e IPv6 de banco usam **injeção**; churn de conexão, fechamento HTTP, cliente extra, backend direto/Unix e advisory lock usam **sockets/processos reais**. Nenhum teste inicia worker/provider produtivo.

Primeiro aplicar o [patch V4](../operational-db-owner-set-v4-20261003.patch) aos quatro modos V3 cujos hashes constam do [manifesto](../OPERATIONAL_DB_OWNER_SET_V4_MANIFEST.json), com `git apply --unidiff-zero`, e conferir os hashes finais. Definir `AF26_V4_PACKAGE` para a cópia isolada que contém `switch`, `return`, `return-partial` e `return-front-missing`. Então:

```bash
AF26_V4_PACKAGE=/caminho/isolado python3 test-package-set.py -q
AF26_V4_PACKAGE=/caminho/isolado python3 test-delegated-set.py -q
AF26_V4_PACKAGE=/caminho/isolado python3 test-helper-command.py -q
```

Resultados sobre o pacote publicado: **45/45**, **35/35** e **2/2**. O terceiro grupo verifica especificamente a invocação `/usr/bin/python3 -I -S` e rejeição de diretório pai gravável/symlink, sem executar sudo.

Para os grupos integrados, usar somente Docker Engine rootless **privado** com socket em `/tmp`, PostgreSQL 16 sintético numa bridge dedicada, porta publicada no loopback **diferente de 5432**, e a API af26 compilada previamente em Node 20 dentro do namespace de rede do daemon. Desabilitar scheduler, provider e outbound no ambiente sintético; não copiar credenciais/sessões produtivas. Não iniciar worker. O arquivo `test-live-set.py` recebe apenas variáveis do laboratório:

```bash
export AF26_V4_PACKAGE=/caminho/isolado
export AF26_LAB_ACK=synthetic-isolated
export AF26_LAB_DOCKER=/caminho/do/docker-privado
export AF26_LAB_DOCKER_SOCKET=unix:///tmp/af26-lab/run/docker.sock
export AF26_LAB_NAMESPACE_PID=PID_DO_DAEMON_PRIVADO
export AF26_LAB_API_PID=PID_DA_API_SINTETICA
export AF26_LAB_DB_PORT=PORTA_ALTA_PUBLICADA
export AF26_LAB_HTTP_PORT=PORTA_HTTP_SINTETICA
export AF26_LAB_CONTAINER_ID=ID_DO_POSTGRES_SINTETICO
export AF26_LAB_CONTAINER_IP=IP_DA_BRIDGE_SINTETICA
export AF26_LAB_PROXY_SHA256=HASH_DO_DOCKER_PROXY_DO_LAB
export AF26_LAB_DB_USER=re7_lab
export AF26_LAB_DB_NAME=re7_proxy_lab
export AF26_LAB_DB_PASSWORD=SENHA_APENAS_DO_BANCO_SINTETICO
python3 test-live-integration.py -q
python3 test-live-negative.py -q
```

O laboratório original tinha Docker 29.2.1 rootless, bridge, porta publicada e API compilada conferida por hash. **3/3 e 13/13** são os resultados preservados dessa execução; os arquivos acima substituem somente identificadores efêmeros por variáveis e não foram novamente executados após o encerramento do laboratório. `test-live-negative.py` termina apenas backends sintéticos que ele próprio iniciou: seu reconhecimento de laboratório e socket privado são pré-condições, nunca apontar essas variáveis para produção.
