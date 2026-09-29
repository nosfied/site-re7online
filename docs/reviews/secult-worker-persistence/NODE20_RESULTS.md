# Backport — execução isolada no Node20 produtivo

29/09/2026. **LOCAL VALIDATED para os caminhos abaixo / SECULT NOT DEPLOYED.**
Versão efetiva registrada no preflight privado: **Node v20.20.0**, Linux x64.
Nenhuma nova conexão produtiva foi necessária.

Runtime obtido de `https://nodejs.org/dist/v20.20.0/node-v20.20.0-linux-x64.tar.xz`;
SHA256 confrontado com SHASUMS256.txt oficial:
`4f48b52acf42130844a3a75e94da0e9629009d09e4101b2304895c24f3fbe609`.
Instalação apenas em diretório de evidência local, sem substituir Node do sistema.

## Artefato e dependências

Código compilado do pacote reconstruído em árvore limpa, base bf5f1d76 + cinco
fontes f06; manifesto dos 92 compilados preservado. Tar de código identificado por
`11f505a12ed40b60a471612253d27c85b956952826933417ca21e3251c3c4a93`.
Nenhum build adicional ou atualização de dependências nesta validação.

Dependências já instaladas pelos lockfiles: TypeScript5.9.3, Baileys7.0.0-rc13,
pg8.23.0; cliente Prisma gerado6.19.2 copiado pelo procedimento existente para o
wrapper worker6.19.3. Essa combinação foi exercitada, não substituída silenciosamente
por outra. O runtime produtivo inventariado usa @prisma/client6.19.3; não alegar
igualdade de todas as dependências instaladas apenas pelo sucesso do teste.

## Comandos executados

Os caminhos abaixo são relativos ao worktree. Logs/harnesses sintéticos permanecem
em evidência local, fora do Git. O runner `local-evidence/secult-node20-20260929/run.py`
executou, sequencialmente, estas quatro classes com ambiente reconstruído (sem .env
produtivo):

```bash
# NODE = local-evidence/secult-node20-20260929/node-v20.20.0-linux-x64/bin/node
# LOADER = caminho absoluto de secult-worker-package-20260929/source/
#          apps/whatsapp-agent/node_modules/tsx/dist/loader.mjs
# WORKER = local-evidence/secult-worker-package-20260929/source/
#          apps/whatsapp-web-worker/dist/whatsapp-web-worker/src
# MINIMAL = local-evidence/secult-worker-options-20260929/minimal/
#           apps/whatsapp-agent/src

"$NODE" local-evidence/secult-node20-20260929/load.mjs
"$NODE" --test "$WORKER/whatsappWebSessionWorker.test.js" \
  "$WORKER/web-session/baileysSocketFactory.test.js" \
  "$WORKER/web-session/baileysAuthState.test.js" \
  "$WORKER/web-session/dedicatedPgAdvisoryLock.test.js" \
  "$WORKER/web-session/sensitiveConsoleFilter.test.js"
"$NODE" --import "$LOADER" --test --test-concurrency=1 \
  "$MINIMAL/queue/assignmentPolicy.test.ts" \
  "$MINIMAL/web-session/hybridIdentity.test.ts" \
  "$MINIMAL/web-session/webSessionIdentity.test.ts"
"$NODE" --import "$LOADER" --test \
  local-evidence/secult-node20-20260929/concurrency.mjs
```

Ambiente: NODE_ENV=test, STORAGE_MODE=postgres, CONV_STATE_READ_SOURCE=postgres,
APP_AUTH_SECRET sintético, DATABASE_URL exclusivamente PostgreSQL local
`127.0.0.1:55432/re7_secult_20260928`. Asserts dos harnesses impedem outro destino.
PATH priorizou o runtime20 isolado. Nenhuma credencial produtiva foi carregada.

## Resultados

| Verificação | Resultado |
| --- | --- |
| Carregamento do grafo | 65 módulos compilados importados; grafo total66; entrypoint index excluído para não iniciar aplicação |
| Dependência real Baileys | Importada sem chamar factory de conexão ou abrir sessão |
| Prisma | Construído/desconectado sem conexão durante prova de carregamento; queries reais locais nos testes de persistência |
| Rede no carregamento | net.Socket.connect e fetch instrumentados para falhar; **zero tentativa** |
| Worker compilado, cinco arquivos de testes | **29/29 PASS**, exit0; sockets/provider/auth simulados |
| Distribuição/identidade do backport | **45/45 PASS**, exit0; mesmas fontes correspondentes ao backport, fixtures sintéticas |
| Concorrência do compilado reconstruído + setter SECULT real | **30/30 PASS**, exit0; revogação, campos independentes e contraste com escritor antigo |
| Total de testes | **104/104 PASS**, nenhum skip |

Durações observadas: worker0,412s, regressões3,468s, concorrência2,042s. Não são
estimativa de janela ou reconexão. Resultados/argumentos completos preservados em
results.json e logs locais. Testes anteriores sob Node22 permanecem históricos.

## Limites e conclusão

Fecha a lacuna de execução Node20 para os módulos e caminhos exercitados. Não valida
conexão Baileys real, pareamento, retorno de sessão produtiva, todos os transports,
shutdown ou ausência de perda. Entry point não iniciado; não houve provider call,
webhook produtivo, envio ou mutação de negócio. Fixtures locais foram limpas pelos
testes; evidências anteriores preservadas.

Não é aprovação de tipagem: build continua --noCheck; comparação estrita anterior
mantém 13 diagnósticos preexistentes. Não altera o banco nem seus schemas.
G1 fica para revisão do backport/configuração de release; G2 continua aberto para
paradas futuras e primeira interrupção antiga. A proposta de shutdown não foi
implementada. Campanhas/CRA aguardam validação funcional do owner.
