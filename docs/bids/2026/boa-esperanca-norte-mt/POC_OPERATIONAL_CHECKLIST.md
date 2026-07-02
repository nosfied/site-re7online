# Boa Esperanca do Norte/MT - Checklist Operacional Da POC

Usar em conjunto com `POC_REMOTE_SCRIPT.md` e `ANEXO_III_EVIDENCE_MATRIX.md`.

## Antes Da POC

| Check | Status | Observacao |
| --- | --- | --- |
| Ambiente demo definido | pendente | Preferir tenant especifico de demonstracao, sem dados reais. |
| Health OK | pendente | Validar `/health`. |
| PM2/backend/frontend online | pendente | Evidencia operacional, se demo em VPS. |
| Alertas criticos zerados ou baseline registrado | pendente | Validar `/admin/ops/alerts`. |
| Usuario ADMIN demo | pendente | Sem dados pessoais reais. |
| Usuario SUPERVISOR demo | pendente | Para relatorios/monitoramento. |
| Usuario AGENT demo | pendente | Para atendimento humano. |
| Departamentos criados | pendente | Atendimento Geral, Ouvidoria, Protocolo, e-SIC, Diario Oficial. |
| Filas criadas | pendente | Fila geral e filas por setor. |
| Webchat demonstrativo publicado | pendente | Pode ser pagina de portal simulada. |
| WhatsApp oficial preparado | pendente | Se demo real for possivel; caso contrario, usar evidencia controlada. |
| Chatbot inicial configurado | pendente | Saudacao, menu, triagem, ausencia, encerramento. |
| Base de conhecimento populada | pendente | Artigos institucionais ficticios/controlados. |
| API externa simulada pronta | pendente | Endpoint mock para protocolo/diario/portal. |
| Conversas com midias e localizacao | pendente | Timeline deve mostrar arquivos e mapa. |
| Relatorios com dados | pendente | Periodo mensal, CSV/PDF. |
| Suporte/SLA demonstravel | pendente | Incident/maintenance/status. |
| Plano B com prints | pendente | Em caso de instabilidade de internet/Meta. |

## Gate De Ensaio 84C

Antes de autorizar participacao, executar um ensaio interno com tempo cronometrado e registrar o resultado fora do repositorio, sem dados reais de cidadaos.

| Bloco | Evidencia esperada | Status minimo para envio |
| --- | --- | --- |
| WhatsApp Business oficial | Webhook/Cloud API, timeline e midias demonstraveis sem WhatsApp Web | Obrigatorio |
| Website/Webchat | Widget ou pagina demonstrativa de portal institucional | Obrigatorio |
| Fluxo automatizado | Saudacao, menu, triagem, ausencia, encerramento e handoff | Obrigatorio |
| NLP/IA | Pergunta livre com resposta controlada ou fallback seguro | Obrigatorio |
| KB/base de conhecimento | Artigo institucional alimentando resposta ou demonstracao assistida com fonte | Obrigatorio |
| API externa simulada | Mock HTTP recebendo/enviando dado em fluxo controlado | Obrigatorio |
| Handoff humano | Claim, atendimento por agente, transferencia e encerramento | Obrigatorio |
| Logs/interacoes | Timeline, protocolo, eventos e historico da conversa | Obrigatorio |
| Administracao | Usuarios, departamentos, filas, roles e RBAC | Obrigatorio |
| Relatorios/indicadores | Periodo mensal, CSV/PDF e metricas principais | Obrigatorio |
| Seguranca/LGPD | RBAC, isolamento tenant, redaction e backup/restore como evidencia | Obrigatorio |
| Multiplos usuarios | Admin, supervisor e agente em sessoes separadas | Obrigatorio |
| Suporte/chamados/status | Plano SLA, severidade, incidente/manutencao e status | Obrigatorio |

Itens amarelos aceitaveis no ensaio:

- integracao real com sistema da Camara, desde que a simulacao controlada esteja pronta;
- manutencao presencial quinzenal, desde que o tratamento comercial/juridico esteja definido;
- portal externo de chamados dedicado, desde que haja canal formal e registro de status.

Itens vermelhos que bloqueiam envio:

- nao demonstrar KB/API externa;
- usar WhatsApp Web/QR persistente como base da POC;
- expor dados reais, tokens, credenciais ou documentos pessoais;
- nao conseguir demonstrar RBAC/multitenancy;
- preco aprovado abaixo do custo operacional minimo.

## Sequencia Recomendada

1. Abertura institucional e arquitetura.
2. Login como ADMIN.
3. Dashboard.
4. Inbox multicanal.
5. Webchat no portal demonstrativo.
6. Chatbot com pergunta livre.
7. Base de conhecimento com artigo fonte.
8. Handoff humano e claim.
9. Transferencia de atendente e setor.
10. Timeline com protocolo, midias e localizacao.
11. API externa simulada.
12. Relatorios e indicadores.
13. Usuarios, departamentos e RBAC.
14. LGPD, seguranca e auditoria.
15. SLA, suporte, incidentes e manutencao.
16. Treinamento e implantacao em 30 dias.
17. Encerramento com matriz Anexo III.

## Frases De Posicionamento

- "O Converta e uma plataforma unica, multi-tenant, parametrizada por capabilities."
- "Nao usamos WhatsApp Web, QR persistente ou API nao oficial; a integracao demonstrada e pela Cloud API oficial da Meta."
- "Integracoes com sistemas da Camara dependem das APIs e credenciais fornecidas na implantacao; para POC, o TR permite simulacao controlada."
- "Dados da demonstracao sao ficticios e nao representam cidadaos reais."
- "A manutencao preventiva presencial quinzenal do Anexo III deve ser alinhada com o TR corrigido, que descreve manutencao remota mensal."

## Evidencias A Abrir

| Evidencia | Local |
| --- | --- |
| Matriz 97 criterios | `ANEXO_III_EVIDENCE_MATRIX.md` |
| Roteiro POC | `POC_REMOTE_SCRIPT.md` |
| Treinamento 16h | `TRAINING_16H_PLAN.md` |
| SLA/suporte | `SUPPORT_SLA_PLAN.md` |
| Custos WhatsApp | `WHATSAPP_COSTS_PREMISES.md` |
| Arquitetura | `docs/saas/bid-package/02-arquitetura.md` |
| WhatsApp oficial | `docs/saas/bid-package/06-whatsapp-oficial.md` |
| LGPD | `docs/saas/bid-package/04-lgpd.md` |
| Integracoes | `docs/saas/bid-package/12-integracoes.md` |

## Criterios De Aprovação Interna

- todos os itens do item 11.3 demonstrados ou justificados;
- nenhum dado real exposto;
- demo de KB e API externa ensaiada;
- relatorios geram CSV/PDF;
- roles e RBAC demonstraveis;
- plano comercial/SLA consistente com o preco ofertado.
