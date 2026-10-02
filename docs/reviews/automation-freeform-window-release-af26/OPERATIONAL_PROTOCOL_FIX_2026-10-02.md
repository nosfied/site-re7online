# Correção local do protocolo operacional af26 — 02/10/2026

**LOCAL VALIDATED / NOT DEPLOYED.** Esta correção atinge somente o pacote privado de execução da janela, não a API, o frontend, o worker nem configurações de tenant. A janela anterior terminou em [retorno compatível](WINDOW_RETURN_2026-10-02.md); nenhuma troca, contenção ou reinício ocorreu nesta rodada. O [patch sanitizado](operational-proof-protocol-20261002.patch) contém apenas as diferenças de `ops.py` e `delegated.py`. Aplicá-lo ao par original e copiá-lo para `switch`, `return`, `return-partial` e `return-front-missing` produz os mesmos hashes em todos os modos.

| Fonte | Original SHA-256 | Corrigido SHA-256 |
| --- | --- | --- |
| `ops.py` | `ca22bdd654f65edd75fdb1283355e51563c7adfb661aa0918589153da92fc2da` | `48cf00dbeedc5c1e00432c06070e618d69cf07f48f5d849c91be809db59944f5` |
| `delegated.py` | `e637b60949a568119c8533606bdbfcb11aa6a1e563f2610d2b8fb3786e60bbbb` | `c60b36f93e3977da8c7ce7646f28d3f7c3f3d70f8c393b48c29db9ba1675c1c6` |

Patch SHA-256: `c32e25d9d9b583c3f79d79cc2d40f8a7cb7c25a177363fd621993761a52da9e6`. `git apply --check` e aplicação em cópia dos dois scripts originais passaram; os hashes resultantes coincidiram com a tabela. Os quatro `scripts.sha256` privados foram atualizados **localmente** apenas para essas fontes; manifests anteriores e evidências da execução foram preservados. Este pacote completo não foi instalado na VPS; o reparo emergencial menor da janela anterior permaneceu apenas na evidência privada do `return-partial` já encerrado.

## Contrato corrigido

- A identidade estável compara PID e tempo de início do `/proc`; `R↔S` não é restart. Zumbi, PID reutilizado com novo tempo, descendente antigo, socket capturado sobrevivente e outro proprietário continuam bloqueando. O frontend preservado também é confrontado com o certificado original antes de iniciar o par seguinte e antes de autorizar a retirada da contenção.
- Uma requisição/prova vencida gera **outro arquivo e nonce**, após releitura da guarda, composição/identidade PM2, certificado de saída, alvo e vínculos de auth; cron, supervisão e negativa de loopback são reconfirmados onde há contenção. O owner registra uma nova leitura nft exata vinculada ao nonce novo. A validade permanece 300 segundos. Arquivos anteriores, inclusive provas consumidas, não são removidos ou reescritos; nonce/prova antigos, geração/configuração alterada e replay são rejeitados.
- Uma prova consumida por falha antes de `start-intent` pode ser renovada somente se o alvo ainda estiver ausente e todos os gates atuais passarem. Após `stop-start` ou `start-intent`, não há repetição da ação: usa-se o modo de retorno correspondente e sua barreira de saída. `flock` não bloqueante, comum aos quatro modos **no mesmo host**, impede comandos operacionais paralelos; não coordena hosts distintos. A topologia de host único precisa ser reconfirmada em nova janela.
- O roteiro privado `OWNER-STEPS.txt` foi atualizado para passar explicitamente o nonce da requisição atual ao `record` no mesmo bloco do owner. O pacote original e os backups anteriores permanecem preservados fora do Git.

## Ensaio local

`python3 -m unittest test-package.py test-delegated.py -q`: **78/78 PASS** (44 de barreiras/processos, 34 de prova/coordenação). Relógio injetado cobriu atraso do owner, vencimento do request e da prova antes do start, renovação com nonce novo, rejeição do antigo, troca completa, falha de start após `start-intent` e `return-partial` sem sobreposição de proprietários. Também cobriu `R→S`, zumbi, tempo de início diferente, processo/descendente/socket sobrevivente, DB owner/lock e lock de janela entre modos. Não foi executado CLI operacional contra host, nft, PM2, provider ou DB de produção; o ensaio usa driver sintético e não comprova duração nem ausência retroativa de chamadas em voo. Builds de aplicação não foram repetidos porque não houve mudança funcional.

Testes privados preservados: `test-package.py` SHA-256 `f70a3efad19c3b8567f7ecd7b293eda7e6876c95e6aa2c5f41bde10bcb52e757`; `test-delegated.py` SHA-256 `0302935904ebd798d37c3f9e73dfe16be7ec303546be89e86e98ea2546de40c3`. `OWNER-STEPS.txt` local revisado SHA-256 `2d5e0dfc3bba1fb6257cae5a3e71fe1e8eaa5cbb90a7ec37741b9b898f8810d3`.

## Leitura pontual do impacto da janela anterior

Consultas `BEGIN READ ONLY`, com timeout de 10 segundos, examinaram 02/10/2026 18:36:49–19:16:31 UTC e duas faixas adjacentes de igual duração. `InboundMessage` e `OutboundMessage` tiveram **zero linhas persistidas** nas três faixas; `Message` e `WebhookAttempt`, zero durante a contenção. Durante a contenção, `Event` registrou 37 eventos: `chatbot.inactivity.handoff.skipped` 20, `whatsapp.web_session.connected` 6, `.connecting` 6, `.reconnecting` 2 e `.receipt.updated` 3. A leitura limitada dos logs PM2 encontrou, às 18:40:34 UTC, três `whatsapp.web.receipt.realtime_notify_failed`; a contenção da API já estava comprovada, tornando a indisponibilidade da notificação uma explicação compatível com o horário, **não prova causal isolada**. As três atualizações de recibo persistiram; não foi observado novo outbound persistido nesse intervalo. A leitura final anterior encontrou quatro sessões WEB_SESSION conectadas, uma desconectada e cinco registros de auth, com identidades de sessões/auth iguais ao baseline da janela.

Zero linhas persistidas **não prova** ausência de tráfego externo, resposta aceita sem persistência, atraso/perda de webhook ou integridade de retry. Logs podem omitir eventos e linhas multilinha sem timestamp; não se inferiu resultado por silêncio. Não houve reenvio, reconciliação, mudança de sessão ou inspeção de conteúdo/identificadores de clientes. O tratamento de qualquer resultado incerto requer caso concreto e decisão separada. META_CLOUD puro e híbrido API→WEB seguem sem exercício produtivo da release af26; Campanhas/CRA e demais frentes preservam seus estados anteriores.

Uma nova tentativa exige revisão deste patch no pacote hash-bound, novos artefatos/preflight/backup/restauração/provas e decisão de janela do owner. Os marcadores de 02/10 não são reutilizáveis.
