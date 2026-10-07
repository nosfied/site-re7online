# Integração final após instalação do observador permanente

Status: **INSTALLED VERIFIED / LIVE READ PASS**. Integração futura: **STAGED / WINDOW POLICY REVIEW REQUIRED / NOT DEPLOYED**.

A instalação autorizada de d49b2636 foi conferida na VPS: helper root:root 0644, política root:root 0600, sudoers root:root 0440; hashes completos em `manifest.json`. Visudo passou e a delegação permite somente `/usr/bin/python3 -I -S /usr/local/libexec/re7/frontend-permanent-observer.py`, sem argumentos. Nenhum launcher/checker ativo foi alterado.

`verify-live-read.py` é o validador efetivamente executado como deploy na preparação `frontend-permanent-observer-installed-20261007T232640Z`. Usa o cliente permanente aprovado e uma leitura sudo literal nova; verifica duas amostras completas, identidade kernel atual, árvore frontend, listener e proprietários do descritor compartilhado. Resultado: 154 processos em cada amostra, 0,171555 segundos, nenhuma captura histórica usada. JSON, stdout/stderr e código de saída ficam privados. Essa leitura da árvore viva não substitui a prova de ausência antes de uma partida, nem comprova reboot produtivo.

Frontend 9f e API/worker afbb continuam ativos, sem restart. Controle ativo, scripts críticos, identidades, helpers/regras de janela e saved/fallback foram comparados ao baseline e preservados. Diretório 194628 continua dependência permanente.

## Preparação concreta sem execução

Diretório novo: `/opt/re7online/backups/converta-persistent/preparations/frontend-fa60-final-permanent-20261007T234000Z`. Scripts12 e bindings15 conferidos; execução false, sem capturas de saída/intents. Tar corrigido17bd, manifesto completo, CSS expandido e retorno9f conferidos; sem rebuild, partidas ou repetição de suítes funcionais.

Os dois módulos aqui publicados são os bytes adaptados desse diretório. Os demais módulos são os já revisados, com hashes exatos em `manifest.json`; o cliente permanente e a reconstrução do checker original estão no diretório irmão `frontend-permanent-observer-20261007`. A adaptação muda constantes de diretório/release, sem mudar a lógica ensaiada. Configurações, nonces, política privada e evidências não são versionados.

`install-window-policy.sh` e `WINDOW-STEPS.txt` são comandos **propostos para revisão**, não executados nesta autorização. Somente a política de janela precisa mudar: eff1 →6087; helper e sudoers preservados, política anterior arquivada no caminho literal publicado. Depois da autorização própria, instalação/preflight preparatório sob política nova, gate false; observações preparatórias jamais substituem os três gates frescos de saída. Janela exige reconfirmação de exclusividade e identidades; mudança de boot/daemon não autoriza adaptar baseline silenciosamente.

Ida e retorno usam partida única, prontidão30s/30tentativas e logs privados; owner confirma sessão/Inbox/CRM/Campanhas e layout antes da promoção/save/fallback. Sobrevivente, listener, proprietário adicional, identidade divergente ou observação incompleta negam. Escalonamento15min não permite bypass. O leitor permanente descobre boot/daemon atual em cada recuperação, sem reutilizar identidades antigas; o observador de janela mantém binding fixo.

## Provas e limites

Reutilizados os ensaios publicados em d49: PM2 6.0.14/Node20.20.0/Next reais, save/resurrect com daemon novo, morte de Next e retorno9f; boot histórico e ilegibilidade local por injeção, instalação de laboratório simulada. Não foram reatribuídos a reboot real na VPS. Reutilizados smokes/CSS/navegador do tar exato. Nesta rodada houve somente instalação autorizada, leitura real, hashes/manifestos e staging isolado.

Recusa permanente nega antes de fork e exige diagnóstico; não se promete retry automático para toda falha transitória do leitor. Nenhum preflight da futura janela executado: depende da política nova revisada/autorizada. Nenhuma nova janela autorizada ou aberta nesta rodada.
