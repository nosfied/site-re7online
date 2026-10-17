# Consulta dirigida de capacidade/metadados — SOMENTE PARA REVISÃO

Nenhuma execução VPS autorizada nesta entrega. Não repetir os três blocosv2.
Um único SSH futuro, como deploy SEM sudo, usa o transporte de snapshots aceito.
Código e dependências autenticados pelo literal revisado; mesmos bytes compilados
em memória. Não disponibiliza ferramentas/arquivos remotos. Python -B -I -S.
Sem mkdir/write/read de arquivo de imagem, readdir, PM2/Node, readelf/ldd/SQL.

## Objeto e chamada exatos

Destino somente para leitura: /dev/shm/re7-csv-toolchain-read-20261017-v2.
Metadados: /, /dev, /dev/shm, destino e destino/images (existência/tipo/owner/modo,
dev/inode/nlink/tamanho/mtime/ctime). Não abre images; mesmo se arquivo/symlink,
só lstat relativo ao FD. Pais/destino devem ser diretórios sem symlink; FD no-follow
é mantido e conferido antes/depois. Leitura negada/ausência/substituição nega e
preserva parcial; sem tentar outro destino ou alterar permissões.

Uma chamada os.statvfs(fd_destino) no ramo seguro: operandos FD/path lógico e
metadados, início/fim, todos os resultados numéricos, f_bavail×f_frsize e comparação
com512MiB, calculada desse ÚNICO retorno. Não duas amostras misturadas. Se o destino
não puder ser aberto com segurança, chamadas=0/NOT EXECUTED com motivo/errno;
nenhum fallback de caminho ou statvfs em pai. Não observa o passado retroativamente.

Predicado directory() canônico consultado SEPARADAMENTE, sem criar images. Um
resultado de capacidade satisfatório não prova que mkdir funcionaria; metadados e
consulta não testam escrita/ACL/quota/propriedades de montagem. Budget=false pode
ser leitura concluída, mas NUNCA admissão/PASS operacional nem reversão do DENY.
Metadados de caminhos/FDs e statvfs formam intervalo, não snapshot global atômico.

## Destinos locais e custódia

NENHUM destino remoto novo. Origemv2 e pais não serão escritos/ajustados.
LOCAL parent legítimo existente owner700:
 /home/deifson-oliveira/DEIFSON/re7-private-retention-custody
Novos diretórios exclusivos700/arquivos600:
 csv-toolchain-capacity-20261017-v1
 csv-toolchain-capacity-launcher-20261017-v1-collect
Sem criar/reparar parent. Destino existente impede SSH. SSH25s/BatchMode/StrictHostKey;
falha/timeout/resposta perdida: Capture/private_record canônicos preservam os
bytes stdout/stderr, comando, início/fim, código, errno, tamanhos/hashes. Não retry,
reconexão, reparo, sudo ou expansão de limite. Fonte local em memória:6arquivos;
resposta metadata <=64KiB; sem transferência de imagens/runtime. O envelope vem
pelo stdout autenticado do único SSH; custódia é local, pois journal remoto seria
escrita proibida. Recibo local distingue leitura concluída de budgetSatisfied.
Sem writer/parent legítimo, parar antes dos efeitos; não fabricar diagnóstico.

## Bloco único concreto — executar somente após aprovação futura

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_LOCAL'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-toolchain-capacity-20261017')
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
assert hashlib.sha256(raw).hexdigest()=='8d9b0990920fe23a7a5ecbffa0e976c40b1b574bb773a0b1ba0d3dfa58a08ccf','reviewed_launcher'
sys.argv=[str(f),str(p),'9f248998b7bde612c98e8236f2900c0f492400b6668668ee4035b46d1e2b2227','collect']
exec(compile(raw,str(f),'exec'),{'__name__':'__main__','__file__':str(f)})
REVIEWED_LOCAL
)
```

A autoridade dos hashes é a revisão independente destes literais pelo owner, não
um argumento/arquivo autoaprovado. Não instala Context/âncora/permit nem concede
partida. Ausência/alteração de fonte nega antes de SSH. Nenhum entrypoint consumido
é executado. Não há condição que continue descoberta de imagens automaticamente.

Código/manifest/launcher e procedência estão neste diretório; escritores, Capture,
reader e protocolo SSH são os aceitos. A aprovação futura desta consulta termina
na observação e custódia, sem limpeza, mudança do destino/orçamento512MiB, reparo,
instalação ou retomada do CSV. NOT DEPLOYED / NOT WINDOW READY.
