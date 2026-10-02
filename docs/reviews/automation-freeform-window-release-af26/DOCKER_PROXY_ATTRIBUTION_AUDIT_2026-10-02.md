# Atribuição PostgreSQL através de docker-proxy — auditoria dirigida, 02/10/2026

**Conclusão: vínculo individual ainda não comprovável no alvo; V3 BLOQUEADO / NOT DEPLOYED.** Esta leitura e o laboratório não modificaram a VPS. A release af26, o pacote V3 e os demais gates não foram alterados. Não preparar nova janela com o gate V3 direto.

## Reconfirmação factual da VPS

Leituras delimitadas em **02/10/2026, 23:24–23:33 UTC**, no host `re7online-api-01`, usuário `deploy`: o branch remoto de revisão e o worktree local estavam ambos em `5651adc333bf369f97b159c40834c5087f099b50`; o checkout produtivo permanecia detached em `5ee2de6b`, distinto dos executáveis PM2. Os três processos PM2 estavam online, `watch=false` e zero restarts. PID+tempo de início, cwd, script e executável foram conferidos. O frontend ativo mantinha BUILD_ID `l1eBvPioySXt7NLiuFMkg`.

| Componente | Release efetiva | PID | Arquivos/hash da árvore compilada |
| --- | --- | ---: | --- |
| API | `b66bb89aca9112277463b7d2adbee0b9e7831157-api` | 2391393 | 423 / `efcd11c7fae3f20ed4d665fc54899ef94cb1872967a2c2106ff2212f3af90146` |
| Frontend | `ba66c24112ccb10f2dfdcced54350f513d399bc6` | 1856062 | 862 / `349a94844ecd10cbe25949f1c98254bf8fcf14648aea957f9868f163bce6603e` |
| Worker mínimo | `worker-bf5f1d76-f06d49cb-91230f88-b66bb89a` | 2392982 | 93 / `00ad2634a9b95f6deaf69cd95c2a364aabf71838639d1a2a3339b1c03fbf6995` |

Os hashes ativos coincidiram com o registro anterior. Os candidatos isolados continuam presentes, **não executados**, e seus hashes agregados também coincidiram com `executables-manifest.json`: API 425 / `6e92592b41ba0a67565c3c2f62f332807a297e8f52fb884db569bbadcbead611`; frontend 1645 / `76e0f9f4723ec74fb4d6c5b76551b5f8517739b2ed2d82127612d7a9e7a8392d`; worker mínimo 99 / `7d57c73c7769948fc5123479827358e8b4759e872bb7e33358fad06724670d60`. Este confronto é de bytes, não de execução funcional nova.

Health local informou API/DB OK e login frontend HTTP 200. A guarda persistente estava disponível/aberta, geração 11, sem tasks, lock ou marcador incerto naquele instante; o scheduler da API continuava habilitado (`CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=false`). PM2 saved/fallback são idênticos entre si e apontam somente para as três releases efetivas; `pm2-deploy.service` estava `inactive/enabled`, e o cron de backup presente. `.data` da API e do worker continua apontando para os diretórios compartilhados preservados; a mídia WEB usa o caminho compartilhado existente. PostgreSQL `postgres:16-alpine` continuava publicado em `127.0.0.1:5432`.

Consulta agregada `READ ONLY`: três jobs `completed`, nenhum grupo, lease ligado/ativo, campanha `sending` ou agendamento vencido/futuro; quatro contas WEB `connected`, uma `disconnected`, cinco registros auth, 60 migrations concluídas e duas configurações de acompanhamento BOT ligadas. Uma leitura complementar confirmou Syer ligada **e mais um tenant ligado**, sem expor sua identidade. O agregado de duas já constava da preparação de 02/10, mas diverge da afirmação documental anterior de que apenas Syer estava ativada; precisa de reconciliação autorizada antes de qualquer validação por tenant, sem revogação incidental. Havia 14 backends PostgreSQL e quatro advisory locks, compatíveis com produção em funcionamento, não com um gate de saída. Zero tarefas momentâneo e health não são drain, saúde integral dos tenants nem autorização de nova janela. Nenhum provider, sessão, configuração, processo, DB ou tráfego foi alterado.

## Contrato e topologia

O [desenho da VPS](../../DEPLOY_TOPOLOGY_RE7.md) coloca API/worker sob PM2 e PostgreSQL no contêiner `wa-agent-postgres`, publicado no loopback do host; o [baseline operacional](../../saas/OPERATIONAL_BASELINE.md) registra a porta publicada. A [auditoria V3](OPERATIONAL_DB_OWNER_V3_LOCAL_2026-10-02.md) constatou que a API usa TCP IPv4 para essa porta e que os backends PostgreSQL recebem outra tupla através do `docker-proxy`. Portanto, o confronto direto `pg_stat_activity.client_addr/client_port` ↔ socket da API é incompatível.

A verificação adicional, somente leitura, encontrou Docker Engine **29.2.1**, um `docker-proxy` da porta PostgreSQL executado como root e descritores da API legíveis pelo executor `deploy`. O executor **não** consegue listar/ler `/proc/<pid-do-proxy>/fd`; consultar Docker ou PostgreSQL não concede esse acesso ao processo proxy. Seria necessária uma leitura privilegiada específica dos FDs do processo root (por root ou capacidade de inspeção equivalente, sujeita às regras de `procfs`/ptrace do host), além das estatísticas do banco; não se deve conceder essa capacidade ao executor por inferência. O papel de leitura usado no banco consegue consultar `pg_stat_activity` e `pg_locks`. Não foi solicitada mudança de permissão. A amostra anterior de 14 backends e quatro advisory locks retrata produção em operação; não é teste de drain nem demonstra propriedade.

## Evidência necessária para uma atribuição rigorosa

1. Fixar PID **e tempo de início** da API sucessora e do proxy, e confirmar que os processos não mudaram ao final da observação.
2. Enumerar os inodes dos sockets TCP estabelecidos nos descritores de **ambos** os processos. Confrontar cada socket de entrada do proxy com um socket da API por ambas as pontas da tupla, sem órfãos ou duplicidade.
3. Confrontar cada socket de saída do proxy com exatamente um backend da base, usando `pg_stat_activity.client_addr/client_port` e a tupla de destino, sem backend ou socket órfão; exigir zero advisory locks. A consulta de laboratório foi, em essência, `SELECT pid, host(client_addr), client_port FROM pg_stat_activity WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()` e `SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`, numa transação `READ ONLY` com timeout. O próprio backend dessa consulta é excluído por PID, nunca por papel, endereço compartilhado ou `application_name`.
4. Reamostrar banco, sockets e identidades ao redor do gate. Churn ou processo substituído deve negar. Isto ainda é amostragem, não isolamento atômico: a contenção e a exclusividade de executores continuam necessárias.

Mesmo esses conjuntos completos **não revelam qual socket de entrada corresponde a qual socket de saída** do proxy. No [código TCPProxy do Moby 29.2.1](https://github.com/moby/moby/blob/docker-v29.2.1/cmd/docker-proxy/tcp_proxy_linux.go), o pareamento `client`/`backend` ocorre dentro de `clientLoop`, entre `Accept` e `DialTCP`; não há identificador de par exposto por `/proc` ou `pg_stat_activity`. A inferência coletiva “todas as entradas são da API e todas as saídas chegam ao banco” pode provar exclusividade do **conjunto** sob hipóteses estáveis, mas não o vínculo individual pedido para cada backend. Ela também requer leitura privilegiada dos FDs do proxy, indisponível ao executor atual. Contagens iguais por si sós nunca são critério de autorização.

## Ensaio isolado

Foi reutilizado um compilado existente da API em Node 20, com banco PostgreSQL sintético descartável, providers/outbound/schedulers desabilitados. A máquina local não disponibilizou o daemon Docker Desktop; por isso o ensaio **não é uma reprodução integral de contêiner, bridge e docker-proxy da VPS**. Para testar precisamente o salto TCP, foi compilado o arquivo `tcp_proxy_linux.go` do tag Moby `docker-v29.2.1` sem alterar seu `TCPProxy`, expondo uma porta local de entrada e outra de PostgreSQL. O compilado funcional da API se conectou pela porta do proxy. O código e o observador de laboratório ficaram em `/tmp/re7-proxy-lab`, fora do Git; nenhum bundle ou configuração privada foi versionado. SHA-256 da fonte Moby: `02d291950d6d1c4dcd1526ee0d6f36453bcd0117f8356b35c3cac75d2c8d05b1`; proxy de laboratório: `b4a187551666c2aa6fac55a669de3f1e09f415bb0e540d9a97ac8abaef0ad192`; observador: `1212eafd659680f3cbeda20c32304ef9afdfc4a56d74e4e27dd2e55b5c596aaa`.

| Cenário | API ↔ entrada proxy | Saída proxy ↔ backend | Resultado do observador |
| --- | ---: | ---: | --- |
| Somente API | 2/2 | 2/2 | conjunto exclusivo; identidades estáveis, zero advisory lock |
| Conexão `psql` adicional pelo mesmo proxy | 2/3 | 3/3 | negado: uma entrada sem socket da API |
| Após término da conexão adicional | 2/2 | 2/2 | conjunto exclusivo novamente |

As amostras foram repetidas durante cada cenário e compararam tuplas e inodes, não apenas totais. O laboratório prova que uma entrada desconhecida pelo proxy é detectável **com permissão para ler seus descritores**, mas não comprova o vínculo individual entre os dois lados do `clientLoop`, nem a estabilidade do mecanismo completo na rede Docker alvo. Os processos locais foram encerrados e o banco descartável removido; não houve provider, sessão ou tráfego produtivo.

## Decisão operacional mínima

**Não implantar V3 nem iniciar nova janela.** A alternativa de menor impacto agora é manter a versão compatível em execução e adiar af26; o custo é postergar essa funcionalidade, sem risco novo para sessões ou dados. Para retomar a revisão, é preciso demonstrar um mecanismo de atribuição atravessando o proxy com escopo de leitura e permissões definidos, ou revisar separadamente uma rota direta ao PostgreSQL. Um observador privilegiado de FDs poderia comprovar a exclusividade do conjunto, mas não deve ser tratado como prova de par individual sem instrumento adicional; mudar a rota do banco traz risco de configuração/rede e exige ensaio próprio. Nenhuma dessas alternativas foi implementada ou autorizada para operação.

O propósito do gate é impedir que um backend remanescente ou cliente desconhecido seja aceito como conexão da API sucessora depois da saída do proprietário antigo; a barreira de PID/descendentes/socket sozinha não caracteriza todas as sessões PostgreSQL. A decisão arquitetural pendente é **se uma prova exaustiva de propriedade do conjunto**, amparada pelo invariante um `DialTCP` por `clientLoop` e por leitura privilegiada dos FDs, satisfaz esse contrato, ou se o vínculo individual deve permanecer obrigatório. No primeiro caso, ainda faltam observador com privilégio delimitado e ensaio integral Docker/bridge/proxy com churn, cliente desconhecido, troca de identidade e retorno. No segundo, a topologia atual não expõe a relação individual: seria preciso instrumentar o proxy ou revisar a rota DB em mudança separada. Nenhuma dessas hipóteses é um V4 pronto.

Sem conexão individual demonstrada, o gate deve falhar fechado na renovação e no start do worker, em implantação e retorno. Não excluir clientes por usuário, host, `application_name` ou mera igualdade de contagens.
