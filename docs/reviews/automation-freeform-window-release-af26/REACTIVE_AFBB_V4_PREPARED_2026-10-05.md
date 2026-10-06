# Contingência reativa afbb7455 — preparação coordenada API/worker

**Atualização de execução (05/10): preparação consumida e abortada antes da contenção.** Consulte o [erro demonstrado, aborto e estado final](REACTIVE_AFBB_WINDOW_ABORTED_2026-10-05.md). O status de preparação abaixo é histórico; não relançar seus comandos/provas. afbb continua NOT DEPLOYED.

**PREPARED FOR INSTALLATION / NOT DEPLOYED.** Candidato funcional fixado em `afbb7455f320793e05a25875e8a5f13f98cabf90`, sobre `b83657809d1cc77ed8cc6fe75bf2b28f2ac1f5bb`, branch `review/campaign-recovery-20260926`. Não houve instalação privilegiada, contenção, alteração da guarda/scheduler/cron/boot, start/restart, envio, configuração de tenant ou reparo nesta etapa. A janela continua sem autorização de execução nesta preparação.

Preparação nova: `/opt/re7online/backups/converta-persistent/preparations/incident-6683-v4-reactive-afbb7455-20261006T010000Z`. O sufixo é identificador; os horários efetivos estão nas evidências abaixo. Cinco gates **false**. Nenhuma fase, prova, nonce, start-intent, certificado de saída ou captura consumida foi copiada das janelas anteriores. Nonces/certificados só serão emitidos no momento correto da futura execução.

[Comandos completos sem placeholders](reactive-afbb-prepared/OWNER-STEPS.txt), [hashes completos dos três modos e insumos](reactive-afbb-prepared/manifest.sanitized.json), [11 fontes/compilados API](reactive-afbb-prepared/api-artifacts.sanitized.json). Configuração, política com dados privados, baseline, auth, logs, tar e dump permanecem fora do Git.

## Estado reconciliado e composição

Leitura inicial em **2026-10-06 00:54:03 UTC / 05-10 21:54:03 Fortaleza**; health final em **2026-10-06T01:05:37.670331+00:00**. Nenhuma divergência material da versão conhecida:

| Componente | Efetivo / preservado | Candidato / retorno |
| --- | --- | --- |
| API | b9b58177880e729854580def1180f3edb2fb83e8, PID2980770/ticks2099843172, zero reinícios | afbb7455 em release isolada; retorno à mesma API b9 íntegra |
| Worker | worker-minimal-hybrid-b9b58177-verified-v3, PID2980928/ticks2099843568, zero reinícios | Somente tar mínimo reativo exato; retorno ao mínimo b9 efetivo |
| Frontend | af26, PID2537692/ticks2081554427, BUILD_ID J5cHyVKiKEI5xxiGBY5If | Mesma identidade/configuração nos três modos, sem stop/start ou rebuild |

Guarda aberta **geração29**, `tasks: {}` e sem falha de ledger; scheduler habilitado (`CAMPAIGN_SCHEDULE_PROCESSOR_DISABLED=false`). Quatro sessões connected/cinco registros auth; health API/DB e controle HTTP do worker atuais PASS. Jobs/grupos/leases/sendingScheduled zero no recorte: **não é drain do worker nem certificado para parar**. Saved/fallback, cron/crontab e boot inactive/enabled correspondem ao estado inicial; barreira ausente. Lock do executor disponível no instante observado; reconfirmar exclusividade antes de executar.

API nova: `/opt/re7online/releases/afbb7455f320793e05a25875e8a5f13f98cabf90-api`. Foi copiada em isolamento da API b9 atestada, preservando dependências/symlinks, e recebeu somente as 11 fontes/compilados alcançados pelo delta revisado; hashes antes/depois conferidos. Não foi usada a árvore do worker como API. Overlay privado SHA-256 `0ac7a6b6a02bc8fddbf2a26359dbdef2a2923e461b3ab15179af49a2d8485965`.

Worker novo: `/opt/re7online/releases/worker-minimal-reactive-afbb7455-verified`. Tar SHA-256 **8b67292578090a2f564e4a9bf399b002e667bba723c936859fc438aa1221f5c8**, conferido antes da extração. Manifesto completo **650b2a216b595f858c4b9b5110d2dbcd8909bc4a7ec655c3560734c5641ca398**, 7.044 arquivos/11 symlinks internos; patch SHA **ce0da6d43faa3817ec16779633cbafdbb8bd536e0e86325f23238cea55289b3c**. Imports relativos/dinâmicos literais e dependências alcançáveis conferidos na extração limpa; `.data` operacional externo é verificado separadamente pelo binding, sem relaxar o verificador de pacote. Três módulos e teste mudam contra b836; o delta acumulado contra b9 permanece 83 módulos alcançáveis/11 overlays. Nenhum worker completo, rebuild funcional ou atualização de dependência.

Schema, migrations, lockfile API, Prisma gerado/runtime preservados e conferidos contra origem. Dependências e Prisma do worker permanecem os do tar b9, verificados pelo manifesto completo. Configurações reduzidas da API e worker foram reaproveitadas; somente referência de build/release e caminhos candidatos mudam. DB/auth/data e frontend seguem os mesmos bindings. Sem migration.

## Procedimento V4 e provas

| Verificação | Evidência / limite |
| --- | --- |
| Guarda persistida | Sequenciador/helper exigem versão/schema válidos, `tasks` objeto vazio; não aceitam campo ausente/falsy. HTTP de diagnóstico continua retornando lista, conforme contrato distinto. |
| Ordem | Baseline → CAS/fechamento e geração confirmada → prova/preflight. Prova antecipada ou drift é negado; intents/certificados e histórico preservados. |
| Identidade/saída | PID + ticks, daemon PM2 real, cwd/script/release/watch, árvore/sockets. R/S não é restart; zumbi, substituto, descendente ou observação incompleta negam. |
| Banco | Zero conexões externas/advisory locks antes da API; somente conexões comprovadas da API sucessora pela prova V4 antes do worker. Nada excluído por papel/IP/application_name. |
| Provas vencidas/consumidas | Renovação somente após reconfirmar bindings, nonce novo, prova anterior arquivada; sem prolongar validade/repetir start-intent. |
| Captura pré-unfence | Dois samples consecutivos consistentes e limites de recaptura; guarda/barreira/daemon/release/árvore/identidade reconferidos, e helper revalida a nova captura antes do delete. Churn persistente bloqueia. |
| HTTP sob nft | Controle do worker em sua porta própria antes de unfence. API3001 e frontend3000, inclusive loopback, são validados somente depois de retirar a barreira. |
| Diagnóstico | stdout/stderr/exit de todas as ações privilegiadas em arquivos privados, resumo sanitizado no journal. Erro não equivale a recuperação automática nem autoriza nova partida. |

A lógica operacional é a composição corrigida de 140fd813/183b4122: helper, sequenciador, logger, template e hashes normalizados de ops/delegated iguais. Provas anteriores aplicáveis preservadas: 24 testes do driver sequencial e 13 checks com Node20.20.0/PM2 6.0.14, processos/sockets/descendentes reais, nft/phase simulados e divergências de PID injetadas conforme relatório original. Não foram reexecutados ou reatribuídos como novos testes desta release. Os testes funcionais afbb também não foram repetidos.

Composição nova ensaiada: **4/4 PASS**, módulos exatos copiados da preparação remota, retorno com worker vivo/ausente, drift de origem negado sem start e gates falsos; DB/nft/systemd/estado e PID do cenário são injetados. Não é prova operacional real de troca na VPS. O driver só foi generalizado para extrair o único caminho bound de ops e importar o logger da composição; nenhum gate mudou. Comando reproduzível com a composição privada preservada:

```bash
python3 docs/reviews/automation-freeform-window-release-af26/v4-sequencer/test_composition_template.py local-evidence/reactive-preparation-20261005/composition
```

A primeira invocação privada fora do diretório do driver não encontrava o logger e não contou como PASS. O driver publicado resolve o logger da preparação efetiva e os quatro casos passaram. A conferência inicial de imports na release com `.data` externo também foi recusada corretamente; a extração limpa e o binding separado passaram. Nenhuma recusa foi contornada em código operacional.

## Backup e integridade

Dump fresco persistente: **27.223.996 bytes**, SHA-256 **33ba8ab892619578b6fb1ce17c2dac5c643449a33790c2ae801fbacd769782ec**, catálogo 614 objetos. Três arquivos adicionais de configuração/saved/fallback/guarda, runtime/auth e conteúdo tiveram catálogo/tar/hash verificados. Manifesto privado do backup `9e523f00315abb6a13ecb98586b50625ad74d0ac07966859967459801f00cbe7`. Nenhuma retenção destrutiva ou descarte.

O mesmo dump foi restaurado localmente em PostgreSQL **16.15**, somente por socket Unix, sem aplicação/provider. Restore exit0; 60 migrations concluídas com zero ausentes/checksums divergentes, seis rollbacks históricos preservados. Banco temporário removido e servidor local parado. Resultado vinculado ao dump em **2026-10-06 00:59:30 UTC / 05-10 21:59:30 Fortaleza**, hash `100b0a059994a52a18a0cf654424f35010893028093e7699b987a8d66ab27db2`. Backup e estado operacional precisarão ser reconfirmados imediatamente antes da janela; drift/tempo/trabalho novo podem exigir nova captura preservando anteriores. Não restaurar dump sobre dados novos como rollback.

## Privilégios e instalação futura

**Helper permanece igual. Somente a política precisa ser substituída.** Helper instalado SHA `8de358fd60c6e7c880166651b45d7ebd60c8f9b102759ff7f7628796fda1b212`, root-owned 0644, cadeia sem symlink/escrita por deploy, classificador efetivo reconhece os processos b9 reais. Observador instalado/proxy vivo continuam com identidade/hash atestados; leitura restrita PASS. Sem sudo geral, shell arbitrário ou nova chamada root.

Política nova SHA **e8e431efdb99655a0e1f63aa91cba6eae25dedb5ca8910762376408006c4ab98**; binds frescos dos PIDs/ticks atuais. Política instalada tem root:root0600; seus bytes são ilegíveis por deploy. Hash anterior esperado **e57320ee60e00d4f641a311e64e8acde94cd2f06081da5d8ee4fdf540c65ef7f** vem do registro da última instalação, **não foi reconferido por leitura root nesta etapa**. O bloco exato em OWNER-STEPS exige esse hash, preserva o arquivo anterior, confere helper/sudoers/visudo/ownership e executa inspect de política nova/fase nula/processos vivos. Divergência impede a contenção. Deifson deve executar esse bloco em sua sessão sudo quando a instalação/janela for decidida; nenhuma senha será capturada.

Hashes completos do sequenciador/logger/modos/configurações/bindings/backup estão no manifesto sanitizado. OWNER-STEPS SHA `b1fb11f3acda488cd11d51fe48addcd700f72a62d8665249ed32e9eb0b9e4625`. A fase anterior permanece no caminho vinculado à política antiga; nenhuma fase apagada. Todos os gates continuam falsos, sem marcador de autorização da nova janela.

## Sequência, abortos e retorno

1. Após decisão de instalação: Deifson instala somente a política pelo bloco publicado; inspect deve passar. Codex reconfirma executor único, hashes/identidades/env/caminhos/auth/sessões, proxy, trabalhos, backup/restore e controles. Drift material: não conter.
2. Após decisão de execução e gates: uma chamada ao sequenciador. Captura baseline, fecha guarda por CAS/drain de campanhas, emite prova na geração resultante, aplica contenção/controle de iniciadores e stop-pair único. Nunca encerrar HUMAN para obter drain.
3. Certificar saída de API/worker/descendentes, sockets, backends e advisory locks antes de sucessor. Iniciar API afbb, verificar identidade, obter prova V4 fresca, iniciar um worker mínimo reativo; frontend permanece vivo. Controle HTTP do worker sob contenção; captura renovada/PM2 saved/fallback; root revalida e retira a barreira.
4. Após retirada: health/DB, diagnóstico de guarda, identidade/BUILD_ID do frontend, worker/auth/sessões, Inbox/CRM autenticados em leitura quando disponíveis, logs e trabalho inesperado. Só depois restaurar admissões ao baseline por geração atual, cron/crontab/boot e observar tick natural. Não enviar validação.
5. Falha antes de parada: abort-prestop e restaurar estado/controles. Falha com apenas API candidata: return-partial após saída comprovada. Par completo falho: return. Ambos voltam à **API b9/worker mínimo b9 efetivos**, preservam frontend/DB/auth, exigem certificados/zero DB/locks e prova V4 antes de worker. Não voltar incidentalmente à API879/workeraf26.
6. Falha depois do unfence: guarda permanece fechada, diagnóstico privado preservado; sem restart para testar. Template publicado gera preparação/política fresca após reconfirmar API/frontend/daemon e captura do worker/árvore/sockets. Worker ausente deve ser comprovado exaustivamente pela última identidade, não apenas PID inexistente/porta fechada; substituto, descendente ou observador indisponível bloqueia. Política de contingência tem hash definido somente após essa captura real; **Deifson precisa estar disponível para sua instalação restrita**. O bloco completo de geração, arquivamento, instalação, inspect e `--post-unfence-return` está preparado em OWNER-STEPS. Não iniciar sucessor enquanto o anterior puder operar.

Retorno binário à b9 retira esta contingência/auditoria nova e volta à política reativa anterior, podendo bloquear resposta quando Web está comprovadamente indisponível; mantém as correções de identidade híbrida/persistência já implantadas. Não existe chave nova para simplesmente revogar nesta release. Reverter binários é distinto de mudar configurações de transporte/tenant; essas configurações não serão alteradas. Não remover helper/observador/permissão enquanto ida/retorno dependam deles.

**Impacto:** API e worker interrompidos coordenadamente afetam tenants e WEB_SESSION/API; frontend preservado não elimina indisponibilidade backend. Shutdown antigo não observa integralmente inbound/outbound/auth; risco residual permanece e deve constar da decisão da futura janela. Contenção histórica b9 foi 34s, não estimativa garantida para este candidato. Escalonar aos **15 minutos** com estado/impedimento/contingência; prazo não autoriza kill, bypass ou reabertura. Propriedade V4 é observação pontual sob controles operacionais, não atomicidade absoluta.

## Pendências e publicação

Preparação pronta **para instalação**, não liberada para execução: decisão de janela, instalação/inspect por Deifson, reconfirmações imediatas e habilitação explícita dos gates permanecem. As versões produtivas e controles não mudaram. O ciclo avulso demo4366 aceito permanece restrito ao caso; **Audiência CRM, CSV/variantes e aceite específico CRA-PR continuam pendentes**. SECULT/DB-only encerradas, inatividade Guia pausada, históricos e reparo de setembro CLOSED. Limitação de resposta já submetida permanece separada da frente maior pendente.

Escopo funcional inalterado: HYBRID/AUTO reativo com janela legítima, seleções explícitas sem fallback, campanhas/templates Meta-only e nenhuma segunda submissão após ambiguidade. Health, staging ou backup não constituem aceite funcional.

Publicação fast-forward somente na branch review, explicitamente excluída por vercel.json e fora dos gatilhos push/PR main/develop de CI. Sem merge ou auto-deploy. Tar, dumps, auth, configurações, inventários completos e logs privados excluídos do Git.
