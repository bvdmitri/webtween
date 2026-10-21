import torch

from webtween_export.wrapper import warp


def cached_grid_warp(image: torch.Tensor, flow: torch.Tensor) -> torch.Tensor:
    """Practical-RIFE's warp as published, with its grid built for one fixed size."""
    _, _, height, width = flow.shape
    horizontal = torch.linspace(-1.0, 1.0, width).view(1, 1, 1, width).expand(1, -1, height, -1)
    vertical = torch.linspace(-1.0, 1.0, height).view(1, 1, height, 1).expand(1, -1, -1, width)
    grid = torch.cat([horizontal, vertical], 1)
    flow = torch.cat(
        [
            flow[:, 0:1] / ((image.shape[3] - 1.0) / 2.0),
            flow[:, 1:2] / ((image.shape[2] - 1.0) / 2.0),
        ],
        1,
    )
    g = (grid + flow).permute(0, 2, 3, 1)
    return torch.nn.functional.grid_sample(
        image, g, mode="bilinear", padding_mode="border", align_corners=True
    )


def test_warp_matches_the_published_warp_at_every_size():
    torch.manual_seed(0)
    for height, width in [(8, 8), (16, 24), (64, 128)]:
        image = torch.rand(1, 3, height, width)
        flow = torch.randn(1, 2, height, width) * 3
        torch.testing.assert_close(warp(image, flow), cached_grid_warp(image, flow))


def test_a_zero_flow_leaves_the_image_unchanged():
    image = torch.rand(1, 4, 16, 32)
    torch.testing.assert_close(warp(image, torch.zeros(1, 2, 16, 32)), image)
