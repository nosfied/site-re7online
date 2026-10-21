# Templates e campanhas WhatsApp com mídia

Status produtivo: **NOT DEPLOYED**.

Status desta implementação: **LOCAL VALIDATED / PR REVIEW PENDING**.

Última atualização: 2026-10-21. Esta é a fonte canônica para headers `IMAGE` e
`VIDEO` em templates e campanhas. O estado produtivo geral continua em
[`CURRENT_STATE.md`](CURRENT_STATE.md).

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
- `Campaign.templateMediaAssetId` mais `templateMediaSnapshot` preservam
  `assetId`, tipo e SHA-256 no rascunho e na intenção imutável;
- FKs compostas `(clientId, id)` impedem vínculos de mídia entre tenants;
- defaults `NONE`/`NULL` mantêm templates e campanhas textuais compatíveis.

A migration é
`apps/whatsapp-agent/prisma/migrations/20261021150000_add_template_campaign_media`.
Ela foi aplicada somente a PostgreSQL descartável. **MIGRATION LOCAL ONLY /
PRODUCTION NOT AUTHORIZED.**

## Armazenamento

Os bytes ficam fora do release e fora do `public` do Next, sob
`TEMPLATE_MEDIA_ROOT` (default local: `apps/whatsapp-agent/.data/media/template-campaign`).
Diretórios usam `0700`, arquivos `0600`, nomes são gerados no servidor e cada
leitura revalida tamanho/SHA quando usada para preview. Raiz, ancestrais e
arquivo não podem ser symlinks. A API limita o corpo multipart mesmo quando não
há `Content-Length`, valida extensão, MIME e magic bytes e não aceita URL remota,
eliminando SSRF desse fluxo.

Formatos validados nesta versão:

| Header | MIME | Limite |
| --- | --- | ---: |
| IMAGE | JPEG, PNG | 5 MiB |
| VIDEO | MP4, 3GPP | 16 MiB |

Os limites devem ser reconferidos na documentação oficial antes de cada release.
A referência primária usada foi a coleção oficial da Meta para
[criação de sessão resumable](https://www.postman.com/meta/whatsapp-business-platform/request/vkmioqf/resumable-upload-create-an-upload-session),
[upload dos bytes](https://www.postman.com/meta/whatsapp-business-platform/request/13382743-871ea332-a6a4-4ad0-800a-0be9796b1933) e
[envio de template com mídia](https://www.postman.com/meta/whatsapp-business-platform/request/2qbotrb/send-message-template-media).

Cleanup é explícito: composição ainda não persistida tenta `DELETE`; um asset
referenciado por template, solicitação ou campanha recebe `409` e não é apagado.
Retenção automática por idade fica pendente e não pode remover referências
auditáveis.

## Fluxo de template

1. `ADMIN` ou `SUPERVISOR` autenticado envia exemplo tenant-scoped. `AGENT` é
   negado e a feature `templates` continua obrigatória.
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
eligibilidade e antes do provider, ele revalida tenant, tipo e SHA do snapshot,
faz upload just-in-time pela infraestrutura existente e injeta o parâmetro
oficial `header.image.id` ou `header.video.id`. Erro anterior ao provider é
bloqueio técnico; aceitação ambígua posterior segue Result Truth e nunca libera
reenvio cego.

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

## Validação e limites

Validação local cobre componentes legados/IMAGE/VIDEO, incompatibilidades,
magic bytes/MIME/extensão/tamanho/vazio, raiz com symlink, respostas e timeout
do upload Meta por fake, sync parcial, propagação por todos os modos de campanha,
resposta obsoleta no frontend, lifecycle do composer, migration integral,
FK cross-tenant, batch >1.000, pausa/cancelamento/Result Truth e builds.

Nenhuma chamada real à Meta, submissão, envio, campanha, importação ou deploy foi
executada. Antes de homologação ainda são necessários: migration autorizada em
ambiente isolado de homologação, configuração persistente de
`TEMPLATE_MEDIA_ROOT`, App ID tenant-scoped confirmado, exemplos não sensíveis,
submissão controlada à Meta, aprovação e um envio homologado explicitamente pelo
owner. Botões de template não entram neste delta.

Rollback futuro: parar criação/submissão, voltar API/frontend juntos e preservar
tabela/arquivos aditivos até auditoria de referências. Não remover a migration ou
bytes referenciados durante rollback de código.

## CRA-PR

O requisito técnico de `IMAGE`/`VIDEO` está implementado localmente, mas ainda
não constitui evidência CRA nem autorização comercial. O aceite CRA permanece
pendente de template/cópia/categoria oficiais, validação da Meta e autorização
do owner. Não registrar `DEPLOYED`, `META APPROVED` ou envio real a partir deste
trabalho.
