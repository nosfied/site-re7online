# Revisão CRM/CSV — carregamento, prévia e telefones — 18/10/2026

Status: `CI VERIFIED / NOT DEPLOYED / IMPORT NOT RUN`.

## Escopo auditado

A revisão partiu da tentativa de repetir no tenant Demo Converta o mesmo arquivo já
usado no tenant Syer. Nenhum POST de importação, SQL, migration, PM2, build de release
ou alteração produtiva foi executado.

## Causas confirmadas

1. A lista de contatos preservava a página anterior durante filtros e paginação, mas
   não mostrava um indicador visual explícito enquanto aguardava a API.
2. A API devolvia amostra de até 200 linhas elegíveis e até 50 ocorrências de erro; a
   interface reduzia cada tabela a oito linhas e oferecia somente rolagem horizontal.
3. A segunda faixa de mapeamento tentava acomodar quatro seletores no modal, sem
   proteção suficiente contra compressão e sobreposição.
4. A classificação `invalid_phone` valida estrutura brasileira, DDD e quantidade de
   dígitos. Ela não consulta o WhatsApp e não prova que um número esteja ou não
   cadastrado no provedor.
5. O relatório recebido depois da primeira revisão contém 50 ocorrências: 37
   `INVALID_PHONE` e 13 `DUPLICATE`. As 37 rejeições usam exclusivamente o formato
   nacional `0 + DDD + número`; após retirar somente o zero de tronco, todas passam
   pela validação brasileira já existente, sem colisões entre si.

## Correções no candidato

- indicador acessível e visível durante carregamento inicial, filtros e paginação;
- tabela anterior atenuada e marcada como ocupada durante a troca de página;
- todas as linhas retornadas pela API são renderizadas em áreas com rolagem vertical
  e cabeçalho fixo;
- contagem explícita das ocorrências exibidas;
- aviso honesto quando a API truncar a amostra: o CSV baixado contém apenas as
  ocorrências recebidas, não o arquivo inteiro;
- mapeamento secundário reorganizado em duas colunas, com largura mínima segura;
- linguagem alterada para “telefone brasileiro inválido ou incompleto” e explicação
  de que não existe consulta de registro no WhatsApp;
- normalizador central existente ampliado somente para `0 + DDD + número`, mantendo
  DDD, comprimentos, regras de assinante e aliases já aprovados;
- prefixos de operadora, zeros malformados e número estrangeiro permanecem rejeitados;
- contrato automatizado específico incluído no job crítico da CI;
- a ativação experimental do arquivo histórico completo revelou três asserções antigas
  obsoletas e antes não executadas; elas ficaram registradas como dívida fora deste
  escopo, enquanto o contrato novo é executado nominalmente;
- manifesto histórico passou a ser validado no commit fixado pelo próprio manifesto,
  evitando reescrever a prova do release implantado quando o código futuro evolui.

## Decisão operacional

Não confirmar a importação no Demo antes de:

1. concluir CI do candidato com a normalização específica;
2. criar um novo manifesto de candidato, buildar fora da VPS e promover com rollback
   fixado;
3. gerar nova prévia no tenant Demo e obter confirmação humana antes do único POST.

A natureza multi-tenant permanece preservada: nenhum dado, UUID, token ou resultado de
um tenant foi reutilizado como autoridade para outro.

## Evidência sanitizada do relatório recebido

- SHA-256 do arquivo analisado: `54fce84a1694f01d4471c7c9406632844aae71675aff729da17a258296e1f594`;
- 50 ocorrências na amostra;
- 37 rejeições de formato, todas recuperáveis pela regra de tronco nacional;
- 13 duplicidades, que continuam duplicidades e não são convertidas em erro de formato;
- nenhum telefone completo foi versionado ou publicado.
