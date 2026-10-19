# Fechamento artifact-bound — CRM contacts list recovery

Status: `ARTIFACT-BOUND COMBINED RELEASE READY / NOT INSTALLED / PRODUCTION UNCHANGED`.

O ensaio integral foi repetido com os caminhos e SHA-256 dos artefatos privados
da próxima janela. A execução terminou em `ARTIFACT_BOUND_END_TO_END_PASS`, com
PM2 substituído por shim e zero acesso de mutação à produção. A preparação liga
o verificador API v6-r4, as definições API, o snapshot frontend posterior ao PASS
da API, o controle candidato novo, a seleção atômica, o retorno supervisionado e
o dump seguro `a99667587ccee0ee884ed31aa304c714e276e86f6db86ba418238171508a2cf0`.

## Política e controle

A política `10539fe3e013a9acdc64ebee0c27ddc94b29d8ef773201a1a0b64947776a0a3a`
não fixa caminho, hash ou nonce do controle anterior. O predicado
`permanent_run_scope` compara exatamente `release`, `entry`, `entrySha256` e
`buildId` com uma role da política. O tuple do controle novo coincide com a role
`candidate`; por isso a política aceita o controle sem alteração. O binding do
retorno `ACTIVE_PERMANENT` permanece byte-idêntico.

O controle novo tem SHA-256
`b10fc8f082e39984fa93f3f89a7f1e9d52a9ff24670ee21e9afb3e97c7af2c51`,
BUILD_ID `bt9-BI1dCQD7_gj8ktOvz`, nonce privado novo e destinos exclusivos. O
journal e o marker estão ausentes. O controle anterior, que contém journal sem
marker, permanece consumido e não é fonte da preparação.

## Artefatos vinculados

| Artefato | SHA-256 |
| --- | --- |
| Verificador API v6-r4 | `3ce469f2db79d43a08ed1cee2dcce88fba32d44139c31eb96b94b66d12e114e6` |
| Definição API candidata | `d022f7b7b28ddd4e1122657b84059c887b35820815e24885472674ae910e7a76` |
| Definição API de retorno | `fda2b1fe25f8c07e39416aca8bd8fb3db92838c62c2791443d50f94ce514cec7` |
| Controle frontend candidato novo | `b10fc8f082e39984fa93f3f89a7f1e9d52a9ff24670ee21e9afb3e97c7af2c51` |
| Definição frontend candidata | `ce65305e1954c20b379b88fe3698eefd6f62cc614275f45a1e24121c7851c917` |
| Executor transacional | `0708a530915650be6f1463ef19c88d069c85acb3769600ee94a3709a15f8a953` |
| Plano `select-candidate` | `5493ee824fb3831b1615b176a034762cce61af6e464fe4d08b7d1439fc179380` |
| Plano `rollback-to-supervised-return` | `582a28b3f7238931722ba03d87b470ddfc4dc6b61f86d7190cff255902f67ad1` |
| Fixture dos planos atômicos | `1473c356fa1d205ba9125d476a3ed4298a31470661a2e927102a98db76faf1c0` |
| Manifesto privado | `8151f4d91ededb2ce4352aa61e74710e5eeb14607d2dececbb432cee087e178f` |
| Fixture artifact-bound | `63fdd2e1c5f8b9eab4e480853e6127f2a914ba012a3ef9355885f6817fdcad8f` |
| Manifesto sanitizado | `95b075b528d6aad68fc6ea91e8399372f1cd9ea181926630e1b1456ba07bb882` |

Os valores de nonce, ambiente e relatórios privados não são versionados. A
identidade do worker é tratada como valor opaco do snapshot S0: a fixture apenas
prova igualdade em S1, S2, S3 e rollback, sem inventar caminho operacional.

## Sequência única da futura janela

1. Revalidar S0, o dump seguro, a política e todos os hashes deste manifesto.
2. Confirmar destinos single-use vazios; criar o snapshot API e executar a
   seleção/validação API pelo v6-r4.
3. Somente após `API_CANDIDATE_STABLE`, capturar o snapshot frontend esperando a
   identidade API autenticada.
4. Autorizar e executar uma vez o plano atômico `select-candidate`; validar o
   journal real, três amostras, BUILD_ID, HTTP e worker.
5. Após aceite funcional, criar o marker pelo fluxo canônico, executar
   `enable-supervision-candidate` e `supervised-candidate`.
6. Executar `pm2 save` uma vez depois da supervisão aprovada.
7. Em negativa, executar o retorno frontend `ACTIVE_PERMANENT`, retornar a API,
   confirmar saúde e manter coerência com o dump seguro.

Nenhum controle com journal sem marker pode voltar ao passo 3. Todo verificador
state-bound é regenerado após mudança legítima do dump, e todo snapshot frontend
de release API → frontend nasce depois do PASS da API.
