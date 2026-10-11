# Bloqueio pré-promoção: binding do reader permanente — 11/10/2026

**3227 SERVING / OWNER UI CONFIRMED / PERMANENT PROMOTION BLOCKED.** Não houve promoção, save/fallback ou retorno. API/worker e guarda38/job preservados. Gate de janela permanece true enquanto o estado é resolvido; não interpretá-lo como autorização de outra partida. Candidate start-intent consumido, return-intent ausente. O lock foi readquirido após a sessão original encerrar por set-e.

## Evidência e causa

A ida passou: manifests, capacidade/WAL/inventário/baseline, before NOVO, parada fa60, exited NOVO root, delete, única partida3227, readiness/identidade/BUILD_ID8OqIZZxaW7_ogf6h7AVoe e CSS HTTP/MIME/hash. Owner confirmou layout/sessão/Inbox/CRM/Campanhas/detalhe de lote. A política permanente falhou em check-permanent-policy.py antes de enable-supervision, com arquivo privado permanente1791715875902726827, exit1/timeoutfalse/stderr`frontend_permanent_observation_denied:reader_integrity`.

Causa comprovada no helper efetivo: [permanent-observer.py](../frontend-permanent-observer-20261007/permanent-observer.py) importa `/usr/local/libexec/re7/frontend-socket-observer.py` e exige seu digest==policy.readerSha256. Política instalada ed28e68f…440a83 ainda fixa93564f78…af385. Reader de diagnóstico instalado/aprovado é c885486f…cbad30. A auditoria de preparação conferiu roles/artifacts, mas omitiu essa dependência. A declaração anterior de compatibilidade integral da política permanente estava errada. Não é incidente funcional do3227 nem observação transiente; repetir a mesma leitura não pode corrigir o hash. Retorno fa60 **também** precisaria resolver essa verificação antes da promoção/supervisão/reboot; não se justifica parar o frontend saudável para reproduzir a mesma negativa.

## Delta mínimo concreto para decisão

Só um campo funcional da política root permanente: readerSha256935…→c885…. PM2, boot discovery, frontendPort, roles/release/entry/BUILD_ID/entry hashes e helper/sudoers ficam iguais. Os três arquivos de referência da preparação passam a descrever esses mesmos bytes, preservando os originais e o manifesto anterior. Nenhuma identidade/observação é adaptada nem inventada. Gatetrue é o estado autorizado desta janela, não drift; seu hash originalfalse permanece no manifesto para a conclusão canônica. Não se altera guard38/job/DB/auth.

| Bytes | SHA-256 |
|---|---|
| Política root origem | `ed28e68f46b768aa667df355121d2e27c0039de87582f9fa787dc127ba440a83` |
| Política proposta, apenas readerSha256 | `3519d4b1ed13fe5d0639df4735314b5f674d3a4f991b48e72511d4f6c5c44391` |
| Binding correspondente proposto | `c115243adfae88958c154b6d983adeee7e9eaf815ab82a8148b6d413654b3ca6` |
| Instalador revisável | `33255a1310a7ef43ab8acacb7fab9792665c1c64b276eefe6add0f77d6ec78b9` |

Bytes privados estão no diretório incoming101500. Destino único root:`/usr/local/libexec/re7/frontend-permanent-observer-policy.json`; arquivo antigo arquivado sem sobrescrever em`/usr/local/libexec/re7/frontend-permanent-observer-policy.pre-reader-diagnostic-101500.json`, root:root600. Sem instalação de helper ou sudoers. [Script integral](install-permanent-reader-binding-for-review.sh) valida campo único, hashes privados/origem/root/arquivado, referências/inventário de bindings antes da mutação, arquiva três arquivos e manifesto, aplica somente esse binding e executa uma leitura real sem promoção/save. Recusa/instalação parcial exige parar e inspecionar sem repetir.

**Mudança privilegiada adicional:** política permanente não estava incluída como substituição no roteiro de janela corrente (“existente/invariável”). Precisa de decisão explícita sobre estes bytes antes de instalar; não será feita silenciosamente. A promoção/save previamente autorizados podem continuar somente depois da leitura permanente completa PASS e da decisão requerida. Owner UI já confirmou; não pedir novamente essa confirmação se identidade/processo/layout permanecerem iguais.

Quatro provas dirigidas PASS sobre os dois estágios Python **efetivos** do instalador em arquivos sintéticos: delta único/binding e arquivos arquivados/gate preservados; drift de binding não relacionado nega antes do root step; mudança de outro campo nega; replay com arquivos históricos não sobrescreve. Bash syntax PASS. Isso **não comprova instalação root ou leitura produtiva da política proposta**. Nenhum build/suíte funcional repetido. [Testes](test_permanent_reader_binding.py).

## Comando após aprovação específica — não executado

Antes do bloco do owner, coordenador entrega o lock; o script o adquire exclusivamente. Depois readquirir lock e confirmar identidade do mesmo candidato antes da promoção. Nenhum start repetido ou intervalo com outro executor autorizado.

```bash
set -euo pipefail
I=/opt/re7online/backups/converta-persistent/preparations/frontend-3227b2d7-observation-incoming-20261011T101500Z
test "$(sha256sum "$I/install-permanent-reader-binding-for-review.sh" | cut -d' ' -f1)" = 33255a1310a7ef43ab8acacb7fab9792665c1c64b276eefe6add0f77d6ec78b9
bash "$I/install-permanent-reader-binding-for-review.sh"
```

Senha apenas na sessão sudo do owner. Esperado`PERMANENT_READER_HASH_POLICY_UPDATED_LIVE_READ_PASS_NO_PROMOTION`. Não repetir instalador de janela, preflight preparatório ou start. Após PASS e identidade confirmada: enable-supervision-candidate → supervised-candidate → pm2 save → fallback → supervised-candidate → gatefalse → leitura final/registro. Em DENY final, inspecionar o estado/binding antes de qualquer retorno; certificados de saída continuam necessários para um sucessor. A15min desde parada comunicar estado/impedimento; não bypass/kill. O3227 atende tráfego enquanto a promoção está impedida; não declarar implantação concluída.

## Resolução autorizada e comprovada

Owner aprovou o delta e executou o instalador33255a13; campo único/arquivamento/root600/visudo e leitura permanente real PASS. Promoção e saved/fallback concluídos sem nova partida. [Encerramento e evidências](EXECUTION_2026-10-11.md). Este documento preserva o bloqueio e a proposta históricos; não descreve mais o estado ativo.
