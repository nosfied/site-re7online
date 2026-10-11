# Frontend3227 — encerramento da janela de 11/10/2026

**DEPLOYED TECHNICALLY / OWNER UI CONFIRMED.** Frontend `3227b2d752110873f0eff4ee5253a6f06ca51549` ativo, supervisão permanente promovida, PM2 saved/fallback conferidos e `execution-authorized=false`. API preventiva sobre a26 e worker mínimo afbb mantêm as identidades anteriores. A implantação e a confirmação das telas não encerram o aceite funcional independente da API, CSV/Syer, internacionais, multilote, contingência AUTO ou CRA-PR.

## Sequência e horários comprovados

Autorização de janela conforme a32e16ca, exclusivamente frontend; correção restrita adicional a91c538b aprovada explicitamente pelo owner. Produção não recebeu campanhas/mensagens de teste, claim, abertura da guarda, retomada de job, recuperação histórica, migration ou restart para diagnóstico.

| Marco | UTC em 11/10/2026 | Fortaleza |
|---|---|---|
| Reconferência global antes da janela | 10:45:11 | 07:45:11 |
| Observação before nova PASS | 10:47:33 | 07:47:33 |
| Solicitação de parada fa60 | 10:47:57,649 | 07:47:57,649 |
| Saída root nova PASS | 10:48:15 | 07:48:15 |
| Única partida3227 | 10:48:38 | 07:48:38 |
| Readiness/identidade/BUILD_ID/CSS concluídos | 10:48:43,771 | 07:48:43,771 |
| Owner confirmou layout/sessão/telas/detalhe em leitura | 10:51:15 | 07:51:15 |
| Promoção/supervisão/save/fallback/gatefalse concluídos | 11:07:23 | 08:07:23 |
| Leitura final delimitada PASS | 11:08:10–11:08:13 | 08:08:10–08:08:13 |

**Intervalo medido entre solicitação de parada e prontidão técnica: 46,122 segundos.** Trata-se dessa medição operacional, não de telemetria de todas as requisições de usuários. A espera posterior pela política permanente não foi contabilizada como indisponibilidade:3227 já atendia e o owner havia confirmado as telas. No horizonte de15 minutos foi comunicado o estado disponível e o bloqueio de conclusão da supervisão; o prazo não levou a bypass ou nova partida.

Manifests, configurações, capacidade/WAL, identidade/controles, inventário congelado e retorno foram reconferidos antes da parada. Cada gate usou observação nova; a captura preparatória arquivada não serviu como certificado de saída. Partida candidata única, return-intent ausente, sem retorno nesta janela. Tar/build/provas funcionais foram reutilizados, sem rebuild ou suíte ampla.

## Incidente e correção autorizada

Após confirmação das telas, `check-permanent-policy.py` recusou `reader_integrity`, exit1/timeoutfalse. A política permanente ed28 fixava o reader935, enquanto o reader diagnóstico aprovado/instalado era c885. A dependência havia sido omitida na auditoria da composição. [Causa, bytes e quatro provas dirigidas](PERMANENT_READER_BLOCK_2026-10-11.md) preservados. Não era recusa transitória, nem defeito do layout3227; não houve repetição de start ou alteração de identidade para obter PASS.

O owner aprovou e executou o instalador33255a13. Campo funcional único `readerSha256` atualizado; política anterior root:root600 arquivada, três referências privadas e manifesto anteriores preservados em `.before-reader-upgrade`. Hashes/campo único/root600/cadeia/visudo PASS; leitura permanente real PASS. Helper permanente, helper diagnóstico, ambos sudoers, roles e configuração PM2 não foram alterados por essa correção. A dependência também afetava a supervisão do retorno fa60 e foi resolvida antes de promover.

O canal SSH original de controle deixou de responder durante a entrega do lock. Foi encerrado apenas o shell do coordenador, identificado com FD9 no arquivo window.lock e sem filhos; aplicação/daemon PM2 não foram sinalizados. Liberação do lock comprovada antes do instalador, que adquiriu o mesmo lock. Após o bloco do owner, nova execução exclusiva conferiu candidato e leitura permanente, promoveu uma vez, salvou PM2/fallback e fechou o gate. A falha DNS do sandbox em comandos auxiliares foi anterior à conexão; preservada, sem repetição de ação operacional executada.

## Artefatos e hashes finais

| Artefato | SHA-256 / identidade |
|---|---|
| Tar frontend3227 exato | `9b54548e4a7763f5078ae0433aceb43a37567eccd988814dd82f2fab97229319` |
| BUILD_ID | `8OqIZZxaW7_ogf6h7AVoe` |
| Manifesto completo do pacote | `32349250b8bd73fe30c37d761d43a47185a2c9b33c9e4715f5a25265dd581f60` |
| CSS efetivamente servido HTTP200/text/css,187044bytes | `1ddf8dca7f9965191239b7aef3b8ce92374ccf637ca421d3ad75a0cc964eab64` |
| Helper diagnóstico instalado, preservado | `c885486f0a34c15f6b2a66af311eb151bc66f8d22c9790c35ae729dff1cbad30` |
| Política janela preservada | `7a9615f9685cc818d0b4254908d3fea482d056207b8bb81e420ce7367bbfd472` |
| Política permanente instalada após correção | `3519d4b1ed13fe5d0639df4735314b5f674d3a4f991b48e72511d4f6c5c44391` |
| Política permanente arquivada | `ed28e68f46b768aa667df355121d2e27c0039de87582f9fa787dc127ba440a83` |
| scripts.sha256 inalterado | `6bd3c775e839bf53219c4b88a868bb46fb3da40f788107d91aa05109541310e5` |
| bindings.sha256 final, PASS integral após gatefalse | `ae404062e78b23a7afc23d88797763cd91a939c3da79ef5464530a84244a1503` |
| Manifesto de bindings anterior preservado | `7c40b7e6ec841b942d12891e03676a7986e8d129b34f109635a55020defd2c95` |
| Saved/fallback iguais | `ade67e37c8e7f08d004f502ab8c448d135edafe2aa652f7a6fb5896f09c0c770` |
| Evidência privada off-host da preparação/diagnósticos finais | `3cce97c032c58e10b09f6f026ada40fd767e37f1063af9533072e48fc6fe1872` |

Cópia off-host efetivamente transferida, hash/extração isolada/ambos manifests revalidados. Primeira transferência auxiliar falhou por ausência do diretório local de destino, sem alterar produção; destino criado e transferência concluída. Configurações, credenciais, nonces, JSONs, dumps, logs e tar permanecem fora do Git. Diretórios operacionais de candidato, fa60 retorno e gerações anteriores são dependências preservadas de supervisão/dumps; nenhuma limpeza autorizada ou executada.

## Estado final e limites

| Componente / verificação | Resultado e evidência |
|---|---|
| Frontend3227 | PID4121573/start ticks2150012070/restart0, control candidate da geração101500; identidade/BUILD_ID/CSS/HTTP PASS |
| API preventiva | PID4049504/ticks2146911015/restart0, mesma release preventiva sobre a26 |
| Worker mínimo afbb | PID4049657/ticks2146911319/restart0, mesma release e identidade |
| Supervisão permanente | enable-supervision-candidate PASS, leituras reais supervised-candidate PASS; sem novo start, daemon preservado |
| Health/DB | PASS, leitura limitada; SQL READ ONLY/timeouts, sem entrypoint/provider |
| Guarda / inventário | fechada38/tasks{}, sem markers; inventário congelado canônico conferido, job suspenso, recuperação.6/recibo preservados; seis delivered reportados e cinco posições sem Outbound |
| Sessões/auth | inventário conectado/auth conferido pelo contrato congelado; owner confirmou sessão/telas. Não prova envio funcional por cada transporte |
| Controles | cron igual à baseline; boot inactive/enabled igual; barreira ausente; scheduler/inventário preservados, sem tick forçado |
| PM2 saved/fallback | hashes iguais e configurações/ambiente/controls correspondentes ao conjunto ativo; gatefalse |
| Capacidade final | 2.356.797.440bytes disponíveis a deploy/6.861.050inodes; WAL83.886.080bytes, slots0/archivefailures0/archiveoff, PGDATA/filesystem conferidos. Observação datada, não garantia indefinida |

Backup frontend-only seguiu o contrato existente: preservação operacional off-host e prova anterior SQL/restore mantida, sem novo dump apresentado como fresco e sem restore produtivo, pois DB/schema/auth não mudaram. Não foi ensaiado reboot/resurrect produtivo; as provas isoladas anteriores permanecem válidas e não foram reatribuídas a esta janela.

**Pendências independentes:** aceite funcional da API; CSV/Syer; suporte internacional; cinco destinatários de out.15 sem submissão/job suspenso; multilote e contingência AUTO por ocorrência natural; CRA-PR com aceite próprio. Recuperação.6 encerrada e setembro CLOSED permanecem encerrados. Esta janela não abre campanhas nem autoriza retomada.
