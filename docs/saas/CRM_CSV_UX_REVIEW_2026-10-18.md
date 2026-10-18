# Revisão CRM/CSV — carregamento, prévia e telefones — 18/10/2026

Status: `DEPLOYED / VERIFIED / DEMO PREVIEW PENDING / IMPORT NOT RUN`.

O resultado vivo e as identidades completas estão no
[registro sanitizado da implantação](releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_DEPLOYED.json).
API e frontend foram promovidos em ordem, o worker foi preservado, o dump PM2 foi
salvo uma vez e nenhuma importação, POST CSV, SQL ou migration ocorreu. O único POST
automático observado pertenceu à Inbox e está classificado separadamente no registro.

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

## Decisão operacional vigente

Build isolado e promoção API → frontend foram concluídos e verificados. O próximo ato
funcional é gerar uma nova prévia manual no tenant Demo, sem confirmar a importação.
Separadamente, deve ser feita avaliação sanitizada das credenciais potencialmente
expostas pela inspeção ampla; os valores e nomes sensíveis permanecem privados.

A natureza multi-tenant permanece preservada: nenhum dado, UUID, token ou resultado de
um tenant foi reutilizado como autoridade para outro.

## Evidência sanitizada do relatório recebido

- SHA-256 do arquivo analisado: `54fce84a1694f01d4471c7c9406632844aae71675aff729da17a258296e1f594`;
- 50 ocorrências na amostra;
- 37 rejeições de formato, todas recuperáveis pela regra de tronco nacional;
- 13 duplicidades, que continuam duplicidades e não são convertidas em erro de formato;
- nenhum telefone completo foi versionado ou publicado.

## Continuidade operacional

O [manifesto](releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18.json) preserva a
origem. O
[handoff](releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18_HANDOFF.md) está
concluído e é arquivo histórico; não deve ser executado novamente. A continuidade
vigente parte do deployment record e de `CURRENT_STATE`, não da sequência histórica.

## Negativa de build e correção — 18/10/2026

A primeira tentativa off-host parou antes do primeiro output com `TS6059`.
O invocador usou um `fileName` relativo à raiz do monorepo contra o
`rootDir: src` da API. Produção, staging, PM2, banco e importação permaneceram
intocados. O handoff agora fixa a base `apps/whatsapp-agent`, o parse absoluto
do tsconfig, os dois mapeamentos de saída e um novo destino exclusivo. A tentativa
parcial foi preservada como evidência e não deve ser usada como candidato.

## Negativa frontend e correção — 18/10/2026

Na segunda tentativa off-host, a API foi composta e autenticada com sucesso. O
frontend parou antes do build porque `node_modules` era um symlink externo à
raiz aceita pelo Turbopack. O handoff agora determina cópia física preservada da
árvore autenticada, inventário byte a byte, proibição de reinstalação e nova raiz
frontend exclusiva. O pacote API aprovado deve ser reutilizado após reconferência,
sem recompilação. Produção e VPS permaneceram intocadas.

## Negativa de metadados e política de modos — 18/10/2026

O build frontend da terceira tentativa concluiu com BUILD_ID
`Ebyc7UWY8nwjFyA5Zjyfj`. A validação independente negou apenas a diferença
`0664` → `0644` introduzida pelo filtro seguro de extração; caminhos e
conteúdos eram idênticos. O handoff agora define árvore de empacotamento separada,
modos canônicos `0755/0644`, tar reprodutível e igualdade integral após
extração. API e frontend não devem ser reconstruídos. VPS e produção continuaram
intocadas.

## Negativa de umask e extração determinística — 18/10/2026

O tar canônico de `-r4` foi preservado. A divergência do diretório `.next`
decorreu da semântica documentada de `tarfile.data_filter`, que deixa o modo de
diretórios a cargo do umask; com `0002`, o resultado foi `0775`. O handoff
agora fixa `umask 0022` no processo single-thread de extração, restaura o valor
anterior em `finally` e mantém o filtro e a igualdade integral. Não haverá novo
build nem novo tar.

## Negativa de ordem de staging — 18/10/2026

Extração independente, manifesto frontend, preflight e transferência passaram.
O staging parou antes do PM2 porque o orquestrador criou `frontend-runtime`
para suportes antes de chamar o helper fail-closed que exige destino inexistente.
A raiz parcial foi preservada. O handoff agora determina raiz VPS nova, extração
primeiro e complementos autenticados depois, sem afrouxar o helper, rebuild ou
nova transferência.

## Rollback da primeira seleção e correção estrutural — 18/10/2026

A API candidata foi selecionada e retornada. O verificador tentou reler os start
ticks do PID original depois da remoção e invalidou as três observações; o evento
`server.started` também permaneceu ausente no trecho consultado. Produção foi
restaurada e permaneceu saudável. A retomada exige snapshot completo antes do
delete, observações exclusivamente candidatas, cursor do log candidato e
relatório sincronizado antes do rollback.

As dificuldades desta janela foram consolidadas em
[`ARTIFACT_RELEASE_ENGINEERING_STANDARD.md`](ARTIFACT_RELEASE_ENGINEERING_STANDARD.md),
protegido pela CI. Após esta janela, uma nova release por artefato dependerá de
executor canônico versionado e fixtures de regressão.

## Gate de log substituído por vínculo de socket — 18/10/2026

Definições e três amostras passaram; a tentativa foi retornada somente porque o
PM2 resolveu stdout diferente do cursor. A nova prova obrigatória vincula
diretamente PID candidato, inode de socket, porta 3001 e health. O evento
`server.started` permanece evidência complementar. A tentativa anterior
continua classificada como rollback. A inspeção ampla que exibiu ambiente está
`RECORDED_PRIVATELY / VALUES NOT VERSIONED / ROTATION ASSESSMENT PENDING`;
futuras leituras usam allowlist fixa.
