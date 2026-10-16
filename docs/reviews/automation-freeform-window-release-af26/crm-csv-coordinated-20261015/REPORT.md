# CSV — composição coordenada sobre o runtime ativo atestado

**Complemento de staging16/10:** [nove verificações READ ONLY na VPS e geração canônica vigente](../crm-csv-staging-20261016/REPORT.md). O binder anterior gerava nome negado por Bridge; versão v2 exige o prefixo canônico sem mudar o consumidor. Geração DENY preservada, runtimes reutilizados. Nenhum A/B executado.


**Complemento corrente16/10:** [composição operacional com perfis, políticas e instaladores preparados](../crm-csv-operational-20261016/REPORT.md). Os trechos abaixo que reservavam toda a composição para depois da janela descrevem a entrega material anterior; agora restam frescor e vínculos dependentes da janela.81 casos locais PASS, sem repetir build ou prova funcional válida. NOT WINDOW BOUND / NOT DEPLOYED.


**CONCRETE ARTIFACTS PREPARED / LOCAL VALIDATED / NOT DEPLOYED / NOT WINDOW READY —15/10/2026 Fortaleza.** Complementa111cc543 sem substituir provas históricas. [Artefatos e hashes](ARTIFACTS_SANITIZED.json), [orçamento](CAPACITY_BUDGET.json), [roteiro](WINDOW_PROTOCOL_FOR_REVIEW.md), [comandos locais exatos](COMMANDS_FOR_REVIEW.txt), [API compilada](COMPILED_PROOF_SANITIZED.json), [extração integral](ARCHIVE_RESTORE_PROOF_SANITIZED.json).

## Correção específica do total

Havia um defeito: totals.tenantVisible era calculado com operationalStatus da busca. Agora o universo permitido é definido pelo papel, não pelo filtro: **ADMIN = ativos + excluídos**, sem anonimizados; demais papéis = ativos. total filtrado e página continuam separados no mesmo snapshot. As duas partições são disjuntas pela exclusão operacional; não se soma subtotal de busca nem contatos brutos/conversas.

Prova HTTP real dirigida: incluir um excluído mantém o total permitido igual ao alternar ativo/excluído, aumenta apenas o filtrado excluído e não muda o filtrado ativo. A prova também identificou que a checagem existente de ADMIN estava na rota de statuses/detalhe, mas faltava na listagem: a listagem agora aplica403 para excluídos quando não ADMIN. Isso alinha a regra canônica já usada no detalhe/privacidade/UI, sem ampliar permissões. Primeira negativa e diagnóstico preservados privadamente. A correção passou na repetição afetada. Para ADMIN, a resposta agora faz projeção filtrada e duas partições sem filtros no mesmo snapshot, sob limite transacional15s; custo em bases maiores não foi certificado e falha não pode retornar total parcial como exato.

O artefato compilado EXATO foi executado com Node20.20.0 e PostgreSQL sintético: ADMIN ativo **5/3/3**, excluído **5/2/2**; AGENT/SUPERVISOR total permitido3 e excluídos403; anonimizado oculto. Dois contatos importados sintéticos, recibo COMPLETED, mesmo UUID não gravou novamente, GET preservado, outro tenant UNKNOWN/AGENT403 e POST sem UUID400 antes de admissão. Não são provas de busca textual usadas como substituto do filtro operacional.

## Base efetivamente preservada

A base é o runtime cifragem v14 implantado/aceito: API36f51ebe,446 arquivos e2 referências externas já aprovadas. O pacote local foi confrontado com o inventário da referência ativa pós-cifragem; os446 hashes conferem. Os quatro módulos originais a substituir também foram recompilados a partir de7f79cee6 e coincidem BYTE A BYTE com os compilados atestados. O alvo447 preserva442 arquivos e acrescenta apenas o ledger CSV; alterações nos quatro módulos são as já revisadas de CSV/contagens/auditoria. Não se exportou o dist inteiro do branch, nem a correção Prisma local.

Frontend base74a2ac2f, BUILD_ID dFvS6tFEaWQsSIIn3P702, mantido desde a implantação dinâmica; todas as fontes produtivas conferidas contra a origem atestada. Só três fontes CSV foram sobrepostas. O build passou em Node20.20.0/Next16.1.5 webpack, com os parâmetros públicos originais e sem .env. Testes preexistentes com22 erros foram excluídos do typecheck de produção, conforme a prova de base anterior; não se usou ignoreBuildErrors. Nenhum teste fora do escopo foi corrigido.

NEWauth+NEWDB+NEWcipher, reader histórico/v2 e demais deltas implantados permanecem nos bytes/configuração de origem. Worker não muda. O perfil fonte pós-cifragem continua referenciado por hash, não foi reserializado como um perfil novo. **Não há perfis PM2, políticas ou bindings operacionais novos selados nesta entrega**: dependem da futura captura/da fronteira API→frontend e não se fabricam identidades de sucessores. A referência de runtime é a última implantação atestada, não um novo certificado de PID/root/frescor; nenhuma leitura ou renovação na VPS foi executada.

## Pacotes e retorno

API candidata447 arquivos, tar24e5857f; frontend candidato23.060 arquivos/31 links internos, tar ea3d2788/BUILD_ID K6S0K4-fyO768V9W5GS7g; frontend de retorno23.861 arquivos/31 links, tar d41ddd64/BUILD_ID anterior. Ambos frontends incluem a união dos435 assets estáticos para preservar referências de abas antigas. Nenhum link externo novo em pacote selado; não se percorrem .data ou destinos produtivos. As duas referências externas da API permanecem contratos separados a conferir na janela, não membros do tar.

**Retorno final reusa a mesma API candidata**, preservando ledger/GET/UUID/replay e as contagens corrigidas; o retorno funcional preparado é do frontend. Não é rollback de código API para a versão anterior. Se o problema exigir retornar a API, manter contenção/inspeção e preparar versão compatível própria; não reativar o runtime antigo sem ledger. Um rascunho privado de API com projeção antiga foi SUPERSEDED e ficou preservado fora da entrega; não foi publicado como retorno nem executado. O produtor final reutiliza a API em vez de duplicá-la.

Os três tars de aplicação foram verificados por membros, tipos, hashes, links internos e extração isolada COMPLETA. Código da API candidata foi executado somente contra banco sintético. O frontend compilado passou no build/extração; as provas Chrome de111cc543 são reutilizadas porque as três fontes de frontend são as mesmas. O delta novo de total/RBAC foi testado na API fonte e no compilado exato. Não se repetiram suites Prisma/backend completas nem outro build válido.

## Consumidor operacional dos controles de importação

O CLI manual events:retention e storage-report importa **src/events/eventRetentionPolicy.ts** do diretório operacional, não o dist da API. Foi preparada [sobreposição auxiliar literal de um arquivo](EVENT_CONTROL_CONSUMERS.json), tar ebdfd5bb/10.240B, para manter os cinco eventos de controle CRITICAL também nesse consumidor. A origem proposta é vinculada ao hash anterior conhecido, que precisa ser comprovado no destino durante a janela: drift nega, sem atualizar input para PASS. Nenhum CLI de retenção, nem --dry-run, foi executado; sem .env/credencial nova, cron, política de tenant ou Prisma incluídos. Não inferir aplicação desse arquivo pela instalação da API: é item separado do roteiro. O retorno conserva esse classificador; não restaura um produtor que apague o ledger.

A referência canônica dos dois crons capturados não agenda events:retention. É uma observação histórica, não certificação live nova. Comandos manuais antigos de eventos permanecem suspensos até conferência de versão/política e revisão própria; a CLI de dados não faz parte do aceite desta entrega. O arquivo auxiliar foi extraído isoladamente, e o produtor publicado reconstrói EXATAMENTE seus bytes de tar. Acrescentado à custódia em índice suplementar, preservando o índice original dos oito arquivos.

## Capacidade e custódia

Mínimo planejado min(deploy,PostgreSQL) **11.235.700.736 B**, sem abatimento por limpeza: piso conservador herdado8.794.603.520 + staging/controles867.868.672 + retorno frontend835.031.040 + WAL/crescimento512MiB + backup128MiB + evidências64MiB. Retorno API extra0 porque o artefato é compartilhado. Medição inclui inodes únicos/diretórios das extrações reais e arquivos recebidos alocados; sem somar novamente dependências compartilhadas já existentes ou contar tamanho aparente como liberável. O piso herdado é uma reserva conservadora deste plano, não uma nova regra universal de retenção. Amostras deploy/PostgreSQL/WAL/erros só serão renovadas com janela definida; **CAPACITY produtivo não está certificado**.

Artefatos/índices novos preservados na custódia privada permanente do owner, fora do worktree, com oito arquivos principais e dois auxiliares/bytes conferidos, diretório700 e arquivos600. Não foi renovação de backup. A custódia é off-host em relação à VPS, na máquina do owner, sem alegar réplica física independente. Extração local certificada; receita/comandos publicados. Fontes/builds temporários e rascunho superseded ficam classificados na revisão de retenção, sem exclusão nesta tarefa.

## Gates e limite operacional

PASS local: origem ativa/446 hashes, compilação exata dos produtores originais, composição447/442 preservados, fonte frontend, build20, teste específico operationalStatus/RBAC, HTTP no compilado, ledgers/GET/sem replay, três extrações e custódia nova. Backend typecheck PASS; provas Chrome/Prisma42/restore certificado reutilizadas no alcance válido.

NÃO EXECUTADOS: perfis/bindings/políticas novos para instalação, admissão dos cinco gates, root fresco, RPO/custódia de backup renovados, capacidade/WAL produtivos, controle/saída live dos importadores, fronteira de processos API→frontend, instalação/start/save/retorno e aceite do owner em produção. A selagem operacional precisa usar os novos pacotes e evidências da janela; não usar A/B de cifragem/OpenAI ou qualquer geração consumida. O roteiro discrimina o controle global existente, a ausência de pausa seletiva CSV e os casos que NEGAM prosseguimento. A entrega material não é uma janela executável.

Sem VPS, deploy, importação real, reparo histórico, migration, .env, retenção ou abertura de guarda38. Ambos crons/out.15 CLOSED/produção preservados. Segurança externa continua OPEN, rotações adiadas por aceite para21/10 ou gatilhos. Responsável Deifson; revisão15/10, próxima21/10/antecipar ao definir janela ou mudar fontes.
