# Auditoria isolada: layout fa60 e recuperação permanente

Resultado consolidado no [relatório único](../FRONTEND_FA60F0F6_PREPARED_2026-10-07.md#causa-do-layout-demonstrada-e-supervisão-ensaiada--0710). Correções **somente locais, para revisão / NOT DEPLOYED**. Não se criou preparação/janela, binding produtivo ou autorização de execução. Staging do 9f ativo intacto.

## Reprodução do defeito do tar original

Pré-requisitos preservados: Node20.20.0, Chrome, Next16.1.5 dos próprios pacotes, Linux user/PID/network namespaces, `ip` e dependência `ws` do driver existente. Primeiro conferir hashes dos tars e seus manifests completos usando o verificador já publicado. Extrair em diretórios novos. Driver utiliza fixture ADMIN sintética; nenhum backend/provider/DB ou credencial real. Nenhum asset Next é respondido pelo mock de API.

A partir da raiz do repositório, com as extrações utilizadas neste ensaio:

```bash
unshare -Urnpf --mount-proc sh -c 'ip link set lo up; python3 docs/reviews/automation-freeform-window-release-af26/frontend-layout-audit-20261007/compare_packages.py /tmp/re7-pm2-lab/node /tmp/re7-front-layout-audit-20261007/9f /tmp/re7-front-layout-audit-20261007/fa60 /tmp/re7-fa60-assets-reproduction FAIL'
```

Uma origem HTTP local e proxy preservando caminhos, rota `/app/campaigns`, mesma sessão sintética, viewport1400×1100, Fortaleza, cache desabilitado. Isso não é uma reprodução do TLS/Nginx produtivo. HTML Document separado dos prefetches RSC; scripts `nomodule` não carregados pelo Chrome moderno não são classificados como requests ausentes. CSS/JS efetivamente carregados, HTTP/MIME, CSS referenciado, estilos calculados, console/rede e screenshots privados são capturados.

9f PASS; fa60 original FAIL: ambos HTML/CSS/JS200 e MIME correto, sem exceção JS; CSS fa60 mantém `@tailwind` e não aplica classes. [Resultados sanitizados](results.json). Não se atribui o erro a cache, HTTP404 ou uma hipótese de CSS não servido.

## Correção de inputs e detector

`build-inputs.py` extrai inputs completos do commit funcional fa60; inclui explicitamente PostCSS e Tailwind, verifica lock/package contra origem preservada, reutiliza dependências sem install/update. Diretório novo obrigatório. Foi feita **uma compilação corretiva Node20** após a reprodução inicial sem rebuild. Nenhuma alteração de componente, horário, backend ou worker. `package.py` preserva assets antigos sem colisão, manifesto de cada arquivo/link/modo; tar e screenshots ficam privados.

```bash
python3 docs/reviews/automation-freeform-window-release-af26/frontend-layout-audit-20261007/build-inputs.py . fa60f0f6443f3e0a129dc707021cffdc408af817 /tmp/re7-front-fa60-build /tmp/re7-fa60-build-complete-inputs
unshare -Urnpf --mount-proc sh -c 'ip link set lo up; cd /tmp/re7-fa60-build-complete-inputs; env -i HOME=/tmp PATH=/usr/bin:/bin NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 /tmp/re7-pm2-lab/node node_modules/next/dist/bin/next build --webpack'
python3 docs/reviews/automation-freeform-window-release-af26/frontend-layout-audit-20261007/package.py /tmp/re7-fa60-build-complete-inputs /tmp/re7-front-layout-audit-20261007/9f /tmp/re7-fa60-artifact-new /tmp/re7-fa60-extraction-new
```

Comandos reproduzem o procedimento, não prometem BUILD_ID/tar idênticos em uma compilação nova. O artefato corretivo **já validado** e seu hash estão em `results.json`; nenhuma reconstrução no envio futuro. Este não é um pacote operacional pronto para janela.

Detector integrado ao smoke existente: `tests/browser/frontendAssetContract.mjs`, aplicado antes das interações em `campaignScheduleAndGroups.mjs`. Exige HTML200/text/html, CSS200/text/css, scripts200/MIME JavaScript, diretivas Tailwind expandidas e flex/gap/padding/fonte/radius aplicados. Os13casos de horários/conjuntos passaram sobre o tar corrigido extraído limpo. As7provas anteriores de leituras limitadas permanecem evidência funcional anterior, não uma reexecução ou prova visual deste tar.

## Recuperação permanente: patch e ensaio

`supervision.patch` adiciona ao preflight permanente o consumo **condicional** de leitura root fresca quando o inventário local recusa identidade nova ilegível. Reutiliza cliente, integridade/receipt e classificador efetivos; dois inventários, PID/ticks/ancestrais/grupos/roles e frescor continuam obrigatórios. Não transforma erro de leitura em exclusão. Cliente executa chamada sudo literal com cwd `/`, evitando classificar o próprio leitor como frontend apenas por herdar cwd da release. `Python -I -S` carrega explicitamente somente o cliente adjacente.

Montagem reproduzível dos bytes exatos, sem arquivos privados:

```bash
python3 docs/reviews/automation-freeform-window-release-af26/frontend-layout-audit-20261007/assemble-checker.py /tmp/re7-supervision-review-bytes
python3 docs/reviews/automation-freeform-window-release-af26/frontend-layout-audit-20261007/test_client.py /tmp/re7-supervision-review-bytes/socket_observation_client.py
unshare -Urnpf --mount-proc sh -c 'ip link set lo up; python3 docs/reviews/automation-freeform-window-release-af26/frontend-layout-audit-20261007/test_supervision.py /tmp/re7-supervision-review-bytes/frontend-check.py /tmp/re7-pm2-lab/node /tmp/re7-pm2-lab/pm2/bin/pm2 /tmp/re7-front-layout-audit-20261007/9f'
```

Node20/PM2 6.0.14 cluster→launcher→bootstrap→Next reais; daemon inventariado antes do control, como VPS. Morte do Next, saída do launcher, recuperação por PM2 e HTTP200 reais. **PermissionError local é injetado para um processo Node real**, não é reprodução do permissionamento SSH/VPS. Root observer executa os syscalls/classificadores efetivos no proc privado, não instalação/sudo do host. O teste não usa Python como substituto de PM2/Next.

Negativas dirigidas, mesmo comando de ensaio com os prefixos internos ao namespace:

- `LAB_EXPECT_DENY=unreadable_new_or_changed_process`, usando checker original reconstruído após `recovery.patch` e antes de `supervision.patch`: defeito anterior reproduzido.
- `LAB_EXPECT_DENY=socket_observer_read_denied LAB_NO_PRIVILEGE=1`: incapacidade privilegiada injetada, zero novo fork/control.
- `LAB_EXPECT_DENY=unreadable_observed_executor LAB_EXECUTOR=1`: processo Node real na release relevante permanece vivo; recusa.
- Sem prefixo: recuperação positiva, seguida de binding de ticks do daemon deliberadamente divergente; recusa antes do Next e histórico intacto.

Dois testes do cliente são simulações do subprocess para verificar chamada literal/cwd neutro e retenção600 de stdout/stderr/exit; não são ensaio sudo. Resultados não somados aos17testes sintéticos anteriores como casos novos de processo.

### Limite indispensável

Política instalada fixa boot e PID/ticks do daemon. Patch não altera helper/política/sudoers. Resolve leitura nova ilegível quando **o mesmo daemon atestado** está vivo e o binding adjacente está disponível. Após troca do daemon ou reboot, o caminho local legível mantém o contrato existente, mas um fallback root com política velha deve negar. Este ensaio não certifica recuperação privilegiada através de reboot/resurrect com daemon novo; não introduz relaxamento ou atualização silenciosa de política. Essa capacidade precisa de revisão explícita antes de declarar recuperabilidade permanente completa. Nenhum arquivo do staging ativo foi alterado.
