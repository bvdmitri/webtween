"""RIFE as one ONNX graph: two frames and a time in, the frame at that time out."""

from pathlib import Path

import onnx
import torch
from torch import nn

#: Height and width must be multiples of this: the coarsest flow block sees the frame at 1/16
#: and halves it twice more.
ALIGNMENT = 64
#: Practical-RIFE 4.25's flow blocks, coarse to fine, at full resolution (its scale 1.0).
SCALES = (16, 8, 4, 2, 1)
OPSET = 19


def warp(image: torch.Tensor, flow: torch.Tensor) -> torch.Tensor:
    """Sample `image` displaced by `flow` (pixels), as Practical-RIFE's warp does.

    The published warp caches a sampling grid per frame size, which an exported graph would keep
    as a constant of the size it was traced at. This one builds the grid from the frame's own
    shape, so the graph runs at any size.
    """
    height, width = flow.shape[2], flow.shape[3]
    xs = torch.arange(width, dtype=flow.dtype, device=flow.device)
    ys = torch.arange(height, dtype=flow.dtype, device=flow.device)
    x = (xs.view(1, 1, 1, -1) + flow[:, 0:1]) * (2.0 / xs[-1]) - 1.0
    y = (ys.view(1, 1, -1, 1) + flow[:, 1:2]) * (2.0 / ys[-1]) - 1.0
    grid = torch.cat([x, y], 1).permute(0, 2, 3, 1)
    return nn.functional.grid_sample(
        image, grid, mode="bilinear", padding_mode="border", align_corners=True
    )


class Interpolator(nn.Module):
    """Practical-RIFE's flow network behind the model contract's inputs and output."""

    def __init__(self, flownet: nn.Module) -> None:
        """Wrap a loaded, evaluating IFNet."""
        super().__init__()
        self.flownet = flownet

    def forward(
        self, img0: torch.Tensor, img1: torch.Tensor, timestep: torch.Tensor
    ) -> torch.Tensor:
        """The frame at `timestep` (shape [1], in 0..1) between `img0` and `img1` (NCHW, 0..1)."""
        frames = torch.cat((img0, img1), 1)
        _, _, merged = self.flownet(frames, timestep.view(1, 1, 1, 1), list(SCALES))
        return merged[-1]


def export_onnx(interpolator: Interpolator, path: Path) -> None:
    """Write `interpolator` as an ONNX graph with a free height and width, checked by onnx."""
    size = (1, 3, ALIGNMENT, ALIGNMENT)
    example = (torch.rand(size), torch.rand(size), torch.tensor([0.5]))
    image_axes = {2: "height", 3: "width"}
    with torch.no_grad():
        torch.onnx.export(
            interpolator,
            example,
            str(path),
            input_names=["img0", "img1", "timestep"],
            output_names=["output"],
            dynamic_axes={"img0": image_axes, "img1": image_axes, "output": image_axes},
            opset_version=OPSET,
            dynamo=False,
        )
    onnx.checker.check_model(str(path), full_check=True)
