# Integracoes

## Visao Geral

O Converta integra canais oficiais Meta e dispoe de APIs internas para operacao do portal, canais, campanhas, relatorios, configuracoes e administracao.

## Canais Integrados

| Canal | Tipo | Status |
| --- | --- | --- |
| WhatsApp | Meta Cloud API oficial | Operacional |
| Facebook/Messenger | Meta Page/Messenger | Operacional quando configurado |
| Instagram Direct | Instagram Business Login/API | Operacional human-only quando configurado e autorizado |
| Webchat | Widget JS publico + runtime Converta | MVP operacional por feature flag |

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

## Webchat Publico

O Webchat utiliza script embutivel servido pelo Converta e endpoints publicos do namespace `/webchat/v1`.

Fluxo suportado no MVP:

- iniciar sessao de visitante;
- enviar mensagem texto;
- criar conversa `channel=webchat` no Inbox;
- permitir resposta humana pelo operador;
- disponibilizar mensagens ao visitante por polling com cursor.

O widget respeita dominio autorizado, site ativo e feature flag `webchat`. Midia, upload, WebSocket, SSE, IA e chatbot automatico ficam fora deste MVP.

## Integracoes Externas

O Converta possui uma fundacao de API publica em `/public-api/v1`, com chaves por tenant, escopos, auditoria, rate limit, health autenticado, leitura basica de contatos, leitura resumida de conversas e leitura paginada de mensagens normalizadas.

Tambem existe infraestrutura inicial de webhooks outbound para integracoes externas:

- cadastro de endpoints por tenant;
- segredo HMAC exibido uma unica vez;
- armazenamento apenas de hash do segredo;
- validacao de URL HTTPS e bloqueio basico de destinos internos;
- diagnostico de deliveries/attempts para a fase de envio futuro.

Nesta fase, a API publica ainda nao expoe campanhas, escrita ou dispatch automatico de webhooks como contrato externo completo.

Para integracoes com sistemas terceiros, recomenda-se especificar em projeto:

- endpoints necessarios;
- autenticacao;
- payloads;
- limites;
- eventos;
- webhooks de saida e politica de retries;
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

- O Converta possui base tecnica para APIs e contrato OpenAPI inicial para health, contatos, conversas e mensagens.
- Webhooks outbound possuem infraestrutura de cadastro/assinatura, mas o envio automatico deve ser contratado e homologado em fase propria.
- A exposicao de dados operacionais por API publica deve passar por escopos, rate limit, auditoria e validacao LGPD.
- Integracoes novas exigem levantamento, seguranca, homologacao e testes.
- Tokens e credenciais de integracao nunca devem ser expostos em UI, logs ou documentacao publica.
