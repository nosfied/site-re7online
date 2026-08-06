# SECULT-PE Demo 2026-08

Status: roteiro de demonstracao e treinamento. Este documento nao altera runtime, dados, tenants ou canais.

## Contexto

SECULT-PE solicitou demonstracao/treinamento via Meet para aproximadamente 20 pessoas. A demonstracao deve apresentar o Converta como SaaS de atendimento omnichannel com WhatsApp Oficial/Meta, Inbox humano, fluxos de chatbot, CRM operacional, modelos aprovados, mensagens prontas, campanhas controladas, LGPD e controle estimativo de custo Meta.

Nao prometer funcionalidades fora do estado atual do produto. Pontos em backlog devem ser apresentados como evolucao planejada, nao como entrega ja disponivel.

## Objetivo da reuniao

- Alinhar expectativa operacional da SECULT-PE.
- Demonstrar os fluxos principais da plataforma.
- Mostrar controles de seguranca, LGPD, RBAC e multitenancy.
- Separar o que ja existe do que entra em backlog.
- Preparar proximos passos de onboarding, configuracao e treinamento.

## Roteiro de 60 minutos

| Tempo | Bloco | Conteudo |
| --- | --- | --- |
| 0-5 min | Abertura | Objetivo da reuniao, escopo da demonstracao, limites de envio real e premissas de seguranca. |
| 5-10 min | Visao geral | Converta como SaaS multitenant: canais, Inbox, CRM, templates, mensagens prontas, campanhas e relatorios. |
| 10-22 min | Inbox | Listagem de conversas, filtros, timeline, janela de atendimento, assumir atendimento, resposta livre e modelo aprovado. |
| 22-30 min | Fila e claim | Conversas em fila, assumir, liberar, transferir para usuario ou setor, preservando responsavel e departamento; mostrar a configuracao de distribuicao sem ativar policy real. |
| 30-38 min | Modelos e mensagens prontas | Diferenca entre modelo aprovado Meta e mensagem pronta; quando usar cada um; preview e regra de janela. |
| 38-45 min | CRM | Cadastro do contato, nome de atendimento, empresa/cidade/email quando aplicavel, status e bloqueio de envio ativo. |
| 45-50 min | Relatorios | Campanhas, uso Meta estimativo, usuarios ativos/inativos e limites atuais de relatorios. |
| 50-55 min | LGPD | Anonimizacao, opt-out, soft delete, bloqueio de reidratacao e cuidado com dados pessoais. |
| 55-60 min | Dúvidas e proximos passos | Backlog, treinamento, canais, usuarios, templates necessarios e agenda de homologacao. |

## Fluxo de demonstracao recomendado

1. Abrir `/app/inbox`.
2. Mostrar conversa receptiva existente ou ambiente de demonstracao sanitizado.
3. Explicar estados: na fila, em atendimento, aguardando cliente e fechado.
4. Demonstrar o conceito de assumir atendimento sem enviar mensagem real.
5. Abrir modal de modelo aprovado sem concluir envio.
6. Abrir mensagens prontas e mostrar que inserir no campo nao envia automaticamente.
7. Abrir `/app/crm`.
8. Mostrar busca, filtros, cadastro e edicao segura de nome de atendimento.
9. Abrir `/app/templates`.
10. Mostrar catalogo de modelos Meta e secao separada de mensagens prontas.
11. Abrir `/app/campaigns`.
12. Mostrar previa de audiencia e rascunho sem clicar em envio real.
13. Explicar relatorio mensal Meta como estimativa operacional.

## Respostas padrao as solicitacoes SECULT

### 1. Corrigir palavras ou mensagens digitadas rapidamente

Resposta: o produto nao deve prometer edicao retroativa de mensagem ja entregue no WhatsApp. O caminho seguro e revisar antes de enviar, usar mensagens prontas para reduzir erro e, quando necessario, enviar uma mensagem de retificacao.

Backlog: acao rapida de retificacao com texto orientado e auditoria.

### 2. Fila equilibrada para nao sobrecarregar um atendente

Resposta: hoje ha fila, assumir atendimento, liberar e transferir por usuario/setor. A base tecnica de distribuicao balanceada foi preparada para funcionar de forma opcional por tenant/departamento, com modos manual, round-robin e menor carga ativa. A configuracao fica em `/app/settings/queue`, e o padrao continua manual. Nenhuma ativacao deve ocorrer sem configuracao explicita e smoke controlado.

Backlog: runbook de ativacao e acompanhamento de carga por agente.

### 3. Registro de hora de login/logout

Resposta: o sistema possui autenticacao, sessao e logs operacionais. Para SECULT, isso deve ser posicionado como auditoria operacional de sessao, nao controle oficial de ponto.

Backlog: relatorio de presenca/sessao com login, logout, expiracao, substituicao de sessao e atividade recente.

### 4. Alterar nome do contato/proponente, inclusive nome social

Resposta: o CRM ja permite edicao segura do nome de exibicao do contato. Na demonstracao, usar a expressao nome de atendimento/nome social quando aplicavel. O display operacional deve priorizar esse nome, sem restaurar dados anonimizados.

Backlog: refinamento de copy e campo dedicado de nome social, se houver necessidade contratual e base juridica.

### 5. Relatorios mais especificos e ocultar pessoas fora da equipe

Resposta: usuarios e setores possuem estado ativo/inativo. Superficies operacionais devem priorizar ativos por padrao, preservando historico para auditoria. Relatorios especificos devem ser detalhados apos entendimento dos indicadores exigidos.

Backlog: filtros padrao ativo/inativo em relatorios e exportacoes operacionais por escopo.

### 6. Evitar congelamento/hibernacao quando atendente nao manuseia a pagina

Resposta: o caminho correto e heartbeat, reconexao, polling seguro e aviso de sessao, nao simular atividade artificial. Durante a demonstracao, explicar que a plataforma deve se recuperar de reconexao e expirar sessao de forma segura.

Backlog: hardening de heartbeat/reconnect do Inbox.

### 7. Permitir mais de um usuario gestor

Resposta: o modelo atual suporta multiplos usuarios com perfil ADMIN ou SUPERVISOR por tenant, respeitando RBAC, setor e limite contratado de usuarios ativos. Nao ha decisao de produto para limitar a um unico gestor.

## Auditoria rapida do estado atual

- Fila: `WAITING`, `IN_PROGRESS`, `WAITING_USER` e fechado aparecem no fluxo operacional.
- Claim: existe acao manual de assumir atendimento.
- Release: existe liberacao para automacao ou fila geral, conforme regra de tela.
- Transferencia: existe transferencia para usuario e setor.
- Assignment: `assignedUserId`, `departmentId` e `queueId` sao usados no runtime; a foundation 87O.2 reaproveita esses campos e `ConversationAssignment`, e a 87O.3 adiciona configuracao por tenant em `/app/settings/queue`.
- Multi-gestor: UI de usuarios aceita `ADMIN` e `SUPERVISOR`; limite aplicado e de usuarios ativos por tenant.
- CRM: edicao segura de nome, empresa, email e cidade ja existe em `/app/crm`.
- Sessao: login/logout existem e erros de sessao expirada/substituida/revogada sao tratados.
- Relatorios: areas operacionais ja usam filtros de ativos em pontos relevantes; relatorios especificos ficam condicionados a escopo.

## Linguagem recomendada

- Use "fila de atendimento", nao "distribuicao perfeita".
- Use "assumir atendimento", nao "puxar cliente".
- Use "transferir para usuario/setor", nao "jogar para outro".
- Use "modelo aprovado", nao "template livre".
- Use "mensagem pronta", nao "template Meta".
- Use "auditoria operacional de sessao", nao "controle de ponto".
- Use "estimativa de custo Meta", nao valor definitivo.

## Cuidados durante a demonstracao

- Nao enviar mensagem real.
- Nao criar campanha real.
- Nao submeter modelo a Meta.
- Nao ativar distribuicao automatica de fila durante a demonstracao sem autorizacao.
- Nao alterar credenciais, tenants ou canais.
- Nao expor dados pessoais em tela compartilhada.
- Nao executar anonimizacao ou hard delete.
- Nao prometer funcionalidades registradas como backlog.

## Proximos passos de onboarding

1. Confirmar canais e linhas autorizadas.
2. Confirmar usuarios, perfis e setores.
3. Definir modelos aprovados minimos.
4. Configurar mensagens prontas iniciais.
5. Validar fluxo de Inbox e CRM com massa sanitizada.
6. Definir indicadores de relatorio prioritarios.
7. Agendar treinamento operacional por perfil.
