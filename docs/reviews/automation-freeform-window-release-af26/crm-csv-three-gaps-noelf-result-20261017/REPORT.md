# Resultado do diagnóstico sem readelf

**CONSUMED / DENY_NO_RETRY / NOT WINDOW READY. CSV SUSPENSO.**
Provas prévias publicadas/confirmadas antes da VPS:
`9afc2197e4bbc58a6f6a7ae0d9f94d92189ad3a2`, parent
`99c2198d80c61d8904cae56fbb4d093258e236d2`.
A única mudança funcional foi a separação ELF aprovada; fontes/destinos/hashes e11
ensaios foram conferidos antes de uma execução de materialização e collect1–3.
Nenhuma outra correção foi feita, antes ou depois da tentativa.

## Gates e fatos efetivos

| Etapa | Observação / resultado |
|---|---|
|Materialização LOCAL|exit0; pacote/39 fontes conferidos; destinos novos|
|Gate1 fontes/closure diagnóstica|GATE1_VERIFIED_SNAPSHOT; closure26 autenticada|
|Imagem Node/Docker|cadeias/hashes observados; hash Node igual ao pin revisado|
|ELF/closure operacional|**NÃO CONFERIDA**; elfChecked=false, operationalToolchainCertified=false; nenhum PASS de toolchain|
|Boot/daemon/peer|leituras executadas e peer validado antes/depois da consulta; não constituem certificado de saída|
|RPC|um getMonitorData pelo FD do daemon existente, exit0, stderr vazio|
|Resposta RPC|3 linhas/3 nomes esperados; PIDs retornados iguais às referências esperadas|
|Gate2 completo/configuração canônica|**NÃO CONCLUÍDO**; DENY depois de peer-after; verificadores de configuração não alcançados|
|Gate3 rota/container/psql|NÃO ALCANÇADO|
|SELECT/root observer/readelf/alternativa|NÃO EXECUTADOS; sem sudo|
|Custódia|DENY preservado byte-exato e ingerido por private_record; gatePass=false|
|Ownership|UNKNOWN; nenhuma certificação operacional ou janela|

O journal terminou em **RuntimeError**, errno=null, após peer-after exit0.
Não há reason/predicado específico no registro final. A análise LOCAL da resposta
conseguiu excluir divergência de cardinalidade, nomes e PIDs **retornados** pelo RPC;
isso não certifica /proc/state/start ticks nem configuração.

A fronteira remanescente do código contém a revalidação socket/pm2.pid, as
identidades kernel por aplicação e a leitura/metadata/hash da primeira referência
histórica antes de seu evento ser gravado. A captura não discrimina qual deles
produziu a primeira negativa. Não atribuímos o DENY a configuração, drift específico,
causa histórica, atime ou retorno de código candidato sem evidência. Não houve
nova leitura remota para tentar resolver essa incerteza.

O efeito da separação foi comprovado também nesta execução: readelf não foi chamado;
o evento ELF não conferido foi preservado, e o fluxo chegou ao RPC real. Isso não
transforma o gate2 incompleto em PASS e não autoriza afrouxar qualquer revalidação.
Qualquer investigação/correção adicional exige revisão; os destinos estão consumidos.

## Intervalos próprios desta tentativa

- Transporte único:17/10,12:46:36.304007–12:46:40.466380 UTC
  (09:46:36–09:46:40 em Fortaleza), exit1 pelo DENY remoto, sem timeout.
- Journal remoto:12:46:39.254868–12:46:40.255830 UTC
  (09:46:39–09:46:40 Fortaleza).
- RPC:12:46:40.163137–12:46:40.253593 UTC, exit0.
- Custódia:12:46:40.547863 UTC (09:46:40 Fortaleza).

Não são snapshot atômico nem medição de indisponibilidade HTTP. Não houve parada,
contenção, restart, instalação, reparo ou abertura de janela/guarda.

## Bytes, integridade e custódia

[RESULT_SANITIZED.json](RESULT_SANITIZED.json) contém somente estados/horários/hashes
e comparações booleanas. [SOURCE_INDEX.json](SOURCE_INDEX.json) indexa13 artefatos
privados por alias, tamanho/hash/owner/mode e as fontes públicas no SHA das provas.
A resposta RPC contém configuração/ambiente e permanece **exclusivamente privada**;
nenhum valor, cmdline ou conteúdo bruto foi publicado.

| Artefato privado | Bytes | SHA256 |
|---|---:|---|
|Bundle enviado|225.285|`23f2bd3f0b4b8cef218e2dfdfcfb0a1d7266c938d925fc4311063a1b00bf0f5a`|
|Resposta RPC|25.655|`ec71e5a5364035d06ac72e1cef728ce20836cb2e223e5d0dbaa7ad0d4559687a`|
|SSH stdout/envelope|80.814|`eaae53cffb2a44e5bcc22351c4079e3e29d62f4056b04d1251e8ceacea3bafcf`|
|SSH stderr|0|`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`|
|Journal remoto/cópia off-host|60.158|`18add4ba10e9509cf1527241ff4a6e48e35205519d7bce70713bd07923b58b7d`|
|Journal local de transporte/ingestão|169.661|`ba1ac421cf0f184db0a043d59aba11c3cb2275bb80ab37f5df032dd191ac7d00`|
|Recibo local|359|`023e45bb12d88fcdf2caf6f897f099508f1e6209406f2770d2065ea5417d2790`|

Recibo: **THREE_GAPS_CUSTODY_PRESERVED_NOT_CERTIFIED**, gatePass=false,
sourceBytes60158, sourceSha25618add4ba…, ownershipUNKNOWN, atomicSnapshot=false.
A análise LOCAL conferiu envelope/cópia, metadata, tamanho/hash, canais de cada
comando e igualdade das linhas ingeridas com a origem. Custódia não é certificação.

Destinos preservados: material local `re7-csv-three-gaps-material-noelf-20261017-v1`;
remotos tools/read `re7-csv-three-gaps-executable-{tools,read}-noelf-20261017-v1`;
custódia ThinkPad `csv-three-gaps-executable-noelf-20261017-v1` e launchers
`csv-three-gaps-launcher-noelf-20261017-v1-{materialize,collect}`. Os13 artefatos
indexados são owner1000/mode0600/nlink1. Não foram sobrescritos ou reparados.
O DENY anterior continua byte-exato com hash a443d683…; nenhuma captura anterior foi
reclassificada ou atualizada para o horário novo.

## Encerramento e limites

A execução encerrou sem retry/fallback, sem procurar alternativas ELF, sem mudar
constantes, perfis, bindings, permissões ou código em campo. Rota/cliente SQL,
configuração canônica completa e ownership permanecem pendentes. A localização do
predicado da negativa também permanece não discriminada; não se presume sua causa.
Os controles existentes continuam exigidos integralmente.

Nenhum SELECT, observador root, instalação, emissão, backup, importação, envio,
retenção, processo produtivo iniciado/parado ou nova janela. NEWauth+NEWDB+NEWcipher,
frontend, crons, guarda38 e out.15 não foram alterados. Não há nova certificação
health/UI/crons ou garantia produtiva derivada deste diagnóstico parcial.

Publicação limitada ao resultado sanitizado/índices/checkpoints; provas prévias e
pacotes consumidos intactos. Deploy desabilitado e CI versionado inaplicável à branch
são reconferidos, sem mudar configurações. Segurança externa/revisão21/10 permanece
separada. A autorização termina com esta publicação.
