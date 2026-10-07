# Preparação frontend fa60 com observador instalado

**WINDOW CONSUMED / RETURNED TO 9f / OWNER RETURN READ CONFIRMED / fa60 NOT DEPLOYED.**

O [relatório único](../FRONTEND_FA60F0F6_PREPARED_2026-10-07.md#nova-sequência-fa60-com-observador-instalado--0710) registra staging, artefatos e a negativa real. [Manifesto](manifest.json) contém hashes completos, inclusive arquivos privados sem publicar seu conteúdo.

- [Patch operacional](operational-paths.patch): apenas relocação do diretório em action/check; aplicar às origens versionadas em `../frontend-fa60f0f6-prepared/`. Launcher, bootstrap, cliente e contrato reutilizados sem alteração.
- [Diff sanitizado da política](policy-diff.sanitized.json): cinco campos; nonces representados somente por SHA-256.
- [Substituição restrita proposta](replace-policy.sh): revisão antes da instalação, arquivamento da política antiga; helper e sudoers preservados. Não executada.
- [Sequência, promoção e retornos](WINDOW-STEPS.txt): comandos de futura janela, não autorização. Controle falso; nenhuma partida emitida.
- [Hashes dos comandos](review-commands.sha256).

A política instalada ainda é a geração observacional antiga. A chamada real dos bytes finais foi recusada por `socket_observer_integrity_binding`, sem mutação operacional. Depois de aprovada/instalada a política nova, é obrigatório completar o preflight integrado antes de avaliar uma janela. Saída de origem/candidato/retorno exige observações novas; nenhuma evidência preparatória substitui esses gates.

## Resultado posterior à autorização específica

[Resultado sanitizado](policy-preflight-result.json): owner substituiu exclusivamente a política pelo comando revisado, arquivando a anterior. Preflight integrado real PASS, duas observações completas, sem retry, gatefalse. Helper/sudoers preservados. `manifest.json` e a negativa inicial permanecem registros históricos da preparação; o resultado novo registra a instalação e leitura posteriores, sem reescrever aquelas evidências. Nenhuma autorização de janela foi concedida nesta etapa; os três gates de saída precisarão obter leituras novas.

## Resultado da janela posterior

Candidato fa60 rejeitado pelo owner por layout desconfigurado, sem promoção. Retorno9f concluído após correção restrita do gate publicada em95b2d33d, uma partida de cada lado, leituras novas, owner confirmou telas e supervisão/saved/fallback promovidos. [Registro final](../frontend-recovery-observation-20261007/returned-result.json). Gatefalse, tentativa consumida; `WINDOW-STEPS.txt` é histórico e não pode ser reexecutado com esses intents/controles. Launcher/checker/controles/journals deste staging agora são dependências permanentes do9f e do dump salvo; preservar enquanto referenciados.
