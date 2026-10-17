# Primeira conferência CSV — pacote R1/R2 fechado para revisão

Base: `6fbb36f9f8e0af1cf7ac3deed46f1d9bf13425d3`.
**LOCAL READ-PACKAGE VALIDATED / REVIEW PENDING / NOT DEPLOYED /
NOT WINDOW READY. CSV SUSPENSO.**

## Entrega e alcance

[Roteiro único](COMMANDS.md), com ferramentas inativas, coleta e transferência
privada/ingestão. Não é certificação operacional. A primeira etapa deixa de
depender dos resultados desconhecidos de SQL/ownership/toolchain: coleta somente
as observações que orientarão essas próximas leituras. Nenhum SSH/SCP, sudo,
comando remoto, backup, instalação, emissão, preparação operacional ou janela foi
executado. Nenhum pin, binding ou consumidor operacional foi alterado.

O HEAD e remoto coincidiram com a base. Instruções/checkpoints do runbook, backlog,
índice, política/checklist e reconciliação anterior consultados. Nenhum AGENTS.md
aplicável foi encontrado nas verificações anteriores/checkout; não há regra nova
inferida de materiais privados. Trabalhos não rastreados, .data, local-evidence e
gerações consumidas permanecem intocados. Só novos leitores de revisão e três
checkpoints são publicados, além da cópia sanitizada já pública do escritor.

## Inventário completo, sem presunção de instalação

[TARGETS.json](TARGETS.json) contém os nove alvos de arquivos do instalador estático
futuro e seu alias. Os hashes são os da composição **atual** aceita f9a0a44a…,
não os hashes antigos do INSTALL_PLAN B4. São comparandos de bytes futuros,
**não** pins mudados nem afirmação de presença/UID/modo na VPS:

- authority.py, root_store.py, verified_loader.py, child_transport.py;
- privileged_output.py, recovery-launch.py, recovery-node-launch.cjs;
- incident-6683-window-control.py, sudoers re7-incident-6683-window;
- alias pm2-input.json, link esperado /proc/self/fd, sem seguir o destino.

O reader acrescenta nove caminhos auxiliares fixos: política atual, cron de
sistema, lock, diretório de custódia estática, pm2.pid, saved/fallback, boot_id e
Event. Total19. O único sudo futuro executa o reader aprovado por stdin para
observar esse conjunto literal; não executa helper ou arquivos lidos. Não cria
alvos, links, locks ou permissões. O corpo da composição não foi copiado/executado.

Cada alvo ausente registra kind=absent e ancestral ausente quando aplicável.
Arquivo/diretório/link/tipo inesperado são distinguidos por lstat. Somente regular
é aberto para hash; alias é readlink; nenhum alvo especial é aberto. Um pai link
ou erro de leitura é negativa, não ausência. Conteúdo copiado é restrito a CONTENT;
dumps PM2 fornecem hash/metadados e não exportam ambientes. Isso é descoberta, não
aprovação dos predicados de start/instalação/Event. Event775 continuará negando ida
na verificação operacional canônica; nenhum chmod está proposto.

## Transporte e custódia concretos

A coleta futura usa `/dev/shm/re7-csv-r1r2-read-20261016-v1`; custódia local do
owner em `re7-private-retention-custody/csv-r1r2-read-20261016-v1`. Caminhos absolutos,
comandos e etapas por terminal estão no roteiro. Pai local existente owner700;
novos destinos exclusivos700; evidências600. Existência prévia, symlink, owner ou
modo inadequado negam antes da captura/gravação pertinente. Não há correção
automática, overwrite, retomada ou remoção. A reserva do diretório novo impede
repetir a tentativa para o mesmo destino, inclusive após falha.

`private_record` é exatamente a fonte versionada canônica de
v4-sequencer/privileged_output.py. A cópia `privileged_output.source` mantém seus
bytes/hash, inclusive o allowlist original inalterado. Apenas a função de escrita
é consumida; não se chama ou amplia run_privileged. O código de revisão é carregado
pelos **mesmos bytes** após conferência de hashes literais do roteiro; esses bytes
vão também por stdin ao reader root e ao exportador. Não é uma autoridade de fase.

Os seis comandos têm um registro cada, com argv, tempo, stdin/tamanho/hash, exit/error,
accepted e stdout/stderr em base64/tamanho/hash no journal canônico. Falha interrompe
os comandos seguintes e grava terminal DENY quando o destino ainda é gravável.
Se nem esse registro puder ser escrito, o erro externo é estático e não se afirma
custódia. Não há fallback de destino. Conteúdo sensível nunca vai ao resumo público.

A transferência futura é um SSH autenticado em BatchMode/StrictHostKeyChecking,
sem sudo. O exportador lê o journal regular owner600/nlink1 pelo mesmo FD, sem
seguir link, confere estabilidade e envia envelope + bytes. O transferidor guarda
stdout/stderr inclusive em timeout/parcial; verifica o tamanho/hash dos bytes
originais, preserva `original-capture.private.jsonl` sem reserializar e só então
confere cada registro/resultado. A ingestão usa private_record; não substitui ou
reescreve o recibo original. `write_artifact` faz somente cópias O_EXCL de bytes
transportados, não é outro escritor de journal. COMPLETE só é gravado depois de
todas as verificações. Captura DENY/parcial pode ser transferida para preservação,
mas não recebe COMPLETE. Toda tentativa tem destino consumido, sem retry.

## Provas dirigidas e limitações

[PROOFS.json](PROOFS.json):17 testes deste pacote PASS, sem repetir suítes aceitas.
Cinco blocos de roteiro passaram bash -n; o launcher publicado negou reader
adulterado antes de dispatch. A validação do roteiro também removeu uma restrição
indevida sobre o modo dos fontes públicos do worktree: os mesmos bytes são
conferidos por hash literal, sem chmod; destinos privados continuam700/600.
A ordenação do inventário documental foi alinhada ao reader, sem mudar o conjunto.
Primeira rodada14; segunda17 após acrescentar timestamp por alvo, descoberta de
ferramentas não resolvidas e três negativas/interfaces pertinentes. Ausência de
PM2 no PATH fixo é descoberta NOT_RESOLVED_IN_FIXED_PATH, não dependência para
fechar R1/R2. Nenhum rebuild. Execução e procedência em PROVENANCE/PROOFS.

Reais no laboratório: FDs de diretórios/arquivos Linux, O_NOFOLLOW, lstat/readlink,
hashes/base64, mudança por os.replace, modos de arquivos novos, journal canônico
com append/fsync e conservação byte-exata, processos Python filhos/pipes para
respostas sintéticas. Um comando-v real com PATH vazio prova descoberta sem PM2.
Permissões foram alteradas **somente em fixtures temporárias** para contraprovas.

Simulados explicitamente: root/sudo e namespace produtivo; dados dos19 caminhos;
respostas cron/processos/ss/systemd; rede SSH e host remoto; PermissionError
injetado (não uma prova de ACL produtiva). Não houve SSH/SCP nem cliente PM2 real.
O runner de transporte injeta envelope/timeout/erro, não prova autenticação SSH ou
cache sudo do owner; esses serão precondições futuras. Os verificadores do pacote,
o exportador, os hashes e o escritor canônico não foram substituídos por PASS.

Contraprovas: ausência sem criação, pais symlink sem travessia, leitura negada,
substituição concorrente real, resposta root inválida, timeout com bytes parciais,
resposta SSH perdida sem repetição, truncamento/hash adulterado, bytes de comando
incoerentes, modo/link indevido no journal, destino inadequado e tentativas
consumidas. Não ocorre COMPLETE nas negativas. A cópia do escritor adulterada
nega antes de criar o diretório de coleta.

**Não há captura atômica.** Cada FD vincula seus bytes observados; comparações de
metadados pré/pós detectam algumas trocas. Não fornecem snapshot simultâneo entre
alvos/comandos nem garantia absoluta contra alterações concorrentes/host malicioso.
Ausência/metadados correspondem aos intervalos declarados. Nenhum desses dados
atesta sozinho configuração ativa de API/worker/frontend, SQL/FD ownership, estado
atual dos segredos, crons corretos, guards, toolchain transitivo, RPO ou instalação.
Regulares têm limite8MiB e journal exportado8MiB; exceder nega, sem coleta ilimitada.

## Requisitos preservados e próximos passos

A reconciliação histórica fonte fa113e… versus última política e2a5ffab… fica para
comparação com bytes observados; nenhum deles foi trocado para PASS. O leitor não
chama inspect consumido, entrypoint de recuperação, retenção --dry-run, PM2 CLI,
R0, preparador ou código candidato. Os16 vínculos continuam derivados locais
pendentes; não foram preenchidos. ORIGINAL/PRESTOP e suas provas permanecem como
aceitos, fora da execução deste leitor.

Instalação estática, âncora root, emissão específica de recuperação e execução da
janela permanecem fases separadas e não autorizadas. SQL/ownership e integridade
transitiva serão etapas posteriores dirigidas por R1/R2; não bloqueiam esta
proposta inicial. NEWauth+NEWDB+NEWcipher, dois crons, produção, guarda38 e out.15
preservados pela ausência de intervenção, sem alegar observação nova.

Publicação somente na branch review/campaign-recovery-20260926; Vercel
deploymentEnabled=false e CI versionado só main/develop, sem configuração alterada.
Não há afirmação de inexistência de integrações externas não visíveis.
Responsável Deifson; revisão16/10; próxima21/10 ou antes de mudança.
