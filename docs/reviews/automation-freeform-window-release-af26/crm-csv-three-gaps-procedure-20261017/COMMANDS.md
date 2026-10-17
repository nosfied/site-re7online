# Roteiro único — PARA REVISÃO; NENHUMA ETAPA REMOTA EXECUTADA/AUTORIZADA AQUI

Base08d4da27. Ordem: fontes/closure → RPC existente/configuração → canal SQL →
reconciliação offline. Não executar o reader corrigido nem entrypoints consumidos.
Estes são comandos de uma futura conferência, não A/B nem admissão/instalação.
Falha/ausência/drift/limite/timeout: preservar diagnóstico, parar; sem retry, fallback,
chmod/chown, instalação de ferramenta ou ajuste dos pins. Outputs sempre privados.
A instalação estática, autoridade, permits e janela permanecem decisões separadas.

## 0. Material e destinos, uma única vez após autorização futura

Arquivos públicos necessários no diretório inativo **novo**
`/dev/shm/re7-csv-three-gaps-tools-20261017-v1` (owner700/arquivos600), com hashes
byte-exatos do MANIFEST desta entrega: contracts.py, pm2_rpc_fd.cjs, três .sql,
RPC_CLOSURE.sha256, CLOSURE.json e a cópia diagnóstica fechada de26 arquivos em
`rpc/node_modules` (somente os membros já pinados pelo B4, sem instalar PM2/daemon).
Conferir a lista exata e ausência de arquivos/módulos adicionais nesse subtree.
Reutilizar, sem executar entrypoints:

- `ops.source`: cópia da fonte versionada `ops.py.c84a5e059cbc.source`, digest
  c84a5e059cbc75ee8114bbb36f90f92d7de7516f4433de4680cc46b592ae6d3e;
- `read_package.py` original66f337fb… e privileged_output.source93a11451…
  da entrega dirigida; só funções de arquivos/metadata/writer/export, __name__
  não-main. NÃO a composição corrigida f4056bb… nem collect/directed/custody;
- nenhum perfil/binding/permit novo. Os bytes before são lidos no caminho selado
  histórico especificado abaixo, com digest prévio, sem editar esse diretório.

A transferência inativa e o bootstrap de verificação desses arquivos deverão ser
aprovados junto com o roteiro; esta publicação não os transfere nem os instala.
Não aceitar manifest autodeterminado como autoridade: os digests esperados são os
bytes publicados/revisados pelo owner, conferidos antes de carregar ferramentas.

```bash
(
set -euo pipefail
set -C
umask 077
T=/dev/shm/re7-csv-three-gaps-tools-20261017-v1
Q=/dev/shm/re7-csv-three-gaps-observation-20261017-v1
test ! -e "$Q" && test ! -L "$Q"
test "$(stat -c %u "$T")" = "$(id -u)"
test "$(stat -c %a "$T")" = 700
mkdir -m 700 "$Q"
# Conferir neste ponto TODOS os digests publicados do material inativo antes de
# executar código, inclusive a cadeia/owner dos arquivos. Não gerar um manifest novo.
sha256sum "$T/contracts.py" "$T/pm2_rpc_fd.cjs" "$T/ops.source" "$T/RPC_CLOSURE.sha256" > "$Q/tool-inputs.private.txt"
)
```

O sha256sum acima **registra**, não aprova os bytes por si só. A condição é igualdade
com MANIFEST/SOURCE_INDEX publicados; ausência/divergência nega antes da etapa1.
O protocolo canônico de disponibilização/custódia já revisado continua aplicável;
não usar permissões mais amplas ou fonte privada implícita.

## 1. Toolchain necessário à consulta — somente arquivos, antes de qualquer RPC

Base diagnóstica fechada para a consulta:
`/dev/shm/re7-csv-three-gaps-tools-20261017-v1/rpc/node_modules`.
É cópia mínima dos26 arquivos locais já pinados, não runtime/PM2 instalado.
RPC_CLOSURE.sha256 tem26 arquivos (18 JS efetivamente carregados e8 package.json de
resolução), extraídos do mesmo toolchain B4 já pinado. Não instalar módulos ou preencher faltantes por npm. A cópia diagnóstica é
material inativo previamente revisado; ausência/layout divergente nela nega.
A árvore PM2 global observada é conferida separadamente como instalada; uma
resolução desconhecida ali não autoriza executar suas bibliotecas para descobrir.

```bash
(
set -euo pipefail
set -C
umask 077
T=/dev/shm/re7-csv-three-gaps-tools-20261017-v1
Q=/dev/shm/re7-csv-three-gaps-observation-20261017-v1
M=/dev/shm/re7-csv-three-gaps-tools-20261017-v1/rpc/node_modules
(cd "$M" && sha256sum -c "$T/RPC_CLOSURE.sha256") > "$Q/rpc-closure.private.txt" 2> "$Q/rpc-closure.stderr.private"
/usr/bin/readelf --wide --program-headers --dynamic /usr/bin/node > "$Q/node-elf.private.txt" 2> "$Q/node-elf.stderr.private"
)
```

Antes/depois desses comandos e do consumo, usar **file_chain** do original66f337fb
(somente biblioteca não-main) para cada um dos26 caminhos e o interpreter Node;
registrar link/resolved/dev/ino/mode/owner/hash pelo **private_record** existente.
Não substituir file_chain por stat/hash soltos nem anunciar atomicidade. Para Node,
reutilizar o hash observado d01614ef… como referência; ausência/drift de bytes exige
revisão. readelf lê o ELF, não executa o binário; não usar ldd sobre arquivo capturado.
O loader/DT_NEEDED resolvido e proteção dos caminhos pertencem à certificação do
OS/toolchain, sem inventar pins de bibliotecas ausentes. UID/modos/cadeias e referência
antes/depois são observações; conferência separada de proteção contra substituição
continua obrigatória antes de qualquer futura autoridade/partida.

O cliente novo não usa PM2 CLI/API/Client: não carrega connect/start/executeRemote,
que podem disparar daemon. Usa só Req + RPC.Client e um FD já conectado ao daemon.
Na consulta, a confiança nos bytes da ferramenta revisada é a do owner; não se
reivindica autoridade root instalada ou imunidade à alteração por esse owner.

## 2. Frontend — FD de daemon existente, origem real dos campos e consumidor canônico

Predicados: `Operations.config → System.check_config`, contratos do perfil e saved.
Não executar `pm2 jlist`, `ping`, `connect`, `resurrect`, `save` ou leitura de CJS.
O FD é conectado uma vez via Python e seu **SO_PEERCRED** deve apontar para o
PID/ticks/UID esperado; ausência/mudança nega antes de enviar RPC. Não basta testar
pm2.pid e depois usar um cliente capaz de iniciar daemon.

O fragmento abaixo presume etapa0/1 conferida. Ele não é wrapper de recuperação.

```bash
(
set -euo pipefail
set -C
umask 077
T=/dev/shm/re7-csv-three-gaps-tools-20261017-v1
Q=/dev/shm/re7-csv-three-gaps-observation-20261017-v1
python3 -B -I -S - "$T" "$Q" <<'FRONTEND_QUERY'
import hashlib,importlib.util,json,os,socket,stat,subprocess,sys
from pathlib import Path
T,Q=map(Path,sys.argv[1:]);P=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z')
# Read only the ORIGINAL pinned library; no corrected reader/main/collect execution.
raw=(T/'read_package.py').read_bytes()
assert hashlib.sha256(raw).hexdigest()=='66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'
lib={'__name__':'file_functions_only','__file__':str(T/'read_package.py')};exec(compile(raw,str(T/'read_package.py'),'exec'),lib)
record=lib['writer'](T);lib['directory'](Q)
spec=importlib.util.spec_from_file_location('reviewed_config_contract',T/'contracts.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
System,Operations=c.config_consumers(source_path=T/'ops.source');system=System();op=Operations();op.d=system
s=None
try:
    boot=lib['observe'](lib['BOOT_ID']);assert boot['sha256']=='f9512be026ba35cb4662d4f5ac90cc0478f8d67e68ef95eb7d9793199b8d3ce7'
    pidraw,pm=lib['stable_file']('/home/deploy/.pm2/pm2.pid',64)
    assert pm['uid']==os.getuid() and int(pidraw)==18676
    before=system.identity(18676);assert before and before['ticks']=='222727'
    endpoint=Path('/home/deploy/.pm2/rpc.sock');meta=endpoint.lstat()
    assert stat.S_ISSOCK(meta.st_mode) and meta.st_uid==os.getuid()
    s=socket.socket(socket.AF_UNIX);s.settimeout(1);s.connect(str(endpoint))
    peer=c.verify_peer(s,system,18676,'222727',os.getuid())
    result=subprocess.run(['/usr/bin/node',str(T/'pm2_rpc_fd.cjs'),str(T/'rpc/node_modules'),str(s.fileno())],pass_fds=(s.fileno(),),capture_output=True,timeout=8,env={'PATH':'/usr/bin:/bin','HOME':'/home/deploy','LANG':'C'})
    lib['write_artifact'](Q/'pm2-rpc.stdout.private',result.stdout);lib['write_artifact'](Q/'pm2-rpc.stderr.private',result.stderr)
    record(Q,lib['JOURNAL'],{'event':'PM2_RPC_TRANSPORT','utc':lib['utc'](),'exitCode':result.returncode,'stdoutSha256':lib['sha'](result.stdout),'stdoutBytes':len(result.stdout),'stderrSha256':lib['sha'](result.stderr),'stderrBytes':len(result.stderr)})
    assert result.returncode==0
    c.verify_peer(s,system,18676,'222727',os.getuid())
    assert endpoint.lstat()==meta and lib['stable_file']('/home/deploy/.pm2/pm2.pid',64)[0]==pidraw
    apps=json.loads(result.stdout);assert len(apps)==3
    by={a['name']:a for a in apps};assert len(by)==3 and set(by)=={'re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front'}
    expected={'re7-whatsapp-agent':(936386,'2193413108'),'re7-whatsapp-web-worker':(936540,'2193413523'),'re7-admin-front':(188897,'2161347676')}
    for name,(pid,ticks) in expected.items():
        identity=system.identity(pid)
        assert by[name]['pid']==pid and identity and identity['ticks']==ticks and identity['state']not in ('Z','X')
    saved_raw,_=lib['stable_file'](P/'window/saved-dump.pm2.private.json');assert lib['sha'](saved_raw)=='c9c54c02b9694328a5aeaa4335efb88135f9bd948b4f786c8e9e4e851efd51e3'
    profiles_raw,_=lib['stable_file'](P/'window/source.profile.private.json');assert lib['sha'](profiles_raw)=='a062c7020353cb39b0578653ea51475f8e9f9f68a588d1c55eb87cbbd68b6b9e'
    saved=json.loads(saved_raw);front=next(a for a in saved if a['name']=='re7-admin-front')
    # Reuse original canonical checks for pair. Frontend uses its actual before env.
    for cfg in json.loads(profiles_raw)['apps']:
        if cfg['name']!='re7-admin-front':op.config(by[cfg['name']],cfg)
    c.compare_frontend(by['re7-admin-front'],front,op)
    for name in ('dump.pm2','dump.pm2.bak'):
        value,m=lib['stable_file'](Path('/home/deploy/.pm2')/name)
        assert m['uid']==os.getuid() and stat.S_IMODE(m['mode'])==0o600
        now=next(a for a in json.loads(value)if a['name']=='re7-admin-front')
        c.compare_saved(now,front)
    for name,(pid,ticks) in expected.items():
        identity=system.identity(pid)
        assert identity and identity['ticks']==ticks and identity['state']not in ('Z','X')
    assert lib['observe'](lib['BOOT_ID'])['sha256']==boot['sha256']
    record(Q,lib['JOURNAL'],{'event':'FRONTEND_CONFIG_READ_CHECKS_PASS','utc':lib['utc'](),'atomicSnapshot':False,'operationalCertification':False,'historicalReferenceOnly':False})
except BaseException as e:
    if isinstance(e,subprocess.TimeoutExpired):
        out,err=e.stdout or b'',e.stderr or b''
        lib['write_artifact'](Q/'pm2-rpc.stdout.private',out);lib['write_artifact'](Q/'pm2-rpc.stderr.private',err)
        record(Q,lib['JOURNAL'],{'event':'PM2_RPC_TIMEOUT_PARTIAL','utc':lib['utc'](),'stdoutBytes':len(out),'stdoutSha256':lib['sha'](out),'stderrBytes':len(err),'stderrSha256':lib['sha'](err)})
    record(Q,lib['JOURNAL'],{'event':'FRONTEND_CONFIG_DENY','utc':lib['utc'](),'errorClass':type(e).__name__,'errno':getattr(e,'errno',None)})
    print('FRONTEND_CONFIG_DENY_NO_RETRY');raise SystemExit(1)
finally:
    if s is not None:s.close()
print('FRONTEND_CONFIG_READ_CHECKS_PASS_NOT_WINDOW_CERTIFICATE')
FRONTEND_QUERY
)
```

Metadados socket não são prova atômica. A checagem pré/pós e SO_PEERCRED identificam o
peer consultado; o holder permanece conectado durante a consulta. Há uma única chamada
getMonitorData; nenhum connect/start/daemon fallback na biblioteca utilizada.
Os ticks acima são candidatos históricos explícitos: mudança nega, não descobre outro
PID. O script não usa a igualdade do título frontend como prova de script.

**Before correto:** arquivo `window/saved-dump.pm2.private.json` capturado antes da
janela; igual no arquivo da recuperação aceita e no DENY. NÃO sourceProfile.front.env
herdado da sessão SSH. `contracts.frontend_expected` faz projeção efêmera e privada
do dump para o consumidor; não reescreve perfil/binding selado. `env` completo permanece
obrigatório. Em saved, somente axm_monitor pode diferir; missing/extra keys e diferenças
em env/args/interpreter/restart_time e demais campos negam. Em live, métricas monitor,
CPU/memória/uptime não substituem os campos LIVE_FIELDS nem status/watch/identity.
Campos adicionais de outra versão PM2 não são normalizados silenciosamente.

## 3. SQL — canal canônico, ferramenta e SELECT; decisão separada após2

Não usar .env, credencial antiga, POSTGRES_PASSWORD de init ou dump de segredo.
O canal documentado é Docker exec no container existente, `psql -X -U wa_agent -d
whatsapp_agent`, Unix socket/trust local já aceito no procedimento NEWDB. Isso não
é teste de senha TCP NEWDB: a validade TCP é um requisito separado se solicitado.
O DATABASE_URL efetivo vem do ambiente do processo API/worker conferido em2;
comparar somente host/porta/database/role com o canal preservado, sem imprimi-lo.

Primeiro, leitura do container conhecido e descoberta delimitada do cliente:

```bash
(
set -euo pipefail
set -C
umask 077
Q=/dev/shm/re7-csv-three-gaps-observation-20261017-v1
/usr/bin/docker inspect --format '{"Id":{{json .Id}},"State":{"Running":{{json .State.Running}}},"Image":{{json .Image}},"NetworkSettings":{{json .NetworkSettings}}}' wa-agent-postgres > "$Q/db-route.private.json" 2> "$Q/db-route.stderr.private"
# Esta primeira etapa termina na observação, sem executar cliente do container.
)
```

Etapa separada: a descoberta do cliente só ocorre depois do predicado canônico e da
igualdade ao binding histórico (referência restritiva, não atualização de autoridade):

```bash
(
set -euo pipefail
set -C
umask 077
T=/dev/shm/re7-csv-three-gaps-tools-20261017-v1
Q=/dev/shm/re7-csv-three-gaps-observation-20261017-v1
python3 -B -I -S - "$T" "$Q" <<'ROUTE_CHECK'
import hashlib,importlib.util,json,sys
from pathlib import Path
T,Q=map(Path,sys.argv[1:])
spec=importlib.util.spec_from_file_location('reviewed_config_contract',T/'contracts.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
System,_=c.config_consumers(source_path=T/'ops.source');system=System()
row=json.loads((Q/'db-route.private.json').read_bytes())
def recorded_inspect(args):
    assert args==['docker','inspect','wa-agent-postgres']
    return json.dumps([row])
system.run=recorded_inspect
observed=system.db_container()
p=Path('/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-csv-staged-v2-20261016T094000Z/window/db-owner-bindings.private.json')
raw=p.read_bytes();assert hashlib.sha256(raw).hexdigest()=='1d67ff65fc300b7bb0fb165e31a69d415d9adb5d111d3b91e444137a3a8eaeeb'
binding=json.loads(raw)
assert observed['id']==binding['containerId'] and observed['ip']==binding['containerIp']
assert observed['published']==['127.0.0.1',binding['publishedPort']]
print('RECORDED_ROUTE_CONTRACT_PASS_NOT_GLOBAL_OWNERSHIP')
ROUTE_CHECK
ID=$(python3 -I -S -c 'import json;print(json.load(open("/dev/shm/re7-csv-three-gaps-observation-20261017-v1/db-route.private.json"))["Id"])')
/usr/bin/docker exec "$ID" /bin/sh -c 'command -v psql' > "$Q/psql-path.private.txt" 2> "$Q/psql-path.stderr.private"
/usr/bin/docker exec "$ID" psql --version > "$Q/psql-version.private.txt" 2> "$Q/psql-version.stderr.private"
)
```

Antes de SQL: aplicar o MESMO predicado `System.db_container` (running, única rede,
sem IPv6 modelado, única publicação5432) aos dados completos/formatados; comparar
ID/IP/publicação ao `window/db-owner-bindings.private.json` histórico protegido por
hash no arquivo aceito. Histórico não vira binding atual: divergência nega e exige
revisão, sem atualizar esse arquivo. Comparar publicação com o proxy já observado.
`docker inspect --format` exclui Config.Env/senhas. Executar docker só após observar
seu caminho/binário/cadeia; não criar imagem/container. Se o comando/path shell/psql
não existir ou estiver ilegível, parar. Não tentar host psql/Prisma como fallback.

`command -v` e `psql --version` identificam o cliente, não emitem certificado
criptográfico. Reutilizar a confiança canônica no Docker/instalação administrada
pelo root e no container já aprovado: ID/IP/publicação devem coincidir com a referência,
Image/path/versão são registrados e comparados à fronteira backup/restore existente.
Não se acrescenta uma obrigação nova de obter um binário pristine antes de qualquer
SELECT, ausente no transporte canônico. Mudança/ausência, cliente incompatível com a
fronteira ou imagem sem vínculo conhecido negam para revisão. Hash recém-observado
não vira pin de autoridade/partida. O último ID é candidato histórico, não novo fato.
Não executar o path capturado como script: o argv final mantém o literal psql.
Integridade/proteção instalada do toolchain de partida PM2/Node continua separada.

Após essa conferência e autorização específica de SELECT, os argv e SQL são:

```bash
(
set -euo pipefail
set -C
umask 077
T=/dev/shm/re7-csv-three-gaps-tools-20261017-v1
Q=/dev/shm/re7-csv-three-gaps-observation-20261017-v1
ID=$(python3 -I -S -c 'import json;print(json.load(open("/dev/shm/re7-csv-three-gaps-observation-20261017-v1/db-route.private.json"))["Id"])')
for KIND in identity ownership imports; do
  timeout 25 /usr/bin/docker exec -i -e PGHOST= -e PGHOSTADDR= -e PGPORT=5432 -e PGSERVICE= -e PGSERVICEFILE=/dev/null -e PGPASSFILE=/dev/null -e PGPASSWORD= -e PGOPTIONS= -e PGCONNECT_TIMEOUT=3 "$ID" psql -X -w -U wa_agent -d whatsapp_agent -Atq -v ON_ERROR_STOP=1 < "$T/$KIND.sql" > "$Q/$KIND.stdout.private" 2> "$Q/$KIND.stderr.private"
done
)
```

A limpeza PG* acima é só ambiente do processo observador: não altera configuração ou senha do container/aplicação. Host vazio usa o socket Unix padrão do cliente pinado; não há fallback TCP, service file ou senha legada; -w nega em vez de pedir senha. Se esse transporte trust local não for válido, parar.

É uma conexão por escopo (identidade/privilégios, backends/locks, Event limitado),
cada transação READ ONLY/statement_timeout/ROLLBACK. Não executar essas conexões hoje.
O alvo por nome deve permanecer vinculado ao ID/imagem verificados antes e depois;
se o nome for substituído, negar. Os argv SQL usam o ID do registro previamente conferido, sem trocar bindings por observação. Não se oferece uma
prova de identidade absoluta de cluster por nome/host: a saída de identity.sql inclui
system_identifier por pg_control_system(), versão/start/address/port/database/roles; não lê pg_authid/verificadores. Se faltar EXECUTE em pg_control_system(), a consulta nega: não elevar privilégio nem substituir a identidade por nome de container.
Sem privilégio pg_read_all_stats/superuser, sessões truncadas significam incompleto.

- identity.sql: origem nova e delimitada. Executa apenas SELECT/catalogs e configura
  timeouts locais; relações listadas são escopo explícito, não auditoria de todos os
  tenants. Igualdade de database/role não prova ownership dos executores.
- ownership.sql: bytes de `System.db_backends` reaproveitados; a sessão observadora
  é excluída. Com API/worker ativos, não exigir zero artificialmente. Conexões e locks
  têm que ser atribuídos; ownership canônico exige tuplas socket/proxy/backend.
- imports.sql: SQL byte-exato de capture_imports.SQL, limite100001; classify aceita
  no máximo100000 e correlaciona tenant/operação. UNKNOWN ou atividade conhecida sem
  evidência permanece bloqueio. Não executar capture_imports.capture: exige saída,
  fence e grava recibo; SELECT prévio não fabrica o certificado pós-saída.

Para o elo root do ownership, a única ação permitida pelo contrato existente é
`sudo -n /usr/bin/python3 -I -S /usr/local/libexec/re7/db-owner-set-observer.py`, via
**run_privileged** canônico com ação `db-owner-observe` e destino privado novo, depois
de conferir fonte root/owner/modos/cadeias/hash/sudoers atuais. Não invocar aqui,
não ampliar sudoers e não usar uma geração consumida como journal. Sem delegação
legítima ou acesso, registrar incompleto; nunca trocar por contagem ou excluir PIDs.
`db_owner_set_gate.verify` conserva duas amostras completas e exige fence/HTTP/nonce
conforme o System original: produção viva pode não satisfazer isso. A próxima leitura
não é chamada de prova de saída ou liberação. Completude de atribuição exige esse elo
mais API/worker FDs e a identidade do container; não é resolvida só por SELECT.

## 4. Custódia e análise offline, sem fechamento retroativo

Preservar Q e erros mesmo se2/3 negarem. Capturas novas têm timestamps próprios.
Não copiar ambientes para Git. Destino local **novo**:
`/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-three-gaps-observation-20261017-v1`.
Usar a função export(target) do original66f337fb apenas para o journal novo Q,
transferência SSH BatchMode/StrictHostKeyChecking, envelope bytesBase64/len/SHA e
stable_file600/nlink1/owner; ingestão local pelo private_record93a11451 canônico.
stdout/stderr auxiliares devem entrar nesse journal com seus próprios len/hash/raw
privados antes de exportar, exatamente como nos pacotes de custódia existentes.
Não reutilizar `custody()` antiga que exige o header/comando consumido de R2.
O recibo novo afirma somente escopo realmente preservado, nunca COMPLETE de R2.

Este roteiro define as ações/argv/consumidores; não é pacote turnkey de coleta e
transferência. O bootstrap de materialização, envelope dos auxiliares e destinos
precisa ser selado/ensaiado numa futura autorização de pacote, com hashes aprovados.
Não há permissão implícita para executar os blocos por estarem documentados.
O subtree diagnóstico também foi testado isoladamente com só26 arquivos, codec real e FD; não há dependência de fallback às bibliotecas PM2 globais. Nenhum comando desta entrega foi executado remotamente.
