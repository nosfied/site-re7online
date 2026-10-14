# Integração preventiva dos preparadores futuros —14/10/2026

**IMPLEMENTED / LOCAL VALIDATED / FOR REVIEW / NOT INSTALLED.** Continuidade7bd069e7.
Adapter novo `scripts/operational_preparers_v3.py`, sem modificar preparadores
históricos, coordenador revisado, gerações seladas/consumidas ou seus manifests.
[Contrato e comandos](../../../../../scripts/README.md#operational_preparers_v3py).

## Fronteiras conectadas

| Adapter novo | Conexão implementada | Prova local e limite |
| --- | --- | --- |
| API | `prepare_api` → lock privado → fontes/capacidade/identidade/grafo/reuso → sidecar → gate antes de cada copy/build/tar → inventário/recibo local | Cópia real de bytes sintéticos já compilados; DENY impede a cópia; fonte sparse orçada pelo tamanho denso. Não buildou API funcional nem importou entrypoint |
| Frontend | `prepare_frontend` usa a mesma fronteira e valida recipe inteira antes do primeiro efeito | Cópia/tar reais em isolamento; tar só nomes literais e hashes; drift entre steps bloqueia próximo step e preserva parcial. Sem rebuild frontend |
| Auth | `close_auth` → gate → journal canônico → sidecar CONSUMED/REFUSED/SUPERSEDED | Completo mantém dependência alcançada/launcher, identifica histórico arquivável apenas com custódia/restore. Sem repetir a janela ou gerar certificado produtivo |
| Banco | `close_database` → gate → journal + recibo VERIFIED/planHash → sidecar | Resultado incerto/recibo divergente/fonte incompleta nega. Não importa credential_sequencer nem executa ALTER/recovery |

## Capturas reais e limites

Os adapters não confiam em `contextObservation`/`capacitySamples` autoafirmados no
input: selecionam esses fatos de fontes privadas originais por hashes e ponteiros
fixos. Exigem timestamps originais/frescor, duas observações completas e identidade
esperada, budget por executor, fontes transitivas e saved/fallback vinculados ao
grafo nos nomes canônicos. Ausência dos fatos no export original nega: não duplicar
uma observação, regenerar configuração ou ajustar baseline para PASS.

Leitores reaproveitados por hashes: calculador min(deploy/PG), observação consistente
saved/fallback e Resolver transitivo. CLI usa relógio real; não oferece clock sintético,
process control, build funcional, SSH, provider, cron, limpeza ou política privilegiada.
Conexão Python de build está atrás do gate e foi exercitada com hook sintético apenas
para comprovar negativa antes da chamada; nenhum build funcional foi executado.

Compatibilidade de schema foi conferida por leitura dos arquivos privados originais
já arquivados: journal auth SHA390104ea79de699d25d393942ed04ee1c9cc6c65991b18f9a414d00bab453f18;
journal banco SHA2bf1a5483b7fac6b54199664db5793ea2e44aec542fa21844654b86b2fa8547a
e recibo DB com VERIFIED/usesNewCredentials/oldCredentialReactivation. Essas leituras
validaram o decoder/contrato de formato: não uma nova verificação do banco atual,
nem certificado de encerramento substituto. Não foi emitido sidecar das gerações
produtivas consumidas e não houve leitura nova da VPS.

## Provas executadas

**14 testes dos adapters PASS +24 regressões dirigidas PASS =38.**

- API/frontend: cópia atrás do gate; recipe negada antes de copy/build/tar;
  identidade/sha/fonte faltante/stale/modo/destino saved-fallback/orçamento negativos.
- Arquivo sparse não cabe por alocação original pequena: budget da cópia densa nega.
- REUSE nega cópia redundante; receita sem mutação em geração nova preserva fonte.
- Drift entre operações preserva primeiro arquivo/intent/DENY e impede o segundo;
  geração já criada ou recusada não é reusada nem seus registros sobrescritos.
- Tar isolado contém somente nomes/hashes selados, sem destinos externos.
- Auth/banco classificam dependência consumida como HOST_REQUIRED e histórico com
  custódia como ARCHIVABLE_FOR_REVIEW; sem prova permanece UNRESOLVED. Receipt
  UNCERTAIN, journal sem complete/falha posterior e fontes ausentes negam sidecar.

Recusa antes de criação da geração recebe sidecar privado próprio de REFUSED,
sem cópia; parcial conserva geração/intent/DENY. Nenhum rollback/exclusão automática.
Inventário posterior inclui evidências e nega alocação além do orçamento local.
**LOCAL_PREPARED/LOCAL_CLOSURE_RECORDED nunca é execução autorizada ou PASS produtivo.**

## Comandos e decisão

Verificar `scripts/operational_preparers_v3.sha256`, executar os comandos locais do
[README](../../../../../scripts/README.md#operational_preparers_v3py) com inputs
privados originais/SHAs revisados, em pai do executor700 e arquivos600. API/frontend
recebem diretório pai de nova geração; auth/banco recebem caminho de sidecar novo.
A integração de código às versões futuras está concluída; instalação e uso remoto
não foram autorizados nem executados. Nenhum input/binding/política produtivos novos
foram fabricados para apresentar a revisão como janela pronta.

Responsável operacional Deifson Oliveira; última revisão local14/10/2026, próxima
21/10/2026 ou antes após mudanças/janela/recusa/substituição/encerramento. Terceiro lote
continua PREPARADO, sem retirada autorizada. NEWauth+NEWDB, auth/banco concluídos,
out.15 CLOSED e guarda38 fechada preservados. **Segurança externa/cifragem OPEN**
continua na [sequência de segurança](../README.md), independente da retenção.
