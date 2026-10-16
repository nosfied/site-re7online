# CSV — composição operacional para revisão

**LOCAL COMPOSED / LOCAL TESTED / NOT WINDOW BOUND / NOT DEPLOYED —16/10/2026, Fortaleza.** Complementa os [pacotes certificados](../crm-csv-coordinated-20261015/REPORT.md); não substitui provas anteriores nem autoriza janela. [Comandos](COMMANDS_FOR_REVIEW.txt), [matriz dos consumidores](MATRIX.md), [provas e hashes finais](PROOFS_SANITIZED.json).

## Entrega concreta

Geração privada `incident-csv-operational-review-v3-20261016`: quatro diretórios API completos, perfis PM2, contratos compartilhados de restore/crons, política proposta, instalador, admissão, CLI de execução/inspeção/recuperação, classificador de importações, aplicação restrita do literal Event e templates frontend. Configurações privadas não foram publicadas no Git. O verificador canônico confere arquivos, permissões, quatro modos, referências imutáveis não vazias, ecossistemas e o restore retido certificado. Nenhum boolean de remoção do laboratório foi alterado.

Os controles privados (tar de1.587.200 B e índice) foram copiados e conferidos na custódia permanente local do owner, diretório700/arquivos600. Hash do tar2c6250416fc8c7842cab5a77945fd639aaa0c20ebc108b8ca8acdd7f4110b371. Custódia off-host em relação à VPS; sem alegar réplica física independente. Os1.736.704 B alocados dos controles cabem na reserva já prevista, sem duplicar tars de runtime.

Os ambientes dos três processos são preservados integralmente: somente cwd/script da API apontam ao tar CSV24e5857f. Worker e frontend permanecem iguais durante a fase API. NEWauth+NEWDB+NEWcipher, reader histórico/v2 e credenciais externas não mudam. A preparação usa como referência a última captura aceita pós-cifragem; ela **não** é uma observação produtiva fresca.

O template frontend inclui os leitores/launcher/bootstrap efetivos, dois ecossistemas preparados e instalador CAS de políticas que preserva helpers/sudoers. O leitor foi corrigido em versão nova para aceitar a release de retorno certificada d41ddd64, em vez de exigir o diretório da origem. A recuperação continua usando API CSV candidata. O fallback para um certificado root de sockets de outubro foi retirado do caminho de exceção: observação nova incompleta nega.

`capture_phase.py` captura antes/depois sem comandar PM2; `bind_frontend.py` usa `frontend_phase_contract.validate` e certificados reais API/worker para emitir o vínculo. Sua materialização usa `frontend-check.init_run` real, com nonce/journal novos e metadados atuais, e gera políticas/manifests derivados. Não fabrica PIDs futuros, não modifica o template histórico e não instala política. As políticas derivadas e seus hashes precisam ser conferidos/revisados antes de instalação. Frontend não começa com recibo API ausente/falha.

## Ensaios e reutilização

**81 casos locais PASS** nos cinco grupos publicados. Os quatro modos usam arquivos concretos completos e `Operations.stop/start`, contratos de restore/ecossistema e `Sequencer.close_then_preflight/finish/recover` reais. O CLI cobre conclusão, falha pré-parada, partida API incerta sem replay, retorno sob contenção e drift do frontend. A admissão/pre-A negam prova ausente/divergente ou vencida antes do efeito; o binding nega fontes, orçamento e escopo incompletos antes de copiar.

A prova frontend usa captura completa retida e identidades de sucessores sintéticas **somente no laboratório**. Passaram o contrato de fase, materialização dos dois perfis/controles/políticas com o leitor real e o intent único de `frontend-action`. O módulo Event compilado do artefato certificado classifica os cinco controles como CRITICAL. Não se executaram CLIs de retenção, sequer dry-run.

Efeitos de sistema, transporte SQL/HTTP, autoridade/frescor e root foram substituídos no ensaio; isso não certifica nft, parada/partida, leitura produtiva de writers, disponibilidade HTTP ou instalação real. O chamador de pré-flight Node e observações externas são simulados no ensaio do sequenciador, enquanto os contratos completos e as pré-condições Python de Operations são executados. Provas anteriores não afetadas de transporte/restore e navegador/API/PG continuam referenciadas; não foram reatribuídas a este ensaio. A matriz explicita esse limite.

Nenhum build, recompilação da API, extração repetida, backup, consulta à VPS, importação real ou prova funcional CSV já válida foi repetida. Os rascunhos locais de composição e primeiras negativas do harness ficam preservados, fora da entrega; não são gerações produtivas consumidas. Sua classificação é arquivável após revisão/custódia, sem exclusão autorizada.

## Controle de confirmações e resultados

Não existe pausa seletiva de CSV identificada. A guarda38 **não controla CSV**: permanece fechada para preservar campanhas, não é usada como certificado de drain ou impedimento artificial desta entrega. O mecanismo existente é a contenção global V4 de ingressos API/frontend, com seu impacto humano sujeito à decisão da janela.

A saída canônica exige árvores PID/ticks, FDs/sockets, ownership completo e SQL zero sob fence. **Ausência de HTTP ou saída do executor não prova conclusão da importação.** Após a saída, o leitor faz somente SELECT, com deadline15s e limite100.000 eventos; exceder o limite nega, sem truncar e chamar o inventário completo. Agrupa recibos por tenant/operação, correlaciona o summary legado e conserva UNKNOWN para órfãos ou correlações insuficientes. PROCESSING/UNKNOWN impedem liberar o fluxo; não há reparo, reimportação ou rollback presumido. Atividade conhecida não observada no audit também nega. Histórico não registrado não é declarado certificado.

O literal de política Event dos consumidores `events-retention.ts`/`storage-report.ts` é conferido por hash/owner/modo/cadeia e substituído uma única vez sob fence, por intent/CAS/recibo, antes da API candidata. Não se executa retenção ou altera.env. O classificador novo permanece em todos os retornos. Drift do literal/consumidor exige revisão, sem atualizar oportunisticamente o hash de origem.

## Ordem e retorno

API candidata → saída/controles completos → certificado API → captura da fronteira → política/bindings frontend → frontend candidato. Durante a coexistência API nova/frontend anterior, POST antigo sem UUID recebe400 antes da admissão; não há replay automático. Os435 assets em união preservam referências estáticas de abas abertas; isso não torna o cliente antigo capaz de acompanhar o novo ledger. Orientar recarga do CRM após publicação.

O retorno disponível recupera o **frontend anterior com assets em união, mantendo backend candidato**, GET, ledger, rejeição de UUID ausente e Event crítico. Ele não corrige defeito da API, regressão de RBAC/contagens, falha funcional do ledger, incompatibilidade DB ou crash persistente do candidato. Esses casos exigem conter/inspecionar e revisar **outra versão de backend compatível**. Partida com intent sem certificado é incerta; não repetir start. Retorno pós-unfence exige geração/política novas. O modo canônico return-before-commit permanece conferido no pacote, mas o CLI CSV não oferece rollback do backend após seleção/partida candidata; a recuperação pré-parada mantém os processos originais sem os reiniciar.

## Requisitos reservados à janela

1. Decisão explícita e disponibilidade sudo; impacto da contenção global aceito. Nenhuma janela foi solicitada/executada agora.
2. Captura canônica fresca de identidades/configurações, saved/fallback600, ambas as fontes cron, writers/referências, SQL/proxy, capacidade/WAL/crescimento/erros. `bind_window.py` só produz namespace novo; template original fica intacto. Não altera entrada para aceitar drift.
3. Backup real sob backup.lock quando o RPO exigir; bytes originais do recibo, transferência/custódia e laboratório retido compatível conferidos. Reutilizar o restore somente se ferramentas/schema/fronteira continuarem válidos. Não renovar enquanto aguardamos revisão. Integração de custódia deve usar o contrato v2 de preservação dos bytes originais, sem reserializar recibos/ack históricos.
4. Fonte root fa113e/helper8de/sudoers62b5; provas root<10min/RPO real<1h, reconferidas em pre_install antes da primeira escrita. Renovação dos bindings/provas exige republicar review hash antes de A; não usar os hashes do template como hash final da janela.
5. Escopo de CSV conhecido e referências efetivas dos tools Event, metadados/ACL e hash exato do literal. Observar completude; órfãos/resultado desconhecido exigem inspeção/decisão, sem compensação.
6. Depois da API: identidades reais dos sucessores, certificados e fase frontend. Só então preencher vínculos de boot/daemon/árvores/nonces/políticas e publicar seus hashes. Permanência depende do aceite das telas, readiness e leitura permanente, não apenas health200.

O orçamento existente continua **11.235.700.736 B** mínimos entre deploy/PostgreSQL; controles medidos cabem na reserva32MiB já incluída. Sem abatimento por limpeza, soma aparente de dependências ou capacidade produtiva alegada. Pacotes volumosos e custódia certificados são reutilizados; templates privados não contêm cópias desses tars.

Responsável: Deifson Oliveira. Revisão16/10; próxima21/10, antecipar após mudança/definição de janela. NEWauth+NEWDB+NEWcipher, ambos crons, frontend/produção, out.15 CLOSED e guarda38 preservados. Prisma, limpeza e rotações externas não entram nesta entrega; segurança externa permanece OPEN com adiamento aceito pelo owner.
