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
5. O CSV anexado pelo usuário não ficou disponível no ambiente de auditoria. Por isso,
   nenhuma regra de normalização foi ampliada por suposição.

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
- contrato automatizado específico incluído no job crítico da CI;
- a ativação experimental do arquivo histórico completo revelou três asserções antigas
  obsoletas e antes não executadas; elas ficaram registradas como dívida fora deste
  escopo, enquanto o contrato novo é executado nominalmente;
- manifesto histórico passou a ser validado no commit fixado pelo próprio manifesto,
  evitando reescrever a prova do release implantado quando o código futuro evolui.

## Decisão operacional

Não confirmar a importação no Demo antes de:

1. receber novamente o CSV de erros;
2. classificar os formatos rejeitados sem expor números no repositório ou no chat;
3. implementar somente normalizações inequívocas, com testes de aceitação e rejeição;
4. criar um novo manifesto de candidato, buildar fora da VPS e promover com rollback
   fixado;
5. gerar nova prévia no tenant Demo e obter confirmação humana antes do único POST.

A natureza multi-tenant permanece preservada: nenhum dado, UUID, token ou resultado de
um tenant foi reutilizado como autoridade para outro.
