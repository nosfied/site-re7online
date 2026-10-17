# Separação mínima de ELF — provas anteriores à VPS

Base: `99c2198d80c61d8904cae56fbb4d093258e236d2`.
Fonte preservada: pacote `63752b5f2b6e1d2e1718d6337b79b7f1e39d6f4f`.
**LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**

Este commit publica o delta e as provas **antes da execução remota**. A autorização
condicional do owner permite somente materialização e gates1–3 uma vez, após esta
publicação, se a separação permanecer o único delta funcional. Essa condição foi
conferida abaixo. SELECT, observador root, readelf/alternativas, instalação, emissão,
backup, reparo e janela não estão autorizados.

## Delta restrito

[FUNCTIONAL_DELTA.patch](FUNCTIONAL_DELTA.patch) mostra a única diferença funcional
em runner.run: sai o comando readelf; entra o evento
`ELF_OPERATIONAL_CLOSURE_NOT_CHECKED`, com `elfChecked=false` e
`operationalToolchainCertified=false`. **ELF/closure operacional NÃO CONFERIDA**.
Não há fallback, pesquisa de ferramenta alternativa ou PASS de toolchain.
A conferência posterior de toolchain continua requisito separado da partida.

[compose.py](compose.py) lê as fontes do SHA63752b5f e exige igualdade com os arquivos
históricos. Gera apenas arquivos novos, sem editar a tentativa consumida. A igualdade
textual de runner com a substituição única é assertada. launch/driver são iguais aos
originais após apenas a troca dos nomes do pacote/destinos exclusivos.
[DELTA_SCOPE.json](DELTA_SCOPE.json) registra procedência e condição de execução.

Do manifest de39 arquivos, somente driver.py/launch.py/runner.py mudam de hash;
36 mantêm seus bytes, inclusive node_snapshot, contracts, ops.source, SQLs,
capture_imports.source, reader66f337fb…, writer93a11451… e closure26.
O compositor de índices/roteiro e os testes são derivados das mesmas fontes aceitas;
as diferenças de teste tornam readelf indisponível e exigem o status não certificado.
Nenhuma constante de boot, identidade, Node, referências históricas, perfil ou
binding foi alterada. As representações sintéticas de laboratório são as anteriores,
não são observações/pins operacionais e não entram nos destinos da VPS.

## Controles preservados

- Manifest autenticado, file-set/closure26, metadata/FD/no-follow, limite e hash.
- Carga dos buffers conferidos; memfd selado para CJS/JSON, sem import por caminho.
- Hash/cadeia Node e FD da imagem executada, com revalidação antes/depois do filho.
- SO_PEERCRED, PID/ticks/UID e socket/pm2.pid antes/depois; um getMonitorData.
- Consumers reais Operations.config/System.check_config, população/identidades,
  env completo, frontend referenciado ao dump pré-janela, saved/fallback.
- System.db_container, binding histórico, URLs/ID/rede/publicação, limites/timeouts;
  path/version de psql por ID, sem conexão SQL nesse fluxo.
- Private_record, envelope/transferência byte-exatos, custódia de DENY/parcial,
  destinos exclusivos e nenhuma repetição ou correção automática.

`GATES_1_3_PASS`/gatePass significam apenas diagnóstico de fontes/RPC/configuração/
rota, jamais certificação de toolchain, ownership, retorno ou janela. A própria
captura preserva o evento ELF não conferido e operationalCertification=false.
Ownership continua UNKNOWN. SELECT permanece separado, sem autorização.

## Roteiro e hashes finais

[COMMANDS.md](COMMANDS.md): blocos1/2 com destinos novos `…-noelf-20261017-v1`,
bootstrap e custódia literal. O bloco3 permanece explicitamente não autorizado;
não será invocado. O manifest foi selado depois das fontes, e os blocos foram
ensaiados com os mesmos hashes agora publicados:

- MANIFEST.json: `7ff4cad23368e526a376584a7fc591eb4f4a2d2e49534f9b4541fc2d75f1971d`.
- launch.py: `2eb0b322656e0872648f2cc4d296ef6608a74d52248a93e69b7b2ef1362bba8a`.
- Todos os39 membros/tamanhos/fontes: [MANIFEST.json](MANIFEST.json).
- Índice da entrega sanitizada: MANIFEST.sha256, sem autorreferência.

[seal.py](seal.py) reutiliza o compositor anterior; o Node snapshot é referenciado
na fonte histórica em vez de duplicado. Não há geração operacional, novos perfis,
bindings ou autoridade. Os destinos anteriores e seu DENY ficam intactos.

## Provas dirigidas

[PROOFS.json](PROOFS.json): **11 PASS**, blocos Bash completos e literais desde
materialização até exportação/custódia. No namespace de cada caso, `/usr/bin/readelf`
é um bind de `/dev/null`, não executável; o transporte do laboratório também falha
e marca qualquer chamada indevida. Nenhum marcador/chamada readelf ocorreu.
No caso válido foram exigidos pm2-rpc, frontend-contract, db-route,
sql-client-path e sql-client-version, os três gates e o evento ELF com ambos flags
false. Não houve SELECT nem mesmo no ensaio desta rodada; sua prova anterior não
afetada foi reutilizada.

Negativas: fonte e bundle adulterados; daemon ausente; peer divergente antes do
RPC; resposta perdida/timeout com uma chamada e sem replay; configuração divergente
antes da rota; rota divergente antes do cliente; transferência parcial custodiada
como DENY. Substituição de arquivo após conferência não troca o snapshot executado.
A prévia não certificada de ELF não desativa nenhuma dessas negativas.

**Reais:** Bash/Python, AST/checkers canônicos, Node/Req/RPC.Client, socket Unix local,
FD herdado, memfd, arquivos, envelope e private_record. **Simulados:** SSH/VPS,
procfs/identidades/peer produtivos, referências históricas e Docker/psql. O harness
projeta explicitamente o PID real do servidor local para o peer da fixture, sem
callback que aprove verificadores. User namespace UID0 não é root do host.
Não houve PM2 CLI/daemon produtivo, SQL, rebuild, download, backup ou repetição da
suíte PM2 completa. Esta publicação não contém dados privados ou brutos.

## Limites e próxima etapa autorizada

Apenas depois de confirmar este SHA no remoto e reconferir fontes/destinos: executar
uma vez os blocos1/2 intactos. Qualquer DENY encerra sem retry/fallback e será publicado
em resultado separado; outra correção funcional exige revisão, sem aplicação em campo.
A tentativa anterior continua CONSUMED/DENY e não é reclassificada.

Auth/banco/cifragem, frontend, crons, guarda38 e out.15 não são modificados. Segurança
externa/revisão21/10 permanece separada. CSV não é retomado, não há janela pronta.
Publicação restrita à allowlist; deploymentEnabled=false para a branch e CI apenas
main/develop são conferidos antes do push, sem alterar essas configurações.
