# Samples and fixtures

## Private samples

Real clips for local measurements go in `samples/`, which git ignores except for its README. They
often show people and places, so none of it is ever committed.

`samples/catalogue.json` lists what must not leak. The repository checks (`tools/checks`) refuse
a commit whose files, paths or message contain any of its terms:

```json
{
  "samples": [{ "files": ["clip-name.mp4"] }],
  "terms": ["a folder name", "a person's name"]
}
```

A missing catalogue checks nothing (a fresh clone has no private samples); an unreadable one fails
the check.

## Committed fixtures

Test fixtures live in `test/fixtures/`, stored with Git LFS (`.gitattributes`). Each is built by
a tool in this repository, so it holds nothing recorded:

- `test/fixtures/model/blend.onnx`: the model contract with a linear blend in place of RIFE,
  written by `uv run webtween-export fixture` ([MODEL.md](./MODEL.md)).

Test frames are synthetic: grey levels and smooth moving patterns made in the tests themselves.
