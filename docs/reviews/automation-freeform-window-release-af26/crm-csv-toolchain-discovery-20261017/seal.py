"""Review indexes only. No materialization, remote call or operational generation."""
import hashlib,json,os,re
from pathlib import Path
P=Path(__file__).resolve().parent
ROOT=next(p for p in P.parents if (p/'.git').exists())
sha=lambda b:hashlib.sha256(b).hexdigest()
files={}
for name,path in [(n,P/n)for n in ('launch.py','driver.py','runner.py','capture.source')]+[(n,P.parent/'crm-csv-r2-directed-20261017'/n)for n in ('read_package.py','privileged_output.source')]:
    raw=path.read_bytes()
    files[name]={'source':str(path.relative_to(ROOT)),'relativeSource':os.path.relpath(path,P),'bytes':len(raw),'sha256':sha(raw),'bootstrap':True}
manifest={'base':'6e93e40902cde2f5cb43bf210a8dc2389c75411e','scope':'discovery only; no operational toolchain certification','files':files}
raw=(json.dumps(manifest,sort_keys=True,indent=2)+'\n').encode()
(P/'MANIFEST.json').write_bytes(raw)
old=P.parent/'crm-csv-three-gaps-executable-20261017'
blocks=re.findall(r'```bash\n(.*?)```',(old/'COMMANDS.md').read_text(),re.S)[:2]
body='''# Node/PM2 — comandos concretos SOMENTE PARA REVISÃO

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

'''
for i,block in enumerate(blocks):
    block=block.replace(str(old),str(P))
    block=block.replace('5922f70646b6e20969abaccad0e834742127822e812012dc75144ffb67805bc4',sha((P/'launch.py').read_bytes()))
    block=block.replace('3b3990e8fdfa5087064745ce3e2ddd9d7e704d080e21096e6b30d9e44a0439ba',sha(raw))
    if i:body+='\n## 2. Transferência única, descoberta e custódia (aprovação futura separada)\n\n'
    body+='```bash\n'+block+'```\n'
body+='''
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
'''
(P/'COMMANDS.md').write_text(body)
print(json.dumps({'manifestSha256':sha(raw),'launcherSha256':sha((P/'launch.py').read_bytes()),'files':len(files)}))
