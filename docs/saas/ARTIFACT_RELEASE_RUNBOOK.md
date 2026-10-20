# Runbook de release por artefato

> [!WARNING]
> **BREAK_GLASS / NOT DEFAULT.** Este fluxo é excepcional e não é a rota normal de
> releases. Use o [modelo operacional Deploy V2](DEPLOYMENT_OPERATING_MODEL.md) para
> mudanças comuns. Preparações single-use anteriores são evidência histórica e não
> devem ser repetidas como dependência de uma nova release.

Este documento versiona o processo comprovado na promoção CRM/CSV de 17/10/2026.
Ele complementa o deploy Git fast-forward existente; não autoriza uma janela e não
é um script executável. Os requisitos técnicos obrigatórios estão no
[`ARTIFACT_RELEASE_ENGINEERING_STANDARD.md`](ARTIFACT_RELEASE_ENGINEERING_STANDARD.md).

## Quando usar

Use este fluxo quando a produção ativa for uma composição autenticada que não
corresponde integralmente a um único checkout Git. Para um deploy normal de checkout,
o classificador e `deploy-vps.sh` continuam válidos. Não misture os dois mecanismos
na mesma janela.

## Invariantes

- produção saudável é o ponto de partida e deve permanecer recuperável;
- cada artefato, controle e retorno é imutável e identificado por SHA-256/BUILD_ID;
- API é selecionada e validada antes do frontend;
- worker, banco, RBAC, tenants e credenciais ficam fora do delta, salvo release novo
  que os declare explicitamente;
- falha ou dado ausente nega o próximo efeito; não adaptar evidência para obter PASS;
- `pm2 save` ocorre uma única vez, somente após todos os gates finais;
- POST, replay de importação, SQL e migration são proibidos quando o manifesto assim
  declarar;
- histórico não correlacionado não pode ser usado como prova viva.

## Sequência

1. Fixar manifesto de fonte, blobs autorizados, exclusões e ordem de implantação.
2. Capturar saúde, identidades ativas e retorno compatível sem mutação.
3. Construir fora da VPS quando a memória disponível não atender ao gate; autenticar
   Node, arquitetura, glibc, lockfiles, pacotes e manifests antes da transferência.
4. Extrair somente em raiz candidata nova; conferir pacote, índice integral,
   entrypoints, dependências, links e controles sem iniciar processo.
5. Preparar definições candidatas e de retorno. No frontend, o controle deve fixar
   release, BUILD_ID, entrypoint e nonce; mudar apenas `cwd`/controle/run necessários.
6. Selecionar somente a API por substituição direcionada do registro PM2. Não confiar
   em `start --update-env` para trocar `cwd` ou entrypoint de processo já registrado.
7. Persistir cada predicado antes da decisão: PM2 online, PID e start ticks, `cwd`,
   `pm_exec_path`, `/proc/<pid>/cwd`, `/proc/<pid>/exe`, SHA do entrypoint, contadores
   de restart, propriedade direta do socket de escuta (`candidate_owns_listening_socket`) e health. Repetir três amostras
   da mesma identidade. `server.started` é evidência complementar, não substitui o
   vínculo PID→socket→porta→health. O caminho JavaScript
   literal em `/proc/<pid>/cmdline` não é gate válido sob PM2.
8. Em release API → frontend, persistir o PASS autenticado da API e somente então
   criar o snapshot frontend. O snapshot deve esperar a identidade candidata da
   API e conservar frontend/worker observados nesse instante. Materializar controle,
   nonce e destinos frontend novos; todos são single-use. Materializar também o
   binding privado do checker conforme `FRONTEND_CHECKER_BINDING_V1.schema.json`,
   com modo `0600`, caminhos absolutos e SHA-256 fixado antes da seleção. Invocar
   o checker somente com `--binding` e `--binding-sha256`; não reutilizar binding
   ou raiz candidata que já possua marker.
9. Executar somente GETs autorizados de isolamento negativo. Não fabricar operação
   positiva, não repetir POST e não expor tenant, token ou UUID em logs públicos.
10. Selecionar o frontend pelo controle candidato; conferir BUILD_ID, launcher, assets,
   login, Inbox e CRM autenticados. Reentrada deve permanecer GET-only e sem POST
   automático.
11. Validar o journal real, ativar o binding permanente e exigir
    `supervised-candidate`. Um journal sem marker consome o controle e nega replay.
    O produtor reutilizado da FASE 1 deve executar `capture` depois do PASS da API
    e antes da seleção frontend. Ele persiste, em destinos exclusivos modo `0600`,
    os schemas canônicos `runtime.private.json` e `daemon.private.json`. Depois do
    PASS frontend, `ready-candidate` produz a readiness; `seal-readiness` a vincula
    ao mesmo executionId, identidades e controle antes de
    `enable-supervision-candidate`. A ausência desses arquivos antes da execução é
    esperada; a ausência do produtor executável é DENY antes da janela.
12. Revalidar API, frontend e worker; salvar PM2 exatamente uma vez; registrar hashes
    do dump vigente e do retorno preservado.
13. Publicar o registro sanitizado e atualizar `CURRENT_STATE` sem transformar PIDs
    observados em identidade durável.

## Regra de rollback

Rollback só inicia após um predicado nominal registrar `FAIL`. O relatório preserva
o PID, start ticks, `cwd`, executável e horário observados antes de qualquer remoção;
estado observado depois do retorno nunca pode ser usado para inferir queda anterior.

- Falha antes da seleção PM2: nenhum retorno é necessário.
- Falha da API: retornar somente a API e revalidar API original, frontend e worker.
- Falha do frontend após API aprovada: retornar frontend e API pelas definições
  compatíveis revisadas, preservando o worker.
- Em falha, não executar `pm2 save`, POST, SQL, migration ou nova tentativa implícita.
- Nova tentativa exige causa individualizada, correção revisada e nova raiz candidata.

## Evidência mínima

O registro sanitizado deve conter hashes dos pacotes/manifests/entrypoints, BUILD_ID,
hashes PM2 vigente e de retorno, contagem de amostras, resultado dos gates, zero das
mutações proibidas e disposição explícita das validações adiadas. Tokens, cookies,
tenant IDs e UUIDs não entram no Git.

O registro da promoção CRM/CSV está em
[`releases/CRM_CSV_RECOVERY_2026-10-17_DEPLOYED.json`](releases/CRM_CSV_RECOVERY_2026-10-17_DEPLOYED.json)
e é validado pela CI.

## Regra para futuras releases

A janela excepcional CRM/CSV de 18/10/2026 pode terminar com verificador privado
corrigido e autenticado. Depois dela, nenhuma nova release por artefato pode ser
promovida por executor improvisado. O executor canônico deverá estar versionado,
testado pelos fixtures do padrão de engenharia e aprovado na CI.

Em toda seleção, `PRE_SELECTION_SNAPSHOT` é persistido antes do
`pm2 delete`. O verificador candidato nunca relê o PID original removido. A
prova principal usa o socket de escuta pertencente ao PID candidato e health; o
`server.started` permanece evidência complementar. O relatório completo é
sincronizado antes de qualquer rollback. Consultas PM2 usam allowlist fixa e
nunca despejam ambiente por filtro amplo.

Uma janela coordenada API → frontend exige previamente uma única fixture integral
com `END_TO_END_COMBINED_RELEASE_FIXTURE_PASS`, cobrindo promoção, supervisão,
save simulado e rollback completo. O snapshot frontend é state-bound ao S1 e não
pode ser reutilizado de S0. Destinos privados, controles e nonces são single-use.

## Gate de closure executável

Antes de abrir a janela, execute `python3 -B -I -S scripts/ci/verify-execution-dependency-closure.py`. Qualquer executável, arquivo lido ou destino single-use ausente do manifesto nega a janela.
