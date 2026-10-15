# Custódia e recuperação de artefatos — sem promoção

Owner: Deifson. Diretório permanente local700: `/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/openai-operational-20261015`. Arquivo privado `openai-v4.private.tar`, índice171 arquivos, captura/recibos e `ISSUANCE_BINDING.private.json` ligam o pacote à emissão/valor custodiado e ao perfil aprovado. Conteúdo/IDs permanecem privados; arquivos600. Hashes públicos em COMMANDS_FOR_REVIEW.txt; nenhuma configuração privada no Git.

Restaurar somente para inspeção isolada no ThinkPad, se necessário. Este comando NÃO autoriza transferência sobre uma geração, aplicação de config, retorno ou partida. Não é necessário repetir extração da VPS já conferida.

```bash
(
set -euo pipefail
umask 077
python3 - <<'RECOVER'
import hashlib,json,tarfile
from pathlib import Path
c=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/openai-operational-20261015')
a=c/'openai-v4.private.tar';assert hashlib.sha256(a.read_bytes()).hexdigest()=='0e87d1e538fa9b351cc1da66d1f6e75e86f7d01b8c588a407fccbc512e7fa5ae'
q=Path('/tmp/re7-openai-v4-custody-inspection-20261015');assert not q.exists()and not q.is_symlink();q.mkdir(mode=0o700)
gen='incident-6683-v4-security-openai-v4-20261015T203000Z'
with tarfile.open(a)as t:
 for e in t.getmembers():
  n=Path(e.name);assert not n.is_absolute()and '..'not in n.parts and n.parts[0]==gen and(e.isfile()or e.isdir())
 t.extractall(q,filter='data')
p=q/gen;index=json.loads((c/'package-v4-index.private.json').read_text())
actual={str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest()for f in p.rglob('*')if f.is_file()}
assert actual==index['files'];print('CUSTODY_EXTRACTION_171_FILES_VERIFIED_NO_PROMOTION')
RECOVER
)
```

Sem seguir links ou usar dados de tenant no probe. A receita recupera bytes/índice/modos do arquivo; a validade operacional exige estado atual e decisão própria, não este índice histórico. Os retornos com chave nova e NEWauth+NEWDB+NEWcipher são os únicos compatíveis depois da seleção. Um pacote histórico não autoriza reativar valores expostos.

Custódia no computador do owner é off-host quanto à VPS, não réplica física independente. Diretórios/laboratório/provas retidos continuam protegidos. Após a futura janela, registrar recibos/resultados/classificação em sidecar e copiar evidências novas; não editar manifests históricos nem excluir gerações, logs ou snapshots por esta entrega.
