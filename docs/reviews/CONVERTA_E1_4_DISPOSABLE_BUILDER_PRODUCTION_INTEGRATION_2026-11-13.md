# Converta — E1.4: integração final do builder descartável

**Data:** 2026-11-13. **Base:**
`review/campaign-recovery-20260926@62baf3f1e809171964846968cad378f8f0997b08`.
**Escopo:** código, documentação e fixtures isoladas. Nenhuma instalação de helper,
retirada real, ativação, restart, `pm2 save`, banco, Meta ou campanha foi executada.

## Lacunas fechadas

O handoff anterior exigia uma closure terminal do builder. A geração real
`immutable-fa10f4f5-external-20261112T233820Z` está legitimamente em
`EXPORTED / AUTHORITY_EXPORTED / SUCCESS`: o pacote e a autoridade foram
exportados e instalados, mas a raiz efêmera ainda é dívida de retenção. Forçar o
schema antigo produziria uma falsa sanitização; negar o handoff impediria o
preflight por uma dívida externa já classificada.

O lifecycle descartável também dependia da leitura não privilegiada de `/proc`.
No host real, a coleta terminou incompleta. O observador do PR #375 já fornecia a
arquitetura root read-only e uma instalação atômica, mas seu perfil histórico era
restrito ao piloto `a838bd33` e não podia ser reutilizado fora desse escopo.

## Implementação mínima

`generation-retirement.py` aceita um handoff schema 3 que autentica, sem reescrever
originais:

- contrato/lifecycle do produtor e hashes do pacote, manifesto e índice;
- contrato descartável, lifecycle `EXPORTED/AUTHORITY_EXPORTED` e export receipt
  `SUCCESS` da mesma geração;
- instalação inerte e dívida `PENDING_RETENTION_DEBT` vinculada à raiz/custódia;
- ausência deliberada de intent, autorização, journal e receipt terminal do
  builder.

O consumidor materializa projeção e intenção da VPS com **zero comandos de
retirada**. A fixture atravessa o driver fixed-current real até `PREFLIGHT_PASS`.
Estado `SANITIZED`, receipt misturado, geração divergente ou hash alterado são
negados. Schemas 1 e 2 permanecem inalterados.

O helper privilegiado ganhou um segundo comando fechado,
`collect-disposable-builder-fa10f4f5`. O comando histórico
`collect-builder-a838bd33` e a regra sudoers da VPS permanecem intactos. O novo
perfil fixa geração, target, raiz, custódia, contratos e locks. Ele valida que o
próprio consumidor mantém as duas travas e só atesta cobertura completa com zero
referências e zero writers.

`disposable-builder-lifecycle.py` autentica a prova privada do instalador — em vez
de tentar ler o helper `root:root 0500` — e executa o observador sob as duas
travas. `prepare` e `execute` usam nonces e atestações distintas; a prova de
`execute` ocorre antes do primeiro `ATTEMPT`. A instalação sucessora aceita somente
o helper histórico exato e publica atomicamente o novo helper, preservando o
sudoers.

## Autoridade real preservada

| Binding | Valor autenticado |
| --- | --- |
| Geração | `immutable-fa10f4f5-external-20261112T233820Z` |
| Target | `fa10f4f59c9a05328e536dd25a1668c3ba25939e` |
| Contrato descartável | `ababa172ff6a11bc1702b084ddf7668819e82db48690a4970ef479788799a0b2` |
| Lifecycle descartável | `b17053bf86407bce39870018e6eeaac967ce9e6b6f86af8f4da672c861b0c03a` |
| Export receipt | `012103fd3dd41987f4352ef61b635e3ba1866c2d3926dc416ac3f6e5d571a6bb` |
| Pacote | `29ec148a01b518e16f752ed8c289904b36edcc1ea11a03dc4003d743799ff6b1` |
| Raiz ainda retida | 2.508.197.888 B / 75.640 inodes observados; **0 B recuperados** |

Os números de ocupação são a medição operacional preservada, não um receipt de
retirada. A dívida só pode ser encerrada pelo `prepare → AUTHORIZE_ONCE → execute`
real e por medição terminal.

## Regressões

Executadas sob `umask 0022` e `PYTHONDONTWRITEBYTECODE=1`:

| Suíte | Resultado |
| --- | ---: |
| Perfil do observador | 22/22 PASS |
| Instalador do observador | 8/8 PASS |
| Lifecycle descartável | 41/41 PASS |
| Produtor/instalador e handoff | 60/60 PASS |
| `generation-retirement.py` | 81/81 PASS |

A fixture de lifecycle chega a `SANITIZED`, preserva custódia e gerações v1/v2,
remove a raiz e o registro Git e prova atestações distintas. As negativas cobrem
prova de instalação divergente, lock ausente, referência/writer, cobertura
incompleta, identidade/contrato/lifecycle alterados e drift antes do primeiro
efeito. Os quatro erros observados inicialmente na suíte de retirement foram
reproduzidos como efeito do `umask 0002` sobre o bytecode sintético; sob o contrato
canônico `0022`, os mesmos casos e a suíte integral passaram.

## Operação posterior à integração

Ainda não autorizada nesta etapa:

1. instalar atomicamente o helper sucessor e preservar o relatório privado;
2. executar `sudo -v` imediatamente antes de cada janela curta;
3. rodar `prepare` com helper, SHA e prova do instalador autenticados;
4. revisar a intenção e obter `AUTHORIZE_ONCE` específica;
5. rodar `execute`, que repete a coleta privilegiada antes do primeiro efeito;
6. conferir receipt terminal, ausência da raiz/Git e bytes/inodes recuperados.

## Veredito

**`INTEGRATION_READY`**, condicionado ao PR draft, à CI 4/4 no mesmo HEAD e à
igualdade da árvore do candidato. A geração real permanece aberta e nenhum byte
foi retirado por esta mudança.
