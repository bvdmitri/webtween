import numpy as np
import onnxruntime as ort
import pytest
import torch

from webtween_export.upstream import load_flownet
from webtween_export.wrapper import ALIGNMENT, Interpolator, export_onnx

pytestmark = pytest.mark.upstream


def pattern(height: int, width: int, shift: float) -> np.ndarray:
    """A smooth colour pattern moved `shift` pixels right: motion with a known truth."""
    y, x = np.mgrid[0:height, 0:width].astype(np.float32)
    x = x - shift
    channels = [np.sin(x / 9 + y / 13), np.cos(x / 17 - y / 7), np.sin((x + y) / 11)]
    return (0.5 + 0.4 * np.stack(channels))[None].astype(np.float32)


@pytest.fixture(scope="module")
def interpolator() -> Interpolator:
    try:
        return Interpolator(load_flownet())
    except FileNotFoundError:
        pytest.skip("the Practical-RIFE weights are not fetched (webtween-export fetch)")


@pytest.fixture(scope="module")
def session(interpolator: Interpolator, tmp_path_factory: pytest.TempPathFactory):
    path = tmp_path_factory.mktemp("model") / "rife.onnx"
    export_onnx(interpolator, path)
    return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])


def run(
    session: ort.InferenceSession, frames: tuple[np.ndarray, np.ndarray], t: float
) -> np.ndarray:
    img0, img1 = frames
    feeds = {"img0": img0, "img1": img1, "timestep": np.array([t], dtype=np.float32)}
    return session.run(["output"], feeds)[0]


@pytest.mark.parametrize(
    "size",
    [(ALIGNMENT, ALIGNMENT), (ALIGNMENT, 2 * ALIGNMENT), (3 * ALIGNMENT, 5 * ALIGNMENT)],
)
def test_onnx_matches_pytorch_at_any_aligned_size(interpolator, session, size):
    height, width = size
    img0, img1 = pattern(height, width, 0), pattern(height, width, 4)
    for t in [0.25, 0.5]:
        with torch.no_grad():
            expected = interpolator(
                torch.from_numpy(img0), torch.from_numpy(img1), torch.tensor([t])
            ).numpy()
        out = run(session, (img0, img1), t)
        assert out.shape == (1, 3, height, width)
        np.testing.assert_allclose(out, expected, atol=1e-4)


@pytest.mark.parametrize("t", [0.25, 0.5, 0.75])
def test_the_frame_between_is_the_motion_at_that_time(session, t):
    size = 3 * ALIGNMENT
    out = run(session, (pattern(size, size, 0), pattern(size, size, 4)), t)
    inner = (..., slice(8, -8), slice(8, -8))
    assert np.abs(out - pattern(size, size, 4 * t))[inner].mean() < 0.01


def test_identical_frames_interpolate_to_themselves(session):
    img = pattern(ALIGNMENT, ALIGNMENT, 0)
    np.testing.assert_allclose(run(session, (img, img), 0.5), img, atol=1e-2)
