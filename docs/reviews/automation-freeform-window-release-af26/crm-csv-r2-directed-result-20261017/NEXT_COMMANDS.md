# Próximos comandos mínimos — PARA REVISÃO, NÃO EXECUTADOS/NÃO AUTORIZADOS

Este arquivo não corrige nem repete o reader consumido. É uma proposta limitada de
diagnóstico dos dois elos sem representação persistida ; os seeds PM2 já foram reutilizados localmente por hash.
Não produz certificado R2, perfil, binding, pin, permit ou aceitação de janela.
Os comandos foram conferidos estaticamente (bash-n/Python compile), não ensaiados
nem executados remotamente. Não equivalem a um novo pacote operacional certificado.

## Por que estes alvos

- Frontend:process_script_unconfirmed deixou sem linha persistida a configuração,
  imagem e representação de cmdline; ler só esses dados com PID/ticks exigidos por
  process/interval_checks. Não declarar causa histórica ou aceitar outro perfil.
- Proxy:proxy_argv_shape deixou sem argv persistido; ler apenas cmdline/identidade.
  O histórico tem12 argumentos e flag unitária -use-listen-fd; isso mostra a lacuna
  do predicado frente ao histórico, mas não reconstrói o argv atual.
- R4:CLI56B e package.json4.532B coincidem com os membros do tarball público B3
  a309112e… já disponível e conferido localmente. Não reler esses seeds na VPS.
  Também não repetir imagem Node, API/worker, supervisão, ps ou ss.

Somente futuras leituras deploy SEM sudo. Destinos inéditos diagnosticados abaixo;
não podem existir. Fonte reutilizada é o reader66f337fb… e writer93a11451… dos
arquivos inativos existentes, autenticados antes de carregar **apenas funções de
leitura/custódia**, com __name__ não-main. Não chama os entrypoints collect/export anteriores,
nem modifica sua geração. O exportador novo chama a função export(target) somente
no destino novo. private_record é o escritor canônico; não há outro journal writer.

Boot/ticks/hash de fontes divergentes, desaparecimento, acesso negado ou limite:
DENY sem retry, novos PIDs, reparo ou escalada. O digest de boot é comparação com
uma observação já preservada, não autoridade de instalação. Se vencido por mudança
de boot/identidade, requer revisão expressa; não adaptar as constantes para PASS.

## 1 — VPS/deploy, uma vez SOMENTE após aprovação futura

```bash
(
set -euo pipefail
umask 077
R=/dev/shm/re7-csv-r2-directed-tools-20261017-v1
python3 -B -I -S - "$R" <<'R2_GAP_READ'
import hashlib,os,stat,sys
from pathlib import Path
p=Path(sys.argv[1]);d=p.lstat()
assert stat.S_ISDIR(d.st_mode) and not p.is_symlink() and d.st_uid==os.getuid(),'tools_directory'
if str(p)=='/dev/shm/re7-csv-r2-directed-tools-20261017-v1':
 assert stat.S_IMODE(d.st_mode)==0o700,'private_tools_directory'
for q in p.parents:
 assert not q.is_symlink(),'tools_ancestor_symlink'
raws={}
for n,h in [('read_package.py','66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'),('privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')]:
 f=p/n;s=f.lstat()
 assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==os.getuid(),'tools_file'
 fd=os.open(f,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as stream:
  t=os.fstat(stream.fileno());assert (t.st_dev,t.st_ino)==(s.st_dev,s.st_ino),'tools_replaced'
  raw=stream.read()
 assert hashlib.sha256(raw).hexdigest()==h,'reviewed_bytes'
 raws[n]=raw
raw=raws['read_package.py']
lib={'__name__':'reviewed_readonly_library','__file__':str(p/'read_package.py')}
exec(compile(raw,str(p/'read_package.py'),'exec'),lib)

Q='/dev/shm/re7-csv-r2-gap-diagnostic-20261017-v1'
created=None
try:
    created=lib['new_directory'](Q);record=lib['writer'](p)
    record(created,lib['JOURNAL'],{'event':'R2_GAP_BEGIN','utc':lib['utc'](),'sourceReaderSha256':lib['sha'](raw),'certification':False})
    boot=lib['observe'](lib['BOOT_ID'])
    lib['require'](boot['sha256']=='f9512be026ba35cb4662d4f5ac90cc0478f8d67e68ef95eb7d9793199b8d3ce7','boot_changed_review_required')
    record(created,lib['JOURNAL'],{'event':'R2_GAP_BOOT','observation':boot})
    root=os.open('/proc',os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    try:
        for label,pid,ticks,uid in [('frontend',188897,lib['HISTORICAL_CANDIDATES']['frontend']['historicalTicks'],os.getuid()),('proxy',177517,'96580070',0)]:
            fd=os.open(str(pid),os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=root)
            try:
                before=lib['proc_identity'](lib['read_at'](fd,'stat',4096))
                lib['require'](before['pid']==pid and before['ticks']==ticks and os.fstat(fd).st_uid==uid,'candidate_identity_changed')
                command=lib['read_at'](fd,'cmdline',16384)
                if label=='proxy':lib['require'](command.split(b'\0',1)[0]==b'/usr/bin/docker-proxy','proxy_changed')
                value={'event':'R2_GAP_PROCESS','label':label,'utc':lib['utc'](),'identity':before,
                       'cmdlineBytes':len(command),'cmdlineSha256':lib['sha'](command),
                       'cmdlineBase64':lib['base64'].b64encode(command).decode()}
                if label=='frontend':
                    value['cwd']=os.readlink('cwd',dir_fd=fd)
                    value['executable']=lib['executable'](fd,{})
                    value['selectedEnvironment']=lib['selected_environment'](lib['read_at'](fd,'environ',lib['PROC_LIMIT']))
                after=lib['proc_identity'](lib['read_at'](fd,'stat',4096))
                lib['require'](all(before[k]==after[k]for k in ('pid','ppid','ticks')),'process_changed')
                record(created,lib['JOURNAL'],value)
            finally:os.close(fd)
    finally:os.close(root)
    endboot=lib['observe'](lib['BOOT_ID']);lib['require'](endboot['sha256']==boot['sha256'],'boot_changed')
    record(created,lib['JOURNAL'],{'event':'R2_GAP_END','utc':lib['utc'](),'result':'DIAGNOSTIC_READS_COMPLETE_NOT_CERTIFIED','atomicSnapshot':False})
    print('R2_GAP_RAW_RECORDED_NOT_CERTIFIED')
except Exception as e:
    if created is not None:
        lib['writer'](p)(created,lib['JOURNAL'],{'event':'R2_GAP_DENY','utc':lib['utc'](),'errorClass':type(e).__name__,'errno':getattr(e,'errno',None)})
    print('R2_GAP_DENY_PRESERVE_NO_RETRY');raise SystemExit(1)
R2_GAP_READ
)
```

## 2 — ThinkPad, preservação privada uma vez, inclusive de DENY

Não abre nova leitura de processos:SSH lê exclusivamente o journal novo.
O pai privado existente deve ser owner700; criação exclusiva de destino700/arquivos600.
O recibo afirma somente raw preservado; mesmo se DIAGNOSTIC_READS_COMPLETE existir,
a operação R2 original continua DENY. Não é substituto de validação operacional.

```bash
(
set -euo pipefail
umask 077
R=/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/docs/reviews/automation-freeform-window-release-af26/crm-csv-r2-directed-20261017
python3 -B -I -S - "$R" <<'R2_GAP_CUSTODY'
import hashlib,os,stat,sys
from pathlib import Path
p=Path(sys.argv[1]);d=p.lstat()
assert stat.S_ISDIR(d.st_mode) and not p.is_symlink() and d.st_uid==os.getuid(),'tools_directory'
if str(p)=='/dev/shm/re7-csv-r2-directed-tools-20261017-v1':
 assert stat.S_IMODE(d.st_mode)==0o700,'private_tools_directory'
for q in p.parents:
 assert not q.is_symlink(),'tools_ancestor_symlink'
raws={}
for n,h in [('read_package.py','66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'),('privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')]:
 f=p/n;s=f.lstat()
 assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==os.getuid(),'tools_file'
 fd=os.open(f,os.O_RDONLY|os.O_NOFOLLOW)
 with os.fdopen(fd,'rb') as stream:
  t=os.fstat(stream.fileno());assert (t.st_dev,t.st_ino)==(s.st_dev,s.st_ino),'tools_replaced'
  raw=stream.read()
 assert hashlib.sha256(raw).hexdigest()==h,'reviewed_bytes'
 raws[n]=raw
raw=raws['read_package.py']
lib={'__name__':'reviewed_readonly_library','__file__':str(p/'read_package.py')}
exec(compile(raw,str(p/'read_package.py'),'exec'),lib)

folder=lib['new_directory']('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/csv-r2-gap-diagnostic-20261017-v1')
record=lib['writer'](p)
args=['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','deploy@admin.re7online.com',
      '/usr/bin/python3','-B','-I','-S','-','/dev/shm/re7-csv-r2-directed-tools-20261017-v1']
remote_script="import hashlib,os,stat,sys\nfrom pathlib import Path\np=Path(sys.argv[1]);d=p.lstat()\nassert stat.S_ISDIR(d.st_mode) and not p.is_symlink() and d.st_uid==os.getuid(),'tools_directory'\nif str(p)=='/dev/shm/re7-csv-r2-directed-tools-20261017-v1':\n assert stat.S_IMODE(d.st_mode)==0o700,'private_tools_directory'\nfor q in p.parents:\n assert not q.is_symlink(),'tools_ancestor_symlink'\nraws={}\nfor n,h in [('read_package.py','66f337fbe47d69ae02902f38f6b0e474241222c90967580d9c569dce21796691'),('privileged_output.source','93a114516a19b6d0acee5d2d810f298d856efd22c6905452d81651db65e3271a')]:\n f=p/n;s=f.lstat()\n assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==os.getuid(),'tools_file'\n fd=os.open(f,os.O_RDONLY|os.O_NOFOLLOW)\n with os.fdopen(fd,'rb') as stream:\n  t=os.fstat(stream.fileno());assert (t.st_dev,t.st_ino)==(s.st_dev,s.st_ino),'tools_replaced'\n  raw=stream.read()\n assert hashlib.sha256(raw).hexdigest()==h,'reviewed_bytes'\n raws[n]=raw\nraw=raws['read_package.py']\nlib={'__name__':'reviewed_readonly_library','__file__':str(p/'read_package.py')}\nexec(compile(raw,str(p/'read_package.py'),'exec'),lib)\nprint(lib['json'].dumps(lib['export']('/dev/shm/re7-csv-r2-gap-diagnostic-20261017-v1'),sort_keys=True))\n"
code=None;out=b'';err=b'';error=None;error_number=None
try:
    reply=lib['subprocess'].run(args,input=remote_script.encode(),stdout=lib['subprocess'].PIPE,
          stderr=lib['subprocess'].PIPE,timeout=60,check=False)
    code,out,err=reply.returncode,reply.stdout,reply.stderr
except lib['subprocess'].TimeoutExpired as e:
    out,err=e.stdout or b'',e.stderr or b'';error='TimeoutExpired'
except OSError as e:error=type(e).__name__;error_number=e.errno
lib['write_artifact'](folder/'transfer.stdout.private',out);lib['write_artifact'](folder/'transfer.stderr.private',err)
record(folder,lib['JOURNAL'],{'event':'R2_GAP_TRANSPORT','utc':lib['utc'](),'argv':args,'exitCode':code,
    'errorClass':error,'errno':error_number,'stdoutBytes':len(out),'stderrBytes':len(err),
    'stdoutSha256':lib['sha'](out),'stderrSha256':lib['sha'](err)})
try:
    lib['require'](code==0 and error is None,'transfer_failed')
    frame=lib['json'].loads(out)
    lib['require'](frame['format']=='R2_DIRECTED_BYTE_EXACT_TRANSFER_V1'and frame['source']=='/dev/shm/re7-csv-r2-gap-diagnostic-20261017-v1/'+lib['JOURNAL'],'source')
    original=lib['base64'].b64decode(frame['bytesBase64'],validate=True)
    lib['require'](len(original)==frame['bytes']and lib['sha'](original)==frame['sha256'],'transfer_bytes')
    m=frame['metadata']
    lib['require'](stat.S_ISREG(m['mode'])and stat.S_IMODE(m['mode'])==0o600 and m['nlink']==1 and
                   m['uid']==frame['sourceUid']and m['size']==len(original),'source_metadata')
    lib['write_artifact'](folder/'gap-capture.private.jsonl',original)
    records=[lib['json'].loads(x)for x in original.splitlines()]
    lib['require'](records and records[0]['event']=='R2_GAP_BEGIN'and records[0]['sourceReaderSha256']==lib['sha'](raw),'source_header')
    for value in records:record(folder,lib['JOURNAL'],value)
    record(folder,'sequencer.journal.jsonl',{'event':'R2_GAP_RAW_PRESERVED_NOT_CERTIFIED','utc':lib['utc'](),
        'sourceBytes':len(original),'sourceSha256':lib['sha'](original),'operationalCertification':False,
        'originalCollectionCompleted':False,'atomicSnapshot':False})
    print('R2_GAP_RAW_PRESERVED_NOT_CERTIFIED')
except Exception as e:
    record(folder,'sequencer.journal.jsonl',{'event':'R2_GAP_CUSTODY_DENY','utc':lib['utc'](),'errorClass':type(e).__name__,'errno':getattr(e,'errno',None)})
    print('R2_GAP_CUSTODY_DENY');raise SystemExit(1)
R2_GAP_CUSTODY
)
```

## Demais requisitos: não executar agora

| Consumidor | Input reaproveitável | Falta concreta / condição para comando posterior |
|---|---|---|
| process/interval_checks e Contract/check_original | snapshots atuais daemon/API/worker, Node/cwd/script, child/listeners | frontend completo e posterior revisão do predicado; observações sequenciais atuais não substituem nova revalidação no uso |
| proxy_channel / canal R3 | canal API/worker filtrado; argv/ticks históricos | argv atual representado; não aceitar formato por suposição nem executar Docker/proxy para descobrir |
| capture_imports.SQL/classify e db_owner_set_gate | SQL READ ONLY canônico e escopo conhecido privado | aprovação de consulta, canal psql/toolchain (containerID se Docker), identidade DB/server/role e ownership; capture() pós-saída grava e não será usado como leitor |
| B4/source-index/installador e consumidores PM2 | hashes Node, CLI e package atuais; prova PM2 local válida | seeds locais byte-exatos reutilizados; closure instalada completa e proteção/instalação continuam pendentes |
| manifests/Contract/authority | fontes estáticas aprovadas, before/restore válidos e16 vínculos tipados | inputs atuais completos e autorização própria; nenhum comando de instalação/emissão é oferecido aqui |

Não há SQL/Docker CLI/PM2/CJS/app, instalação, emissão, backup, retenção ou janela
nestes comandos. Não preencher automaticamente os16 vínculos/pins/autoridade.
Depois do diagnóstico, analisar localmente e revisar o menor ajuste de representação,
sem editar a coleta consumida. Nenhum comando desta proposta foi executado.
