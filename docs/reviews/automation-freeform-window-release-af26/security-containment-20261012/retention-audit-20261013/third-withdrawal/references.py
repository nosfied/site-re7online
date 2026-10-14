"""Explicit dependency edges; namespace authorization does not retain every archive."""
import json,os,re,bisect
from pathlib import Path
ABS=re.compile(r'/(?:opt/re7online|var/lib/re7|home/deploy|usr/local|etc)/[^\s\x00"\'<>;,{}\[\]()]*')
DIRECTORY_FIELDS={'cwd','pm_cwd','preparation','modeDirectory','workingDirectory','releaseDirectory','releaseRoot'}
FILE_FIELDS={'archive','archivePath','tar','tarPath','file','path','filename','backupPath','packagePath'}
class Resolver:
 def __init__(self,nodes):
  self.nodes=set(nodes);self.ordered=sorted(nodes);self.names=set(Path(n).name for n in nodes if n.endswith(('.tar.gz','.dump')));self.prefixCache={}
 def descendants(self,target):
  if target not in self.prefixCache:
   prefix=target+'/';k=bisect.bisect_left(self.ordered,prefix);z=k
   while z<len(self.ordered)and self.ordered[z].startswith(prefix):z+=1
   self.prefixCache[target]=self.ordered[k:z]
  return self.prefixCache[target]
 def is_prefix(self,target):
  prefix=target+'/';k=bisect.bisect_left(self.ordered,prefix)
  return k<len(self.ordered)and self.ordered[k].startswith(prefix)
 def read(self,path,text,link=None):return _edges(path,text,self,link)
def edges(path,text,nodes,link=None):return Resolver(nodes).read(path,text,link)
def _edges(path,text,resolver,link=None):
 nodes=resolver.nodes
 found=set();namespaces=[];unbound=[];ambiguous=[]
 def add(target,directory=False):
  target=os.path.normpath(target)
  if target in nodes:found.add(target)
  if directory:found.update(resolver.descendants(target))
 for target in ABS.findall(text):
  target=target.rstrip(':').split('*',1)[0].rstrip('/')
  if target in nodes:add(target)
  elif resolver.is_prefix(target):namespaces.append(target)
 if link:add(link,True)
 try:v=json.loads(text)
 except (ValueError,TypeError):v=None
 def walk(v):
  if isinstance(v,dict):
   for key,x in v.items():
    if isinstance(x,str):
     if key in DIRECTORY_FIELDS and x.startswith('/'):add(x,True)
     if key in FILE_FIELDS and not x.startswith(('http:','https:')):
      target=x if x.startswith('/')else str(Path(path).parent/x)
      add(target)
      if not x.startswith('/')and target not in nodes:ambiguous.append({'field':key,'value':x})
    walk(x)
  elif isinstance(v,list):
   for x in v:walk(x)
 if v is not None:walk(v)
 for line in text.splitlines():
  m=re.match(r'^[0-9a-f]{64}\s+\*?(.+)$',line)
  if m:add(str(Path(path).parent/m[1]))
 # A generic filename in a shared implementation is not a binding to every
 # historical preparation. Record it; actual caller/config/manifest bindings
 # remain explicit edges and are separately sealed in the plan.
 for name in resolver.names:
  if name in text and not any(Path(n).name==name for n in found):unbound.append(name)
 return {'targets':sorted(found),'namespaceLiterals':sorted(set(namespaces)),'genericNames':sorted(unbound),'relativeFileFields':ambiguous}
