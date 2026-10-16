# Autoridade root futura — implementação local e bloqueios de integração

**Núcleo e interfaces ensaiados: LOCAL VALIDATED. Integração completa: BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**

Base/HEAD `bdb57f57601147632bb529895cbcd92b8b483c6c`, branch `review/campaign-recovery-20260926`. Preservadas as alterações documentais anteriores de ROOT_OF_TRUST_UNBOUND, seus quatro arquivos, todos os materiais privados/não rastreados e demais worktrees. Não há commit/push, VPS, instalação, geração operacional ou retomada CSV. Esta implementação não é uma política/helper/launcher ativo.

## Resultado e alcance

Foi implementado um núcleo de autoridade baseado no modelo existente: owner aprova os bytes; instalação revisada cria arquivos root-owned; helper fixo fornece observação autenticada por chamada sudo literal. Nenhuma assinatura, nova chave ou serviço externo. Há criação exclusiva de âncora/comprovante, consulta sem emissão/renovação, contexto explícito e carga dos bytes já verificados.

A integração **não é declarada concluída**: o transporte inicial de consulta ainda não usa o diagnóstico privado canônico, e faltam provas combinadas de alguns processos filhos e da releitura do ecossistema pelo PM2. A lista objetiva está na seção de bloqueios e em LAUNCH_INVENTORY.json. Os33 testes não eliminam esses limites.

## Arquivos de implementação

| Arquivo | Responsabilidade |
| --- | --- |
| authority.py | Validação root de leitura/metadata, consulta sudo fixa, validação de âncora/permit/manifest, DAG de selagem declarado, Context explícito, frescor/decisão/execução, snapshot de arquivos/imports transitivos |
| root_store.py | APIs exclusivas do owner para instalação/emissão, lock canônico, O_EXCL/O_NOFOLLOW, fsync, intents/recibos; Store.query_locked lê e não emite/renova |
| root_extension.py | Transformações puras da versão futura do helper, sudoers e registro de diagnósticos; adiciona somente inspect-recovery-authority |
| bootstrap.py | Futuro launcher root-owned executado como deploy, Python -I -S; carrega bibliotecas protegidas antes de consultar/carregar preparação |
| verified_loader.py | Imports locais declarados, sem fallback sys.path/recovery_binding; compila o snapshot conferido, não uma segunda leitura de arquivo |
| node_bootstrap.cjs | Launcher CommonJS específico, snapshot autenticado pelo bootstrap Python, require declarado e filhos Python encaminhados pelo launcher; rejeita mecanismos de spawn não cobertos |
| child_transport.py | Encaminhamento Python/Node e correlação com autoridade reconsultada; Node inicia com NODE_OPTIONS/NODE_PATH removidos |
| integration.py | Transformações futuras dos consumidores aceitos: Recovery, Bridge, gate, Sequencer, Operations/System.run, delegated e execution-check |
| reproduce.py | Reprodução isolada dos arquivos entregues, fontes Git exatas e trecho canônico já publicado; sem local-evidence |
| test_authority.py / test_connected.py |33 testes novos/afetados do incremento, sem repetir a suíte antiga32/42 |

Fontes canônicas não foram editadas. consumer_delta.patch mostra dez transformações; SOURCE_PROVENANCE.json fixa os arquivos de origem e hashes antes/depois. Os nomes FUTURE/MODE no patch são destinos de revisão, não diretórios operacionais criados.

## Cadeia de confiança e papéis

1. **Owner e instalação futura:** o owner deverá aprovar os hashes finais de código/manifest/âncora e instalar bootstrap, leitor, armazenamento e helper em caminhos root-owned protegidos. As APIs de root_store conferem UID root + ação explícita e os digests esperados. Argumentos/hashes não autorizam por si: a autoridade é a chamada privilegiada do owner sobre o instalador revisado. Ainda não foi produzido um instalador concreto completo dessa composição.
2. **Registros:** diretório futuro /var/lib/re7/recovery-authority, por hash de política; âncora e manifest estáticos, intents/recibos e permit separados, root-owned. Criação única, sem sobrescrita ou replay. Store confere a cadeia do diretório; emissão só aceita fase fenced e política correspondente, guarda/nft e hashes do contrato/execução. Decisão é aprovação, não prova de elegibilidade: os verificadores canônicos continuam obrigatórios.
3. **Consulta:** nova ação literal no helper, dentro do main/lock/audit existentes. Lê a política e a fase reais e registros protegidos. Nenhum caminho/decisão/hash vem de argv nessa ação; não há ação sudoers de instalação/emissão. A consulta nunca atualiza capturedUtc nem cria permit.
4. **Bootstrap:** usa bibliotecas root-owned sob caminho fixo e o helper fixo via /usr/bin/sudo + /usr/bin/python3 -I -S. As respostas vêm desse subprocesso direto. Context(query=...) e transportes injetados são superfícies explícitas do laboratório; não são entrada de CLI/env de produção.
5. **Consumo:** build recebe Context; original_bindings recebe o mesmo contexto; gate refaz build com o contexto injetado pelo loader. Cada filho deve consultar root novamente. Identificador/hash encaminhado pelo pai é apenas correlação: deve coincidir com a autoridade obtida independentemente pelo filho.
6. **Import:** snapshot confere cada arquivo e sua metadata declarada e guarda seus bytes. Loader usa compile desses bytes; imports locais desconhecidos e recovery_binding negam. Root libraries authority/child_transport são fornecidas pelo bootstrap protegido, não buscadas na preparação. Não há import implícito de binding executável.

O modelo não impede um usuário deploy malicioso de usar diretamente outras capacidades que já possua no sistema. Não foi criado sandbox OS/RBAC. O objetivo é autenticar o caminho canônico de controle e impedir atalhos/acidentes/imports não aprovados nesse caminho. Comprometimento de root permanece fora desse modelo.

## Contexto, três pins e fronteiras

A âncora liga preparação, contrato C, política P, manifest de código e hashes dos perfis ORIGINAL/CANDIDATE. O permit liga a âncora, C/P, decisão, perfil alvo, hash do intent de execução, fase fenced e capturedUtc com fuso. O terceiro pin é o hash dos bytes canônicos exatos desse permit. A emissão retorna os mesmos bytes para custódia, não um ack a reserializar.

Inspeção/PRESTOP não fabricam permit nem hash vazio; a ausência é explícita e não permite partida. ORIGINAL/CANDIDATE exigem decisão/execução correspondentes e permit com idade0<=age<600s, antes do recovery intent e novamente antes da partida. Mudança de âncora/permit entre API e worker nega; expiração também. Resposta perdida preserva intent e não autoriza emissão/partida novamente.

O permit tem origem fenced; recuperação/start exigem fase root atual fenced. Fechamento permite a progressão canônica ready/unfenced/complete sem transformar isso em autorização para nova partida. PRESTOP continua sem start. O classificador, certificado geracional, checker ORIGINAL, profile_delta, seleção e consumo são os consumidores existentes; não foi introduzida classificação ou política paralela.

## Selagem e dependências

Código/índices estáticos -> contrato C; política P é a efetivamente instalada e aprovada; somente depois existe permit E. A âncora protegida referencia C/P/manifest; E referencia a âncora e C/P. E não entra na âncora/manifest estáticos que ele próprio referencia. O arquivo binding legado deixa de ser autoridade executável.

O manifest novo declara arquivos, entradas, dependências de selagem e resolução de imports. validate_dag rejeita dependência desconhecida/ciclo na DAG declarada; imports transitivos são coletados com conjunto de visitados. Ciclo legítimo de import Python não é confundido com ciclo de selagem/hash. Uma dependência não declarada nega no loader. **Não houve inventário/selagem completo de um pacote operacional concreto: a DAG real inteira ainda não está certificada.** Não se pode atribuir essa prova aos testes de grafos sintéticos.

## Lançamentos inventariados e cobertura

LAUNCH_INVENTORY.json separa12 caminhos com prova e limite. Inclui:

- Bridge.app_matches e worker_capture_observation: imports dinâmicos de ops substituídos por local_module verificado; transformações renderizadas/compiladas.
- Bridge.node: run encaminha Node para launcher próprio; não se presume cobertura pelo bootstrap Python. NODE_OPTIONS/NODE_PATH são removidos na chamada canônica.
- Bridge.protocol: request/record/execute de delegated passam pelo transporte Python; delegated recebe revalidação antes do dispatch.
- Operations.start: Context é revalidado na entrada e imediatamente antes de d.start; System.run encaminha filhos Python/Node; bindings originais continuam no predicado canônico.
- Node: require local declarado, hash dos bytes recebido e reconsulta/correlação. Raw python3 e require não aprovado negam. Interfaces spawn/exec/fork não cobertas são recusadas, não liberadas por fallback.
- execution-check.cjs: corpo real com namespace do template substituído por preparação autenticada; chamada baseline segue pelo transporte. O baseline/ecosystem reais foram também executados pelo Loader, mas em prova separada.

## Provas e simulações precisas

**33 PASS em reprodução isolada final:**22 em test_authority e11 em test_connected. Código+testes novos copiados para diretório temporário; fontes antigas obtidas por SHA Git/hashes e trecho sanitizado publicado. Filho sem Git/local-evidence; audit hook anterior continua negando leitura privada. Node local é ferramenta de teste explicitamente disponibilizada no PATH isolado; não é autoridade de instalação ou variável de ambiente de autenticação.

Provas incluem ausência/leitura negada/adulteração/metadados, substituição entre snapshot e execução, import/filho não autorizado, fase/perfil/política divergentes, expiração/troca entre API-worker, emissão/resposta perdida sem renovação/replay, grafo desconhecido/ciclo e query sem writes em registros. A carga após troca executa bytes aprovados anteriores; uma nova carga detecta o arquivo adulterado.

Consumidores conectados reais: Recovery corrigido, Bridge policy/bindings, Contract/checker ORIGINAL, Operations.certificate/start, Sequencer e controles sobre fixture canônica completa. PRESTOP/ORIGINAL/CANDIDATE, geração37/guarda38, seleção incerta e consumo sem replay/falso complete foram ensaiados. Event775 e binding ausente continuam negando antes das fábricas operacionais, instrumentadas para não haver efeito caso fossem alcançadas.

**Simulado/injetado:** Store.read e verificação da cadeia root, UID do owner, lock root do Store, callback policy/phase/guard/nft, transporte root/clock, processos/DB/HTTP/PM2/systemd/cron/saved, captura worker e construção do controlador no gate. Helper.act/query é real, mas helper.main/lock/audit/root filesystem não foram executados. Ancestrais Event e775 usam metadata sintética nessa prova, não chmod. Restore é autoridade injetada válida/negativa, sem novo restore.

Node roda de verdade sobre execution-check e loader CommonJS, mas seu canal para Python é simulado nesse ensaio. O baseline/ecosystem reais rodam em outro teste pelo Loader. Não existe prova combinada da cadeia inteira instalada.

Ocorrências de desenvolvimento preservadas em PROOFS.json: ancoragem textual ambígua no transformador corrigida; teste encontrou um segundo importlib em worker_capture_observation, então ele também foi encaminhado; primeira reprodução isolada encontrou Node fora do PATH mínimo e o harness passou a disponibilizar explicitamente a ferramenta já existente. Nenhum desses ajustes envolveu produção. Reexecuções foram dirigidas e a reprodução final certifica os bytes finais; suítes anteriores não foram repetidas.

## Bloqueios remanescentes — impedem declarar integração concluída

**B1 — Diagnóstico canônico da consulta:** registro literal e fonte futura de privileged_output foram estendidos, mas authority.fixed_query ainda usa subprocess capture direto. A escrita byte-exata dos diagnósticos privados canônicos não está ligada ao bootstrap inicial sem uma preparação já autenticada. O audit root do helper foi preservado no código, mas isso não substitui essa integração. Não usar esta consulta como transporte operacional certificado.

**B2 — Processos filhos completos:** falta executar as três etapas reais delegated request/record/execute através dos bootstraps e da consulta protegida no mesmo ensaio. Bridge.node -> Node bootstrap -> Python bootstrap -> baseline real também foi demonstrado somente por partes. Transformação compilada e ensaios separados não certificam a cadeia combinada.

**B3 — PM2/ecossistema:** System.start continua chamando PM2 com um arquivo ecosystem.config.cjs que o PM2 relê em outro processo. As verificações canônicas de configuração permanecem, mas não há prova de carga dos mesmos bytes pelo PM2. Bootstrap Python/Node de controle não cobre automaticamente essa fronteira. Não afirmar proteção dessa releitura contra substituição concorrente.

**B4 — Composição/instalador e fechamento transitivo:** APIs root de instalação/emissão existem, mas não há pacote/instalador concreto selado que instale as bibliotecas/âncora e confira todos os hashes. Não houve fechamento de todos os imports/entradas/dependências dos quatro modos em um manifest real. Root pin/16 namespaces anteriores permanecem pendentes. Nenhum campo foi preenchido para PASS.

Esses bloqueios são locais de integração/certificação, além das leituras/instalação futuras dependentes de autorização. Parar aqui para revisão, sem emitir comprovante real, gerar pacote operacional ou criar outra janela.

## Entrega, documentação e preservação

FULL_DELTA.patch representa os arquivos novos deste incremento e os acréscimos aos três documentos **contra o estado documental de entrada**, que já continha a avaliação anterior. Não incorpora a si próprio ou MANIFEST para evitar autorreferência. Os hashes dos documentos de entrada estão em PROOFS.json; nenhuma alteração anterior foi descartada. O manifest separado fixa fontes, provas, relatórios, patch e documentos finais.

SOURCE_PROVENANCE fixa fontes aceitas; seus bytes e os relatórios/patches/recibos/gerações consumidos permanecem intactos. Não houve coleta produtiva, emissão/instalação reais, sudoers ativo, backup, importação, envio, schema/dados/env/credenciais/permissões produtivas, commit/push. NEWauth+NEWDB+NEWcipher, frontend, crons, guarda38/out.15 ficam fora de alteração; não se trata de nova observação produtiva. Responsável operacional Deifson; revisão16/10 e próxima21/10 ou antes após mudanças.

**LOCAL VALIDATED somente para o núcleo/ensaios descritos. INTEGRATION BLOCKED / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY. CSV SUSPENSO.**
