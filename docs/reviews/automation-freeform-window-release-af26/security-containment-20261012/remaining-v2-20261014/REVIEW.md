# Segurança externa/cifragem — preparação local completa, 14/10/2026

Auth e banco concluídos: NEWauth+NEWDB preservados. Out.15 CLOSED, guarda38 fechada, worker e frontend preservados. Segurança externa/cifragem OPEN. Nenhuma consulta OpenAI real, substituição de segredo, aplicação SQL ou implantação nesta entrega. Terceiro lote CONSUMED/PARTIAL (20 retirados, três preservados), sem certificado completo; não repetir B.

## OpenAI: o vínculo ainda não está comprovado

A configuração legítima e o ambiente do processo API concordam com a custódia original. Isso prova qual segredo a API usa, não o ID do registro do console. O owner informou projeto Default, registro Active `re7online-whatsapp-agent-prod`, proprietário Deifson Oliveira e permissões All. Esses metadados são declarados pelo owner; não constituem prova criptográfica do vínculo. Não há recibo original de emissão conhecido. A busca delimitada em 3.566 documentos JSON privados não encontrou recibo correspondente; 19 documentos foram excluídos por limite/tipo, portanto não é uma busca exaustiva em todo o cofre.

Alternativa preparada: uma única consulta autenticada **GET /v1/models**, com o segredo obtido da fonte privada legítima e sem herdar chave/proxy do ambiente. Preservar intent, UTC, nonce, `x-request-id` e somente cabeçalhos de organização/projeto permitidos. Não serializar Authorization, corpo, cookies ou demais cabeçalhos. O script exige autorização específica e nunca repete a requisição. HTTP200 comprova autenticação, **não** o ID da chave.

Depois, o owner solicita ao emissor a correlação privada do request-ID com **ID da chave e ID do projeto**, e confronta ambos com o registro autenticado do console. Texto preparado: “Sou o proprietário do projeto; preciso identificar qual registro de API key autenticou esta requisição GET /v1/models, request-ID e UTC anexados privadamente. Confirmem o ID da chave e do projeto; nenhum segredo será enviado.” A disponibilidade dessa correlação pelo suporte/logs não é garantida. Se não houver acesso ou identificação pelo emissor, permanece `RECORD_BINDING_PENDING`; não revogar por hipótese nem usar sufixo/last_used_at como prova suficiente.

Próxima ação concreta do owner: revisar/autorizar essa consulta única e guardar os IDs do projeto/registro em custódia privada. A consulta e o contato com suporte **não foram executados**. O formulário privado apenas registra evidências, não substitui essas instruções.

Fontes oficiais: [listagem de chaves de projeto](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/projects/subresources/api_keys/methods/list), [GET Models](https://developers.openai.com/api/reference/resources/models/methods/list), [request-ID e diagnóstico](https://developers.openai.com/api/reference/overview). A listagem retorna identificador e valor redigido; não recupera o segredo completo nem garante que a visão de um usuário inclua todas as chaves.

## Telegram e fronteira de cifragem

O contrato `PRESERVE_OPAQUE_HISTORICAL_NO_ACTIVATION` foi implementado e ensaiado exclusivamente para uma linha, vinculando tenant, conta completa, row/cipher hashes, fonte original, captura atual e disposição selada. A linha permanece no inventário, byte a byte, sem token novo, ativação, recredenciamento ou alegação de recuperação. Qualquer outra cifra inválida nega. Telegram continua frente futura sem uso declarado; enabled/token armazenado não prova utilização.

A captura atual completa confirmou 11 linhas de canais (dez legíveis, uma opaca), 341 vínculos externos e 147 campos em 126 eventos seed. Quatro linhas WhatsApp legíveis diferem do snapshot anterior em ciphertext/hash/updatedAt; a causa específica dessas alterações não foi comprovada. A linha Telegram e os 147 campos históricos continuam correspondendo à proveniência. O novo plano usa a captura real; planos anteriores foram preservados.

Plano `4abcbeb2b3136d823803d32a86b4271a4fba99eb6382574d0ec3edadad7916e0`; disposição `0e7876eb068c29ab9e160cc2e2b3a783ffb8bb46d47eab9d9cba3bcdac62a187`. O renderer SQL é **para revisão local**, não um apply produtivo autorizado. Compara toda a conta e a linha original, inclusive timestamps; altera somente dez ciphertexts, preserva metadados e a opaca, e emite recibos por tenant, sem revelar inventário de outro tenant. Replay exige recibos e estado completos, sem eventos adicionais; divergência nega. MFA/webhook não têm dados cifrados observados no inventário, mas suas chaves e consumidores continuam na fronteira de configuração.

PostgreSQL16 sintético comprovou commit/replay, rollback integral, CAS de tenant/conta/linha/metadados, conflito de recibo e concorrência. [Prova](postgres.sanitized.json). Zero providers e zero conexões produtivas nesse ensaio. As tabelas reproduzem os campos efetivos; FK/RBAC e fences produtivos ainda exigem integração canônica final, não foram certificados por esse fixture.

## Decoder/epoch e retorno

Tar completo SHA `06f136d77e136231face3d4eb5c422598978f7971a3c1ae32773a80540dcc7b5`: 446 arquivos, 439 preservados e sete módulos alterados/adicionados sobre a base ativa atestada. [Delta integral](compiled-delta.sanitized.json). Dependências existentes: 6.944 entradas, dez symlinks internos cujos destinos pertencem ao inventário; nenhuma dependência copiada. Node20.20.0; compilação apenas dos dois módulos modificados nesta continuidade, demais deltas revisados reutilizados. Worker/frontend funcionalmente inalterados. Nenhum export da branch inteira.

O coordenador de retenção nega fonte, hash, identidade, captura vencida, dependência ou orçamento incompletos **antes** de copy/compile/tar. Sidecar REVIEW registra responsável, alocação, revisão21/10 e custódia; não altera gerações históricas. As capturas datadas são provas da composição local, não certificados reutilizáveis numa futura janela.

O candidato e o retorno compatível têm configurações privadas próprias; retorno v3 possui cwd/script distintos, mas usa o mesmo tar imutável. Configuração e build marker foram vinculados ao executável novo, preservando drafts anteriores. NEWauth+NEWDB ficam em ambos. Antes do commit de cifragem, mantém-se a chave ainda efetiva; depois de VERIFIED, todos os sucessores/retornos usam exclusivamente NEWcipher+NEWauth+NEWDB. Incerteza bloqueia sucessor/replay: inspecionar recibo, SQL e controles, sem restaurar segredo exposto. A chave histórica permanece apenas no escrow de leitura seed autorizada.

Limite: esse retorno mantém a capacidade de ler a época nova, mas não é uma implementação alternativa do decoder. Não corrige um defeito do próprio leitor por simples troca de configuração. Após dados v2, retorno ao leitor antigo é inadmissível; eventual defeito exige contenção e correção compatível revisada. Antes de qualquer v2/mutação, a base antiga só pode ser considerada por protocolo específico e prova fresca de ausência de dados incompatíveis.

## Expiração explícita

Política proposta `b9a42d2f785b83e8a5b8c5b9745822d9450c4a23924baac19f30ed11e22f1bbc`, mesmos 147 campos/proveniência; prazo proposto **22/10/2026 21:00UTC /18:00Fortaleza**, ainda não aprovado/instalado. Exigir pelo menos sete dias restantes antes de ativar; se a data não atender, negar e apresentar nova geração para decisão, sem editar o grant histórico.

Expiração nega leitura legada v1 e novas escritas; leitura v2 com tenant/seed/field/epoch corretos continua disponível. Nenhuma extensão silenciosa ou fallback de chave global. [Prova no compilado](epoch.sanitized.json). Recuperação de disponibilidade: preservar payloads/recibos/escrow; conter operações dependentes do grant; emitir proposta nova com lineage, mesmo inventário e nova decisão explícita; testar leitura integral/negativas e reconferir identidades antes de instalar. Não é perda dos dados, mas pode ser indisponibilidade real de leitura v1. Revisão21/10, antecipada após mudança e pelo menos24h antes do vencimento; sem cron/alerta implantado. O arquivo de renovação usado no teste é fixture local, não autorização operacional.

## Capacidade e custódia

Captura14/10 14:05:20UTC /11:05:20Fortaleza: mínimo deploy/PostgreSQL **18.471.538.688B**, DB771.193.879B, WAL234.881.024B nas duas amostras curtas, sem slots e sem erro de escrita observado nos30min consultados. Não comprova crescimento de longo prazo, drain, saída ou prontidão de janela.

| Rubrica | Bytes |
|---|---:|
| Piso operacional preservado da preparação anterior (não piso universal) | 2.131.755.008 |
| Staging candidato/tar/extração de retorno | 67.108.864 |
| Controles do retorno, sem contar novamente o pacote | 4.194.304 |
| Dump limitado + restore isolado | 5.231.345.664 |
| WAL/crescimento | 1.073.741.824 |
| Planos, SQL, capturas e recibos | 268.435.456 |
| **Total / margem na captura** | **8.776.581.120 /9.694.957.568** |

Dump bound3.152.019.456B e restore bound2.079.326.208B são limites propostos, não tamanhos medidos de novo backup. Ultrapassagem nega; não reduzir orçamento para PASS. Renovar dump/RPO/custódia antes da janela, restaurar somente isoladamente e provar leitura dos dados/escrow planejados. Provas anteriores de ferramentas/schema são reutilizáveis, não substituem restore da nova fronteira cifrada. Alocação real da composição local26.497.024B.

Custódia permanente privada acessível ao owner: `/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/security-complete-local-20261014`, 48 arquivos, diretórios700/arquivos600, índice próprio e tar446 membros rechecados. [Prova sanitizada](custody.sanitized.json). A extração isolada integral já foi verificada; recuperação usa o tar+índice, não exige guardar duas árvores executáveis adicionais. Espaço off-host do owner246.085.578.752B na medição; não alegamos duas réplicas fisicamente independentes. Originais e manifests anteriores não foram removidos/reescritos.

## O que falta para uma janela executável

Esta entrega conclui composição/plano/ensaios locais, **não** declara janela pronta. Dependências específicas: decisão sobre disposição Telegram e prazo/grant; integração do adapter SQL/verify e fronteira pré/pós-commit ao sequenciador V4 com hooks e controles próprios; fechamento fresco do grafo operacional global (boot/cron/políticas/root/saved/fallback), geração dos hashes de política/instalador e conferência de permissões; dump/RPO/restore da fronteira nova e orçamento atual; confirmação do vínculo/emissão externa antes de revogação. Esses itens permanecem enumerados, sem envelopes apresentados como política final.

Meta não deve ser resetado antes de selar os341 vínculos e o retorno com substituta real. Web não será desconectado. Próxima revisão local pode integrar os hooks/sequenciador e políticas propostas sem executar produção, independentemente da conferência OpenAI. Nenhuma nova retirada condiciona isso.

Provas reaproveitadas: implantação/aceite auth/banco, frontend, contratos anteriores de seed e retenção. Reexecutadas somente as afetadas: três testes OpenAI (rede simulada), dois gates de composição, PostgreSQL de disposição/CAS/recibos por tenant, contrato compilado epoch/expiração e typecheck. Não atribuir PASS sintético a comportamento produtivo não provocado.
