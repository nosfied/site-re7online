# Capacidade e revisão de gerações no produtor

Preparação de 25/10/2026. Complementa o ciclo de vida e o checklist de release.
Código preparado não comprova instalação na VPS nem autorização de limpeza.

## Mudança de comportamento

O produtor passa a serializar builds que compartilham a mesma raiz de outputs,
por `.generation-build.lock`, exclusivo e não bloqueante, mantido até o fechamento
do sidecar. Fecha somente o próprio FD e nunca remove o arquivo ou expira lock.
Este é lock do builder, distinto da janela canônica de implantação produtiva.
Todos os produtores cooperativos devem usar a mesma raiz física de outputs.

Antes de criar outro output ou executar npm, examina os sidecars diretamente
sob essa raiz. Geração BUILDING, sidecar ilegível/irregular ou falta de revisão
nega a próxima geração. COMPLETE e FAILED não significam resíduos classificados.
Diretórios antigos sem sidecar continuam exigindo inventário operacional próprio:
o gate não afirma descobrir automaticamente todas as cópias antigas da VPS.

A revisão é um arquivo separado `generation-review.private.json`, regular,
owner executor, modo 0600, vinculado ao hash exato do lifecycle terminal:

```json
{
  "schemaVersion": 1,
  "generationId": "immutable-example",
  "lifecycleSha256": "<SHA-256 exato do sidecar terminal>",
  "decision": "PRESERVE",
  "reviewer": "<responsável pela revisão>",
  "reason": "<finalidade da coexistência e classificação dos resíduos>",
  "evidenceSha256": "<SHA-256 do inventário/recibo privado revisado>"
}
```

`PRESERVE` registra coexistência necessária e justificada; `SANITIZED` registra
saneamento concluído por procedimento separado. Ambos exigem evidência. Não são
autorizações de exclusão, não substituem comparação integral e não provam custódia
por si só. Não gerar revisões em massa para passar no gate. Um lifecycle alterado
invalida a revisão. O novo sidecar registra hashes das revisões aceitas, sem editar
as gerações anteriores. Autores de revisão também devem respeitar o lock do builder.

## Reserva e limites

O contrato de capacidade existente continua obrigatório e fechado por schema.
O gate de admissão não usa outro piso numérico independente. Ele exige:

```text
contractRequiredBytes = buildWorkspaceGrowthBytes
                      + runtimePayloadBytes
                      + packageTemporaryBytes
                      + independentVerificationBytes
                      + failureEvidenceBytes
                      + operationalReserveBytes

admissionMarginBytes = failureEvidenceBytes
admissionRequiredBytes = contractRequiredBytes + admissionMarginBytes
```

A margem não estima novamente o payload. Ela conserva um segundo envelope do
tamanho da evidência de falha para fechar lifecycle/diagnóstico quando uma
alocação curta ocorrer entre duas amostras. Assim, a reserva operacional de 4 GiB
do perfil revisado permanece integral e não pode ser usada como workspace,
runtime, pacote, verificação, evidência ou margem. O override histórico
`P00_TENANT_ISOLATION_RECOVERY` continua autenticável como evidência de gerações
anteriores, mas não dispensa o gate derivado.

Antes de cada `npm ci`, Prisma/build, cópia de runtime, empacotamento e extração
independente, o produtor recalcula o saldo necessário. Para o worktree, desconta
somente o crescimento físico já observado do orçamento revisado; as fases futuras,
reserva, evidência e margem permanecem reservadas. Bytes e inodes insuficientes
negam antes da próxima alocação.

Durante cada fase volumosa, uma telemetria limitada registra somente resumo:
menor espaço/inodes observados, duração monotônica, contagem/intervalo de amostras
e lacunas. A admissão anterior à fase inclui sua parcela; durante a fase, o saldo
protegido subtrai exatamente a parcela ativa e mantém reserva, evidência, margem e
custos futuros. Para inodes, a admissão usa o pico restante e o monitor preserva a
reserva enquanto esse pico é consumido. Assim, consumo autorizado não é contado
duas vezes; extrapolação ou consumo concorrente que invada a proteção fecha a
geração como `FAILED`/`RETENTION_DEBT`. A telemetria não registra payload e não é
quota: `minAvailable*Observed` é pico **observado**, não garantia de capturar todo
temporário entre amostras.

Perda da reserva impede iniciar a próxima etapa, registra
`FAILED`/`PENDING`/`RETENTION_DEBT` e
preserva os resíduos para classificação. Não há repetição automática nem remoção
de payload como recuperação de falta de espaço. A reserva de evidência aumenta
a chance de registrar uma falha, sem prometer gravação possível em filesystem
que se torne indisponível ou completamente cheio.

Checkpoints são gates; a amostragem durante subprocessos reduz a lacuna, mas não é
monitoramento contínuo nem limite de armazenamento. O orçamento deve continuar
conservador e incluir competição de disco, extrações e diagnósticos. Não confundir
telemetria com quota ou garantia absoluta contra ENOSPC.

## Qualificação do target 911a9708

Os contratos preservados de `aa9527cc`, `059ea95a` e `fa63994a` usam o mesmo
perfil API+frontend: 1.610.612.736 B de worktree, 1.342.177.280 B de runtimes,
536.870.912 B de pacote temporário, 1.342.177.280 B de verificação independente,
268.435.456 B de evidência e 4.294.967.296 B de reserva. O contrato soma
9.395.240.960 B; a margem derivada soma 268.435.456 B; a admissão exige
9.663.676.416 B e 800.000 inodes.

| Parcela | Origem revisada | Bytes |
| --- | --- | ---: |
| crescimento do worktree | `buildWorkspaceGrowthBytes` dos três contratos | 1.610.612.736 |
| runtimes coexistentes | `runtimePayloadBytes` dos três contratos | 1.342.177.280 |
| tar/XZ temporário | `packageTemporaryBytes` dos três contratos | 536.870.912 |
| extração independente coexistente | `independentVerificationBytes` dos três contratos | 1.342.177.280 |
| fechamento de falha | `failureEvidenceBytes` dos três contratos | 268.435.456 |
| serviços vivos | `operationalReserveBytes` dos três contratos | 4.294.967.296 |
| margem contra lacuna de amostragem | segunda retenção do envelope de falha | 268.435.456 |

Para o target integrado `911a970838233ae92e00a45ef371f619511d8602`, a
observação preservada de 02/11/2026 registrou 10.731.368.448 B livres. A geração
produtiva passou a admissão, executou um único build e registrou as oito fases do
lifecycle sem lacuna nem invasão do saldo protegido. O menor saldo observado
durante o build foi aproximadamente 7,52 GB; a amostragem continua sendo pico
observado, não garantia de capturar todo temporário.

Após instalação, ativação e fechamento, a retenção 3/3 retirou worktree e os dois
runtimes derivados. O saldo medido passou de 7.397.990.400 para 9.406.750.720 B:
ganho físico de 2.008.760.320 B, com pacote, release e retornos preservados. Essa
operação comprova a prevenção no produtor de releases. Não comprova adoção do
adapter de `preparations`, que permanece separada, nem autoriza reutilizar a
medição terminal como reserva futura.

Os checkpoints históricos autenticam o perfil adotado e o saldo nas fronteiras,
mas não mediram continuamente os temporários internos de tar/XZ/extração. Por isso
fundamentam as parcelas revisadas e a necessidade da margem; não constituem uma
alegação de pico físico integralmente observado.

## Homologação e adoção

- Testes isolados cobrem disputa do lock, geração pendente antes do primeiro
  comando, revisão ligada ao lifecycle, rejeição de BUILDING, admissão derivada,
  falta de reserva antes da próxima fase, crescimento temporário observado,
  consumo concorrente, inodes insuficientes, falha/interrupção e resíduos como
  `RETENTION_DEBT`.
- Verificar CI e hash do produtor escolhido antes de preparar um artefato novo.
- Inventariar legados e classificar cada geração anterior; preservar pacote,
  índices, retornos, worker, dados, backups e evidências conforme suas dependências.
- Usar uma única geração canônica, reutilizar o mesmo pacote na transferência e
  promoção, e registrar resíduos e espaço ao final, com sucesso ou falha.
- A publicação não instala cron, coletor de lixo, retenção por idade ou prune.
  Não faz nova medição produtiva nem autoriza nova retirada na VPS.
