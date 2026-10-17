# Complementação R1/R2 como deploy — correção local

LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.
CSV SUSPENSO. Base96a9bef74896b0d0286b904ce208efb9eda098e5.

## Causa e delta restrito

A segunda tentativa negou em `sudo -n`, antes de produzir boot_id; nenhum dos
cinco comandos seguintes executou. Ler esse arquivo virtual não exige root.
A nova `specs` usa `/usr/bin/python3 -B -I -S - boot`, diretamente como deploy.
O dispatcher passa a chamar essa ação `boot`. Somente docstring, comentário,
destinos exclusivos novos e esses dois pontos mudaram no reader. O diff exato
está em [READER_DELTA.patch](READER_DELTA.patch). Nenhum fallback, nova função
operacional ou alteração de permissões/sudoers foi introduzido.

`observe`, seleção prévia de64B, única os.read, formato UUID/newline, FDs,
no-follow, limites, estabilidade e errno permanecem byte-exatos. As16 provas
anteriores continuam válidas nesse alcance; não foram repetidas. `private_record`
é o mesmo93a11451…; seu módulo também define run_privileged, mas o reader só
carrega private_record e não chama a função privilegiada. Não confundir ausência
de chamada com ausência da palavra sudo no módulo canônico preservado.

## Comandos finais e limites de autorização

[COMMANDS.md](COMMANDS.md) contém precondição local, disponibilização inativa dos
dois arquivos, launcher de coleta e launcher de transferência/custódia, com hashes
e três destinos inéditos. A versão anterior não será reutilizada. Não há sudo-v,
sudo-n, senha, ticket de TTY ou helper em qualquer comando desse roteiro novo.
Falha/timeout/divergência/destino existente: parar, preservar, sem retry; custódia
pode preservar o DENY pelo bloco previsto. Nenhuma execução na VPS foi feita
nesta correção. O roteiro precisa de aprovação própria antes da coleta.

## Prova concreta e distinção das fronteiras

Quatro testes dirigidos passaram, [PROOFS.json](PROOFS.json). Reprodução:
`python3 -B test_launcher.py`, dentro desta pasta. Requer UID não zero, bwrap e
as duas custódias privadas existentes nos destinos canônicos. Esses inputs brutos
não são publicados nem substituídos por fixture que force o validador a aprovar.

O teste extrai e executa **verbatim** os blocos bash de check-origin, collect e
custody de COMMANDS.md. Nenhum monkeypatch modifica o reader, seus hashes ou
validadores. bwrap mantém UID1000, derruba capabilities e monta raiz read-only;
destinos novos são bind mounts em /tmp e as custódias antigas são read-only.
`command -v sudo` falha e a execução absoluta de sudo é negada no namespace.
A primeira montagem de laboratório e o shebang das respostas sintéticas precisaram
correção durante o ensaio; isso não alterou o reader entregue nem executou VPS.

Reais: launcher, subprocesso Python/boot_id local, export por stdin em outro
processo, checks de origem/bytes/metadados, custódia e journals canônicos.
Sintéticos: respostas de crontab/systemctl/ps/ss; caminhos node/pm2; SSH substituído
por executável local que confere argv/stdin e invoca o exportador real. Shell e
command-v são reais; node e PM2 não são executados. Não houve acesso de rede.
O isolamento de rede por namespace não está disponível neste ambiente; não é
alegado. O teste não certifica SSH, autenticação ou estado remoto de deploy.

Contraprovas: hash de reader adulterado nega antes da coleta; crontab sintético
exit7 encerra a cadeia e seu raw DENY atravessa export/custódia sem COMPLETE;
destinos consumidos negam sem novo subprocesso nem alteração dos journals.
O sucesso confere6 resultados, igualdade byte-exata da cópia, recibo NOT_CERTIFIED,
originalCollectionCompleted=false e atomicSnapshot=false. Conteúdo de boot_id,
crons, políticas e journals privados nunca é incluído nas provas publicadas.

## Históricos e pendências

[PROVENANCE.json](PROVENANCE.json) preserva os dois DENYs, seus hashes e intervalos.
Os18 registros são exclusivamente da primeira coleta01:22UTC17/10; a segunda,
01:40UTC, não obteve boot_id. Os dois arquivos brutos mantiveram hash, inode,
tamanho, modo, mtime e ctime no teste. Diretórios históricos foram montados somente
leitura. O receipt/journal antigo não foi reescrito. A futura complementação não
os torna atuais, atômicos ou retroativamente completos; boot retroativo é desconhecido.

R3/SQL/ownership e R4/toolchain permanecem etapas separadas, dirigidas pelos
resultados futuros; nenhum pin, binding, perfil ou permit foi preenchido. Nenhuma
instalação/emissão/backup/janela. NEWauth+NEWDB+NEWcipher, produção, ambos os crons,
guarda38 e out.15 permanecem intocados por ausência de efeitos produtivos.
Responsável: Deifson; revisão semanal21/10/2026 ou antes de mudança/gatilho.

## Publicação

Allowlist mínima:3 checkpoints e10 arquivos desta pasta (incluindo allowlist e
manifest). MANIFEST indexa todos os novos arquivos exceto ele próprio. O patch
representa apenas reader antigo→novo e não contém a si mesmo. Testes/provas/docs
completam a entrega; nenhum raw privado, cache ou local-evidence é incluído.
Vercel mantém deploymentEnabled=false nessa branch; o único workflow versionado
CI só aplica push/PR em main/develop. Nenhuma configuração foi alterada.
