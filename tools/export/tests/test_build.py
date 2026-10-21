import json

import onnxruntime as ort
import pytest

from webtween_export.main import build, write_fixture


def test_the_fixture_is_written_where_asked(tmp_path):
    path = tmp_path / "fixtures" / "blend.onnx"
    write_fixture(path)
    assert ort.InferenceSession(str(path)).get_outputs()[0].name == "output"


@pytest.mark.upstream
def test_build_writes_the_model_and_its_manifest(tmp_path):
    pytest.importorskip("torch")
    from webtween_export.upstream import DIRECTORY  # noqa: PLC0415
    from webtween_export.wrapper import ALIGNMENT  # noqa: PLC0415

    if not (DIRECTORY / "flownet.pkl").exists():
        pytest.skip("the Practical-RIFE weights are not fetched (webtween-export fetch)")
    build(tmp_path)
    manifest = json.loads((tmp_path / "manifest.json").read_text())
    assert manifest["alignment"] == ALIGNMENT
    assert manifest["source"]["version"] == "4.25"
    (entry,) = manifest["models"]
    model = tmp_path / entry["file"]
    assert entry["precision"] == "fp32"
    assert model.stat().st_size == entry["bytes"]
    assert ort.InferenceSession(str(model)).get_outputs()[0].name == "output"
