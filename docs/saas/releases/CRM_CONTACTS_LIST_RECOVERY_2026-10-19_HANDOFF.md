# Handoff — CRM contacts list recovery — 19/10/2026

Status: `OFFHOST BUILT / LOCALLY VERIFIED / NOT STAGED / NOT DEPLOYED`.

Este registro descreve um candidato inerte. Ele não altera o estado produtivo
documentado em `CURRENT_STATE`, não autoriza staging ou promoção e não deve ser
usado como prova de observação atual da VPS.

## Autoridade e escopo

- branch: `review/campaign-recovery-20260926`;
- commit: `f5028de1e530666623dcc95519e744350671cb02`;
- parent: `ab7634eacfae02b165f532ede9774ac3985822b5`;
- CI de fonte: run `39267594391`, quatro jobs aprovados;
- relatório funcional: [`CRM_CONTACTS_LIST_RECOVERY_2026-10-19.md`](../CRM_CONTACTS_LIST_RECOVERY_2026-10-19.md);
- manifesto de fonte: [`CRM_CONTACTS_LIST_RECOVERY_2026-10-19.json`](CRM_CONTACTS_LIST_RECOVERY_2026-10-19.json);
- registro-base vivo: [`CRM_CSV_TERMINAL_REENTRY_2026-10-18_DEPLOYED.json`](CRM_CSV_TERMINAL_REENTRY_2026-10-18_DEPLOYED.json).

O delta não altera worker, dependências, lockfiles, Prisma, migrations, RBAC,
configuração de tenant ou credenciais. Testes e documentação são evidência e não
entram nos runtimes.

## Composição API

A base é o pacote API autenticado da composição ativa, ligado pelo registro-base
ao release CRM CSV UX:

- pacote-base SHA-256: `3cf17abb52004bb8a16d2ddd4703b5179ad0c9cb66c6e2433613a2f6be06b2c0`;
- manifesto-base SHA-256: `fca745ed42240ba23cecb5be5e5e2001dd4c9803251fe492fcbe65e03d701079`;
- entrypoint-base SHA-256: `304ef14eb3db321a4380af768534750ac0a6823438bdae6fb3cb265b5d11bff1`.

Somente três fontes foram transpiladas com Node `v20.20.0`, TypeScript `5.9.3`,
`tsconfig` resolvido na raiz da API e `reportDiagnostics: true`:

| Fonte | Output de runtime |
| --- | --- |
| `apps/whatsapp-agent/src/contacts/contactOperationalExclusion.ts` | `dist/contacts/contactOperationalExclusion.js` |
| `apps/whatsapp-agent/src/crm/crmContactsReadModel.ts` | `dist/crm/crmContactsReadModel.js` |
| `apps/whatsapp-agent/src/http/routes.ts` | `dist/http/routes.js` |

O comparador integral confirmou que não há outro delta de conteúdo. Os três
outputs e `dist/index.js` passaram em `node --check`; os imports relativos dos
outputs resolvem dentro da composição.

- pacote: `crm-contacts-list-recovery-api-f5028de1.tar`;
- pacote SHA-256: `93b6a60e47118e6b63c1c858128fb903c404a32914d46ae5475ea6f2aff3f2d9`;
- manifesto: [`CRM_CONTACTS_LIST_RECOVERY_2026-10-19_API.json`](CRM_CONTACTS_LIST_RECOVERY_2026-10-19_API.json);
- manifesto SHA-256: `757fbecc9d4d01395b78c63c3324798efcdcef0527de2114d4a813f0dfaf748d`;
- índice integral: 505 entradas, SHA-256
  `44b8d57cdf4118ab42ec45b634ce5ce9cdac6bb089a8dd2ae7d11e95d94040a9`;
- tar reprodutível e extração independente com igualdade integral: `PASS`.

## Composição frontend

A árvore completa de fonte veio do commit candidato. A árvore de dependências foi
copiada fisicamente para dentro da raiz de build e comparada às 24.164 entradas do
inventário autenticado da última release. Não houve `npm install`, `npm ci`,
resolução de versão ou symlink externo.

- Node `v20.20.0`, npm `10.8.2`, arquitetura `x86_64`, glibc `2.39`;
- lockfile SHA-256: `add66bbb579b4c2424746ccd26b7a41ec24faecf77d324447b9f8b463c73726a`;
- inventário de dependências SHA-256:
  `f25489e9b874b60592a32e16d6e6048aa78348bb5c662159c5f9598423da4844`;
- configuração pública de build reaproveitada por bytes autenticados; somente os
  nomes dos campos entram no manifesto;
- `next build`: compilação, TypeScript e 50 rotas `PASS`;
- BUILD_ID: `bt9-BI1dCQD7_gj8ktOvz`.

As fontes funcionais que diferem da release viva são:

- `src/app/app/crm/page.tsx`;
- `src/lib/appClientApi.ts`;
- `src/lib/crmContactsInitialLoad.ts`.

O pacote contém somente `.next` após remoção de cache. Arquivos `.test.ts`, fontes,
materiais privados e symlinks externos não estão no runtime.

- pacote: `crm-contacts-list-recovery-frontend-f5028de1.tar.gz`;
- pacote SHA-256: `1fed8e3b70b103920d0216dba2686d5baf7053e4391fefde571a147ba3b16a75`;
- manifesto: [`CRM_CONTACTS_LIST_RECOVERY_2026-10-19_FRONTEND.json`](CRM_CONTACTS_LIST_RECOVERY_2026-10-19_FRONTEND.json);
- manifesto SHA-256: `70c36c6b65815cb7d5220cca8c280b1cfca5630e3ce9a8529ecc8ce550972cdd`;
- índice integral: 1.925 entradas, SHA-256
  `a979d6001b42519ccad25913680d51fd5ffeb8871c866230e94aa760fac5eb7e`;
- tar reprodutível, modos canônicos e extração independente integral: `PASS`.

## Validação e negativas locais

O build reutiliza as provas do CI `39267594391`. Os testes locais sem banco
confirmaram 36 casos focados. O arquivo de contrato que exige PostgreSQL não foi
reexecutado com credencial improvisada: a tentativa sem `DATABASE_URL` não alcançou
os casos e o job `csv-critical` aprovado continua sendo a prova limpa desse escopo.

Duas negativas locais foram preservadas fora do Git:

1. a primeira comparação do inventário considerou a ordem das linhas; a comparação
   por chave mostrou 24.164 entradas idênticas, sem ausentes, extras ou divergências;
2. o sandbox negou o socket IPC interno do Turbopack. A retomada fora dessa restrição,
   com os mesmos bytes e comando, aprovou o build. A API já aprovada foi reutilizada
   por hash e não recompilada.

Nenhuma dessas negativas produziu staging ou efeito produtivo.

## Plano de promoção futura

Uma autorização futura deve continuar no estado `STAGED_INERT`, nunca diretamente
em seleção:

1. confirmar que branch, commit, pacotes, manifests e índices ainda possuem os hashes
   deste handoff;
2. fazer preflight somente leitura de saúde, identidades, dump vigente, retorno
   pós-OBS-2 e espaço; qualquer deriva nega antes da transferência;
3. transferir somente os dois pacotes, dois manifests e dois índices para `incoming`
   de uma raiz VPS exclusiva;
4. extrair em destinos inexistentes com `tarfile.data_filter`, processo single-thread
   e `umask 0022`; comparar integralmente antes de acrescentar suportes autenticados;
5. montar a API sobre seus vínculos já autorizados e o frontend com suporte,
   `public`, dependências e controle imutável, sem sobrescrever caminho existente;
6. preparar definições candidata e de retorno a partir das definições vivas por
   allowlist. A API muda somente `cwd`/entrypoint; o frontend muda somente
   `cwd`, controle/run e nonce necessários;
7. persistir `PRE_SELECTION_SNAPSHOT` e retorno timestampado antes de qualquer
   `pm2 delete`;
8. selecionar e verificar API com três amostras, identidade, socket `3001`, health
   local/público e relatório sincronizado;
9. fazer somente os GETs autorizados; nenhum POST, replay, SQL ou migration;
10. selecionar e verificar frontend com três amostras, BUILD_ID, login, Inbox, CRM,
    assets e ausência de POST de importação;
11. confirmar worker intocado e executar `pm2 save` uma vez somente após todos os
    gates aplicáveis.

## Matriz de retorno compatível com pós-OBS-2

| Ponto | Ação restrita | Identidade exigida antes/depois |
| --- | --- | --- |
| Antes da seleção | negar; nenhum rollback | dump e retorno pós-OBS-2 ainda coincidem com `CURRENT_STATE`; OBS-1 intocada |
| API selecionada e gate negativo | remover somente API candidata e iniciar definição API de retorno capturada da configuração vigente pós-OBS-2 | entrypoint ativo anterior, socket `3001`, três amostras e health; frontend/worker preservados |
| Frontend selecionado e gate negativo | retornar somente frontend; por ser uma release coordenada, retornar também API pela definição compatível já preparada | BUILD_ID anterior `2nrVvTyK7pcyD_oMa_fOv`, API anterior saudável, worker preservado |
| Falha ou resposta perdida no retorno | parar, preservar relatório e diagnosticar; sem repetição automática | nenhum `pm2 save`, nenhum `resurrect` global e nenhuma definição anterior à OBS-2 executável |
| Release integral aprovada | salvar PM2 exatamente uma vez e criar novo retorno timestampado | novo dump `0600`, retorno anterior pós-OBS-2 preservado até revisão |

O retorno pré-OBS-2 classificado como `NON_EXECUTABLE_EXPOSED_SECRET` não é opção.
A preparação e eventual rotação OBS-1 permanecem fora desta release.

## Limites

- VPS acessada nesta preparação: `não`;
- staging: `não`;
- produção, PM2, Nginx, banco, ambientes e runtimes alterados: `não`;
- POST CSV, importação, retry, SQL ou migration: `zero`;
- binários publicados no Git: `não`.

O resumo estruturado está em
[`CRM_CONTACTS_LIST_RECOVERY_2026-10-19_CANDIDATE.json`](CRM_CONTACTS_LIST_RECOVERY_2026-10-19_CANDIDATE.json).
