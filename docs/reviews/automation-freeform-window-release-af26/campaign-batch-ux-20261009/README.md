# Campanhas: conjunto e lotes — implementação local, 09/10/2026

**LOCAL IMPLEMENTED / REVIEW READY / NOT DEPLOYED.** Delta frontend autorizado sobre `4a910771c436d648465807de849d38311ff0a255`. Sem consulta ou mutação produtiva, envio, agendamento, reparo, configuração, deploy ou alteração de backend/worker/scheduler. Gerações operacionais, tars e evidências anteriores preservados.

## Desenho consultado e solução

Consultados [proposta aprovada](../remaining-validations-20261009/UX_SET_BATCH_PROPOSAL.md), [matriz de aceites](../remaining-validations-20261009/README.md), [Result Truth](../../../saas/CAMPAIGN_RESULT_TRUTH_CANONICAL_RECONCILIATION_2026-09-18.md), [lifecycle do composer](../../../saas/CAMPAIGN_COMPOSER_LIFECYCLE.md), [CRM dinâmico](../../../saas/DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md), contratos `CampaignItem`/read models, `campaignPresentation.ts`, `campaignRelationReads.ts`, handlers e componentes efetivos da página. A apresentação expansível já usada no composer orienta o componente; não acopla Campanhas ao builder de fluxos nem cria outra máquina de estados.

- `CampaignBatchPanel.tsx`: contexto agregado do conjunto uma vez, linhas expansíveis pelo `campaignId`. A expansão permanece no mesmo conjunto e mostra fila, horários, falha e resultados próprios. Template, destino, variáveis e parâmetros divergentes continuam visíveis; comparação conservadora não oculta valores presentes somente no filho.
- “Abrir lote por ID” preserva o detalhe e ações individuais existentes. No acesso direto por `?campaignId=...`, o filho tem detalhe próprio e agregado recolhido inicialmente. “Abrir conjunto por ID” usa somente vínculo explícito no inventário do mesmo tenant; quando o controlador não está carregado, “Ver resumo do conjunto” abre o agregado conhecido, sem inventar um ID ou buscar por nome.
- Ações de pausar/retomar/cancelar conjunto mantêm os predicados e handler `batchId` existentes. Ações individuais permanecem no detalhe por ID, com seus predicados e `campaignId`. Expandir uma linha é somente leitura; nenhuma nova ação mutável foi introduzida.
- `page.tsx`: reutiliza a tabela/labels de Result Truth no agregado e no lote, sem somar as projeções. Cartões agregados vêm do read model; uma barra de progresso repetida foi removida no controlador. O filho preserva o progresso próprio, identificado como “Progresso do lote”. Composer, horário, scheduler e status persistidos não mudaram.
- `campaignRelationReads.ts`: estende o leitor existente para compartilhar **dois slots** entre vínculos complementares, detalhe selecionado e lote aberto. Sem novo timer, consulta de todos os filhos por expansão ou persistência de dados. Cache em memória pertence à sessão; validade considera versão da lista do filho, contexto/versão do conjunto e leitor da sessão. Abort não libera um slot antes de a promessa HTTP concluir.
- Uma linha aberta por vez, leitura sob demanda, erro e tentativa explícita de nova leitura na própria linha. Fechamento/troca aborta a leitura; geração, ID, tenant e sessão impedem aplicar resposta antiga. Mudança da versão do filho invalida a linha mesmo quando a versão do conjunto não muda. RBAC e endpoints autorizados permanecem os existentes.

## Provas e limites

[Resultados sanitizados](results.sanitized.json), [hashes completos origem/resultado e inputs do build](manifest.json). Os arquivos novos têm origem `null`; os demais têm SHA-256 dos bytes do commit-base e do resultado.

| Verificação | Resultado | Natureza / limite |
|---|---|---|
| Build final Next 16.1.5 em Node **20.20.0** | PASS | Compilados executados pelo Next local; configs PostCSS/Tailwind presentes. Não é pacote operacional nem release preparada na VPS. |
| Contratos/leitor, 39 verificações | PASS | 30 contratos estáticos existentes da página, adaptados à extração; 9 provas comportamentais de fila/cancelamento/cache/ID/tenant com promessas controladas. Não substituem autorização backend. |
| Chrome novo, **14 cenários** | PASS | UI/DOM/eventos nativos/HTTP dos assets reais contra o build final; autenticação e APIs sintéticas, relógio do polling controlado e origens externas bloqueadas. Sem backend/provider real. |
| Horário/conjuntos, 13 cenários; leituras, 7 cenários | PASS | Regressões afetadas executadas nesta rodada; reutilizadas após os últimos deltas de remoção de apresentação duplicada e getter de versão. Nova prova final cobre o getter/invalidação. Não são novos aceites produtivos. |
| Lint do componente e leitor | PASS | Arquivos alterados, sem ampliar para suítes alheias. |
| `tsc --noEmit` amplo | LIMITAÇÃO PREEXISTENTE | 22 diagnósticos em quatro arquivos de testes não alterados; **zero nos arquivos deste delta**. Não corrigidos incidentalmente. Build Next passou; não declarar o typecheck amplo PASS. |
| Resultados reais / RBAC backend / CRA-PR | NÃO EXERCITADOS NESTA RODADA | Não houve acesso à produção, envios ou implementação de backend. Aceites anteriores permanecem separados. |

Os 14 cenários finais cobrem: um/vários lotes, resultado parcial/falha e dados divergentes, nomes independentes iguais e nomes iguais de lotes, resumo sem soma/duplicação, leitura somente do filho expandido, reutilização na mesma versão, mudança independente da versão do filho, link ao conjunto/acesso direto por URL, falha inline/releitura, resposta atrasada após troca/fechamento, tenant divergente, teclado Enter/Espaço, mobile390px e troca de sessão por navegação/remontagem (fluxo existente).

Máximo observado: **duas requisições de detalhe simultâneas**, inclusive com leitura suspensa; regressão de inventário grande preserva 33 leituras iniciais e nenhuma releitura em três ticks inalterados. O teste final não submete qualquer mutação de campanha. A navegação pode cancelar a resposta suspensa no próprio Chrome (`Invalid InterceptionId`); isso é registrado como cancelamento real, não entrega fictícia da resposta. Os testes do leitor cobrem separadamente a promessa que conclui mesmo depois do abort.

[Mobile com rolagem contida](mobile.synthetic.png) e [detalhe próprio por ID](direct-child.synthetic.png) usam somente dados sintéticos. HTTP/MIME dos CSS/JS e estilos computados foram verificados pelo detector existente; botões de expansão e acesso por ID foram medidos dentro do viewport mediante a rolagem horizontal da tabela. Não confundir esse ensaio com teste de dispositivo físico ou leitor de tela.

A prova anterior de horário e os testes funcionais válidos foram preservados. O primeiro build desta rodada foi recusado pelo sandbox ao abrir o processo/porta local do Turbopack; o build passou com a capacidade local liberada. Ajustes no harness trataram polling inativo na fixture, seleção da aba correta, foco nativo e troca de sessão pelo fluxo efetivo. Essas recusas de ensaio não foram atribuídas a produção. A última recompilação teve mudança de código justificada por remoção da barra repetida e invalidação da versão do filho; nenhuma dependência foi atualizada. Warnings existentes de múltiplos lockfiles/Browserslist permanecem.

## Reprodução local

Requer dependências existentes e Chrome; nenhum serviço produtivo deve ser conectado. `NODE20` abaixo deve apontar para o executável local **20.20.0** (`/tmp/re7-b9-node20.20.0` usado nesta rodada).

```bash
NODE20=/tmp/re7-b9-node20.20.0
"$NODE20" --version
"$NODE20" apps/whatsapp-agent/node_modules/tsx/dist/cli.mjs --test src/lib/campaignRelationReads.test.ts src/app/app/campaigns/campaignsPageContract.test.ts
"$NODE20" node_modules/next/dist/bin/next build
"$NODE20" node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3082
```

Com esse servidor local, em outra sessão:

```bash
/tmp/re7-b9-node20.20.0 tests/browser/campaignBatchUx.mjs http://127.0.0.1:3082
/tmp/re7-b9-node20.20.0 tests/browser/campaignScheduleAndGroups.mjs http://127.0.0.1:3082
/tmp/re7-b9-node20.20.0 tests/browser/campaignRelationReads.mjs http://127.0.0.1:3082
```

Apenas os scripts simulam as APIs e bloqueiam origens externas; não substituir suas fixtures por endpoints/autenticação produtivos. Resultados brutos e logs ficam em `local-evidence/`, fora do Git. Arquivos publicados contêm somente código, dados sintéticos, hashes e resumo sanitizado. Sem alterações a schema, migrations, dependências, canais, identidade CRM ou histórico.

## Próximo passo

Revisão independente deste delta e do layout. Nenhum gate de implantação foi habilitado nem pacote operacional montado. Avulso, CRM estático/imediato, CSV individual/imediato, agendamento real, CRM dinâmico/out.14 e aceite anterior do frontend permanecem registrados com suas versões/limites. **Multilote e contingência AUTO aguardam ocorrência natural; CRA-PR é aceite próprio.** Este ajuste local não encerra esses itens nem reabre setembro CLOSED ou saneamento histórico.

A publicação limita-se a `review/campaign-recovery-20260926`, por fast-forward. `vercel.json` mantém `deploymentEnabled=false` nessa branch; workflows têm alvos main/develop. Sem force-push, alteração de credenciais/configuração ou publicação de tars/auth/configurações privadas.
