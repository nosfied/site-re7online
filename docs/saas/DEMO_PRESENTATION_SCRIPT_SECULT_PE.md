# Demo Presentation Script - SECULT-PE

Status: roteiro tematico. Usar tenant `demo-converta` com dados ficticios.

Este roteiro apoia uma demonstracao para o contexto SECULT-PE, mas nao deve usar dados reais da SECULT-PE, cidadaos, fornecedores, proponentes ou servidores.

## Premissas

- Tenant operacional da demo: `demo-converta`.
- Dados: ficticios, neutros e sanitizados.
- Envio real: desabilitado durante apresentacao, salvo autorizacao separada.
- Campanha: demonstrar como rascunho/previsao, sem envio.
- Templates: abrir preview, sem submissao Meta.
- Fila balanceada: explicar configuracao e mostrar tela; nao ativar em producao sem smoke.

## Abertura

Mensagem sugerida:

> Vamos demonstrar o Converta em um tenant de demonstracao, com dados ficticios. O objetivo e validar os fluxos de atendimento, CRM, modelos aprovados, mensagens prontas, campanhas controladas, LGPD e governanca operacional.

## Fluxo Recomendado

1. Abrir `/app/inbox`.
2. Mostrar listagem de conversas e filtros.
3. Mostrar badges de atribuicao quando houver conversa atribuida.
4. Abrir uma conversa ficticia.
5. Explicar janela de atendimento.
6. Abrir "Enviar modelo aprovado" sem confirmar envio.
7. Abrir "Mensagens prontas" e inserir no campo sem enviar.
8. Abrir `/app/crm`.
9. Mostrar contato ficticio, status CRM e bloqueio de envio ativo.
10. Abrir `/app/templates`.
11. Mostrar diferenca entre modelos Meta e mensagens prontas.
12. Abrir `/app/campaigns`.
13. Mostrar previa de audiencia, custo estimado e rascunho.
14. Abrir `/app/settings/queue`.
15. Mostrar modos Manual, Rodizio e Menor carga sem salvar alteracao.
16. Explicar LGPD e anonimizacao como remocao da operacao visivel.

## Respostas Curtas

### Fila equilibrada

O Converta ja possui base de configuracao por tenant para fila manual, rodizio e menor carga. O padrao permanece manual, e qualquer ativacao deve ser feita com smoke controlado.

### Nome social ou nome de atendimento

O CRM operacional permite ajustar nome de exibicao do contato. Dados anonimizados nao sao restaurados.

### Mensagem fora da janela

Mensagem livre fica bloqueada fora da janela. Para envio ativo, usa-se modelo aprovado Meta, com acao explicita.

### Mensagem pronta

Mensagem pronta e texto operacional reutilizavel dentro da janela de atendimento. Nao e template Meta.

### Custos Meta

O Converta mostra estimativas operacionais. O valor final depende das regras e conciliacao da Meta.

### Relatorios

Ha base de relatorios operacionais e uso Meta mensal estimativo. Indicadores especificos devem ser refinados conforme contrato.

## O Que Nao Prometer

- Distribuicao perfeita sem configuracao.
- Controle de ponto.
- Edicao retroativa de mensagem entregue.
- Envio gratuito.
- Custo garantido.
- Recuperacao de dados anonimizados.
- Envio ativo sem modelo aprovado quando exigido.

## Encerramento

Proximos passos:

1. Validar canais oficiais.
2. Validar usuarios e perfis.
3. Definir departamentos.
4. Definir modelos aprovados necessarios.
5. Definir mensagens prontas iniciais.
6. Definir indicadores de relatorio.
7. Planejar treinamento por perfil.
