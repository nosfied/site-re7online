# Handoff — CRM CSV UX e normalização — 18/10/2026

Status: `MANIFESTED / SOURCE CI VERIFIED / NOT BUILT / NOT STAGED / NOT DEPLOYED / IMPORT NOT RUN`.

## Autoridade e base

- candidato funcional: `36dacbc8eb1e4163d6907d92f7decae4efdfc3a7`;
- manifesto: `docs/saas/releases/CRM_CSV_UX_PHONE_NORMALIZATION_2026-10-18.json`;
- base produtiva: release CRM/CSV registrado em
  `docs/saas/releases/CRM_CSV_RECOVERY_2026-10-17_DEPLOYED.json`;
- ordem obrigatória: API, validação somente leitura, frontend, smoke final;
- retorno: preservar o dump anterior e criar retorno timestampado antes da seleção;
- nenhuma árvore produtiva deve ser inferida do checkout: os runtimes vivos são composições.

## Delta autorizado

API:

- `apps/whatsapp-agent/src/crm/crmContactUpsert.ts`;
- `apps/whatsapp-agent/src/crm/crmWhatsappIdentity.ts`.

Frontend:

- `src/app/app/crm/page.tsx`.

Testes do manifesto são evidência e não entram nos pacotes de runtime.

Fora do escopo: worker, Prisma, SQL, migrations, configuração de tenant, RBAC,
credenciais, replay, importação e qualquer POST de confirmação.

## Correção do invocador TypeScript após a negativa TS6059

A primeira tentativa off-host de 18/10 foi interrompida antes do primeiro output:
o invocador entregou a `transpileModule` um `fileName` relativo à raiz do
monorepo, embora `rootDir: src` seja relativo a `apps/whatsapp-agent`. Isso é
falha do invocador de empacotamento, não do candidato nem do TypeScript da API.

Na retomada, a resolução é obrigatoriamente esta:

1. definir `apiRoot` como o caminho absoluto da árvore
   `apps/whatsapp-agent` materializada no commit candidato;
2. ler `apiRoot/tsconfig.json` e chamar
   `ts.parseJsonConfigFileContent(config, ts.sys, apiRoot)`, para que
   `rootDir` e `outDir` sejam resolvidos na base correta;
3. fornecer a `transpileModule` o `fileName` absoluto
   `apiRoot/src/crm/<módulo>.ts` (ou `src/crm/<módulo>.ts` somente se o
   processo estiver explicitamente em `apiRoot`);
4. manter `reportDiagnostics: true` e negar antes de escrever qualquer output
   se houver diagnóstico de erro;
5. mapear explicitamente somente:
   - `src/crm/crmContactUpsert.ts` → `dist/crm/crmContactUpsert.js`;
   - `src/crm/crmWhatsappIdentity.ts` → `dist/crm/crmWhatsappIdentity.js`.

Não remover `rootDir`, não filtrar o TS6059 e não alterar opções semânticas para
fazer o gate passar. A raiz parcial
`/tmp/crm-csv-ux-phone-normalization-36dacbc8-20261018T115500Z` permanece como
evidência. Criar um novo destino local exclusivo para a retomada; fontes e
toolchain já autenticados podem ser reutilizados somente após reconferir seus
hashes. Como produção não foi tocada, não há rollback a executar. Antes de
qualquer futura seleção PM2, refazer apenas o preflight de frescor.

## Sequência executável

1. Fazer preflight somente leitura: saúde pública/local, identidade dos três processos,
   dump vigente, espaço em disco e memória. Não confundir `MemAvailable` com espaço livre.
2. Autenticar o commit e cada blob do manifesto antes de materializar fontes.
3. Usar a composição produtiva registrada como base. Não substituir por um checkout
   integral nem acrescentar fontes fora do manifesto.
4. Construir fora da VPS, com Node `v20.20.0`, npm `10.8.2`, arquitetura/glibc
   compatíveis e heap explícito de 4096 MiB:
   - API: transpilar somente os dois módulos autorizados para seus destinos em `dist/crm`;
   - frontend: sobrepor somente `src/app/app/crm/page.tsx` na base fonte autenticada
     do frontend implantado e executar o build real;
   - validar sintaxe, índices integrais e extrações independentes.
5. Transferir pacotes e manifests para uma raiz nova e exclusiva. Conferir SHA-256
   antes e depois; nenhum build Node deve ser executado na VPS.
6. Completar os candidatos inertes com os mesmos vínculos de dados, dependências,
   suporte e permissões dos runtimes vivos, sem alterar os ativos.
7. Selecionar somente a API. O verificador deve persistir cada predicado antes da decisão
   e colher três amostras da mesma identidade: PM2, PID, start ticks, cwd, executable,
   entrypoint, SHA do entrypoint, reinícios, `server.started` e health.
8. Executar apenas GETs de isolamento negativo, sem registrar tokens, tenant ou UUIDs.
   Nenhum POST, replay, importação, SQL ou migration.
9. Selecionar o frontend por novo controle imutável e novo `RE7_FRONT_RUN`; conferir
   cwd, launcher, controle, BUILD_ID, assets, login, Inbox e CRM. Confirmar que abrir ou
   reentrar na prévia não dispara POST automático.
10. Revalidar API, frontend e worker; executar `pm2 save` exatamente uma vez somente
    após todos os gates passarem. Em qualquer negativa explícita, retornar somente o
    componente alterado e interromper.
11. Publicar registro sanitizado da implantação e atualizar `CURRENT_STATE.md/.json`.
    Até isso ocorrer, a classificação continua `NOT DEPLOYED`.

## Validação funcional após a promoção

No tenant Demo Converta, gerar uma nova prévia do arquivo original, sem confirmar a
importação. Conferir:

- indicador de carregamento na entrada, filtros e paginação;
- rolagem vertical e cabeçalho fixo nas duas listas de ocorrências;
- mapeamento sem sobreposição;
- aviso de amostra quando houver truncamento;
- as 37 ocorrências antes classificadas por formato devem deixar de falhar somente
  pelo zero de tronco nacional;
- as 13 duplicidades continuam duplicidades;
- nenhum resultado do tenant Syer é usado como autoridade para o tenant Demo.

Os totais finais não podem ser deduzidos do relatório de erros, pois ele contém apenas
a amostra recebida. A confirmação da importação permanece uma decisão humana separada.
