# Backport mínimo do worker — pacote de revisão

**FONTES/DOCUMENTAÇÃO PARA REVISÃO; NOT DEPLOYED.** Separado do candidato API/frontend
a3d16d4bdc4b143deeb6b66d4e963b0b4b3f216b. Não usar esta árvore como API ou base de
scripts operacionais. Nenhuma alteração de shutdown foi implementada.

- Base reproduzida: `bf5f1d7610ca3f8144faa6f7b7994598e4a4017b`.
- Origem exclusiva das cinco fontes alteradas: `f06d49cb61fcf57b423603b93797acad4b797d33`.
- [Diff exato](worker-persistence.patch), SHA256
  `9ce907c09adce3f196953a25780760de2c186c901585b5527ae9c584c3010dc1`.
- [Manifesto de fontes, dependências e compilados](manifest.json).
- [Receita executada em árvore limpa](reproduce.py).
- [Texto completo da proposta de parada e retorno](STOP_PROPOSAL.md).

| Arquivo sob apps/whatsapp-agent/src | Adições | Remoções |
| --- | ---: | ---: |
| config/tenantOperationalConfig.ts | 703 | 645 |
| config/tenantOperationalConfigStore.ts (novo) | 40 | 0 |
| queue/assignmentPolicy.ts | 193 | 185 |
| web-session/hybridIdentity.ts | 130 | 113 |
| web-session/webSessionAuthorization.ts | 101 | 88 |
| **Total** | **1.167** | **1.031** |

O volume corresponde ao envolvimento dos escritores existentes pelo lock e à
transformação sobre leitura atual; não à inclusão de novas funcionalidades. Os cinco
arquivos resultantes são idênticos aos de f06. Aplicação limpa do patch sobre bf5;
19+2+5+4 locais substitutivos protegidos nesses módulos. Não foram copiados módulos
CRM/fila operacional/realtime mais novos. Mantida ordem advisory de distribuição →
config → runtime e seleção revisada em f06; sem rede dentro do lock.

Baseline: 91 JS correspondentes iguais ao bundle preservado, todos os 65 alcançáveis;
package/lock/tsconfig idênticos. O JS extra shadow antigo fica fora do grafo. Backport:
66 alcançáveis, somente os quatro módulos alterados e o helper novo; núcleo worker
inalterado. O worker completo teria 21 módulos diferentes/novos.

## Reproduzir sem iniciar serviço

Pré-requisitos: clone contendo as revisões fixadas; Python >=3.12, Git, Node22.13.0,
npm11.7.0; acesso ao registry para `npm ci`. Use diretório de saída NOVO e local,
nunca uma release em uso. O script recusa sobrescrita e recebe somente PATH do
ambiente; não lê .env/configuração operacional. DATABASE_URL é sintética com porta
1 e só usada na geração, sem conexão ao DB. Instala com `--ignore-scripts`, executa
Prisma generate explicitamente, copia cliente pelo script existente e compila.
Não chama start/prestart, migrate, provider ou runner.

```bash
python3 docs/reviews/secult-worker-persistence/reproduce.py \
  --repo /caminho/do/clone \
  --output /caminho/local/novo/worker-reproduction
```

A receita extrai somente fontes/manifestos necessários do Git, aplica o patch e
confere hashes. Mantém lockfiles bf5: agent Prisma/client6.19.2, worker wrapper/CLI
6.19.3, TypeScript5.9.3, Baileys7.0.0-rc13 e pg8.23.0. Não promete que versões
instaladas desconhecidas sejam iguais só por existir um lockfile.

**Insumo Prisma explícito:** geração usa schema da revisão a3d16d4b, igual ao da API
produtiva e8ebd776, fixado por SHA256 no manifesto. É insumo de geração, separado das
cinco fontes do backport; não aplica DDL, não entrega schema antigo para substituir
banco e não incorpora API/frontend. Reproduz o cliente6.19.2 usado nas provas locais,
copiado para wrapper worker6.19.3 pelo procedimento existente. Execução no Node20.20.0 foi posteriormente validada em isolamento: 104 testes PASS
e carregamento dos módulos (ver resultado abaixo). Isso não afirma identidade com
todas as dependências instaladas no host nem valida sessões reais.

## Resultado da reprodução limpa em 29/09

`npm ci` a partir de ambos os lockfiles, sem node_modules compartilhado e sem symlinks
para dependências anteriores; geração explícita e build exit0. **92 arquivos
compilados iguais ao manifesto anterior**, byte a byte. Novo `worker-code.tar`
determinístico, sem dependências/configuração privada, SHA256:
`11f505a12ed40b60a471612253d27c85b956952826933417ca21e3251c3c4a93`.
É diferente do tar experimental anterior porque o layout não inclui o manifesto
adicional dentro do tar; o conteúdo compilado é idêntico. Dependências são
reconstruídas pelos lockfiles, não vendorizadas nem publicadas como bundle produtivo.

A nova execução cobriu a lacuna de empacotamento: não repetiu suítes sem alteração.
Reutilizados 45 testes de distribuição/identidade e 30 de concorrência do backport.
Tipagem: 13 erros preexistentes, logs completos iguais base/backport; build --noCheck
não é aprovação de tipos. Quatro reproduções demonstram shutdown inseguro; **não**
validam a proposta de correção.

O material disponibilizado para revisão não contém bundle vivo, credenciais,
configuração de host, dumps, logs ou evidências operacionais. Material preparado para publicação exclusivamente na branch de revisão, com
gatilhos conferidos. Nenhum serviço produtivo é acionado por esta documentação. Evidências ficam privadas
em local-evidence/secult-worker-options-20260929 e secult-worker-package-20260929.

G1: alternativa mínima escolhida, pacote fonte reproduzido e execução Node20 validada
nos caminhos exercitados; revisão e configuração final da release pendentes. G2: parada segura futura e decisão/procedimento da primeira
interrupção pendentes. Sem deploy/ativação. Campanhas/CRA aguardam owner.

Registros legados: sem obrigação de liberar quando falta comprovação; elegíveis
somente se já satisfazem os critérios implementados. Sem backfill, inferência de
responsável ou corte temporal. Detalhamento no documento de parada/retorno, seção D.

## Validação adicional para publicação

[Comandos, versão exata e resultados Node20.20.0](NODE20_RESULTS.md): carregamento
sem entrypoint/provider e 104/104 testes PASS. Dependências inalteradas. Não aprova
shutdown. CI push só main/develop; Vercel desabilitado nesta branch de revisão.
Publicação autorizada somente deste material revisável, sem implementação ativa.

Validação do staging: diff --check dos documentos/receita/manifesto sem erros.
O patch exato contém 33 linhas de contexto vazio representadas por um espaço,
inerentes ao formato unified diff; foram preservadas para manter seu SHA. Somente
esse arquivo foi verificado separadamente: aplicação --check --whitespace=error-all
sobre a base reproduzida passou. Nenhum whitespace inválido nas adições de código.
