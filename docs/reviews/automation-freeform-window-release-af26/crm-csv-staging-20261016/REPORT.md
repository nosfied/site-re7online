**Estado corrente:** [preparação final coordenada, review56965c12…](FINAL_PREPARATION_FOR_REVIEW.md). Backup/custódia v2 e quatro provas renovados; root final PASS. Sem instalação/admissão/contenção/partidas. Os números abaixo registram o staging histórico; os atuais estão no complemento e não substituem seus recibos.

# CSV — staging inativo e conferência real

**READONLY PREPARATION PASS / INACTIVE STAGED / NOT INSTALLED / NOT ADMITTED —16/10/2026.** Base autorizada2c52fa2b. [Resultado/hashes](RESULT_SANITIZED.json), [comandos e pendências](COMMANDS_FOR_REVIEW.txt). Nove consumidores/verificações reais passaram na VPS às **06h49min30s Fortaleza**; não é certificado de execução da janela.

## Resultado e bytes

Geração vigente: `incident-6683-v4-csv-staged-v2-20261016T094000Z`, sob `/opt/re7online/backups/converta-persistent/preparations/`.

- Review: `06459884b2822c1fc1b252ced894f14b599d907133592173563aac6d7bb55819`.
- Política proposta: `4bc3454db8009dd6aef4db7c7e331c79278d37326c2438b9f668c6610a6b74b3`.
- Instalador: `e6523f6e0fcd27c78562b6a64ead60e642768fae6900a29b732d42d3ab21b921`.
- Envelope privado dos controles: `8d5ed9979c95ba247e3554b02e50a1ecfc7926a3c90791117b7e4f8402d1250b`.

API24e5857f, frontend ea3d2788, retorno frontend d41ddd64 e overlay ebdfd5bb recebidos **uma vez**, com manifests/hashes conferidos. Três runtimes extraídos uma vez em diretórios novos; 1.308.917.760 B alocados, sem percorrer os destinos dos links compartilhados. API usa os dois links já contratados, sem copiar dependências ou dados produtivos. A segunda geração dos controles reutiliza esses runtimes; nenhuma retransferência/reextração dos pacotes certificados.

Mínimo efetivamente disponível entre deploy/PostgreSQL no checker final: **16.421.658.624 B** (16,42 GB /15,29 GiB), acima do requisito planejado11.235.700.736 B. WAL **83.886.080 B (80 MiB)** nas leituras; sem crescimento observado entre elas. Isso não é previsão de crescimento futuro. Manter orçamento/WAL/erros novamente conferidos antes da janela.

Passaram: pacote concreto/447 arquivos API e referências, ecossistemas, baselines, checker real de configuração/identidades/saved/fallback600/SQL/proxy/health DB/dois crons/guarda38, quatro contratos de restore e SELECT do schema/migrations. Digest atual `142a2b61…` igual à fronteira certificada. Restore retido/parado reutilizado; não alterado `temporaryDatabaseRemoved=false`, não executado novo restore. Não se renovou backup/RPO nem se capturou root de curta validade. Health é evidência técnica, não validação funcional CSV.

API774414/worker774607/frontend188897, com ticks conferidos; perfis/NEWauth+NEWDB+NEWcipher preservados. Gates cinco falsos, execution-authorized=false, overlay não aplicado, nenhuma instalação, contenção, parada/partida, importação, alteração.env ou execução de retenção. Ambos crons e o baseline SQL de out.15 CLOSED permaneceram conferidos. Não houve teste por envio.

## Atividade CSV e consumidores Event

Foram lidos somente metadados Event por SELECT READ ONLY: **1.784 registros =20 resumos +1.764 eventos de criação**. Todos os eventos de criação correlacionam, no mesmo tenant, com um dos20 resumos. Nenhuma operação histórica ficou UNKNOWN nesta leitura. COMPLETED significa processamento com resumo terminal, não sucesso de todas as linhas nem atomicidade/rollback do arquivo; contagens e falhas individuais não foram reparadas. Isso não comprova ausência de importação legada atualmente em andamento ou ainda sem auditoria; a saída completa dos executores sob fence e o SELECT fresco continuam obrigatórios antes de liberar sucessores/tráfego. HTTP ausente/contador zero/guarda38 não substituem essa prova. Qualquer órfão/ambiguidade/resultado desconhecido novo nega prosseguimento, sem replay/reparo.

O classificador publicado agrupava literalmente requestIds e produziu1.764 grupos UNKNOWN, que eram eventos de linha, não1.764 importações. A causa foi comprovada no produtor canônico: summary usa `crm.contact.import.summary:UUID`; criação usa `crm.contact.created:leadId:UUID:hash16`. O leitor v2 reconhece somente esses envelopes exatos, preserva tenant/identidade, não utiliza telefone compartilhado nem prefixo aproximado. Summary novo sem admissão continua UNKNOWN. Seis ensaios sintéticos cobrem correlação, outro tenant, ausência/duplicação de summary e sufixo inválido; a reconciliação real completa passou. Captura e classificação originais foram preservadas, sem alteração dos eventos.

Fonte Event produtiva ainda b22246be; alvo03791f05 não aplicado. Os dois consumidores efetivos são `events-retention.ts` e `storage-report.ts`, ambos importando a fonte canônica. A terceira referência encontrada é teste, classificada separadamente; nenhuma referência operacional adicional desconhecida no escopo scripts/src auditado. Hashes, owner/modo e referências foram vinculados privadamente. Nenhum comando desses consumidores foi executado. Processos deploy relevantes foram lidos sem incompletude; processos root e ownership completo de saída permanecem para os leitores canônicos da janela, sem inferir cobertura a partir desta amostra.

## Recusas preservadas e correções de preparação

1. O tar público do overlay chegou664. A conferência recusou **antes de intent/extração**. Todos os hashes/owners conferiam. Somente esse arquivo recebido foi restrito a600, com recibo privado; origem Event e bytes não mudaram. O mesmo driver fez o staging após essa precondição ser satisfeita; nenhuma transferência repetida.
2. Primeira geração `incident-csv-window-staged-20261016T092610Z`: sete verificações passaram; checker de estado negou `preparation_path_denied`. O produtor/binder aceitava um prefixo incompatível com `Bridge`. Essa geração, seus manifests e DENY permanecem intactos. Binder v2 exige o nome canônico e executa o construtor real antes da cópia; não altera/afrouxa Bridge. Nome antigo nega, nome canônico passa. A geração nova passou na cadeia real completa. As provas locais anteriores substituíam o construtor no bridge de simulação, e por isso não cobriam essa precondição de composição.

## Pendências para decisão de janela

- Combinar horário/impacto humano e sudo do owner; nenhuma instalação autorizada nesta entrega.
- Renovar backup/RPO **na sequência coordenada**, sob backup.lock, com custódia byte a byte; reutilizar o restore somente com fronteira/ferramentas/laboratório ainda válidos. Adaptadores futuros CSV do produtor/custódia foram publicados, mas **não executados**; não chamar P0/A/B OpenAI suspensos. Suas diferenças são namespace/contrato CSV; ensaios anteriores da cadeia de recibo v2 continuam referenciados, sem alegar execução desses wrappers.
- Renovar root<10min apenas então: fonte fa113e/helper8de/sudoers62b5 são referências, não uma captura root fresca desta entrega. Revalidar os demais fatos perecíveis, sem herdar frescor deste relatório.
- Atualizar quatro provas/bindings de backup coerentemente, preservar originais e **republicar review hash** antes de A. Os hashes acima identificam o staging atual; não fingir que o review continua igual após renovação. Política/instalador só permanecem iguais se seus bytes realmente não mudarem.
- Saída real/ownership sob contenção e classificação CSV fresca; ZERO autorizações de gates/contenção/SQL/start foram emitidas agora. Frontend continua dependente dos certificados reais pós-API para seus bindings/políticas.

O retorno disponível é **frontend compatível mantendo backend candidato**, ledger/GET/UUID e Event crítico. Não resolve defeito de backend/RBAC/ledger/crash persistente: esses casos exigem conter/inspecionar e preparar outra versão de API compatível. Intent de start incerto não autoriza replay; retorno pós-unfence exige geração/política frescas. Não há retorno ao backend antigo depois de selecionada/iniciada a API candidata.

Recibos/diagnósticos das duas gerações foram preservados off-host, sem copiar novamente runtimes ou publicar configurações. Responsável Deifson; revisão16/10, próxima21/10 ou antes de janela/mudança. Segurança externa OPEN/adiamento aceito, Prisma e limpeza fora deste escopo; NEWauth+NEWDB+NEWcipher, ambos crons, guarda38 e out.15 CLOSED preservados.
