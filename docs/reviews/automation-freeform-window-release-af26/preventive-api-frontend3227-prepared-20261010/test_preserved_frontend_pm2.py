import importlib.util,json,os,subprocess,tempfile,shutil,time,sys
from pathlib import Path
D=Path(__file__).resolve().parent;sys.path.insert(0,str(D));from preserved_frontend_environment import capture
O=Path(sys.argv[1]).resolve();sys.path.insert(0,str(O));s=importlib.util.spec_from_file_location('ops',O/'ops.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
L=Path(tempfile.mkdtemp(prefix='re7-env-'));L.chmod(0o700);node=L/'node';shutil.copy2(sys.argv[2],node);cli=sys.argv[3];assert json.load(open(Path(cli).parent.parent/'package.json'))['version']=='6.0.14'
env={**os.environ,'PM2_HOME':str(L/'pm2-home'),'PATH':str(L)+':/usr/bin:/bin'}
def run(args):
 r=subprocess.run([str(node),cli,*args],env=env,text=True,capture_output=True,timeout=20);(L/'commands.private.jsonl').open('a').write(json.dumps({'args':args,'stdout':r.stdout,'stderr':r.stderr,'exit':r.returncode})+'\n');assert r.returncode==0;return r.stdout
app=L/'launcher.cjs';app.write_text('setInterval(()=>{},1000);\n');cfg=L/'ecosystem.config.cjs';cfg.write_text('module.exports='+json.dumps({'apps':[{'name':'synthetic-front','cwd':str(L),'script':str(app),'interpreter':str(node),'watch':False,'autorestart':False,'exec_mode':'cluster','instances':1,'env':{'LAB_INJECTED':'synthetic'}}]})+';\n')
try:
 run(['start',str(cfg)]);rows=json.loads(run(['jlist']));assert len(rows)==1;r=rows[0];snap=capture(r);expected={'cwd':str(L),'script':str(app),'interpreter':str(node),'env':snap};m.System().check_config(r,expected)
 try:m.System().check_config(r,{**expected,'env':{'LAB_INJECTED':'synthetic'}})
 except RuntimeError as e:assert str(e)=='environment_drift'
 else:raise AssertionError('PM2 projection must not certify initial OS env')
 print(json.dumps({'result':'PASS','node':'20.20.0','pm2':'6.0.14','effects':'real isolated daemon/process and unchanged V4 System.check_config','positive':'initial OS env with PM2 envelope','negative':'PM2 JS projection','providerCalls':0}))
finally:run(['kill'])
