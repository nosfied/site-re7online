# Custódia de recibos v2 — LOCAL VALIDATED / NOT DEPLOYED

Correção local do contrato produtor→transferência→custódia→updater. [Código novo](custody_backup_local_v2.py), [ensaio concreto](test_receipt_chain.py) e [provas](PROOFS_SANITIZED.json). Não modifica o helper publicado anterior, pacote openai-v4, ack histórico, tentativa R0 DENY ou qualquer arquivo na VPS. P0/A/B, resets e renovação de backup continuam suspensos durante a [avaliação de alcance](../exposure-scope-20261015/REPORT.md).

## Causa e correção

O produtor original imprime `json.dumps(result)` com seu ordenamento/espaçamento e newline do stdout. A custódia antiga transformava esses bytes em JSON ordenado com nova gravação e calculava o ack sobre a representação transformada. O updater exige o hash dos bytes do recibo de origem. Equivalência semântica não satisfaz essa identidade.

A v2 lê o recibo por descritor O_NOFOLLOW/O_NONBLOCK, exige arquivo regular600/owner/nlink1 e origem privada700, limita tamanho, verifica estabilidade de metadados durante a leitura e compara com SHA256 **do produtor por canal legítimo**. Usa esses mesmos bytes para guardar `backup-result.private.json`, sem reserializar. Ack/index/lab novos continuam JSON normalizados como antes; `receiptSha256` aponta para a cópia byte a byte. Destino precisa ser novo sob diretório700 do owner; nega antes da transferência/gravação se inadequado. Não altera verificação de dump, catálogo614, prova de restore retido/parado ou exigências do updater.

Código do produtor e updater preservados; reutilizados por composição. Nenhum binding é alterado para aceitar ack divergente. O SHA de transporte não deve ser gerado silenciosamente da cópia recebida e tratado como origem aprovada: exige referência independente do recibo emitido. Esta melhoria ainda deve ser incorporada/revisada em geração futura antes de qualquer uso operacional.

## Prova executada

**16 testes PASS**, incluindo a cadeia concreta:

1. Reexecuta somente a expressão de serialização extraída por AST do produtor revisado, sobre o recibo histórico já emitido. Compara exatamente com o stdout original preservado; não chama backup.
2. Transferência simulada por cópia byte a byte local, com SHA do produtor. Dump histórico existente também é copiado localmente; não há SSH/SCP real.
3. Executa o novo helper inteiro. `pg_restore --list` real confere o dump existente/catálogo614. `pg_ctl status` real confere laboratório certificado retido/parado; sem restore/start/removal.
4. Em cópia descartável dos171 arquivos completos, executa a função real `refresh()` do wrapper e o updater canônico dos4modos. O antigo ack produz `custody_binding`/DENY antes de criar intent; o ack novo permite a atualização completa.
5. Checker canônico completo, validação de restore dos4modos e hashes passam localmente. Somente o conjunto permitido de provas muda na cópia; código, política, instalador, perfis e demais arquivos ficam iguais. `temporaryDatabaseRemoved=false` permanece.

Substituições explícitas: transporte por arquivos locais; `check(live=True)` usa sua mesma validação completa `live=False`, pois identidades/caminhos/referências exclusivas da VPS não são exercitadas no laboratório; leitura do dump remoto é mapeada ao dump off-host íntegro. Relógio histórico é injetado somente para ensaiar o updater com o recibo antigo, sem fingir RPO atual. Nenhuma prova desta suíte renova frescor ou autoriza produção. Os arquivos concretos completos são usados; não há fixture vazia de restore/perfis.

Negativas dirigidas: reserialização semanticamente igual, digest inválido/divergente, modo do arquivo, diretório de origem, owner do arquivo, destino inadequado antes da transferência, symlink, hardlink, JSON inválido/não objeto, tamanho, alteração durante leitura e tentativa de sobrescrever arquivo existente. A recusa original é reproduzida na cópia, não reexecutada no host.

## Comandos locais e fronteira de revisão

Ensaio local, sem rede/produção, usando recibo/dump/candidato já preservados no computador do owner:

```bash
python3 -B docs/reviews/automation-freeform-window-release-af26/security-containment-20261012/receipt-custody-v2-20261015/test_receipt_chain.py
```

Interface **para revisão futura**, não executar no R0 consumido:

```bash
python3 -B custody_backup_local_v2.py \
  --receipt "$NEW_TRANSFERRED_ORIGINAL_RECEIPT" \
  --receipt-sha256 "$REVIEWED_PRODUCER_RECEIPT_SHA256" \
  --out "$NEW_PRIVATE_CUSTODY_DIRECTORY"
```

Os parâmetros exigem nova decisão/contexto apropriados; não reutilizar o ack ou diretório DENY, não repetir backup para conseguir prazo, não atualizar a preparação histórica no lugar. O ensaio é repetível localmente em diretórios temporários privados; não é uma operação de renovação produtiva.

Os15 testes de perfis e63 provas operacionais anteriores não afetados continuam históricos reutilizados; não foram reconstruídos ou reinterpretados como aceitação de produção. A nova suíte testa especificamente a lacuna que escapou: a serialização efetiva do produtor e o ack consumido pelo wrapper, não apenas a função pura de cálculo de updates. Sem instalação, extração/build, chamadas ao provedor, credenciais novas ou rotação. Responsável Deifson; revisão15/10/próxima21/10, antecipar após alterações.
