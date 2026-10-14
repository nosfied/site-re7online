import copy,unittest
from locked_plan import scope_check
class Scope(unittest.TestCase):
 def setUp(self):
  self.old={'rows':[{'id':'web','channelAccountId':'a','secretKind':'baileysAuthState.v1','secretHash':'old','secretCiphertext':'old','status':'configured','createdAt':'then','updatedAt':'then'},{'id':'opaque','channelAccountId':'t','secretKind':'telegramBotToken','secretHash':'opaque','secretCiphertext':'opaque','status':'configured','createdAt':'then','updatedAt':'then'}], 'accounts':[{'id':'a','clientId':'tenant','provider':'web_session','metadata':{'webSession':{'reconnectCount':0,'desiredState':'CONNECTED'}},'outboundEnabled':False,'updatedAt':'then'},{'id':'t','clientId':'tenant','provider':'telegram','metadata':{},'updatedAt':'then'}],'mfa':0,'webhook':0,'opaqueId':'opaque'}
 def test_explicit_source_renewal_only(self):
  new=copy.deepcopy(self.old);new['rows'][0].update(secretHash='new',secretCiphertext='new',updatedAt='now');new['accounts'][0]['metadata']['webSession']['reconnectCount']=1
  self.assertTrue(scope_check(self.old,new))
 def test_controls_and_complete_population(self):
  def secret_kind(v):v['rows'][0]['secretKind']='different'
  def flag(v):v['accounts'][0]['outboundEnabled']=True
  def control(v):v['accounts'][0]['metadata']['webSession']['desiredState']='DISCONNECTED'
  def tenant(v):v['accounts'][0]['clientId']='other'
  def opaque(v):v['rows'][1]['secretCiphertext']='changed'
  def duplicate(v):v['accounts'].append(copy.deepcopy(v['accounts'][0]))
  def extra_field(v):v['rows'][0]['unreviewed']='new'
  def family(v):v['mfa']=1
  for change in (secret_kind,flag,control,tenant,opaque,duplicate,extra_field,family):
   v=copy.deepcopy(self.old);change(v)
   with self.subTest(change=change.__name__),self.assertRaises(RuntimeError):scope_check(self.old,v)
if __name__=='__main__':unittest.main()
