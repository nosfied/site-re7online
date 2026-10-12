"""Validate the exact local allowlisted overlay without extracting or starting it."""
import hashlib
import json
from pathlib import Path
import sys
import tarfile

archive, manifest = map(Path, sys.argv[1:])
v = json.loads(manifest.read_text())
assert v['node'] == '20.20.0'
assert v['baseRelease'] == 'campaign-result-truth-2ed9dccc-20261011T184000Z'
assert hashlib.sha256(archive.read_bytes()).hexdigest() == v['tarSha256'], 'tar_hash'
modules = {'campaigns/campaignEligibility', 'campaigns/campaignRecipientResultTruth',
           'http/routes', 'campaigns/campaignExecutionPresentation'}
allowed = {f'{kind}/{module}.{ext}' for module in modules
           for kind, ext in [('src', 'ts'), ('dist', 'js')]}
assert len(v['files']) == 8 and {f['path'] for f in v['files']} == allowed
with tarfile.open(archive) as t:
    members = t.getmembers()
    assert len(members) == 8
    expected = {'apps/whatsapp-agent/' + f['path']: f for f in v['files']}
    assert {m.name for m in members} == set(expected), 'inventory'
    for m in members:
        assert m.isfile() and not m.issym() and not m.islnk(), 'file_type'
        f = expected[m.name]
        raw = t.extractfile(m).read()
        assert len(raw) == f['bytes'], 'size:' + m.name
        assert hashlib.sha256(raw).hexdigest() == f['sha256'], 'hash:' + m.name
print(json.dumps({'result': 'PASS', 'files': 8, 'applicationStarted': False,
                  'scope': 'overlay only; full active base required before staging'}))
