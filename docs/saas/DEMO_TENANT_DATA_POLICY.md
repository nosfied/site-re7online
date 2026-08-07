# Demo Tenant Data Policy

Status: politica de dados para demonstracoes. Nao altera runtime.

## Principio

Tenant de demonstracao deve usar apenas dados ficticios, minimizados e controlados. O objetivo e demonstrar fluxo, nao armazenar base real.

## Dados Permitidos

- nomes ficticios;
- organizacoes ficticias;
- cidades genericas;
- textos de atendimento neutros;
- templates aprovados de demonstracao;
- mensagens prontas sem dados pessoais;
- conversas simuladas ou internas autorizadas;
- numeros internos mascarados em relatorio.

## Dados Proibidos

- telefone completo em documentacao;
- documento pessoal;
- email real de cliente;
- nome real de cidadao/cliente;
- payload cru de webhook;
- token ou credencial;
- corpo completo de mensagem real em relatorio;
- lista de contatos real;
- dados anonimizados restaurados;
- credenciais Meta ou referencias secretas.

## CRM

Registros CRM de demo devem ser criados de forma minima:

- nome demonstrativo;
- canal;
- status;
- cidade generica opcional;
- empresa ficticia opcional.

Nao importar planilhas reais para demo.

## Conversas

Conversas de demo devem:

- usar massa ficticia;
- usar numero interno autorizado somente quando houver teste real controlado;
- evitar historico pessoal;
- nao expor telefone completo em listagens amplas.

## Templates E Mensagens Prontas

Templates devem estar aprovados e ativos localmente. Mensagens prontas devem ser neutras e nao conter promessas de prazo, custo ou resultado.

## LGPD

Anonimizacao remove o registro da operacao visivel. O tenant de demo nao deve tentar reidratar nome, telefone, perfil, CRM ou historico antigo.

## Logs E Relatorios

Relatorios de demo devem ser agregados ou sanitizados:

- sem telefone completo;
- sem bodyText real completo;
- sem token;
- sem rawPayload;
- sem IDs externos crus.

## Antes De Apresentar

Executar:

```bash
cd apps/whatsapp-agent
npm run demo:readiness -- --tenant demo-converta
```

Revisar manualmente qualquer `WARN` relacionado a dados CRM, templates, usuarios ou canal.
