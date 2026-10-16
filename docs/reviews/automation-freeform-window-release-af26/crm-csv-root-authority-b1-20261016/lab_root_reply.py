"""Synthetic READ ONLY sudo/helper endpoint for local transport tests."""
import json
import os
from pathlib import Path
import sys
import time
state=json.loads(Path(sys.argv[1]).read_text())
if state.get('queryLost'):
    os.write(2,b'lab root response lost')
    sys.exit(9)
print(json.dumps(state['bundle'],sort_keys=True))
