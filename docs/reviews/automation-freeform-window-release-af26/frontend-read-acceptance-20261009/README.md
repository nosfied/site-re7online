# Aceite dirigido frontend — leitura e edição local, 09/10/2026

**OWNER PASS nos cenários executados / limites abaixo.** Frontend fa60 corrigido, API a26dbb0e e worker mínimo reativo afbb. Sem deploy, restart, build, repetição de suíte, envio, edição de agendamentos/configurações ou reparo histórico. Owner conduziu a interface com sessão legítima; Codex consultou o read model real e registrou os relatos, sem fabricar sessão.

## Desenho e provas reutilizadas

Consultados [lifecycle do composer](../../../saas/CAMPAIGN_COMPOSER_LIFECYCLE.md), [contrato dinâmico](../../../saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md), [delta horário/conjuntos/leituras](../CAMPAIGN_SCHEDULE_AND_GROUPS_LOCAL_2026-10-07.md), [pacote e implantação](../FRONTEND_FA60F0F6_PREPARED_2026-10-07.md), backlog e caminhos efetivos `page.tsx`, `campaignPresentation.ts`, `campaignRelationReads.ts`. Estados de horário separados; hidratação do detalhe por seleção/abertura, reset do composer e hora civil do navegador. Uma lista representa o controlador somente quando há vínculo explícito de IDs, mantendo acesso ao filho. Relações em memória por sessão/versão, no máximo duas leituras complementares, sem novo timer.

Reutilizadas, sem reexecução: 13 smokes de horário/conjuntos no tar corrigido com navegador/APIs simuladas; sete cenários de leituras adicionais (máximo2, falha parcial, detalhe lento, troca de sessão, atualização de controlador). Não se atribuem essas provas isoladas ao navegador produtivo desta rodada. Contrato existente em navegador Fortaleza:12:40 civil→15:40UTC; nenhum payload novo foi enviado para testar conversão.

## Leituras backend e alteração natural do contexto

Às **12:47:05 Fortaleza**, read model ativo do Demo retornou65 registros:47 completed/3 failed/15 cancelled. Não havia scheduled/sending; esperar10s nesse contexto não comprovava polling. Identidades frontend3438948/ticks2120147745, API3625739/ticks2128115907 e worker3625960/ticks2128116272 coincidiram com o conjunto implantado.

Após o relato de requisições contínuas, nova consulta limitada às **13:34:48 Fortaleza** retornou67 registros, com os mesmos totais terminais e **dois scheduled**: `83f99b68-0da7-4db6-b4b9-a71e0876cb43` e `b019039e-0a89-4a42-9f33-c214323b888f`. Não se criaram ou alteraram essas campanhas nesta validação. O código efetivo `shouldRefreshCampaign` aceita scheduled/sending; um timer3s consulta detalhe selecionado e lista. Assim o relato não foi classificado prematuramente como bug; o baseline anterior foi preservado, sem supor estado imutável.

Owner forneceu recorte Network com **cinco GETs do detalhe83f99… alternados com cinco GETs `campaigns?limit=100`, todos200**. Não aparecem outros detalhes nesse recorte. Valores154–608ms são durações, não intervalos de polling. O total inicial relatado “±20” é aproximado e sem separação exata de endpoints, não constitui orçamento medido ou prova de excesso. Tráfego contínuo de lista/detalhe é compatível com o contrato enquanto houver scheduled; não se interrompeu scheduler para eliminar esse tráfego.

## Resultados executados um passo por vez

| Cenário | Resultado | Evidência e limite |
|---|---|---|
| Composer novo isolado de seleção automática | PASS owner | Horário inicialmente vazio; edição local10/10/2026 12:40 permaneceu por10s; primeiro contexto sem polling ativo |
| Descarte/reset de composição não salva | PASS owner | Reabertura em modo dinâmico voltou com horário vazio; nenhum rascunho persistido descartado |
| Campo local durante polling real | PASS owner | Após diagnóstico das duas scheduled, repetido apenas o passo afetado de edição local; valor10/10 12:40 preservado na espera12s com leituras ativas; nenhum botão de agendamento acionado |
| Conjunto out.14 na lista | PASS owner | Uma linha representativa, um lote e um destinatário entregue; vínculos parent44a209…/child2ee0c590… já comprovados no backend |
| Acesso ao filho out.14 | PASS owner | Detalhe do lote01/01 acessível, mesmo destinatário entregue, sem mistura |
| Troca out.14→out.13 | PASS owner | Out.13 identifica seis resultados: um enviado/entregue, um falhado e quatro bloqueados; não mantém totais out.14 |
| Leituras observadas | PASS limitado | Recorte lista/detalhe selecionado, todos200, sem releitura de outros detalhes no recorte; não é captura exaustiva |
| Máximo2 complementar, lista grande/detalhe lento/falha, mudança de sessão ou resposta tardia | NOT EXERCISED nesta produção | Provas isoladas existentes preservadas; não houve injeção de falha nem troca de sessão nesta rodada |
| Novo payload12:40→15:40Z e backend inalterado por edição | NOT EXERCISED por submissão | Contrato e provas existentes reutilizados; nenhuma submissão permitida. Leitura backend não comprova ausência de toda mutação por outros operadores |

Não há FAIL funcional demonstrado nesta rodada. O relato inicial de leituras contínuas foi investigado e explicado quanto ao timer normal; não certifica que todas as requisições possíveis sejam necessárias. Owner confirmou o descarte local final (“descartada”). Formulário novo encerrado sem salvar/agendar/enviar; rodada concluída com os limites acima.

## Pedido do owner ao arquiteto / backlog separado

Revisar como **padrão de apresentação de Campanhas** a repetição de informações e as telas encadeadas entre conjunto e lote. Avaliar a dinâmica existente de linha expansível/ocultável para exibir os dados exclusivos dos lotes, reaproveitando componentes e contratos. Preservar totais/Result Truth, ações autorizadas, acesso por ID, RBAC e isolamento por tenant. Pedido de revisão, não decisão de implementação; nenhum componente foi alterado aqui. Não mistura esta demanda com o atalho CRM→conversa BOT, que continua item separado.

Agrupamento multilote e contingênciaAUTO permanecem aguardando ocorrência natural autorizada; audiência/aceites anteriores preservados, CRA-PR separado, setembroCLOSED e históricos intactos. Um conjunto com um filho não aceita multilote. Nenhum ciclo de envio aprovado foi repetido.

[Registro sanitizado](result.sanitized.json). Diagnósticos backend privados permanecem fora do Git; sem HAR, headers, credenciais, conteúdo de mensagens ou números completos. Publicação documental somente na branch de revisão sem auto-deploy.
