# Templates e campanhas WhatsApp com mídia

Status produtivo: **TECHNICALLY DEPLOYED / PRODUCTION HEALTHY**.

Homologação funcional Meta: **PENDING — ÚNICA TENTATIVA DE VÍDEO NEGADA NO UPLOAD BINÁRIO**.

Liberação comercial/operacional para CRA-PR e demais clientes: **PENDING**.

Última atualização: 2026-10-24. Esta é a fonte canônica para cabeçalhos `IMAGE` e
`VIDEO` em templates e campanhas. O estado produtivo geral continua em
[`CURRENT_STATE.md`](CURRENT_STATE.md). O mecanismo tenant-scoped de Meta App ID foi
implantado em 24/10/2026. Em operação separada, o tenant Converta Demo teve o App ID
tenant-scoped configurado depois que uma única consulta `GET /debug_token` confirmou
o vínculo atual do token com o aplicativo e as permissões necessárias. Essa prova não
recupera o histórico original do onboarding.

## Implantação técnica

O target `ec2a9fde99b6421a85256f14604bd469879f4f2a` está ativo na release
`immutable-ec2a9fde-vps-20261024T162005Z`, conforme o
[registro estruturado](releases/TEMPLATE_MEDIA_UPLOAD_DIAGNOSTICS_2026-10-24_DEPLOYED.json).
API e frontend foram selecionados por troca atômica dos caminhos estáveis e restart
dos registros PM2 existentes, sem `--update-env`. O worker foi preservado.
O BUILD_ID ativo é `7yArOSyfllnPiQy_vAS9H`. A release
`immutable-a62da468-vps-20261024T124726Z` permanece como retorno e evidência histórica.

## Homologação controlada de vídeo em 24/10/2026

A solicitação histórica `video_previdencia` permaneceu `failed`. O fluxo tenant-scoped
criou `video_previdencia_teste_20261024`, categoria `MARKETING`, idioma `pt_BR`, com o
mesmo texto, exemplos e vídeo íntegro da solicitação anterior. Antes da operação, o
nome estava livre, não havia operação concorrente nem resultado incerto relacionado,
e o vídeo MP4 de 2.141.258 bytes correspondia ao SHA-256
`cfdc7f8caa5d87dfbde49948924685d37e40f95910ae2267cd7aa5ccc3a3b787`.

A criação tenant-scoped e a aprovação interna passaram. A submissão administrativa
chamou a Meta exatamente uma vez pelo backend implantado. A criação da sessão foi
seguida de negativa no envio dos bytes (`binary_upload`): HTTP 400, código 100,
subcódigo 33, tipo `GraphMethodException`. A mensagem sanitizada informa que o objeto
de sessão não estava disponível, não tinha permissão ou não suportava a operação.
A solicitação terminou `failed`; não houve retry, sync adicional, campanha ou envio.
O registro estruturado é
[`CONVERTA_DEMO_VIDEO_TEMPLATE_HOMOLOGATION_2026-10-24.json`](releases/CONVERTA_DEMO_VIDEO_TEMPLATE_HOMOLOGATION_2026-10-24.json).
O resultado não comprova aprovação Meta nem libera uso comercial.

A migration `20261021150000_add_template_campaign_media` foi aplicada exatamente
uma vez. O primeiro cliente Prisma recebeu `SIGABRT` depois que a migration já estava
persistida; a verificação restrita posterior terminou com código zero, confirmou
61/61 migrations e nenhuma pendência. Não houve segunda alteração do schema.

O armazenamento persistente é
`/opt/re7online/content/template-campaign-media`, `deploy:deploy`, modo `0700`, fora
da release imutável. O backup PostgreSQL prévio foi validado e permanece preservado.
O smoke técnico foi GET-only: API, Login, Inbox, CRM, Templates e Campanhas
responderam HTTP 200. Não houve chamada Meta, upload real, criação/submissão de
template, campanha, importação ou envio.

## Configuração tenant-scoped posterior

A operação administrativa existente configurou exclusivamente `demo-converta`, com
`provenance=embedded_signup` e `confirmTenantScoped=true`. O GET de verificação
retornou `configured=true` e `source=tenant_app_id`. Token, WABA, número, demais
propriedades e outros tenants permaneceram inalterados; o evento de auditoria não
contém o App ID. O resultado sanitizado está no
[registro de configuração](releases/CONVERTA_DEMO_META_APP_ID_2026-10-24_CONFIGURED.json).

## Resultado da auditoria

Antes deste delta, `Template` e `TemplateRequest` persistiam apenas o texto do
`BODY`; `Campaign` não preservava mídia; submissão, sincronização e o único
`sendTemplate` eram text-only. Os seeds de campanha, leases, idempotência,
eligibilidade, opt-out, guard operacional e Result Truth já existiam e foram
reutilizados. O Inbox já tinha upload de mídia, mas sua raiz e seu contrato não
atendiam à retenção de exemplos e campanhas.

O suporte exige migration aditiva. Usar `content`, `variables` ou `notes` para
armazenar o contrato de mídia perderia tipo, integridade tenant-scoped e vínculo
imutável com a campanha.

## Contrato implementado

- `headerType`: `NONE`, `IMAGE` ou `VIDEO`;
- `components`: definição canônica versionada, separando `HEADER` e `BODY`;
- `TemplateMediaAsset`: tenant, finalidade, tipo, MIME, tamanho, SHA-256,
  nome original sanitizado, chave interna de armazenamento e estado;
- handles de exemplo e media IDs da Meta ficam separados e nunca substituem o
  arquivo privado durável;
- `TemplateMediaAccountUpload` vincula cada media ID ao tenant, asset, SHA-256,
  tipo, `phoneNumberId` e geração não secreta da credencial. O asset não possui
  media ID global;
- `Campaign.templateMediaAssetId` mais `templateMediaSnapshot` preservam
  `assetId`, tipo e SHA-256 no rascunho e na intenção imutável;
- FKs compostas `(clientId, id)` impedem vínculos de mídia entre tenants;
- defaults `NONE`/`NULL` mantêm templates e campanhas textuais compatíveis.

A migration é
`apps/whatsapp-agent/prisma/migrations/20261021150000_add_template_campaign_media`.
Ela está aplicada em produção exatamente uma vez, com 61/61 migrations confirmadas.
Essa constatação não autoriza outra migration nem homologação funcional.

## Armazenamento

Os bytes ficam fora do release e fora do `public` do Next, sob
`TEMPLATE_MEDIA_ROOT` (default local: `apps/whatsapp-agent/.data/media/template-campaign`).
Diretórios usam `0700`, arquivos `0600`, nomes são gerados no servidor e cada
leitura revalida tamanho/SHA quando usada para preview. Raiz, ancestrais e
arquivo não podem ser symlinks. A API limita o corpo multipart mesmo quando não
há `Content-Length`, valida extensão, MIME e magic bytes e não aceita URL remota,
eliminando SSRF desse fluxo.

Formatos validados nesta versão:

| Cabeçalho | MIME | Limite decimal conservador |
| --- | --- | ---: |
| IMAGE | JPEG, PNG | 5.000.000 bytes (5 MB) |
| VIDEO | MP4, 3GPP | 16.000.000 bytes (16 MB) |

Os limites devem ser reconferidos na documentação oficial antes de cada release.
A referência primária usada foi a coleção oficial da Meta para
[criação de sessão resumable](https://www.postman.com/meta/whatsapp-business-platform/request/vkmioqf/resumable-upload-create-an-upload-session),
[upload dos bytes](https://www.postman.com/meta/whatsapp-business-platform/request/13382743-871ea332-a6a4-4ad0-800a-0be9796b1933) e
[envio de template com mídia](https://www.postman.com/meta/whatsapp-business-platform/request/2qbotrb/send-message-template-media).

Frontend e backend adotam uma interpretação decimal conservadora dos limites
publicados de 5 MB e 16 MB. A fonte não explicita a quantidade de bytes. O limite
decimal exato é aceito; um byte acima é negado. A interface separa requisitos
obrigatórios de recomendação visual e usa
1,91:1 (1200 × 628 px apenas como exemplo), sem transformar largura, altura ou
proporção em bloqueio.

Antes do upload, o navegador valida tipo escolhido, MIME informado, extensão,
tamanho e arquivo vazio; quando o navegador consegue decodificar a mídia, também
mostra dimensões, proporção e duração. A prévia compartilhada em Modelos e Campanhas
exibe o arquivo completo com `object-contain`, fundo neutro e uma indicação separada
de que a simulação do WhatsApp pode sofrer adaptação ou recorte. URLs autenticadas
permanecem em Blob URLs locais, são revogadas e não passam pelo otimizador público do
Next.

O backend continua validando magic bytes/contêiner, MIME, extensão, tamanho, hash,
escopo do tenant, symlink e path traversal. Sem adicionar binário nativo ou executar
conteúdo enviado, esta versão não afirma inspecionar profundidade de cor, codec de
vídeo ou quantidade/codec das faixas de áudio. JPEG/PNG em 8 bits RGB/RGBA, H.264 e
AAC com no máximo uma faixa (ou vídeo sem áudio) são apresentados como requisitos;
a compatibilidade final permanece sujeita à validação da Meta. A submissão de
homologação será realizada manualmente pelo owner em etapa autorizada separada.

O parser multipart nativo ainda materializa o arquivo para a validação final.
Enquanto a troca por parser streaming não ocorre, a admissão limita um upload
por tenant e, por padrão, um upload global (`TEMPLATE_MEDIA_UPLOAD_CONCURRENCY`,
máximo 2). Com corpo multipart limitado a 17 MiB e estimativa conservadora de
quatro cópias transitórias, o teto padrão é aproximadamente 68 MiB; a
configuração máxima fica limitada a aproximadamente 136 MiB. Excesso recebe
`429`, e a reserva é liberada de forma idempotente em sucesso, erro ou
cancelamento.

Cleanup é explícito: composição ainda não persistida tenta `DELETE`; um asset
referenciado por template, solicitação ou campanha recebe `409` e não é apagado.
`npm run template-media:cleanup -- --older-than-hours 168` é dry-run.
`--apply` precisa ser deliberado e pode ser limitado por `--client-id`. O
processo seleciona somente assets antigos sem relações, reclama o estado,
revalida as relações, não segue symlinks e registra apenas contagens. Este PR
não instala cron.

## Fluxo de template

1. `ADMIN` ou `SUPERVISOR` autenticado envia exemplo tenant-scoped. `AGENT` é
   negado, o tenant precisa estar ativo e `templates` é obrigatória. A finalidade
   `CAMPAIGN` também exige `campaigns`. GET e DELETE repetem RBAC/capabilities
   do `purpose`; asset não referenciado só é visível ao usuário que o criou.
2. A solicitação grava header/componentes e permite preview autenticado. Nenhum
   caminho interno, handle ou token chega à UI admin.
3. Na submissão, o backend cria a sessão Resumable Upload, envia os bytes e usa
   o handle em `HEADER.example.header_handle`. Existe exatamente um `HEADER` e
   o `BODY` anterior é preservado.
4. Timeout/resultado ambíguo de upload vira `submission_unknown`; não existe
   retry cego. Erros do provider são sanitizados.
5. Sync atualiza status, categoria e componentes. Resposta parcial mantém o
   header/mídia local conhecidos e permite mostrar recategorização/divergência.

Suporte técnico a `IMAGE`/`VIDEO` não autoriza `MARKETING`. A política de
categorias do tenant continua sendo avaliada na solicitação, submissão, criação
e envio.

## Fluxo de campanha

O composer exige mídia compatível quando o template tem header, mostra preview
autenticado e preserva a referência em:

- envio manual;
- CRM estático e CRM dinâmico;
- CSV;
- split/lotes acima de 1.000 destinatários;
- rascunho, agendamento, reload, teste, pausa/retomada e reutilização.

O runner continua chamando o único `sendTemplate`. Depois do último gate de
eligibilidade e antes do provider, ele revalida tenant, tipo e SHA do snapshot.
O primeiro destinatário final elegível adquire um lease tenant/account-scoped,
faz o upload e confirma o media ID; os demais reutilizam a confirmação durante
`TEMPLATE_MEDIA_META_TTL_SECONDS` (24 horas por padrão). Single-flight no
processo, unicidade e lease no PostgreSQL evitam duplicação entre execuções.
Expiração permite nova aquisição controlada. Transporte incerto fica em
`uncertain` por 30 minutos e não gera retry cego. Tenant, conta, hash, tipo ou
geração de credencial diferente nunca reutilizam a confirmação anterior.

O header oficial é injetado somente após confirmação. Nenhum upload ou mensagem
ocorre antes do guard final do destinatário. Erro anterior à mensagem é bloqueio
técnico; aceitação ambígua posterior segue Result Truth.

Fechar detalhe não cancela campanha. O descarte da composição continua uma ação
separada. A mídia persistida nunca é removida pelo descarte de outra campanha ou
tenant.

## Segurança e impacto

| Superfície | Regra preservada |
| --- | --- |
| tenant/RBAC | consultas e relações sempre incluem `clientId`; upload só ADMIN/SUPERVISOR |
| categorias | allowlist vigente por tenant, independente do tipo de mídia |
| guard | fechado impede execução/provider; upload local não abre o guard |
| fila/lease | mesma fila, lease e idempotência das campanhas textuais |
| Result Truth | aceite ambíguo não gera nova chamada |
| seeds | destinatários/componentes privados continuam cifrados; snapshot contém só referência segura/SHA |
| logs/Event | sem binário, caminho, token, URL assinada ou PII de mídia |
| retrocompatibilidade | `NONE` e campos nulos mantêm templates textuais |

Uploads, criação/submissão/sincronização de modelos e criação/agendamento/teste/
início de campanhas usam o `ScreenProcessingOverlay` central. Cada operação tem
token próprio: encerrar uma não fecha outra em curso, e desmontar a tela invalida
todos os tokens.

## Validação e limites

Validação local cobre componentes legados/IMAGE/VIDEO, incompatibilidades,
magic bytes/MIME/extensão/tamanho/vazio, raiz com symlink, respostas e timeout
do upload Meta por fake, sync parcial, propagação por todos os modos de campanha,
resposta obsoleta no frontend, lifecycle do composer, migration integral,
FK cross-tenant, cache por conta, 1.001 destinatários com um upload,
concorrência, expiração, resultado incerto, limpeza dry-run, backpressure,
batch >1.000, pausa/cancelamento/Result Truth e builds.

A implantação técnica, a configuração persistente de `TEMPLATE_MEDIA_ROOT` e o App ID
tenant-scoped estão concluídos. A tentativa controlada de vídeo foi negada pela Meta
durante o upload binário e permaneceu sem retry. Antes de liberação ainda são
necessárias uma nova autorização específica após análise da negativa, aceitação da
submissão pela Meta, aprovação do template e envio homologado explicitamente pelo
owner.

A dívida `PREEXISTING_BATCH_ELIGIBILITY_N_PLUS_ONE` permanece no
[backlog set based](backlog/CAMPAIGN_SET_BASED_ELIGIBILITY_2026-10-21.md). Ela é
preexistente e não invalida este deploy técnico.

Rollback futuro: parar criação/submissão, voltar API/frontend juntos e preservar
tabela/arquivos aditivos até auditoria de referências. Não remover a migration ou
bytes referenciados durante rollback de código.

## CRA-PR

O requisito técnico de `IMAGE`/`VIDEO` está implantado, mas ainda não constitui
evidência CRA nem autorização comercial. O aceite CRA permanece
pendente de template/cópia/categoria oficiais, validação da Meta e autorização
do owner. O registro `DEPLOYED` refere-se somente à implantação técnica; não registrar
`META APPROVED`, liberação comercial ou envio real a partir deste trabalho.

## App ID por tenant

O upload de exemplos resolve o App ID na configuração Meta do próprio tenant:
`rawPayload.appId` é canônico e `rawPayload.applicationId` é compatibilidade legada.
O fallback `META_APP_ID` só é aceito com
`META_APP_ID_FALLBACK_MODE=single_app` ou `shared_app`; o padrão é `disabled` e a
topologia multi-tenant atual não deve habilitá-lo.
O fallback global é proibido quando existirem tenants com proveniências Meta
distintas.

O Embedded Signup persiste o App ID real do fluxo e preserva as demais propriedades
do `rawPayload`. A regularização administrativa é tenant-scoped, exige superadmin,
proveniência `embedded_signup`, escrita CAS e nega substituição divergente. Respostas
e eventos expõem apenas o estado configurado.

Token, WABA e App ID são validados antes de gravar `submitting`. Uma negativa local
mantém a solicitação em `internal_approved`; efeito externo possivelmente iniciado
gera reconciliação `submission_unknown`, sem retry cego.

## Diagnóstico da submissão de mídia

O upload resumível registra de forma tenant-scoped a etapa exata: criação da
sessão, leitura/validação da resposta da sessão, envio dos bytes ou
leitura/validação da resposta binária. O diagnóstico contém somente status HTTP,
código/subcódigo, tipo, trace e mensagem sanitizada da Meta. Token, Authorization,
App Secret, URL, sessão, handle e corpo bruto nunca entram no evento, resposta ou
console. O console preserva esse diagnóstico inclusive em respostas HTTP 5xx.

O fluxo segue a coleção oficial da Meta: `POST /{app-id}/uploads` com comprimento,
MIME e nome, seguido de `POST /{upload-session-id}` com bytes e `file_offset: 0` no
header. O identificador retornado é codificado como um único segmento de URL; isso
preserva inclusive assinaturas que contenham caracteres reservados. A referência
oficial usada na revisão é a coleção
[WhatsApp Business Platform — Resumable Upload](https://www.postman.com/meta/whatsapp-business-platform/request/vkmioqf/resumable-upload-create-an-upload-session).

Cada etapa de mídia tem limite de 20 segundos e o POST final do template, 10
segundos. O cliente administrativo aguarda 58 segundos. A configuração Nginx ativa
não redefine `proxy_read_timeout`/`proxy_send_timeout` para `/agent-api`; permanece
o padrão de 60 segundos. Timeout do navegador não comprova cancelamento e nunca
autoriza repetição automática.

Esta correção melhora observabilidade e não reabre solicitações encerradas. A causa
externa específica de falhas históricas continua dependendo de uma tentativa
controlada futura, porque essas respostas antigas não preservaram o detalhe seguro.
