# Modelo operacional de implantação do Converta

**Status: CANÔNICO / DEPLOY V2 / PRODUÇÃO VIVA**

Este documento define a rota normal de entrega. O objetivo é manter segurança,
multitenancy e retorno verificável sem transformar cada release em um novo sistema
de implantação.

## Princípios invariáveis

- produção viva: nenhuma mudança pode depender de indisponibilidade não programada;
- multitenancy: autorização, dados, evidências e testes permanecem tenant-scoped;
- auditoria antes de criação: reutilizar componentes, artefatos e contratos válidos;
- release imutável e retorno capturado antes da seleção;
- documentação e evidência sanitizadas, sem segredos ou identificadores sensíveis;
- efeitos externos explícitos: POST, importação, retry, SQL, migration e rotação de
  credencial nunca são inferidos;
- nenhum gate novo é criado durante a janela. Falha de preparação encerra a janela.

## Faixa 1 — NORMAL_RELEASE (padrão)

Aplicável quando a mudança não altera schema, credenciais, rede/root, ownership do
worker ou protocolo de drenagem. A correção da listagem de contatos pertence a esta
faixa.

1. CI produz ou autentica artefatos imutáveis e um manifesto somente de dados.
2. Preflight somente leitura confirma saúde, espaço, identidades e retorno.
3. Staging inerte confere hashes e extração sem selecionar processos.
4. Um executor estável lê o manifesto; ele não contém PID, dump, timestamp ou caminho
   single-use fixado no código.
5. O adaptador built-in captura o estado vivo uma vez, cria o retorno e promove API → frontend; o binding não transporta comandos.
6. Health, identidade, isolamento tenant-scoped e smoke tests validam a release.
7. `pm2 save` ocorre uma única vez depois do aceite integral.
8. Qualquer negativa usa o snapshot capturado e retorna os componentes já alterados.

PIDs, start ticks, dump vigente, caminhos de relatório e timestamps são dados de
execução. Eles nunca fazem parte do código do verificador ou do manifesto da release.

## Faixa 2 — BREAK_GLASS (excepcional)

Aplicável somente a schema/migration, rotação de credencial, mudança root/rede,
ownership ou drain do worker, contenção de incidente ou composição produtiva que não
possa ser representada pelo Deploy V2 normal.

Exige janela própria, autorização explícita e o runbook por artefato. Um incidente
não pode promover seu mecanismo excepcional a padrão de todas as releases futuras.

## Classificador

| Pergunta | Sim | Não |
| --- | --- | --- |
| Há migration ou alteração de schema? | BREAK_GLASS | continuar |
| Há rotação de segredo, root, rede ou proxy? | BREAK_GLASS | continuar |
| Worker, ownership ou drain mudam? | BREAK_GLASS | continuar |
| Há incidente ativo ou composição não representável? | BREAK_GLASS | NORMAL_RELEASE |

## Estado da correção de contatos

- classe: `NORMAL_RELEASE`;
- ordem: API → frontend;
- banco/schema/worker/credenciais: fora do delta;
- artefatos: já construídos, autenticados e staged inertemente;
- promoção: não executada;
- próxima etapa: implementar e ensaiar o executor estável do Deploy V2, então abrir
  uma única janela com o manifesto versionado.


## Implementação do Deploy V2

O núcleo estável está versionado em `scripts/deploy-v2.py`. Ele valida o manifesto,
consome uma autorização com prazo, vincula SHA-256 de manifesto/executor/adaptador,
persiste journal antes dos efeitos, bloqueia replay e executa rollback conservador.

O [contrato do adaptador](DEPLOY_V2_ADAPTER_CONTRACT.md) define as ações ambientais.
O adaptador built-in implementa operações fixas; bindings schema v2 contêm apenas
identidades e dados estáticos da release. `actions`, `argv`, comandos executáveis e
destinos single-use no binding são negados. Captura, destinos, retorno e definições de
rollback são derivados somente na raiz exclusiva da execução.

As negativas e o rollback foram ensaiados com superfícies falsas separadas de PM2,
`/proc`, socket, HTTP, helper de supervisão e dump. O aceite tenant-scoped permanece
um registro privado separado, GET-only ou checkpoint humano autenticado, sem token,
cookie, UUID ou tenant no binding. O candidato continua `STAGED_INERT / NOT DEPLOYED`;
nenhuma janela foi aberta por esta implementação.
