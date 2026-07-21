# Torres/RS - Plano De Suporte E SLA

## Objetivo

Definir a base operacional de suporte, disponibilidade, backup, logs e controle de acesso para execução do contrato da Câmara Municipal de Torres/RS.

## Disponibilidade

Disponibilidade alvo: 99,5%.

A disponibilidade considera a plataforma Converta sob responsabilidade da contratada. Indisponibilidades de terceiros, como Meta/WhatsApp Business Platform, provedores de conectividade, DNS, data centers externos ou serviços do contratante, devem ser registradas e comunicadas, mas dependem das condições contratuais para composição do indicador.

## Suporte

Canal de suporte: remoto, por canal acordado no contrato.

Atendimento:

- suporte operacional para dúvidas de uso;
- suporte técnico para incidentes;
- manutenção corretiva;
- orientação sobre boas práticas;
- acompanhamento de indisponibilidades;
- apoio em ajustes pequenos de fluxo, quando compatíveis com o escopo.

## Classificação De Chamados

| Severidade | Exemplo | Tratamento |
| --- | --- | --- |
| Crítica | plataforma indisponível ou canal principal inoperante por falha da solução | atendimento prioritário e comunicação de andamento |
| Alta | falha que compromete operação relevante, com alternativa parcial | análise técnica e plano de correção |
| Média | dúvida operacional, ajuste de configuração ou instabilidade pontual | atendimento conforme fila de suporte |
| Baixa | solicitação de melhoria, orientação ou ajuste sem impacto operacional | planejamento conforme disponibilidade |

## Backup Diário

A operação deve manter rotina de backup diário dos dados da aplicação, com retenção mínima compatível com o contrato e evidência operacional.

Práticas previstas:

- backup periódico do banco;
- validação de integridade/checksum quando aplicável;
- retenção mínima de 30 dias, se exigida;
- restore drill operacional quando necessário;
- armazenamento seguro, sem exposição pública.

## Logs E Auditoria

A plataforma mantém logs e eventos operacionais para:

- autenticação e uso administrativo;
- eventos de atendimento;
- alterações operacionais;
- histórico de conversas;
- diagnóstico técnico;
- suporte e auditoria.

Logs e relatórios devem evitar exposição indevida de dados pessoais, tokens ou credenciais.

## Controle De Acesso

A solução utiliza:

- usuários individualizados;
- autenticação;
- perfis e permissões;
- isolamento por tenant;
- segregação de dados da Câmara em relação a outros clientes.

## Manutenção

A manutenção inclui:

- correções técnicas;
- atualizações controladas;
- monitoramento operacional;
- apoio à continuidade da operação;
- comunicação de incidentes relevantes.

## Limites Operacionais

Não fazem parte deste plano, salvo contratação específica:

- garantia de disponibilidade de provedores terceiros;
- aprovação automática de templates pela Meta;
- atendimento presencial recorrente além do treinamento contratado;
- desenvolvimento de módulos novos fora do escopo da solução.
