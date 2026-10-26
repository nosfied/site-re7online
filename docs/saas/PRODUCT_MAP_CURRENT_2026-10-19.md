# Mapa vigente do produto e sequência — atualizado em 26/10/2026

Este arquivo existente foi atualizado sem criar outro mapa concorrente. O nome
preserva a data de criação. Fonte de estado: [CURRENT_STATE.md](CURRENT_STATE.md)
e [CURRENT_STATE.json](CURRENT_STATE.json). Deploy: somente
[DEPLOY_RUNBOOK.md](DEPLOY_RUNBOOK.md). O mapa não executa nem autoriza operações.

## Alcance da revisão documental

Revisadas as 148 superfícies principais Markdown/JSON de docs/saas, seu backlog,
documentos raiz e README presentes no head documental 66f7ec35, além de registros
de implantação, OBS-1/OBS-2 e referências selecionadas das revisões históricas.
O catálogo completo de reviews/releases foi percorrido por caminho; não se alega
revalidação byte a byte de todo arquivo histórico, dos privados ou da VPS.
Os estados de produção de 26/10 vêm dos relatos do Codex local encaminhados pelo
owner. Esta revisão não repetiu SQL, envio, deploy ou leitura remota de produção.

A branch operacional ainda estava em a959129e; PR #227 documental aberto, head
66f7ec35 e CI run 40320651628 PASS antes desta atualização. Atualização documental
não muda o SHA do runtime nem promove main. PR #190 é histórico/obsoleto, não rota
a retomar; PR #57 em main é frente distinta, sem revisão de mérito nesta leitura.

## Concluído — não repetir

- API/frontend a959 implantados, release immutable-a959129e-vps-20261026T023100Z,
  worker preservado, um save, marker/recibo/dump finais e health saudável relatado.
- Admissão de upload de campanha, disponibilidade e tradução implantadas. VIDEO:
  um destinatário e uma aceitação; IMAGE: dois destinatários, uma aceitação por
  destinatário. CRM/webhooks confirmados, sem retry/duplicidade ou pendência.
- Guarda global reaberta por CAS único; último estado relatado open=true,
  geração 41, zero tarefas e trabalho histórico elegível. Uso normal liberado.
- CRM/CSV: recuperação durável e reentrada verificadas em seu escopo; lista/read
  model/cursor implantados em 20–21/10. As duas ocorrências legadas 993 continuam
  sem correlação comprovada; não inventar recuperação nem repetir importação.
- SECULT: consulta de próprias conversas CLOSED aceita pelo cliente em 29/09,
  conforme relato do owner. Não transformar cabeçalhos locais antigos em nova
  necessidade de ativar, refazer persistência ou trocar o worker.
- Out.15 foi encerrada canonicamente em 12/10. .6/setembro, 6683 e DB-only têm
  encerramentos próprios; não reutilizar seus ack, cancelamentos ou executores.
- OBS-2 encerrada em seu escopo. Não repetir rotação por encontrar a preparação
  antiga. Retiradas de artefatos já executadas não são candidatos ainda presentes.

## Sequência recomendada de homologações — funcionalidades existentes

Esta ordem é recomendação de continuidade, não autorização nova de envio.
Antes de cada operação real definir tenant, ação, destinatários e quantidade.
Não precisa reabrir guarda, repetir build/deploy/save ou reenviar imagem/vídeo.

| Ordem | Frente | O que falta provar | Próximo ato e conclusão |
| --- | --- | --- | --- |
| 0 | Consolidação documental | PR #227 ainda aberto; entradas históricas pareciam pendências vivas | Concluir revisão/CI/integração documental. Não misturar com main/Vercel ou runtime. |
| 1 | Agendamento estático de campanha | Homologação recente comprovou envio manual, não disparo futuro | Preparar um agendamento de escopo mínimo, timezone explícito e destinatário controlado. Aceite: agenda persistida após reload, nenhum envio antes da hora, um job/uma execução na hora, CRM/webhook e ausência de duplicidade. |
| 2 | Audiência dinâmica CRM e conjunto/lotes | Funcionalidade implantada; aceite amplo/natural não decorre dos testes manuais | Primeiro prévia/filtro e snapshot pequenos controlados. Depois critério de conjunto/lotes e status agregados. Não usar audiência comercial ou milhares de envios para provar chunking; reutilizar testes isolados de [1.000+1/3.001](backlog/CAMPAIGN_SET_BASED_ELIGIBILITY_2026-10-21.md). Snapshot imutável, exclusões/opt-out e zero reenvio são invariantes. |
| 3 | Resposta e destino de retorno da campanha | CRM/outbound/webhook confirmados não provam toda entrada de resposta/departamento/fluxo | Conferir evidências existentes por transporte e só testar o caminho que faltar: resposta nova autorizada, uma entrada canônica, destino/fluxo/ownership corretos. Não misturar com suporte internacional não homologado. |
| 4 | Aceite do cliente CRA-PR | Aceite Demo não equivale a configuração/aprovação/treinamento/uso Utility no tenant CRA | Inventariar templates, categoria, mídia, retorno e configuração do tenant real; preparar aceite com cliente e custo/consentimento próprios. Não copiar campanha ou destinatário do Demo. |
| 5 | Automação na Inbox e transportes não exercitados | Filtro BOT/Automação com opt-in e RBAC; META_CLOUD puro e híbrido API→WEB continuam sem aceite global nos registros | Reutilizar código e evidências; conferir configuração atual sem ativar outro tenant. Planejar matriz SUPERVISOR/ADMIN do próprio tenant, AGENT/outro tenant negativos, revogação, TODAS sem BOT, resposta/claim nos contratos existentes. Nenhuma promessa de cancelamento instantâneo de resposta já admitida. |

Fontes: [campanhas](CAMPAIGN_OPERATIONS_READINESS.md),
[dinâmico](DYNAMIC_CRM_FILTER_CAMPAIGN_SCHEDULING.md),
[compositor](CAMPAIGN_COMPOSER_LIFECYCLE.md),
[custo e aceite CRA](META_USAGE_COST_CONTROL.md),
[automação implantada](AUTOMATION_ROLLOUT_2026-09-29.md),
[limites funcionais de transporte](AUTOMATION_RUNTIME_FIX_ROLLOUT_2026-09-30.md),
[filtro Automação](INBOX_AUTOMATION_LOCAL_2026-09-29.md).

## Pendências reais paralelas — não são novos testes de mídia

| Prioridade | Frente | Estado documentado e ação permitida |
| --- | --- | --- |
| Alta / segurança | OBS-1: segredo do aplicativo Meta compartilhado | PREPARED, rotação ainda não executada nos registros atuais. Confirmar identidade/configuração e planejar janela própria; reset, restart API e save dessa rotação negados seg–sex 08–17h Fortaleza. Recuperação é progressiva com segredo novo, não rollback ao segredo invalidado. Não adiar indefinidamente nem executar por esta revisão. |
| Alta / correção de produto | Encerramento/CSAT e janela 24h | [Gap registrado em 19/10](backlog/WHATSAPP_CSAT_24H_WINDOW_2026-10-19.md): WEB_SESSION pode enviar texto livre fora da janela e manter survey sent após falha. Fechamento local deve ser independente, sem pesquisa falsa/reenviada. Primeiro confirmar o caminho no código atual; depois correção focada/testes/deploy em frente própria. Não chamar isso de simples homologação ou NPS novo. |
| Obrigatória antes de outra geração volumosa | Resíduos/capacidade | Classificar worktree, cache npm, output e stagings das janelas a959, incluindo falhas. Preservar ativo/retorno/worker/pacotes/evidências e dados. Medição atual e comparação precedem lote literal revisável; nenhuma exclusão automática. O piso de espaço de uma fotografia não é capacidade atual. |
| Separada / desempenho | Elegibilidade de campanhas N+1 | 3.001 elegíveis medidos em ~44–46s, maioria na elegibilidade. [Backlog](backlog/CAMPAIGN_SET_BASED_ELIGIBILITY_2026-10-21.md); o read model CRM corrigido não resolve automaticamente o materializador da campanha. Projetar set based preservando isolamento, identidade, anonimização, opt-out e snapshot; não bloquear mídia por essa pendência. |
| Planejada / engenharia | Convergência de branches | [Fase 1 inerte](BRANCH_CONVERGENCE_PLAN_2026-10-18.md) continua separada. Contagens de 18/10 são históricas; comparar heads frescos. Não mover main, forçar merge ou acionar Vercel durante homologações. |
| Adiada pelo owner / continuidade | Custódia atual e restore drill off-host | Ensaios/dumps antigos não provam recuperação vigente. Novo ponto consistente/restore atual e cobertura template-campaign-media continuam próprios; a decisão anterior do owner foi não avançar nessa frente naquele momento. Não executar agora ou excluir backups. |

Fontes de segurança: [OBS-1](releases/OBS1_META_APP_SECRET_ROTATION_2026-10-19_PREPARED.json),
[OBS-2](releases/OBS2_OAUTH_STATE_SECRET_ROTATION_2026-10-18_DEPLOYED.json).
Capacidade: [ciclo de vida](DEPLOY_ARTIFACT_LIFECYCLE.md),
[gates do produtor](BUILD_CAPACITY_GATES.md), [baseline](OPERATIONAL_BASELINE.md).

## Backlogs preservados — não abrir automaticamente

- Inatividade no Guia: pausada; trata automações abandonadas, não expiração genérica
  de atendimentos HUMAN. Fonte: [auditoria](INACTIVITY_AUTOMATION_LIFECYCLE_AUDIT_2026-09-14.md)
  e [guia do operador](CONVERTA_OPERATOR_GUIDE.md).
- SECULT: presença/auditoria de sessão, refinamentos de nome/filtros/heartbeat são
  backlog; rodízio/fairness em observação não implica novo algoritmo autorizado.
- Telegram texto, Webchat, API read-only e fundamentos de MFA já têm implementação;
  auditorias iniciais que dizem inexistente são históricas. Mídia/grupos Telegram,
  NPS completo, áudio real, OTP, HA e alertas externos dependem de requisito próprio.
- Usernames/BSUID e extensões internacionais permanecem sem ampliação implícita.
- Pacote licitável: [matriz](BID_COMPLIANCE_MATRIX.md),
  [roadmap](LICITABLE_VERSION_ROADMAP.md) e [checklist](LICITABLE_VERSION_1_0_CHECKLIST.md).
  O [guia do operador](CONVERTA_OPERATOR_GUIDE.md) já existe: revisar/adaptar em vez
  de criar outro. Manual admin/implantação B2G, PoC, treinamento/SLA e evidências
  comerciais/jurídicas não são novas features; comprovar o que existe antes de prometer.

## Divergências documentais encontradas e regra de prevalência

Runbook/backlog extensos ainda mostram CRM/CSV local-only; o mapa de 19/10 priorizava
somente OBS-1/convergência; o roteiro dinâmico repete suspensão out.15/guarda38 e
limites antigos; o compositor exibe NO DEPLOY; documentos SECULT colocam ativação
pendente abaixo do aceite; inventário chama manual do operador de inexistente e
aponta runbooks superados; baseline ainda propõe a primeira investigação Inbox,
embora resultados posteriores já existam. São divergências de cronologia/entrada,
não prova de falha produtiva nova. Cabeçalhos vigentes foram ajustados nos pontos
de entrada relevantes, preservando os registros históricos e suas evidências.

Não declarar toda homologação pendente como bug, nem todo teste de CI como aceite
real. Não reexecutar preparadores históricos para satisfazer frase antiga. Cada
próxima frente tem objeto, responsável, evidência faltante e encerramento próprios.
