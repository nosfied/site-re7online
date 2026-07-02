# SIMAE DE 36/2026 - Pacote De Provisionamento Do Tenant

Fonte: `docs/bids/2026/simae-capinzal-sc/DE36-2026.pdf`.

Escopo: checklist operacional para provisionar o tenant SIMAE no Converta caso a proposta seja vencedora. Este documento nao cria produto separado, nao altera o Core, nao hardcoda regras de agua/esgoto no runtime e nao contem credenciais, tokens, IDs reais ou dados pessoais.

## 1. Identidade Do Tenant

| Item | Valor sugerido | Observacao |
| --- | --- | --- |
| Nome | SIMAE Capinzal/Ouro | ajustar conforme contrato/razao oficial |
| Slug/clientKey | `simae-capinzal-sc` | identificador tecnico sugerido; confirmar padrao operacional antes do go-live |
| Perfil de mercado | `government` | apenas default operacional; comportamento final deve vir de capabilities/configuracao do tenant |
| Usuarios ativos | ate 25 | conforme aceite tecnico 83C |
| Canal principal | WhatsApp oficial Meta | Cloud API oficial, sem WhatsApp Web/QR |
| Ambiente | producao contratual | somente apos aceite de implantacao |

## 2. Capabilities E Configuracao Inicial

Capabilities recomendadas para o contrato:

- `departments`;
- `queues`;
- `sla`;
- `reports`;
- `chatbot`;
- `templates`, se houver mensagens proativas aprovadas pela Meta;
- `advancedSearch`, se habilitado no escopo contratado;
- `publicApi`, somente se houver integracao formal prevista.

Nao habilitar capabilities nao previstas no contrato. Overrides por tenant devem prevalecer sobre defaults de profile, mantendo multitenancy, RBAC e auditoria.

## 3. Departamentos E Filas Sugeridos

Estrutura inicial sugerida, a ser validada com o fiscal/gestor antes do go-live:

| Departamento | Fila inicial | Uso |
| --- | --- | --- |
| Atendimento Geral | Geral | primeira triagem e duvidas gerais |
| Comercial/Faturamento | Faturamento | segunda via, debitos, cadastro e contas |
| Operacional/Manutencao | Manutencao | vazamento, falta de agua, ordens de servico e campo |
| Agua/Esgoto | Agua e Esgoto | demandas tecnicas especificas de abastecimento/esgoto |
| Ouvidoria | Ouvidoria | manifestacoes, reclamacoes e acompanhamento |
| TI/Administracao | Administracao | usuarios, permissao, configuracao e apoio interno |

Esta estrutura e sugestao operacional. Nao deve ser implementada como regra fixa no Core.

## 4. Plano De Usuarios E RBAC

Distribuicao sugerida para ate 25 usuarios:

| Papel | Quantidade sugerida | Uso |
| --- | --- | --- |
| ADMIN | 2 | administracao do tenant, usuarios, departamentos, relatorios e configuracoes |
| SUPERVISOR | 4 | acompanhamento de filas, transferencias, relatorios e apoio aos atendentes |
| AGENT | ate 19 | atendimento diario por setor/departamento |

Regras:

- criar usuarios somente com dados oficiais fornecidos pelo SIMAE;
- nao commitar nomes, e-mails ou telefones reais no repositorio;
- cada usuario deve ter departamento coerente com sua funcao;
- validar que usuarios sem permissao nao acessam departamentos de outro setor;
- repetir a prova tecnica 83C se houver alteracao de usuario/departamento/fila/transferencia.

## 5. Fluxo Inicial De Chatbot

Fluxo inicial minimo sugerido:

```text
Saudacao institucional
  1. Segunda via / faturamento
  2. Falta de agua, vazamento ou manutencao
  3. Ligacao nova e servicos
  4. Falar com atendente
  5. Ouvidoria
  6. Encerrar atendimento
```

Direcionamento sugerido:

| Opcao | Departamento/Fila |
| --- | --- |
| Segunda via / faturamento | Comercial/Faturamento |
| Falta de agua, vazamento ou manutencao | Operacional/Manutencao |
| Ligacao nova e servicos | Atendimento Geral ou Agua/Esgoto |
| Falar com atendente | Atendimento Geral |
| Ouvidoria | Ouvidoria |
| Encerrar atendimento | encerramento padrao |

Mensagens minimas:

- saudacao com identificacao do SIMAE;
- aviso de que o atendimento gera protocolo;
- orientacao de horario/ausencia quando fora do expediente;
- handoff humano quando o cidadao solicitar atendente;
- encerramento com orientacao de acompanhamento pelo protocolo.

O fluxo deve ser configurado pelo modulo de chatbot existente. Nao criar logica especifica no Core para agua/esgoto.

## 6. Canal WhatsApp Oficial Meta

Checklist:

1. Confirmar se o numero pertence ao portfolio da RE7/Reset ou ao portfolio do SIMAE.
2. Registrar ou vincular o numero via console interno conforme `docs/onboarding.md`.
3. Validar:
   - `TenantMetaConfig.phoneNumberId`;
   - `WaPhoneNumber -> Client`;
   - WABA ID;
   - display phone number;
   - `subscribed_apps`;
   - webhook publico;
   - assinatura `X-Hub-Signature-256`;
   - inbound real no tenant correto;
   - outbound real pela Cloud API.
4. Configurar templates Meta aprovados quando houver mensagens fora da janela de 24h.
5. Testar:
   - texto;
   - imagem/documento;
   - audio/video quando aplicavel;
   - localizacao;
   - protocolo visivel;
   - resposta humana.

Nao registrar tokens, `phone_number_id`, WABA ID ou Business ID reais neste documento.

## 7. Relatorios, Protocolo, Backup E SLA

Antes do aceite operacional:

- validar `/app/reports` com periodo mensal fechado;
- exportar CSV/PDF;
- confirmar campos de protocolo, atendimentos automatizados e transferencias;
- abrir conversa no Inbox e confirmar protocolo `CVT-...`;
- buscar conversa pelo protocolo quando aplicavel;
- executar/validar `backup:postgres`;
- anexar `backup:evidence status`;
- executar restore drill em banco isolado quando houver backup real;
- consultar `/admin/ops/sla/monthly`;
- registrar ou simular procedimento de incidente/manutencao conforme 83D/83F.

## 8. Checklist De Go-Live

| Check | Resultado esperado |
| --- | --- |
| Tenant criado | `simae-capinzal-sc` ou slug aprovado |
| Features/capabilities revisadas | apenas escopo contratado habilitado |
| Usuarios criados | ate 25, com roles e departamentos |
| Departamentos/filas criados | estrutura validada com fiscal/gestor |
| Chatbot configurado | saudacao, menu, handoff, ausencia e encerramento |
| WhatsApp oficial conectado | inbound/outbound reais no tenant correto |
| Midias/localizacao validadas | timeline exibe corretamente |
| Protocolo validado | visivel, buscavel e exportavel |
| Relatorio mensal validado | PDF/CSV gerados |
| Backup/offsite validado | status anexado ao dossie |
| SLA/incidentes validado | endpoints/processo conferidos |
| Treinamento realizado | lista/pauta/aceite anexados |
| Aceite operacional | fiscal/gestor confirma entrada em operacao |

## 9. Evidencias De Aceite

Anexar ao dossie de implantacao:

- print do Dashboard;
- print do Inbox;
- print da Timeline com protocolo e localizacao;
- print de departamentos/usuarios;
- print de chatbot/fluxos;
- PDF/CSV de relatorio mensal;
- evidencia de `/health`;
- evidencia de `/admin/ops/metrics` e `/admin/ops/alerts`;
- evidencia de backup/checksum/offsite;
- evidencia de restore drill, quando executado;
- lista/pauta de treinamento;
- termo/checklist de aceite.

## 10. Limites

- Este pacote nao executa provisionamento automaticamente.
- Este pacote nao substitui o contrato, proposta comercial ou ordem de servico.
- Dados reais do SIMAE devem ser coletados por canal seguro e nunca commitados.
- Qualquer alteracao no Core deve passar por sprint propria; este pacote e apenas operacional.
