# Demo Tenant Provisioning Checklist

Status: checklist manual. Nao executar como script de escrita sem autorizacao explicita.

Tenant recomendado: `demo-converta`.

## Gate 0 - Autorizacao

- Confirmar objetivo da demonstracao.
- Confirmar quem pode ver o ambiente.
- Confirmar que todos os dados de CRM/conversas sao ficticios.
- Confirmar numero interno/autorizado para eventuais testes reais.
- Confirmar que nao havera campanha, envio em massa ou submissao Meta durante preparacao comum.

## Gate 1 - Tenant

- Criar ou confirmar `Client.clientKey = demo-converta`.
- Confirmar `Client.status = active`.
- Confirmar `profile` coerente com SaaS operacional.
- Confirmar `features`/capabilities necessarias:
  - Inbox;
  - CRM;
  - Templates;
  - Mensagens prontas;
  - Campanhas;
  - Relatorios;
  - Fila;
  - LGPD.

## Gate 2 - Usuarios

- Criar usuario `ADMIN` para configuracao.
- Criar usuario `SUPERVISOR` para demonstracao de gestao.
- Criar usuario `AGENT` para atendimento.
- Usar emails controlados.
- Nao usar senha compartilhada fora do canal seguro.
- Nao expor senha em documento ou log.

## Gate 3 - Departamentos E Fila

Configurar departamentos genericos, por exemplo:

- Atendimento;
- Informacoes;
- Suporte;
- Ouvidoria.

Configurar filas somente se ja fizerem parte do fluxo do tenant. A politica de atribuicao deve permanecer manual ate autorizacao de smoke especifico.

## Gate 4 - TenantOperationalConfig

Confirmar `TenantOperationalConfig.config` com:

- `cannedReplies` ficticias e neutras;
- `queueAssignmentPolicy` documentada, preferencialmente `enabled=false` antes do smoke;
- `metaUsagePolicy` opcional, sem bloqueio ativo salvo decisao explicita;
- demais chaves preservadas.

## Gate 5 - Meta E Canal

Confirmar por canal seguro:

- configuracao Meta do tenant;
- numero WhatsApp autorizado;
- vinculo `WaPhoneNumber`;
- templates aprovados sincronizados;
- webhook funcional;
- nenhuma credencial exposta em logs ou docs.

## Gate 6 - Templates

Preparar modelos aprovados neutros:

- confirmacao de recebimento;
- aviso de andamento;
- retorno de informacao;
- orientacao geral.

Nao submeter modelo novo durante demonstracao inicial. Se for necessario, seguir fluxo interno de revisao.

## Gate 7 - Mensagens Prontas

Criar mensagens prontas curtas, sem dados reais:

- saudacao;
- pedido de informacao complementar;
- encaminhamento para setor;
- encerramento cordial;
- retificacao.

Mensagens prontas nao sao modelos Meta e nao devem ser apresentadas como envio ativo fora da janela.

## Gate 8 - CRM Ficticio

Criar poucos registros ficticios, sem dados pessoais reais:

- nomes demonstrativos;
- cidade generica;
- empresa/organizacao ficticia;
- telefone mascarado quando exibido;
- status CRM configurado.

Nao importar lista real de clientes para demo.

## Gate 9 - Smoke Seguro

Antes da apresentacao:

```bash
cd apps/whatsapp-agent
npm run demo:readiness -- --tenant demo-converta
```

Conferir:

- nenhum `FAIL` impeditivo;
- `WARN` revisados e aceitos;
- nenhum dado pessoal no output;
- nenhum envio executado pelo readiness.

## Gate 10 - Durante A Demo

- Nao enviar campanha.
- Nao clicar em envio final de template sem autorizacao.
- Nao submeter template a Meta.
- Nao alterar credenciais.
- Nao ativar politica de fila sem smoke especifico.
- Nao executar anonimizacao real.
- Nao executar hard delete.

## Rollback Operacional

Como esta checklist nao aplica mudanca automatica, rollback consiste em:

- desfazer manualmente configuracoes demonstrativas autorizadas;
- desativar usuarios de demo, se aplicavel;
- remover dados ficticios, se houver autorizacao;
- manter auditoria de qualquer alteracao manual realizada.
