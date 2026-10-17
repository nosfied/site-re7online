# Node/PM2 — comandos concretos SOMENTE PARA REVISÃO

Nenhuma execução na VPS autorizada nesta rodada. Futura aprovação é separada.
Deploy SEM sudo. Não executar Node, PM2, env, CJS, ldd, SQL ou código capturado.
Ferramenta escolhida ANTES da leitura: somente /usr/bin/readelf. Ausência,
acesso negado, cadeia do analisador sem owner root/proteção, drift ou falha: DENY com parcial preservado; sem alternativa,
instalação, retry, reparo ou download. Não reutilizar destinos consumidos.

O owner revisa estes literais no Git; o launcher confere FD/no-follow/metadata,
carrega os MESMOS bytes e autentica o manifest/fontes antes de executar o driver.
Só materialize/collect são expostos. Um SSH batch único transfere fontes inativas
e devolve também DENY. Sem resposta completa, preservar canais locais; não
reconectar automaticamente. Não confundir custódia com certificação.

## Destinos e limites prévios

- LOCAL material: /dev/shm/re7-csv-toolchain-material-20261017-v1.
- VPS inativos: /dev/shm/re7-csv-toolchain-tools-20261017-v1.
- VPS resultados: /dev/shm/re7-csv-toolchain-read-20261017-v1.
- LOCAL custódia: re7-private-retention-custody/csv-toolchain-discovery-20261017-v1.
- LOCAL diagnóstico: mesmo parent, csv-toolchain-launcher-20261017-v1-{materialize,collect}.
O parent local é o privado legítimo já documentado, owner700; scripts não o criam
nem corrigem. Novos diretórios700/arquivos600 por criação exclusiva/no-follow.
Destino existente impede a ação. Fontes6, sem closure26 desnecessária ao diagnóstico.
Cada stdout/stderr contém comando, intervalo, código, errno, tamanho e SHA;
private_record canônico, export byte-exato e ingestão do driver aceito.

Leituras: scripts/package/env <=8MiB; PM2 entry <=64KiB; imagens <=256MiB;
maps <=256KiB; pm2.pid/boot <=64B; até64 arquivos mapeados e512MiB somados.
readelf:15s por imagem, stdout/stderr separados com limite HARD1MiB/canal;
transporte180s. Excesso/timeout preserva parcial e nega. Nenhum backup/RPO.

## 1. Materialização LOCAL inativa (somente após aprovação futura)

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-toolchain-discovery-20261017')
f=p/'launch.py'
for q in (f,*f.parents):assert not q.is_symlink(),'launcher_symlink'
def meta(s):return tuple(getattr(s,'st_'+k)for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
s=f.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'launcher_metadata'
fd=os.open(f,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 assert meta(os.fstat(fd))==meta(s),'launcher_replaced'
 raw=os.read(fd,65536)
 assert meta(os.fstat(fd))==meta(s) and meta(f.lstat())==meta(s),'launcher_changed'
finally:os.close(fd)
assert hashlib.sha256(raw).hexdigest()=='cdc1bb35eb986feb8128b64e6d27d4df63866ea3f0ff578f9c5a3691aa7c5b0c','reviewed_launcher'
sys.argv=[str(f),str(p),'bda69876fbcd2ecf737d133c48e8c06dda7a7ffb4375186cd0b042a7820e8645','materialize']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## 2. Transferência única, descoberta e custódia (aprovação futura separada)

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-toolchain-discovery-20261017')
f=p/'launch.py'
for q in (f,*f.parents):assert not q.is_symlink(),'launcher_symlink'
def meta(s):return tuple(getattr(s,'st_'+k)for k in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
s=f.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'launcher_metadata'
fd=os.open(f,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
try:
 assert meta(os.fstat(fd))==meta(s),'launcher_replaced'
 raw=os.read(fd,65536)
 assert meta(os.fstat(fd))==meta(s) and meta(f.lstat())==meta(s),'launcher_changed'
finally:os.close(fd)
assert hashlib.sha256(raw).hexdigest()=='cdc1bb35eb986feb8128b64e6d27d4df63866ea3f0ff578f9c5a3691aa7c5b0c','reviewed_launcher'
sys.argv=[str(f),str(p),'bda69876fbcd2ecf737d133c48e8c06dda7a7ffb4375186cd0b042a7820e8645','collect']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

## Alcance da descoberta / parada

1. PM2 alias/bin/CLI/package e env: cadeias, links, owner/modos/hashes. O entry
deve manter bbb586… e shebang exato aprovado. CLEAN.PATH do System.start é
/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin. Primeira entrada
existente executável é lida, não executada; qualquer entrada ambígua/inacessível
nega sem adivinhar a resolução. Node deve corresponder à referência d016…;
drift conserva observação, não atualiza o pin. Não usa PATH da sessão SSH.
2. readelf é observado por cadeia/hash, aberto em FD e executado por esse FD;
imagem-alvo também por FD. A ferramenta e seu loader usam a confiança OS já
existente, NÃO uma certificação nova. O alvo Node/PM2 nunca é executado.
3. pm2.pid atual fornece apenas candidato para observação: stat/ticks/exe/maps,
boot e pm2.pid são conferidos no intervalo. Imagem running deve coincidir com
a selecionada pelo PATH acima. Não reutiliza PIDs históricos nem certifica trio.
4. readelf dos ELF mapeados: PT_INTERP/DT_NEEDED/RPATH/RUNPATH ficam nos canais
privados. Resolução integral exige análise offline desses resultados; maps cobre
o carregamento desse daemon nesse intervalo, não todas as cargas futuras.
Não se executa loader, ldconfig, ldd ou dependência para descobri-la.
5. JS transitivo: CLI/package e caminhos observados permitem comparar a fonte
pinada já disponível. NÃO percorre4552 arquivos nem alega closure CLI completa.
Imports dinâmicos não observados e proteção de todos os transitivos seguem
UNKNOWN até reconciliação dirigida; isso não é PASS de toolchain.

Resultado admissível: DISCOVERY_OBSERVED_NOT_CERTIFIED ou DENY_NO_RETRY.
elfClosureCertified=false e protectionCertified=false sempre. Metadados separados
não são snapshot atômico; nenhum resultado modifica histórico ou autoridade.
Instalação/proteção futura, SQL/ownership, saved/fallback/identidades finais e
16 vínculos/autoridade permanecem separados. CSV SUSPENSO / NOT WINDOW READY.
