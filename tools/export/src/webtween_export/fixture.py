"""A stand-in model with the interpolation contract, small enough to commit as a test fixture."""

from onnx import TensorProto, helper

OPSET = 19
IR_VERSION = 9


def _image(name: str) -> helper.ValueInfoProto:
    return helper.make_tensor_value_info(name, TensorProto.FLOAT, [1, 3, "height", "width"])


def blend_model() -> bytes:
    """A model with RIFE's inputs and output that blends linearly: img0 + (img1 - img0) * t.

    Its names, shapes and value range are the model contract (docs/MODEL.md), so the runtime's
    tests exercise loading and running a model without the real weights.
    """
    nodes = [
        helper.make_node("Sub", ["img1", "img0"], ["difference"]),
        helper.make_node("Mul", ["difference", "timestep"], ["step"]),
        helper.make_node("Add", ["img0", "step"], ["output"]),
    ]
    timestep = helper.make_tensor_value_info("timestep", TensorProto.FLOAT, [1])
    graph = helper.make_graph(
        nodes, "blend", [_image("img0"), _image("img1"), timestep], [_image("output")]
    )
    model = helper.make_model(
        graph,
        producer_name="webtween-export",
        opset_imports=[helper.make_opsetid("", OPSET)],
        ir_version=IR_VERSION,
    )
    return model.SerializeToString(deterministic=True)
