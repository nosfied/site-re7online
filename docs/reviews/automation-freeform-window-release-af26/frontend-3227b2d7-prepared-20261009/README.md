# Frontend3227 — preparação operacional, 09–10/10/2026

**STAGED / PREPARED FOR POLICY REVIEW AND INSTALLATION / NOT DEPLOYED.** Pacote e controles concretos conferidos. Nenhuma instalação root, parada, partida produtiva, promoção/save, janela, envio, reparo ou alteração de campanhas/configurações. Gate `execution-authorized=false`. Preflight integrado sob a política nova permanece **NOT EXERCISED**, até instalação autorizada; não é preparação declarada pronta para executar sem essa conferência.

## Release real e retorno preservado

Auditoria por leitura da árvore efetiva PM2 → launcher → bootstrap → Next, manifesto imutável, controles, dump e fallback. Frontend ativo é **fa60 corrigido**, não9f: `fa60f0f6443f3e0a129dc707021cffdc408af817-front-css-17bd5fb8`, BUILD_ID `wBXX8kmp5RuCHCYt_ot8X`, manifesto378bb220…. Ele é o retorno desta geração. Original ativo, launcher, control, promoção/journals e diretório234000 permanecem intactos; retorno novo usa nonce/control/journal próprios e não reutiliza sua tentativa consumida.13arquivos de cache Next permitidos pelo contrato de retorno; nenhum arquivo imutável divergente.

API efetiva é a corretiva `a26dbb0e`, release `campaign-eligibility-recovery-final-reviewed-20261008`; o worker mínimo é reativo afbb. Não os rotular como APIafbb por uma referência antiga. Ambos e frontend continuam online/restart0 com mesmas identidades; daemon18676/ticks222727 preservado. Guarda aberta36/tasks{}, cron/crontab/bootinactive-enabled e saved/fallback iguais à leitura inicial. Não houve acesso mutável às sessões/auth; nenhum processo backend foi controlado. HealthAPI por leitura PASS, não aceite funcional.

## Pacote exato

Fonte3227b2d752110873f0eff4ee5253a6f06ca51549, build já validado Node**20.20.0**/Next16.1.5 reaproveitado, **sem rebuild**. BUILD_ID `8OqIZZxaW7_ogf6h7AVoe`.

- Tar `frontend-3227b2d7.tar.gz`: **9b54548e4a7763f5078ae0433aceb43a37567eccd988814dd82f2fab97229319**,184.068.857bytes.
- Manifesto completo: **32349250b8bd73fe30c37d761d43a47185a2c9b33c9e4715f5a25265dd581f60**,23.795arquivos/31symlinks confinados. Está no tar e na release inativa, com hash/modo de cada arquivo; [manifesto sanitizado](manifest.json) contém resumo, links e hashes dos controles/bindings.
-241assets antigos adicionais preservados para abas com bundles prévios. Uma colisão recusada no primeiro empacotamento era `.js.map`: JS e conteúdo do mapa eram idênticos, apenas `sources` diferia. [Receita](package.py) mantém o mapa novo somente após provar igualdade de todos os demais campos e do JS; divergência executável/CSS continua negando. Diagnóstico e diretório parcial preservados, não reutilizados.
- CSS `static/chunks/64ec3d62bdaa41ef.css`: **1ddf8dca7f9965191239b7aef3b8ce92374ccf637ca421d3ad75a0cc964eab64**,187.044bytes, Tailwind expandido. Detector existente adaptado somente para aceitar caminhos CSS `static/css` **ou** `static/chunks`; nomes hashed do build não são presumidos iguais aos anteriores.
- Dependências/Next/lockfile e parâmetros públicos preservados; valores públicos ativos encontrados nos compilados. Schema, migrations, backend/worker/auth não fazem parte do delta. Symlinks resolvem exclusivamente dentro do pacote.

Extraído limpo em `/tmp/re7-frontend-3227b2d7-clean-final-20261009`, executado **desse diretório** pelo binário20.20.0; sem depender da árvore de desenvolvimento para runtime. [16cenários Chrome PASS](results.sanitized.json): um/vários lotes, falha legível, setor/fluxo/variáveis exclusivos do filho,17previstos/0materializados, leitura sob demanda, seleção/sessão/atrasos, teclado/mobile, máximo2leituras simultâneas e nenhuma requisição mutável de campanha/provider. APIs/autenticação sintéticas, polling controlado; HTML/JS/CSS HTTP/MIME e estilos calculados reais. Verificador HTTP/CSS efetivo passou na mesma extração (porta local3082 substitui3000 apenas no argumento de função do ensaio). Provas de horários e demais aceites válidos reutilizadas, sem novos ciclos de envio.

## Staging e composição

Preparação `/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-20261009T220400Z`; candidato `/opt/re7online/releases/3227b2d752110873f0eff4ee5253a6f06ca51549-front`. Hash do tar antes da extração remota, manifesto completo depois: PASS. **16scripts e23bindings** em dois manifestos conferidos, gates falsos, nenhum intent/capture de saída. Controles/cfgs novos para ida/retorno, fontes originais e históricos preservados.

[check-preparation.py](check-preparation.py) executado na VPS: correspondência **integral** base/ecosystem/tracked/run/roles das duas políticas, release/entry/BUILD_ID, atualPM2/core/daemon, saved/fallback e controles. Baselines reais sem defaults. Proposta de janela validada pelo schema do observer instalado; proposta permanente confere cada entry/hash/build. Leituras root literais existentes retornaram duas amostras completas/consistentes, hashes/helper/política atuais iguais aos bindings instalados. Essas amostras **não** certificam saídas nem substituem o preflight novo.

Leitura final UTC: 2026-10-10T11:34:01.091594+00:00. Hashes completos origem/resultado, scripts e bindings estão em [manifest.json](manifest.json). Tars, configurações, políticas, nonces, auth, logs e observações completas ficam fora do Git. Scripts publicados são somente adaptações de paths/versões e verificadores de leitura; código de supervisão/ausência permanece o aprovado.

## Privilégios explicitamente pendentes

Helpers e sudoers **inalterados**. **Duas políticas root-owned** precisam de substituição futura, nos momentos abaixo; nenhuma instalada nesta preparação:

| Política | Atual | Proposta |
|---|---|---|
| Janela | `6087f980ed58f084294f77dbca688c5cba9b39229d3c2b10daa35732ff74f7d4` | `e6c9adf9547f678ad133c4079170599fe32d7fc08c44917d53868124395314f4` |
| Permanente | `24a78e7ebb6e92b56a6719a7234631ed11b8e93b657665817b6905a16a00add3` | `573bcb3e78156d0f97dcd340c1e075556b8eca1c16fa2f5a59e6d30960c630eb` |

Comandos completos, sem placeholders, para sessão sudo de Deifson **após aprovação específica**:

```bash
bash /opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-20261009T220400Z/install-window-policy.sh
```

[Bloco root de janela](install-window-policy.sh) arquiva política anterior, confere bytes/cadeia/visudo/sudo literal, verifica pacote/retorno/contratos, executa preparatory before e arquiva sua captura **só com PASS**. Gate falso; nenhum stop/start. Negativa ou instalação parcial exige diagnóstico/estado exato, sem sobrescrever/repetir. Reconfirmação da futura janela usa outra observação; boot/daemon drift nega.

A política permanente **continua atual durante preparação e até a confirmação visual**: a geração ativa/saved segue recuperável sob seus bindings atuais. Somente com candidato ou novo retorno pronto e confirmação owner, **antes da promoção/save**:

```bash
bash /opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-20261009T220400Z/install-permanent-policy.sh
```

[Bloco permanente](install-permanent-policy.sh) preserva a anterior, confere identidade/prontidão do novo control, instala apenas política fixa dos artefatos e faz leitura literal fresca. Root0644helpers, root0600políticas, root0440sudoers, cadeia segura/visudo intactos. Não amplia sudo, DB/backend ou função de observação. Deifson precisa estar disponível nesse ponto previamente conhecido. Se política já foi instalada antes de um retorno, **não reinstalar**: [check-permanent-policy.py](check-permanent-policy.py) faz leitura fresca para o control realmente ativo. Nenhuma promoção até PASS. Arquivos/políticas referenciados não podem ser removidos. Reversão de instalação parcial requer observar hashes/estado, não um bloco cego de remoção.

## Sequência executável e retorno

[WINDOW-STEPS.txt](WINDOW-STEPS.txt) reúne comandos literais de ida, retorno e promoção. Somente frontend: lock exclusivo, manifests/contratos, before novo → gate true → stop → exited novo → delete → start-candidate único → readiness30s/30tentativas → candidate/CSS efetivamente servido → confirmação owner → política permanente/leitura → promoção → save/fallback → gatefalse. Cada comando perigoso tem saída/erro/exit privado; nenhum start repetido para diagnóstico.

Antes do stop, reconfirmar execução única, freshness dos baselines e identidades/controles. Drift exige interromper, não adaptar binding. Sem nft/stop de API/worker/guarda/scheduler/cron/boot. Em falha, selecionar pelo estado observado: antes do stop, não partir retorno; após saída da origem sem intent candidato, iniciar retorno uma vez; após qualquer intent candidato, stop + **candidate-exited novo** antes do retorno. PID/porta ausentes isoladamente não bastam; listener, proprietário adicional, árvore sobrevivente, PID reutilizado/zumbi ou observação incompleta continuam negando. Retorno também requer readiness/owner/permanentread antes de promoção/save; se morrer, return-exited novo e escalonamento, sem segundo start. Os comandos de retorno pertencem à tentativa ainda não promovida. Promoção fecha o gate: não reabilitar uma tentativa consumida para diagnosticar falha posterior; recuperação permanente usa o contrato PM2/observação atual, e troca adicional exige captura/preparação nova conforme o estado real.

Duração esperada de stop/prontidão: dezenas de segundos, limitada30s por prontidão; confirmação owner e eventual instalação permanente acrescentam tempo variável. **Aos15min** comunicar estado/impedimento e aplicar retorno comprovável; prazo não autoriza bypass/kill. Handover policy/promoção/dump é sequencial, não atômico: daemon/reboot inesperado no intervalo exige avaliação do estado real; só após cadeia concluída é assumido o contrato automático save/resurrect ensaiado. Ensaios anteriores Node20/PM2 reais, reboot/ilegibilidade injetados e efeitos simulados permanecem distinguidos; não se declara reboot produtivo PASS.

## Conferência futura e limites

Owner confirma sessão, layout, Inbox, CRM e campanhas existentes; lotes/falha/público previsto só leitura. Não criar campanha para conferir apresentação. Aba antiga usa assets preservados; recarregar obtém BUILD_ID novo. Não promete compatibilidade permanente de Server Actions antigos entre builds. Nenhuma validação humana produtiva desta release ocorreu agora.

Não há dump/restore novo nesta preparação **exclusiva frontend**: não altera DB/auth/schema e conserva release/config/dumps PM2 do retorno. Não importar procedimento de backup/parada coordenada backend para esta troca. Necessidade de backup DB adicional só se escopo mudar, o que não está autorizado.

Aceites anteriores preservados. Multilote natural, contingênciaAUTO e CRA-PR continuam pendentes e separados. Sem staging/alteração de backend, envio, agendamento ou reparo histórico. Próximo passo: revisão concreta das duas políticas/roteiro e autorização da instalação de janela/preflight; só depois avaliar execução.

## Auditoria de continuidade — 10/10/2026, referência 6a354ceb

**CONTINUITY AUDIT PASS / WINDOW-POLICY PREFLIGHT PENDING / NOT DEPLOYED.** Leitura atual iniciada às **11:20:50 Fortaleza (14:20:50 UTC)**, com resultados preservados privadamente. A observação de 10/10 11:34 UTC permanece histórica e não foi reutilizada como atestado atual. Referência local/remota da branch reconfirmada: `6a354ceb2e286e542d7070845ed65d61daa9da4a`. Worktree de revisão sem alterações versionadas ao iniciar; checkout principal com trabalho preexistente permaneceu intacto.

### Achados por gravidade

- **Crítico/alto:** nenhum bloqueio novo demonstrado na composição examinada. Não equivale a aprovação da futura janela nem prova de recuperação de toda falha possível.
- **Médio — dependência operacional explícita:** política permanente diferente da instalada; só pode ser substituída após confirmação owner, antes de promoção/save. Instalação parcial, ausência de sudo ou negativa do observador impedem promoção. Não há transação atômica entre política, promoção e dump. Deifson deve estar disponível para essa etapa previamente publicada; não descobrir a dependência com atendimento interrompido.
- **Médio — comando incerto:** timeout do CLI PM2 pode deixar operação em andamento no daemon. O intent permanece consumido; prazo/erro não autorizam segundo start. Verificar estado efetivo e exigir saída fresca no ramo correspondente. Não anunciar a captura de diagnóstico como recuperação automática.
- **Médio — prontidão/retorno:** falha de prontidão não certifica ausência. O retorno após intent exige `candidate-exited` novo, ledger suficiente, inventário, árvore, sockets e PM2; observação incompleta/sobrevivente nega. Se a falha for anterior à produção do ledger exigido, preservar evidências e escalar: não inventar identidade/certificado nem flexibilizar `journal()` para partir retorno. O ensaio anterior de saída precoce não prova toda falha possível antes do handshake.
- **Baixo — documentação:** BACKLOG já registrava a preparação3227; RUNBOOK ainda iniciava pela implantação histórica fa60. Ambos passam a apontar à mesma preparação e ao retorno efetivo fa60 corrigido, preservando as entradas históricas e aceites. A referência antiga9f não é o retorno desta geração.

### Conferências executadas

| Verificação | Resultado e limite |
|---|---|
| HEAD remoto, branch e isolamento de trabalho | PASS; remoto/local iguais à referência auditada. Alterações do checkout principal não incorporadas. |
| Manifesto público e tar local | PASS; hashes conferidos. Mesmo tar9b54548e; nenhum build, suíte ou empacotamento novo. |
| 16scripts / 23bindings na VPS | PASS; manifests c00bacf5… / 118f8a74… iguais à referência. Gatefalse; nenhum start-intent ou captura de saída nova. |
| Configurações base/ecosystem/tracked/run | PASS pelo checker efetivo e comparação integral, não apenas cwd/script. Parâmetros privados preservados. |
| Políticas propostas e bindings | PASS para candidato/retorno, e conferência adicional explícita do papel source: release, entry, identidade da execução, caminho da captura e hash/BUILD_ID permanente. Binding contém exatamente a política proposta. Schema de janela validado pelo helper efetivo instalado. |
| Pacote candidato e retorno remoto | PASS; manifesto completo/symlinks/imutáveis, tolerância documentada de cache do retorno. Sem iniciar candidato. |
| Identidades produtivas | PASS; frontendfa60 PID3438948/ticks2120147745; APIa26 PID3625739/ticks2128115907; workerafbb PID3625960/ticks2128116272. Todos restart0. Daemon/boot conferidos pelos controles e pelos dois observadores. |
| Guarda/crons/boot/saved/fallback | PASS pelo checker efetivo comparando baseline integral. Guarda aberta36/tasks{} preservada; sem escrita no ledger, DB/auth ou controles. |
| Observadores atualmente instalados | PASS: chamadas sudo literais como deploy, helper/policy hashes atuais exatos, duas amostras completas retornadas e iguais em cada leitura; boot/daemon atuais compatíveis. Sem instalação, alteração de sudoers ou leitura root arbitrária. |
| Preflight da política **proposta** | **NOT EXERCISED**. A política atual é outra; leituras atuais não podem substituir essa prova. |
| Ida/retorno/promoção atuais | Revisão estática dos bytes finais e reutilização de provas anteriores; **não executados na VPS nesta rodada**. |

O driver de auditoria encontrou inicialmente ausência de `window.lock` antes de qualquer conferência: diagnóstico arquivado, nenhuma alteração. A geração ainda não iniciou janela; a auditoria prosseguiu sob `preparation.lock` existente, não criou lock de janela/captura/intent nem adaptou bindings. Isso não certifica exclusividade de uma janela futura: `install-window-policy.sh` e WINDOW-STEPS adquirirão o lock próprio no momento previsto.

### Instalação parcial e comandos com prazo

1. Antes de executar o instalador, conferir script/binding/policy hashes, gatefalse, identidades e ausência do arquivo de arquivo histórico. Não executar agora.
2. Se arquivo histórico surgir mas a política continuar antiga, arquivamento pode ter concluído e substituição não; preservar ambos e parar. Se política nova estiver instalada mas preflight falhar, não anunciar PASS nem voltar a executar o instalador inteiro: ele exige arquivo histórico ausente. Conferir hashes/cadeia/fase real e diagnóstico antes de definir a recuperação restrita.
3. Política com hash inesperado, arquivo parcial ou cadeia insegura: nenhuma parada/promoção. Não sobrescrever para obter PASS. Helpers e sudoers ficam preservados.
4. `frontend-action.py`: timeout15s por ação /40s no envelope de prontidão; stdout/stderr/exit e timeout em registro privado. Prontidão efetiva até30s/30tentativas, sem start adicional. Leitor root até10s; cada saída exige observação nova e recibo exclusivo. A recusa não libera repetição de start nem replay de captura.
5. Comando humano de instalação pode esperar senha; somente na sessão sudo do owner. Não iniciar janela com essa dependência pendente. Ao falhar, preservar saída/erro/código; não repetir bloco completo cegamente.
6. Ramo de retorno depende do estado observado: sem parada, apenas interromper; origem saída e sem intent candidato, retorno único; qualquer intent candidato, saída fresca antes do retorno. Retorno também tem intent/prontidão/saída próprios. Falha persistente exige comunicação/escalonamento, jamais bypass aos15min.

### Acesso atual e próxima decisão

Leituras executadas: SSH `deploy` para manifests, configurações, PM2/proc/guard/cron/boot/dump; sudo **somente** as duas chamadas literais existentes `/usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-socket-observer.py` e `/usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-permanent-observer.py`. Saídas completas privadas, incluindo erros, sem publicar configurações/credenciais/nonces. A conferência atual da capacidade literal passou; auditoria não executou `visudo` nem releu o conteúdo root-only dos sudoers. Essa conferência root de hashes/cadeia/visudo continua no bloco de instalação em sessão Deifson.

**Única próxima ação proposta ao owner:** instalação exclusiva da política de janela + preflight preparatório, pelo bloco já publicado:

```bash
bash /opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-20261009T220400Z/install-window-policy.sh
```

Exige decisão específica do owner e sudo em sua sessão; arquiva6087f980… e instalae6c9adf9…, mantendo helper/sudoers e `execution-authorized=false`. Não é autorização de instalação permanente, stop/start, promoção/save ou deploy. Somente após PASS desse preflight se avalia a janela. A política permanente proposta573bcb3e… permanece pendente para a fase posterior já descrita, sem instalar nesta rodada.

Multilote natural, contingênciaAUTO e CRA-PR mantêm aceites separados; horários/CRM/CSV/dinâmica/out.14 e históricos não foram reabertos. APIa26/workerafbb/schema/auth/sessões/guarda/scheduler/cron/boot preservados. Nenhum envio ou criação de campanha.
