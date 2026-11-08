#!/usr/bin/env python3
"""Package the approved scripts without rewriting their contents."""
from pathlib import Path
import hashlib
import zipfile

root = Path(__file__).resolve().parent.parent
files = {
    'mpcdev.sh': (root / 'dist/mpcdev.sh').read_bytes(),
    'hello-001.sh': (root / 'dist/hello-001.sh').read_bytes(),
    'DEPLOY.md': (root / 'docs/DEPLOY.md').read_bytes(),
}
assert files['mpcdev.sh'] == (root / 'device/mpcdev.sh').read_bytes()
assert files['hello-001.sh'] == (root / 'releases/hello-001/payload.sh').read_bytes()
files['SHA256SUMS'] = ''.join(
    f'{hashlib.sha256(data).hexdigest()}  {name}\n'
    for name, data in files.items()
).encode()
archive = root / 'dist/MPCDev-hello-001.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for name, data in files.items():
        info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        z.writestr(info, data)
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert set(z.namelist()) == set(files)
    for name, data in files.items():
        assert z.read(name) == data
checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
(root / 'dist/MPCDev-hello-001.zip.sha256').write_text(
    f'{checksum}  {archive.name}\n'
)
print(f'{archive}\n{checksum}')
