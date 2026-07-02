# Boa Esperanca do Norte/MT - Plano De Suporte, SLA E Manutencao

Fonte: itens 9 e 10 do Termo de Referencia Corrigido.

Este plano e operacional/contratual. Nao altera produto, banco, runtime ou infraestrutura.

## Canais Formais

Definir na proposta/contrato:

- e-mail institucional de suporte;
- telefone/WhatsApp corporativo de suporte;
- sala remota para incidentes criticos;
- fiscal/gestor do contrato como ponto oficial;
- ferramenta ou registro formal de chamados com status.

## Severidades E Prazos

| Severidade | Exemplo | Inicio do atendimento | Solucao ou mitigacao |
| --- | --- | ---: | ---: |
| Critica | indisponibilidade total, DB indisponivel, WhatsApp oficial sem operar | ate 1 hora | ate 8 horas |
| Alta | degradacao relevante de Inbox, bot, relatorios ou canal principal | ate 4 horas | ate 24 horas |
| Media | falha contornavel, configuracao, duvida operacional | ate 8 horas uteis | ate 72 horas |
| Baixa | melhoria, ajuste evolutivo, orientacao sem impacto | ate 24 horas uteis | ate 5 dias uteis |

## Registro Formal De Chamado

Campos minimos:

- numero do chamado;
- data/hora de abertura;
- solicitante;
- severidade;
- status;
- descricao;
- impacto;
- responsavel;
- atualizacoes;
- data/hora de encerramento;
- causa provavel;
- acao adotada;
- evidencia anexada.

Status sugeridos:

- aberto;
- em triagem;
- em atendimento;
- aguardando terceiro;
- aguardando contratante;
- mitigado;
- resolvido;
- encerrado.

## Incidentes De Seguranca

Comunicar a contratante em ate 24 horas apos identificacao, com:

- descricao do evento;
- dados/servicos potencialmente afetados;
- impacto conhecido;
- medidas adotadas;
- plano de acao;
- proxima atualizacao.

Evidencia tecnica disponivel:

- logs redigidos;
- `/admin/ops/incidents`;
- `/admin/ops/alerts`;
- `/admin/ops/metrics`;
- backup/status quando aplicavel.

## Manutencao Preventiva

O TR corrigido estabelece manutencao preventiva remota mensal. O Anexo III menciona manutencao preventiva quinzenal presencial. Ha divergencia documental.

Recomendacao:

1. pedir esclarecimento formal ou registrar ressalva na proposta;
2. ofertar preventiva remota mensal como padrao aderente ao TR corrigido;
3. se a comissao exigir o Anexo III literal, precificar manutencao quinzenal presencial como compromisso operacional, nao como feature de produto.

Registro minimo de manutencao:

- periodo;
- motivo;
- tipo: preventiva/corretiva/evolutiva;
- impacto esperado;
- comunicacao previa;
- status;
- evidencias de health antes/depois.

## Monitoramento

Evidencias:

- `/health`;
- `/admin/ops/metrics`;
- `/admin/ops/alerts`;
- `/admin/ops/sla/monthly`;
- `/admin/ops/incidents`;
- `/admin/ops/maintenances`;
- backup status e restore drill evidence.

## Relatorio Mensal De Operacao

Anexar mensalmente:

- disponibilidade observada;
- incidentes do periodo;
- manutencoes realizadas;
- acoes corretivas;
- status de backup/offsite;
- relatorio de atendimentos CSV/PDF;
- observacoes de suporte e treinamento.

## Limites

- Prazos de mitigacao dependem de acesso ao ambiente e causa sob controle da contratada.
- Indisponibilidades de Meta/WhatsApp, DNS, nuvem, internet do contratante ou APIs externas devem ser comunicadas e acompanhadas, mas podem depender de terceiros.
- Credenciais e tokens nunca devem ser compartilhados em chamados ou anexos publicos.
