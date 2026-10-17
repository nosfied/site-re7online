# R2 — correção local de representação e gramática,17/10/2026

Base `6889671ea5345c8771cdf2a438a64306b8d3e7b1`.
**LOCAL VALIDATED no alcance ensaiado / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**

## Conclusão única

A correção mantém a observação de identidade/representação frontend, compara seu título com a referência histórica aprovada e preserva **scriptMarkerConfirmed=false / scriptCertification UNKNOWN,DENY** para os bytes reais disponíveis. A gramática proxy aceita cinco opções com valor e a flag unitária -use-listen-fd, negando ambiguidade e excesso. A cadeia de laboratório preserva essas observações, mas termina corretamente em **DIRECTED_INVENTORY_DENY / R2_DIRECTED_CUSTODY_DENY**, pois falta a prova canônica atual de configuração frontend. Não houve nova leitura VPS, SQL, PM2 CLI, Docker, reparo, backup, instalação ou geração operacional.

## Fonte editável e delta

[correction.py](correction.py) é a fonte editável: transforma somente o reader consumido SHA66f337fb… depois de conferir seu digest completo. Não edita esse reader nem seus destinos, manifest, comandos ou recibos. O resultado futuro é materializado exclusivamente no laboratório temporário; hash **f4056bb066ac58dbfdbb59637e21e7a4cfb6e2010886374e3f6e7d80bfda44f2**. Não há roteiro remoto novo ou pacote operacional nesta entrega.

[READER_DELTA.patch](READER_DELTA.patch) mostra o diff exato do reader composto contra a fonte congelada; não representa a documentação/testes deste incremento e não inclui a si próprio. O diff Git do commit cobre o conjunto completo. [PROVENANCE.json](PROVENANCE.json) registra hashes/procedência das fontes reaproveitadas. Nenhum código System.check_config, Contract, Operations, bootstrap/autoridade, seleção, gates, start/stop ou recuperação foi alterado.

## Frontend: observação não é certificação

- frontend_reference lê por stable_file/FD/no-follow, exige owner600/nlink1 e autentica os bytes do contexto histórico pelo digest e9a5dc97… fixado na revisão anterior. O caminho fornecido é localização, não autoridade; hash/procedência vêm da fonte revisada. Extração delimitada por PID único, cwd/perfil/script esperados. Nenhum código desse arquivo é executado. O digest é referência histórica, não autoridade de instalação/fase ou prova de frescor.
- process mantém owner/PID/PPID/ticks/cwd/imagem/FDs e rechecagem de identidade. O frontend pode devolver uma observação HISTORICAL_MATCH sem marcador literal; a representação guarda hash e procedência explícita. O título igual nunca cria marcador. Um pm_exec_path explicitamente presente e correspondente pode registrar marcador observado, mas continua sem certificar configuração; caso coberto separadamente.
- validate_frontend_observation relê a referência e valida campos/procedência, o estado UNKNOWN e a origem do marcador. Falsificar scriptMarkerConfirmed=true sem a evidência independente correspondente nega. A função de certificação não aceita boolean/VERIFIED fornecido pelo caller: falta um produtor/verificador canônico atual admissível e ela nega explicitamente.
- interval_checks relê título e referência e mantém relações antigas de imagem/cwd/listeners/canal; o resultado expõe frontendScriptCertification UNKNOWN/DENY. Só depois dessas observações, directed_inventory registra a negativa específica frontend-script-certification; o registro do frontend não é descartado. Nenhum validator/custody pode converter isso em COMPLETE.
- API e worker continuam exigindo marcador e DATABASE_CHANNEL; parent/ticks/cwd/FDs permanecem. A validação do marcador dessas duas funções não foi relaxada.

## Proxy: gramática delimitada

proxy_arguments consome tokens NUL e exige argv0 literal /usr/bin/docker-proxy, limite16384B, sem vazios, terminação NUL e no máximo12 argumentos. As cinco opções com valor são -proto,-host-ip,-host-port,-container-ip,-container-port, cada uma única e presente; somente -use-listen-fd é unitária opcional, no máximo uma vez. Duplicatas (também dentro do limite), desconhecidas, valor ausente/que é outra opção, pares faltantes, tokens soltos e excesso negam. tcp e porta5432 continuam exigidos. Não há parser permissivo por paridade.

proxy_channel mantém o nome de executable/argv0 e vincula os PID/ticks/owner0 que já constavam do diagnóstico aprovado; revalida PID/PPID/ticks e bytes depois da leitura. Não se alega hash da imagem executável proxy: esse dado não foi observado. Flags ficam separadas de args, preservando as chaves consumidas por interval_checks. A rechecagem de intervalo compara identidade/owner/args/flags/hash; R/S é estado do scheduler, não identidade, conforme o contrato existente.

## Provas executadas e suas fronteiras

[PROOFS.json](PROOFS.json), [test_correction.py](test_correction.py): **21 testes focados distintos válidos**. Vinte passaram sobre os bytes finais em4,438s; foram executados depois somente o teste de formato ampliado para atingir a negativa de duplicata dentro do limite e o novo teste de referência ausente. O reader final não mudou entre essas verificações. Iterações intermediárias locais de revisão não são promovidas a prova dos bytes finais. Não houve build ou repetição das suítes de recuperação/PM2/R1/R2 aceitas.

O laboratório reutiliza fixture e launcher concretos de test_directed.py/COMMANDS.md. Substitui somente hash autenticado da fonte futura e localização local do pacote no launcher de ensaio. Coleta→filho Python autenticado→exportação→custódia executam os consumidores reais, não callbacks PASS. O SSH é um executável simulado que transmite stdin ao exportador real em outro processo local; nenhum host remoto é acessado. Os dois lados do laboratório usam o mesmo caminho da referência; isso não é binding/certificação de futura transferência remota.

Procfs, relações/listeners/canal DB são fixtures; o frontend e proxy usam os bytes reais preservados privadamente. A imagem Node no laboratório é o executável Python local para exercitar FDs/hashes, não prova de toolchain Node. UID0 é namespace de usuário mapeado ao host UID1000, capacidades descartadas, sudo indisponível; não prova propriedade root produtiva. EACCES do kernel e substituições de arquivos são reais no laboratório. Testes de concorrência instrumentam o momento de alteração da fixture e executam o leitor/verificador real antes e depois, sem devolver aprovação artificial.

Contraprovas: título adulterado; referência adulterada/ausente/ilegível/substituída entre lstat/open; PID/ticks divergentes; API sem marcador; worker sem canal; proxy malformado/protocolo/porta/executable divergentes; mudança de título/identidade entre leituras e entre observação/intervalo; tentativa de forjar COMPLETE ou VERIFIED. PRESTOP/ORIGINAL/start não são exercitados aqui: seus códigos e provas não afetadas são preservados, não recertificados.

A cadeia completa, diante de UNKNOWN, retorna exit1 tanto na coleta quanto na custódia, mas preserva o raw exportado byte a byte e o recibo DENY pelo private_record canônico. A custódia não ingere como aprovado o conjunto negado. Cinco custódias históricas/25 arquivos são comparados por hash/tamanho/modo/inode/mtime/ctime em cada ensaio de launcher e permanecem intactos. Isso inclui os DENYs,18 observações e o gap; nenhum horário foi atualizado. Nenhum dado bruto/ambiente/cmdline entra no Git.

## Requisito exato ainda faltante

| Frente | Prova reutilizável | Falta concreta; não preenchida nesta correção |
|---|---|---|
| Frontend | Hash do título do gap coincide com o contexto histórico; identidade/cwd/imagem no intervalo de08:16 já preservados | Configuração efetiva atual associada à mesma identidade/daemon e ao perfil aprovado, suficiente para Operations.config→System.check_config/Contract, incluindo status/watch, pm_cwd, pm_exec_path/interpreter e campos/ambiente do contrato do perfil. O ambiente selecionado do gap só contém PM2_HOME. Título/cwd/hash não substituem esse vínculo. Este reader não tem fonte/verificador canônico atual para certificar isso; script continua UNKNOWN/DENY. |
| SQL | Configuração filtrada API/worker e proxy observado, sem senha pública | Identidade real de server/database/role e privilégios/ownership pelo canal/toolchain psql canônico, schema/fronteira/baselines/guard/out.15 e importações elegíveis conhecidos; nenhuma conexão/SELECT foi feita. Container atual ainda não identificado por autoridade; não executar Docker/SQL para adivinhar. capture_imports.capture exige saída/fence e grava, não será usado como leitor livre. |
| Toolchain | Node/CLI/package PM2 anteriormente observados e seeds locais byte-exatos; prova PM2 B4 reaproveitada | Closure transitiva instalada e proteção/metadados/alias/interpreter correspondentes ao kit atual, incluindo launcher/bibliotecas protegidos e futuro instalador autorizado. CLI/package iguais não certificam todos os4552 arquivos instalados nem convertem laboratório Node22 em Node20 produtivo certificado. |

Nenhuma coleta genérica nova é proposta nem R2 repetido para obter PASS. Estes requisitos dependem de futura decisão dirigida; os16 vínculos/pins/autoridade e perfis não foram fabricados. As observações históricas são de seus próprios intervalos; não há snapshot atômico, COMPLETE retroativo ou certificação global atual. As pendências operacionais do relatório de reconciliação continuam abertas dentro do seu alcance.

## Reprodução, publicação e preservação

Com bwrap e custódias locais já existentes, executar somente o laboratório: `python3 -B test_correction.py` a partir desta pasta/worktree. Fontes versionadas são autenticadas por hash; as entradas privadas exigem os hashes de PROVENANCE e nunca são reconstruídas a partir de resumos. Não há promessa de reprodução pública sem esses dados privados; a gramática usa tanto bytes privados reais quanto variantes locais. Manter caches e artefatos temporários fora da allowlist.

Mudança de ferramenta diagnóstica/local, não release funcional. Allowlist publicada separadamente; MANIFEST cobre artefatos locais sem autorreferência. Vercel deploymentEnabled=false para a branch e CI versionado somente main/develop, sem alterações. Demais worktrees/arquivos privados preservados. NEWauth+NEWDB+NEWcipher, produção, dois crons, guarda38 e out.15 não alterados nem novamente certificados. Segurança externa/aceitação de risco21/10 continua fora do escopo, sem ser declarada encerrada. Responsável Deifson; revisão17/10, próxima21/10 ou mudança.
