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
O preflight exige o pico completo mais reserva operacional e evidências. As novas
amostras conferem bytes e inodes entre comandos e nas fronteiras de cópia de
runtime, empacotamento e extração independente. Antes dessas cópias, reservam
também os orçamentos das fases volumosas restantes. Medições ficam no lifecycle.

Perda da reserva impede iniciar a próxima etapa, registra FAILED/PENDING e
preserva os resíduos para classificação. Não há repetição automática nem remoção
de payload como recuperação de falta de espaço. A reserva de evidência aumenta
a chance de registrar uma falha, sem prometer gravação possível em filesystem
que se torne indisponível ou completamente cheio.

Estes são checkpoints entre fases: não monitoram continuamente nem encerram um
npm/cópia já em curso. O pico deve ser conservador e incluir competição de disco,
extrações e diagnósticos. Uma garantia durante cada subprocesso ainda exigiria
monitoramento supervisionado ou limite de armazenamento efetivamente instalado.
Não confundir checkpoints com quota ou garantia absoluta contra ENOSPC.

## Homologação e adoção

- Testes isolados cobrem disputa do lock, geração pendente antes do primeiro
  comando, revisão ligada ao lifecycle, rejeição de BUILDING, falta de reserva
  para a cópia seguinte, inodes insuficientes e parada após perda de capacidade.
- Verificar CI e hash do produtor escolhido antes de preparar um artefato novo.
- Inventariar legados e classificar cada geração anterior; preservar pacote,
  índices, retornos, worker, dados, backups e evidências conforme suas dependências.
- Usar uma única geração canônica, reutilizar o mesmo pacote na transferência e
  promoção, e registrar resíduos e espaço ao final, com sucesso ou falha.
- A publicação não instala cron, coletor de lixo, retenção por idade ou prune.
  Não faz nova medição produtiva nem autoriza nova retirada na VPS.
