# Demo Converta WhatsApp Media Policy - 88I.6B.8C

Este documento prepara alternativas de politica de midias para o tenant `demo-converta`.
Nenhuma configuracao foi aplicada nesta sprint.

## Campo

`TenantOperationalConfig.config.whatsappMediaPolicy`

## Alternativa A - Legacy parity

Uso recomendado quando a demonstracao deve refletir uma operacao que aceita apenas imagens e documentos.

```json
{
  "whatsappMediaPolicy": {
    "inbound": {
      "image": true,
      "audio": false,
      "video": false,
      "document": true
    },
    "outbound": {
      "image": true,
      "audio": false,
      "video": false,
      "document": true
    }
  }
}
```

## Alternativa B - Converta capability

Uso recomendado quando a demonstracao deve validar toda a capacidade atual do Converta.

```json
{
  "whatsappMediaPolicy": {
    "inbound": {
      "image": true,
      "audio": true,
      "video": true,
      "document": true
    },
    "outbound": {
      "image": true,
      "audio": true,
      "video": true,
      "document": true
    }
  }
}
```

## Recomendacao

Para homologacao ampla de plataforma, usar a Alternativa B. Para uma simulacao que precise reproduzir uma politica operacional restrita, usar a Alternativa A.

Antes de aplicar em producao, confirmar com o responsavel operacional do tenant qual politica deve reger recebimento e envio.
