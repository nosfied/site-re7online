# R2 dirigido — execução consumida, DENY preservado e reconciliação local

**DIRECTED_CONSUMED_DENY / RAW_COPY_PRESERVED / CUSTODY_DENY /
CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.** Não repetir a coleta,
exportação ou reutilizar destinos. Não corrigir o reader/constantes em campo.

## Resultado e custódia

Roteiro autorizado:de1b8c1fa9a875f43e08a5d001cddf7e78adcc98,
[COMMANDS.md imutável](../crm-csv-r2-directed-20261017/COMMANDS.md).
Branch/HEAD/remoto, manifest e bytes foram conferidos; origem privada validada,
destino local ausente/pai owner700. Os5 blocos publicados foram executados sem
alteração. Diretório inativo e SCP únicos exit0; coleta única como deploy SEM sudo
exit1; somente o exportador privado previsto foi executado depois do DENY.
Nenhum novo comando de descoberta foi improvisado ou repetido.

| Marco | UTC17/10/2026 | Fortaleza16/10 |
|---|---|---|
| Início da coleta |02:23:36.612172 |23:23:36.612172 |
| Fim da coleta |02:23:37.965727 |23:23:37.965727 |
| Recibo de custódia DENY |02:23:49.454800 |23:23:49.454800 |

O subprocesso directed-proc retornou **DIRECTED_INVENTORY_DENY**, exit1,
stdout24.993B/stderr0. O coletor encerrou DIRECTED_READS_DENY. São **11 rótulos
preservados de14 previstos**,2 erros e rechecagem interval-checks não executada.
O reader aprovado percorreu seus alvos fixos restantes para registrar diagnóstico;
não houve nova tentativa, escolha de PID alternativo ou comando externo pós-DENY.

O transporte privado teve exit0:stdout46.880B/stderr0, frame/source/len/hash
conferidos e cópia byte-exata preservada off-host:
**34.809B**, SHA256
`90f004529af19c269c9ffa38df3a09b3c2565bc103967bc22705324f05b7fef8`.
Diretório700 e5 arquivos600/owner conferidos. A validação canônica recusou o comando
não aceito; não ingeriu as linhas da captura como conjunto aprovado. Recibo exato:
**R2_DIRECTED_CUSTODY_DENY**. Portanto,preservação do raw está comprovada;
**não existe certificado de custódia/coleta completa**.

[Resultado sanitizado, horários e hashes](SANITIZED_RESULT.json),
[procedência](PROVENANCE.json). O raw, stdout/stderr integrais, config filtrada,
UUID, cmdlines/tabelas TCP e journals ficam privados no destino aprovado
csv-r2-directed-read-20261017-v1, fora do Git. Não se declara COMPLETE nem se apaga DENY.

## As duas negativas, sem atribuir defeito produtivo

1. **process-frontend / process_script_unconfirmed**, errno nulo. O predicado
   exigia o caminho literal do script em cmdline ou pm_exec_path. Não confirmou
   essa representação. A função falhou antes de persistir uma linha completa do
   frontend. Não há raw de sua cmdline/config/imagem neste resultado para afirmar
   o motivo ou promover um perfil alternativo. O fluxo passou por predicados
   anteriores, mas isso não substitui a linha/certificação ausente.
2. **sql-proxy / proxy_argv_shape**, errno nulo. Não persistiu argv do proxy; não
   provou alteração do Docker/proxy. O histórico privado09:46UTC16/10 tem12
   argumentos e a flag unitária **-use-listen-fd**; a exigência de pares/len ímpar
   do reader também recusaria esse histórico já conhecido. Isso demonstra uma
   lacuna do predicado frente ao formato histórico, sem reconstruir argv atual
   ou imputar a ele uma causa histórica definitiva.

Não houve PermissionError nessa coleta. São negativas de confirmação/representação,
não evidência de falha do serviço. Não alteramos o reader consumido, validadores,
perfis, pins ou bindings para obter PASS. O caso sintético aprovado exercitava
marcador de script explícito e proxy só com pares; não comprovava essas variantes
reais. Qualquer correção futura deverá ser revisada e ensaiada especificamente,
sem enfraquecer os controles canônicos System.check_config/Contract.

## Fatos efetivamente observados, com alcance limitado

Boot-before e boot-after têm o mesmo digest; o valor não é publicado. Isso liga
os registros deste intervalo, sem provar snapshot atômico ou boot retroativo dos
18 caminhos antigos. Cada processo abaixo teve identidade rechecagem **local ao
seu registro**, UID1000 e imagem real aberta por FD; o fechamento global de todos
os alvos não ocorreu e não está sendo substituído por análise de contagens.

| Observação | PID/PPID | start ticks | Configuração/relacionamento confirmado no registro |
|---|---|---|---|
| Daemon deploy |18676/1|222727|pm2.pid atual apontou18676; título/HOME e ticks históricos conferidos |
| API original |936386/18676|2193413108|cwd esperado e marcador de script; FD/socket→listener3001 |
| Worker original |936540/18676|2193413523|cwd esperado e marcador de script; FD/socket→listener8787 |
| Filho frontend |188910/188897|2161347712|filho listado pelo pai e FD/socket→listener3000; não certifica perfil do pai |

As relações de listeners foram reconciliadas **localmente** entre FD e tabelas
preservadas; não se executou ss novamente. Cwds e configurações ficam privados;
os intervalos de cada registro constam no JSON sanitizado. O frontend188897 como
perfil completo, o proxy177517 como canal atual e interval-checks continuam ausentes.
Nenhum PID é convertido em identidade atual permanente ou reutilizado em uma janela.
Não se fez HTTP, SELECT, medição contínua de disponibilidade ou nova validação das telas.

## Executáveis e caminhos realmente lidos

- **Node:**`/usr/bin/node`,97.661.912B, SHA256
  `d01614ef369e36eee9ab8d86fbfa93ddf44931010add45e5262a63e3ddda784e`.
  Os FDs de imagem do daemon/API/worker têm esse mesmo digest. Não se executou
  node --version; versão/closure/proteção exigidas para uso futuro não se inferem daí.
- **PM2:**alias `/home/deploy/.npm-global/bin/pm2` resolveu para
  `/home/deploy/.npm-global/lib/node_modules/pm2/bin/pm2`,56B,
  SHA`bbb586713050b21d86aa41bde704a3a4776aa300ddcbd9710e81fa7c0089256d`.
- **package.json:**4.532B,
  SHA`d2d8b77291fd72dd588f0511741d706b358d5f4387e86a236c8e39b31d324cfd`,
  campo version6.0.14. Cadeias/metadados ficaram privados, sem require/execução.
  As referências individuais CLI/package são consistentes no raw. Não se certifica
  versão carregada pelo daemon, closure transitiva ou revalidação global final.

A resolução conhecida por caminho absoluto explica por que a ausência no PATH
fixo anterior não permitia afirmar ausência de PM2. Não executamos PM2 CLI ou CJS.
Os dois seeds PM2 coincidem byte a byte com package/bin/pm2 e package/package.json
no tarball público B3 já disponível localmente, SHA
`a309112e6d89ed8adff54cb32831df3c79cdc6191e6085a8ea7007303fe49ce9`,
também indexados em B4/TOOLCHAIN_FILES.sha256. O tarball foi conferido, sem download,
extração em disco ou execução. Esses bytes serão reutilizados:nenhuma releitura
remota dos seeds é necessária. Isso não prova a closure instalada de4552 arquivos
nem transforma o laboratório B4 (Node22, não Node20 certificado) em toolchain produtivo.

## Canal SQL: identificado por configuração, sem conexão

Os registros filtrados de API e worker são iguais quanto ao canal DB:loopback5432,
banco/role correspondentes aos literais canônicos, senha presente. **Senha/URL
integra não foram capturadas nem publicadas.** Isso identifica a configuração,
não conectividade, credencial válida, server identity ou privilégios.
O proxy não foi confirmado; container atual é desconhecido. Não se executou SQL,
Docker CLI, psql, ownership observer ou capture_imports.capture.

Fonte canônica SQL/classify permanece crm-csv-operational-20261016/capture_imports.py;
a captura pós-saída tem precondições e escrita e não vira leitor livre.
A custódia NEWDB existente continua a origem legítima da credencial, não .env antigo.
Ainda faltam fechar proxy/canal atual, psql/toolchain/container se mantida rota Docker,
e uma futura consulta READ ONLY aprovada de identidade/escopo/ownership.
Nenhuma alternativa de canal ou credencial foi aplicada automaticamente.

## Inputs reutilizáveis e bloqueios consolidados

| Grupo/consumidor | Reutilização válida | Pendência real |
|---|---|---|
| process/interval_checks; Contract/check_original | raw atual de daemon/API/worker, Node/cwd/script, child/listeners | frontend completo, proxy e fechamento global; revalidação fresca no uso |
| caminho PM2; B4/PM2 input/instalador | paths, links/metadados, hashes Node/CLI/package | seeds locais por hash reutilizados; closure instalada/protegida ainda pendente; package version não é daemon attestation |
| SQL/classify/db_owner_set_gate | configuração DB filtrada e escopo/SQL canônicos já válidos | canal/identidades/ownership e SELECT autorizado; nada executado |
| fontes canônicas e retorno | before/restore/provas locais válidas, runtime aceito | inputs atuais completos/16 vínculos, proteção root/autoridade instalada; não materializados |
| supervisão e ambos os crons | comparação byte-exata já concluída e custódias existentes | supervisão **não reaberta**; não há nova necessidade de systemctl neste delta |

Os três conjuntos de custódia anteriores mantiveram nomes, hashes, tamanhos, inodes,
modos, mtime e ctime. Os dois DENYs e18 observações continuam históricos. A coleta
anterior de6 comandos continua COMPLETE_NOT_CERTIFIED, sem reclassificação retroativa.
As observações de01:22,01:40,01:54 e02:23UTC permanecem épocas distintas.

## Próximos comandos para decisão, não executados

[NEXT_COMMANDS.md](NEXT_COMMANDS.md) contém uma proposta mínima de leitura dos
2 elos sem representação, reutilizando localmente os seeds estáticos PM2, com destinos novos, FDs,
identidade/boot/hashes esperados e preservação pelo private_record existente.
Não corrige predicados nem completa/reexecuta R2. Sua checagem foi **somente sintática**,
sem nova suíte, execução remota ou alegação de prontidão. A preservação diagnóstica
proposta não é certificado operacional. Falta revisão/autorização específica.

Para SQL e autoridade, a matriz declara os inputs faltantes e consumidores; não
oferece comando supostamente pronto com dados inventados, bindings ou decisão tácita.
Não se repetiram provas válidas, build, backup/RPO ou composição operacional.
Nenhuma alteração produtiva, .env, credenciais, permissões, schema, retenção,
instalação/emissão, reparo, contenção, stop/start ou janela. NEWauth+NEWDB+NEWcipher,
produção, guarda38 e out.15 foram preservados por ausência de mutação; isso não
substitui recertificação funcional completa atual. CSV continua suspenso.

Somente este resultado sanitizado/procedência/hashes, comandos para revisão e3
checkpoints são publicados. Vercel deploy desabilitado e workflow limitado a
main/develop conferidos, sem alterações. Deifson; revisão21/10/2026 ou mudança/gatilhos.
