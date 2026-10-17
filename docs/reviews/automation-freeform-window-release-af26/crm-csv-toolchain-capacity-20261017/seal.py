"""Offline review literals only, never a collector or installer."""
import ast,hashlib,json,os,re
from pathlib import Path
P=Path(__file__).resolve().parent;ROOT=next(p for p in P.parents if(p/'.git').exists());R=P.parent
sha=lambda b:hashlib.sha256(b).hexdigest()
files={}
for n,path in [(n,P/n)for n in ('launch.py','driver.py','capacity_read.py')]+[('capture.source',R/'crm-csv-toolchain-discovery-20261017/capture.source')]+[(n,R/'crm-csv-r2-directed-20261017'/n)for n in ('read_package.py','privileged_output.source')]:
 raw=path.read_bytes();files[n]={'source':str(path.relative_to(ROOT)),'relativeSource':os.path.relpath(path,P),'bytes':len(raw),'sha256':sha(raw),'bootstrap':True}
raw=(json.dumps({'base':'af2eaf0470ef8a5859d50d5101eb4df454cbd2fa','scope':'metadata-only read; zero remote writes, at most one statvfs call; no images','files':files},sort_keys=True,indent=2)+'\n').encode();(P/'MANIFEST.json').write_bytes(raw)
old=R/'crm-csv-toolchain-discovery-20261017'
blocks=re.findall(r'```bash\n(.*?)```',(old/'COMMANDS.md').read_text(),re.S)
block=blocks[1].replace(str(old),str(P)).replace('1ba68f5cb5bc521b95a7035ecd048852c0072e85df08cf4ba18277be64e705e0',sha((P/'launch.py').read_bytes())).replace('707726e11f30ada8ef9f80f2fc7b6f84a1a737eca1b614738cf57f99c14f7dfa',sha(raw))
text='''# Consulta dirigida de capacidade/metadados — SOMENTE PARA REVISÃO

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

'''
text+='```bash\n'+block+'```\n'
text+='''
A autoridade dos hashes é a revisão independente destes literais pelo owner, não
um argumento/arquivo autoaprovado. Não instala Context/âncora/permit nem concede
partida. Ausência/alteração de fonte nega antes de SSH. Nenhum entrypoint consumido
é executado. Não há condição que continue descoberta de imagens automaticamente.

Código/manifest/launcher e procedência estão neste diretório; escritores, Capture,
reader e protocolo SSH são os aceitos. A aprovação futura desta consulta termina
na observação e custódia, sem limpeza, mudança do destino/orçamento512MiB, reparo,
instalação ou retomada do CSV. NOT DEPLOYED / NOT WINDOW READY.
'''
(P/'COMMANDS.md').write_text(text)
# Derivations match exact accepted segments; don't rewrite their sources.
original=(old/'driver.py').read_text();tree=ast.parse(original)
segments=[ast.get_source_segment(original,n)for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in ('libload','libraries','pack')or isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='REMOTE_LAUNCH'for t in n.targets)]
current=(P/'driver.py').read_text();assert all(segment in current for segment in segments)
(P/'PROVENANCE.json').write_text(json.dumps({'base':'af2eaf0470ef8a5859d50d5101eb4df454cbd2fa','driverSource':str((old/'driver.py').relative_to(ROOT)),'driverSourceSha256':sha(original.encode()),'exactSegments':['libload','libraries','pack','REMOTE_LAUNCH'],'launcherSource':str((old/'launch.py').relative_to(ROOT)),'launcherSourceSha256':sha((old/'launch.py').read_bytes()),'launcherDelta':'collect only; new exclusive LOCAL diagnosis namespace; reader/writer/protocol unchanged','metadata':'canonical meta/require/directory and no-follow FD checks; regular leaves never opened; new thin projection only','noRemoteWriter':True,'noRunPrivilegedChange':True,'captureSha256':files['capture.source']['sha256'],'writerSha256':files['privileged_output.source']['sha256']},indent=2)+'\n')
print(json.dumps({'manifestSha256':sha(raw),'launcherSha256':sha((P/'launch.py').read_bytes()),'sources':len(files),'commandSha256':sha(text.encode())}))
