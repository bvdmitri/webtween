import numpy as np
import onnxruntime as ort

from webtween_export.fixture import blend_model


def run(model: bytes, frames: tuple[np.ndarray, np.ndarray], t: float) -> np.ndarray:
    img0, img1 = frames
    session = ort.InferenceSession(model, providers=["CPUExecutionProvider"])
    feeds = {"img0": img0, "img1": img1, "timestep": np.array([t], dtype=np.float32)}
    return session.run(["output"], feeds)[0]


def test_the_fixture_has_the_model_contract():
    session = ort.InferenceSession(blend_model(), providers=["CPUExecutionProvider"])
    assert [i.name for i in session.get_inputs()] == ["img0", "img1", "timestep"]
    assert [o.name for o in session.get_outputs()] == ["output"]
    assert session.get_inputs()[0].shape == [1, 3, "height", "width"]
    assert session.get_inputs()[2].shape == [1]


def test_the_fixture_blends_linearly_at_any_size():
    rng = np.random.default_rng(1)
    for height, width in [(64, 64), (128, 192)]:
        img0 = rng.random((1, 3, height, width), dtype=np.float32)
        img1 = rng.random((1, 3, height, width), dtype=np.float32)
        out = run(blend_model(), (img0, img1), 0.25)
        np.testing.assert_allclose(out, img0 * 0.75 + img1 * 0.25, atol=1e-6)


def test_the_fixture_is_small_and_deterministic():
    assert blend_model() == blend_model()
    assert len(blend_model()) < 2048
