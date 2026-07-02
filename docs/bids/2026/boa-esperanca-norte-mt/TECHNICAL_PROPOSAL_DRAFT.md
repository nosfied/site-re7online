# Boa Esperanca do Norte/MT - Proposta Tecnica Base

Uso: estrutura base para proposta tecnica da Concorrencia Eletronica no 001/2026. Deve ser revisada juridica e comercialmente antes do envio.

Nao inserir tokens, credenciais, dados pessoais, documentos pessoais, dados bancarios ou IDs sensiveis.

## 1. Apresentacao Da Empresa

**[RAZAO SOCIAL DA LICITANTE]** apresenta sua proposta tecnica para implantacao de solucao web de servicos inteligentes multicanal de autoatendimento, com chatbot, IA, canais digitais, relatorios, suporte e treinamento para a Camara Municipal de Boa Esperanca do Norte/MT.

Dados a preencher fora do repositorio:

- razao social;
- CNPJ;
- endereco;
- representante legal;
- contato comercial;
- contato tecnico;
- dados de assinatura.

## 2. Apresentacao Do Converta Platform

O Converta Platform e uma plataforma SaaS unica de atendimento omnichannel multi-tenant, parametrizada por capabilities e configuracao de tenant. A solucao permite operar canais digitais, chatbot, atendimento humano, historico de conversas, relatorios, seguranca, LGPD, observabilidade e integracoes.

O produto nao possui versoes separadas por mercado. A edicao para orgaos publicos e uma configuracao operacional/comercial sobre o mesmo Core, preservando arquitetura, seguranca, RBAC e isolamento por tenant.

Referencias:

- `docs/saas/MARKET_PROFILE_ARCHITECTURE.md`
- `docs/saas/bid-package/01-catalogo-tecnico.md`
- `docs/saas/bid-package/02-arquitetura.md`

## 3. Arquitetura SaaS E Multitenant

A solucao opera em modelo SaaS, acessivel via navegador, com backend de atendimento, banco PostgreSQL, integracao com API oficial Meta, painel administrativo, logs estruturados, metricas internas e alertas operacionais.

Pontos demonstraveis:

- ambiente web;
- isolamento por tenant;
- RBAC;
- capabilities por contrato/configuracao;
- healthcheck e monitoramento;
- backup/restore;
- release checklist.

Referencias:

- `docs/saas/bid-package/05-multi-tenant.md`
- `docs/saas/OBSERVABILITY_OPERATIONS_AUDIT.md`
- `docs/saas/RELEASE_CHECKLIST.md`

## 4. Canais Digitais

O Converta suporta atendimento por WhatsApp oficial Meta e Webchat, com arquitetura multicanal preparada para outros canais quando contratados/habilitados por capability.

Para este certame, a demonstracao deve focar:

- WhatsApp Business oficial;
- Webchat/portal institucional;
- Inbox omnichannel;
- historico e timeline;
- midias e localizacao.

Referencias:

- `docs/saas/bid-package/06-whatsapp-oficial.md`
- `docs/bids/2026/boa-esperanca-norte-mt/POC_REMOTE_SCRIPT.md`

## 5. Chatbot, NLP E IA

A plataforma possui fluxos configuraveis, intents, perfil de assistente por tenant, IA supervisionada e handoff para atendimento humano. Nao ha dependencia de fabricante especifico de motor de NLP/IA, conforme permitido pelo TR.

Pontos de POC:

- saudacao institucional;
- menu de atendimento;
- pergunta em linguagem natural;
- direcionamento por intencao/fluxo;
- encaminhamento para atendente;
- ajuste de mensagens pelo painel.

Referencias:

- `docs/saas/bid-package/07-ia.md`
- `docs/bids/2026/boa-esperanca-norte-mt/ANEXO_III_EVIDENCE_MATRIX.md`

## 6. Webchat No Portal Institucional

O Webchat permite atendimento via site institucional ou pagina demonstrativa, preservando tenant, canal, historico e Inbox unificado.

Pontos de POC:

- exibir site/pagina demonstrativa com widget;
- iniciar sessao de visitante;
- enviar mensagem;
- visualizar conversa no Inbox;
- responder pelo atendente.

## 7. Base De Conhecimento

A plataforma possui base de conhecimento tenant-scoped, com colecoes, artigos, status, tags, fonte e edicao pelo painel.

Pontos de POC:

- criar colecao "Institucional";
- criar artigo sobre servico da Camara;
- publicar artigo;
- demonstrar resposta automatizada ou assistida baseada no artigo e com fonte.

Ressalva tecnica: a proposta deve demonstrar a capacidade real sem afirmar integracao com documentos oficiais nao fornecidos pela Camara antes da fase de implantacao.

## 8. Integracoes E APIs

O Converta possui Public API, webhooks, API keys, escopos, logs e padroes de integracao. Para a POC, o TR permite simulacao controlada quando a Administracao nao disponibilizar ambiente de homologacao ou documentacao tecnica.

Pontos de POC:

- criar API key com escopo limitado;
- demonstrar webhook/API externa simulada;
- registrar payload/log de integracao;
- explicar plano de integracao futura com Portal, e-SIC, Ouvidoria, Protocolo ou Diario Oficial, conforme APIs disponibilizadas pela Camara.

Referencias:

- `docs/saas/bid-package/12-integracoes.md`
- `docs/saas/public-api/openapi.yaml`

## 9. Painel Administrativo E Relatorios

O painel permite operacao e administracao por perfis, incluindo usuarios, departamentos, filas, chatbot, base de conhecimento, relatorios e configuracoes.

Relatorios demonstraveis:

- volume de atendimentos;
- tempo medio de primeira resposta;
- tempo medio de resolucao;
- atendimentos automatizados;
- transferencias para humano;
- por atendente;
- por setor;
- periodo mensal;
- exportacao CSV/PDF.

Referencias:

- `docs/saas/bid-package/09-relatorios.md`
- `docs/bids/2026/boa-esperanca-norte-mt/ANEXO_III_EVIDENCE_MATRIX.md`

## 10. Seguranca, LGPD E Auditoria

Controles disponiveis:

- autenticacao e sessoes;
- RBAC;
- isolamento multitenant;
- redaction de logs;
- LGPD: retencao, anonimizacao e exclusao/anonymize operacional;
- auditoria de eventos;
- MFA foundation;
- backup/restore;
- health, metrics e alerts.

Referencias:

- `docs/saas/bid-package/03-seguranca.md`
- `docs/saas/bid-package/04-lgpd.md`
- `docs/saas/LOGGING_AUDIT_STANDARD.md`

## 11. Suporte, SLA E Manutencao

O plano de suporte atende ao TR corrigido:

- critico: inicio ate 1h, solucao/mitigacao ate 8h;
- alta: inicio ate 4h, solucao/mitigacao ate 24h;
- media: inicio ate 8h uteis, solucao ate 72h;
- baixa: inicio ate 24h uteis, solucao ate 5 dias uteis.

Referencias:

- `docs/bids/2026/boa-esperanca-norte-mt/SUPPORT_SLA_PLAN.md`

## 12. Treinamento 16h

O treinamento previsto contempla ate 15 servidores, em formato hibrido, com modulos de plataforma, seguranca, Dashboard, Inbox, chatbot, KB, relatorios, integracoes, suporte e pratica assistida.

Referencia:

- `docs/bids/2026/boa-esperanca-norte-mt/TRAINING_16H_PLAN.md`

## 13. Implantacao Em 30 Dias

Plano macro:

| Periodo | Atividade |
| --- | --- |
| Dias 1-5 | kickoff, coleta de dados, tenant, usuarios, setores e canal Meta |
| Dias 6-10 | chatbot, Webchat, KB inicial e identidade institucional |
| Dias 11-15 | integracao simulada/API, relatorios, seguranca e backup |
| Dias 16-20 | testes operacionais, ajustes e validacao interna |
| Dias 21-25 | treinamento 16h e POC assistida |
| Dias 26-30 | aceite, go-live e acompanhamento inicial |

## 14. POC Remota

Usar o roteiro:

- `docs/bids/2026/boa-esperanca-norte-mt/POC_REMOTE_SCRIPT.md`
- `docs/bids/2026/boa-esperanca-norte-mt/POC_OPERATIONAL_CHECKLIST.md`

## 15. Aderencia Ao Anexo III

A matriz de 97 criterios esta em:

- `docs/bids/2026/boa-esperanca-norte-mt/ANEXO_III_EVIDENCE_MATRIX.md`

Pontuacao tecnica conservadora estimada:

```text
POP provavel: 80 a 87 / 97
NPT provavel: 82,47 a 89,69 / 100
```

## 16. Ressalvas Que Devem Ser Tratadas Na Proposta

1. Integracoes reais dependem de APIs, credenciais e homologacao fornecidas pela Camara.
2. Manutencao preventiva quinzenal presencial aparece no Anexo III, enquanto o TR corrigido trata manutencao remota mensal; registrar condicao comercial ou pedir esclarecimento.
3. Custos Meta/WhatsApp e IA devem ser precificados conforme volumes e categorias.
4. Marketing WhatsApp somente mediante autorizacao expressa e previa da Administracao.
5. Nao prometer conectores especificos para sistemas da Camara sem documentacao tecnica.
