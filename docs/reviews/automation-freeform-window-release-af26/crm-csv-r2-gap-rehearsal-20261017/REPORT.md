# Ensaio dos dois blocos publicados — 17/10/2026

Base `68575192cf3283c49b2a404b87c2bd9e5d2efa42`. Resultado: **LOCAL VALIDATED no alcance ensaiado / NOT DEPLOYED / NOT WINDOW READY**. CSV suspenso.

Os dois blocos de NEXT_COMMANDS.md foram extraídos literalmente, sem alteração. Oito testes dirigidos passaram em 3,558s. Launcher, reader autenticado, private_record, exportador e custódia são os consumidores publicados reais; nenhum validador foi substituído por PASS. Os hashes dos blocos e os casos constam em PROOFS.json. Reexecuções de destino existente ocorreram somente no laboratório para demonstrar negativa; não autorizam replay remoto.

## Fronteiras reais e simuladas

Bash/Python, FDs no-follow, limites, hash, validação de resposta, gravação privada e erros de acesso foram reais. SSH foi um subprocesso local que executou o exportador real. Procfs, executável Node e processos produtivos foram representações de laboratório; não há daemon, PM2 ou SQL. O proxy reutiliza privadamente os 12 argumentos históricos incluindo a flag unitária -use-listen-fd. Para frontend não há cmdline histórica bruta disponível no contexto consultado: usa-se título sintético sem marcador literal, com identidade/cwd históricos. Isso testa o bloco diagnóstico, não certifica configuração frontend.

O host executa como UID1000. Para representar UID0 exigido literalmente para proxy, bwrap usa namespace de usuário mapeado somente ao usuário não privilegiado do host, com capacidades efetivas zero; nenhum sudo/chown. Essa simulação não comprova a separação deploy/root produtiva. Uma contraprova com UID divergente usa fstat real e nega. Primeiras tentativas de representação em namespace UID1000 negaram corretamente UID65534/1000; não se relaxou o comando para obter PASS.

## Falhas e preservação

PID/ticks divergentes, leitura EACCES13, bytes do helper adulterados, resposta perdida e transferência truncada negam. Parcial remoto permanece; custódia de raw parcial não vira certificado operacional. Destinos existentes não são sobrescritos. Quatro custódias anteriores foram comparadas por hash/tamanho/modo/inode/mtime/ctime antes/depois: intactas.

Nenhuma execução remota ocorreu nesta prova. A autorização condicional do owner permite uma execução dos dois blocos intactos após publicação destas provas. Não repetir R2, supervision, Node ou seeds PM2. DENYs anteriores continuam DENY; horários não formam snapshot atômico. SQL/16 vínculos/root/toolchain/autoridade permanecem pendentes.

## Reprodução e procedência

`python3 -B test_blocks.py` no worktree, com bwrap e custódias locais existentes. Os dados históricos privados são dependências locais explícitas, não publicados; não se oferece reprodução pública desses bytes. Código do teste não contém seus valores. Fontes versionadas: NEXT_COMMANDS.md da base; read_package.py SHA66f337fb… e privileged_output.source SHA93a11451… da pasta crm-csv-r2-directed-20261017. PROVENANCE.json registra hashes completos.

Produção, NEWauth+NEWDB+NEWcipher, crons, guarda38 e out.15 não alterados. Nenhuma geração operacional ou correção do reader. Responsável: Deifson; revisão21/10 ou mudança.
