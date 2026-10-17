"""Only new procedure fragments. No corrected reader, SQL connection or PM2 CLI."""
import ast
import copy
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import tarfile
import tempfile
import unittest

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('contracts',HERE/'contracts.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
PM=Path('/tmp/re7-b4-toolchain-20261016/node_modules')
ARCHIVE=Path('/home/deifson-oliveira/DEIFSON/re7-private-retention-custody/crm-csv-staging-20261016/final-preparation-20261016T105404Z/original-recovery-complete-evidence.private.tar')
ARCHIVE_SHA='32e0cb1de5dac716027fc8face5cc60f8b996ec0ca9de6b18363cbbb84b30076'
CLOSURE={}


class Config(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='re7-three-gap-config-');self.root=Path(self.tmp.name)
        self.before={'name':'re7-admin-front','pm_cwd':'/opt/synthetic-front','pm_exec_path':'/opt/synthetic-launcher.cjs',
          'exec_interpreter':'/usr/bin/node','args':[],'node_args':[],'namespace':'default','exec_mode':'fork_mode',
          'watch':False,'autorestart':True,'stop_exit_codes':0,'env':{'CONFIG_KEY':'SYNTHETIC_VALUE'},'axm_monitor':{'heap':1}}
        p=self.root/'123';p.mkdir();(p/'cwd').symlink_to(self.before['pm_cwd']);(p/'exe').symlink_to(self.before['exec_interpreter'])
        (p/'environ').write_text('CONFIG_KEY=SYNTHETIC_VALUE\0');(p/'stat').write_text('123 (lab) S 1 '+'0 '*17+'12345\n')
        root=self.root
        class MappedPath:
            def __new__(cls,*args):
                p=Path(*args)
                return root.joinpath(*p.parts[2:])if p.parts[:2]==('/','proc')else p
        System,Operations=c.config_consumers(MappedPath);self.system=System();self.operations=Operations();self.operations.d=self.system
        self.live={'pid':123,'pm2_env':{**copy.deepcopy(self.before),'status':'online','restart_time':0}}
    def tearDown(self):self.tmp.cleanup()
    def test_canonical_methods_and_saved_comparison(self):
        c.compare_frontend(self.live,self.before,self.operations)
        current=copy.deepcopy(self.before);current['axm_monitor']={'heap':99}
        self.assertEqual(c.compare_saved(current,self.before)['onlyDynamicDifference'],['axm_monitor'])
    def test_every_required_live_field_missing_or_drift_denies(self):
        for field in c.LIVE_FIELDS:
            for missing in (True,False):
                row=copy.deepcopy(self.live)
                if missing:del row['pm2_env'][field]
                else:row['pm2_env'][field]='changed'
                with self.subTest(field=field,missing=missing),self.assertRaises(RuntimeError):c.compare_frontend(row,self.before,self.operations)
    def test_environment_proc_executable_and_status_remain_mandatory(self):
        for change in ('environment','executable','status','watch','identity'):
            self.setUpState=copy.deepcopy(self.live)
            if change=='environment':(self.root/'123/environ').write_text('CONFIG_KEY=WRONG\0')
            if change=='executable':(self.root/'123/exe').unlink();(self.root/'123/exe').symlink_to('/usr/bin/other')
            if change=='status':self.live['pm2_env']['status']='stopped'
            if change=='watch':self.live['pm2_env']['watch']=True
            if change=='identity':(self.root/'123/stat').unlink()
            with self.subTest(change=change),self.assertRaises(RuntimeError):c.compare_frontend(self.live,self.before,self.operations)
            self.live=self.setUpState;(self.root/'123/environ').write_text('CONFIG_KEY=SYNTHETIC_VALUE\0')
            if change=='executable':(self.root/'123/exe').unlink();(self.root/'123/exe').symlink_to('/usr/bin/node')
    def test_saved_environment_or_contract_field_change_denies(self):
        for field in ('env','pm_exec_path','restart_time','missing'):
            before=copy.deepcopy(self.before);before['restart_time']=0;current=copy.deepcopy(before)
            if field=='missing':del current['args']
            elif field=='env':current['env']['CONFIG_KEY']='WRONG'
            else:current[field]='WRONG'
            with self.subTest(field=field),self.assertRaises(RuntimeError):c.compare_saved(current,before)
    def test_real_historical_dump_provenance_session_profile_not_equivalent(self):
        self.assertEqual(hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),ARCHIVE_SHA)
        with tarfile.open(ARCHIVE)as t:
            raw=t.extractfile('window/saved-dump.pm2.private.json').read()
            self.assertEqual(hashlib.sha256(raw).hexdigest(),'c9c54c02b9694328a5aeaa4335efb88135f9bd948b4f786c8e9e4e851efd51e3')
            dump=json.loads(raw);profile=json.load(t.extractfile('window/source.profile.private.json'))
        before=next(x for x in dump if x['name']=='re7-admin-front');wrong=next(x for x in profile['apps']if x['name']=='re7-admin-front')
        self.assertNotEqual(before['env'],wrong['env']);self.assertEqual(c.frontend_expected(before)['env'],before['env'])
        self.assertEqual(c.compare_saved(copy.deepcopy(before),before)['onlyDynamicDifference'],[])


class RPC(unittest.TestCase):
    def query(self,kind,module_base=PM):
        # Real PM2-axon codecs over a real local Unix FD; synthetic RPC method.
        server_code=r"""
const net=require('net'),base=process.argv[1],kind=process.argv[2];
const Rep=require(base+'/pm2-axon/lib/sockets/rep.js');
const Server=require(base+'/pm2-axon-rpc/lib/server.js');
const sock=new net.Socket({fd:Number(process.argv[3]),readable:true,writable:true});
const rep=new Rep();rep.addSocket(sock);let calls=0;
new Server(rep).expose('getMonitorData',(opts,cb)=>{
 if(++calls!==1)throw Error('replay');
 if(kind==='lost'){sock.destroy();return;}
 if(kind==='timeout')return;
 cb(null,kind==='invalid'?{invalid:true}:[{name:'synthetic-front',pid:123,pm2_env:{status:'online'}}]);
});
sock.on('close',()=>{process.stderr.write('CALLS='+calls+'\n');process.exit(0);});
"""
        with tempfile.TemporaryDirectory(prefix='re7-rpc-lab-')as td:
            td=Path(td);hook=td/'trace.cjs';index=td/'closure.json'
            hook.write_text("process.on('exit',()=>require('fs').writeFileSync("+json.dumps(str(index))+",JSON.stringify(Object.keys(require.cache))));")
            a,b=socket.socketpair();server=subprocess.Popen(['node','-e',server_code,str(PM),kind,str(a.fileno())],pass_fds=(a.fileno(),),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            a.close()
            try:
                result=subprocess.run(['node','-r',str(hook),str(HERE/'pm2_rpc_fd.cjs'),str(module_base),str(b.fileno())],pass_fds=(b.fileno(),),capture_output=True,timeout=10);b.close()
                out,err=server.communicate(timeout=3);self.assertEqual(server.returncode,0,err.decode());self.assertIn(b'CALLS=1',err)
                paths=json.loads(index.read_text())
                for p in paths:
                    p=Path(p)
                    if p.is_relative_to(module_base):CLOSURE[str(p.relative_to(module_base))]=hashlib.sha256(p.read_bytes()).hexdigest()
                self.assertFalse(any('/pm2/lib/Client.js'in p or '/pm2/lib/API.js'in p for p in paths))
                return result
            finally:
                b.close()
                if server.poll()is None:server.terminate();server.wait(timeout=3)
    def test_closed_pinned_diagnostic_snapshot(self):
        import shutil
        with tempfile.TemporaryDirectory(prefix='re7-rpc-pinned-snapshot-')as t:
            root=Path(t)/'rpc/node_modules';root.mkdir(parents=True)
            pins=(HERE/'RPC_CLOSURE.sha256').read_text().splitlines()
            for line in pins:
                digest,name=line.split('  ',1);source=PM/name
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),digest)
                target=root/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(source.read_bytes())
            self.assertEqual(len([p for p in root.rglob('*')if p.is_file()]),26)
            result=self.query('valid',root)
            self.assertEqual(result.returncode,0,result.stderr.decode())
            self.assertEqual(json.loads(result.stdout)[0]['name'],'synthetic-front')
    def test_real_codec_valid_reply(self):
        r=self.query('valid');self.assertEqual(r.returncode,0,r.stderr.decode());self.assertEqual(json.loads(r.stdout)[0]['name'],'synthetic-front')
    def test_lost_reply_no_replay(self):
        r=self.query('lost');self.assertNotEqual(r.returncode,0);self.assertEqual(r.stdout,b'')
    def test_invalid_reply_denies(self):
        r=self.query('invalid');self.assertNotEqual(r.returncode,0);self.assertEqual(r.stdout,b'')
    def test_timeout_denies_without_replay(self):
        r=self.query('timeout');self.assertNotEqual(r.returncode,0);self.assertEqual(r.stdout,b'')


class Peer(unittest.TestCase):
    def test_real_so_peercred_and_divergence_before_request(self):
        System,_=c.config_consumers();system=System();pid=os.getpid();ticks=system.identity(pid)['ticks']
        a,b=socket.socketpair()
        try:
            self.assertEqual(c.verify_peer(a,system,pid,ticks,os.getuid())['pid'],pid)
            for expected_pid,expected_ticks,expected_uid in ((pid+1,ticks,os.getuid()),(pid,'0',os.getuid()),(pid,ticks,os.getuid()+1)):
                with self.assertRaises(RuntimeError):c.verify_peer(a,system,expected_pid,expected_ticks,expected_uid)
            a.setblocking(False)
            with self.assertRaises(BlockingIOError):a.recv(1)
        finally:a.close();b.close()


class Route(unittest.TestCase):
    def test_canonical_db_container_on_recorded_transport_shape(self):
        System,_=c.config_consumers();system=System()
        row={'Id':'SYNTHETIC_ID','State':{'Running':True},'NetworkSettings':{
         'Networks':{'one':{'IPAddress':'172.18.0.2','GlobalIPv6Address':''}},
         'Ports':{'5432/tcp':[{'HostIp':'127.0.0.1','HostPort':'5432'}]}}}
        def supply(args):
            self.assertEqual(args,['docker','inspect','wa-agent-postgres'])
            return json.dumps([row])
        system.run=supply
        self.assertEqual(system.db_container()['published'],['127.0.0.1',5432])
        row['State']['Running']=False
        with self.assertRaisesRegex(RuntimeError,'db_container_drift'):system.db_container()
        row['State']['Running']=True;row['NetworkSettings']['Networks']['two']=row['NetworkSettings']['Networks']['one']
        with self.assertRaisesRegex(RuntimeError,'db_network_ambiguous'):system.db_container()


class SQL(unittest.TestCase):
    def test_canonical_sql_bytes_and_read_only_statements(self):
        import_source=ast.parse((c.REVIEW/'crm-csv-operational-20261016/capture_imports.py').read_text())
        value=next(ast.literal_eval(n.value)for n in import_source.body if isinstance(n,ast.Assign)and any(isinstance(x,ast.Name)and x.id=='SQL'for x in n.targets))
        self.assertEqual((HERE/'imports.sql').read_text(),value)
        for name in ('imports.sql','identity.sql','ownership.sql'):
            sql=(HERE/name).read_text().upper();self.assertTrue(sql.startswith('BEGIN READ ONLY;'));self.assertIn('ROLLBACK;',sql)
            for forbidden in ('INSERT ','UPDATE ','DELETE ','ALTER ','CREATE ','DROP ','COPY ','PG_ADVISORY_LOCK','EXPLAIN ANALYZE'):
                self.assertNotIn(forbidden,sql)
        self.assertIn('LIMIT 100001',value)


if __name__=='__main__':
    result=unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromModule(__import__(__name__)))
    if result.wasSuccessful():
        if len(os.sys.argv)>1:
            Path(os.sys.argv[1]).write_text(json.dumps(CLOSURE,indent=2)+'\n')
        print(json.dumps({'result':'PROCEDURE_FRAGMENTS_LOCAL_VALIDATED','tests':result.testsRun,'rpcFilesLoaded':len(CLOSURE),'newSqlConnections':0,'pm2CliOrDaemonStarted':False,'remoteExecuted':False}))
    raise SystemExit(not result.wasSuccessful())
