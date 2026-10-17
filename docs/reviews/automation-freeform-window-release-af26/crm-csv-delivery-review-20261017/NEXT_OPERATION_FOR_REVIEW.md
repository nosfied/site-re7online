# Próximo ato operacional CSV — SOMENTE PARA REVISÃO

**NÃO EXECUTADO / NÃO AUTORIZADO por esta preparação local.** Não é A/B nem
retomada de ELF. Comando LOCAL no ThinkPad, futuro SSH único como deploy **SEM
sudo**, leitura dos pais do literal Event. Não consulta SQL, PM2, perfil, segredo,
ELF ou serviço; não cria arquivos remotos. Bibliotecas de diagnóstico/custódia já
aceitas; o mesmo corpo event_parents é autenticado pelo digest fixo208f2ef5… antes
de compilar. Não executa nenhuma geração/intenção consumida ou entrypoint de fase.

## Por que este é o primeiro ato

O último registro17/10 preservou cinco pais0775. Isso negaria a ida em
prestop_contract.event_parents → validate_pre_stop → check_current/csv_cli antes
de contenção/parada. É histórico, não estado atual. Não se pode dispensar o
predicado, usar ORIGINAL como mecanismo de deploy, mudar input ou executar chmod
sem revisão. Esta leitura confirma só a fronteira impeditiva específica; se DENY,
encerrar e decidir a remediação restrita separadamente. Mesmo PASS não admite gates
nem certifica os bindings e demais controles. Não provoca continuação automática.

## Destino e preservação

Novo destino LOCAL exclusivo no parent privado legítimo owner700:
`csv-delivery-event-boundary-20261017-v1`. O código contém o caminho completo do
owner. A pasta terá canais byte-exatos e journal/recibo canônicos600. Existência,
symlink, erro, timeout ou resposta perdida: sem retry/reconexão/limpeza/reparo.
A resposta privada inclui metadados e UTC de cada pai realmente alcançado; DENY
pode parar no primeiro pai inadequado e nunca vira certificação de todos os pais.
Não publicar esses canais/journals. Sair com1 mantém a tentativa consumida.

## Bloco literal para futura aprovação

Nenhuma credencial deve ser colada no chat. O acesso SSH existente precisa estar
funcional; BatchMode=yes e StrictHostKeyChecking=yes, prazo25s; sem instalação ou
fallback. O arquivo local e os três auxiliares são conferidos por SHA; compilam-se
os MESMOS bytes lidos. O digest externo do predicado não é escolhido pelo pacote.

```bash
(
set -euo pipefail
umask 077
python3 -B -I -S - <<'REVIEWED_CSV_BOUNDARY'
import hashlib,os,stat,sys
from pathlib import Path
p=Path('/home/deifson-oliveira/DEIFSON/re7online-site/re7online-site/tmp/worktrees/re7-campaign-recovery-20260926/scripts/crm_csv_delivery/read_boundary.py')
for parent in (p,*p.parents):assert not parent.is_symlink(),'reviewed_source_symlink'
s=p.lstat();assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size<65536,'reviewed_source_type_size'
fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
def meta(s):return tuple(getattr(s,'st_'+n) for n in ('dev','ino','mode','uid','gid','nlink','size','mtime_ns','ctime_ns'))
try:
 assert meta(os.fstat(fd))==meta(s),'reviewed_source_replaced'
 raw=os.read(fd,65536)
 assert meta(os.fstat(fd))==meta(s) and meta(p.lstat())==meta(s),'reviewed_source_changed'
finally:os.close(fd)
assert hashlib.sha256(raw).hexdigest()=='f52cb151da109fcf1951882adc0273112c17fbc736576816d741c00ff884b306','reviewed_csv_boundary_digest'
ns={'__name__':'reviewed_csv_boundary','__file__':str(p)}
exec(compile(raw,str(p),'exec'),ns)
sys.exit(ns['execute']())
REVIEWED_CSV_BOUNDARY
)
```

Saída pública mínima: CSV_EVENT_BOUNDARY_PASS_ONLY ou
CSV_EVENT_BOUNDARY_DENY_NO_RETRY e indicação de custódia, sem metadados brutos.
Sucesso do transporte/custódia não equivale a aprovação de Event, de pré-parada
completa, do runtime ou de uma janela. O script não altera permissões.

## Sequência única depois da decisão deste ato

1. Revisar/autorizar só o bloco acima. DENY suspende avanço. Se o impedimento0775
   persistir, definir/revisar correção seletiva com metadados atuais e decisão do
   owner; a correção **não** está incluída no bloco ou nesta entrega.
2. Usar o fluxo CSV existente para a captura privada dirigida e o binding novo:
   trio/config/saved/fallback, ambos crons/supervisão, fonte Event/consumidores,
   SELECTs CSV/identidade de canal e ownership. Aplicar o adaptador frontend aceito,
   sem reabri-lo. capture_imports.capture pós-saída NÃO é leitor livre. Nenhum
   dado observado em16/17 se torna fresco por compor índices.
3. Materializar os16 vínculos e perfis/contratos/manifests com esses dados em novo
   namespace; renderizar JSON/CJS e checkers canônicos dos quatro modos. Reusar
   arquivos/runtimes staged sem extrair/transmitir outra vez. Compor política sobre
   predecessore2a5 e CAS, preservando bibliotecas/autoridade e instalação exclusiva
   já aceitas. Instalação estática, instalação de fase e emissão de recuperação são
   atos separados, não comandos autorizados nesta página. Sem permit na ida/PRESTOP.
4. Coordenar janela/owner/impacto humano. Somente então R0 backup.lock +custódia
   original, verificar restore retido/fronteira e renovar provas vencidas; root por
   último. Publicar pacote completo/hash e roteiro A/admissão/B/C/D da nova geração
   para autorização expressa. Dados ausentes/deriva negam; nada de A/B antigos.
5. Só com autorização futura: instalar/admitir/conter; saída/ownership e classificação
   de importações, CAS Event/seleção, API→worker uma vez. Incerteza: C+decisão explícita,
   sem replay. Após API aceita, vínculos reais da fronteira frontend e novo hash para
   decisão, frontend candidato e retorno compatível; encerrar com controles e UI.

O backend original só pode recuperar STOPPED_UNSELECTED comprovado por R1/R2 e
certificado integral da guarda38, antes de overlay/seleção/possível código candidato.
Após seleção comprovada, retorno mantém API24e5857f/ledger/GET/UUID; defeito persistente
exige outra API compatível. Não há autorização para importação real ou reparo histórico.

CSV SUSPENSO PARA EXECUÇÃO / NOT DEPLOYED / NOT WINDOW READY.
