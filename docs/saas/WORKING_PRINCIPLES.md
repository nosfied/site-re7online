# Princípios fundamentais de trabalho do Converta

**Status: CANÔNICO / VINCULANTE / ANTERIOR A QUALQUER RUNBOOK**

Este documento declara os princípios que governam desenvolvimento, auditoria,
homologação, implantação, retenção e operação do Converta. Os procedimentos
especializados existem para concretizá-los; não podem ser aplicados mecanicamente
de modo que produza o resultado oposto.

Estes princípios não autorizam mutação. Autorizações, identidades, locks, evidências
e gates específicos continuam obrigatórios conforme o runbook aplicável.

## 1. Respeitar a natureza multitenant

Toda decisão deve preservar isolamento entre tenants por construção, não apenas por
convenção de interface.

- Dados, contatos, leads, conversas, mídias, templates, campanhas, jobs, sessões e
  credenciais pertencem ao tenant explicitamente resolvido.
- Consultas, caches, deduplicação, reuso e mutações precisam incluir a fronteira do
  tenant.
- Uma operação de um tenant não pode bloquear, selecionar, reutilizar, expor ou
  alterar dados de outro.
- Mecanismos realmente globais devem ser identificados como globais. A guarda de
  campanhas, por exemplo, não pode ser apresentada como isolamento tenant-scoped.
- Testes precisam comprovar funcionamento e isolamento negativo.
- Evidências públicas ou versionadas não contêm PII nem identificadores privados de
  tenants além do estritamente necessário e sanitizado.

Se o isolamento não estiver comprovado, a operação é negada.

## 2. Evitar retrabalho, desperdício e repetição

Antes de criar, construir, coletar, transferir ou executar novamente, verificar o
que já existe e continua válido.

- Reutilizar código integrado, pacote autenticado, release verificada, evidência,
  auditoria, receipt, journal, fixture, consulta e homologação ainda válidos.
- Não repetir build, upload, campanha, envio, restart, save, coleta ou retirada já
  comprovados.
- Corrigir a causa estrutural, não contornar sucessivamente sintomas.
- Uma negativa não autoriza começar do zero. A retomada usa o estado e as provas
  duráveis já produzidos.
- Medir custo de CPU, memória, disco, inodes, GitHub Actions, tempo humano e efeitos
  externos antes de gerar nova cópia ou execução.
- Auditoria e controles devem reduzir o trabalho total. Se estiverem produzindo
  reinvestigação sem nova informação, o procedimento deve parar e ser reconciliado.

O caminho preferido é sempre a menor mudança suficiente, reversível e comprovável.

## 3. O Codex acessa o código-verdade e o estado-verdade

Relatos, prompts, resumos e documentação histórica orientam a busca, mas não
substituem inspeção das fontes reais disponíveis.

Antes de concluir ou propor mutação, o Codex deve confrontar, conforme o escopo:

- branch, target, árvore Git e código efetivamente integrado;
- testes e CI vinculados à árvore correta;
- schema e contratos realmente implementados;
- release, processos, symlinks, banco e estado operacional efetivamente ativos;
- artefatos privados e seus hashes;
- documentação canônica vigente.

É obrigatório distinguir:

- **fato comprovado**;
- **inferência apoiada por evidência**;
- **hipótese ainda não comprovada**.

Quando código, estado, evidência e documentação divergirem, a divergência deve ser
registrada e resolvida. Não se escolhe silenciosamente a fonte mais conveniente.

## 4. Auditar antes de alterar, para aproveitar o que já existe

Toda frente começa com auditoria proporcional, preferencialmente somente leitura,
dirigida à decisão concreta.

A auditoria deve:

1. consultar o estado canônico e o código real;
2. identificar provas, artefatos e homologações reutilizáveis;
3. delimitar tenant, componente, dados, pessoas e sistemas afetados;
4. medir apenas a lacuna ainda não comprovada;
5. separar defeito funcional, apresentação, observabilidade, infraestrutura e
   procedimento;
6. definir a mudança mínima e seus critérios de aceite;
7. provar que a nova ação não repete trabalho concluído.

Auditoria não significa inventário global automático. Nova coleta integral exige
justificativa objetiva de que as provas existentes perderam validade ou não cobrem a
decisão atual.

## 5. Documentar como memória operacional e mecanismo de continuidade

Documentação não é relatório posterior opcional. Ela preserva o contexto necessário
para que outro executor continue do ponto correto.

Cada frente deve manter:

- estado vigente separado do histórico;
- identidades e hashes relevantes;
- decisões, limites e autorizações;
- o que foi comprovado;
- o que permanece pendente;
- o que não deve ser repetido;
- procedimento versionado e regressões que impeçam recorrência;
- custos e capacidade quando influenciam a próxima decisão.

O runbook é a única instrução executável. Documentos históricos e preparações
anteriores são evidência, não autorização.

Mudança operacional só está incorporada quando código, testes, runbook, estado
canônico e registro estruturado concordam.

## 6. Não quebrar o que já funciona; proteger a produção viva

Produção é um sistema vivo com usuários, tenants, dados e integrações reais. Ela não é
ambiente de experimentação, depuração improvisada ou validação destrutiva.

- Preservar comportamentos comprovados fora do escopo da mudança, inclusive contratos,
  compatibilidade, isolamento, processos, dados, integrações e caminhos de retorno.
- Toda correção deve incluir regressões que protejam o comportamento anterior válido e
  comprovem apenas a alteração intencional.
- Mudanças incompatíveis exigem decisão explícita, migração, comunicação e retorno
  próprios; não podem surgir como efeito colateral.
- Antes da mutação produtiva, autenticar o estado inicial, delimitar o impacto, provar
  o retorno e estabelecer health, identidade e critérios de aceite.
- Em produção, executar a menor mutação autorizada, uma única vez, preservando os
  componentes não impactados e sem ampliar o escopo durante a janela.
- Negativa anterior à mutação mantém produção intacta. Falha posterior exige retorno
  comprovado ou estado de recuperação explicitamente bloqueado; nunca sucesso presumido.
- Leituras com possíveis efeitos colaterais não são tratadas como smoke inofensivo.
- Releases ativas, retornos necessários, dados privados e evidências de recuperação não
  podem ser retirados apenas para liberar capacidade.

Nenhuma entrega é considerada correta se resolver a novidade quebrando um fluxo que já
funcionava ou reduzindo a segurança da produção viva.

## Qualificação do procedimento antes de produção

Os princípios também se aplicam ao próprio control plane. Antes de recomendar uma
nova tentativa, o executor deve localizar a versão e a evidência do procedimento
que já funcionou, identificar a diferença atual e testar a transição completa afetada.
CI verde de módulos isolados não prova compatibilidade entre produtor e consumidor.
Dados de diagnóstico voláteis não são identidade imutável do artefato.

Falha previsível exige regressão e correção na origem. A retomada começa na última
fase válida, com seus hashes preservados e somente as observações vencidas
recapturadas. Cada negativa deve informar causa, efeito ocorrido, prova reaproveitável
e menor próxima ação. O mesmo escopo já autorizado não exige nova confirmação a
cada etapa; uma ampliação real de escopo ou efeito continua exigindo decisão própria.

## Ordem obrigatória de decisão

Toda nova frente segue esta ordem:

1. **Contextualizar:** ler princípios, estado atual e documentação da frente.
2. **Inspecionar:** acessar código e estado reais disponíveis.
3. **Reutilizar:** listar explicitamente provas e ativos que permanecem válidos.
4. **Delimitar:** declarar tenant, escopo, impacto e fronteiras de autorização.
5. **Preservar:** declarar o que já funciona e não pode regredir.
6. **Escolher:** propor a menor ação suficiente.
7. **Comprovar:** definir evidências e critérios de aceite antes da mutação.
8. **Executar uma vez:** sem ampliação silenciosa ou retry automático.
9. **Encerrar:** verificar resultado, retirar resíduos autorizados e documentar.
10. **Não repetir:** marcar provas e homologações concluídas.

## Regra de precedência

Se um procedimento produzir retrabalho evitável, repetição de prova válida, nova
coleta sem necessidade, perda de isolamento multitenant, regressão de comportamento
válido, risco não delimitado à produção viva, desperdício material ou dependência de
contexto não documentado, o executor deve parar antes da próxima mutação.

A continuação só ocorre depois de reconciliar o procedimento com estes princípios.
Cumprir um gate local não justifica violar um princípio superior.

## Condutas proibidas

- Trabalhar apenas a partir de resumo quando o código ou estado real está acessível.
- Tratar tenant de teste como se representasse isolamento multitenant comprovado.
- Repetir campanha, envio, build ou coleta para substituir evidência já suficiente.
- Criar wrapper, script ou fluxo temporário quando existe controle versionado.
- Atualizar documentação sem atualizar regressões e fonte executável correspondente.
- Declarar conclusão antes do último gate real.
- Apresentar inferência como fato.
- Usar auditoria como justificativa para reiniciar toda a investigação.
- Transferir ao owner o custo de falhas previsíveis por preflight ou teste existente.
- Usar produção viva como ambiente de ensaio ou alterar componentes fora do escopo.
- Aceitar uma correção que regrida comportamento previamente funcional.

## Aplicação aos procedimentos especializados

- O [modelo operacional](DEPLOYMENT_OPERATING_MODEL.md) deriva a arquitetura destes
  princípios.
- O [runbook](DEPLOY_RUNBOOK.md) transforma-os em gates executáveis.
- O [lifecycle de artefatos](DEPLOY_ARTIFACT_LIFECYCLE.md) impede retrabalho e dívida
  de disco por geração.
- A [prontidão de Campanhas](CAMPAIGN_OPERATIONS_READINESS.md) aplica isolamento,
  auditoria e autorização às operações multitenant e à Meta.
- O [estado canônico](CURRENT_STATE.md) define o ponto de continuidade e o que não
  deve ser repetido.

## Síntese vinculante

> Respeitar o multitenancy; consultar o código e o estado reais; auditar antes de
> agir para reutilizar o que já existe; evitar retrabalho, desperdício e repetição;
> não quebrar o que funciona e proteger a produção viva; e documentar o resultado
> para que a próxima execução continue do ponto correto.
