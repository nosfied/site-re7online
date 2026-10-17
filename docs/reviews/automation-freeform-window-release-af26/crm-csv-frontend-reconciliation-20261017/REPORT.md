# CSV — reconciliação frontend OFFLINE concluída

Base: `f54691a6612c43087f8093f14768a5eaa0ff732f`. **Conclusão: adaptação incorreta do leitor demonstrada; correção apenas local.** Nenhum contrato histórico, coleta consumida ou recibo foi alterado. CSV SUSPENSO / LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.

## Relação com a necessidade original

O item canônico é [CRM — importação CSV com resultado desconhecido na interface e totais ambíguos — 10/10/2026](../../../BACKLOG_TECH.md#crm--importação-csv-com-resultado-desconhecido-na-interface-e-totais-ambíguos--10102026), associado ao [contrato CSV](../../../saas/CRM_CSV_IMPORT_OPERATION_CONTRACT.md). O owner precisa recuperar o resultado após timeout/reentrada, sem reimportação e com totais corretos (993 = 880 + 82 + 31; amostra de até200). A implementação funcional e suas provas locais continuam reaproveitáveis. Esta reconciliação resolve somente uma adaptação do diagnóstico que impedia certificar a preservação do frontend; **não entrega o CSV em produção nem reabre sua janela**.

Foram consultados princípios de mudança/retenção, checklist, backlog original, runbook e índice. Sem novos artefatos volumosos, build, PM2/SQL, backup ou prova perecível. Os testes anteriores válidos foram reutilizados no seu alcance, sem reatribuir a eles equivalência entre ambientes.

## Contrato aprovado antes de frontend_expected

1. `preventive-api-frontend3227-prepared-20261010/preserved_frontend_environment.py`, introduzido em `285b479daf09dfe4250b44deaeee335795a9d8a5`, SHA `5b4a0f2bdf741ce639c66a00c2e63c4e37c5ccfe2a643ef5355028d3db97deba`: captura **duas leituras integrais iguais do ambiente OS**, exige terminação NUL, chaves válidas sem duplicação, envelope pm2_env e coerência de cwd/script/interpreter com a linha PM2. É um perfil para preservar o frontend, nunca para iniciá-lo.
2. O README e `verification-results.json` dessa preparação registram o problema já identificado: projeção PM2 não substitui ambiente inicial OS no frontend cluster. A prova aceita usou Node20.20.0/PM2 6.0.14 reais e System.check_config inalterado: perfil OS positivo; projeção PM2 negativa. Essa prova foi **reutilizada, não repetida**.
3. `v4-sequencer/sequencer.py:Bridge.app_matches` encaminha a configuração do modo a Operations.config; `System.check_config` verifica pm_cwd/pm_exec_path, `/proc/cwd`, `/proc/exe` e **todas as variáveis do env desse perfil**. Não transforma env de um dump em env OS.
4. `crm-csv-staging-20261016/capture_source.py` lê `switch/candidate.config.private.json` da geração NEWcipher e exige `b.app_matches` para o trio antes de registrar sourceProfile. O binder v2 exige igualdade dessa fonte com o template, mantém o source.profile e copia separadamente o dump PM2. São duas referências com finalidades distintas.
5. A recuperação aceita de16/10 (`recover_original.py`, `RECOVERY_COMPLETE.md`) usou o perfil original pelo caminho canônico e conferiu separadamente saved/fallback. A comparação adicional do frontend saved com o dump anterior permitiu somente axm_monitor dinâmico. A frase sobre perfil “herdado de sessão” descrevia a inadequação de usá-lo como **dump salvo**; não autorizava substituir o perfil OS por uma projeção PM2 na comparação do kernel.

A custódia aceita SHA `32e0cb1de5dac716027fc8face5cc60f8b996ec0ca9de6b18363cbbb84b30076` preserva os dois membros completos. A leitura de17/10 novamente os obteve com os mesmos bytes/hashes. Os hashes e a procedência do código estão em [ANALYSIS.json](ANALYSIS.json).

## Origem dos31 campos e erro de adaptação

`frontend_expected()` foi introduzida em `9101b4f245a7ceb2bc769cb8a1388d7a179472f6`, em `crm-csv-three-gaps-procedure-20261017/contracts.py`. A função usa **dict(before['env'])** como configuração enviada a System.check_config. before vem da linha frontend de `window/saved-dump.pm2.private.json`, SHA `c9c54c02b9694328a5aeaa4335efb88135f9bd948b4f786c8e9e4e851efd51e3` (26.270B). Portanto, os31 não vieram de uma captura OS nova nem do perfil de preservação: são a projeção de aplicação do dump.

Na observação privada preservada de17/10 às10:14 Fortaleza:

- Os **31 campos do dump** são integralmente iguais ao `env` retornado pelo RPC e ao `env` dentro do envelope serializado `pm2_env` do ambiente OS observado.
- O **perfil OS original tem30 campos**, incluindo o envelope inteiro; todos os30 são integralmente iguais ao ambiente kernel observado. Fonte: `window/source.profile.private.json`, SHA `a062c7020353cb39b0578653ea51475f8e9f9f68a588d1c55eb87cbbd68b6b9e` (15.179B).
- As duas representações são coerentes entre si, mas não são equivalentes como mapas no mesmo nível. Comparar diretamente a projeção de31 com o mapa OS de30 produziu13 ausências e seis diferenças. Não são19 variáveis perdidas demonstradas no contrato OS aprovado.
- Os dez LIVE_FIELDS e as três referências de caminho também conferem. A leitura canônica original aplicada ao **perfil OS correto** aceita os mesmos registros; a adaptação errada reproduz exatamente environment_drift.

Matriz dos31 campos: cada linha foi verificada contra os bytes privados pinados, sem divulgar valor ou hash individual de segredo. “Envelope” significa o mapa de aplicação dentro de pm2_env, não o mapa OS superior.

| Campo do dump | Igual no envelope | Igual no RPC | Comparação indevida no topo OS |
|---|---|---|---|
| `DBUS_SESSION_BUS_ADDRESS` | sim | sim | igual |
| `HOME` | sim | sim | igual |
| `LANG` | sim | sim | igual |
| `LC_ALL` | sim | sim | ausente |
| `LC_CTYPE` | sim | sim | ausente |
| `LOGNAME` | sim | sim | igual |
| `NEXT_PUBLIC_CONVERTA_WEBCHAT_API_BASE_URL` | sim | sim | ausente |
| `NEXT_PUBLIC_CONVERTA_WEBCHAT_SITE_ID` | sim | sim | ausente |
| `NEXT_PUBLIC_META_EMBEDDED_SIGNUP_CONFIG_ID` | sim | sim | ausente |
| `NEXT_TELEMETRY_DISABLED` | sim | sim | ausente |
| `NODE_ENV` | sim | sim | ausente |
| `OLDPWD` | sim | sim | ausente |
| `PATH` | sim | sim | diferente |
| `PM2_HOME` | sim | sim | igual |
| `PM2_JSON_PROCESSING` | sim | sim | ausente |
| `PM2_USAGE` | sim | sim | igual |
| `PWD` | sim | sim | diferente |
| `RE7_FRONT_CONTROL` | sim | sim | ausente |
| `RE7_FRONT_RUN` | sim | sim | ausente |
| `SHELL` | sim | sim | igual |
| `SHLVL` | sim | sim | igual |
| `SSH_CLIENT` | sim | sim | diferente |
| `SSH_CONNECTION` | sim | sim | diferente |
| `USER` | sim | sim | igual |
| `XDG_RUNTIME_DIR` | sim | sim | igual |
| `XDG_SESSION_CLASS` | sim | sim | igual |
| `XDG_SESSION_ID` | sim | sim | diferente |
| `XDG_SESSION_TYPE` | sim | sim | igual |
| `_` | sim | sim | diferente |
| `re7-admin-front` | sim | sim | ausente |
| `unique_id` | sim | sim | ausente |

A procedência do registro PM2 e do seu vínculo é comprovada. A atribuição histórica individual de cada variável a um comando/usuário/arquivo de criação não foi estabelecida e não é inferida de seu nome. Não é necessária para distinguir as duas representações aqui observadas.

## Determinação e limites de evidência

**Adaptação incorreta: demonstrada.** O código trocou a origem do env esperado, contrariando a distinção já aprovada. O relatório de9101, ao chamar a projeção de31 de fonte adequada para verificar o kernel, também extrapolou a evidência. A prova sintética anterior representava ambos ambientes como iguais (fork/env simples), e o teste histórico apenas mostrou que os mapas eram diferentes e que a função devolvia o dump; isso não provava que o dump era uma referência válida para `/proc/environ`. A prova PM2 cluster aceita de11/10 teria identificado essa troca de representação.

**Divergência operacional do frontend: não demonstrada nesses registros.** Perfil OS, envelope de aplicação, projeção RPC e campos contratuais conferem nas suas camadas corretas. Isso não exclui diferenças em outras superfícies nem declara disponibilidade/certificação atuais.

**Insuficiência restante:** há uma observação de ambiente nesta coleta, não duas leituras frescas. Ela pode ser comparada à referência histórica, sem fabricar a segunda. Não se promove histórico a captura atual ou a snapshot atômico. Saved/fallback finais, identidades finais, rota/SQL/ownership, toolchain ELF protegido e autoridade continuam sem fechamento por essa rodada. O DENY de10:14 permanece fato correto da execução dos bytes publicados, com gatePass=false; o replay corrigido não o reescreve como PASS. A causa do DENY anterior não instrumentado de09:46 continua indeterminada, sem atribuição a atime.

## Correção local mínima e contraprovas

[contracts.py](contracts.py) é uma derivação **apenas local para revisão**, sem integração em runner, launcher, manifest operacional ou geração. [DELTA.patch](DELTA.patch) mostra somente duas funções alteradas frente ao contrato9101; os demais corpos são iguais por AST e os verificadores originais mantêm seus hashes.

- `frontend_expected(before, source_profile)` agora exige a fonte original OS explícita, com uma única linha frontend, estrutura válida e cwd/script/interpreter correspondentes. Devolve **todo o env OS**, sem filtrar variáveis, limitar contagem ou inferir valores por nome. Ausência/ambiguidade não tem fallback para dump ou sessão.
- `compare_frontend` conserva os dez campos e encaminha esse perfil a Operations.config/System.check_config inalterados. Conserva também **todo o env da aplicação** na camada PM2, com igualdade integral ao dump anterior: os31 não foram removidos para obter PASS, foram comparados no plano correto.
- `compare_saved` segue byte/campo semanticamente intacto, permitindo só axm_monitor. Não se ajustou perfil, ambiente, referência ou recibo histórico.
- A função é um consumidor de uma referência já autenticada pelo caller, não uma nova autoridade. Aqui o loader offline confere os hashes integrais do capture e do tar aceito e a igualdade byte-exata dos membros. Qualquer uso futuro continua dependendo dos hashes/procedência canônicos da preparação; não basta entregar um dict arbitrário. Esta rodada não implementa esse uso operacional.

[Onze testes focados](PROOFS.json) em [test_reconciliation.py](test_reconciliation.py): reproduzem a negativa antiga; usam os corpos reais de System/Operations com o perfil correto; exigem todos os campos OS e de aplicação; negam perfil ausente/ambíguo/projeção errada, referências de caminho divergentes, env alterado, campos obrigatórios/status/cwd/exe/identidade ausentes; revalidam mudança entre chamadas; preservam a comparação saved. Incluem o helper de captura aceito com duas leituras reais de **arquivo sintético local**, sem simular aprovação de verificador.

O teste dos registros produtivos usa `RecordedPath` somente como transporte de **textos/links efetivamente registrados**: stat, cwd, exe e environ. Caminho sem observação nega. Não inventa `/proc`, identidade, resultado de contrato ou segunda leitura; não chama o helper de duas leituras com o mesmo registro fingindo observações distintas. Fixture sintética e replay de custódia estão em classes separadas. Nenhum efeito de sistema, PM2 daemon, processo produtivo, SQL ou rede é exercitado. Não se repetiram os nove blocos literais, PM2 completo ou suítes funcionais CSV.

Reprodução exclusivamente local:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/automation-freeform-window-release-af26/crm-csv-frontend-reconciliation-20261017/test_reconciliation.py
PYTHONDONTWRITEBYTECODE=1 python3 docs/reviews/automation-freeform-window-release-af26/crm-csv-frontend-reconciliation-20261017/analyze_offline.py
```

A análise/teste de registros exige as custódias legítimas; faltando bytes/hash, nega sem buscar VPS ou fabricar conteúdo. Os demais testes usam arquivos sintéticos locais. `evidence.py` contém somente referências/hashes e código de leitura local, não um coletor ou launcher operacional.

## Estado final

Reconciliação OFFLINE concluída, **correção local demonstrada e ensaiada**, disponível para revisão. A pendência “19 campos frontend divergentes” passa a ser erro de representação do leitor, sem reparo produtivo indicado por essa evidência. O item funcional CSV permanece **suspenso / NOT DEPLOYED / NOT WINDOW READY**; nenhuma implantação ou aceite funcional CSV é inferido.

Não há comandos remotos, coleta, launcher, pacote operacional, pins/perfis materializados, instalação, restart, SELECT, backup, renovação de autoridade ou janela novos. Nenhum arquivo dos diretórios consumidos é editado. NEWauth+NEWDB+NEWcipher, produção, ambos crons, guarda38 e out.15 preservados por ausência de ações operacionais; não foram reobservados. Segurança externa/revisão21/10 continua separada.

Publicação limitada à allowlist sanitizada: código local corrigido, contraprovas, análise/procedência/patch/hashes e checkpoints. Sem valores, brutos, dados de tenants ou bindings privados. Deploy desabilitado para a branch e workflow CI aplicável somente a main/develop, sem configuração alterada. Responsável Deifson; próxima revisão21/10/2026 ou mudança. Encerrar após publicação.
