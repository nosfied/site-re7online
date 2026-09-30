# Incidente 91230f88 — backport de atividade própria do worker

**LOCAL VALIDATED / NOT DEPLOYED. Publicação exclusivamente para revisão.**

Base mínima `bf5f1d7610ca3f8144faa6f7b7994598e4a4017b`, pré-requisito de cinco fontes `f06d49cb61fcf57b423603b93797acad4b797d33` e [backport 91230f88](../automation-worker-backport/README.md). Não usar o worker completo da API.

- [Patch incremental](worker-runtime-self-write.patch): quatro fontes; nenhuma dependência, schema, migration, configuração ou núcleo do worker alterado.
- [Manifesto](manifest.json): SHA256 de cada fonte antes/depois, lockfiles e dos 93 compilados. Quatro JS alterados: runtimeWriteFence, dualWriteStorage, webSessionInbound e webSessionOutboundService; nenhum JS acrescentado/removido.
- [Incidente, matriz de alcance, testes e retorno](../../saas/AUTOMATION_RUNTIME_SELF_WRITE_INCIDENT_2026-09-29.md).

## Receita reproduzível

1. Reproduzir o pré-requisito pela receita versionada de [persistência SECULT](../secult-worker-persistence/README.md), com seus lockfiles e insumo Prisma fixados.
2. Aplicar o patch completo 91230f88 da referência acima. Conferir os hashes `base` deste manifesto antes de continuar.
3. Em diretório isolado dessa árvore, executar `git apply --check /caminho/worker-runtime-self-write.patch` e `git apply /caminho/worker-runtime-self-write.patch`. Conferir hashes `candidate`. Aplicação e reconstrução independente das quatro fontes: PASS.
4. Reutilizar dependências/cliente Prisma da receita; não atualizar packages. No diretório `apps/whatsapp-web-worker`, executar `/caminho/node-v20.20.0-linux-x64/bin/node node_modules/typescript/bin/tsc -p tsconfig.json --noCheck`. Conferir os 93 hashes `compiledCandidate` do manifesto. Não chamar start/prestart, sessões, scheduler, provider ou migrate.
5. Validação: teste versionado `apps/whatsapp-agent/src/conversation/automationOwnActivity.test.ts` deste commit, sobre as fontes mínimas e sobre os compilados correspondentes. `INCIDENT_WORKER_MINIMAL=true` exclui somente o teste API/IA (não pertence ao worker). DB sintético local; URL de worker substituída por fetch simulado que recusa qualquer outro endpoint. Node20.20.0: 14 PASS, 1 skip explícito, tanto TS como JS; são os mesmos casos, não 28 distintos.

A execução JS transpila somente o harness de teste fora do artefato e resolve seus imports para `dist/whatsapp-agent/src`; não inicia index.js. O manifesto não contém esse harness, credenciais, auth, bundle privado ou dados de clientes.

## Tipagem e composição

Backend atual: `npm run build --prefix apps/whatsapp-agent` PASS, com tipagem. Worker: build existente `--noCheck` PASS **não comprova tipagem integral**. `tsc -p tsconfig.json --noEmit` na base mínima e no backport, mesma versão/dependências: 13 diagnósticos, saída integral idêntica, em testes de auth/advisory lock, tipos pg e logger do worker. Nenhum diagnóstico novo; não corrigidos incidentalmente.

API recebe também passagem explícita do token nos envios passivos de webhook/IA. Essa fonte não entra no worker mínimo. Frontend sem delta funcional ou novo build requerido. Artefatos mínimos e atuais continuam separados. Atualização produtiva requer revisão/janela; nenhum retorno, restart ou reparo de runtime foi realizado nesta publicação.
