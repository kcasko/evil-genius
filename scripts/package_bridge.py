#!/usr/bin/env python
"""Build the Lambda bridge zip without making any AWS calls.

Dependency installation may use the configured Python package index. Run only
when ordinary package-network access is authorized; this script never invokes
AWS or downloads model weights.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BRIDGE = ROOT / "backend" / "bridge"
BUILD = ROOT / "build" / "bridge"
DIST = ROOT / "dist"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--skip-dependencies", action="store_true")
    args = parser.parse_args()

    shutil.rmtree(BUILD, ignore_errors=True)
    BUILD.mkdir(parents=True)
    DIST.mkdir(parents=True, exist_ok=True)

    if not args.skip_dependencies:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "--requirement",
                str(BRIDGE / "requirements.txt"),
                "--target",
                str(BUILD),
            ],
            check=True,
        )

    for source in ("handler.py", "config.py", "killswitch.py", "ratelimit.py"):
        shutil.copy2(BRIDGE / source, BUILD / source)
    shutil.copy2(ROOT / "backend" / "agent.py", BUILD / "agent.py")

    output = DIST / "bridge.zip"
    output.unlink(missing_ok=True)
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(BUILD.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(BUILD).as_posix())

    unpacked = sum(path.stat().st_size for path in BUILD.rglob("*") if path.is_file())
    if unpacked > 250 * 1024 * 1024:
        raise RuntimeError(f"Lambda artifact exceeds 250 MiB unpacked: {unpacked} bytes")
    print(f"built {output} ({output.stat().st_size} bytes zipped; {unpacked} unpacked)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
