# Converta — Pesquisa da inbox: diagnóstico dirigido e contrato de correção

**Data:** 2026-11-12. **Base auditada:** `review/campaign-recovery-20260926@0433b06012eba74a48316eac0fe898ba24c6f176`. **Estado:** diagnóstico encerrado; a implementação isolada E1.2-B está registrada em [INBOX_SEARCH_E1_2B_2026-11-12.md](INBOX_SEARCH_E1_2B_2026-11-12.md), ainda não integrada nem implantada.

## Sintomas trazidos pelo operador
1. Lista fica vazia ao limpar o campo de busca.
2. Digitação de termos presentes na lista falha intermitentemente.
3. Protocolo existente não é encontrado de forma confiável.

## Achados no código — separados de hipóteses

- `src/app/app/inbox/page.tsx:3922-3956`: o termo é passado em `search` ao backend e integra `conversationQueryKey`; mudanças de caractere invalidam a consulta.
- `page.tsx:4472-4500`: efeito dependente da query zera `conversations`, `nextCursor` e contagem de páginas a cada mudança, antes de obter a resposta. Falhas e corridas exibem vazio.
- `page.tsx:3959-3970,4153-4161`: uma única `conversationListRefreshPromiseRef` é compartilhada, mesmo quando a query mudou. A resposta da requisição anterior é ignorada pelo cheque `requestQueryKey !== conversationQueryKeyRef.current`. **Hipótese forte de race:** query B aguarda promessa de A, não inicia request B, e a lista permanece vazia após o reset. Reproduzir por teste com promessas controladas.
- `page.tsx:5070-5085`: refiltragem local por protocolo/nome/telefone/waId/texto da última mensagem após filtragem no backend. É possível descartar resultados da API caso o contrato de busca inclua outros campos, transliteração, histórico ou normalização divergente. **Necessário confrontar backend.**
- `page.tsx:7662-7668`: input dispara request para cada tecla, sem debounce explícito na superfície. Sem argumento de que debounce isolado corrige race.
- `docs/saas/INBOX_QUERY_PATH_AUDIT.md`: auditou overfetch, queries e custo da listagem; seu escopo histórico não prova corretude da pesquisa atual. Manter política de mínimo impacto e RBAC.

## Especificação funcional mínima

- Busca vazia deve restaurar a listagem correspondente aos filtros ativos, sem vazio transitório permanente.
- Trocas rápidas `A → AB → vazio` não podem publicar resposta obsoleta nem impedir a última consulta.
- Uma só fonte de verdade para busca remota; filtro local somente se os campos e regras forem comprovadamente equivalentes (preferencialmente não refiltrar resposta remota por termo).
- Suportar protocolo completo e parcial conforme contrato definido a partir da persistência; reconhecer formato com/sem prefixo e pontuação aplicável sem busca fora de escopo.
- Buscar nome, telefone/waId e demais campos já suportados; preservar texto com acento, espaços, números e digitação parcial, conforme regra existente.
- Restringir o resultado por `clientId` autenticado, departamento, role, status e canal antes da publicação; provar resultados negativos entre tenants.
- Manter paginação/cursor, contadores e seleção atual; impedir carregamento de página de outra query; minimizar chamadas durante a digitação.
- Diferenciar estados: carregando, sem resultado legítimo e erro de rede. Limpar campo não pode causar erro oculto ou perda permanente da lista.

## Plano de regressão obrigatório

1. Buscar existente por nome, telefone, waId, protocolo completo/parcial e não existente.
2. Simular requisições fora de ordem e falha entre mudanças rápidas de termo; confirmar que a query final é buscada e somente sua resposta aparece.
3. Limpar o campo após resultado e após resultado vazio; preservar filtros ativos e recuperar primeira página.
4. Trocar status/departamento/canal durante busca e confirmar RBAC, cursor e ausência de vazamento.
5. Exercitar paginação e atualização realtime durante a busca; sem sobrescrever resultados de outra query.
6. Verificar acessibilidade/UX do campo, estado de carregamento e indicador de filtros; evitar UI indefinidamente vazia.
7. Executar teste de isolamento entre pelo menos dois tenants sintéticos.
8. Confirmar que nenhum envio à Meta, mudança em dados, migration ou worker é necessário para a correção; ampliar escopo somente se evidenciado.

## Ordem de intervenção

A. Codex inspeciona `fetchAppConversations`, handler `GET /app/conversations`, builder da lista, fonte persistida de protocolo e testes existentes. Reproduz caso com fixtures.

B. Corrige corrida de requisições (serialização por query, cancelamento ou request generation), sem reset antecipado da lista válido; alinha semântica de busca entre API/UI; implementa protocolo.

C. Testes locais dirigidos + CI na mesma árvore; revisão de payload, performance, isolamento e UX.

D. Release mínima pelo **builder externo descartável**, somente após reconciliação do estado real e orçamento de ambos hosts. Build único, pacote imutável, retorno autenticado, smoke GET-only e aprovação.

E. Verificar seleção/saúde/isolamento após deploy; medir pico, saldo e inodes nos dois hosts; fechar staging e transporte pela política canônica; atualizar `CURRENT_STATE.md/.json`, runbook e registro da release. Não retirar o worktree legado preservado.

## Gates de capacidade
- Registrar capacidade livre/alocada (bytes e inodes) e papel de cada cópia nos dois hosts ANTES de construir.
- Definir orçamento de pico com margem e preservações ativas, sem tratar espaço temporário como ganho permanente.
- Gerar e retirar workspace efêmero com lifecycle comprovado mesmo em falha de build.
- Retenção pós-aceite precisa ser encerrada com provas, sem remoções ad hoc nem limpeza de releases de retorno.
- Comparar números medidos ao baseline de admissão do piloto: 9.663.676.416 B (build VPS) versus 5.700.927.488 B (receber/instalar externo). Não converter redução de gate em redução total de custo sem dados reais.

**Não executar build, deploy, limpeza, PM2, mutações de banco ou chamadas à Meta com base neste documento.**
