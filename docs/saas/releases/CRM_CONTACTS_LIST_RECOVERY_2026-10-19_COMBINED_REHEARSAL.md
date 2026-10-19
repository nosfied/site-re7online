# Ensaio combinado — CRM contacts list recovery

Status: `LOCAL/OFFHOST VERIFIED / NOT INSTALLED / PRODUCTION UNCHANGED`.

Este ensaio corrige somente a incompatibilidade mecânica observada entre a
seleção da API e o snapshot usado pelo verificador frontend. O predicado de
proteção de PID permanece inalterado. O snapshot frontend passa a nascer depois
do PASS autenticado da API e espera a identidade candidata emitida por esse
verificador.

## Resultado integral

Uma única fixture executa os dois percursos com um PM2 inerte:

- sucesso: `S0 → S1 → S2 → S3`;
- negativa frontend: `S0 → S1 → S2_DENIED → R`;
- resultado único: `END_TO_END_COMBINED_RELEASE_FIXTURE_PASS`;
- PM2 real, rede, `/proc`, root e produção: zero acessos;
- 19 predicados persistidos no percurso de sucesso;
- 20 predicados persistidos no percurso de negativa e retorno;
- a negativa nominal é sincronizada antes do primeiro efeito de rollback.

Em S0, a fixture fixa a API original, o frontend anterior supervisionado, o
worker e o dump seguro `a99667587ccee0ee884ed31aa304c714e276e86f6db86ba418238171508a2cf0`.
Em S1, somente a API muda de PID; sua saída autenticada alimenta o snapshot
frontend. Em S2, somente o frontend muda de PID e o launcher simulado produz o
journal. Em S3, o marker nasce depois do journal, a supervisão é verificada e o
save simulado ocorre por último.

O percurso negativo inicia do mesmo S0, promove a API, cria o snapshot pós-API,
seleciona o frontend e persiste uma negativa individualizada. O retorno usa o
controle anterior já supervisionado, restaura a API original, preserva o worker
e mantém o dump seguro. O controle cuja primeira execução produziu journal mas
não marker fica consumido e não pode ser reutilizado.

## Bindings reproduzíveis do laboratório

| Objeto | SHA-256 |
| --- | --- |
| Fixture | `619fbdc24ea338d3cf79a48298042d6e71ca4a4ec89c5836153881fe0950561c` |
| Resultado determinístico | `a520088f67b0039508f719531e49213ea3ca6c7a9d0be8ff37a06f29a3bfb67a` |
| Controle candidato v2 da fixture | `afb02ba32441072853e49c53697f2bbf5a175b36cb080b9f1f09d7b8b25ae571` |
| Binding candidato da fixture | `c895af0cb40f0490581e1304fb4094734b116597cd7cb546a74dc28d8da027b5f` |
| Snapshot frontend pós-API da fixture | `1e29caeb2cbaef5a607ba36bd8dbbcaae3b1430fcaf8a0afa96e966587e019cf` |
| Dump final simulado | `6add678de2f06de304e9194ba956c07c2dc05c006534d2731f6f251c5c19b012` |

Esses hashes provam o laboratório, não constituem autoridade produtiva. O
controle, nonce, snapshot e destinos da próxima janela são state-bound e devem
ser materializados uma única vez depois que S1 emitir a identidade autenticada.
A política root permanece byte-idêntica em
`10539fe3e013a9acdc64ebee0c27ddc94b29d8ef773201a1a0b64947776a0a3a`:
o tuple autorizado de release, entrypoint, hash e BUILD_ID não mudou. O novo
binding permanente liga o nonce somente depois do journal real aprovado.

A preparação privada off-host está em
`/tmp/crm-contacts-combined-release-f5028de1-20261019-r1`. O verificador API
current-bound tem SHA-256
`3ce469f2db79d43a08ed1cee2dcce88fba32d44139c31eb96b94b66d12e114e6`;
seu diff allowlisted tem SHA-256
`6232792ab00f7ab9be1573059d6d76c2e2e61109d70cd4d97d4bfe1da9c58692`.
O plano privado tem SHA-256
`ac753dc8079808b9f336f04e5e220a46eed5fbe10d3f5d784666ae6f25a9c046`
e o manifesto sanitizado,
`cd11a3b49bc7f4112ab6ae04ea0e6c8ae7ddeec8ef07c1665967f3fab97e7a7f`.
O nonce reservado permanece privado e não é publicado.

## Diff mecânico permitido

1. O verificador API current-bound recebe dump/retorno vigentes e destinos
   privados inéditos.
2. O snapshot frontend é criado em S1, depois do PASS da API, ou consome
   diretamente a identidade autenticada do relatório da API.
3. O controle candidato usa nonce e journal novos. O controle consumido não é
   copiado ou reativado.
4. Seleção do candidato e retorno supervisionado continuam transações atômicas
   `delete → start` com autorização lida uma vez.
5. Predicados, política, retorno supervisionado, artefatos e ordem API → frontend
   permanecem iguais.

## Roteiro único da futura janela

1. Revalidar S0 e gerar o verificador API current-bound com destinos single-use.
2. Executar fixture integral e exigir exatamente
   `END_TO_END_COMBINED_RELEASE_FIXTURE_PASS`.
3. Selecionar e verificar a API; persistir o relatório autenticado de S1.
4. Somente então materializar o snapshot frontend, controle/nonce, configuração,
   plano atômico e binding usando a identidade de S1. Conferir o diff allowlisted.
5. Selecionar o frontend atomicamente. Produzir journal pelo launcher real e
   verificar o snapshot pós-API, três amostras, HTTP e worker.
6. Após aceite funcional, criar o marker pelo fluxo canônico,
   `enable-supervision-candidate` e `supervised-candidate`.
7. Executar `pm2 save` uma vez somente depois da supervisão aprovada.
8. Em qualquer negativa antes do save, executar retorno frontend supervisionado,
   retorno API, health e coerência com o dump seguro; não reutilizar destinos ou
   controles consumidos.

Nenhuma janela produtiva pode iniciar apenas com fixtures isoladas ou com um
snapshot frontend produzido em S0.
