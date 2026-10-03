# af26 V4 — instalação restrita e próxima janela (comandos para revisão)

**PREPARED FOR WINDOW / NOT DEPLOYED (preflight de 03/10 UTC).** [Resultado sanitizado](V4_PREFLIGHT_RESULT_2026-10-03.md). O observador e a regra sudo literal foram instalados e atestados; os quatro modos foram vinculados a configurações, auth, backup e restore novos, com todos os gates de execução falsos. Não houve contenção, parada, troca ou ativação. O diretório `/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/v4-20261003` preserva os 17 scripts estáticos por modo; cada manifesto agora contém 23 entradas com os insumos privados vinculados. Nenhum certificado, nonce, start-intent ou prova da janela anterior foi copiado. Os três candidatos isolados mantêm os hashes API 425/425 `6e92592b41ba0a67565c3c2f62f332807a297e8f52fb884db569bbadcbead611`; frontend 1645/1645 `76e0f9f4723ec74fb4d6c5b76551b5f8517739b2ed2d82127612d7a9e7a8392d`; worker mínimo 99/99 `7d57c73c7769948fc5123479827358e8b4759e872bb7e33358fad06724670d60`. Nada foi copiado para o checkout ativo. A janela continua separada e exige reconfirmação imediata de estado e exclusividade.

O `OWNER-STEPS.txt` privado V4 foi preparado no mesmo root (SHA-256 `694388df7dbf0c827f0b922fca9c2624232516b24ceea70558821bde7d84e549`) com os quatro modos e o novo caminho. Ele substitui somente as instruções antigas de pareamento direto, preservando o protocolo de provas de cinco minutos, renovação e retorno. Não contém prova consumida e permanece fora do Git.

## Proveniência que deve fechar antes da instalação

Leitura remota: Engine `29.2.1`, `/usr/bin/docker-proxy` do pacote `docker-ce 5:29.2.1-1~ubuntu.24.04~noble`, origem APT configurada `download.docker.com/linux/ubuntu noble/stable`; `dpkg -V docker-ce` não apontou divergência; arquivo em disco SHA-256 `8cd3b929d0cbae223b017134f7e8a09a7da49089fe24ffc051b8c54f7718d7e1`. O [código no tag Moby docker-v29.2.1](https://github.com/moby/moby/blob/docker-v29.2.1/cmd/docker-proxy/tcp_proxy_linux.go) faz um `Accept` e um `DialTCP` por `clientLoop`, sem multiplexação nesse caminho. Na instalação, o helper root confirmou que o executável **vivo** tem esse mesmo hash, com PID+start ticks e argumentos estáveis entre leituras. O binding privado V4 foi gerado a partir dessa observação; identidade ou topologia alterada deve negar na janela.

## Instalação restrita executada em 03/10 — receita preservada para auditoria

Pré-condições: execução única confirmada; diretórios de destino/arquivo/sudoers ausentes (leitura de 03/10 confirmou); patch e manifesto V4 revisados; novo diretório estático íntegro. Se algum alvo já existir, parar e preservar o estado anterior. Os comandos abaixo são os únicos que exigem senha; não acrescentam privilégio geral ao usuário `deploy`.

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/v4-20261003
H=/usr/local/libexec/re7/db-owner-set-observer.py
R=/etc/sudoers.d/re7-db-owner-observer
test ! -e /usr/local/libexec && test ! -L /usr/local/libexec
test ! -e "$H" && test ! -L "$H" && test ! -e "$R" && test ! -L "$R"
for m in switch return return-partial return-front-missing; do
  (cd "$P/$m" && sha256sum -c scripts.sha256)
done
test "$(sha256sum "$P/switch/db_owner_set_observer.py" | cut -d' ' -f1)" = ddbe29926e277b2485079b56ebfb0d07c1f077c6bb5f99a8ce911e43a5ca7e0a
test "$(docker version --format '{{.Server.Version}}')" = 29.2.1
dpkg-query -S /usr/bin/docker-proxy
dpkg -V docker-ce
test "$(sha256sum /usr/bin/docker-proxy | cut -d' ' -f1)" = 8cd3b929d0cbae223b017134f7e8a09a7da49089fe24ffc051b8c54f7718d7e1
/usr/bin/python3 -I -S -c 'import hashlib,json,os,pathlib,socket,struct'
sudo install -d -o root -g root -m 0755 /usr/local/libexec
sudo install -d -o root -g root -m 0755 /usr/local/libexec/re7
sudo install -o root -g root -m 0644 "$P/switch/db_owner_set_observer.py" "$H"
test "$(sha256sum "$H" | cut -d' ' -f1)" = ddbe29926e277b2485079b56ebfb0d07c1f077c6bb5f99a8ce911e43a5ca7e0a
sudo namei -l "$H"
```

Antes da regra sudo, verificar **cada componente** de `/` até `$H` com `lstat`: proprietário root, sem escrita por grupo/outros, diretórios reais e arquivo final regular, sem symlink. O próprio `ops.py` aplica essa cadeia completa em toda leitura. Conferir também que o helper só importa módulos da biblioteca padrão; `-I -S` ignora caminho de script/ambiente e `site`. Se `namei` ou `lstat` divergir, não instalar a regra:

```bash
sudo /usr/bin/python3 -I -S - "$H" <<'PY'
import ast, pathlib, stat, sys
p = pathlib.Path(sys.argv[1])
for node in (p, *p.parents):
    s = node.lstat()
    valid_type = stat.S_ISREG(s.st_mode) if node == p else stat.S_ISDIR(s.st_mode)
    if s.st_uid != 0 or s.st_mode & 0o022 or not valid_type:
        raise SystemExit('helper_path_denied')
tree = ast.parse(p.read_text())
allowed = {'hashlib', 'json', 'os', 'socket', 'struct', 'sys'}
imports = {alias.name for n in ast.walk(tree) if isinstance(n, ast.Import)
           for alias in n.names}
froms = [(n.module, [(a.name, a.asname) for a in n.names], n.level)
         for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)]
if imports != allowed or froms != [('pathlib', [('Path', None)], 0)]:
    raise SystemExit('helper_imports_denied')
print('helper_path_and_imports_pass')
PY
```

```bash
set -euo pipefail
P=/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/v4-20261003
H=/usr/local/libexec/re7/db-owner-set-observer.py
R=/etc/sudoers.d/re7-db-owner-observer
S="$P/window/re7-db-owner-observer.sudoers.proposed"
test ! -e "$S" && test ! -L "$S"
printf '%s\n' 'deploy ALL=(root) NOPASSWD: /usr/bin/python3 -I -S /usr/local/libexec/re7/db-owner-set-observer.py' > "$S"
chmod 600 "$S"
sudo /usr/sbin/visudo -cf "$S"
sudo install -o root -g root -m 0440 "$S" "$R"
sudo cmp "$S" "$R"
sudo /usr/sbin/visudo -c
sudo -n /usr/bin/python3 -I -S "$H" > "$P/window/proxy-observation.private.json"
chmod 600 "$P/window/proxy-observation.private.json"
```

A regra contém um único comando absoluto e argumentos literais, sem wildcard, shell, `SETENV` ou `sudo` amplo. A leitura JSON privada deve mostrar exatamente um proxy de `127.0.0.1:5432`, hash **vivo** igual ao arquivo verificado, PID+ticks estáveis, argumentos do destino Docker esperado e FDs legíveis. Conferir também Docker container ID/IP/bridge/publicação e rejeitar NAT, segundo proxy, IPv6 de DB ou origem ambígua. Somente então gerar binding privado **novo** e sua hash/nonce; não reaproveitar binding da janela anterior. `proxy-observation.private.json` permanece fora do Git.

## Preflight e troca — responsabilidades e gates

1. **Codex, leitura/arquivos:** conferir cada `scripts.sha256`, manifesto V4, candidatos, configuração Prisma, caminhos de API/frontend/worker mínimo e estado efetivo de PM2/saved/fallback/boot/cron. Criar configurações privadas e manifests **frescos** dentro do novo root, vinculados aos três candidatos e à auth atual; atualizar então cada `scripts.sha256` para incluir os hashes desses inputs privados e conferir tudo antes de habilitar qualquer gate. Capturar backup fresco e provar restore isolado. Manter `execution-gates.private.json` falso/ausente até conclusão. O novo root não é executável agora.
2. **Deifson, comandos privilegiados curtos:** instalar/helper e regra após revisão, fazer leitura fixa, depois somente na janela autorizada aplicar cron `.window`, controle de boot e fence. Codex fecha guarda com geração/motivo auditados e confirma drain de campanhas. Inbound/outbound/auth antigos não têm drain retroativo completo; o risco da primeira parada permanece decisão operacional, não PASS por timeout.
3. **Codex, janela única:** com barreira/supervisão comprovadas, executar `stop-pair.py` **uma vez**, verificar PIDs+start ticks, descendentes, sockets, backends e locks antigos ausentes. Antes de iniciar a API, exigir zero conexões externas e zero advisory locks. Iniciar API candidata, confirmar identidade/configuração real. Na renovação da prova e antes do start do worker, usar observador/prova de conjunto em duas amostras; cliente desconhecido, FD ilegível, identidade/nonce/proxy/contêiner drift, transiente ou advisory lock bloqueia `start-intent`. Iniciar **um** worker mínimo. Prosseguir no frontend pelo modo aplicável e validar atendimento/sessões/versões sem envios artificiais.
4. **Codex + Deifson, saída:** só com conjunto compatível validar health/DB, Inbox/CRM/auth, guard/scheduler e processos; salvar PM2/fallback, retirar fence e restaurar guarda, cron/boot ao estado anterior autorizado. Conferir tick natural e pendências incertas sem reenviar. Horizonte de escalonamento não autoriza kill.

O protocolo privado `OWNER-STEPS.txt` (hash acima) contém a sequência completa por papel. Seu núcleo executável, sempre **um action por vez** após o gate anterior, é:

```bash
P=/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/v4-20261003
M="$P/switch"   # retorno: "$P/return", "$P/return-partial" ou "$P/return-front-missing"
# Ordem de switch: contain -> stop-pair -> start:re7-whatsapp-agent
# -> start:re7-whatsapp-web-worker -> stop-front -> start:re7-admin-front -> unfence
# Deifson, somente depois que Codex confirmar o action A exato:
R=$(python3 "$M/delegated.py" request "$A" "$M")
NONCE=$(printf '%s' "$R" | python3 -c 'import json,sys;print(json.load(sys.stdin)["nonce"])')
sudo /usr/sbin/nft -j list table inet re7_campaign_transition |
  python3 "$M/delegated.py" record "$A" "$M" "$NONCE"
# Codex, só depois da prova fresca e das pré-condições do action:
python3 "$M/delegated.py" execute "$A" "$M"
```

`preflight`, `prepare-containment`, `verify-unfenced` e `restore-controls` usam a prova nft de tabela **ausente** conforme `OWNER-STEPS.txt`; nunca reutilizar o bloco de tabela presente para esses actions. `unfence` só gera permissão; Deifson retira a tabela nft em bloco separado após conjunto/saved/fallback validados. `open.cjs` usa CAS para restaurar admissões somente depois das verificações. Na renovação por expiração, nova requisição/nonce e nova leitura, com histórico intacto; não repetir start já marcado.

**Aborto antes da parada:** hash/proveniência/observador/binding, backup/restore, trabalho/lease incerto não reconciliado, outro executor/iniciador, fence/supervisão ou sessão sem preservação comprovada. Não começar contenção por conveniência. **Falha após a API:** manter guarda fechada, fence e boot/cron da janela; não iniciar worker sem prova. O modo `return-partial` também usa o helper. Restaurar a leitura restrita se falhou e renovar nonce após reconfirmação; se não for possível, manter worker parado e atendimento parcial/contido para decisão, sem bypass ou segundo proprietário. `return-front-missing` cobre ausência do frontend após API/worker. Não restaurar dump sobre dados novos, auth antigo ou reenviar resultado incerto.

## Remoção futura estrita

Somente **depois** de encerrar a janela e comprovar que nenhum `switch`, `return`, `return-partial` ou `return-front-missing` e nenhuma renovação pendente dependem do helper, Deifson pode remover os objetos introduzidos. Não remover em falha após API enquanto o retorno ainda depende dele. Como os quatro caminhos estavam ausentes em 03/10, os comandos abaixo são válidos apenas se a instalação tiver criado exatamente esses objetos e os hashes/modos ainda forem os registrados:

```bash
set -euo pipefail
H=/usr/local/libexec/re7/db-owner-set-observer.py
R=/etc/sudoers.d/re7-db-owner-observer
S=/opt/re7online/backups/converta-persistent/preparations/freeform-window-af26/v4-20261003/window/re7-db-owner-observer.sudoers.proposed
test "$(sha256sum "$H" | cut -d' ' -f1)" = ddbe29926e277b2485079b56ebfb0d07c1f077c6bb5f99a8ce911e43a5ca7e0a
sudo test -f "$R" && sudo test ! -L "$R"
sudo cmp "$S" "$R"
sudo rm -- "$R"
sudo /usr/sbin/visudo -c
sudo rm -- "$H"
sudo rmdir /usr/local/libexec/re7
sudo rmdir /usr/local/libexec
```

`rmdir` somente remove diretório vazio; qualquer arquivo alheio impede a remoção. O snapshot privado de leitura e o arquivo de regra proposto no novo root são evidências e não são apagados por esses comandos.
