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
