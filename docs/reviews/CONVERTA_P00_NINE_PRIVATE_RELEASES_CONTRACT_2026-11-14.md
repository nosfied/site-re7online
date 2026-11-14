# Converta P00 — contrato fechado das nove releases privadas

## Resultado

`NINE_RELEASES_CONTRACT_MERGE_READY`

O perfil é exclusivo do lote `p00-nine-private-releases-exceptional-20261114-v1`.
Esta revisão não instalou o helper, não materializou intenção produtiva, não concedeu
`AUTHORIZE_ONCE` e não executou retirada.

## Autoridades

- Preservation receipt: `46d3049a71396c7f7fcef8cae511a79bc5eb28bbf21ba09b9d65c6afbfb3ad87`.
- Índice da custódia: `48eb52f4736fb0a3f9eebf00490df04a9424792dbc8f67b8534ec501a9d41699`.
- Manifesto privado dos `.data`: `8c22c6d19a49c15845a1aa4388551f98cc759c16842867dbf6c12ecdfd9617f4`.
- Helper predecessor: `1d808c3955d5d7db4902200b8669e02ec4ae7718e65bd62cd6b20b697c5e306e`,
  identidade `64769:786791`, `root:root 0500`.
- Helper sucessor: `84d5909b6cfb53b1fe38ca0c1d699d4297dfc3b4d7c1b61fdf027078ba82975c`.
- Instalador sucessor: `f22b417e9306abe88893693adc14ef47c1e0e6ee0ba014360013d66bcc7a64c4`.
- Consumidor: `5fc88cf5e8745b260b28a49b1ea32a89098c2b1d8172dbcc0b3baae3dc1d4dad`.

## Fronteira fechada

O observador aceita os nove caminhos literais somente como conjunto completo e apenas
nas fases `prepare` e `execute`. O instalador aceita somente o predecessor autenticado,
publica atomicamente o sucessor e comprova que o sudoers não mudou. O consumidor exige:

- receipt e índice exatos da custódia externa;
- nove pacotes e nove restaurações `PASS`;
- identidade física de cada raiz e de cada `api-runtime/.data` preservado;
- atestação SSH fresca, vinculada ao nonce e à fase;
- grafo, PM2 vivo e salvo, current, mounts e locks sem referência;
- observação privilegiada completa, sem referência, writer ou falha;
- nove comandos `RELEASE_RUNTIME` literais com `--one-file-system`;
- autorização posterior contendo exatamente os nove caminhos;
- journal durável `ATTEMPT → RESULT → VERIFIED`, inclusive reconciliação sem repetição.

Os perfis Campaign API e anteriores permanecem disponíveis e suas regressões continuam
passando. Nenhum comando usa glob, prefixo aberto ou alcança destino externo.

## Validação

- 38 testes dirigidos passaram para observador, instalador, perfil 9/9 e regressão
  Campaign API.
- A suíte ampliada executou 151 testes: 147 passaram. Quatro testes antigos de
  `worktree residue` negaram por `residue_identity`; o mesmo caso foi reproduzido
  isoladamente e sem alterações no HEAD anterior `774532b6`, portanto não decorre
  deste perfil. A CI deve ser executada no checkout limpo do HEAD publicado.
- O receipt real da custódia foi reaberto pelo novo validador e passou sem alteração.

## Próxima fronteira

Após integração, a instalação privilegiada exige autorização administrativa própria.
Somente depois dela pode ser produzida observação terminal e executado `prepare` para
apresentar uma intenção 9/9 ao owner. Nenhuma dessas ações integra esta revisão.
