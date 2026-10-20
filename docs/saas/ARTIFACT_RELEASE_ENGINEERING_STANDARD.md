# Padrão de engenharia para releases por artefato

> [!WARNING]
> **BREAK_GLASS / NOT DEFAULT.** Este fluxo é excepcional e não é a rota normal de
> releases. Use o [modelo operacional imutável](DEPLOYMENT_OPERATING_MODEL.md) para
> mudanças comuns. Preparações single-use anteriores são evidência histórica e não
> devem ser repetidas como dependência de uma nova release.


Status: `CANONICAL / CI GUARDED`.

Este documento transforma as falhas observadas em 18/10/2026 em requisitos
reutilizáveis. Ele complementa o
[`ARTIFACT_RELEASE_RUNBOOK.md`](ARTIFACT_RELEASE_RUNBOOK.md). O runbook define
a ordem operacional; este padrão define como construtores, empacotadores,
materializadores, verificadores e rollback devem se comportar.

## Regra de adoção

Após a janela CRM/CSV iniciada em 18/10/2026, nenhuma nova promoção por artefato
pode depender de comandos improvisados durante a janela. Antes da próxima release
desse tipo, o executor canônico deve estar versionado, ter testes de regressão e
produzir os estados e relatórios definidos aqui. Uma release já iniciada pode
concluir com executor privado novo, desde que ele passe os mesmos fixtures antes
da seleção e tenha SHA-256 registrado.

## Máquina de estados

A sequência válida é:

1. `SOURCE_PINNED`
2. `BUILT_OFFHOST`
3. `PACKAGED`
4. `STAGED_INERT`
5. `PRE_SELECTION_SNAPSHOT`
6. `API_SELECTED`
7. `API_VERIFIED`
8. `FRONTEND_SELECTED`
9. `RELEASE_VERIFIED`
10. `PM2_SAVED`
11. `DOCUMENTED`

Qualquer negativa produz `DENIED_<STATE>`. Se algum processo já foi selecionado,
o retorno produz `ROLLED_BACK_<COMPONENT>`. Nenhum estado posterior pode ser
inferido, e um estado observado depois do rollback não pode reclassificar o estado
anterior.

## Contrato do builder

- A fonte completa de build e cada overlay devem possuir proveniência autenticada.
- O builder deve registrar Node, npm, arquitetura, glibc, lockfiles e memória.
- API TypeScript: `tsconfig.json` é resolvido com base em
  `apps/whatsapp-agent`; `rootDir`, `outDir` e `fileName` devem pertencer
  à mesma raiz. Nunca suprimir `TS6059`.
- Frontend: `node_modules` deve existir fisicamente dentro da raiz aceita pelo
  Turbopack. Symlink externo, `npm install`, `npm ci` ou resolução de versão
  durante a janela são proibidos.
- Dependências copiadas são comparadas por caminho, tipo, tamanho, SHA-256 e
  destino literal de symlink.
- Build e empacotamento são fases diferentes. Um erro de pacote nunca autoriza
  recompilar automaticamente um build aprovado.

## Contrato do pacote

- Árvore de empacotamento separada da árvore de build.
- Diretórios `0755`; arquivos regulares `0644`; executáveis somente quando
  declarados; symlinks preservados sem dereferência.
- Tar em ordem lexicográfica, `uid/gid=0`, nomes vazios e timestamp fixado pelo
  commit candidato.
- Extração Python sempre com `tarfile.data_filter` e processo single-thread com
  `umask 0022`, restaurado em `finally`.
- O filtro seguro não preserva modo de diretório; o umask explícito é parte do
  contrato, não uma adaptação posterior.
- A extração independente deve coincidir integralmente com o índice. Não aplicar
  `chmod` para transformar uma negativa em PASS.
- Um pacote aprovado é reutilizado por hash; não é reconstruído sem mudança de
  fonte ou defeito comprovado em seus bytes.

## Contrato do staging

- Cada tentativa usa raiz exclusiva; tentativas negativas são preservadas.
- A raiz começa somente com `incoming`.
- Helpers de extração recebem destinos inexistentes e continuam fail-closed.
- Payload é extraído e validado antes de suportes, `public`, dependências ou
  vínculos de dados.
- Complementos exigem destino ausente e origem autenticada; nunca sobrescrever.
- Propriedade e modos são aplicados e verificados apenas na composição inerte.
- Nenhum preflight de memória deve confundir `MemAvailable` com espaço em disco.

## PRE_SELECTION_SNAPSHOT

Antes de qualquer `pm2 delete`, persistir atomicamente e sincronizar em disco:

- horário monotônico e UTC;
- nome/ID PM2 original;
- PID original e start ticks já lidos;
- cwd, executável, `pm_exec_path`, SHA-256 do entrypoint;
- status e contadores de restart;
- identidades de frontend e worker que devem permanecer estáveis;
- hash do dump vigente e do retorno;
- para cada arquivo de log autorizado: caminho, device, inode e offset;
- definição candidata e definição de retorno por SHA-256.

Depois de persistido, o snapshot original é dado imutável. O verificador do
candidato é proibido de reler `/proc/<pid-original>`: o PID original pode e
normalmente deve desaparecer durante a substituição.

## Verificador do candidato

Cada predicado deve produzir registro próprio com `PASS`, `FAIL` ou
`ERROR`, horário e evidência sanitizada. Uma exceção em um predicado não pode
apagar os demais.

As três amostras observam exclusivamente o PID candidato:

- mesmo PID e start ticks nas três amostras;
- PM2 online;
- cwd, executável e `pm_exec_path` esperados;
- SHA-256 do entrypoint esperado;
- restart e unstable restart dentro do contrato;
- health local e, quando previsto, público.

O verificador deve persistir cada amostra antes da próxima. A decisão agregada só
ocorre depois que todas estiverem gravadas.

### Encadeamento state-bound API → frontend

Verificadores state-bound são gerados para o estado imediatamente anterior à
etapa que validam. Em uma release coordenada API → frontend, o snapshot frontend
nasce somente depois que o verificador API persistiu `API_VERIFIED`; ele deve
esperar a identidade autenticada da API candidata, sem enfraquecer o predicado de
PID. Um snapshot de S0 não pode validar o frontend em S2.

Controle, nonce, journal, snapshot e relatório privados são single-use. Journal
criado sem marker consome o controle de primeira execução e exige controle/nonce
novos; nunca apagar o journal para reutilizar o controle. A ativação permanente
cria marker somente depois de journal, identidade e health aprovados. `pm2 save`
ocorre depois de `supervised-candidate`, nunca antes.

O checker frontend recebe um binding explícito conforme
`FRONTEND_CHECKER_BINDING_V1.schema.json`; não contém raiz operacional embutida.
O binding é privado e autenticado por SHA-256, arquivo regular `0600`, aberto com
`O_NOFOLLOW` e metadados estáveis. Ele admite somente caminhos absolutos para
`candidateRoot`, `returnRoot`, `launcher`, `target` e `pm2Pid`, sem comandos,
argumentos, ambiente ou credenciais. Cada raiz candidata e seu binding são
single-use; ausência, campo extra, symlink, hash divergente ou raiz consumida
negam a execução.

Antes de uma janela produtiva, uma única fixture deve comprovar a sequência
completa S0 → S1 → S2 → S3 e a negativa S0 → S1 → S2_DENIED → R. Testes
isolados dos componentes não satisfazem esse gate.

### Closure executável integral

Todo arquivo executável ou lido pela sequência produtiva DEVE constar do manifesto de closure com caminho e SHA-256 esperado. Destinos produzidos durante a janela DEVEM constar com produtor e estado inicial ausente, sem SHA inventado. O CI DEVE negar checker, executor, definição, plano, política, launcher, helper ou cliente importado ausente do inventário.

## Prova de escuta e evidência `server.started`

O gate de disponibilidade combina identidade candidata, propriedade direta do
socket e health:

1. obter os inodes `socket:[N]` em `/proc/<pid-candidato>/fd`;
2. localizar em `/proc/<pid-candidato>/net/tcp` e `tcp6` um inode do mesmo
   conjunto em estado `LISTEN` na porta esperada;
3. repetir a propriedade do socket nas três amostras;
4. exigir health local e, quando previsto, público.

Esse vínculo é o predicado nominal
`candidate_owns_listening_socket`. Ele prova que o processo autenticado possui
a porta, sem depender da nomenclatura de logs do PM2.

O evento JSON `server.started` continua sendo coletado como evidência
complementar. Antes da seleção, capturar cursores dos caminhos de stdout
autorizados conhecidos. Depois, registrar o caminho efetivamente resolvido,
bytes novos, rotação, truncamento e presença ou ausência do evento. Divergência
de caminho ou ausência do evento não causa rollback quando
`candidate_owns_listening_socket`, identidade e health passam; continua
`WARN` explícito para correção de observabilidade.

Nunca listar ambiente para descobrir logs. Campos PM2 são lidos por allowlist
fixa; filtros amplos por nomes ou substrings como `LOG` são proibidos.

## Decisão e rollback

- Primeiro persistir e sincronizar o relatório completo; depois decidir.
- Rollback só começa por predicado nominal negativo já gravado.
- Antes do retorno, gravar última identidade candidata observada.
- O retorno remove somente o componente selecionado e usa definição previamente
  autenticada.
- A inspeção pós-retorno prova apenas a restauração; nunca é usada para alegar
  que o candidato caiu antes.
- Sem `pm2 save` em tentativa negativa.

## Fixtures obrigatórios do executor canônico

1. PID original desaparece após snapshot; candidato continua verificável.
2. Um predicado lança exceção; os demais e as três amostras são persistidos.
3. O PID candidato possui diretamente o socket da porta esperada nas três amostras.
4. `server.started` aparece depois do cursor e é registrado como evidência complementar.
5. Evento ausente, caminho divergente, log rotacionado ou truncado gera `WARN` nominal sem apagar amostras.
6. Relatório existe e está sincronizado antes da chamada de rollback.
7. Runtime de staging preexistente é negado sem sobreposição.
8. `data_filter` sob umask inicial `0002` produz `0755/0644` porque o
   executor fixa temporariamente `0022`.
9. `node_modules` externo é negado antes do Next build.
10. API TypeScript usa raiz correta e não produz `TS6059`.
11. Release API → frontend usa snapshot frontend posterior ao PASS autenticado da
    API, com PIDs distintos em S0, S1 e S2.
12. Journal candidato precede marker, supervisão precede save e um controle com
    journal sem marker é recusado para nova primeira execução.
13. Uma negativa frontend retorna atomicamente ao frontend supervisionado e à API
    original, preservando worker, health e dump seguro.
14. A fixture combinada termina em `END_TO_END_COMBINED_RELEASE_FIXTURE_PASS`;
    fixtures isoladas não autorizam janela.

Quando o launcher permanente exigir `runtime.private.json`,
`daemon.private.json` e readiness, a closure inclui o produtor executável que a
FASE 1 comprovou. `runtime` e `daemon` são capturados após o PASS da API e antes
da seleção frontend; `ready-candidate` produz a readiness depois do PASS
frontend. Todos são single-use, modo `0600`, vinculados ao mesmo executionId e
persistidos antes de `enable-supervision-candidate`. Declarar somente os
consumidores ou antecipar esses bytes durante a preparação nega a janela.

## Registro das dificuldades de 18/10/2026

| Falha | Causa | Regra permanente |
| --- | --- | --- |
| `TS6059` | `fileName` fora do `rootDir` efetivo | Resolver tsconfig e fontes na raiz da API |
| Turbopack negou dependências | symlink externo | Dependências físicas e inventariadas na raiz |
| `0664` virou `0644` | política segura do tar | Normalizar antes do tar |
| diretório virou `0775` | `data_filter` + umask `0002` | Extração single-thread com umask `0022` |
| `FileExistsError` | suporte criado antes do payload | Extrair em destino inexistente antes dos complementos |
| amostras falharam | releitura do PID original removido | Snapshot completo antes do delete; candidato não consulta PID original |
| marcador não localizado | caminho de log PM2 pode variar ou receber sufixo de PID | Socket pertencente ao candidato é gate; log é evidência complementar |

## Proibições permanentes

Não expor tokens, cookies, tenants ou UUIDs; nunca inspecionar ambiente PM2 por filtro amplo; usar somente allowlist fixa e saída redigida; não fabricar evidência; não adaptar
gates depois do efeito; não executar POST, replay, SQL ou migration fora do
manifesto; não usar estado pós-rollback para reconstruir retrospectivamente a
tentativa.
