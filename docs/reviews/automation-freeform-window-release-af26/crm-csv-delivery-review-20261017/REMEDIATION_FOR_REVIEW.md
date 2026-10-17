# Event — proposta mínima de remediação para decisão separada

## M1 concluído —17/10/2026,15:09:05 Fortaleza

**APPLIED_EVENT_PARENTS_PASS / CINCO EFEITOS CONFIRMADOS / M1 CONSUMIDO.** Base/remoto6feb950b e hashes conferidos. O mesmo M1 autorizado foi retomado no terminal local já aberto pelo owner, sem gnome-terminal, launcher novo ou alteração de programa/plano/gates. Deifson identificou owner/executor e declarou que não havia outros mantenedores sob sua administração atuando nesses caminhos; a confirmação e os campos reais foram fornecidos por ele no TTY. Apenas as informações já declaradas foram transcritas para facilitar essa entrada, sem inventar nomes/jobs ou assumir coordenação. Respostas/referências e compromisso de não relançar manutenção ficaram privados no intent. [Resultado sanitizado, horários, efeitos e hashes](M1_RESULT.json).

Execução única como deploy/uid1000, **SEM sudo**, exit0. Oito elos/metadados e ACLs foram conferidos contra o plano pinado no uso; cinco transições registradas em ordem folha→raiz:

| Diretório literal | Efeito confirmado | Preservado |
| --- | --- | --- |
| /opt/re7online/site-re7online/apps/whatsapp-agent/src/events |0775→0755 |uid/gid1000, dev/inode, nlink, size e mtime |
| /opt/re7online/site-re7online/apps/whatsapp-agent/src |0775→0755 |uid/gid1000, dev/inode, nlink, size e mtime |
| /opt/re7online/site-re7online/apps/whatsapp-agent |0775→0755 |uid/gid1000, dev/inode, nlink, size e mtime |
| /opt/re7online/site-re7online/apps |0775→0755 |uid/gid1000, dev/inode, nlink, size e mtime |
| /opt/re7online/site-re7online |0775→0755 |uid/gid1000, dev/inode, nlink, size e mtime |

Somente g+w foi removido; todos os demais bits foram preservados. Ctime novo é efeito esperado e não foi reescrito para imitar a origem. As revalidações dos dois atributos ACL não produziram valor presente nem erro impeditivo; a interpretação POSIX já documentada permanece, sem parser/alteração de ACL. Após os cinco efeitos o executor revalidou a cadeia/FDs e chamou **o predicado Event original208f2ef5…**, resultando no terminal APPLIED_EVENT_PARENTS_PASS. É PASS **só dos pais Event**, não certificado de bindings, perfis, SQL, ownership ou prontidão CSV.

### Evidência efetiva e duração, sem nova inspeção produtiva

A análise posterior foi exclusivamente local, sobre os bytes já custodiados. Confirmados12 registros: plano, cinco pares apply-effect-intent/apply-effect-done e terminal. Plano/hash corresponde ao snapshot xattr original, intent referencia6feb950b/owner/operator e coordenação real; não há intent de efeito sem confirmação ou export de return.intent. Bytes de stdout11.295B, stderr0B e journal de canais90.945B conferidos contra Base64/tamanho/SHA canônicos. Exports privados: apply.intent928B/SHA2fe27a4d… e effects.private.jsonl7.214B/SHAd5c25806…, ambos íntegros off-host nos canais; sem duplicar arquivos brutos ou publicar conteúdo privado.

Intervalo do journal remoto: **18:09:05.287438–18:09:05.292960UTC,0,005522s** (15:09:05 Fortaleza). Confirmações dos efeitos entre18:09:05.288774 e18:09:05.292359UTC. O span local registrado17:59:28.558833–18:09:05.348764UTC,576,789931s, **inclui a espera de preenchimento pelo owner**; não é duração de execução remota, contenção ou indisponibilidade. Tempos do journal não são medição contínua independente de HTTP/serviço. Nenhum serviço foi parado/reiniciado.

**M2/M3 não foram executados**, nem nova leitura remota, replay ou reparo. A falha anterior do terminal gráfico continua preservada como M1 não iniciado naquela rodada; não foi convertida retroativamente em execução. Agora M1 e seus destinos/intents estão consumidos: não repetir nem apagar. A coordenação temporária foi liberada depois desta conferência, sem lançar jobs ou autorizar outra manutenção. Retorno, se algum dia necessário, permanece uma decisão separada sobre M3 e CAS pós-efeito; não é autorizado por este resultado.

Os cinco diretórios foram tratados como infraestrutura compartilhada multitenant. Não houve overlay Event, instalação CSV, importação, mudança de dados/configurações de tenants, RBAC, credenciais, crons ou serviços. A criação dos diagnósticos privados e as cinco alterações de modo são os efeitos previstos de M1. NEWauth+NEWDB+NEWcipher, frontend, guarda38 e out.15 não foram alterados; não se afirma nova recertificação global de health/controles não observados.

O impedimento de pais Event está resolvido **na verificação terminal de M1**. Os requisitos restantes do fluxo CSV continuam os já registrados (identidades/saved/fallback/bindings atuais, SQL/ownership, consumidores protegidos e autoridade), sem preparação ou execução automática nesta rodada. ELF continua PAUSADO. Nenhum teste/build/backup ou relatório preparatório adicional; somente resultado e atualização destes documentos. Deifson; revisão17/10/2026, próxima21/10 ou antes de mudança. **M1 COMPLETE / CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.**

---

## M1 autorizado — não iniciado: falha local do TTY antes da coordenação

**M1 NOT STARTED / ZERO EFEITOS / SEM SSH.** Base/remoto1e8ba1c0, fontes e hashes revisados conferidos; selecionado somente M1. Uma tentativa de abrir o TTY visível ao owner com gnome-terminal terminou em exit127 antes de executar o bloco. Erro fatal: `gnome-terminal.real`, biblioteca libpthread.so.0 de snap/core20, símbolo `__libc_pthread_init`/`GLIBC_PRIVATE` não resolvido. O aviso appmenu anterior não é tratado como causa independente da manutenção. [Resultado sanitizado/procedência](MAINTENANCE_RESULT.json).

O owner **não recebeu/preencheu a confirmação no TTY**; nenhuma resposta foi preenchida pelo agente e nenhuma coordenação foi presumida. O processo do terminal falhou antes do programa M1 e do seu único SSH. Conferência **somente local**: destino `csv-event-mode-apply-20261017-v1` continua ausente; não há intent, canais ou confirmações de efeito M1 criados por esta rodada. Não há observação do estado remoto atual nem afirmação de ausência remota de materiais produzidos por terceiros. Nenhum chmod, M2, M3, overlay, instalação CSV, SQL, restart ou janela foi executado.

A tentativa de abertura foi encerrada, sem retry, lançamento alternativo, reconexão ou reparo do ambiente. O **M1 não foi consumido**: permanecem os mesmos blocos/fontes/plano pinado e destino não utilizado. Os preflights anteriores continuam consumidos. A autorização recebida não equivale à confirmação operacional ausente; a rodada foi interrompida conforme o limite de falha.

O diagnóstico foi preservado pelo private_record canônico em diretório privado próprio, distinto do destino M1: `csv-event-mode-owner-tty-launch-20261017-v1`,0700/registro0600,871B/SHAaf2ca826…. Trata-se de registro explícito do output combinado observado da ferramenta, **não** captura retrospectiva inventada de stdout/stderr separados nem recibo M1. Horários de início/fim/duração de manutenção não existem; recordedUtc é a hora de preservação do diagnóstico. Não foi produzido selo ou recibo de aplicação.

**Próximo requisito concreto:** disponibilizar ao owner um TTY local efetivamente utilizável para o bloco M1 já revisado, e obter nele as respostas reais sobre mantenedores/sessões/jobs e compromisso de não relançar manutenção. Não preencher campos automaticamente nem adaptar plano, fontes, referências ou gates. Este resultado não autoriza novo lançamento ou reparo; retomada deve ser orientada pelo owner após esta interrupção. Não é necessário executar M2/M3 para uma manutenção que não começou.

A análise ACL offline e o executor localmente validado continuam aproveitáveis; não se repetiram testes/builds, captura ou backup. Nenhuma evidência permite recertificar os modos atuais de produção por esta rodada. NEWauth+NEWDB+NEWcipher/crons/guarda38/out.15 não foram modificados. Owner Deifson; revisão17/10/2026, próxima21/10 ou antes da retomada. **CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY; ELF PAUSADO.**

---

## Fechamento ACL OFFLINE e manutenção preparada — revisão396f2ed8

**ACL: SEM IMPEDIMENTO CONCRETO DEMONSTRADO / EXECUTOR LOCAL VALIDATED / REVIEW PENDING / APLICAÇÃO NÃO AUTORIZADA.** Esta análise substitui o impedimento genérico de visibilidade deixado acima; não altera o resultado histórico, seus bytes ou `absenceConfirmed=false`. [Executor fonte](../../../../scripts/crm_csv_delivery/event_mode_maintenance.source), [driver/transporte](../../../../scripts/crm_csv_delivery/mode_maintenance.py), [9 provas focadas](MAINTENANCE_PROOFS.json), [hashes/procedência](MAINTENANCE_MANIFEST.sha256). Os três blocos **M1/M2/M3** no fim deste documento são somente para revisão; os dois preflights anteriores permanecem consumidos e não devem ser repetidos.

### O que foi resolvido sobre ENODATA, sem exigir prova impossível

A ressalva geral de getxattr(2) não demonstra ocultação nestes dois atributos POSIX. O [caminho GET do kernel Linux, fs/xattr.c/do_getxattr/fgetxattr](https://github.com/torvalds/linux/blob/v6.8/fs/xattr.c) encaminha esses nomes ao leitor ACL usando o arquivo aberto. Em [fs/posix_acl.c/vfs_get_acl](https://github.com/torvalds/linux/blob/v6.8/fs/posix_acl.c), não há restrição VFS de owner para ler ACL POSIX; erros de segurança são propagados e falta de suporte retorna EOPNOTSUPP. Quando o getter não encontra ACL opcional, retorna ENODATA. [acl(5)](https://man7.org/linux/man-pages/man5/acl.5.html) distingue ACL base representada pelo modo, entradas adicionais e default de herança.

Na custódia legítima17:28:50UTC: executor uid/euid1000, cinco owners1000, diretórios abertos para leitura por FD, modo0775, dez ENODATA, nenhuma negação/suporte faltante e nenhum blob. Isso é **coerente com inexistência das ACLs opcionais access/default no caminho POSIX comum**, não com bloqueio de leitura por ser usuário de grupo sem privilégio. A ACL base de acesso continua representada pelos bits; não declarar “sem qualquer ACL”. A referência Linux6.8 fundamenta a semântica, não afirma versão/código exato do kernel observado.

Não há evidência de LSM/filesystem específico ocultando ACL com ENODATA. Sua possibilidade abstrata permanece risco residual, **não requisito de provar ausência de todo mecanismo desconhecido** nem impedimento concreto à preparação desta manutenção. Não se exige nova coleta para fechar essa análise. A autorização de aplicação permanece separada; o executor fará revalidação restrita no momento do uso: ACL presente, erro diferente ou deriva nega antes do efeito correspondente, preservando blob privado quando presente, sem parser/alteração de ACL. Evidência concreta contrária futura (valor retornado, erro de segurança/suporte, metadados/identidade divergentes) exigirá revisão; não existe agora blob pendente de análise.

### Efeito literal, precondições e estados

Allowlist permanece exatamente os cinco diretórios da tabela histórica. Única transformação: `st_mode & ~0020`, **0775→0755**, preservando owner/grupo, todos os demais bits e dev/inode. [fchmod(2)](https://man7.org/linux/man-pages/man2/fchmod.2.html) atua no FD e exige ownership/privilégio pertinente; o executor restringe uid/euid a1000 e owner/grupo1000, sem sudo ou troca de identidade. Não há chmod recursivo/path-based, chown, ACL set/removal, modificação do arquivo Event, descendants, perfis, releases, crons ou serviços.

O plano é derivado **em memória** dos bytes originais6978B/SHA971d5d39… e canais/recibo da custódia xattr preservada; inclui os oito elos e metadados privados, sem inventar observação atual. Não é publicado nem materializado agora. Todo consumidor recebe o mesmo plano/hash; qualquer diferença futura nega, **sem renovar/adaptar esse snapshot automaticamente**. O driver carrega os bytes verificados de executor, leitor, private_record e predicado Event208f2ef5…, antes de executar. As fontes anteriores/recibos não são editados nem usados como entrypoints.

| Fronteira | Exigência / resultado |
| --- | --- |
| Antes de efeitos |Contexto proprietário e coordenação manual explícita; população literal, fonte pinada; oito elos abertos por openat/no-follow, FD e caminho iguais aos nove campos preservados; cinco diretórios exatamente0775/uid-gid1000; access/default retornando ENODATA, sem blobs |
| Revalidação no uso |Todos os elos/FDs e ACLs antes de cada mudança, e o FD alvo imediatamente antes de fchmod; nenhum reopen por caminho para efetuar mudança. Ordem folha→raiz |
| Journal |Diretório exclusivo0700; intent novo O_EXCL; plano/hash/coordenação; intent **antes de cada fchmod**, confirmação posterior com metadados reais por private_record/fsync. Modo/ctime esperados mudam somente por efeito confirmado; outros campos não |
| Aplicação íntegra |Cinco confirmações, cadeia revalidada e **mesmo event_parents(EVENT_SOURCE)** original com leitura real. APPLIED_EVENT_PARENTS_PASS; não admite gates CSV ou política |
| Falha entre efeitos |DENY_OR_PARTIAL, preservação e nenhuma continuação/rollback automáticos. Parcial com registros pareados pode ser classificado PARTIAL_PROVEN |
| Efeito sem confirmação |Intent sem done é UNCERTAIN_EFFECT; nunca inferir fchmod não executado ou repetir. Sem retorno pelo executor nessa classificação |
| Resposta perdida |Canais/timeout custodiados; não prova cancelamento remoto. Próxima inspeção só por autorização separada, sem reconectar automaticamente |
| Retorno condicionado |Decisão própria M3 e coordenação nova; só os caminhos com apply-intent/done pareados, mesmo plano/identidades e CAS do estado pós-efeito; nenhuma recuperação parcial prévia. Restaura0775 apenas nesses FDs e confirma cada retorno; reintroduz a negativa Event esperada |
| Replay |Diretório/intent local e remoto exclusivos; instalação/gerações anteriores não são chamadas. Reaplicar ou repetir retorno nega; intents nunca apagados |

Não se apresenta fstat+fchmod como transação atômica contra outro writer; há intervalo entre comparação e efeito. A proteção contra esse risco depende da coordenação específica abaixo. A operação tem orçamento próprio de30s entre início do executor e etapas de efeito; o transporte tem timeout45s. Não são prazo de backup/root, prova de cancelamento nem duração produtiva medida. Falha em registrar/exportar evidência impede exit0; efeitos eventualmente realizados continuam exigindo inspeção. APPLIED ou RETURNED só após sua verificação terminal; efeitos todos confirmados sem verificação têm classificação distinta.

### Coordenação concreta: quem pausa o quê, e como confirma

**Responsável: Deifson (owner). Executor previsto: sessão deploy, uid1000.** Não há autorização para interromper atividade nesta rodada. Antes de M1 ou M3:

| Responsável / consumidor | Atividade que deve aguardar, nos cinco caminhos | Confirmação exigida ao coordenador |
| --- | --- | --- |
| Deifson e cada mantenedor com sessão SSH/editor/SFTP/automação sob seu controle |Git checkout/pull/reset/merge, npm ci/generate/build ou scripts que criem/removam/renomeiem entradas diretamente nos cinco pais; upload/sync/staging/overlay que os toque |Nome/UID/canal e referência da sessão/job; término do comando e de seus filhos ou cancelamento concluído pelo responsável; editor/sync sem tarefa pendente; aceite explícito de não relançar até liberação |
| Responsável de CI/CD ou job de manutenção, **se existir com esse destino** |Disparo automático/manual de atualização daquele checkout; fila não pode iniciar outro writer enquanto o executor opera |Identificar controlador e referência do job/execução/fila; responsável confirma saída e bloqueio de novos lançamentos pelo mecanismo que realmente controla. Se não houver, owner registra que não existe sob a administração conhecida, sem fabricar verificação de processo |
| Deifson, como coordenador e operador |Manter uma única sessão de aplicação, revalidar autorização e encaminhar a liberação após resultado/inspeção |Registro privado de todos os ack/referências/método e compromisso sem manutenção em voo; se não conseguir identificar/coordenar os mantenedores administrados, **não confirmar o prompt nem executar** |

Esse registro é confirmação operacional do owner, não sensor que prova ausência universal de processos. Não se inventa lista nominal além do owner conhecido; nomes/sessões/jobs efetivos devem ser fornecidos por ele quando houver manutenção autorizada. O SHA informado é referência à decisão de revisão, **não concede autorização por si**. O prompt exige confirmação específica; responder sem ter realizado a coordenação não satisfaz a precondição. Não há lock apresentado como exclusão de Git/npm/editor: o intent impede apenas replay deste executor, e esses consumidores não o respeitam.

API/worker/frontend e ambos os crons **não precisam ser parados por hipótese**. Os perfis de retorno atestados apontam releases fora do checkout; scripts Event demonstram import/leitura; logs e dados em diretórios descendentes não são os cinco pais cujas entradas mudam. Operação normal nesses descendentes não exige alterar os pais e mantém travessia; permissões de descendentes não mudam. Se o responsável identificar job que cria/remove entrada diretamente em um dos cinco, precisa coordenar **essa atividade específica** antes, não desabilitar todos os crons ou assumir que um daemon já está coberto. Nenhuma parada, alteração de cron ou inventário genérico é parte destes blocos.

### Uso futuro dos blocos M1/M2/M3, custódia e retorno

Todos são executados do ThinkPad pelo mecanismo literal de revisão, enviando o corpo autenticado uma vez à conta deploy por SSH, sem instalação de helper/política ou arquivo executável remoto. M1 e M3 pedem ao owner no TTY local: SHA autorizado, nomes/UIDs/canais dos mantenedores, referências das sessões/jobs e método real de confirmação, e frase de decisão específica. Não pedem senha/segredo. A confirmação é válida por no máximo10min como margem própria de coordenação, não substitui autorização nem prova kernel. M2 não pede nem emite autorização de escrita.

Destinos futuros, **não criados nesta preparação**:

- Remoto: `/dev/shm/re7-csv-event-mode-maintenance-20261017-v1`, owner700, apply.intent/return.intent/effects.private.jsonl600. Criação única em M1; M2 lê/exporta sem modificar; M3 só usa esse mesmo plano/recibo e cria intent de retorno exclusivo.
- Custódia local: sob o pai privado canônico, `csv-event-mode-apply-20261017-v1`, `csv-event-mode-inspect-20261017-v1` e `csv-event-mode-return-20261017-v1`, cada um exclusivo700, canais/journal600. Destino existente nega; não alterar nome ou repetir para obter PASS.

O driver reutiliza Capture/private_record e exporta os registros remotos privadamente no canal capturado, com tamanho/SHA/Base64 e conferência de permissões. Nenhum desses bytes/coordenação é destinado ao Git. Há no máximo cinco efeitos apply e cinco return, arquivo de journal limitado a1MiB no consumo; fonte limitada e população fixa, sem percorrer runtime. Não há nova geração operacional, backup, pacote ou staging. Materialização/transporte real/autoridade de execução produtiva **não foram certificados**; somente o código preparado e o laboratório foram ensaiados.

M2 é inspeção opcional separada a ser decidida após resultado incerto, não passo automático de M1. M3 depende da classificação e nova decisão explícita, inclusive após parcial conhecido; intent pendente, retorno anterior ou drift bloqueiam. O retorno não restaura ctime antigo (evidência de efeito deve permanecer), owner/grupo/mtime/nlink/size devem corresponder ao recibo. Repor0775 restaura o impedimento pré-parada, **não** é rollback de código/credenciais/banco. Nenhum controle de guarda38/out.15 é alterado.

### Ensaios efetivamente realizados e limites

Nove testes focados com filesystem descartável real: aplicação775→755, preservação de identidade/outros bits, verificação pelo predicado Event original; retorno das cinco mudanças e retorno de parcial confirmado de uma; deriva antes do primeiro efeito e antes do retorno; ACL estendida real inesperada bloqueando tudo; coordenação negativa; replay; fchmod efetuado sem confirmação pareada; e bootstrap literal→transporte→executor/custódia com resposta perdida. Metadados, leitura ACL, fchmod, private_record/fsync e exportação privada são reais locais; namespace dos alvos, plano histórico de teste, owner/coordenação, falhas/deadline e SSH são simulados e não provam exclusão produtiva. Não há callbacks substituindo o predicado por aprovação.

Os primeiros ensaios recusaram o complete porque os ancestrais da fixture tinham herdado775; o predicado original estava correto. A fixture foi corrigida para representar os ancestrais755 observados, sem alterar o predicado nem descartar sua cobertura. A instrumentação inclui lstat de custódia além do Event, sem promover contagem a prova. Reprodução: `PYTHONDONTWRITEBYTECODE=1 python3 -m scripts.crm_csv_delivery.test_mode_maintenance`, em ambiente local com ACL/setfacl já disponíveis para a contraprova de fixture. Não se repetiram suites/PM2/builds anteriores.

Conclusão: a interpretação ACL está fechada offline no alcance sustentado e não há impedimento ACL concreto atual para **preparar** este executor. Restam decisão de revisão/autorização, coordenação real e CAS no instante do efeito; qualquer drift/ACL presente/erro então nega. Nenhum efeito produtivo está autorizado agora. Deifson; revisão17/10, próxima21/10 ou antes de nova decisão. LOCAL VALIDATED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO; ELF PAUSADO; NEWauth+NEWDB+NEWcipher, crons, produção, guarda38 e out.15 preservados.

---

## Resultado xattr autorizado —17/10/2026,14:28:50 Fortaleza

**COLETA COMPLETA / PRESERVED_NOT_AUTHORIZED / APLICAÇÃO BLOQUEADA.** Base/remoto661c2ffa, fontes e hashes conferidos; somente o novo bloco xattr foi executado uma vez, deploy sem sudo, exit0. O bloco histórico/getfacl **não foi executado**. [Resultado sanitizado, horários e hashes de custódia](XATTR_RESULT.json). Fonte98c7b32f…; identidade uid/euid1000, gid/egid1000; quatro grupos permanecem no registro privado. Oito elos de cadeia, cinco diretórios e dez consultas aos dois atributos literais observados; cadeia/FDs/metadados revalidados no intervalo17:28:50.611633–17:28:50.612766UTC.

| Diretório | Modo / uid / gid observados | Access | Default |
| --- | --- | --- | --- |
| /opt/re7online/site-re7online |0775 /1000 /1000 |ENODATA61 |ENODATA61 |
| /opt/re7online/site-re7online/apps |0775 /1000 /1000 |ENODATA61 |ENODATA61 |
| /opt/re7online/site-re7online/apps/whatsapp-agent |0775 /1000 /1000 |ENODATA61 |ENODATA61 |
| /opt/re7online/site-re7online/apps/whatsapp-agent/src |0775 /1000 /1000 |ENODATA61 |ENODATA61 |
| /opt/re7online/site-re7online/apps/whatsapp-agent/src/events |0775 /1000 /1000 |ENODATA61 |ENODATA61 |

Nenhum valor ACL foi retornado: **zero blobs presentes**, sem bytes a interpretar nesta tentativa. Todos os dez estados são `NO_DATA_ABSENT_OR_NOT_VISIBLE`, `absenceConfirmed=false`; não há evidência de EACCES/EPERM/ENOTSUP nesta consulta, mas isso não elimina a ambiguidade ENODATA documentada. Não afirmar “sem ACL” nem reconstruir ACL base a partir do modo para certificar a ausência de atributos. Valores eventualmente presentes em outra coleta devem permanecer privados até análise competente.

Os nove campos canônicos de cada um dos cinco alvos (dev/ino/mode/uid/gid/nlink/size/mtime_ns/ctime_ns) coincidem com a R1 pinada931c9c39… das01:22:00UTC. É comparação de duas observações datadas, **não** prova de continuidade, ausência de writers ou snapshot atômico. A referência14:02 ao primeiro pai e o DENY getfacl14:17 permanecem com seus alcances, sem PASS retroativo.

Custódia local0700/0600: stdout6.978B, stderr0B e journals canônicos íntegros, canais byte-exatos conferidos pelo leitor pinado. `sourceComplete=true`, `applicationAuthorized=false`, sem timeout/perda de resposta/retry/reconexão/leitura remota adicional. Nem a cadeia nem os registros privados foram publicados em bruto. Nenhuma escrita remota, chmod, ferramenta externa, instalação ou alternativa foi executada.

### Confronto com a remediação e decisão sustentada

A premissa de modo da proposta foi observada: os cinco são0775, owner/grupo1000. O executor1000 coincide numericamente com o owner e reteria escrita de owner com0755 **se identidades/ACLs/estado forem os mesmos no efeito**. Retirar g+w remove criação/remoção/rename por usuários que dependam da classe de grupo nesses diretórios. A leitura e travessia previstas por0755 permanecem; não altera arquivos descendentes ou Event0664 histórico. O predicado canônico continua incompatível com0775; esta leitura não o executou para produzir um PASS fictício nem o alterou.

**Ainda não é possível aprovar a aplicação.** Faltam precisamente:

1. **Interpretação de visibilidade dos dois atributos no contexto observado.** ENODATA pode significar inexistência ou não visibilidade. Owner e metadados conhecidos não demonstram por si a política efetiva de leitura dos atributos system nesse filesystem. Não há blob pendente de decodificação nesta tentativa; falta resolver/aceitar explicitamente essa incerteza antes de concluir que nenhuma máscara/default afetaria terceiros. Nenhuma consulta adicional ou análise binária foi executada; a fundamentação primária permanece na seção xattr abaixo.
2. **Atribuição e exclusão dos writers de filesystem relevantes.** A coleta não identifica sessões Git/npm/manutenção, seus UIDs/grupos/ACLs efetivos ou dependência de g+w nos cinco pais. O quadro documental abaixo continua o alcance disponível: Git/npm podem criar entradas; importadores Event só demonstram leitura do módulo; releases do par original estão historicamente fora desses pais. Não há consumidor comprovadamente dependente de g+w, mas ausência/cobertura/exclusão **não estão comprovadas**. Próxima decisão concreta é delimitar com o owner quais mantenedores/jobs/sessões de manutenção podem atuar nesses cinco caminhos e como serão excluídos durante uma eventual aplicação. Isso não exige retomar ELF nem autoriza inventário genérico ou interrupção agora.
3. **Plano de efeito e autorização própria.** Este snapshot fornece identidade/metadados como referência privada, não CAS futuro ou intent de alteração. Depois dos itens anteriores: executor literal de aplicação por FD, plano/hash/intent exclusivos revisados, revalidação fresca de todos os alvos/cadeia/ACLs antes do primeiro efeito e no uso, registro de parcial, verificação e retorno condicionado. A corrida entre comparação e efeito não vira transação de filesystem; exclusão efetiva continua necessária. Nenhum desses atos está autorizado pela coleta.

Encaminhamento restrito: revisar os três pontos acima na **mesma proposta**, sem repetir o preflight consumido nem ampliar o inventário. Decisão atual: coleta completa aceita no seu alcance; **0755 NÃO AUTORIZADO / ACL_CHANGE_BLOCKED / WRITERS_NOT_EXCLUDED**. Não há necessidade de instalar getfacl para explicar este resultado; não é licença para substituição automática de mecanismos. Preservar os bytes e não promover owner UID a cobertura universal de escritores.

O novo bloco abaixo também passa a ser **CONSUMIDO — não repetir nem reutilizar seu destino**. As seções de preparação/provas seguintes são históricas do desenho executado; esta seção prevalece para seu estado. Sem alteração de código, testes anteriores repetidos, pacote, SQL, ELF, backup ou janela. NEWauth+NEWDB+NEWcipher/crons/guarda38/out.15 intocados; não foi feita recertificação global de produção. Deifson; revisão17/10, próxima21/10 ou antes de qualquer nova decisão. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.

---

## Preparação xattr661c2ffa — histórico local; execução consumida acima

Na preparação661c2ffa, o impedimento de ferramenta remota foi tratado **localmente**: o [novo bloco literal](#revisão-xattr--bloco661c2ffa-agora-consumido-não-repetir) lê dois atributos POSIX pelos mesmos FDs, usando Python/stdlib. Não chama getfacl, não procura alternativa e não executa programas auxiliares na VPS. A seleção desse mecanismo é explícita nesta revisão, nunca fallback da tentativa anterior. [Provas](XATTR_PROOFS.json) e [hashes/procedência](XATTR_MANIFEST.sha256).

O preflight getfacl anterior continua CONSUMED/DENY, com todos os bytes executáveis, bloco literal e recibos intactos. Nenhuma nova observação produtiva foi feita. A consulta foi posteriormente autorizada e executada conforme o resultado acima;0755 e alterações ACL continuam bloqueadas apesar da coleta completa. ELF PAUSADO / CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.

---

## Resultado da execução autorizada —17/10/2026,14:17:02 Fortaleza

**PREFLIGHT CONSUMED/DENY / APLICAÇÃO NÃO AUTORIZADA.** Base/remoto f0538524 conferidos, fontes/manifests/hashes publicados PASS. O bloco literal abaixo foi executado **uma vez**, deploy sem sudo. [Resultado sanitizado e procedência dos canais](PREFLIGHT_RESULT.json). Exit1, sem timeout ou falha de transporte; `denialStage=tool-preflight`, `denialReason=READ_OR_TOOL_FAILURE`, `errorClass=FileNotFoundError`, `errno=2`. A primeira operação da etapa é `os.lstat('/usr/bin/getfacl')`: esse caminho obrigatório não pôde ser resolvido (ENOENT). Isso não prova o estado de instalação de um pacote ou ausência de qualquer ferramenta em outro caminho; **nenhuma busca/alternativa foi realizada**.

Foi observada somente a identidade do executor: uid/euid1000, gid/egid1000, quatro grupos suplementares preservados privadamente. Isso confirma ausência de elevação nessa execução, não atribuição dos writers. **Zero diretórios/cadeias/ACLs observados e zero comandos getfacl executados.** A negativa precede a abertura de qualquer alvo. Canais stdout602B/stderr0B, registro de comando e recibo estão privados0700/0600, conferidos byte-exatos com o leitor/custódia canônicos; sourceComplete=false e applicationAuthorized=false. Não há PASS parcial dos pais.

### Decisão técnica sobre0775→0755

**DENY de aplicação por evidência insuficiente, sem rejeitar nem executar a proposta de desenho.** Nenhuma ACL, modo ou cadeia atual dos cinco foi obtida nesta tentativa. A identidade do executor é compatível numericamente com o owner1000 da referência anterior; isso não certifica owner atual ou cobertura de outros executores. O registro das14:02:30 continua provando0775 somente do primeiro pai **naquele horário**; a R1 das01:22UTC continua histórica para os cinco. Não atualizar timestamps, unir os intervalos como snapshot nem promover essas referências a CAS da tentativa14:17.

Retirar g+w de diretórios0775 preservaria owner=rwx e leitura/travessia de grupo/outros, retirando criação/remoção/rename de entradas por quem depende de grupo. Sem ACL access/default atual não é possível concluir se haveria também redução por máscara em entradas nomeadas nem avaliar sua herança. Os efeitos condicionais descritos na tabela de consumidores abaixo continuam válidos; nenhum consumidor foi demonstrado como dependente de g+w, **mas sua ausência e exclusão continuam desconhecidas**. Coleta falhou antes de esclarecer esse ponto, não evidenciou conflito concreto de um writer nem atribuiu causa histórica.

### Faltante exato e próximo ato para decisão, sem continuação automática

1. Decisão separada do owner sobre disponibilização da ferramenta ACL explicitamente exigida ou revisão prévia do mecanismo de obtenção dessa evidência. O roteiro consumido não pode prosseguir na situação observada. **Esta entrega não propõe comando de instalação, alternativa automática, novo coletor, nova coleta ou aumento de privilégio.** Não executar novamente o bloco/destino abaixo.
2. Depois dessa decisão e de eventual autorização própria, ainda obter os cinco estados completos (cadeia/metadados/ACLs) em destino novo. Nenhum deles foi certificado agora; a nova evidência não pode ser fabricada a partir das custódias anteriores.
3. Atribuir os mantenedores Git/npm/automação/sessões relevantes e comprovar sua exclusão durante a manutenção. A consulta de identidade/ACL não substitui esse requisito. Não foi autorizado inventário genérico ou contenção para fechá-lo.
4. Somente com esses insumos: executor/plano/hash/intent novos revisados e aprovação explícita; CAS/revalidação por FD, verificação integral e retorno condicionado já descritos. Nenhuma autorização ou prontidão de aplicação decorre desta coleta.

O bloco abaixo passa a ser **registro consumido de f0538524; não é instrução reutilizável**. Seus bytes, scripts/fontes, testes, registros anteriores e destino foram preservados; não se corrigiu o gate para obter PASS. ELF segue PAUSADO; sem nova leitura remota, chmod, teste de escrita, instalação, sudo, SQL, backup ou janela. NEWauth+NEWDB+NEWcipher/crons/guarda38/out.15 não foram modificados; sem recertificação global de produção. Responsável Deifson; revisão17/10, próxima21/10 ou antes de uma nova decisão. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.

---

**SOMENTE PROPOSTA / NÃO EXECUTADA / NÃO É AUTORIZAÇÃO DE CSV.** Responsável: Deifson; revisão17/10/2026, próxima21/10 ou antes de qualquer mudança.

## Impedimento demonstrado e alcance

A execução literal única de92df116b terminou às14:02:30 Fortaleza (17:02:30UTC), exit1, `event-parent-contract` / `EVENT_PARENT_CONTRACT_NOT_SATISFIED`. O primeiro pai `/opt/re7online/site-re7online/apps/whatsapp-agent/src/events` é diretório0775, uid/gid1000. `event_parents` exige diretório sem bits0022; o bit de escrita de grupo viola esse contrato. Não houve timeout, sudo, escrita remota, retry ou leitura adicional. Custódia dos canais e journal verificada byte-exata; stderr vazio. [Resultado e hashes](RESULT.json).

A observação atual desse primeiro pai coincide com a R1 histórica em dev/inode, uid/gid, modo, mtime/ctime. Isso não é captura atômica nem prova de continuidade entre horários. Os outros quatro pais0775 abaixo são **somente históricos**, da R1 às01:22:00UTC17/10 (22:22:00 Fortaleza16/10), recibo pinado931c9c39…/87.778B. Não foram alcançados agora; nenhum deles está certificado atualmente. O arquivo Event0664 é também histórico e fica fora da mudança proposta.

## Uma proposta restrita, com allowlist literal

Propor a remoção **somente de escrita de grupo** nos cinco diretórios historicamente impeditivos, após preflight atual integral e decisão do owner. Não é chmod recursivo, troca de owner, mudança de arquivos ou aplicação do overlay:

| Diretório literal | Antes admitido para esta proposta | Depois proposto | Evidência disponível |
| --- | --- | --- | --- |
| /opt/re7online/site-re7online |0775 |0755 |R1 histórica |
| /opt/re7online/site-re7online/apps |0775 |0755 |R1 histórica |
| /opt/re7online/site-re7online/apps/whatsapp-agent |0775 |0755 |R1 histórica |
| /opt/re7online/site-re7online/apps/whatsapp-agent/src |0775 |0755 |R1 histórica |
| /opt/re7online/site-re7online/apps/whatsapp-agent/src/events |0775 |0755 |Atual17:02:30UTC e R1 histórica |

Os pais `/`, `/opt`, `/opt/re7online` não são alvos. O arquivo `eventRetentionPolicy.ts`, descendentes, arquivos selados, releases, `.env`, credenciais e políticas permanecem fora da allowlist. A escolha de cinco evita uma correção isolada do primeiro pai que apenas deslocaria a recusa se os outros quatro permanecerem como na R1; **não** presume que estejam iguais. Antes diferente exige DENY/revisão, sem ampliar a lista ou adaptar valores para PASS.

## Efeito por consumidor e evidência insuficiente

O consumidor comprovadamente bloqueado é o predicado canônico208f2ef5…: `event_parents` → `validate_pre_stop` → checker/CLI antes de contain/stop, revalidado em Operations/overlay. Não será substituído nem relaxado. O classificador é importado por `apps/whatsapp-agent/scripts/events-retention.ts` e `apps/whatsapp-agent/scripts/storage-report.ts`; mudar diretórios não executa esses scripts, não muda Event nem reabilita retenção. O retorno ORIGINAL continua independente do overlay.

0755 preserva leitura/travessia para o grupo e escrita do owner; retira do grupo criação, remoção e rename de entradas nesses diretórios. Pode afetar automações de atualização/staging por outro UID, mesmo sem alterar API/worker/frontend ativos. Não há prova atual completa dos writers de filesystem, ACLs ou identidade efetiva desses consumidores; uid1000 observado não identifica sozinho o usuário executor. Se houver ACL estendida, alterar os bits de grupo pode alterar sua máscara e acesso efetivo. **Esses efeitos devem ser esclarecidos no preflight restrito, não presumidos seguros.** Arquivo0664 pode continuar gravável por grupo: corrigir os pais satisfaz apenas esse predicado, não certifica integridade ampla nem permissões do arquivo.

## Próximo ato operacional exato para revisão e autorização

Aprovar separadamente uma operação de manutenção **limitada aos cinco caminhos da tabela**, com duas fases: preflight integral privado antes de qualquer efeito, depois aplicação única condicionada a CAS. Não executar A/B, stop/start, overlay ou CSV como parte dela. Não há comando de aplicação liberado nesta rodada: faltam metadados atuais dos quatro pais não alcançados, ACLs e atribuição dos writers de filesystem. Não fabricar esses bindings a partir da R1. Esta proposta define os efeitos; um executor literal e seus hashes devem ser revisados antes de autorização de aplicação.

1. Conferir identidade legítima do executor, tipo/cadeia sem symlinks, dev/inode, uid/gid, modo, nlink, mtime/ctime e ACL de **cada um dos cinco**, com FDs no-follow estáveis. Preservar privadamente o estado anterior e diagnóstico pelos canais/custódia canônicos; ausência, acesso negado ou resposta perdida nega, sem sudo/fallback automático. Comparar o primeiro com a observação17:02 e os demais com a R1 como referências datadas; qualquer mudança precisa classificação explícita, não atualização oportunista. Confirmar que a retirada de g+w não bloqueia os escritores legítimos identificados. Não usar teste de escrita para descobrir consumidores.
2. Selar plano/hash/intent novo exclusivo com os cinco estados atuais aprovados e o efeito literal0775→0755. Verificar **todos antes da primeira mudança**, revalidar no FD no ponto de uso e conferir cadeia/resolução. A aplicação por FD deve comparar identidade e metadados esperados imediatamente antes do fchmod; uma checagem seguida por chmod de caminho substituível não basta. Operações de filesystem não são uma transação global: corrida entre comparação e efeito permanece risco residual; sem exclusão/cobertura dos writers relevantes não declarar CAS forte nem prosseguir. Sem criar/remover diretórios ou corrigir inconsistências.
3. Aplicar uma única passagem, somente aos FDs atestados; manter owner/gid e demais bits. Registrar cada efeito e metadados posteriores. Falha/parcial/timeout: preservar intent/recibo/journal e inspecionar somente conforme autorização; não repetir passagem, não completar automaticamente os restantes nem fazer rollback cego.
4. Verificar separadamente os cinco resultados e a cadeia completa pelo **mesmo** `event_parents`, sem dispensar outros verificadores. Comparar owner/gid/dev/inode e conteúdo Event com o estado anterior autorizado; registrar ctime alterado como efeito esperado, sem reescrever prova antiga. Não afirmar PASS dos pais não observados; mesmo PASS integral de Event não admite gates, instalação ou janela.
5. Retorno apenas por decisão explícita: restaurar os bits removidos nos diretórios efetivamente mudados e comprovados pelo recibo, nos mesmos dev/inode/owner/gid, com CAS do estado pós-mudança, cadeia e ausência de drift concorrente. Divergência nega retorno automático. Restauração0775 reintroduz a negativa pré-parada; não é retorno do backend nem restauração de credenciais.

## Depois desta remediação, sem continuação automática

Mesmo que Event passe, o próximo requisito CSV é a obtenção dirigida dos dados atuais de trio/saved/fallback/controles e canal SQL/ownership, com autorização própria para SELECT e atribuição; seguem vínculos/autoridade e proteção dos consumidores. Não há backup/RPO a renovar enquanto não houver janela coordenada. Reusar composição, pacotes e provas válidos, incluindo recuperação ORIGINAL e prevenção pré-parada. ELF/toolchain-discovery permanece pausado; não se inventa sua certificação nem se retoma esse método auxiliar.

NEWauth+NEWDB+NEWcipher, ambos os crons, frontend, guarda38 e out.15 não foram modificados. Isso descreve ausência de efeitos nesta operação, **não** uma recertificação atual global de produção. CSV SUSPENSO / NOT DEPLOYED / NOT WINDOW READY.

## Preflight literal f0538524 — registro agora CONSUMIDO, não repetir

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_EVENT_PREFLIGHT'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/scripts/crm_csv_delivery/preflight.py')
for q in (p,*p.parents):assert not q.is_symlink(),'reviewed_source_symlink'
s=p.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'reviewed_source_type_size'
def meta(m):return tuple(getattr(m,'st_'+k) for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 assert meta(os.fstat(fd))==meta(s),'reviewed_source_replaced'
 raw=os.read(fd,65536)
 assert meta(os.fstat(fd))==meta(s)==meta(p.lstat()),'reviewed_source_changed'
finally:os.close(fd)
assert hashlib.sha256(raw).hexdigest()=='4447ecad371247b57b6f0007b719362e6f716339e0a6a792ae27a5b8f42516f7','reviewed_event_preflight_digest'
ns={'__name__':'reviewed_event_preflight_driver','__file__':str(p)}
exec(compile(raw,str(p),'exec'),ns)
sys.exit(ns['execute']())
REVIEWED_EVENT_PREFLIGHT
)
```

### Ferramentas, sequência e destinos do comando acima

Na preparação f0538524, o bloco estava **preparado para revisão**, com autorização de preflight separada de chmod. A execução posterior está registrada no início deste documento: **CONSUMED/DENY**, sem autorização de aplicação. Há um só SSH deploy, BatchMode/StrictHostKeyChecking, prazo25s, sem reconexão. Nenhum arquivo remoto é criado. O destino local novo é `/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-delivery-event-preflight-20261017-v1`, exclusivo0700, sob o pai privado existente; destino já existente nega antes de SSH. Os destinos Event-boundary, R1 e complementações anteriores continuam consumidos/intocados.

| Ferramenta / fonte | Conferência anterior ao uso | Ausência / divergência |
| --- | --- | --- |
| ThinkPad `/usr/bin/ssh`, Python3/stdlib |Disponíveis no laboratório; script/reader/fontes conferidos antes do único SSH |Nega localmente, sem conexão |
| VPS `/usr/bin/python3 -B -I -S` |Canal já usado; erro de execução é preservado em stderr/exit do SSH |Sem alternativa/interpretação via app |
| VPS `/usr/bin/getfacl` |**Na preparação, disponibilidade remota desconhecida; na execução, caminho fixo ENOENT (resultado acima)**. Primeiro gate remoto após identidade: arquivo regular/no-follow, FD, metadados estáveis, SHA e versão, antes dos alvos |Nega antes de ler os diretórios. Sem command-v/search, instalação, sudo, getfattr/xattr alternativo ou fallback |
| `/proc/self/fd`, openat/no-follow e passagem de FDs |Uso real no laboratório; ausência/acesso negado remoto nega |Não substitui por reabertura do mesmo caminho |

No laboratório getfacl2.3.2 foi conferido e executado por **imagem FD**, com argv0 estável. O primeiro ensaio expôs que argv0 pelo número do FD altera o nome impresso por `--version`; corrigiu-se somente argv0 mantendo executable no FD, sem relaxar formato. A presença desse utilitário e a proteção de seu caminho na VPS não são certificadas pela prova local. Seu hash é observação, não autoridade para instalar/executar aplicações ou certificação do toolchain pausado.

O driver carrega os bytes pinados do transporte anterior, `stable_file/meta` do leitor R2 e `Capture/private_record` canônicos, sem entrypoints históricos. O reader e o novo corpo remoto são verificados e compilados dos mesmos bytes; não há hash seguido de import por caminho mutável. A consulta inicia registrando uid/euid/gid/egid/grupos e exige executor não privilegiado, sem mudança de identidade. A sessão SSH é a de deploy. Um uid numérico não prova cobertura dos writers.

A cadeia deduplicada `/`→`/opt`→`/opt/re7online`→cinco alvos é aberta componente a componente, no-follow, com FDs mantidos até o final. Registra nove campos do `meta` canônico: dev/ino/mode/uid/gid/nlink/size/mtime_ns/ctime_ns. Cada ACL dos **cinco** alvos é lida pelo getfacl numérico sobre o FD herdado, incluindo ACL default, sem teste de escrita. Não se lê o arquivo Event ou perfis/ambientes; metadados/ACLs dos pais não alvos não autorizam sua modificação. A coleta final revalida FD, resolução por pai e metadados de todos os elos; atime não integra o contrato canônico. Intervalos separados não são snapshot atômico; a amostra não exclui writers nem garante estabilidade futura.

Cada comando getfacl tem argumentos, início/fim, exit, tamanho/hash e canais Base64 privados, mesmo se houver parcial. Prazo3s por chamada, saída131.072B por canal (no excesso preserva o byte sentinela adicional), versão mais cinco ACLs; tool máximo1MiB lido só em memória para hash. Timeout/excesso encerra/recolhe o filho, sem retry. Canais externos stdout/stderr do único SSH são preservados antes do parse, com seus horários/código/tamanhos/SHA pelo Capture e journal canônicos. Não há novo escritor de custódia ou exportador remoto. Ausência, acesso negado, symlink, adulteração, erro/formato ACL ou drift nega e preserva o alcançado; os restantes não são certificados.

Resultado completo significa **OBSERVED_NOT_AUTHORIZED**;0775 e ACL estendida/default são observados, nunca convertidos em autorização de0755. `writersExcluded=false`, `applicationAuthorized=false`, `eventParentsCertified=false`. O predicado Event original não é chamado para produzir PASS sobre0775, nem foi modificado. Ele continua exigido na verificação futura depois de qualquer mudança aprovada.

### Consumidores: o que a documentação/configuração permite afirmar

| Consumidor / referência existente | Relação com os cinco diretórios | Conclusão sobre dependência de g+w |
| --- | --- | --- |
| Runbook, fluxo histórico de deploy sem migration (checkout/pull no checkout e npm ci/db:generate/build em apps/whatsapp-agent) |Git pode criar/remover/renomear entradas em todos os cinco; npm gera dependências/artefatos sobretudo abaixo de apps/whatsapp-agent |Se UID efetivo for owner,0755 mantém escrita. Se depender de grupo/ACL, pode quebrar atualização. Configuração documental não demonstra UID/grupos atuais ou exclusão. Exemplos antigos não serão executados |
| Política original-only e2a5 pinada na custódia R1; targetProcesses.return |API usa release security-epoch-v3-36f51ebe…; worker usa release worker-minimal-reactive…; ambos fora do checkout alvo |Não demonstram necessidade de criar entradas nos cinco pais. São referências históricas atestadas, não identidade/cwd atual nem prova de ausência de outros acessos |
| `apps/whatsapp-agent/scripts/events-retention.ts` e `storage-report.ts`; package.json events:retention/storage:report |Leem/importam Event; retenção modifica DB e relatório lê filesystem. `.data`/logs são descendentes distintos; travessia permanece com0755 |Nenhum exige comprovadamente g+w dos cinco pais para importar o módulo. Não executar os scripts para testar; não certificar credenciais/políticas ou reabilitar retenção |
| Cron de media/retention documentado no runbook |Cwd do checkout, saída em `.data/logs`, sem criação demonstrada nos cinco diretórios literais |Permissões de descendentes ficam intactas. Documento não é crontab atual, nem prova de identidade/writers; crons recuperados não serão alterados |
| Preparadores futuros/overlay Event e `prestop_contract.event_parents` |Consumidor direto do contrato de pais sem0022, revalidado no uso |Mudança proposta resolve só esse contrato se toda cadeia estiver adequada; não autoriza overlay, CSV ou outra alteração |

**Não foi identificado em evidência disponível um consumidor que comprovadamente precise de escrita de grupo nesses cinco diretórios específicos. Isso não prova sua ausência.** Faltam atribuição efetiva de mantenedores/Git/npm/automação/SSH concorrentes e respectivos direitos/locks. O preflight proposto não faz inventário genérico de processos nem pretende fornecer essa exclusão. Antes de aplicar: owner deve identificar e impedir sessões/jobs de manutenção relevantes durante a operação, com mecanismo/identidade e saída comprovados sob decisão específica; lock advisory desconhecido não é exclusão. Se essa cobertura não puder ser demonstrada, aplicação continua bloqueada, mesmo com coleta completa.

### Decisão possível depois do preflight e controles de aplicação/retorno

- Se getfacl faltar: diagnóstico exato TOOL/PATH/errno custodiado; nenhum alvo certificado. Parar e decidir separadamente, sem ferramenta alternativa automática.
- Se o preflight negar ou qualquer alvo divergir da proposta literal0775/identidade/cadeia: preservar; não adaptar input. Não há PASS parcial autorizando chmod.
- Se completo: analisar owner/grupos e ACL access/default de cada alvo. ACL estendida exige avaliar efeito da máscara;0775→0755 não é autorização para alterar uma máscara sem essa análise. O preflight não fabrica esse aceite.
- Somente após owner aceitar impactos e cobertura/exclusão: futuro plano/intent/hash novo ligado ao snapshot privado, aplicação por FD com revalidação imediata, sem CAS simulado como atomicidade de filesystem. O executor de aplicação **ainda não está entregue/autorizado**; resultado da coleta é o insumo necessário. Os cinco efeitos/partial/recibo e retorno condicionado já delimitados acima permanecem exigidos.
- Verificação futura: mesmas identidades/owners/grupos/ACLs esperadas e modo0755, cadeia/predicado Event completo; conteúdo Event, releases e controles preservados. Retorno só sobre FDs/efeitos comprovados, CAS pós-mudança e decisão explícita, sem rollback automático, restaurando0775 e sua negativa conhecida.

### Validação local desta extensão

[14 provas focadas](PREFLIGHT_PROOFS.json), reproduzíveis com `PYTHONDONTWRITEBYTECODE=1 python3 -m scripts.crm_csv_delivery.test_preflight`. Bash/heredoc/Python literal executados em laboratório; shim Python só injeta a instrumentação local de SSH/namespace/custódia. Código verificado, decisões, FD/getfacl local, leitor, Capture e private_record reais. O namespace remoto é fixture temporária; UID/root, access denied, substituição, ACL estendida/formato, timeout e resposta perdida são fronteiras simuladas explicitamente. Excesso de canal usa filho local real e limite real. Destino existente e adulteração de source/reader negam antes de SSH. Prova local não certifica ferramentas, ACLs, identidades ou exclusão de writers produtivos. Nenhuma suíte anterior, rebuild, captura VPS ou ação consumida foi repetida.

LOCAL VALIDATED no alcance acima / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. Apenas preflight futuro para revisão; nenhuma autorização de aplicação. ELF continua PAUSADO.

## Revisão xattr — bloco661c2ffa agora CONSUMIDO, NÃO REPETIR

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_EVENT_XATTR_PREFLIGHT'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/scripts/crm_csv_delivery/preflight_xattr.py')
for q in (p,*p.parents):assert not q.is_symlink(),'reviewed_source_symlink'
s=p.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'reviewed_source_type_size'
def meta(m):return tuple(getattr(m,'st_'+k) for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 assert meta(os.fstat(fd))==meta(s),'reviewed_source_replaced'
 raw=os.read(fd,65536)
 assert meta(os.fstat(fd))==meta(s)==meta(p.lstat()),'reviewed_source_changed'
finally:os.close(fd)
assert hashlib.sha256(raw).hexdigest()=='1de0e5025c8f27d0dd12f0698eccc3b839748af142e014dc4275d11fb0587a21','reviewed_event_preflight_digest'
ns={'__name__':'reviewed_event_preflight_driver','__file__':str(p)}
exec(compile(raw,str(p),'exec'),ns)
sys.exit(ns['execute']())
REVIEWED_EVENT_XATTR_PREFLIGHT
)
```

### Fundamentação primária e interpretação restrita

- [Python3.12, os.getxattr](https://docs.python.org/3.12/library/os.html#os.getxattr): leitura de valor binário e suporte a FD no Linux; os.XATTR_SIZE_MAX é64KiB. A consulta passa o FD já autenticado, não resolve novamente o caminho para obter ACL.
- [Linux getxattr(2)](https://man7.org/linux/man-pages/man2/getxattr.2.html): fgetxattr usa o arquivo aberto; ENODATA pode significar atributo inexistente **ou** não acessível ao processo. ENOTSUP aponta falta de suporte/desabilitação. Outros erros não são ausência. A API Python pode realizar detalhes internos de dimensionamento; não se promete um único syscall nativo, não há retry/releitura/fallback implementado pelo coletor.
- [Linux xattr(7)](https://man7.org/linux/man-pages/man7/xattr.7.html): atributos system incluem ACLs, com política de acesso própria; limite VFS de valor64KiB. Não usamos permissões de atributos user como prova de acesso aos atributos system.
- [Linux UAPI xattr.h, v6.8](https://github.com/torvalds/linux/blob/v6.8/include/uapi/linux/xattr.h): nomes system.posix_acl_access e system.posix_acl_default. Referência de implementação, sem inferir versão do kernel produtivo.
- [Linux acl(5)](https://man7.org/linux/man-pages/man5/acl.5.html): ACL de acesso e ACL default têm papéis diferentes; máscara e permissões de grupo são relacionadas, e ACL default governa herança. A ausência de atributo access retornável **não significa ausência de uma ACL base** associada às permissões. Não implementamos o formato binário ou cálculo de direitos.

| Resultado de os.getxattr(fd, nome literal) | Registro privado | Consequência |
| --- | --- | --- |
| Retorna bytes, inclusive vazios |PRESENT, tamanho/SHA/Base64 byte-exatos, sem decoder |Preservar; estrutura/entradas/direitos NÃO certificados. Alteração bloqueada até análise competente |
| ENODATA |NO_DATA_ABSENT_OR_NOT_VISIBLE, errno numérico, absenceConfirmed=false |Ausência do atributo é uma hipótese distinta de negação explícita, mas não é ausência absoluta certificada. Leitura pode terminar como observação; não autoriza mudança |
| EACCES ou EPERM |ACCESS_DENIED, errno/classe |DENY na primeira ocorrência; não certificar restantes |
| ENOTSUP/EOPNOTSUPP |NOT_SUPPORTED, errno/classe |DENY; não converter em atributo ausente |
| Qualquer outro OSError, inclusive EIO/ERANGE/E2BIG/EBADF |OTHER_ERROR, errno/classe |DENY sem mensagens arbitrárias ou alternativa |
| API ausente / erro não OSError / bytes acima do limite |Etapa e razão estática/classe; parcial preservado |DENY, nunca “sem ACL” |

Somente os **dois nomes literais** são consultados, para os mesmos cinco diretórios. Não há listxattr, inventário de outros namespaces, leitura de arquivo Event, ambientes, dados ou permissões dos tenants. O perfil de captura permanece identidade→cadeia no-follow por FD→metadados canônicos→atributos→revalidação FD/resolução/metadados. Cada atributo tem intervalo próprio; a cadeia não é snapshot atômico. Mudança de ACL pode alterar ctime e será detectada pela revalidação, mas não se afirma exclusão de escritores/atomicidade de múltiplas leituras.

### Consumo autenticado e custódia da revisão

Fontes novas: `scripts/crm_csv_delivery/preflight_xattr.py` e `event_preflight_xattr.source`; o driver carrega os bytes pinados de preflight.py como **biblioteca de transporte**, sem executar seu contexto/destino consumido. Contexto novo é literal/revisado: fonte/SHA e destino `csv-delivery-event-xattr-preflight-20261017-v1` sob a custódia privada existente do owner. Esse destino não é criado nesta rodada; quando autorizado, será exclusivo0700 e arquivos0600, sem sobrescrita. O comando acima contém o caminho completo efetivo no driver; os canais e journals usam o mesmo Capture/private_record, sem novo escritor.

O bootstrap autentica e compila o mesmo snapshot de bytes; reutiliza leitor/meta, transporte único SSH deploy SEM sudo, timeout25s, stdout/stderr antes do parse e recibo sourceComplete/noAutomaticContinuation. O corpo remoto importa somente stdlib; não depende de getfacl/setfacl ou utilitários para obter ACL. A API os.getxattr e suporte a FD precisam existir/funcionar: ausência ou erro nega sem instalação ou fallback. Chamada bem-sucedida não prova proteção global do toolchain, que continua fora desta frente.

Há no máximo dez valores opacos de64KiB (655.360B brutos; Base64 até873.840B), mais metadados/envelope e duplicação canônica dos canais no journal local. Não se copia runtime ou árvore; os valores não são publicados. Não há parser ACL novo, montagem de ACL por struct, conversão em texto, aplicação dos blobs ou escrita remota. `aclInterpretationComplete=false`, `aclChangeBlocked=true`, `writersExcluded=false` e `applicationAuthorized=false` permanecem explícitos, mesmo com `readComplete=true`. Hash de blob serve à integridade, não certifica direitos nem autoriza aplicar permissões.

### Provas e limites efetivos

Doze testes novos focados, sem repetição das suítes anteriores: base/ENODATA real versus getfacl; access estendida/default criadas **somente em fixtures locais** com setfacl preinstalado; leitura FD real,10 comparações independentes getfacl e Base64 byte-exato; diretório local sem acesso negado por kernel; procfs local retornando EOPNOTSUPP real; EACCES/ENOTSUP/EIO na interface xattr injetados para exercitar cada classificação; symlink/substituição real em fixture; resposta perdida e custódia; pin adulterado e ausência de subprocess no corpo remoto; bloco Bash/heredoc/Python literal completo com namespace/SSH/destino simulados.

O primeiro ensaio no sandbox recusou a criação da fixture estendida com EINVAL. Não foi substituído por mock/PASS: a mesma suíte foi executada no filesystem local autorizado fora dessa sobreposição, com getfacl/setfacl já disponíveis, e passou12/12. Não houve download/instalação ou contato com VPS. setfacl é usado apenas para produzir fixtures sintéticas; não é dependência do procedimento remoto. Reprodução: `PYTHONDONTWRITEBYTECODE=1 python3 -m scripts.crm_csv_delivery.test_preflight_xattr`, em filesystem local com suporte ACL e utilitários de laboratório; indisponibilidade desses componentes impede a prova, sem instalação/fallback automático.

O consumidor é a mesma cadeia/leitor e os mesmos canais canônicos; somente a obtenção da evidência ACL foi revisada. As representações getfacl dos testes não se tornam parser produtivo. As novas provas não reinterpretam o DENY por getfacl ausente nem o primeiro pai0775; históricos mantêm seus horários.

### Decisão atual e faltante exato

Próximo ato possível é **revisão/autorização exclusiva do novo preflight xattr acima**, não sua execução nesta rodada. Dependência de getfacl remoto removida por desenho explícito, mas suporte/permissões xattr produtivos ainda desconhecidos. Se os blobs existirem, análise competente precisa determinar as entradas/máscara/default e impactos antes de alterar g+w. Se ENODATA, preservar sua ambiguidade e relacionar com modo/owner/capacidade de leitura; não concluir “sem ACL”. Nos demais erros, parar.

Continuam faltando: estados atuais dos cinco diretórios, interpretação das evidências ACL, atribuição/exclusão dos writers relevantes e executor/plano/intent/CAS de aplicação com aprovação própria. As precondições de aplicação por FD, verificação integral pelo predicado original e retorno condicionado descritas anteriormente não mudam. Não há autorização de chmod/ACL, mudança de credenciais, crons, controles ou retomada CSV. Owner Deifson; revisão17/10/2026, próxima21/10 ou antes de alteração. NEWauth+NEWDB+NEWcipher/produção/guarda38/out.15 e todos os privados/DENYs preservados.

## Manutenção restrita — executores literais SOMENTE PARA REVISÃO

Nenhum bloco está autorizado nesta rodada. São decisões separadas, não uma sequência automática. Não executar blocos consumidos acima.

### M1 — aplicação CONSUMIDA/COMPLETE, NÃO REPETIR

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_EVENT_MODE_apply'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/scripts/crm_csv_delivery/mode_maintenance.py')
for q in (p,*p.parents):assert not q.is_symlink(),'reviewed_source_symlink'
s=p.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'reviewed_source_type_size'
def meta(m):return tuple(getattr(m,'st_'+k) for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 assert meta(os.fstat(fd))==meta(s),'reviewed_source_replaced'
 raw=os.read(fd,65536)
 assert meta(os.fstat(fd))==meta(s)==meta(p.lstat()),'reviewed_source_changed'
finally:os.close(fd)
assert hashlib.sha256(raw).hexdigest()=='eb2be50002d4944aa73a50fc3ff861bc2c32ee9f85cfadcef8ace2911868e38c','reviewed_maintenance_digest'
ns={'__name__':'reviewed_maintenance','__file__':str(p)}
exec(compile(raw,str(p),'exec'),ns)
sys.exit(ns['execute']('apply'))
REVIEWED_EVENT_MODE_apply
)
```

### M2 — inspeção/exportação separada, sem novo efeito

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_EVENT_MODE_inspect'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/scripts/crm_csv_delivery/mode_maintenance.py')
for q in (p,*p.parents):assert not q.is_symlink(),'reviewed_source_symlink'
s=p.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'reviewed_source_type_size'
def meta(m):return tuple(getattr(m,'st_'+k) for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 assert meta(os.fstat(fd))==meta(s),'reviewed_source_replaced'
 raw=os.read(fd,65536)
 assert meta(os.fstat(fd))==meta(s)==meta(p.lstat()),'reviewed_source_changed'
finally:os.close(fd)
assert hashlib.sha256(raw).hexdigest()=='eb2be50002d4944aa73a50fc3ff861bc2c32ee9f85cfadcef8ace2911868e38c','reviewed_maintenance_digest'
ns={'__name__':'reviewed_maintenance','__file__':str(p)}
exec(compile(raw,str(p),'exec'),ns)
sys.exit(ns['execute']('inspect'))
REVIEWED_EVENT_MODE_inspect
)
```

### M3 — retorno único, somente após decisão sobre efeitos comprovados

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_EVENT_MODE_return'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/scripts/crm_csv_delivery/mode_maintenance.py')
for q in (p,*p.parents):assert not q.is_symlink(),'reviewed_source_symlink'
s=p.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'reviewed_source_type_size'
def meta(m):return tuple(getattr(m,'st_'+k) for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 assert meta(os.fstat(fd))==meta(s),'reviewed_source_replaced'
 raw=os.read(fd,65536)
 assert meta(os.fstat(fd))==meta(s)==meta(p.lstat()),'reviewed_source_changed'
finally:os.close(fd)
assert hashlib.sha256(raw).hexdigest()=='eb2be50002d4944aa73a50fc3ff861bc2c32ee9f85cfadcef8ace2911868e38c','reviewed_maintenance_digest'
ns={'__name__':'reviewed_maintenance','__file__':str(p)}
exec(compile(raw,str(p),'exec'),ns)
sys.exit(ns['execute']('return'))
REVIEWED_EVENT_MODE_return
)
```
