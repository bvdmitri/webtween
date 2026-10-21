"""The export's command line: `fetch` the release, `build` the models, write the `fixture`."""

import argparse
import hashlib
import json
from pathlib import Path

from webtween_export.fixture import blend_model

ROOT = Path(__file__).resolve().parents[4]


def write_fixture(path: Path) -> None:
    """Write the blend model, the runtime's test stand-in for RIFE, to `path`."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(blend_model())


def _entry(path: Path, precision: str) -> dict[str, object]:
    data = path.read_bytes()
    sha256 = hashlib.sha256(data).hexdigest()
    return {"file": path.name, "precision": precision, "bytes": len(data), "sha256": sha256}


def build(directory: Path) -> None:
    """Export RIFE in float32 into `directory`, with a manifest describing it."""
    # PyTorch is imported here, not with the module: the fixture command runs without it.
    from webtween_export import upstream  # noqa: PLC0415
    from webtween_export.wrapper import (  # noqa: PLC0415
        ALIGNMENT,
        OPSET,
        SCALES,
        Interpolator,
        export_onnx,
    )

    directory.mkdir(parents=True, exist_ok=True)
    stem = f"rife-{upstream.VERSION}"
    full = directory / f"{stem}-fp32.onnx"
    export_onnx(Interpolator(upstream.load_flownet()), full)
    manifest = {
        "source": {
            "project": "hzwer/Practical-RIFE",
            "version": upstream.VERSION,
            "sha256": upstream.HASHES,
        },
        "opset": OPSET,
        "scales": list(SCALES),
        "alignment": ALIGNMENT,
        "models": [_entry(full, "fp32")],
    }
    (directory / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


def main() -> None:
    """Run one of the export's commands."""
    parser = argparse.ArgumentParser(prog="webtween-export")
    parser.add_argument("command", choices=["fetch", "build", "fixture"])
    command = parser.parse_args().command
    if command == "fetch":
        from webtween_export import upstream  # noqa: PLC0415

        upstream.fetch()
    elif command == "build":
        build(ROOT / "models")
    else:
        write_fixture(ROOT / "test" / "fixtures" / "model" / "blend.onnx")
