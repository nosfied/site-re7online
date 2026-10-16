# Autoridade dos pins de fase — decisão de parada antes da implementação

**Resultado: BLOCKED / ROOT_OF_TRUST_UNBOUND. Nenhum leitor ou integração implementado.**
**CSV SUSPENSO / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.**

Base e HEAD: `bdb57f57601147632bb529895cbcd92b8b483c6c`; branch `review/campaign-recovery-20260926`. Índice e arquivos rastreados inicialmente sem alterações. Arquivos privados/não rastreados e demais worktrees preservados. Esta rodada acrescenta somente avaliação documental; não afirma LOCAL VALIDATED para um leitor inexistente.

## Decisão e condição de parada

A instrução determina parar se a raiz de confiança não tiver definição verificável. A inspeção local confirmou que há mecanismos para revisão estática de pacote e controles root de fase, mas não uma cadeia implementada que autentique os três pins dinâmicos antes do import de `recovery_binding` e propague essa autoridade a todos os consumidores.

Criar um arquivo JSON, adicionar hash em argumento/env ou conferir um sidecar ao lado dele transferiria a confiança para um novo fornecedor ainda não autenticado. Por isso nenhum desses mecanismos foi introduzido. O risco não é demonstrado como incidente produtivo: este código continua uma proposta local não implantada.

## Mecanismos existentes e alcance demonstrado

| Evidência local | O que estabelece | O que não estabelece |
| --- | --- | --- |
| Roteiros publicados: owner decide commit/review; comandos conferem SHA literal de review e instalador | Raiz humana explícita para bytes estáticos quando o operador usa o roteiro efetivamente aprovado | Nenhum roteiro novo, aprovado e completo para os pins específicos pós-fence |
| `admit_gates.py::admit` | Confere review recebido, pacote, root/RPO/custódia e controles; registra authorizedCommit e cinco gates | O argumento decision só tem formato de SHA conferido no código; não autentica sozinho a decisão humana. Não sela recovery_binding nem o permit específico da recuperação |
| `compose_offline.py::compose` | Confere fontes/aceite/manifests e gera somente código/índices; conserva inputs ausentes | Não materializa política/instalador/binding dinâmico operacional nem fornecedor autenticado desses pins |
| `privileged.py::policy_from/main/phase_require` | Na fonte canônica, política e estado root são validados sob lock; ações exigem fase compatível | Não atesta o hash do contrato/recovery_binding do código deploy; não fornece a tupla de três pins |
| `privileged.py::act('inspect')` | Retorna política/fase nula/sourceProcessesAlive antes da fase; exige phase_read() ausente | Não é export de recuperação fenced. `check-present` confere nft, não emite permit com contrato/perfil/capturedUtc |
| `future_sources.binding_source` | Produz três constantes hexadecimais, sem efeitos | Não verifica quem forneceu os hashes, sua origem, fase ou autorização |
| Harness dos32 testes | Injeta binding sintético e exercita contratos/controles reais no alcance documentado | Não constitui fornecedor de autoridade para lançamento ou processos filhos reais |

Nenhum desses entrypoints foi executado. Fontes root são evidência de código versionado, não observação da instalação atual. Os ZIPs externos não foram usados nem reconstruídos.

## Entrada e propagação atuais — lacunas concretas

1. **Quem fornece o digest esperado?** Não há fornecedor autenticado definido para o binding de fase. Há a decisão humana/review estático como padrão canônico, mas nenhum artefato de lançamento dessa recuperação que complete sua ligação com os três pins dinâmicos.
2. **Por qual entrada chega ao primeiro consumidor?** `Recovery.build(root)` recebe somente root e importa duas constantes de `recovery_binding`; não recebe uma autoridade independente. O CLI futuro aceita root/ação/decisão e não transporta um pin autenticado de fase.
3. **Como entrada e leitor seriam autenticados?** O leitor não existe. O conjunto estático poderia futuramente fixar seus bytes no review, mas o import atual não verifica previamente o binding contra digest de origem externa aprovada. UID600 e hash autodeterminado não suprem essa lacuna.
4. **Como chega aos demais consumidores?** `Bridge.verify_recovery_policy` importa o terceiro pin; `original_bindings` importa o pin do contrato. `authorize_original_start` chama build novamente em outro ponto/processo. Compartilham um nome de módulo, não um objeto/entrada cuja autoridade tenha sido demonstrada e revalidada através do lançamento canônico.
5. **Qual o fornecedor do permit?** O consumidor exige hash exato, policySha256, fase fenced, targetProfileSha256 e capturedUtc<600s. Não foi localizado no escopo canônico consultado um produtor/lançador dessa prova específica ligado à aprovação externa. Captura genérica root e inspeção pré-fase não são equivalentes.

No harness, a fábrica/build é ligada ao controlador sintético em vários ensaios e os módulos são criados/injetados por `binding_source`. Isso continua válido para suas contraprovas locais; não prova o bootstrap real que falta.

## Ordem de selagem: parte conhecida e fronteira não resolvida

O desenho deve conservar a seguinte dependência acíclica, sem executá-la nesta rodada:

1. **Código estático:** módulos atuais, futuro leitor/launcher, CLI/start gate/Operations e controles; índices de scripts por modo e manifest de código window. O leitor deve estar na autoridade estática antes de receber dados de fase.
2. **Inputs estáticos:** perfis/planos/ecossistemas, imutáveis completos, mapas original/candidato separados, baselines/restore/cron/controles. O índice ORIGINAL deve manter o recorte obrigatório aceito, sem artefatos exclusivos candidatos. Nada disso pode ser preenchido por defaults ou recaptura oportunista.
3. **Contrato estático:** fixa perfis, código, índices e referências estáticas; recebe hash C. O review estático e seu roteiro externo podem ancorar C e o código de verificação. Não incluir arquivo que contenha C num índice já pinado pelo próprio contrato.
4. **Política correspondente:** bytes de política e seu hash P devem corresponder à decisão/perfil e à fonte root validada, sem novo schema paralelo.
5. **Fase dinâmica:** somente depois do evento legítimo poderá existir o permit E. Não entra no selo estático anterior à fase como se já existisse; seu produtor e canal de autenticação ainda precisam ser definidos.
6. **Autoridade de fase:** ligação de C, P e hash(E), leitor/launcher e decisão precisa de ancoragem externa verificável. **Esse fornecedor, sua entrada no primeiro consumidor e sua propagação aos processos filhos estão pendentes.** Acrescentar um arquivo A sem definir quem autentica hash(A) não fecha a cadeia.

A ordem acima é um mapa de dependências, não manifest pronto, schema aprovado, autorização de materialização ou mecanismo certificado. Os manifests existentes ficam intactos.

## O que precisa ser decidido antes de qualquer implementação

Há uma escolha arquitetural ainda aberta entre usar revisão humana explícita dos bytes de fase por um lançamento autenticado, ou uma atestação emitida por mecanismo canônico com raiz previamente fixada. Não se escolheu nem implementou qualquer alternativa nesta avaliação. Em particular, não se presumiu nova delegação sudo/root, assinatura, segredo, serviço ou argumento confiável só pelo seu formato.

A decisão precisa identificar concretamente:

- fornecedor autorizado de C/P/E e evidência da autenticação desse fornecedor;
- primeiro código executado confiável e autenticação do leitor e suas dependências antes de imports locais;
- transporte imutável/revalidável da autoridade ao CLI, build, bindings e start gate/Operations dos processos filhos;
- ligação à decisão, execução/geração, perfis e fase, sem confiar no mesmo diretório mutável como sua própria raiz;
- emissão e revalidação do permit, tratamento de troca concorrente e ausência de ciclos.

Esse é o bloqueio exato. Não basta autorizar a implementação genérica de um leitor sem fechar esse bootstrap.

## Verificações feitas e provas não executadas

Somente leitura estática, hashes e conferência de diff/status. Todos os112 membros do manifest publicado FILES.sha256 conferiram antes da avaliação documental. Os módulos/provas pertinentes constam com hashes em CHECKS.json; após a documentação seus bytes permanecem iguais. Código, patches e checkpoints históricos não foram alterados.

**Zero testes funcionais ou builds executados.** Não existe delta de leitor para ensaiar. Não foram fabricados resultados de ausência/adulteração/leitura negada/concorrência/fase/perfil/política/expiração/ciclos. As32 provas anteriores continuam válidas para seu alcance, não para uma integração nova de autoridade. O roteiro de regressão solicitado permanece pendente e deverá exercitar o lançamento e consumidores concretos quando o bootstrap estiver definido, com efeitos externos simulados e sem repetir suítes fora da superfície afetada.

## Arquivos e limites da entrega

Alterações apenas em BACKLOG_TECH, RUNBOOK_WHATSAPP_AGENT e DOCUMENTATION_INDEX, acrescentando checkpoint de bloqueio. Novos: este relatório, CHECKS.json, FULL_DELTA.patch e MANIFEST.sha256. O patch inclui os três documentos e os dois novos documentos de avaliação; exclui a si próprio e o manifest para evitar autorreferência. O manifest separado inclui o patch e todos os documentos alterados.

Nenhum recovery*.py, checker, transformador, protótipo externo, política, binding, índice histórico ou geração consumida foi editado. Não houve VPS/SSH, captura root, SQL, mudança de permissões/credenciais, backup, instalação, operação, commit ou push. NEWauth+NEWDB+NEWcipher, produção, ambos crons, frontend, guarda38 e out.15 estão fora de alteração; isso não é nova observação produtiva.

**Parada deliberada antes da implementação por ROOT_OF_TRUST_UNBOUND. CSV SUSPENSO / REVIEW PENDING / NOT DEPLOYED / NOT WINDOW READY.**
