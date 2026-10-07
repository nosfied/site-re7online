"""Compare exact extracted packages on one origin, route, session and viewport.
Run in UID/PID/network namespace (loopback only). No backend/provider.
Usage: python3 compare_packages.py NODE20 PACKAGE9F PACKAGE_CANDIDATE OUTPUT PASS|FAIL
OUTPUT must be new. Browser/API fixtures are in tests/browser/frontendAssetLayoutAudit.mjs.
"""
import os, signal, subprocess, sys, time, urllib.request
from pathlib import Path
node, baseline, candidate, folder, expected=sys.argv[1:6]
node=str(Path(node).resolve());baseline=Path(baseline).resolve();candidate=Path(candidate).resolve();out=Path(folder).resolve()
assert expected in ['PASS','FAIL'] and not out.exists();out.mkdir(mode=0o700)
assert subprocess.check_output([node,'--version'],text=True).strip()=='v20.20.0'
env={'PATH':'/usr/bin:/bin','HOME':str(out),'NODE_ENV':'production','NEXT_TELEMETRY_DISABLED':'1','LANG':'C.UTF-8'};children=[]
def start(args,cwd,name):
 p=subprocess.Popen(args,cwd=cwd,env=env,stdout=(out/(name+'.private.log')).open('w'),stderr=subprocess.STDOUT,start_new_session=True);children.append(p)
def ready(port):
 end=time.monotonic()+25
 while time.monotonic()<end:
  try:
   with urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/app/login',timeout=1) as response:
    if response.status==200:return
  except OSError:pass
  time.sleep(.1)
 raise RuntimeError('isolated_readiness_failed')
proxy=out/'proxy.cjs';proxy.write_text("""const http=require('node:http');let selected='9f';const ports={'9f':3084,candidate:3085};
http.createServer((req,res)=>{if(req.url.startsWith('/__lab/version/')){const v=req.url.split('/').at(-1);if(!ports[v]){res.writeHead(400);return res.end();}selected=v;return res.end('selected');}const upstream=http.request({hostname:'127.0.0.1',port:ports[selected],path:req.url,method:req.method,headers:{...req.headers,'x-forwarded-host':req.headers.host,'x-forwarded-proto':'http'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);}).listen(3086,'127.0.0.1');""")
try:
 for label,port,package in [('9f',3084,baseline),('candidate',3085,candidate)]:
  start([node,str(package/'node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',str(port)],package,label);ready(port)
 start([node,str(proxy)],out,'proxy');ready(3086)
 result=subprocess.run([node,'tests/browser/frontendAssetLayoutAudit.mjs','http://127.0.0.1:3086'],env={**env,'AUDIT_VERSIONS':'9f,candidate','AUDIT_EXPECT_FAIL':'1' if expected=='FAIL' else '0','ASSET_AUDIT_DIR':str(out/'browser')},timeout=75,stdout=(out/'browser.private.log').open('w'),stderr=subprocess.STDOUT)
 assert result.returncode==0,'browser_exit:'+str(result.returncode)
 print('BASELINE_PASS_CANDIDATE_'+expected)
finally:
 for p in reversed(children):
  if p.poll() is None:os.killpg(p.pid,signal.SIGTERM)
 for p in children:
  try:p.wait(timeout=4)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
