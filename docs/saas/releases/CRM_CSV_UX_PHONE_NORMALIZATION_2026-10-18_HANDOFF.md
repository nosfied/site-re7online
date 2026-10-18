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

## Correção da raiz de dependências frontend após a negativa Turbopack

A segunda tentativa off-host de 18/10 concluiu o pacote API e parou no primeiro
erro do frontend. O `node_modules` era um symlink para fora da árvore
materializada; o Turbopack negou porque o destino real escapava da raiz do
filesystem do build. Isso é falha da composição local, não do código da página.

Na retomada:

1. preservar integralmente a raiz `-r2`, o pacote API
   `crm-csv-ux-api-36dacbc8-r2.tar` e seu manifesto;
2. antes de reutilizar o pacote API, reconferir:
   - pacote SHA-256
     `3cf17abb52004bb8a16d2ddd4703b5179ad0c9cb66c6e2433613a2f6be06b2c0`;
   - manifesto SHA-256
     `fca745ed42240ba23cecb5be5e5e2001dd4c9803251fe492fcbe65e03d701079`;
   - índice integral e extração independente já produzidos;
3. criar uma nova raiz frontend exclusiva `-r3`; não reconstruir a API;
4. materializar a árvore de dependências autenticada como diretório físico
   `<frontendRoot>/node_modules`, usando cópia de preservação
   (`cp -a --reflink=auto` quando suportado, com fallback para `cp -a`);
   é proibido usar symlink externo, `npm install`, `npm ci`, atualização ou
   resolução de novas versões;
5. antes do build, comparar fonte e cópia por inventário determinístico:
   caminhos relativos, tipo, tamanho e SHA-256 de cada arquivo, além do texto de
   destino de cada symlink. Os conjuntos e valores devem ser idênticos;
6. negar se qualquer symlink da cópia resolver para fora de
   `<frontendRoot>/node_modules`, exceto vínculos internos expressamente
   presentes e autenticados na origem;
7. reconferir `package.json`, `package-lock.json`, Node `v20.20.0`, npm
   `10.8.2`, arquitetura e glibc; remover somente uma eventual `.next` da
   nova raiz ainda inerte;
8. executar, a partir de `frontendRoot`, o binário local
   `./node_modules/.bin/next build`, com heap de 4096 MiB e telemetria
   desabilitada;
9. autenticar BUILD_ID, índice integral e extração independente do pacote
   frontend. Empacotar somente o runtime requerido pelo mecanismo produtivo,
   nunca a árvore fonte ou a cópia de build inteira.

Não elevar a raiz permitida do Turbopack, não desativar a verificação e não
contornar o erro por configuração. Como nada chegou à VPS, não há staging nem
rollback a desfazer. O preflight de frescor continua necessário somente antes
da futura seleção PM2.

## Política canônica de modos após a negativa da extração frontend

A terceira tentativa off-host concluiu o build frontend, inclusive TypeScript e
50 páginas, com BUILD_ID `Ebyc7UWY8nwjFyA5Zjyfj`. O pacote continha os mesmos
1.642 caminhos, bytes, tamanhos e hashes, mas o filtro seguro `tarfile.data_filter`
converteu arquivos de `0664` para `0644`. O modo `0664` era efeito do umask
do builder, não requisito do runtime.

Não repetir o build. Na retomada:

1. preservar integralmente `-r3`, seu `.next`, BUILD_ID e o inventário de
   dependências
   `f25489e9b874b60592a32e16d6e6048aa78348bb5c662159c5f9598423da4844`;
2. reconferir o BUILD_ID e o índice de caminhos/bytes/hashes do `.next` aprovado;
3. criar uma raiz exclusiva `-r4` somente para empacotamento e copiar para ela o
   runtime aprovado; não recompilar API ou frontend;
4. na cópia de empacotamento, aplicar a política explícita:
   - diretórios: `0755`;
   - arquivos regulares: `0644`;
   - symlinks: preservar exatamente o texto do destino, sem dereferenciar;
   - negar se aparecer arquivo executável ou tipo diferente não previsto;
5. gerar o índice integral canônico depois da normalização, registrando caminho,
   tipo, tamanho, SHA-256 e modo; para symlinks, registrar o destino literal;
6. criar o tar em ordem lexicográfica e normalizar seus metadados: `uid=0`,
   `gid=0`, nomes de usuário/grupo vazios, `mtime` inteiro derivado do timestamp
   do commit candidato e sem cabeçalhos PAX incidentais;
7. extrair independentemente com o mesmo filtro seguro `data`. A árvore extraída
   deve coincidir integralmente com o índice canônico, inclusive modos
   `0644/0755`, tipos e destinos de symlink;
8. emitir o manifesto final somente depois dessa igualdade. A propriedade
   `deploy:deploy` será aplicada e validada na futura materialização inerte na
   VPS; ela não deve depender de proprietário local nem do uid/gid do tar.

É proibido apenas relaxar a comparação para aceitar a divergência, extrair sem
filtro seguro ou alterar o `.next` original de `-r3`. Como a VPS não foi
acessada, não há staging nem rollback a desfazer. O preflight de frescor continua
adiado até imediatamente antes da seleção PM2.

## Extração determinística de diretórios após a negativa de umask

A quarta tentativa não refez os builds e produziu um tar canônico correto, mas a
extração independente criou `.next` como `0775`. Em Python, o
`tarfile.data_filter` ignora deliberadamente o modo do membro para diretórios;
o modo efetivo passa a ser `0777 & umask`. O builder estava com umask `0002`.

Não recriar o tar. Na retomada:

1. preservar `-r4` e reconferir:
   - tar SHA-256
     `e9f6644ee5d08cacd0e1bd4d1cee4b0c068341a22f68038ec045e7962860c341`;
   - índice SHA-256
     `084e3391dfbe79780e7414ae9058b1640c9c59ea006f1f4f8aa7b81a52d8e479`;
   - 1.642 arquivos, BUILD_ID `Ebyc7UWY8nwjFyA5Zjyfj` e metadados canônicos
     dos membros do tar;
2. criar raiz exclusiva `-r5` somente para a extração independente e o
   manifesto final;
3. no processo single-thread que chama `extractall`, definir explicitamente
   `old_umask = os.umask(0o022)`, extrair com `filter="data"` e restaurar
   `old_umask` em bloco `finally`;
4. não substituir o filtro seguro, não aplicar chmod corretivo depois da
   extração e não relaxar a comparação;
5. exigir novamente igualdade integral com o índice: caminhos, tipos, bytes,
   tamanhos, SHA-256, modos `0755/0644` e destinos literais de symlink;
6. emitir o manifesto frontend somente após PASS, referenciando exatamente o
   tar de SHA-256 `e9f664...0c341`.

O mesmo helper de extração com umask explícito `0022` deve ser usado no futuro
staging inerte da VPS, seguido de validação integral e aplicação/verificação de
propriedade `deploy:deploy`. Isso torna o resultado independente do umask do
host sem enfraquecer `data_filter`.

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
