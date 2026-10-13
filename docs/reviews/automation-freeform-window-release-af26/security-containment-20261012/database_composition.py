"""Extend deploy-owned canonical sequencer for one explicitly sealed pre-commit return.
Root helper/policy format/sudoers unchanged. Existing source bytes are preserved.
"""
def patch_sequencer(source):
 replacements={
 "{'switch', 'return', 'return-partial'}":"{'switch', 'return', 'return-partial', 'return-before-commit'}",
 "'return' if mode == 'return-partial' else mode":"'return' if mode in {'return-partial','return-before-commit'} else mode",
 }
 for before,after in replacements.items():
  if source.count(before)!=2:raise RuntimeError('canonical_database_patch_source_drift')
  source=source.replace(before,after)
 return source

def patch_ecosystem(source):
 before="MODES = ('switch', 'return', 'return-partial')"
 if source.count(before)!=1:raise RuntimeError('canonical_database_ecosystem_source_drift')
 return source.replace(before,"MODES = ('switch', 'return', 'return-partial', 'return-before-commit')")
