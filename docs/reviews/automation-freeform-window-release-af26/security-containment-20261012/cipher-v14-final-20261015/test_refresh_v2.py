import sys
from pathlib import Path
import refresh_v2
sys.modules['refresh_proofs']=refresh_v2
source=Path(__file__).resolve().parent.parent/'cipher-controls-prisma-20261015/test_refresh.py'
s=source.read_text().replace('C,real_sha(C),q)','C,real_sha(C),q,P)')
exec(compile(s,str(source),'exec'),{'__file__':str(source),'__name__':'__main__'})
