# Observação frontend — instalação conferida e preflight VPS PASS

[Resultado efetivo de 07/10 no relatório único](../FRONTEND_FA60F0F6_PREPARED_2026-10-07.md#instalação-conferida-e-preflight-real-na-vps--0710): helper/política/regra literal instalados após autorização específica, check-installation PASS e uma tentativa de preflight real PASS, duas amostras completas. Produção9f preservada; gatefalse/fa60 NOT DEPLOYED. [Registro sanitizado](installation-result.json). A comprovação de leitura não libera janela. As seções abaixo preservam o desenho e o roteiro da preparação anterior; suas referências a “não instalado/não executado” foram superadas somente pelo resultado desta instalação/leitura, não por deploy ou ensaio produtivo de saída.

## Dependência antes de qualquer janela

`deploy` lê a árvore frontend e o daemon, mas não o conjunto completo de proprietários dos descritores. A menor delegação proposta é **uma chamada fixa somente leitura**, separada do observador DB e dos nove comandos da janela backend:

```sudoers
deploy ALL=(root) NOPASSWD: /usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-socket-observer.py
```

Helper: `/usr/local/libexec/re7/frontend-socket-observer.py`; política: `/usr/local/libexec/re7/frontend-socket-observer-policy.json`. Sem argumentos, shell, imports de preparações ou ações PM2/nft/systemd. A política root-owned fixa boot, PID/start ticks do daemon, porta3000 e os três bindings source/candidate/return (release, entry, nonce e caminho de captura). Dados privados não são versionados. `observer.py` faz duas leituras completas consecutivas; mudança relevante, permissão insuficiente ou observação incompleta nega. Orçamento interno8s, timeout externo10s, sem loop de certificação. R/S não muda identidade; zumbi, substituto, listener ou owner adicional nega.

Instalação futura depende de revisão/decisão de Deifson sobre esses bytes e a política concreta. **Não instalar nesta rodada.** Antes da instalação: conferir ausência dos destinos ou arquivar qualquer anterior; verificar hashes publicados, toda a cadeia root-owned sem symlinks/escrita por deploy, Python isolado e imports stdlib. Diretórios0755/helper0644/política0600/regra0440; regra literal validada com visudo antes/depois. Depois: conferir hash/propriedade/permissões e uma leitura fresca da árvore ativa com os três bindings; falta ou divergência nega antes da parada. Política e bindings privados concretos agora estão no staging `frontend-socket-observer-20261007T190902Z`, ainda sem aprovação/instalação. [Comandos completos, hashes e preflight no relatório único](../FRONTEND_FA60F0F6_PREPARED_2026-10-07.md#pacote-concreto-de-instalação-observacional--0710); scripts versionados `install.sh`, `check-installation.sh`, `run-preflight.sh` e `remove.sh`. Não executar antes da autorização específica.

Remoção futura: somente a regra nova e os dois arquivos novos, após comprovar que nenhuma troca/retorno depende deles; preservar observador DB, nove comandos backend, arquivos anteriores e evidências. Sem instalação nesta rodada não há remoção a executar.

## Integração revisável

`frontend-check.py` usa `socket_observation_client.py` e um contrato comum em `socket_observation_contract.py` para saída de origem, candidato e retorno. Antes da parada, a origem e sua incarnation real são comparadas à política. Cada saída exige nova chamada: nenhuma prova root histórica é lida. O logger guarda stdout/stderr/exit/timeout em arquivos privados600; recibos exclusivos impedem replay, sem autorizar execução posterior.

Socket residual só é explicável quando uma varredura de todos os UIDs encontra **exclusivamente** fd0 do daemon exato, Unix stream conectado; processo/frontend/listener próprio ou proprietário adicional continua negando. Grupo PM2 compartilhado não torna um PID/start ticks já existente um novo descendente; nonce/release/entry explícitos continuam negando. Novos membros e árvores/ledgers sobreviventes também negam.

Duas amostras não são atômicas e não impedem intervenção posterior do operador. Continuam necessários executor único, controles de janela e supervisão. Falha do observador depois da parada bloqueia também o retorno: resolver a capacidade observacional antes da janela evita descobrir essa dependência durante indisponibilidade. Não há bypass por prazo.

## Ensaio reproduzível

Pré-requisitos: Linux com user/PID/network namespaces e proc privado; Node20.20.0, PM2 6.0.14 preservados; extrações íntegras dos tars fa60 e9f conforme manifesto. A execução abaixo não recompila nada:

```bash
unshare -Urnpf --mount-proc sh -c 'ip link set lo up; python3 docs/reviews/automation-freeform-window-release-af26/frontend-socket-observation-proposal/test_cluster_chain.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2 /tmp/re7-front-fa60-clean /tmp/re7-frontend-9f4cbe0f-clean-final'
```

Namespace sem rede externa; daemon/launcher/bootstrap/Next reais, instances1/cluster como produção. API/worker são timers. O driver chama o código efetivo do observador como root do namespace; não testa instalação root-owned/sudoers no host. Negativas de permissionamento, binding de daemon, replay e PID reutilizado usam injeções explicitadas no relatório. Churn usa processos reais com barreira injetada entre amostras. Não equiparar a instalação/deploy nem aceite funcional.

## Complemento de preparação da instalação

[Manifesto concreto](installation-manifest.json):10arquivos no staging, política/origem/binding privados atestados; nenhum dado privado versionado. `preflight.py` faz reconfirmação e no máximo3tentativas de observação, sem starts. `test_preflight_driver.py`:12casos PASS com cliente/contrato efetivos, metadata PM2/amostras root simuladas e FDs reais de um filho no namespace; não substituir por esse resultado a comprovação da instalação e leitura privilegiada na VPS.
