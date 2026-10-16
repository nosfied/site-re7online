# Recuperação emergencial do par original — pronta para decisão restrita

CSV suspenso. **Nenhuma recuperação, instalação root, partida ou retirada de contenção executada nesta preparação.** Estado atual STOPPED_UNSELECTED; API/worker parados, frontend preservado, ambos crons contidos, gates ainda admitidos. [Comandos exatos](COMMANDS_FOR_REVIEW.txt), [hashes](HASHES.json), [provas e limites](PROOFS_SANITIZED.json).

A inspeção real passou: saída certificada, árvores/sockets antigos ausentes, SQL zero fresco, guarda38 fechada; nenhuma seleção/overlay/start-intent/started em qualquer modo, Event no hash anterior, zero eventos de admissão/processamento do ledger CSV novo. O código candidato não executou; o perfil original NEWauth+NEWDB+NEWcipher é exatamente o candidato **já selado** do modo `return-before-commit`. Não é tecnicamente necessário concluir a implantação CSV.

## Bloqueios encontrados e solução mínima proposta

1. A política instalada4bc3454d autoriza somente API candidata em switch/return. O worker de retorno já coincide com o original. A nova política **e2a5ffab…** muda exclusivamente `targetProcesses.return` para os hashes/caminhos do par original. Não altera sourceProcesses, fence, crons, daemon, savedPaths, helper ou sudoers. O instalador preserva política e fase originais, exige fase fenced e par ausente, cria fase fenced sob o novo hash e substitui somente a política. Não remove fence nem inicia processos.
2. `Operations.System.validate_bindings` requer `window/path-bindings.private.json`, ausente no pacote consumido. O adaptador separado direciona somente essa leitura ao novo diretório de recuperação e reutiliza o método canônico integral. Os dois links `.data` e a ausência do terceiro foram capturados por leitura, com hashes próprios. Hash/target/ausência divergentes negam. Nenhum arquivo selado ou binding da geração consumida é editado.
3. O CLI CSV não expõe retorno original parado. O novo invólucro chama os consumidores canônicos do modo `return-before-commit`: recover-partial → start API → start worker → finish. Não chama B, seleção, overlay, importação ou reparo. Adiciona somente novos recibos/journals canônicos no modo de retorno ainda não consumido, mantendo manifests/perfis/código originais intactos. O intent próprio externo bloqueia replay. Dispatch aceita somente o modo original e as seis ações de recuperação explicitadas.

## Provas e liberação

Passaram parser real da política sobre bytes completos, delta restrito, perfis concretos completos, fronteira pré-seleção permitida, negativas por intent de seleção/start e sintaxe dos dois blocos. A inspeção READ ONLY real passou novamente incluindo restauração válida, bindings físicos, SQL zero, ausência de árvores/sockets e eventos novos. Instalação root e efeitos de start/unfence/cron **não foram exercitados**, pois aguardam decisão explícita.

Antes do unfence: contratos canônicos exigem configurações/identidades/processos exatos, ownership DB da API antes do worker, health autenticado do worker, captura fresca completa e root target matching, save/fallback600 antes do tráfego. **HTTP `/health` da API não pode ser consultado sob a regra atual que rejeita3001**: o contrato canônico o verifica imediatamente após liberação, nos três endpoints, junto do DB, worker e frontend. Essa limitação requer ser considerada na decisão; não alegar HTTP200 pré-unfence. Nenhuma exceção de firewall foi criada.

Encerramento exige validação canônica, ambos crons e supervisão restaurados, saved/fallback600, guarda38 fechada, out.15 preservada, reset dos cinco gates e execution-authorized=false e recibo `CSV_ORIGINAL_PAIR_RESTORED`. Aceite das telas pelo owner somente depois. Falha/parcial/timeout: somente status/inspeção, sem replay. Evidências da tentativa anterior e sua fase fenced permanecem históricas; nenhuma limpeza ou reativação de segredo antigo.

**Decisão solicitada:** instalar a política original-only e executar uma recuperação original pelo comando publicado, incluindo a sequência canônica de verificação/liberação acima. Não é nova autorização de CSV ou de frontend. Sem essa decisão, o serviço permanece contido e parado.
