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
