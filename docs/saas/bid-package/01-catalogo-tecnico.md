# Catalogo Tecnico Do Converta

## Apresentacao

O Converta e uma plataforma SaaS de atendimento digital, centralizacao de conversas, automacao supervisionada e gestao operacional de relacionamento com clientes ou cidadaos.

A solucao organiza atendimentos em canais digitais oficiais, permite operacao por multiplos usuarios, acompanha historico de interacoes e disponibiliza recursos de CRM, relatorios, campanhas, templates e assistencia por IA quando habilitada.

## Posicionamento

O Converta nao e apenas um chatbot. A plataforma atua como uma central inteligente de operacao comercial e atendimento, integrando:

- WhatsApp oficial;
- Instagram Direct, quando habilitado e aprovado na Meta;
- Facebook/Messenger, quando configurado;
- inbox multiatendente;
- filas e setores;
- CRM conversacional;
- historico e timeline;
- campanhas oficiais;
- relatorios e indicadores;
- automacao e IA supervisionada;
- governanca multi-tenant.

## Modulos Principais

| Modulo | Descricao | Status |
| --- | --- | --- |
| Inbox omnichannel | Central de conversas com operadores, status, atribuicao e timeline | Operacional |
| WhatsApp Oficial | Atendimento via API oficial Meta/WhatsApp Cloud API | Operacional |
| Instagram Direct | Inbound/outbound manual human-only, conforme permissao Meta | Operacional condicionado a configuracao |
| Facebook/Messenger | Atendimento humano via Page/Messenger | Operacional condicionado a token valido |
| Webchat | Widget JS minimo embutivel, sessao publica, inbound no Inbox, resposta humana e polling do visitante | MVP operacional por feature flag |
| Chatbot | Fluxos configuraveis de atendimento e qualificacao | Operacional |
| IA supervisionada | Respostas assistidas/configuradas por tenant | Operacional com controle por tenant |
| CRM Timeline | Historico do lead/contato e notas operacionais | Operacional |
| Agendamento | Servicos, recursos, disponibilidade, compromissos, lembretes manuais e elegibilidade shadow por tenant; confirmacao/envio desenhados para proxima fase | MVP estrutural por feature flag |
| Campanhas | Disparo por templates oficiais aprovados pela Meta | Operacional |
| Templates | Gestao de modelos oficiais | Operacional |
| Relatorios | Indicadores de conversas, SLA e operacao | Operacional |
| Dashboard | Visao gerencial por perfil/feature | Operacional por configuracao |
| Usuarios e setores | Equipes, departamentos, atribuicoes e permissoes | Operacional |
| LGPD/retencao | Politica de retencao, soft delete e anonimizacao operacional | Operacional |

## Perfis Atendidos

### Empresas

- comercio;
- servicos;
- clinicas;
- escritorios;
- agencias;
- operacoes de vendas;
- suporte e relacionamento.

### Governo

- prefeituras;
- autarquias;
- camaras;
- institutos;
- ouvidorias;
- centrais de atendimento ao cidadao.

## Recursos De Operacao

- atendimento multiusuario;
- atendimento por departamentos;
- acompanhamento de conversas em tempo real;
- historico completo por contato;
- transferencia para atendimento humano;
- devolucao para fila;
- encerramento/finalizacao de atendimento;
- notificacoes de novas mensagens;
- controle por perfil e permissao;
- exportacao e relatorios.

## Premissas Tecnicas

- A contratacao deve especificar volume de usuarios, canais, armazenamento, tempo de retencao e SLA.
- Recursos que dependem da Meta exigem conta, permissao, token e aprovacao aplicavel.
- Canais adicionais ou exigencias de alto volume exigem validacao previa de infraestrutura.

## Webchat Embutivel

O Webchat pode ser habilitado por tenant e por site autorizado. O widget minimo usa script publico e valida dominio por `WebchatAllowedDomain`.

Exemplo de instalacao:

```html
<script
  src="https://converta.re7online.com/webchat/widget.js"
  data-site-id="webchat_site_id"
  data-title="Atendimento"
  data-subtitle="Fale com a equipe"
  async
></script>
```

O MVP suporta texto, sessao de visitante, conversa no Inbox, resposta humana e polling. Nao inclui midia, upload, WebSocket, SSE, IA ou chatbot automatico.
