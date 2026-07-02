# Converta Bid Package

Pacote institucional para propostas comerciais, demonstracoes e licitacoes.

Escopo:

- Catalogo Tecnico
- Arquitetura
- Seguranca
- LGPD
- Multi-tenant
- WhatsApp Oficial
- IA
- SLA
- Relatorios
- CRM Timeline
- Campanhas
- Integracoes

Este material descreve o Converta como plataforma SaaS de atendimento digital, automacao e operacao comercial/atendimento publico. A documentacao deve ser usada em conjunto com proposta comercial, plano de implantacao, matriz de aderencia e evidencias tecnicas atualizadas do ambiente ofertado.

## Documentos

| Documento | Finalidade |
| --- | --- |
| `01-catalogo-tecnico.md` | Visao institucional e funcional do produto |
| `02-arquitetura.md` | Arquitetura logica, componentes e operacao |
| `03-seguranca.md` | Controles de seguranca, acesso e segregacao |
| `04-lgpd.md` | Tratamento de dados pessoais, retencao e governanca |
| `05-multi-tenant.md` | Isolamento e governanca por tenant |
| `06-whatsapp-oficial.md` | Uso de API oficial Meta/WhatsApp |
| `07-ia.md` | IA supervisionada, limites e configuracao por tenant |
| `08-sla.md` | Indicadores e governanca de atendimento |
| `09-relatorios.md` | Relatorios, exportacoes e indicadores |
| `10-crm-timeline.md` | Historico, lead, timeline e acompanhamento |
| `11-campanhas.md` | Campanhas oficiais, templates e mensagens ativas |
| `12-integracoes.md` | APIs, canais Meta e integracoes externas |

## Premissas De Uso

- A proposta final deve refletir o ambiente contratado, incluindo infraestrutura, volume, retencao, canais e limites.
- Exigencias como 400 usuarios simultaneos, 30 canais WhatsApp, 5 Instagrams, 600 GB de midia, app nativo, NPS, OTP, Telegram ou Webchat exigem matriz de aderencia especifica.
- Tokens, segredos, chaves, IDs sensiveis e dados pessoais nao devem ser incluidos em anexos publicos.
- Pacotes especificos de certame devem ficar em `docs/bids/<ano>/<orgao>/` e referenciar este pacote institucional, sem duplicar conteudo tecnico.
