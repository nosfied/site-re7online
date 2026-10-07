"""Laboratory PID1: reap orphaned children like host init; never kill survivors."""
import os,sys
pid=os.fork()
if pid==0:os.execvp(sys.argv[1],sys.argv[1:])
while True:
 child,status=os.waitpid(-1,0)
 if child==pid:raise SystemExit(os.waitstatus_to_exitcode(status))
