# Relatorios

## Visao Geral

O modulo de relatorios do Converta consolida dados operacionais do atendimento para acompanhamento gerencial, auditoria, fiscalizacao e melhoria de processos.

## Indicadores Disponiveis

- total de conversas;
- conversas por periodo;
- conversas por canal;
- conversas por setor;
- primeira resposta media;
- resolucao media;
- atendimentos fora do SLA;
- historico de conversas;
- dados de CRM e leads;
- indicadores de campanhas/templates quando aplicavel.

## Filtros

Relatorios podem considerar:

- periodo;
- canal;
- setor;
- duplicidade de contatos;
- status;
- tenant;
- perfil de atendimento.

## Busca E Auditoria

O produto possui filtros operacionais e consultas por modulo. A busca avancada unificada esta desenhada em `docs/saas/ADVANCED_SEARCH_DESIGN.md` e ja possui fundacao tecnica com `SearchIndex`, flags de rollout e tela diagnostica `/app/search`, com recomendacao de indice tenant-scoped em PostgreSQL, filtros por canal, periodo, setor, atendente e fonte de dado.

Essa busca unificada ainda nao deve ser apresentada como funcionalidade operacional entregue antes da sprint de indexacao/runtime correspondente.

## Exportacao

O Converta possui recursos de exportacao e geracao de evidencias operacionais, incluindo CSV/PDF conforme modulo e permissao.

## Uso Em Contratos Publicos

Relatorios podem apoiar:

- fiscalizacao contratual;
- prestacao de contas;
- acompanhamento de demanda por secretaria/setor;
- medicao de qualidade operacional;
- auditoria de atendimento;
- planejamento de capacidade.

## Premissas

- A qualidade dos relatorios depende da retencao configurada.
- Retencao curta pode reduzir historico visivel.
- Relatorios de alto volume exigem dimensionamento de banco e indices.
- Indicadores especificos do edital devem ser validados em matriz de aderencia.
