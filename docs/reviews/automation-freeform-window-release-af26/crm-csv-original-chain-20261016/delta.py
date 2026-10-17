"""Only future delegated FD transport correction; no gate or authority change."""
def apply(code,origins):
 for name in ('switch','return','return-partial','return-before-commit'):
  path=name+'/delegated.py';text=code[path].decode()
  before="    def run(self, args, text=None):\n        ops.require(args[0] != 'sudo', 'executor_must_not_use_sudo')\n        return super().run(args, text)"
  after="    def run(self, args, text=None, *, pass_fds=()):\n        ops.require(args[0] != 'sudo', 'executor_must_not_use_sudo')\n        return super().run(args, text, pass_fds=pass_fds)"
  if text.count(before)!=1:raise RuntimeError('delegated_FD_interface_anchor')
  code[path]=text.replace(before,after).encode();origins[path]['stages'].append('DELEGATED_SEALED_FD_FORWARDING')
