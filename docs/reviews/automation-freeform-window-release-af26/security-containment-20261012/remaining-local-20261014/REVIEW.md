# Segurança restante — composição local e primeira credencial

**LOCAL REVIEW / execução não autorizada.** Auth e banco concluídos e preservados.
Terceiro lote **CONSUMED/PARTIAL**:20 retirados/3 preservados, sem certificado integral;
nenhum replay ou retirada manual. Out.15 CLOSED, guarda38 fechada; segurança externa/
cifragem OPEN. Esta entrega não instala código/configuração/política na VPS.

## Próxima ação do owner: somente a chave OpenAI

Consumidor comprovado: `re7-whatsapp-agent`. Owner informou nesta continuidade:
projeto **Default**, duas chaves, uma revogada. É declaração do owner, não prova de
qual chave corresponde ao valor configurado. Não publicar o ID do projeto ou a chave.

1. Entrar em [Settings](https://platform.openai.com/settings), selecionar organização
   e projeto Default, abrir **API Keys**. Conferir somente a chave não revogada:
   identificador mascarado/ID, proprietário (usuário ou service account), permissões
   e validade quando disponível. Não alterar permissões, criar nem revogar.
2. Registrar esses metadados em `openai-owner-next-step.private.json` na custódia
   privada `security-remaining-local-20261014` indicada abaixo. Consumidor já foi
   identificado; a informação faltante é emissor/escopo e vínculo da chave vigente.
   Uma coincidência de sufixo isoladamente não comprova o vínculo. Nunca enviar valor,
   cookies ou captura no chat. Resposta pública suficiente: “metadados conferidos”
   ou qual acesso falta.
3. Depois desta conferência, preparar revisão da substituta no mesmo projeto/escopo,
   entrega privada, atualização coordenada de todos os sucessores/retornos e revogação
   da antiga somente em fase autorizada. Sem teste por mensagem ou chamada paga.
   A API pode perder a função de IA se a chave ativa for revogada antes da troca;
   isso não exige novo logout global nem mudança de NEWauth/NEWDB.

O console permite gestão de permissões no âmbito do projeto; não ampliar privilégios
para facilitar a troca. [Documentação oficial de RBAC](https://developers.openai.com/api/docs/guides/rbac).
Não foram efetuadas chamadas de provider nem criado/revogado material externo.

## Fila de credenciais: orientar uma por vez

Estas fichas ficam para a sequência, sem pedir cinco ações simultâneas. Os campos
de referência abaixo apontam para a captura privada pós-banco e o inventário original;
o owner confirma o ativo no console, sem redescobrir consumidores.

| Credencial | Console e ativo disponível | Falta e ação somente de leitura | Condição da futura substituição/impacto |
|---|---|---|---|
| App Meta principal | Meta Developers → Apps; identificação original em custódia, mas emissor não confirmado pela configuração pós-banco | Conferir qual app corresponde à referência privada; registrar app/owner e efeito anunciado pelo console. Não clicar reset/show/copiar segredo | **Bloqueada antes do plano341/CAS/escrow/retorno coerente**; HMAC, OAuth e referências derivadas dependem da chave |
| App Instagram | Meta Developers → Apps; emissor ainda não confirmado | Confirmar app para este slot separadamente, sem supor que valor igual significa mesmo app | OAuth/webhooks/conexões podem ser afetados; efeito de reset ainda não atestado |
| Instagram Business Login | Meta Developers → app do `META_INSTAGRAM_BUSINESS_LOGIN_APP_ID` na referência privada | Conferir ID/owner/escopo; substituir somente após compatibilizar state e retorno | OAuth pendente pode exigir reinício; não desconectar contas nesta preparação |
| Fallback WhatsApp | Business Settings/WhatsApp Manager; WABA e phone-number IDs privados conhecidos | Conferir ativo, emissor e tipo do token; navegar até usuário/system user correspondente somente depois de identificar o emissor | Preparar substituta com mesmos ativos/permissões, atualizar consumidores antes de revogar se houver coexistência comprovada |

Todos estes cinco slots têm a API como consumidor inventariado. Os nomes/IDs privados
estão em `remaining-security-owner-steps.private.json` da custódia anterior e na captura
pós-banco; ausências são explícitas. As páginas oficiais Meta retornaram HTTP429 nesta
consulta; não afirmar que menus ou efeitos de reset foram reconfirmados. A decisão
futura depende da leitura do console legítimo, não de executar reset como diagnóstico.
Não solicitar valor em chat, nem ampliar privilégios de usuário/system user.

## Composição exata do decoder sobre a base preservada

`compose_seed_overlay.py` compila apenas o delta canônico de b2a73dab (Node20.20.0)
e o aplica com contexto estrito/fuzz0 nos compilados da base atestada. Nenhum build
integral da branch. O índice de443 arquivos compilados é fixado pelo SHA
`2c806c2233461c71d98d5d782f4b7b549551512e1b376eefe62472db8664b08f`;
divergência nega antes do compilador. Destino deve ser novo, proprietário executor,
700, sem symlink; negativo antes de captura/gravação.

Sete módulos: seis deltas (`campaignSeedPrivacy`, runner, recipientImport, routes,
privacyRetentionService, acceptedFailureReconciliation) e novo `campaignSeedEpoch`.
Os437 demais compilados permanecem por hash. Não introduzir no runtime
`campaignAcceptedDeliveryRecovery`: ele não existe nesta base; seu ajuste canônico
de contexto continua na fonte administrativa revisada, sem executar recuperação.
Primeira tentativa local negou módulo ausente; diretório/diagnóstico preservados.
Composição corrigida explicita esse alcance; não adaptou bindings produtivos.

[Manifesto](composition-manifest.sanitized.json), [provas](proof.sanitized.json).
Node20.20.0: compilado leu147 campos/126 eventos originais, confirmou igualdade do
índice autorizado e dos payloads imutáveis, round-trip somente em memória com chave
dedicada já preparada.252 negativas de tenant/payload. Contrato epoch compilado:
tenant/contexto, chave separada, AAD por campo, validade/integridade/permissões,
duplicata/symlink/fallback negados. Dois testes dos gates do compositor PASS.
Final v3 tem exatamente os mesmos sete hashes da v2 ensaiada; provas reutilizadas.
Testes funcionais seed/typecheck anteriores continuam válidos; não repetidos como
se fossem prova produtiva. Sem entrypoint, provider, scheduler, SQL ou subprocesso PM2.

Política histórica anterior **não foi reescrita nem prorrogada**. Proposta privada
conserva as147 entradas e origem/hash; prazo operacional permanece decisão obrigatória
da geração final. A política de dois minutos utilizada no ensaio é exclusivamente
local e não será instalada. Chave dedicada anterior reutilizada, não regenerada.
Configuração atual NEWauth+NEWDB permanece referência imutável; não usar init antigo
nem importar todo o objeto histórico de novos valores.

**Limites e retorno:** overlay não é pacote deployable completo. Preparação final ainda
exige composição completa com dependências atestadas, política válida selada e bindings
atuais. Depois de existir uma escrita v2, retorno de código deve conter este reader
compatível e manter a chave dedicada+escrow histórico. Não retornar ao leitor antigo
para “resolver” uma recusa; não reescrever Event/recibo. A chave histórica serve apenas
às entradas autorizadas e restauração offline, nunca a novos writers. MFA/webhook/canal
mantêm contratos canônicos próprios, sem ampliar um helper global por conveniência.

## Telegram: disposição específica para revisão

[Selo sanitizado](telegram-disposition.sanitized.json) liga o draft à fonte privada,
conta/tenant e digest da linha original. [Verificação offline](telegram-provenance.sanitized.json) PASS: uma linha, tenant/conta/canal exatos; o digest histórico usa Python JSON com sort_keys e separadores padrão, não JSON.stringify. Algoritmo explicitado sem substituir o hash antigo. Teste dirigido nega conta/tenant/hash/duplicata divergentes e conserva a linha. Proposta **PRESERVE_OPAQUE_HISTORICAL_NO_ACTIVATION**:
preservar bytes/ID/rowHash/backup e registrar um ciphertext histórico não recuperável,
em canal futuro declarado sem uso. Não materializar token novo, não ativar/desativar
conta, não produzir sucesso de decriptação e não omitir a linha do inventário.

Para uma futura fase parcial de cifragem, decisão explícita deverá admitir que esta
linha permanece opaca e preservada, com escrow/recibo de disposição exatos, enquanto
as dez legíveis são convertidas por CAS e verificadas. Implementação desse contrato
de exceção no planner requer revisão própria; **planner estrito atual continua DENY
para canal11**. Nenhum arquivo de plano completo foi fabricado. Token novo/BotFather
não é requisito para esta revisão; futura ativação tem fluxo canônico rotate-token
e autorização própria. Não chamar recuperação histórica de sucesso criptográfico.

## Orçamento e impactos por fase

Última amostra produtiva:14/10 11:22:53UTC/08:22:53Fortaleza,
min(deploy/PostgreSQL)=18.659.729.408B; WAL80MiB estável, slots0. É fonte datada,
não CAPACITY PASS atual de uma janela de segurança. A retirada dos três arquivos
não é dependência desta preparação.

| Fase futura | Medição e envelope preparatório proposto | Impacto/termos ainda exigidos |
|---|---|---|
| Uma credencial externa | Reserva específica32MiB para config/provas/política/recibos; sem duplicar release/dependências | Coexistência e revogação dependem do console; continuidade IA/token, sem novo logout global |
| Decoder/epoch | Overlay medido~1,94MB alocados únicos antes dos auxiliares de ensaio; reservar4MiB para overlay e64MiB para captura/planos | Interrupção coordenada API/mesmo worker em janela própria; retorno compatível, política147/escrow/restore obrigatórios |
| App Meta341 | Snapshot original completo7.391.283B; envelope64MiB para snapshot/plano/recibo/índice (conferir tamanho final) | Conversão transacional/CAS dos341, reset coordenado e retorno com segredo novo; não usar antigo após revogação |
| Canal/MFA/webhook | Envelope64MiB; retrato histórico11/0/0, não contagem atual | Disposição Telegram, planos reais/CAS/recibo e restauração de backups com chaves antigas; Web não será desconectado nesta etapa |

Esses envelopes são **margens propostas de evidência**, não substituem reservas
canônicas nem autorizam operação. Antes de cada fase: orçamento total = reserva
canônica + alocação única de staging/candidato/retorno realmente necessária + dump
fresco local/custódia/restore conforme runbook + crescimento/WAL observado + envelope
da fase. Tamanho do dump fresco, retorno final e taxa de crescimento ainda não foram
medidos para estas fases; não atribuir PASS a termos incompletos. Não copiar deps
compartilhadas cegamente, não introduzir hardlinks/symlinks em geração selada. Antes
do reset Meta, plano341 com substituta real e recibo/retorno coerentes são bloqueios.

## Comandos locais e custódia

Comandos em [LOCAL_COMMANDS.txt](LOCAL_COMMANDS.txt), sem segredos. Capturas originais,
overlay, proposal147, disposição Telegram e primeira ficha externa em custódia privada
permanente do owner: `/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/security-remaining-local-20261014`.
Diretório700/arquivos600; conteúdo/índice/manifests separados dos históricos. Uma
réplica off-host física, não alegar redundância entre discos. A receita reconstrói
somente o overlay a partir da base atestada+fonte fixada; política/key permanecem
privadas. Material local não representa instalação nem rotação efetiva.

Responsável Deifson Oliveira; revisão14/10, próxima21/10 antecipada após mudança.
Próximas ações independentes: owner confere metadados da única chave OpenAI vigente;
revisão do overlay/contrato de retorno e da disposição Telegram. Nova preparação
exclusiva dos três arquivos remanescentes fica somente no backlog de retenção.
