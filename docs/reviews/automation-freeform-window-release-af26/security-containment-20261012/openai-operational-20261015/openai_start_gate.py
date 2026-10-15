"""Every real Operations.start uses this same boundary; no key fallback defaults."""
from pathlib import Path
from openai_contract import selected,check,require

def authorize_start(mode_directory):
 d=Path(mode_directory);check(d.parent,live=True);s=selected(d.parent)
 require((d.name=='return-before-commit'and not s)or(d.name in ('switch','return','return-partial')and s),'openai_start_epoch_forbidden')
