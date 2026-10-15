# Correção integrada produtor/consumidor — 14/10/2026 Fortaleza

**PREPARATION VALIDATED FOR REVIEW / NOT INSTALLED / NOT WINDOW READY.** Nova geração `incident-6683-v4-security-cipher-contract-v10-20261015T021500Z` conferida **com seus bytes concretos na VPS**, três referências imutáveis não vazias e verificadores canônicos. V9 permanece DENY, intacta; não a corrigimos em campo, não instalamos política, não paramos processos e não aplicamos SQL. Nenhuma nova sessão sudo do owner foi solicitada; só o observador NOPASSWD já existente foi usado em leitura.

[Roteiro A0/A/B/C/D para revisão](COMMANDS_FOR_REVIEW.txt), [provas sanitizadas](PROOFS_SANITIZED.json). A autorização anterior da v9 não autoriza executar esta nova janela.

## Causa do escape e correção preventiva

O produtor antigo selecionava `path/uid/sha256` dos metadados e descartava `mode`. A v9 herdou as três entradas incompletas. O consumidor canônico exigia `mode`; o checker antigo validava arquivos/manifests/configurações, mas não chamava esse consumidor. As fixtures de recuperação tinham `immutable=[]`; portanto 18 testes CLI aprovados não provaram o contrato de referências da composição entregue. Foi falha nossa de cobertura e de declaração de alcance.

A versão nova usa observação READ ONLY de **lstat real**: proprietário, modo completo, tipo regular, nlink1, caminho sem resolução por symlink e hash. Exige população/path/owner/hash correspondentes às referências aprovadas. Não adota600/644 ou outro default. O capture privado também exige arquivo regular, owner vigente, modo600 e nlink1 antes da leitura. Metadata inválida nega antes de criar/copiar candidato.

`package_contract.py` é compartilhado pelo produtor e pelo checker. O checker novo chama **CipherConsumers.verify('before')** sobre os arquivos reais, além de validar schema/cross-references/manifests/perfis. `certify_review.py` bloqueia publicação sem recibo da cadeia completa e hashes correspondentes ao candidato concreto; falta de gate, hash diferente, orçamento insuficiente ou efeito de execução nega. O builder emite apenas `CANDIDATE_UNPUBLISHED_AWAITING_CANONICAL_VPS_CHECK` até essa conferência. Certificação para revisão não habilita gates.

## Auditoria dos quatro modos

| Fronteira | Contrato/validação aplicada ao pacote real |
|---|---|
| Referências imutáveis | Campos obrigatórios path/uid/mode/sha256; tipos estritos, referências únicas; leaf regular/nlink1, proprietário, modo e hash pelo consumidor canônico. Três referências reais, sem retirar nenhuma. |
| Perfis before/after | Nome basename/hash e presença; before igual ao candidato return-before-commit, after igual aos candidatos switch/return/return-partial. População de três apps e envs tipados; frontend, NEWauth+NEWDB e chaves de cada fronteira pelo verify_configs. |
| Modos e arquivos | Conjunto exato dos quatro modos; nomes/arquivos/hash/owner600 pelos manifests, scripts.sha256 e ecosystem_contract; baseline_contract e proof bindings canônicos em todos os modos. |
| Writer/consumer | Mesma lista completa de referências, agora com mode; writers previstos API/mesmo worker e lista de scheduled cipher writers igual ao contrato. Root/cron adicional ou writer futuro deve ser reconfirmado na janela, não presumido ausente. |
| Política/retornos | preparation/hash da política, PIDs/ticks/população de origem, perfis compatíveis; template de retorno carrega também a dependência do contrato. Helpers/sudoers não alterados; root hashes restritos ainda exigem conferência no momento autorizado. |
| Backup/restore/SQL | Proof bindings íntegros dos quatro modos; schema e migrations completas atuais iguais ao restore certificado, sem novo restore. SQL, phase, CAS, grant/147, Telegram opaco e CLI permanecem byte a byte iguais. |
| Privacidade/identidade | Diretórios privados reais700, arquivos de configuração600; source profiles confrontados com processos ativos, saved/fallback600, controle worker/admin e frontend servido. Não publicamos envs, headers ou valores. |

Não há bootstrap de serviços na auditoria. A fase consumer `contained` foi validada como **contrato de referências**, não como prova de contenção ou saída real. Start gates/recovery boundary continuam os já revisados, sem replay de testes produtivos.

## Ensaios e conferências concretas

- **12 testes locais** com referências não vazias e consumidor canônico: campos ausentes/tipos inválidos, modo/proprietário/hash divergentes, tipo/diretório, symlink, referência ausente, perfil com escape e binding de modo divergente.
- **9 negativas do produtor com o capture real**: ausência de mode/uid/hash/path, owner/hash/path divergentes, tipo incorreto e nlink2. Todas negaram **antes da criação/cópia do candidato**.
- **7 negativas da barreira de publicação**: cadeia incompleta, três hashes de prova/candidato divergentes, capacidade insuficiente, instalação realizada e gates não falsos.
- **Checker completo real na VPS PASS**, seguido de cadeia preparatória integrada PASS em **15/10 02:06:09.055798 UTC / 14/10 23:06:09.055798 Fortaleza**. Não substituído por mocks.
- GET autenticado do worker e GET administrativo200 passaram sem publicar headers; frontend serviu o BUILD_ID preservado; diretórios privados700 conferidos.
- Runtime, inventário de dependências, grant, SQL/phase/driver/start gate/CLI, população, source config e backup/restore foram comparados byte a byte com os artefatos anteriores não afetados. Nenhum rebuild funcional, nova conversão, novo dump ou teste de envio.

A primeira leitura auxiliar de inventário preservou uma negativa por comparação incorreta entre **66 registros totais** de migrations e **60 concluídos/não revertidos**. Essa negativa não foi convertida em PASS alterando baseline. A comparação foi esclarecida por leitura de todas as migrations e do schema no restore existente e na produção: igualdade integral, digest `142a2b61fd5a366bb770bd4274d6cdf7f0850808d26f4e03b7cdf4ffe7acd71d`. A cadeia final distingue total e subconjunto. Nenhum dado/migration foi alterado.

## Gates alcançados e não executados

| Gate | Resultado/alcance |
|---|---|
| Pacote/runtime/quatro modos/consumidores/manifests | PASS real, candidato entregue exato |
| Escopo11, dez legíveis, opaco e147 históricos | PASS READ ONLY atual; plano final não gerado |
| Identidades/perfis NEWauth+NEWDB/frontend | PASS; API410272, worker410428, frontend188897 preservados |
| Saved/fallback600, guarda38, supervisão | PASS; supervisão preservada inactive/enabled; gates false |
| SQL congelado/out.15/recibo/controles | PASS READ ONLY pelos verificadores canônicos; não reinvestigou audiência nem alterou resultados |
| SQL/TCP identity e proxy | PASS pelo transporte/observador canônicos, sem owner sudo novo |
| Capacidade/WAL | PASS datado: mínimo deploy/PostgreSQL **18.419.281.920 B**, WAL **83.886.080 B**; crescimento/frescor deverão ser reconfirmados na janela |
| Schema/fronteira de restore | PASS integral; restore e conversões anteriores reutilizados |
| Health DB/worker/admin/frontend | PASS READ ONLY; nenhuma mensagem/teste provider |
| Custódia/integridade/extração | PASS pacote/índice privados e hashes locais/entregues iguais |
| Backup/RPO fresco | **Não renovado.** Backup anterior preservado e sua prova íntegra; RPO precisa renovação canônica antes da janela |
| Hashes root600/440 e nova política instalada/inspect | **Não executados nesta tarefa**, conforme restrições; não equivale a recusa desconhecida nem atestado de instalação |
| Fence/saída de todos writers/DBzero | **Não executados**, só possíveis durante janela autorizada |
| Selagem/CAS/conversão/commit VERIFIED | **Não executados** |
| Sucessores/reconexões/validação pós-deploy | **Não executados** |

## Bytes entregues e roteiro

| Artefato | SHA-256 |
|---|---|
| Pacote9.011.200 B | `6d7ebf9a8bb143f0b0b5419749387529c8b4579d017dec39302cd7b1b132fd76` |
| Review manifest | `059a4196d7f824c1662f7a7f62192d8ba5aaf5fe43d4072761aa050e1085bd29` |
| Window manifest | `66aa3be9491272121243a02d2a1051e7fd146c6d3e42f798fda0e714bcb6b235` |
| Checker completo | `d8128a3395caf114e8698af7b401a21bd6466080d6b51d6fe54d0fbda6d8affb` |
| Política proposta | `b6a58431c989a36eebdfa9e443118a7e15fbe0229d102cd896f91d3d193f818d` |
| Instalador | `bfc016e75154b26a7f364ab5f1f6423c744dcbe4e41a1587c79ad039380fbd76` |

Hashes da transferência foram medidos na VPS e comparados aos locais. O recibo canônico da cadeia referencia exatamente checker, review e window manifest. Extração isolada local conferiu cada arquivo. Custódia permanente do owner em `cipher-contract-v10-20261014`, diretório700/arquivos600, pacote+índice+captura+recibos/fronteira. Não há promessa de réplica física independente do computador do owner.

Orçamento: reserva canônica8.776.581.120 B mais duas vezes o pacote18.022.400 B, total **8.794.603.520 B**; não reduz o piso anterior. Não foram duplicados runtime/dependências/dump. A0 da v10 já foi feito em staging inativo; não repetir extração. A/B/C/D permanecem **para revisão**, exigindo decisão específica e requisitos imediatos. RPO/root/exit/commit não são satisfeitos porque o pacote passou.

Próxima ação: revisão dos artefatos/comandos/gates desta v10. Nenhum novo problema de schema/consumidores ficou oculto para ser descoberto em instalação; as provas necessariamente operacionais continuam explicitamente fora do alcance desta tarefa. NEWauth+NEWDB, auth/banco/console, frontend, out.15 CLOSED e guarda38 preservados. Segurança externa/cifragem e risco segredo+ciphertexts históricos **OPEN**; propostas.env/externas separadas. Responsável Deifson; revisão14/10, próxima21/10 antecipada após mudanças.
