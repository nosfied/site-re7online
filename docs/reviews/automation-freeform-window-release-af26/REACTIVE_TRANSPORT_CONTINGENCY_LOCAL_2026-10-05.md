# Contingência de transporte reativo — 05/10/2026

**LOCAL VALIDATED / NOT DEPLOYED. Publicação exclusivamente para revisão.**

Base API: `6c30b7e45f903823bc593c268c359a97c9687df3`. Preservados b9/af26/879, identidade híbrida, janela legítima, CAS de automação e configuração transacional. Nenhum deploy/restart, envio produtivo, alteração de tenant ou reparo histórico foi executado.

## Auditoria e menor delta

O resolvedor compartilhado já diferenciava seleção explícita, modo configurado, readiness e intenção rígida de template. Entretanto, o protocolo escolhia exclusivamente o provider do inbound; o chatbot Web enviava exclusivamente via Web; Inbox e automação Meta podiam continuar pelo provider original quando o resolvedor retornava unavailable. Esses caminhos não eram uma contingência coerente.

`crm/crmConversationStart.ts::resolveEffectiveWhatsappOutboundTransport` recebe três intenções reativas: `INTERACTIVE_REPLY`, `PROTOCOL_NOTICE`, `REACTIVE_AUTOMATION`. Seleções explícitas mantêm um único transporte. HYBRID/AUTO mantém preferência Web; somente o estado persistido **disconnected + observedState DISCONNECTED**, com conta/feature/outbound/runtime habilitados, admite selecionar Meta antes da submissão. O resolvedor híbrido existente exige o mesmo número público autorizado entre Web/Meta, sem conflito nem substituição pendente. QR_REQUIRED, ausência, desabilitação ou estado desconhecido negam; nenhum timeout é convertido em prova de indisponibilidade.

`whatsapp/reactiveOutboundPolicy.ts::revalidateReactiveSubmission` relê clientId/clientKey ACTIVE, decisão, a conta Web efetivamente preparada (sem aceitar substituta) ou as credenciais/phoneNumberId Meta efetivamente preparados, canal WhatsApp e janela no runtime canônico, imediatamente antes do I/O. Exige lastInboundAt real, não futuro, dentro das últimas 24h, windowIsOpen e expiração futura. Mudança de decisão nega esta tentativa; não busca outro sender. Automação também compara todos os campos do token existente, inclusive updatedAt/answers/inbound/version/mode/status/handoff/responsável/departamento/fila/fechamento/provider/conta. Não cria janela nem altera configuração.

- `http/routes.ts`: texto/resposta pronta/mídia da Inbox usam a intenção interativa; resultado unavailable não volta ao provider original. Protocolo usa intenção própria. Meta revalida após credenciais/assinatura; mídia revalida antes do upload e novamente antes da submissão. Web recebe callback após preparo e antes do controle HTTP.
- `whatsapp/reactiveBotOutbound.ts`: uma decisão, um sender, um resultado persistido. Reutiliza credenciais Meta, valida sua vinculação ao tenant, usage/ledger/persistência e o sender Web existentes. Outbound aceito mantém atividade monotônica e ganha atualização própria do fence por CAS; não reescreve transporte/conta do inbound nem estado humano concorrente.
- `whatsapp/webhook.controller.ts` e `web-session/webSessionInbound.ts`: automações DB-backed Meta/IA e Web/chatbot chamam o mesmo serviço; permanecem os guards anteriores de handoff/late reply e privacidade.
- `conversation/runtimeWriteFence.ts`: API acrescenta somente a opção de preservar transporte na atividade própria. O worker conserva o adaptador SQL b9, sem troca pelo adaptador ORM da API.

No worker, o ensaio integrado encontrou um predicado de atividade preexistente que misturava timestamp UTC sem fuso com parâmetro convertido pelo fuso PostgreSQL da conexão. O token completo coincidia, mas `lastOutboundAt <= sentAt` dava false no segundo turno. O patch mínimo usa o **dateParam UTC já existente** também nessa comparação; não remove campos do fence. PostgreSQL isolado em America/Fortaleza demonstrou avanço após o ajuste. A base SQL também distingue SQL NULL de JSON null; não houve ampliação dessa semântica. Fixtures de estado válido usam answers `{}`.

## Política mantida e limites

[Contrato canônico atualizado](../../saas/whatsapp-transport-policy.md#reactive-contingency--05102026-local-validated--not-deployed).

| Caso | Decisão / evidência |
| --- | --- |
| HYBRID/AUTO, Web pronto | Web; teste compilado dos dois componentes. |
| Web desconectado comprovado, Meta compatível habilitado, janela aberta | Meta pré-submissão; três intenções exercitadas. |
| Seleção explícita Meta/Web | Somente selecionado; sem fallback. |
| Política/conta/feature desabilitada, identidade ausente/conflitante | Negado; indisponibilidade não substitui autorização. |
| Janela expirada durante preparo ou sem inbound comprovável | Negado antes do sender; zero outbound/submissões no caso controlado. |
| Intervenção humana antes da chamada | Automação negada pelo token; sem envio. |
| Intervenção durante chamada já submetida | Outbound aceito preservado; persistência automática obsoleta negada, HUMAN mantido. Não cancela chamada. |
| Timeout ambíguo Web ou Meta | Uma tentativa FAILED, nenhum segundo sender; sem retry automático. FAILED não prova ausência de entrega externa. |
| Conta Web preparada desabilitada/substituída ou credencial Meta trocada | Negado antes da submissão; teste com barreira e zero outbound. Nenhuma substituição automática. |
| Outro tenant/clientKey | Negado; fixtures têm identidades isoladas e não duplicam Conversation/runtime. |
| Campanha/template | Meta-only; resolvedor rígido e handlers existentes preservados. |
| Início de conversa via Web | Exceção separada anterior preservada, não concedida por intenção reativa. |

Modalidades auditadas: **Manual/avulsa**, **Audiência CRM** (seleção/lista/segmento) e **Importação CSV** (individual/agrupada). `/app/campaigns`, `/app/campaigns/audience-preview`, `/app/campaigns/drafts/csv`, send/test-send e scheduler continuam na execução Meta de template. Públicos, execução imediata/agendada e agrupamento não selecionam transporte Web. Não foi modificada nem reexecutada indiscriminadamente a suíte de campanhas; reaproveitadas suas provas anteriores e revalidado o resolvedor Meta-only modificado indiretamente. O aceite produtivo CRM/CSV continua pendente do owner.

A verificação é pontual imediatamente antes da chamada, não atomicidade com provider. Readiness persistida pode ficar defasada; um socket ainda marcado conectado que falha no envio **não** aciona alternativa. Resultado aceito seguido de falha de persistência não autoriza reenvio. A coordenação/cancelamento de respostas automáticas já submetidas continua limitação separada da frente maior pendente. Nenhum lock é mantido durante rede.

## Resultados locais e versão validada

Node **20.20.0**, PostgreSQL **16**, banco criado isoladamente, somente fixtures sintéticas e providers/controle HTTP simulados. Não inicializadas sessões ou aplicação produtiva. Build API final `tsc -p tsconfig.json` PASS. Frontend não alterado nem reconstruído.

| Execução | Resultado e alcance |
| --- | --- |
| API compilada final: reactiveOutboundPolicy | 12 PASS / 0 FAIL: política, conta preparada, janela, concorrência, fluxo e fuso controlado. |
| API compilada final: crmConversationStart + webhookApiWebWindow | 11 PASS / 0 FAIL: contact-start/template e janela API→Web; escopo diretamente afetado pelo ajuste final de conta. |
| API real HTTP: novo teste de claim/protocolo/Inbox por intenção + falha Meta protocolo | 2 PASS / 0 FAIL, demais 139 SKIPPED. ADMIN sintético autenticado, protocolo e resposta Meta em conversa de origem Web, sem duplicação. |
| API compilada: webSessionOutboundService | 10 PASS / 0 FAIL: readiness, aliases, seleção de conta e avisos anteriores. |
| automationOwnActivity (harness VM + funções reais, source via tsx) | Primeira rodada: 15 PASS e quatro falhas de harness; corrigidos bindings/imports do harness. Reexecução dos quatro: 4 PASS, 15 SKIPPED; novamente 4 PASS após o ajuste final de conta. IA Meta/Web, CAS, atividade própria e guards de janela; não é execução integral de aplicação compilada. |
| Worker mínimo extraído e empacotado: reactiveOutboundPolicy | 12 PASS / 0 FAIL após correção UTC e vinculação da conta preparada: inclui consentimento 1/2 e múltiplos turnos persistidos, concorrência e negativos. |
| Extensão final de timeout para ambos os providers | Um caso reexecutado na API e no worker: 1 PASS / 0 FAIL em cada, nove SKIPPED. Depois incluído nas rodadas finais de 12 casos. Não somar execuções como casos distintos. |
| Fuso controlado (CAS sem provider/lock de rede) | Um caso adicional: API e worker PASS; predicado antigo do worker reproduz FAIL. Duas escritas próprias sob SET LOCAL TIME ZONE America/Fortaleza. |
| Tar final reextraído, manifesto/symlinks e casos selecionados | Integridade PASS; 5 PASS / 0 FAIL, sete SKIPPED: consentimento 1/2, timeout Web/Meta, fuso controlado e troca de conta preparada; sem acesso à árvore de desenvolvimento. Receita publicada também executada: PASS. |

O build do worker usa `tsc --noCheck`: **não aprova tipos**. A checagem integral `tsc -p apps/whatsapp-web-worker/tsconfig.json --noEmit`, com as mesmas dependências da base atestada, retorna **16 diagnósticos preexistentes**. Mensagens completas comparadas e idênticas após normalizar raiz e posições; não apenas contagem. Incluem tipos Prisma anteriores e testes/advisory-lock/worker antigos. Nenhum diagnóstico novo; nenhuma correção incidental dessas áreas.

As provas não representam teste produtivo de todos os payloads de mídia, política real do provider ou recuperação de sessão. Campanhas/CRA aguardam owner; SECULT aceita e DB-only encerrada; inatividade Guia pausada; históricos/reparo de setembro preservados.

## Artefatos e reprodução

[Patch mínimo](worker-reactive-transport-20261005.patch), [manifesto origem/resultado](worker-reactive-transport-20261005.manifest.json), [manifesto completo](worker-reactive-transport-20261005.files.sha256), [symlinks](worker-reactive-transport-20261005.symlinks.txt).

Tar candidato local: `f6ff82ad02042186b75707bd69721fe9630e2c9032464f73f80e441865425af6`. Patch: `dedb781bf54975a0909161253f301db8849882a7a54fcd019267a3592553e0ca`. [Hashes dos compilados API executados](reactive-transport-api-20261005.files.sha256).

Origem tar b9: `236c1d502df5767eb7cde726ce0d7ae7c6e8200489cac4d09a417b08d98c0e98`. Fontes: base mínima bf5+f06+912+b66+af26+backport b9 atestada pelo manifesto `worker-hybrid-return-identity-20261004.manifest.json`, não worker completo da árvore atual. Patch tem sete fontes, incluindo teste, e preserva o entrypoint/supervisão. Grafo compilado alcançável: **83 módulos**, somente **11 compilados alterados/adicionados**. Cinco módulos auxiliares existentes passam a ser alcançáveis para Meta; suas fontes são byte a byte iguais na base/API e estão listadas no manifesto. Dependências e Prisma do tar original preservados; sem schema/migration.

Em diretório vazio: confira o hash da origem e hashes before das fontes; aplique `patch -p1 < worker-reactive-transport-20261005.patch`; confira hashes after; emita `tsc -p apps/whatsapp-web-worker/tsconfig.json --noCheck` com dependências atestadas. A receita [package-reactive-worker.py](package-reactive-worker.py) monta somente os overlays pinados e exige o manifesto completo esperado, sem gerar credenciais/auth. O tar fica em evidência privada; binários/dependências/dados operacionais não estão no Git.

Exemplo de comando de prova em laboratório sintético, raiz do pacote extraído:

```bash
DATABASE_URL=postgresql://LAB_USER@127.0.0.1:55432/re7_transport_contingency_LAB \
ENV=test WHATSAPP_WEB_WORKER_CONTROL_URL=http://worker.invalid \
OUTBOUND_TEXT_ENABLED=true CONV_STATE_READ_SOURCE=postgres \
CONV_STATE_JSON_WRITE_ENABLED=false STORAGE_MODE=postgres \
/path/to/node-20.20.0 --test \
apps/whatsapp-web-worker/dist/whatsapp-agent/src/whatsapp/reactiveOutboundPolicy.test.js
```

O teste recusa URL fora desse banco/host/porta; crie o banco isolado com o schema vigente, sem copiar dados produtivos. `fetch` é simulado no harness. API usa os mesmos testes em `apps/whatsapp-agent/dist`, e rotas/harness têm comandos selecionados descritos na tabela.

## Publicação e próximo passo

Branch `review/campaign-recovery-20260926`, fast-forward sobre a base acima, sem merge/force. `vercel.json::git.deploymentEnabled` desabilita explicitamente esta branch; `.github/workflows/ci.yml` só dispara push em main/develop. Cron deploy lido nesta etapa: seis jobs de backup/manutenção, nenhum deploy ativo. Remoto confirmado na base; push somente fast-forward. A publicação não muda refs de deploy ou processos. Logs completos, `.data`, auth, evidências e tar privados excluídos do staging.

Próximo passo: revisão independente do delta API e patch específico do worker; eventual preparação/janela coordenada será decisão separada. Não implantar somente API presumindo automação Web corrigida; worker mínimo também precisa deste backport. Não há configuração nova a ativar.
