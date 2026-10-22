# Modelo operacional canônico de implantação do Converta

**Status: CANÔNICO / COMPROVADO EM PRODUÇÃO EM 20/10/2026 / RECONFIRMADO EM 22/10/2026**

Esta é a única fonte de instrução operacional vigente para deploy do Converta.
Runbooks, preparações e executores anteriores permanecem como evidência histórica e
não autorizam repetição.

## Topologia canônica

- O build ocorre fora da VPS em Linux `x86_64`, com Node `v20.20.0` e npm
  `10.8.2`.
- API e frontend são artefatos completos, versionados e validados por índice,
  manifesto, extração independente e SHA-256.
- Releases são imutáveis e residem em `/opt/re7online/releases/<release-id>`.
- O PM2 aponta somente para `/opt/re7online/current/api` e
  `/opt/re7online/current/frontend`.
- Cada caminho estável é um symlink trocado atomicamente para a release aprovada.
  `/proc/<pid>/cwd` resolve o symlink e mostra o destino físico.
- A API usa `/usr/bin/node` e o entrypoint integral da release.
- O frontend usa `/usr/bin/node`, `node_modules/next/dist/bin/next`, argumentos
  `start -p 3000`, `fork_mode` e uma instância. Next não roda em `cluster_mode`.
- O worker fica fora do deploy normal quando a matriz de impacto não o altera. Quando
  impactado, ele usa o mesmo target imutável e é selecionado depois de API e frontend.

## Sequência de promoção

1. Validar o pacote fora da VPS e transferir somente o artefato imutável e hashes.
2. Extrair em raiz nova e comprovar igualdade integral antes da seleção.
3. Adquirir o lock global e capturar dump PM2 e definições completas de retorno em
   arquivos privados `0600`.
4. Criar symlinks temporários e promovê-los por rename atômico.
5. Selecionar primeiro a API. Exigir três amostras estáveis, identidade, CWD físico
   da release, entrypoint/hash, Node, socket 3001 e health local/público.
6. Selecionar o frontend em `fork_mode`. Exigir três amostras estáveis, BUILD_ID,
   socket 3000, Login, Inbox, CRM e asset `_next`.
7. Confirmar o worker inalterado ou, quando impactado, selecioná-lo na mesma release e
   provar identidade e estabilidade. Executar somente smoke GET/read-only. Aceite
   autenticado tenant-scoped é gate humano separado quando não houver sessão
   automatizável autorizada.
8. Executar `pm2 save` exatamente uma vez, somente depois dos gates e do aceite
   aplicável. Conferir dump regular, modo real `0600` e SHA-256.
9. Criar o marker `DEPLOYED` apenas depois da validação do dump.

### Readiness depois da seleção PM2

`online` no PM2 comprova que o processo foi iniciado; não comprova que a aplicação
já abriu seu socket. Depois de cada `pm2 start`, o caminho canônico executa
`scripts/pm2-definition-control.py wait-readiness` com prazo monotônico de 30
segundos, polling de no máximo 500 ms e três amostras consecutivas estáveis.

Cada amostra vincula PID, start ticks, identidade imutável da release, symlink
`/opt/re7online/current/<componente>`, listener IPv4 ou IPv6 e cadeia de propriedade
do socket. O proprietário precisa ser o PID PM2 (`DIRECT`) ou descendente contínuo
dele (`DESCENDANT`); daemon/ancestral, listener estrangeiro e múltiplos listeners
são negativas nominais. Mudança de PID reinicia a contagem de estabilidade dentro
do mesmo prazo. Ausência temporária do listener apenas continua o polling.

Health local e público são consultados somente depois das três amostras de socket.
O prazo expirado produz `READINESS_TIMEOUT:<component>:<port>` e obriga o retorno
pelas definições autenticadas, sem `pm2 save`, marker `DEPLOYED` ou segunda tentativa.
Os tempos monotônicos, total de amostras e resets de estabilidade são persistidos
sem ambiente ou segredos. API e frontend usam prazo de 30 segundos.

Forma canônica, com caminhos privados concretos definidos pela janela:

```bash
python3 scripts/pm2-definition-control.py wait-readiness \
  --request <request-privada-0600> \
  --source-artifact <fonte-privada-0600> \
  --source-sha256 <sha-autenticado-da-fonte> \
  --definition <definicao-privada-0600> \
  --pm2 <binario-pm2-validado> \
  --stable-path /opt/re7online/current/<componente> \
  --release-root /opt/re7online/releases/<release>/<runtime> \
  --port <porta> --local-health <url-local> --public-health <url-publica> \
  --deadline-seconds 30 --poll-seconds 0.5 \
  --report <relatorio-privado-novo-0600>
```

O comando autentica novamente request, fonte e definição antes de observar o
runtime. O relatório é exclusivo e não pode ser sobrescrito ou reutilizado.

## Definições PM2

**Metadados de introspecção do PM2 nunca são uma definição executável.** Saídas de
`jlist`, dumps, `pm2_env`, `pm2_env.env` e `/proc/<pid>/environ` servem somente para
observar o estado. Elas não podem ser espalhadas em um descritor de aplicação.

Toda definição nova usa o contrato versionado de
[`scripts/pm2-definition-control.py`](../../scripts/pm2-definition-control.py):

- `name`, `script`, `args`, `cwd`, `interpreter`, `exec_mode`, `instances`,
  `namespace`, políticas de restart/ready, `node_args` e logs são estrutura
  explícita;
- a request escolhe somente um subconjunto da allowlist por componente versionada
  no repositório; estrutura e valores vêm do artefato-fonte privado canônico e nunca
  entram em relatório ou stdout;
- a allowlist separa `common`, `candidate` e `rollbackCompatibility` por componente.
  Compatibilidade de retorno não autoriza uso no candidato nem em releases futuras;
  inventário sanitizado dos nomes presentes nas duas fontes é gate obrigatório antes
  de alterar a allowlist;
- chaves estruturais, internas `pm_*`, `PM2_HOME` e `NODE_APP_INSTANCE` são negadas
  no namespace de ambiente após normalização segura de nome;
- o SHA-256 dos bytes de cada artefato-fonte é confrontado com um hash autenticado
  externamente. O digest da configuração não é autenticação da fonte;
- candidato e retorno são construídos separadamente e `validate-pair` exige papéis,
  requests, arquivos-fonte, proveniências e identidades imutáveis de release
  criptograficamente distintos. A definição PM2 pode ser idêntica entre os papéis
  quando usa `/opt/re7online/current/<componente>`; a seleção da release é provada
  pelo manifesto, hash da árvore, BUILD_ID ou hash do entrypoint e destino resolvido
  do symlink. O retorno parte da última fonte autenticada e comprovada, nunca do
  candidato nem de introspecção;
- antes da janela, ambos precisam iniciar em `PM2_HOME` isolado e portas alternativas.
  A prova compara o arquivo pretendido, o descritor carregado, o processo real,
  socket/health, BUILD_ID, serialização e restauração do retorno. A prova mantém
  `pm_cwd`/`pm_exec_path` lexicais sob `/current`, valida `realpath(__filename)` e
  `/proc/<pid>/cwd` dentro da release esperada e trata `/proc/<pid>/exe` somente como
  identidade do interpretador;
- somente definições privadas regulares `0600`, criadas em destinos novos, podem ser
  consumidas.

Os logs possuem duas identidades: `out_file`/`error_file`/`merge_logs` pertencem à
definição canônica; `pm_out_log_path`/`pm_err_log_path` pertencem à identidade
runtime. Para PM2 `6.0.14`, com `merge_logs=false`, o sufixo final `.log` ou
`-<número>.log` vira `-<pm_id>.log`; sem `.log` e `/dev/null` não mudam. Com
`merge_logs=true`, o caminho efetivo deve ser idêntico ao configurado. Qualquer outra
alteração nega o gate.

Para o frontend, `fork_mode`, uma instância, launcher explícito e argumentos
estruturais `start -p <porta>` são obrigatórios. `env.args` é sempre uma colisão e
nega a preparação antes de qualquer processo. O scope `production` fixa a porta
`3000`; o scope `isolated-test` nega as portas produtivas `3000` e `3001`.

O socket é válido quando pertence ao PID PM2 ou a um descendente comprovado por
uma cadeia contínua de PPIDs. Um socket pertencente ao daemon PM2 não comprova a
identidade do frontend. Igualdade direta entre PID PM2 e socket também não pode ser
exigida quando o launcher comprovado cria descendente legítimo.

O registro estruturado representa essa prova com `socketOwnerRelation` (`DIRECT`
ou `DESCENDANT`) e `socketOwnerChain`, ordenada do proprietário do socket até o PID
do processo de aplicação registrado pelo PM2. A cadeia nunca termina no daemon PM2.

## Retorno

Antes do primeiro efeito, preservar as definições PM2 completas, incluindo cwd,
script, interpreter, argumentos, ambiente, controle/run frontend e políticas de
log. Em negativa:

1. restaurar as definições anteriores de frontend e API;
2. restaurar ou remover os symlinks conforme o snapshot inicial;
3. validar identidades, sockets, health e worker;
4. não executar `pm2 save` nem tentar novamente.

`ROLLED_BACK` só pode ser declarado depois da restauração comprovada. Falha em
qualquer comando de retorno mantém a execução em falha.

## Mecanismos obsoletos

Os itens abaixo são históricos e **não utilizáveis**:

- build de API ou frontend diretamente na VPS;
- checkout produtivo como runtime ou destino de build/cópia;
- `scripts/deploy-normal-release.sh` e seu fluxo de cópia para o runtime ativo;
- pipeline experimental da PR #190;
- frontend Next em `cluster_mode`;
- gate que exige socket diretamente no PID PM2 sem considerar launcher/descendência;
- observador ou executor de ativação temporário em `/tmp`, inclusive polling de
  socket com amostra única logo após `pm2 start`;
- Deploy V2, controles single-use e preparações de incidente como rota normal.

## Release produtiva observada em 22/10/2026

O registro estruturado vigente é
[`TEMPLATE_MEDIA_UX_HARDENING_2026-10-22_DEPLOYED.json`](releases/TEMPLATE_MEDIA_UX_HARDENING_2026-10-22_DEPLOYED.json).
O target `5c339b2eeda52e21249844fc8b71a351d4311f03` foi promovido como
`immutable-5c339b2e-20261022T125717Z` pelo control plane versionado
`90f04d8f2e47e0cd87c43bb8c26ff1cf33a1098d`. API e frontend foram selecionados nos
caminhos estáveis, o worker foi preservado, `wait-readiness` comprovou três amostras
estáveis antes dos health checks e houve um único `pm2 save`. Nenhuma migration ou
SQL foi executada. O resultado técnico é `DEPLOYED / PRODUCTION HEALTHY`.
Homologação funcional Meta e liberação comercial/operacional permanecem pendentes.
