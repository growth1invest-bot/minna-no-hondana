"""Cache exact official SDK bytes for browser tests, outside the repository."""
import hashlib
import os
from pathlib import Path
import tempfile
from urllib.request import urlopen

root = Path(os.environ.get("HONDANA_FIREBASE_SDK_CACHE", str(Path(tempfile.gettempdir()) / "hondana-firebase-sdk-13.4.0")))
root.mkdir(parents=True, exist_ok=True)
expected = {
    "firebase-app.js": "26673f502611bc7b382edfee3230c70954dd5e4982779185c7b6b657b5f69737",
    "firebase-auth.js": "9be3b6574c0c46f4a0bfb8d85436c30c89871a8d5a9fbeb0e0137d90a74667e9",
    "firebase-firestore.js": "758596fa33e277d38925d05e8111acfd209dc0dbff593e3bb4eaeb35aec2f85c",
}
for name, digest in expected.items():
    path = root / name
    if not path.exists():
        with urlopen("https://www.gstatic.com/firebasejs/13.4.0/" + name, timeout=25) as response:
            data = response.read()
        if hashlib.sha256(data).hexdigest() != digest:
            raise RuntimeError("Official SDK checksum mismatch: " + name)
        path.write_bytes(data)
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise RuntimeError("Cached SDK checksum mismatch: " + name)
    print(name + " SHA-256 " + digest)
