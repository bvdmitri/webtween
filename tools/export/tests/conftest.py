import importlib.util

# The export's own tests need PyTorch, which CI leaves out (the `export` group in pyproject.toml).
collect_ignore = [] if importlib.util.find_spec("torch") else ["test_warp.py", "test_export.py"]
