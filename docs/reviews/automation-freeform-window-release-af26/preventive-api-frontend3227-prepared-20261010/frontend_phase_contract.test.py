import copy, unittest
from frontend_phase_contract import validate
class Phase(unittest.TestCase):
 def test_boundary_and_negatives(self):
  names=['re7-whatsapp-agent','re7-whatsapp-web-worker','re7-admin-front'];expected={n:{'cwd':'/synthetic/'+n,'script':'/synthetic/'+n+'/entry'}for n in names}
  before={'guard':{'open':False,'generation':38,'tasks':{}},'runtime':[{'name':n,'pid':i+1,'startTicks':str(i+1)}for i,n in enumerate(names)],'daemon':{'pid':9,'ticks':'9','state':'S'}}
  for k in ['bootId','activeControl','activeRun','activeChild','activeManifestSha256','backupCronSha256','crontab','boot']:before[k]='synthetic'
  after=copy.deepcopy(before);after['daemon']['state']='R';starts={}
  for i,n in enumerate(names):
   r=after['runtime'][i];r['pm2_env']={'pm_cwd':expected[n]['cwd'],'pm_exec_path':expected[n]['script']}
   if i<2:r['pid']=i+11;r['startTicks']=str(i+11);starts[n]={'pid':r['pid'],'identity':{'state':'S','ticks':r['startTicks']}}
  after['saved']=[{'name':n,'pm_cwd':expected[n]['cwd'],'pm_exec_path':expected[n]['script']}for n in names];after['fallback']=copy.deepcopy(after['saved'])
  completed={'event':'complete','mode':'switch','guardGeneration':38};matches={n:True for n in names}
  self.assertTrue(validate(before,after,completed,starts,expected,matches))
  for edit in [lambda a:a['guard'].update(open=True),lambda a:a.update(bootId='other'),lambda a:a['runtime'][2].update(pid=99),lambda a:a['runtime'][0].update(startTicks='other'),lambda a:a['saved'][0].update(pm_cwd='other'),lambda a:a['runtime'].pop()]:
   a=copy.deepcopy(after);edit(a)
   with self.assertRaises(RuntimeError):validate(before,a,completed,starts,expected,matches)
  with self.assertRaises(RuntimeError):validate(before,after,{**completed,'mode':'return'},starts,expected,matches)
  with self.assertRaises(RuntimeError):validate(before,after,completed,starts,expected,{**matches,names[0]:False})
if __name__=='__main__':unittest.main()
