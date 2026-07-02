# SIMAE DE 36/2026 - Pacote Operacional De Suporte, SLA, Treinamento E Aceite

Fonte: `docs/bids/2026/simae-capinzal-sc/DE36-2026.pdf`.

Escopo: pacote operacional minimo para implantacao, suporte, treinamento e aceite do Converta no SIMAE, reaproveitando a plataforma, os runbooks e as evidencias tecnicas ja documentadas. Este documento nao altera produto, banco, runtime, infraestrutura ou contrato assinado.

## 1. Plano De Suporte

### Canais Oficiais

Os canais de suporte devem ser definidos na proposta/contrato e registrados no termo de inicio. Canais recomendados:

- e-mail institucional de suporte da contratada;
- telefone/WhatsApp corporativo de suporte;
- canal remoto de atendimento assistido para reunioes emergenciais;
- fiscal/gestor do contrato como ponto oficial de comunicacao do SIMAE.

Nao utilizar telefones pessoais, contas particulares ou credenciais de operadores em documentos publicos.

### Horario De Atendimento

| Tipo | Horario recomendado | Observacao |
| --- | --- | --- |
| Suporte ordinario | horario comercial em dias uteis | duvidas, operacao, configuracoes e acompanhamento |
| Incidente critico | janela emergencial pactuada | indisponibilidade total, falha critica de WhatsApp oficial ou perda de acesso operacional |
| Manutencao programada | janela previamente comunicada | preferencialmente fora do horario de maior atendimento |

### Severidades

| Severidade | Criterio | Primeira resposta | Meta de resolucao |
| --- | --- | --- | --- |
| Critica | indisponibilidade total, DB indisponivel, WhatsApp oficial sem inbound/outbound para o tenant, perda de acesso geral | ate 1 hora | ate 24 horas quando tecnicamente possivel |
| Alta | degradacao relevante em Inbox, relatorios, filas, departamentos ou canal oficial | ate 4 horas uteis | ate 2 dias uteis |
| Media | falha contornavel, duvida operacional, ajuste de fluxo ou configuracao | ate 1 dia util | conforme complexidade |
| Baixa | melhoria, orientacao, item evolutivo ou ajuste nao impeditivo | ate 2 dias uteis | planejado em backlog |

As metas dependem de acesso ao ambiente, disponibilidade dos provedores externos, credenciais Meta validas e cooperacao operacional do contratante.

### Escalonamento

1. Registrar chamado ou incidente pelo canal oficial.
2. Classificar severidade e impacto.
3. Para severidade critica, registrar incidente em `/admin/ops/incidents`.
4. Acionar responsavel tecnico da RE7ONLINE.
5. Comunicar fiscal/gestor do contrato com causa provavel, impacto e previsao de normalizacao.
6. Registrar acao corretiva e horario de fim.
7. Anexar evidencia no relatorio mensal quando aplicavel.

## 2. SLA 1h/24h

Para incidentes criticos:

- primeira resposta em ate 1 hora;
- resolucao completa em ate 24 horas quando a causa estiver sob controle tecnico da contratada;
- se houver dependencia externa, como Meta/WhatsApp, provedor de nuvem, DNS ou conectividade do contratante, registrar a dependencia e manter comunicacao ativa.

Registro minimo:

- data/hora de abertura;
- severidade;
- status;
- descricao;
- impacto;
- inicio/fim;
- causa provavel;
- acao adotada;
- comunicacao ao cliente.

Evidencia tecnica:

- `/health`;
- `/admin/ops/metrics`;
- `/admin/ops/alerts`;
- `/admin/ops/incidents`;
- `/admin/ops/maintenances`;
- `/admin/ops/sla/monthly`.

## 3. Treinamento Inicial

Formato recomendado: treinamento remoto ou presencial assistido, conforme contrato, com registro de participantes, data e pauta.

Roteiro minimo:

1. Visao geral do Converta e responsabilidades do operador.
2. Login, sessao e boas praticas de senha.
3. Navegacao no Dashboard.
4. Operacao do Inbox.
5. Abertura de conversa e leitura da Timeline.
6. Protocolo de atendimento.
7. Claim/release de atendimento.
8. Transferencia entre atendentes.
9. Transferencia entre departamentos/setores.
10. Uso de filas e departamentos.
11. Chatbot, fluxos, menus e handoff humano.
12. Mensagens com texto, midias e localizacao.
13. Relatorios mensais, CSV/PDF e indicadores.
14. Como abrir suporte.
15. Boas praticas LGPD: minimo necessario, nao exportar dados sem finalidade, nao compartilhar credenciais e nao usar canais pessoais.

Evidencia recomendada:

- lista de presenca;
- data/hora;
- pauta aplicada;
- responsavel pelo treinamento;
- aceite do gestor/fiscal.

## 4. Checklist De Implantacao E Aceite

| Etapa | Evidencia esperada | Status |
| --- | --- | --- |
| Tenant SIMAE provisionado | seguir `SIMAE_TENANT_PROVISIONING_PACK.md` e validar no console interno | pendente de go-live |
| Canal WhatsApp oficial Meta configurado | `TenantMetaConfig`, `WaPhoneNumber`, WABA inscrita e inbound real | pendente de go-live |
| Ate 25 usuarios criados | usuarios ADMIN/SUPERVISOR/AGENT conforme organograma | pendente de go-live |
| Departamentos/setores configurados | setores administrativos do SIMAE | pendente de go-live |
| Filas configuradas | fila geral e filas/setores definidos | pendente de go-live |
| Permissoes/RBAC revisadas | perfis por usuario e departamento | pendente de go-live |
| Fluxos iniciais criados | saudacao, triagem, ausencia, encerramento e handoff | pendente de go-live |
| Envio/recebimento WhatsApp validado | mensagem real recebida e resposta enviada | pendente de go-live |
| Midia/localizacao validada | documento/imagem/audio/video/localizacao quando aplicavel | pendente de go-live |
| Protocolo validado | protocolo visivel, buscavel e exportavel | pendente de go-live |
| Relatorio mensal validado | CSV/PDF com periodo mensal e indicadores contratuais | pendente de go-live |
| Backup/evidencia validada | `backup:postgres`, checksum, offsite configurado e status anexado | pendente de operacao |
| Restore drill validado | restore em banco isolado e evidencia JSONL anexada | pendente de operacao |
| Incidente/SLA validado | registro teste ou procedimento aprovado em `/admin/ops/incidents` | pendente de operacao |
| Manutencao programada validada | procedimento aprovado em `/admin/ops/maintenances` | pendente de operacao |
| Treinamento realizado | lista/pauta/aceite | pendente de agenda |
| Aceite operacional | termo/checklist assinado pelo fiscal/gestor | pendente |

## 5. Manutencao Programada

Procedimento:

1. Definir janela, motivo e impacto esperado.
2. Comunicar previamente o fiscal/gestor do contrato.
3. Registrar a janela em `/admin/ops/maintenances`.
4. Executar checklist de backup antes da manutencao quando houver risco operacional.
5. Executar alteracao/deploy seguindo `docs/saas/RELEASE_CHECKLIST.md`.
6. Validar `/health`, PM2, DB, Inbox e alertas.
7. Comunicar normalizacao e registrar observacoes finais.

Manutencao corretiva emergencial pode ocorrer sem aviso previo quando necessaria para restaurar disponibilidade, mas deve gerar comunicacao posterior com causa provavel, impacto e acao adotada.

## 6. Comunicacao De Incidentes

Modelo minimo de comunicado:

```text
Assunto: Comunicado operacional Converta - [severidade]

Data/hora de inicio:
Servico afetado:
Impacto observado:
Causa provavel:
Acao adotada:
Previsao de normalizacao:
Proxima atualizacao:
Responsavel:
```

Ao encerrar:

```text
Data/hora de normalizacao:
Causa confirmada:
Acao corretiva:
Medida preventiva:
Evidencia anexada:
```

## 7. Evidencias A Anexar Ao Dossie Mensal

- exportacao mensal de relatorios do Converta;
- snapshot `/admin/ops/sla/monthly`;
- incidentes do periodo;
- manutencoes programadas do periodo;
- status do backup PostgreSQL;
- evidencia de restore drill quando executado;
- observacoes de treinamento/suporte, se houver.

## 8. Limites E Premissas

- Este pacote nao substitui a proposta comercial nem o contrato.
- O provisionamento detalhado do tenant SIMAE fica em `docs/bids/2026/simae-capinzal-sc/SIMAE_TENANT_PROVISIONING_PACK.md`.
- Atendimento presencial depende de previsao contratual, disponibilidade e localidade.
- Prazos de resolucao critica dependem de a causa estar sob controle da contratada.
- Incidentes causados por indisponibilidade da Meta/WhatsApp, internet do contratante, DNS externo ou provedor de nuvem devem ser comunicados e acompanhados, mas podem depender de terceiros.
- Credenciais, tokens, dumps e dados pessoais nao devem ser incluidos em anexos publicos.
