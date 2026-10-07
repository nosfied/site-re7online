# Composição final: revisão da preparação, não autorização de janela

Resultado canônico: [relatório único](../FRONTEND_FA60F0F6_PREPARED_2026-10-07.md#preparação-com-tar-corrigido-e-binding-permanente--0710).

Reprodução dos bytes, sem configuração privada:

```bash
python3 assemble-checker.py /tmp/re7-final-front-review
```

Origem do novo patch é checker `a611e0234e1248629b311ba5f0901d46a933151df12091904efb9281f44036a5`; resultado `e0793d24b883f0958ef1f2a5dfa98c93dd87989f574339e9788cdea53c476920`. Cliente permanece `c5a17c1c109c942d8094d2fe0bbd0b1ca89ca0378baa411b838c949a91bf4f7f`. O assembler anterior reconstrói a origem a partir dos patches versionados.

Ensaio final, Linux com user/net/PID namespaces e loopback; Node20.20.0, PM2 6.0.14, extrações íntegras do tar corrigido e retorno9f. Os argumentos abaixo são recursos locais do laboratório; não são caminhos produtivos nem autorização para download de pacote privado:

```bash
RECOVERY_LABEL=candidate unshare -Urnpf --mount-proc sh -c 'ip link set lo up; exec python3 test_composition.py /tmp/re7-final-front-review/frontend-check.py /tmp/re7-final-front-review/socket_observation_client.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2 /tmp/re7-front-fa60-css-corrected-clean-20261007 /tmp/re7-front-layout-audit-20261007/9f'
RECOVERY_LABEL=return unshare -Urnpf --mount-proc sh -c 'ip link set lo up; exec python3 test_composition.py /tmp/re7-final-front-review/frontend-check.py /tmp/re7-final-front-review/socket_observation_client.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2 /tmp/re7-front-fa60-css-corrected-clean-20261007 /tmp/re7-front-layout-audit-20261007/9f'
```

Executa PM2 cluster→launcher→bootstrap→Next e mudança real de daemon via kill/resurrect com dump idêntico. API/worker são timers sintéticos; providers/DB/auth produtivos inexistentes. Negação local de leitura `/proc/environ` e transição de boot são **injeções declaradas**; root observer executa seus syscalls reais. Instalação root de política é simulada em arquivo privado; gerador/verificador efetivos são usados. Sobreviventes são processos Node reais. Não é reboot real, instalação sudo ou disponibilidade integral da VPS.

`results.json` discrimina permissões/injeções. Resultados repetidos nos dois ramos não são casos únicos somáveis. O primeiro harness falhou por instrumentação, registro preservado privadamente; não recebe PASS. O harness final não altera bytes dos verificadores, exceto caminhos/porta/leitor de laboratório e a injeção declarada.

`check-css.py` é inspeção estática adicional, não substitui Chrome/computed styles. Detector real `tests/browser/frontendAssetContract.mjs` e prova do tar exato já aprovada foram reutilizados; nenhuma recompilação/suíte funcional nesta rodada.

`install-policy.sh` e `WINDOW-STEPS.txt` são propostas concretas **não executadas**. A política proposta exige revisão e autorização próprias. Helper e chamada sudo literal permanecem iguais. `rebind-policy.py` produz uma proposta permanente que muda só bootId/daemon; exige controle promovido, gatefalse, identidade e release íntegras. `verify-rebinding.py` só atualiza binding local após instalação explicitamente aprovada e leitura root fresca; não inicia processo.

Contrato temporal: mesma máquina/boot e daemon novo podem recuperar automaticamente se o inventário local for completo. Se precisar root com binding antigo, negar78. Após mudança de boot, exigir root atual mesmo com leitura local disponível; **rebind manual aprovado é indispensável**, não recuperação automática. Nenhuma política é atualizada silenciosamente. Não usar este mecanismo para aceitar drift durante janela. Depois de rebinding, uma recuperação normal PM2 é distinta de repetir start-intent da janela.

Não remover staging, controle, política ou journals enquanto active/saved/fallback/retorno os referenciar. Instalação parcial falha antes de partida, preserve arquivos e diagnostique; não repetir bloco indiscriminadamente. Arquivos completos de configuração, logs, dumps, tar e números de clientes não entram no Git.
