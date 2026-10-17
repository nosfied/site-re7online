# R2 dirigido — análise local e pacote para revisão

**LOCAL VALIDATED no alcance ensaiado / REVIEW PENDING / NOT DEPLOYED /
NOT WINDOW READY. CSV SUSPENSO.** Basefa72aeba3a985570207afc95d8de1766d24bfb67.
Nenhuma leitura/execução na VPS foi feita nesta rodada; não houve repetição dos
seis comandos. O pacote novo não está autorizado para coleta por este relatório.

## 1. Supervisão: comparação byte-exata, sem inferência pelo boolean

A saída de systemctl preservada às01:54:56.816074–01:54:56.826827UTC17/10
é **igual aos bytes do before**:43B, SHA256
`ce5c1c72984173c2a33e8550e0a25aaa97b21b9c7e5be1d5ac3b062059c19a25`.
O texto contém ActiveState=inactive e UnitFileState=enabled, incluindo os newlines.
A comparação foi feita com `window/initial.private.json` do pacote selado e,
separadamente, com o mesmo membro no arquivo de evidências da recuperação aceita.
Tamanhos/hashes dos arquivos/membros estão em [LOCAL_ANALYSIS](LOCAL_ANALYSIS.json)
e [PROVENANCE](PROVENANCE.json); nenhum byte privado foi publicado.

O arquivo da recuperação tem SHA32e0cb1d… exatamente igual ao publicado no
[aceite da recuperação](../crm-csv-original-recovery-20261016/RECOVERY_COMPLETE.md).
Seu independent-checks tem supervisionRestored=true às11:24:55.138543UTC16/10.
**Esse boolean não foi usado para deduzir igualdade.** O consumidor canônico
`return-before-commit/ops.py:Controls.finish` compara a saída com
initial.supervision (supervision_restore_failed); a recuperação chama esse finish.
ScheduledControls.verify(before) confere os dois crons separadamente. O arquivo aceito preserva o before e o resultado dessa
conferência; não contém stdout independente de systemctl pós-recuperação.
Essa limitação permanece explícita. Com os bytes disponíveis, não há divergência
observada do before: inactive/enabled não é defeito demonstrado nem prova de
serviço parado. A suspeita registrada anteriormente fica reconciliada por essa
igualdade, sem reescrever o resultado histórico fa72aeba.

## 2. Correlação local dos candidatos; não são identidades atuais

| Papel candidato | PID | Evidência/relacionamento observado |
|---|---:|---|
| Daemon deploy |18676|pm2.pid antigo + ps mais recente:UID1000/PPID1; título PM2 truncado |
| API original |936386|PID da recuperação aceita; ps:PPID18676; ss aponta listener3001 |
| Worker original |936540|PID da recuperação aceita; ps:PPID18676; ss aponta listener8787 |
| Frontend PM2 |188897|preservado no aceite; ps:PPID18676 |
| Filho frontend |188910|ps:PPID188897; ss aponta listener3000 |
| Proxy SQL |177517|ps:PPID176940/UID0, docker-proxy; listener5432 sem owner visível no ss deploy |

pm2.pid foi lido **apenas na coleta antiga01:22UTC**, com seu hash/intervalo
preservados; seu conteúdo indicava18676. O ps é de01:54:56.827134–.861577UTC;
o ss é de01:54:56.861999–.876741UTC. Essas leituras não são atômicas nem prova
boot/PID/ticks atual. A coluna lstart fica como calendário reportado, sem inventar
fuso; comm está truncado. O outro título PM2 observado, PID3342106/UID0, não foi
selecionado. Não consultar PM2 root nem executar CLI para resolver essa distinção.

Os PIDs do aceite fornecem candidatos, e seus ticks preservados fornecem uma
restrição contra reutilização do PID, não uma nova observação. A futura coleta
nega diante de mudança e não segue automaticamente um novo PID/daemon.

## 3. Pacote único e fechado de leitura

[COMMANDS.md](COMMANDS.md) entrega os5 blocos finais: origem local, mkdir inativo,
transferência dos2 arquivos, launcher de coleta e launcher de custódia. Hashes e
três destinos inéditos estão no próprio roteiro. SEM sudo, PM2 CLI, aplicações,
CJS, scripts capturados, Docker CLI, SQL ou instalação. Não usa inspect consumido.

O novo reader deriva do coletor já aceito. Mantém private_record byte-exato,
diretórios700/arquivos600, FDs, no-follow, limites, timestamps, errno e preservação
raw → exportador → conferência byte-exata → ingestão canônica. O patch mostra o
alcance no reader; [READER_DELTA](READER_DELTA.patch) não inclui a si próprio.
Não existe outro escritor de diagnóstico nem extensão de run_privileged.

A leitura nova é um único subprocesso Python autenticado por hash e stdin:

- boot_id64B no início/fim para ligar **este novo intervalo**; sem identidade
  retroativa. A releitura futura do pm2.pid é justificada para ligar HOME ao daemon
  atual, sem recapturar os demais18 alvos. Mudança nega, não descobre substituto.
- Quatro processos candidatos:stat/PID/PPID/ticks/UID e verificação final; cwd,
  imagem executável real por FD/hash, marcadores de script e configuração mínima.
  Daemon é o de deploy, PPID1/ticks histórico; cada app é filho do daemon, com
  cwd/script do perfil original aceito. Os fatos novos recebem bootSha256 próprio.
- Filho frontend e tabelas TCP da namespace do daemon:relações FD/inode/listener
 3000/3001/8787; proxy limitado a PID/ppid/ticks e flags de endereço/porta/protocolo.
  Não lê bytes de sockets/pipes nem enumera indiscriminadamente outros processos.
- Configuração:environ lido somente nos3 apps, limitado256KiB e filtrado. Nunca
  persiste o ambiente bruto. Credencial DB não é guardada:apenas canal, role, banco,
  sslmode e presença de senha. Não lê ADMIN_TOKEN, JWT, cifra ou tokens externos.
- PM2 canônico `/home/deploy/.npm-global/bin/pm2`, documentado em Bridge.apps:
  inspeciona links/ancestrais, target/hash e package.json, sem require/execução.
  `/usr/bin/node` vem da descoberta já preservada. Isso não fecha dependências R4.

Magic links procfs cwd/exe/fd são intencionais e documentados:cwd/fd só readlink;
exe é aberto para hash da imagem em execução. Demais arquivos mantêm no-follow.
O leitor não executa a imagem. Caminhos estáticos têm cadeia de links explícita,
limites e revalidação; nenhum chmod/chown/correção. Qualquer erro, identidade,
parentesco, arquivo trocado ou impossibilidade de leitura produz DENY identificado,
com classe/errno e raw privado quando possível, sem retry ou escalada.

Observações sequenciais não equivalem a snapshot atômico de configuração:um processo
pode alterar estado durante/depois da leitura. Rechecagens delimitam, não eliminam,
a concorrência. Este diagnóstico não é autoridade de fase, saída ou janela.
Orçamento:2 arquivos de ferramentas pequenos; hashes de imagens até256MiB, com
cache por metadados para imagens repetidas; leitura estática Node até256MiB e proc
limitado. Não há cópia/build de runtime, backup/RPO ou prova perecível renovada.
Se qualquer limite for excedido, nega em vez de truncar/afirmar cobertura completa.

## 4. Canal SQL e o que ainda falta

O histórico privado09:46UTC16/10 contém DATABASE_URL nos perfis API/worker. A análise
local conferiu que ambos apontavam loopback:5432, banco/role iguais aos literais
canônicos de capture_imports.py e senha presente; nenhum valor secreto foi impresso.
Isso é histórico. O pacote futuro observará os componentes atuais e sua concordância
API/worker/proxy. A credencial deverá vir da custódia legítima NEWDB existente,
sem extração de senha nesta coleta, .env antigo ou nova emissão. Fonte privada
local identificada:crm-csv-staging-20261016/capture-context-v2.private.json,
sourceProfile.apps[name=re7-whatsapp-agent|re7-whatsapp-web-worker].env.DATABASE_URL.
Esse arquivo é histórico; validade atual da credencial e privilégios continuam
pendentes da futura conferência/conexão autorizada. Nenhum valor é publicado.

O consumidor canônico usa historicamente Docker exec → wa-agent-postgres → psql
-X/role wa_agent/database whatsapp_agent. Não assumir container, role efetiva,
psql ou conexão por esses literais. Faltam verificação atual do canal/toolchain
psql (e identidade do container se mantida a rota Docker), credencial correspondente,
e posterior sessão READ ONLY que comprove server/database/role. Se for proposta
rota TCP direta, deverá ser revisada explicitamente; não há fallback de canal.
A imagem/proxy e configuração não provam permissões SQL nem conectividade.

A origem de atividade conhecida já preservada deve ser reutilizada/conferida para
uma futura consulta Event; não gerar histórico nem executar imports. O método
capture_imports.capture exige saída/fence e **grava** artefato pós-saída:continua
proibido como leitor livre. Nenhum SQL ou ownership root foi executado/preenchido.

## 5. Provas locais e fronteiras simuladas

[10 testes dirigidos](test_directed.py), [PROOFS.json](PROOFS.json). O teste executa
verbatim os5 blocos do roteiro, incluindo mkdir, hashes e transferência inativa, por bash, Python e
subprocessos reais, UID1000 sem capabilities, com sudo indisponível. Diagnóstico,
exportador por stdin, conferência de hashes/FDs e private_record são reais.

São **sintéticos**:procfs dos candidatos, boot, env, cwd/script markers, FDs/TCP,
PM2 package e paths. Node no laboratório é um bind de Python para testar a interface
de hash, não prova de Node/PM2 reais. SCP é um transporte local sintético que copia somente os2 arquivos com criação
exclusiva; os testes shell de hashes e dono/destino são reais. SSH é um executável
local que passa os mesmos
bytes para outro Python real, sem acesso de rede. Não há daemon PM2, container ou
SQL. Há uma prova separada do stat/FD da imagem de um processo Python **real local**,
sem publicar identidade/UUID. Metadados/efetividade da VPS não são simulados como PASS.

Contraprovas incluem PID reutilizado/ticks, pai divergente, mudança do pm2.pid,
link substituído entre lstat e readlink, ciclo, alvo PM2 errado, leaf procfs com
symlink, configuração duplicada, EACCES13 e destinos existentes sem replay. A falha
atravessa exportação/custódia DENY sem falso COMPLETE. EACCES usa arquivo vazio
novo000 no laboratório, não arquivo de segredo. O teste de EACCES foi reexecutado isoladamente após ajustar esse fixture; a cadeia
final dos10 casos foi validada após fechar os5 blocos e a revalidação dos tools.
Provas antigas não afetadas de read64/FD/custódia foram reaproveitadas, sem build.

Reprodução requer bwrap e as2 origens privadas DENY existentes somente leitura;
esses brutos não estão no Git. Fontes estáticas novas e fixtures estão na entrega.
O ensaio precisou ajustar montagem/shebang do laboratório, sem corrigir ambiente
produtivo ou produzir efeitos remotos. Não se alega validação produtiva pela contagem.

## 6. Preservação e próximo limite

Os dois DENYs,18 observações, complemento aceito e arquivos de recuperação permanecem
intactos. Novas análises referenciam hashes e horários existentes. Não houve nova
leitura na VPS, repetição de comandos, R3/R4 executado, SQL, instalação, reparo,
permissões, emissão, backup, contenção, start/stop ou janela. NEWauth+NEWDB+NEWcipher,
ambos os crons, produção, guarda38 e out.15 não foram tocados. Inputs atuais,
16 vínculos, toolchain protegido e autoridade instalada continuam pendentes.

Próximo passo:revisar e eventualmente autorizar **somente** COMMANDS.md deste pacote.
Resultados desconhecidos continuam desconhecidos. Responsável:Deifson;
revisão21/10/2026 ou antes diante de mudança/gatilhos. CSV continua suspenso.
