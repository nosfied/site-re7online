# Prova de propriedade do conjunto DB via docker-proxy — especificação para revisão

**Adendo 03/10 UTC:** a condução delimitou a garantia exigida pelos executores operacionais reais. A lacuna após a última amostra é comum ao V3 e à prova coletiva; por si só, não exige uma nova barreira de admissão DB. O parágrafo histórico “bloqueio de promoção” abaixo não é a decisão final. O [pacote V4 local integrado](OPERATIONAL_DB_OWNER_SET_V4_LOCAL_2026-10-03.md) preserva saída, exclusividade, contenção, supervisão, nonce e negação de clientes observados, sem alegar atomicidade. Continua NOT DEPLOYED e sujeito a revisão independente.

**PROPOSTA / NÃO IMPLEMENTADA / NOT DEPLOYED.** O gate V3 direto permanece bloqueado. Este contrato não autoriza janela, mudança de privilégio, nem substitui os certificados de saída, guarda, contenção, supervisão, nonce ou exclusividade de executor.

## Propriedade e limite do pareamento individual

O requisito operacional antes de iniciar o worker é que **somente a API sucessora exata** mantenha conexões de aplicação no banco alvo e que não exista advisory lock do banco. Antes de iniciar a API, continuam exigidos zero backends externos e zero advisory locks. O V3 vincula individualmente `client_addr/client_port` ao socket da API em TCP direto. O código não usa a identidade de *qual* socket da API corresponde a *qual* backend para nenhuma decisão posterior: só verifica que cada backend pertence à API, sem duplicidade. Assim, para a propriedade de exclusividade do **processo** API, a identidade do par individual não acrescenta uma autorização distinta **se** o proxy conhecido for uma ponte um-para-um sem multiplexação, **todos** os seus sockets forem inventariados e não houver outro caminho ao banco. O par individual ainda seria necessário para auditoria por conexão/transação ou se essa semântica um-para-um não puder ser atestada. Nenhuma dessas propriedades extras consta do gate atual como objetivo aprovado; a troca de prova exige revisão independente.

## Condições cumulativas de uma prova de conjunto

1. Validar marcador `started-API`, PID e tempo de início da API, PM2/cwd/script/config e identidade do host; fixar também PID, tempo de início, executável/hash e argumentos do **único** `docker-proxy` da publicação alvo. Exigir versão/binário com ponte um `Accept` → no máximo um `DialTCP` para o destino fixo, sem pooling/multiplexação. Hash/tag isolado sem identidade do processo vivo não basta.
2. Ler **todos** os FDs socket da API e do proxy e as tabelas TCP IPv4/IPv6/Unix do namespace correto. Classificar cada socket por inode, família, estado e duas pontas; rejeitar FD ilegível, inode ausente/duplicado, socket em abertura/fechamento, família inesperada ou socket não classificado. A publicação deve ter exatamente o listener esperado; entradas aceitas e saídas DB devem ser estabelecidas. A API não pode ter socket para outro endpoint que possa alcançar o banco alvo sem explicação.
3. Cada entrada aceita no proxy deve ter correspondência bidirecional **única** com um socket pertencente ao PID/tempo da API, pelo par de tuplas e inode de cada lado. Cada saída do proxy deve mirar o IP/porta do contêiner PostgreSQL comprovado pelo container ID, rede e argumentos do proxy; cada saída deve corresponder unicamente ao `client_addr/client_port` de um backend do banco alvo. Exigir também correspondência no sentido inverso: nenhum socket API, entrada proxy, saída proxy ou backend órfão. Não admitir outro proxy, caminho direto, socket Unix, IPv6 não modelado ou cliente interno do contêiner: qualquer backend extra bloqueia. O backend da consulta fixa `READ ONLY` é excluído só pelo seu PID.
4. Exigir cardinalidade igual **como consequência** das correspondências únicas e do invariante do binário, nunca como evidência isolada. Exigir zero advisory locks do banco, inclusive na renovação. Conferir duas amostras completas e estáveis, com identidades e topologia idênticas antes/depois; churn do pool, socket transitório, backend surgindo/sumindo, mudança de proxy/API ou leitura incompleta nega imediatamente. Não esperar um intervalo fixo até parecer estável.
5. Vincular resultado a nonce/prova atual, geração da guarda, certificado de saída, estado da contenção, PM2/supervisão/cron e lock de execução; reexecutar o gate **imediatamente antes** do start do worker em `switch`, `return`, `return-partial` e `return-front-missing`, além da renovação. Não reutilizar amostra anterior, não limpar lock/tarefa e não reiniciar ação após `start-intent`.

O código [TCPProxy do Moby 29.2.1](https://github.com/moby/moby/blob/docker-v29.2.1/cmd/docker-proxy/tcp_proxy_linux.go) cria a conexão de saída dentro do `clientLoop` de cada entrada. Essa regra sustenta inferência **coletiva** se o binário e a topologia efetivos forem os atestados. O kernel/`pg_stat_activity` não expõem o par individual de FDs; a prova depende de inventário exaustivo e do invariante do proxy. Um proxy adicional, cliente direto, IPv6, Unix ou caminho NAT não coberto deve negar, sem exceção por usuário, IP, papel ou `application_name`.

## Observador privilegiado proposto

Um executável pequeno, imutável e revisado, invocado uma vez pelo owner com argumentos **fixos** para modo e nonce validado; nenhum caminho, SQL, comando, PID arbitrário, URL ou regex vindo do chamador. Ele seleciona os PIDs por marcador e inventário PM2/Docker vinculados, verifica hashes do próprio observador e do proxy, lê somente `/proc/<api|proxy>/stat`, `fd`, `net/tcp`, `net/tcp6`, `net/unix` e a topologia Docker necessária. O acesso a FDs do proxy root exige root ou capacidade de inspeção equivalente sujeita a `procfs`/ptrace; `deploy` não a possui. A consulta PostgreSQL usa SQL fixo `READ ONLY` e timeout, com resultado restrito a backend PID/tupla e advisory-lock count. A saída auditável contém decisão, motivo, identidades/hashes, cardinalidades, período e hash da prova, sem credenciais, conteúdo ou tenant. Permissão produtiva, sudoers e instalação **não foram alterados**. Um helper com sudo amplo ou execução de shell arbitrário não atende este desenho.

## Limite temporal e matriz de laboratório

Mesmo uma amostra perfeita não é lock atômico sobre o banco. `flock` e a contenção/supervisão existentes impedem **executores cooperantes** e retorno dos processos antigos; não impedem, por si, um cliente local não cooperante de conectar-se depois da última amostra. A garantia forte “nenhum cliente pode surgir entre amostra e start” exigiria controle adicional da admissão DB ou outra primitiva atômica, sujeito a revisão própria. Sem ele, o resultado deve declarar seu intervalo de observação e esse risco residual; não prometer exclusividade temporal absoluta.

| Cenário requerido | Decisão esperada |
| --- | --- |
| Somente API sucessora por proxy atestado, todos os FDs/backends estáveis | permite, se demais gates passarem |
| Cliente desconhecido pelo mesmo proxy; outro proxy; cliente direto/Unix/IPv6 | nega |
| Entrada sem saída, saída sem backend, estado transitório, FD ilegível | nega |
| API/proxy reiniciado, PID reutilizado ou tempo de início divergente | nega |
| Backend/socket aparece ou desaparece entre amostras | nega |
| Advisory lock presente | nega |
| Renovação e retorno parcial com prova velha, nova identidade ou alvo presente | nega; somente prova nova após reconfirmação pode prosseguir |

## Ensaio representativo posterior — 03/10/2026 UTC

O Docker Desktop compartilhado permaneceu intocado. Um Docker Engine **29.2.1 rootless privado** foi iniciado em `/tmp/re7-rootless-docker-lab`, com socket, data-root e namespace próprios. PostgreSQL `16-alpine` rodou numa bridge `10.250.0.0/24`, contêiner `75e9b7985af18c374074a859d73f2fdc453d3280bb82ea7cffbe9edfcb34cf97`, publicado em `127.0.0.1:55434` pelo `docker-proxy` 29.2.1. A API af26 **compilada previamente** foi copiada por leitura e seu conjunto de 425 arquivos conferiu com o manifesto (`6e92592b41ba0a67565c3c2f62f332807a297e8f52fb884db569bbadcbead611`). Rodou em Node 20.20.0 dentro do namespace de rede privado, contra restore de banco **local sintético**, com provider/outbound e schedulers desabilitados. Não se iniciou worker, frontend ou serviço de produção. O proxy efetivo do laboratório tem SHA-256 `a7389de161928a0ffca8b5cb8732c3cd3dd2bdb05902783a2b5b982e217be5be`.

Observador descartável, fora do pacote operacional e do Git (`/tmp/re7-rootless-docker-lab/proof_lab.py`, SHA-256 `45ceb38fd25a809a3d739fda861e53f1e7d6a27c285297ca84e173d12f7dd64b`), inventariou FDs e TCP dos PIDs API/proxy, `pg_stat_activity` do banco sintético e advisory locks. **Três** sockets API→proxy, **três** entradas aceitas, **três** saídas proxy→bridge e **três** backends únicos permitiram a amostra estável. A decisão usou tuplas/inodes e inventário bidirecional; igualdade numérica não foi critério suficiente. A leitura local dos FDs do proxy rootless foi possível pelo mesmo usuário; na VPS o proxy root exige a leitura privilegiada delimitada acima.

| Caso ensaiado | Resultado | Alcance |
| --- | --- | --- |
| API como único cliente, bridge e proxy reais | ALLOW 3 | Snapshot estável no laboratório, não start produtivo |
| Cliente extra pelo proxy | DENY `unknown_or_transient_ingress` | Conexão PostgreSQL sintética independente |
| Cliente direto ao IP do contêiner | DENY `egress_backend_mismatch` | Backend não explicado pelo proxy |
| TCP aberto sem protocolo PostgreSQL | DENY `unknown_or_transient_ingress` | Entrada extra/incompleta |
| Advisory lock concedido | DENY `advisory_lock` | Lock sintético no banco isolado |
| PID/tempo esperado da API ou proxy divergente | DENY | Injeção de identidade esperada incorreta, sem reiniciar processos |
| Observação incompleta ou mudança entre amostras | DENY | Injeção no observador; churn real entre amostras ainda não automatizado |

O laboratório reproduz bridge/porta publicada/`docker-proxy` e demonstra a **viabilidade de atribuição do conjunto no instante observado**. Rootlesskit acrescenta uma camada de publicação externa que não existe no host rootful alvo; a API foi colocada no namespace do daemon para usar diretamente o mesmo `docker-proxy` da bridge. Não há prova de leitura privilegiada em produção por `deploy`, nem observador auditado e instalado. IPv6, Unix, outro proxy e conexões em fechamento requerem implementação fail-closed e ensaio específico no gate definitivo. Os quatro modos (`switch`, `return`, `return-partial`, `return-front-missing`), renovação de prova e certificado de saída **não foram integrados ou ensaiados com este observador**; os testes V3 anteriores não são atribuídos a ele.

**Bloqueio de promoção:** uma conexão local desconhecida pode surgir depois da última amostra e antes do start. O `flock`, o fence da API, o controle PM2/cron e o nonce impedem concorrência dos executores coordenados, mas não são uma barreira de admissão ao PostgreSQL para qualquer processo local. Isso permite um falso positivo temporal para o invariante enunciado, ainda que o snapshot esteja correto. Portanto V3 continua BLOQUEADO e a prova de conjunto **não foi promovida**. Menor próximo passo para revisão: decidir e demonstrar um controle de admissão ao banco que cubra essa lacuna durante o gate/start, junto com observador root de leitura estritamente fixa; só então integrar e ensaiar os quatro modos. Não se alterou rede, privilégio, DB ou serviço produtivo.
