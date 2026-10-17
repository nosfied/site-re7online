# R1/R2 — execução única encerrada em DENY, evidência preservada

Roteiro autorizado: `ad7e866c374555bd85d3c4a2d3f1b6a45d7c7840`,
crm-csv-r1r2-read-package-20261016/COMMANDS.md.
**CONSUMED / R1_R2_DENY / CUSTODY_DENY / NOT DEPLOYED / NOT WINDOW READY.**
**CSV SUSPENSO. Nenhuma repetição ou reparo autorizado/executado.**

## Resultado executivo

A etapa0 criou o diretório privado exato e transferiu uma vez os dois arquivos
inativos, sem erro. A coleta executada pelo owner na sua sessão autenticada chegou
ao reader root aprovado:18 dos19 caminhos tiveram observação, nove deles ausentes,
nove arquivos presentes. Um OSError em `/proc/sys/kernel/random/boot_id` tornou a
resposta root RAW_INVENTORY_DENY/exit1. O coletor parou após esse primeiro comando;
os outros cinco comandos não foram executados.

A etapa2 foi executada uma vez. SSH/export retornou0 e preservou a cópia privada
byte-exata do recibo original:87.778 bytes, SHA256
`931c9c39a6332ab4bea8a57869767c78a57eecce164ecd006346e85f44983529`.
A validação canônica de ingestão negou `command_count` (um comando em vez dos seis
exigidos). Há diagnóstico canônico do transporte e terminal R1R2_CUSTODY_DENY,
**não** R1R2_CUSTODY_COMPLETE_NOT_CERTIFIED. Nenhum registro da coleta foi ingerido
como sucesso. Transferência/preservação verificadas não são custódia completa.

[Projeção sanitizada e hashes](SANITIZED_RESULT.json);
[procedência](PROVENANCE.json). Nenhum byte de política, cron, ambiente, stdout
bruto ou journal privado é publicado. Não houve leitura remota adicional depois
da negativa; toda análise posterior usou exclusivamente a cópia local privada.

## Cronologia e autenticação

Branch/HEAD/remoto e hashes revisados foram conferidos, inclusive a cópia
canônica de private_record. O pai privado local era owner700 e o destino não
existia. Materiais locais preexistentes foram preservados.

A sessão interna da ferramenta ficou aguardando sudo, mas não oferecia ao owner
um terminal operável. A orientação inicial foi inadequada; essa sessão foi fechada
**sem executar a coleta**. Não foi usado ticket de outro TTY. O owner autenticou
sua própria sessão e executou uma vez o bloco já publicado. O recibo fixa o SHA
do reader aprovado também no stdin da única chamada sudo; a aparência truncada
da colagem no chat não demonstra falha de sintaxe nem é a causa do DENY observado.

| Marco | UTC observado | Fortaleza |
|---|---|---|
| Início coleta |17/10/2026 01:22:00.199014 |16/10/2026 22:22:00.199014 |
| Início root |17/10/2026 01:22:00.199522 |16/10/2026 22:22:00.199522 |
| Fim root/exit1 |17/10/2026 01:22:00.349350 |16/10/2026 22:22:00.349350 |
| Diagnóstico transporte local |17/10/2026 01:22:40.789807 |16/10/2026 22:22:40.789807 |
| Custódia DENY local |17/10/2026 01:22:40.792502 |16/10/2026 22:22:40.792502 |

Esses horários vêm dos registros, não são estimativas de indisponibilidade HTTP.
Não houve contenção/parada ou janela. Não foi repetida autenticação para tentar
reexecutar uma coleta negada. Os destinos de coleta/custódia permanecem consumidos
para esta tentativa; não limpar, sobrescrever ou retomar o mesmo destino.

## Observação atual versus histórico/proposta

A observação é parcial, multiarquivo e não atômica. Os FDs/metadados do reader
mantêm o alcance descrito no roteiro; o resultado agregado é DENY.

| Alvo | Observação atual | Comparação, sem alteração |
|---|---|---|
| helper |root0644/nlink1; hash8de358fd… |igual ao helper histórico; diferente da extensão futura19a67b… |
| sudoers |root0440/nlink1; hash62b5a2ac… |igual ao histórico; diferente da proposta futuraa6fc80… |
| política |root0600/nlink1; hashe2a5ffab… |igual à política original-only histórica instalada na recuperação; não é fa113e… |
| Sete bibliotecas/launchers futuros |ausentes |não foram instalados; ausência não implica remoção indevida |
| alias pm2-input.json |ausente |não foi criado nem seguido destino |
| Diretório de recibos static-authority-installs |ausente |não foi criado |
| lock canônico |arquivo root0600/nlink1 observado |não aberto para escrita/lock nem alterado |
| cron de sistema |arquivo root0644 observado |conteúdo preservado apenas em custódia; funcionamento/comparação de controles não certificados |
| saved/fallback |dois arquivos deploy0600/nlink1 com hashes iguais |observação dos arquivos; não prova correspondência com processos/ambientes atuais |
| Event |arquivo0664; cinco pais0775 |a ida futura negaria pelo predicado canônico Event dos pais; sem chmod/reparo |

Os hashes completos e a correspondência dos dez alvos protegidos estão no JSON
sanitizado. A diferença entre o instalado e o kit futuro é esperada como pendência
de instalação/revisão, não evidência de adulteração. O pin histórico fa113e… dos
consumidores continua um bloqueio de composição futura; não foi substituído por
e2a5ffab… para obter PASS.

ORIGINAL permanece independente do código candidato e do gate de overlay Event;
esta coleta não executou ou recertificou recuperação alguma. NEWauth+NEWDB+NEWcipher,
frontend, processos, controles, guarda38 e out.15 não foram alterados. A preservação
por ausência de intervenção não é uma observação fresca dessas condições.

## Falha identificada e limite da análise

Fato produtivo: o reader aprovado registrou **OSError no caminho boot_id**. Seu
registro guarda classe/caminho/intervalo, mas não errno ou traceback do alvo.
Portanto a causa exata/errno produtivo não está comprovada. Não houve nova leitura
na VPS para completar esse diagnóstico.

Análise local dirigida, sem nova suíte: a mesma função observe, com os mesmos bytes,
foi chamada apenas para o boot_id **local** e também levantou OSError, errno12
(ENOMEM). Isso aponta uma incompatibilidade reproduzível do leitor genérico com
a leitura desse arquivo virtual no laboratório; não prova que o errno na VPS foi12,
nem que falta memória em produção. Nenhuma alteração no reader foi feita, nenhum
limite reduzido, pin adaptado ou input atualizado, nenhum novo destino preparado.

Fato de custódia: a primeira exigência local não satisfeita foi command_count,
pois existem begin + um resultado root + end/DENY. Mesmo superado esse ponto,
root exit1/accepted=false e terminal RAW_READS_DENY continuariam impedindo sucesso.
Essa verificação local não reingere nem modifica o original.

## Dados que continuam desconhecidos

Não rodaram deploy-cron, supervision, process-discovery, listener-discovery e
tool-path-discovery. Assim, não há nova conferência dos dois crons como conjunto,
supervisão efetiva, trio de identidades/configurações, listeners/ownership, caminho
do toolchain ou boot_id válido. O PID do daemon foi só um arquivo observado, sem
identificar a população viva. SQL/R3 e closure transitiva R4 não foram iniciados.
Não há RPO/capacidade/backup novos nem autoridade/permit instalados ou emitidos.

Os16 bindings e os demais inputs faltantes continuam sem materialização. A
observação parcial não permite promover a composição a certificada ou pedir
janela. A revisão futura pode avaliar o tratamento local de arquivos virtuais e
seus diagnósticos; este relatório não autoriza corrigir/repetir a tentativa.

## Preservação privada e publicação

A custódia fixa csv-r1r2-read-20261016-v1 conserva:
original-capture.private.jsonl, transfer.stdout.private, transfer.stderr.private,
privileged-output.private.jsonl e sequencer.journal.jsonl. Os cinco são owner600 em
diretório700; hashes/tamanhos estão publicados como procedência, sem seus conteúdos.
A cópia original confere com os bytes exportados e o hash do envelope remoto.
Não se alega identidade histórica/snapshot atômico a partir desse checksum.

O transporte teve stdout117.494B, stderr0B, exit0. A ingestão não publica os registros
de coleta no novo journal porque recusou antes dessa fase; o diagnóstico do
transporte e da negativa permanecem. Não editar o recibo DENY para mudar estado.

Publicação restrita a este relatório, projeção sanitizada, procedência, allowlist,
índice de hashes e três checkpoints. Código/roteiro/consumidores e históricos
aceitos intocados. Nenhum bruto, política, cron, ambiente ou journal foi adicionado
ao Git. Deploy continua desabilitado para a branch; CI versionado só main/develop.

Responsável Deifson. Revisão17/10UTC (16/10Fortaleza); próxima21/10 ou mudança.
**Tentativa encerrada em DENY; sem replay, reparo, instalação ou janela.**
