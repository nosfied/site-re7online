# Patch canonico 88I.6B.8B - demo-converta

Este documento descreve o patch de configuracao previsto para espelhar o ciclo de atendimento SECULT no tenant `demo-converta`.

Nao executar automaticamente em producao. A aplicacao deve ser feita somente em janela controlada, com diff previo do `TenantOperationalConfig` e do `ChatbotFlow` alvo.

## Escopo

- Consentimento guiado antes do menu operacional.
- Menus 4, 5 e 7 preservados.
- Opcao "Falar com atendente" visivel somente quando o setor de destino estiver aberto.
- Handoff fora do horario enfileirado para o proximo horario disponivel.
- Comando global de encerramento `#ENCERRAR#` configurado no tenant.
- Pesquisa CSAT automatica somente apos atendimento humano encerrado.
- Expiracao da pesquisa em 15 minutos.
- Pergunta de novo atendimento apos expiracao da pesquisa.
- Atribuicao da pesquisa ao ultimo atendente responsavel.

## Patch de TenantOperationalConfig.config

```json
{
  "chatbotCloseCommand": {
    "command": "#ENCERRAR#",
    "closedMessage": "Atendimento encerrado. Obrigado pelo contato."
  },
  "satisfactionPolicy": {
    "enabled": true,
    "trigger": "HUMAN_CONVERSATION_CLOSED",
    "expiresAfterMinutes": 15,
    "questionText": "Pesquisa de Satisfacao do Protocolo #{protocol}.\n\nComo voce avalia este atendimento?\n5 - Muito satisfeito\n4 - Satisfeito\n3 - Neutro\n2 - Insatisfeito\n1 - Muito insatisfeito\n\nObs.: Voce tem 15 minutos para responder a pesquisa."
  }
}
```

## Patch de ChatbotFlow.definition

O flow deve continuar usando a representacao canonica existente. Nao criar schema paralelo de builder.

### Global commands

```json
{
  "globalCommands": [
    {
      "command": "#",
      "action": "BACK"
    },
    {
      "command": "#ENCERRAR#",
      "action": "CLOSE_CONVERSATION"
    }
  ]
}
```

### Opcao manual condicionada por horario

Adicionar a opcao de atendimento humano apenas no menu em que ela faz sentido operacionalmente:

```json
{
  "label": "Falar com atendente",
  "next": "handoff_manual",
  "departmentId": "<departmentId_do_setor>",
  "queueId": "<queueId_da_fila>",
  "visibilityCondition": {
    "departmentAvailability": "OPEN"
  }
}
```

Quando o setor estiver fechado, a opcao nao deve ser renderizada nem aceita por numero.

## Itens explicitamente pendentes

- Fundarpe permanece como pendencia operacional/configuracao posterior.
- Politica de midia nao faz parte deste patch.
- Ativacao de canal Web Session real nao faz parte deste patch.
- Aplicacao no tenant `secult-pe` nao faz parte deste patch.

## Checklist antes de aplicar

- Confirmar tenant alvo `demo-converta`.
- Confirmar flow alvo em DRAFT.
- Confirmar departamentos e filas no mesmo tenant.
- Confirmar que nenhuma referencia de departamento/fila pertence a outro tenant.
- Confirmar que o tenant nao esta em go-live.
- Confirmar que nao ha campanha, envio real ou pairing em andamento.
