# Horário e apresentação de conjuntos — revisão local, 07/10/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Base `67f726450f307f472b46adf69892dea39081323b`, branch `review/campaign-recovery-20260926`. Frontend produtivo conhecido:9f4cbe0f; API/worker afbb preservados. Nenhuma consulta ou mutação produtiva adicional nesta correção, nenhum envio, alteração de agendamento ou restauração do contato4366.

## Contratos e causa

Consultados `docs/saas/CAMPAIGN_COMPOSER_LIFECYCLE.md`, `DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md`, `CAMPAIGN_IMPORT_REQUIREMENTS.md`, Result Truth, roteiro de agrupamento, backlog, handlers e histórico Git. O [registro anterior da auditoria](CAMPAIGN_SCHEDULE_FIELD_AUDIT_2026-10-07.md) preserva a distinção entre observação produtiva e reprodução isolada.

O efeito dependente de selectedCampaign colocava UTC textual no datetime-local e compartilhava o estado com o composer. Seleção automática, mesmo com modal fechado, contaminava uma campanha nova; polling sobrescrevia edição. A correção usa dois estados, hidratação do detalhe uma vez por abertura/seleção e componentes locais da data. Null limpa o detalhe no limite explícito. Reset e dirty detection incluem o horário do composer. Reabertura deliberada recarrega o valor persistido.

O contrato existente é hora civil do navegador, também usado pela apresentação Intl. America/Fortaleza:12:40→15:40Z, comprovado nos payloads dos dois handlers. Não se fixa silenciosamente um novo fuso do tenant para navegadores em outra zona.

## Controlador, conjunto e filho

Os IDs observados no caso out.11 são registros legítimos: controlador `cced263e-dd8f-49d9-89be-ef8a8ab45e96`, conjunto `06df74d4-aafd-4698-8cc5-aaf3b126e96b`, filho `26a58fb3-a8ee-43c3-82c6-2715c7014fb0`. O scheduler cria o snapshot/filho; a projeção executionBatch agrega os resultados. Não são duas submissões comprovadas nem registros para apagar.

A lista existente não traz os vínculos completos; o detalhe autorizado traz executionBatch/chunks. O frontend reutiliza esse GET para as linhas dinâmicas, valida ID e tenant e representa o conjunto pelo controlador quando presente. Suprime somente filhos ligados explicitamente por ID, nunca por nome, telefone ou horário. Lista incompleta ou leitura do vínculo indisponível conserva os registros; não presume relações. Controlador que também é chunk não representa outro controlador.

Totais por destinatário continuam vindo da projeção agregada existente; contadores de linhas contam representantes. Os registros filhos permanecem carregados, disponíveis por URL e por botões na tabela de lotes, com resultados e ações existentes. Nenhum RBAC, handler, status, scheduler, transporte, backend ou worker mudou. Há leituras adicionais de detalhe nas campanhas dinâmicas da página (limite existente100); não há cache, nova máquina de estados ou polling adicional. Na falha dessas leituras podem reaparecer linhas separadas, sem ocultar histórico.

## Validação do delta final

- 51 testes unitários/contratuais PASS: apresentação, lifecycle do composer e contrato da página.
- Build frontend PASS, Next16.1.5/Node22.13.0, incluindo a etapa Running TypeScript do build. Isso não atesta tipagem dos serviços/worker nem outra versão de Node. Warnings existentes de múltiplos lockfiles e Browserslist preservados; nenhuma dependência atualizada.
- Chrome real contra o frontend compilado final:13 cenários PASS em `tests/browser/campaignScheduleAndGroups.mjs`. APIs, autenticação e providers simulados, relógio do polling controlado, timezone America/Fortaleza. Seleção automática/modal fechado, composer novo, edição durante polling, reset/descarte, troca/reabertura, payload composer e detalhe12:40→15:40Z, controlador com um e vários filhos, independentes com nome igual e acesso aos filhos.
- Regressão real Chrome `tests/browser/campaignProgress.mjs`:10 cenários PASS, incluindo fila imediata, futuro, processamento/terminal/falha/parcial, resposta tardia e desmontagem. Ajustada somente a fixture de leituras auxiliares após navegação; nenhum endpoint produtivo acessado.
- Os primeiros ensaios recusaram fixtures incompletas (pagination/schedule.summary), ausência de sincronização e seletor que contava também botão interno. Fixtures corrigidas conforme contratos; logs anteriores preservados privadamente. Não foram declarados PASS nem tratados como execução de scheduler/provider.

Reprodução: `npm run build`; iniciar `node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3082`; executar `node tests/browser/campaignScheduleAndGroups.mjs http://127.0.0.1:3082` e `node tests/browser/campaignProgress.mjs http://127.0.0.1:3082`. Chrome instalado e dependências locais existentes necessários. Logs/screenshots/resultados detalhados ficam em local-evidence, fora do Git. Não iniciar API/providers.

## Publicação e pendências

Publicação somente para revisão. vercel.json exclui explicitamente a branch; CI existente só observa main/develop. Sem deploy, restart, migration, alteração de tenant ou reexecução das campanhas aceitas.

Aceites anteriores avulso/CRM estático/CSV individual/agendamento individual/dinâmica controlada permanecem nos seus relatórios e versões. Agrupamento aguarda execução natural autorizada pelo tenant; contingência AUTO positiva e CRA-PR continuam separados e pendentes. Históricos intactos;4366 não restaurado automaticamente; setembro CLOSED, SECULT/DB-only encerradas e Guia pausado. Este delta requer revisão antes de qualquer preparação de implantação.

## Complemento dirigido — leituras de vínculos (07/10)

**LOCAL VALIDATED / NOT DEPLOYED**, complemento sobre c708c99b. A implementação inicial aguardava Promise.all de todos os detalhes dinâmicos em cada refresh. Esta seção substitui aquela descrição de carga e recuperação; as provas de horário e apresentação anteriores continuam históricas, sem reatribuição.

`campaignRelationReads.ts` mantém somente vínculos explícitos e a versão observada (updatedAt/status), em memória da sessão. Detalhes já carregados alimentam esse estado; resposta antiga não substitui uma observação posterior. Nenhum nome/telefone/horário cria relação. GET bem-sucedido sem conjunto registra ausência até mudança de versão, sem esconder registros. Não há persistência local, novo endpoint ou timer.

A lista é aplicada imediatamente. Leituras complementares seguem fila com no máximo2 simultâneas, sem duplicar uma campanha pendente. Campanhas concluídas/inalteradas não são relidas nos ticks. Mudança de updatedAt/status exige nova observação, preservando o vínculo anterior durante a consulta. No caminho efetivo de materialização, campaignRunner.ts atualiza o controlador para sending na mesma transação que cria filhos; updatedAt é atualizado pelo Prisma. Isso fornece a invalidação para o snapshot, sem consultar todos os concluídos novamente. Leitura direta do detalhe também atualiza a relação.

Falha preserva relação comprovada e permite nova tentativa após30s no próximo refresh existente (ou imediatamente com nova versão); timeout continua10s no requestAppJson existente. Identidade divergente de ID/tenant não enriquece a lista. Mudança de sessão/desmontagem descarta o estado e cancela requests com AbortSignal, usando o mecanismo já existente no clienteHTTP. Respostas cujo registro/version mudou ou cuja relação foi atualizada por detalhe posterior são ignoradas. Não invalida tudo apenas porque outra lista chegou.

### Provas novas executadas

- 19 testes afetados PASS:5 do leitor de vínculos +14 de apresentação. Barreiras determinísticas cobrem fila, preservação, reutilização de detalhe, versão, falha/intervalo, descarte da sessão e tenant divergente; não são provas de provider.
- Chrome real contra build final, APIs/autenticação simuladas, relógio do polling/retry controlado:7 cenários PASS em `tests/browser/campaignRelationReads.mjs`. Lista34registros/33dinâmicos, um detalhe suspenso, falha parcial, três ticks sem alteração, atualização independente da lista, controlador ganhando filho, ausência de vínculos na lista posterior e troca de sessão/tenant com resposta velha pendente. Filho recebe data de atualização que o colocaria na primeira página; no novo tenant sem relação ele fica visível, evitando falsa negativa por paginação.
- Leituras complementares: início33/máximo2; três ticks seguintes33 acumuladas (zero novas); após intervalo/falha34; controlador atualizado35. Nova sessão33leituras/máximo2. GET do detalhe selecionado e lista são mecanismos anteriores, registrados separadamente no JSON privado; o limite2 diz respeito às leituras adicionais de relação, não ao tráfego total da página.
- Build final aprovado em Node22.13.0, incluindo TypeScript. Prova de execução em **Node20.20.0 é obrigatória na futura preparação do pacote**; não declarada nesta rodada. Nenhuma dependência alterada.

Reprodução adicional: iniciar o frontend compilado local na porta3082 e executar `node tests/browser/campaignRelationReads.mjs http://127.0.0.1:3082`. Chrome/DB/providers produtivos não são usados. Primeiro ensaio teve seletor de texto sobre lista invisível no composer; corrigida a navegação da fixture para Todas. Evidência preservada privadamente; não foi FAIL de scheduler.

Limites: lista atual continua limitada100; registros fora dela não são presumidos. Relações válidas sobrevivem a falhas, portanto atualização de vínculo removido exige nova leitura bem-sucedida. Cache de vínculos termina com a sessão/página; recarregar exige observar novamente. Consulta de detalhe pelo operador não é limitada pela fila complementar. Sem deploy, backend/worker/envios/reparo; pendências funcionais anteriores preservadas.
