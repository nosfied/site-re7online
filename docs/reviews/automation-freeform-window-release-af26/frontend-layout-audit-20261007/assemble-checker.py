"""Reconstruct exact review bytes solely from versioned sources/patches.
Usage: python3 assemble-checker.py NEW_OUTPUT_DIRECTORY
Does not create bindings, authorize a window or install any file.
"""
import hashlib,shutil,subprocess,sys
from pathlib import Path
here=Path(__file__).resolve().parent;out=Path(sys.argv[1]).resolve();assert not out.exists();out.mkdir()
def expect(p,digest):assert hashlib.sha256(p.read_bytes()).hexdigest()==digest,'hash:'+p.name
base=here.parent/'frontend-fa60f0f6-prepared/frontend-check.py';expect(base,'5b2cbc85f95b911f6d8ae0be2f63af7a20a12fedcb98f8b3281beb48363c3aed')
p=out/'frontend-check.py';p.write_text(base.read_text().replace('frontend-fa60f0f6-20261007T171104Z','frontend-fa60-observed-20261007T194628Z'))
expect(p,'1136c0cc8e4e26234c50b6ff7d7b10997d8dad1da58bae4e3a63ea6c5303e7bf')
with (here.parent/'frontend-recovery-observation-20261007/recovery.patch').open() as f:subprocess.run(['patch','--batch','--fuzz=0','-p1'],cwd=out,stdin=f,check=True)
expect(p,'77817b16a7f760b0b75d514f54df7ef482cbb819d92fa4a6cab48541b7080c6a')
shutil.copy2(here.parent/'frontend-fa60f0f6-prepared/socket_observation_client.py',out/'socket_observation_client.py')
with (here/'supervision.patch').open() as f:subprocess.run(['patch','--batch','--fuzz=0','-p1'],cwd=out,stdin=f,check=True)
expect(p,'a611e0234e1248629b311ba5f0901d46a933151df12091904efb9281f44036a5')
expect(out/'socket_observation_client.py','c5a17c1c109c942d8094d2fe0bbd0b1ca89ca0378baa411b838c949a91bf4f7f')
print('REVIEW_BYTES_RECONSTRUCTED_PASS')
