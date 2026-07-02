# Boa Esperanca do Norte/MT - Roteiro De POC Remota

Fonte: item 11.3 do Termo de Referencia Corrigido.

Duracao sugerida: 45 a 60 minutos.

Objetivo: demonstrar aderencia funcional, tecnica e operacional do Converta Platform sem criar produto separado e sem hardcode do orgao no Core.

## Preparacao

Checklist antes da sessao:

- tenant demo preparado com perfil/capabilities de governo;
- usuario ADMIN, SUPERVISOR e AGENT;
- setores: Atendimento Geral, Ouvidoria, Protocolo, e-SIC, Diario Oficial;
- fluxo inicial de chatbot configurado;
- artigos de base de conhecimento institucional cadastrados;
- webchat publicado em pagina demonstrativa do portal;
- API externa simulada disponivel para consulta controlada;
- conversas de exemplo com texto, documento, imagem, audio, video e localizacao;
- relatorios com periodo mensal e dados demonstrativos;
- health, metrics e alerts sem erro critico.

## Roteiro Por Item 11.3

| Item | Demonstracao | Evidencia |
| --- | --- | --- |
| a) Canais exigidos | Mostrar WhatsApp oficial Meta, Webchat/portal e Inbox multicanal | `/app/inbox`, `/app/webchat`, Cloud API docs |
| b) Fluxo automatizado | Executar saudacao, menu e triagem | `/app/chatbot`, `ChatbotFlow` |
| c) Linguagem natural | Enviar pergunta livre e classificar intencao/contexto | intent resolver, AI assistant config |
| d) Encaminhamento e registro | Handoff humano, claim, resposta e timeline | Inbox/timeline, ConversationRuntimeState |
| e) Administracao | Usuarios, departamentos, filas, KB e chatbot | `/app/settings/users`, `/app/settings/departments`, `/app/knowledge-base` |
| f) Relatorios e paineis | Dashboard, reports mensal, CSV/PDF | `/app/dashboard`, `/app/reports` |
| g) Integracoes previstas | Public API, webhooks e API externa mock | `/app/api-keys`, `/app/webhooks`, OpenAPI |
| h) Seguranca/rastreabilidade/auditoria | RBAC, logs redigidos, LGPD, ops | `/app/settings/privacy`, `/admin/ops` |
| i) Consulta a base municipal | Resposta usando artigo KB institucional | `/app/knowledge-base` |
| j) Integracao com API externa | Consulta simulada a endpoint externo e resposta estruturada | mock controlado + logs/webhook |
| k) Relatorios estatisticos | Quantidade, medias, canais, atendente, setor | reports UI/export |
| l) Indicadores de desempenho | SLA, first response, resolution, alerts | ConversationMetrics, `/admin/ops/metrics` |
| m) Multiplos usuarios | Login simultaneo ADMIN/SUPERVISOR/AGENT e transferencia | users/RBAC/departments |

## Passo A Passo

### 1. Abertura

Explicar que o Converta e uma plataforma unica omnichannel multi-tenant, parametrizada por capabilities. A edicao governo e configuracao comercial/operacional, nao produto separado.

### 2. Canais

1. Abrir o Inbox.
2. Filtrar por WhatsApp.
3. Abrir Webchat demonstrativo embutido em pagina de portal.
4. Mostrar que as conversas entram no mesmo Inbox com identificacao de canal.

### 3. Chatbot E NLP

1. Enviar uma pergunta livre sobre horario, protocolo ou e-SIC.
2. Mostrar identificacao de intencao ou direcionamento por fluxo.
3. Mostrar menu com opcoes institucionais.
4. Alterar texto do fluxo pelo painel.

### 4. Base De Conhecimento

1. Abrir `/app/knowledge-base`.
2. Mostrar colecoes por tema: Portal, Ouvidoria, Protocolo, e-SIC, Diario Oficial.
3. Criar ou editar artigo.
4. Demonstrar resposta automatizada baseada no conteudo ou simulacao controlada com fonte.

Observacao: se o runtime de resposta automatizada com KB nao estiver habilitado no tenant demo, declarar como demonstracao assistida e registrar como ajuste antes da POC oficial.

### 5. Handoff Humano

1. Usuario solicita falar com atendente.
2. Conversa entra em fila.
3. Atendente assume.
4. Supervisor transfere para outro setor.
5. Timeline preserva historico, protocolo e mensagens.

### 6. Midias E Localizacao

1. Abrir conversa com imagem/documento/audio/video.
2. Abrir mensagem de localizacao.
3. Mostrar links Google Maps/OpenStreetMap.

### 7. Integracao Externa

Demonstracao recomendada:

```text
Pergunta do cidadao
  -> fluxo identifica servico
  -> chamada a API externa mock
  -> resposta estruturada
  -> registro em log/webhook
```

API mock sugerida:

- consulta de status de protocolo;
- consulta de publicacao do diario oficial;
- consulta de servico do portal institucional.

Nao declarar integracao real com sistemas da Camara sem credenciais/documentacao fornecidas.

### 8. Relatorios E Indicadores

1. Abrir Dashboard.
2. Abrir Relatorios.
3. Selecionar periodo mensal.
4. Mostrar CSV/PDF.
5. Mostrar volume de atendimentos, medias, automatizados, transferencias, atendente e setor.
6. Mostrar Satisfaction/NPS se habilitado no tenant demo; caso contrario, classificar como indicador disponivel mediante habilitacao.

### 9. Seguranca E LGPD

1. Mostrar roles e departamentos.
2. Demonstrar usuario sem permissao tentando acessar conversa de outro setor, se possivel.
3. Mostrar privacy/retention/anonymization.
4. Mostrar logs redigidos e ops.

### 10. SLA E Suporte

1. Abrir `/admin/ops/metrics`.
2. Abrir `/admin/ops/alerts`.
3. Demonstrar incident log e maintenance log.
4. Apresentar plano de suporte 1h/4h/8h/24h.

## Riscos Durante A POC

| Risco | Mitigacao |
| --- | --- |
| KB nao responder automaticamente | Preparar demo assistida com fonte e, se necessario, sprint curta de runtime KB antes da POC oficial. |
| API externa real indisponivel | Usar simulacao controlada, permitida pelo TR corrigido. |
| Comissao exigir manutencao quinzenal presencial | Levar esclarecimento sobre conflito com TR corrigido e proposta operacional alternativa. |
| Internet/Meta instavel | Ter conversas e prints de backup, mas priorizar demo real. |
| Dados pessoais em tela | Usar tenant demo com dados ficticios. |

## Encerramento

Finalizar com:

- matriz Anexo III;
- compromisso de treinamento 16h;
- plano SLA/suporte;
- premissas WhatsApp;
- ausencia de WhatsApp Web/QR;
- garantia de multitenancy e LGPD.
