# Integracoes

## Visao Geral

O Converta integra canais oficiais Meta e dispoe de APIs internas para operacao do portal, canais, campanhas, relatorios, configuracoes e administracao.

## Canais Integrados

| Canal | Tipo | Status |
| --- | --- | --- |
| WhatsApp | Meta Cloud API oficial | Operacional |
| Facebook/Messenger | Meta Page/Messenger | Operacional quando configurado |
| Instagram Direct | Instagram Business Login/API | Operacional human-only quando configurado e autorizado |

## APIs Internas

O backend expoe rotas para:

- autenticacao;
- inbox;
- conversas;
- envio de mensagens;
- midias;
- campanhas;
- templates;
- relatorios;
- usuarios;
- departamentos;
- configuracoes;
- console interno.

## Webhooks

O sistema recebe webhooks assinados da Meta para canais oficiais.

Tratamento esperado:

- validacao de assinatura;
- identificacao do canal;
- resolucao do tenant;
- persistencia da mensagem;
- atualizacao da timeline;
- emissao realtime para o inbox.

## Integracoes Externas

O Converta possui uma fundacao de API publica em `/public-api/v1`, com chaves por tenant, escopos, auditoria, rate limit, health autenticado, leitura basica de contatos e leitura resumida de conversas. Nesta fase, a API publica ainda nao expoe mensagens, campanhas, escrita ou webhooks outbound como contrato externo completo.

Para integracoes com sistemas terceiros, recomenda-se especificar em projeto:

- endpoints necessarios;
- autenticacao;
- payloads;
- limites;
- eventos;
- webhooks de saida;
- auditoria;
- SLA;
- responsabilidades.

## Integrações Com Governo

Possiveis integracoes B2G:

- protocolo;
- ouvidoria;
- agenda;
- cadastro cidadao;
- portal de transparencia;
- sistemas legados;
- BI/relatorios.

Essas integracoes devem ser tratadas como escopo especifico, com contrato de API e ambiente de homologacao.

## Premissas

- O Converta possui base tecnica para APIs e contrato OpenAPI inicial para health e contatos.
- A exposicao de dados operacionais por API publica deve passar por escopos, rate limit, auditoria e validacao LGPD.
- Integracoes novas exigem levantamento, seguranca, homologacao e testes.
- Tokens e credenciais de integracao nunca devem ser expostos em UI, logs ou documentacao publica.
