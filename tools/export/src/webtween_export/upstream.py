"""Practical-RIFE 4.25, fetched by hash: its flow network's code and its trained weights."""

import hashlib
import importlib.util
import sys
import types
import zipfile
from pathlib import Path

import gdown
import torch
from torch import nn

from webtween_export.wrapper import warp

#: Where the fetched files live; git ignores it.
DIRECTORY = Path(__file__).resolve().parents[2] / ".upstream"
#: The 4.25 release as Practical-RIFE's README links it (MIT, like the project).
DRIVE_ID = "1ZKjcbmt1hypiFprJPIKW0Tt0lr_2i7bg"
ARCHIVE = "rife-4.25.zip"
#: Every fetched file, by the SHA-256 it must have.
HASHES = {
    ARCHIVE: "e63d481b7ae5d4a4e6ad7ac5b410ff78f3bf7be3b51b2e38ca8152747abde5b4",
    "IFNet_HDv3.py": "655b4c772b037967b86c2dd31c8fa3b5323b79dd9a0e0088708d89149bbc8a32",
    "flownet.pkl": "6615790efd627772917205db291f51cd392528a157ecbb2ecaeec3bff8eb6de2",
}
VERSION = "4.25"
#: Parts of the network that only training uses; the release's weights include them.
TRAINING_ONLY = ("teacher.", "caltime.")


def _verified(path: Path) -> Path:
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != HASHES[path.name]:
        message = f"{path.name} has SHA-256 {digest}, expected {HASHES[path.name]}"
        raise ValueError(message)
    return path


def fetch(directory: Path = DIRECTORY) -> None:
    """Download the 4.25 release and unpack its network code and weights, each checked by hash."""
    directory.mkdir(parents=True, exist_ok=True)
    archive = directory / ARCHIVE
    if not archive.exists():
        gdown.download(id=DRIVE_ID, output=str(archive), quiet=True)
    with zipfile.ZipFile(_verified(archive)) as zipped:
        for name in ("IFNet_HDv3.py", "flownet.pkl"):
            (directory / name).write_bytes(zipped.read(f"train_log/{name}"))
            _verified(directory / name)


def _ifnet_module(directory: Path) -> types.ModuleType:
    # The network imports its warp from Practical-RIFE's `model` package; ours stands in for it.
    warplayer = types.ModuleType("model.warplayer")
    warplayer.warp = warp  # type: ignore[attr-defined]
    sys.modules.setdefault("model", types.ModuleType("model"))
    sys.modules["model.warplayer"] = warplayer
    spec = importlib.util.spec_from_file_location(
        "IFNet_HDv3", _verified(directory / "IFNet_HDv3.py")
    )
    if spec is None or spec.loader is None:
        message = "cannot load IFNet_HDv3.py"
        raise ImportError(message)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_flownet(directory: Path = DIRECTORY) -> nn.Module:
    """The 4.25 flow network with its weights, evaluating, on the CPU.

    Raises FileNotFoundError when the release has not been fetched.
    """
    weights = directory / "flownet.pkl"
    if not weights.exists():
        raise FileNotFoundError(weights)
    flownet = _ifnet_module(directory).IFNet()
    state = torch.load(_verified(weights), map_location="cpu", weights_only=True)
    kept = {
        key.removeprefix("module."): value
        for key, value in state.items()
        if not key.removeprefix("module.").startswith(TRAINING_ONLY)
    }
    flownet.load_state_dict(kept)
    return flownet.eval()
