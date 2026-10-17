# Três pendências — pacote diagnóstico executável LOCAL

Base/parent esperado: `9101b4f245a7ceb2bc769cb8a1388d7a179472f6`.
**LOCAL VALIDATED no laboratório / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.**
CSV SUSPENSO. Nenhum acesso à VPS, SELECT real, PM2 CLI, observador root, instalação,
backup, rebuild ou emissão de autoridade nesta rodada. NEWauth+NEWDB+NEWcipher,
crons, guarda38, out.15, custódias e DENYs anteriores não foram alterados.

## Resultado e fonte editável

[COMMANDS.md](COMMANDS.md) é o único roteiro final; substitui a descrição incompleta
da preparação anterior apenas para futura revisão, sem editar aquela entrega.
[MANIFEST.json](MANIFEST.json) ancora39 arquivos/152.298B:13 fontes/SQLs/auxiliares e
26 membros RPC existentes. Não são39 observações nem o toolchain completo de partida.
Nenhum runtime ou perfil privado foi publicado. As fontes editáveis novas são
launch.py, driver.py, runner.py e node_snapshot.cjs. seal.py produz os índices e os
blocos, não executa coleta. lab.py/test_blocks.py são exclusivamente laboratório.

- Manifest runtime: `3b3990e8fdfa5087064745ce3e2ddd9d7e704d080e21096e6b30d9e44a0439ba`.
- Launcher: `5922f70646b6e20969abaccad0e834742127822e812012dc75144ffb67805bc4`.
- Digests literais dos39 membros, tamanhos, fontes e caminhos relativos: MANIFEST.json.
- Hashes de toda a entrega: MANIFEST.sha256; escopo do delta: seção abaixo.

O owner revisa os hashes publicados; o comando autenticado recebe esses literais.
Não se afirma autoridade produtiva por argumento/variável/manifest autodeterminado.
Ordem sem ciclo: fontes e closure26 → manifest → literais do launcher/roteiro →
ensaios desses blocos → provas/relatório → delta → índice de entrega.
O manifest não contém seu próprio hash; o delta não representa a si ou ao índice
que contém seu digest. Atualizar índices não instala política ou autoridade.

## Consumo dos mesmos bytes

1. O bloco lê launch.py em FD no-follow com metadata pré/pós, confere literal e
   compila o buffer conferido. launch lê o manifest e fontes bootstrap do mesmo modo.
2. O writer93a11451… é conferido e carregado dos mesmos bytes antes dos demais gates.
   O guard do launcher preserva stdout/stderr/erro, comando, horário, código e hashes
   diretamente na custódia local nova. Sem writer íntegro ou parent legítimo não há
   escritor substituto: nega antes de agir, com erro sanitizado no terminal.
3. materialize verifica cada fonte e closure existente; registra também a leitura
   rejeitada, seu conteúdo/hash privado ou errno quando a leitura não foi possível.
   Não instala módulos nem altera fontes. bundle privado é derivado desses buffers.
4. Um único SSH BatchMode/StrictHostKeyChecking envia o bundle; bootstrap remoto
   verifica o mesmo manifest/file-set e compila driver/runner dos buffers recebidos.
   Os arquivos inativos são preservados, mas não importados depois por caminho.
5. config_consumers extrai os corpos AST exatos de System.identity/check_config/
   db_container e Operations.config de ops.c84a5e…, fornecendo o buffer verificado
   ao mesmo extrator aceito. Não executa ops.main/Operations.__init__/stop/start.
6. Node recebe snapshot CJS/JSON em memfd selado contra escrita/crescimento/redução.
   node_snapshot carrega somente closure26 e pm2_rpc_fd já aceitos, de memória,
   com resolução restrita ao índice. Nenhum require de CJS/JSON transferido mutável.
   O ELF Node é aberto por FD, com metadata igual à imagem conferida, e executado
   por esse FD mantido durante o filho; a proteção do OS/dynamic loader continua
   pressuposto explícito, não atestado de todo o toolchain instalado.
7. SQL é stdin dos buffers conferidos; classify é o corpo AST canônico, não capture().
   Nenhum arquivo/perfil/binding/permit operacional novo é fabricado.

## Gates e contratos reaproveitados

| Gate | Consumidores concretos | Prova LOCAL e limite |
|---|---|---|
|1 fontes/closure|launch.read, driver.materialize/verify, snapshot de39 arquivos; RPC26 do B4|Materialização literal PASS; fonte/closure e bundle adulterados DENY. Não certifica bibliotecas instaladas da VPS.|
|2 RPC/config|contracts.verify_peer; pm2_rpc_fd Req+RPC.Client; Operations.config → System.check_config; compare_frontend/compare_saved|FD/socket/codec/client reais no lab; dados/PIDs/ticks/peer produtivos sintéticos e declarados. Ausência/peer divergente negam antes da chamada; uma chamada por ida, sem respawn.|
|3 rota/cliente|System.db_container exato; comparação ao binding e URLs; inspect formatado sem Config.Env; psql path/version por ID|Docker e respostas simulados; predicado real nega rota alterada antes de descobrir cliente. Imagem é observação ligada ao ID canônico, não atestado pristine.|
|4 SELECT separado|identity.sql, ownership.sql, imports.sql; identidade/read_only/major16; classify exato|Bloco literal ensaiado com respostas SQL sintéticas, nunca conexão real. collect não chama SQL. Bloco3 exige recibo anterior ligado ao mesmo manifest e autorização específica; revalida1–3 em destinos novos.|

Frontend usa o env completo do dump pré-janela, inclusive comparação correta de
saved/fallback; a fonte SSH sourceProfile.front.env não vira configuração canônica.
Os campos LIVE_FIELDS continuam obrigatórios. Somente axm_monitor pode divergir no
saved; nenhuma métrica substitui script/cwd/interpreter/env/status/watch/identidade.
Hashes/ticks anteriores são referências históricas restritivas: drift nega, sem
auto-descoberta de outro PID ou atualização de perfil.

SQL usa canal canônico Docker exec/Unix socket, role/database literais, sem .env ou
senha legada, com PG* controlado somente no processo observador. Confere container
running/rede/IPv6/publicação pelo consumidor real; o ID protege a seleção dos execs.
Rota é reconferida antes/depois de cada SELECT. A imagem é imutável sob a identidade
de container no modelo Docker administrado já adotado; não há alegação de binário
pristine nem de autenticação TCP NEWDB por esse canal trust local.

Identidade SQL ou leitura de pg_stat_activity/locks não atribui executores. Sem elo
root/socket/proxy/backend e os demais controles canônicos, **ownership UNKNOWN**.
Não é executado o observador root, não há sudo nem alteração de sua delegação.
UNKNOWN de imports também não autoriza futura janela; saídas são preservadas para
reconciliação posterior, sem transformar SELECT em prova pós-saída ou liberação.

## Transporte, custódia e falha

Destinos exatos novos estão no roteiro; material local fica em tmpfs exclusivo;
launcher e captura têm custódias privadas separadas, com parent owner700 existente.
Nenhum parent é reparado. Criação é exclusiva e arquivos são600/no-follow.
Comando filho registra argv, início/fim, código/timeout/errno, stdin len/hash,
stdout/stderr len/hash/base64 e artefatos byte-exatos. Fontes e auxiliares ficam
ligados ao manifest. A transferência também registra argv real e hash/tamanho do
bundle enviado. Os buffers stdout/stderr do SSH são preservados antes da validação.

Export usa o envelope R2_DIRECTED_BYTE_EXACT_TRANSFER_V1 original; ingestão verifica
origem exata, metadata, comprimento/hash e canais de cada comando antes de registrar
pelo private_record canônico. DENY com envelope válido é custodiado com gatePass=false.
Transferência truncada/resposta perdida preserva parcial, dá CUSTODY_DENY, sem nova
conexão automática. Nesse caso a captura remota pode existir e exige decisão futura
para eventual recuperação de evidência; não se repete collect. Não há como afirmar
custódia completa de bytes que não chegaram. Falha de disco/escritor é uma condição
de parada, não licença para fabricar recibo ou sobrescrever diagnóstico.

## Provas finais

[PROOFS.json](PROOFS.json):11 ensaios dos blocos finais extraídos literalmente de
COMMANDS.md. A suíte terminou exit0; não foi repetida a suíte PM2 completa, builds,
backups, reader corrigido ou suítes funcionais antigas. Reexecuções durante esta
engenharia foram restritas aos blocos afetados por correção do harness e do registro
de falhas/entrada e de um falso DENY por atime. O bootstrap final usa exatamente
os campos metadata do leitor canônico (sem atime); cada caso força atime antigo no
bundle antes da leitura para cobrir a regressão. A prova publicada corresponde aos
hashes finais.

| Contraprova | Resultado exigido e observado |
|---|---|
|Cadeia válida, incluindo bloco SELECT separado|materialização→transferência→3gates→exportação→custódia; segundo bloco com respostas sintéticas passa seus verificadores; sem SQL real|
|Fonte closure adulterada|DENY na materialização, bytes/hash rejeitados no journal; SSH não chamado|
|Bundle adulterado|DENY antes do SSH; erro e canais custodiados|
|Daemon ausente|DENY, sem CLI/respawn, envelope de falha custodiado|
|Peer divergente|verify_peer nega antes de pm2-rpc; zero getMonitorData|
|Resposta perdida / timeout|uma getMonitorData, erro do codec, sem replay; canais/recusa custodiados|
|Configuração divergente|compare_frontend/Operations negam antes de db-route|
|Rota alterada|System.db_container/comparação nega antes de sql-client-path|
|Transferência parcial|envelope truncado preservado; CUSTODY_DENY, sem retry|
|Substituição após conferência|CJS no diretório inativo substituído; snapshot original executado, arquivo adulterado não carregado|

**Reais:** Bash publicado sem edição, Python/AST/checkers, Node e codecs PM2, socket
Unix local, FD herdado, memfd selado, processos filhos de laboratório, arquivos,
envelope e private_record. O server sintético usa Rep/Server do toolchain B4 local,
apenas como peer de laboratório; não é PM2 CLI/daemon produtivo. closure26 cliente
é a mesma referência aceita e não faz fallback para módulos globais.

**Simulados:** SSH (shim sem rede em namespace), `/proc`/PIDs/ticks/boot e perfis
históricos sintéticos, projeção explícita de SO_PEERCRED do PID real do peer local
para a identidade da fixture, localização/hash do ELF Node do laboratório, Docker,
rota e respostas SQL. Configuração/frontend/route são verificados pelos consumidores
reais; nenhuma callback substitui verificador por PASS. O user namespace UID0 mapeia
o usuário local sem capabilities, não root do host. Só namespaces de filesystem
podem criar as custódias/destinos da fixture. Nenhum dado sintético é binding atual.
A prova anterior de SO_PEERCRED real sem projeção e os testes canônicos de campos
são reutilizados no alcance aceito em9101, não promovidos a observação nova.

## Reprodução, diff e pendências

No checkout desta entrega, com Python3.12, Node local, bwrap e toolchain B4 já
preservado em /tmp/re7-b4-toolchain-20261016 (sem instalar/download):
`PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/automation-freeform-window-release-af26/crm-csv-three-gaps-executable-20261017/test_blocks.py`.
Precisa permissões do laboratório para namespaces/socket Unix; sandbox que os negue
não substitui os testes por mocks. closure pins e procedência estão no manifest e
no CLOSURE.json da entrega anterior; o server de teste reutiliza os codecs B4.

ALLOWLIST.json delimita publicação. DELTA.patch representa arquivos novos desse
conjunto e os três checkpoints, **excluindo o próprio patch e MANIFEST.sha256** para
não criar autorreferência. O patch usa contexto zero para evitar whitespace dos
marcadores de contexto em um patch versionado; conferir com
`git apply --check --reverse --unidiff-zero DELTA.patch` a partir do checkout entregue.
MANIFEST.sha256 indexa o patch e a entrega; não se indexa.
As gerações e fontes anteriores não foram alteradas. Worktrees, `.data`, caches,
local-evidence e materiais privados fora do namespace de laboratório ficam fora do Git.
Vercel mantém deploymentEnabled=false para a branch; CI versionado só atende
main/develop. Nenhum workflow/configuração foi alterado.

Próxima decisão: revisão deste roteiro e eventual autorização delimitada para
collect1–3; SELECT4 continua separado. Identidades/configuração/rota atuais,
atribuição ownership, fechamento/proteção de toolchain operacional, instalação e
autoridade de fase continuam não certificados. Não há janela pronta nem retomada
CSV. Segurança externa segue decisão de risco/revisão21/10; não foi reaberta aqui.
