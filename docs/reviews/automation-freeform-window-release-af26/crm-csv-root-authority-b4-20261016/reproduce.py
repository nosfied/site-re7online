"""Reproduce only B4 code composition and directed tests in disposable storage.
Optional full PM2 lab requires an explicitly supplied local toolchain. No network
or installation is performed by this reproducer. No operational entrypoint.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import compose_static
import verify_static

HERE=Path(__file__).resolve().parent


def run(toolchain=None):
    with tempfile.TemporaryDirectory(prefix='re7-b4-delivery-')as td:
        out=Path(td)/'static-kit';compose_static.write_kit(out)
        expected=HERE/'static-kit'
        actual={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest()for p in out.rglob('*')if p.is_file()}
        reference={str(p.relative_to(expected)):hashlib.sha256(p.read_bytes()).hexdigest()for p in expected.rglob('*')if p.is_file()}
        if actual!=reference:raise RuntimeError('STATIC_REPRODUCTION_BYTES_DIVERGE')
        review=hashlib.sha256((expected/'COMPOSITION.json').read_bytes()).hexdigest()
        verify_static.verify(out,review)
        try:verify_static.verify(out,review,True)
        except RuntimeError as e:
            if str(e)!='DENY_INTEGRATION_AND_OPERATIONAL_INPUTS':raise
        else:raise RuntimeError('unexpected_operational_pass')
        subprocess.run([sys.executable,'-B',str(HERE/'test_b4.py')],check=True)
        if toolchain:
            import lab_pm2
            result=lab_pm2.run(toolchain)
            print(json.dumps({k:v for k,v in result.items()if k!='toolchainFiles'},sort_keys=True))
        print('STATIC_REPRODUCTION_EXACT / OPERATIONAL_CERTIFICATION_DENIED')

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser();p.add_argument('--toolchain');a=p.parse_args();run(a.toolchain)
