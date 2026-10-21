---
layout: home

hero:
  name: webtween
  text: Smooth slow motion in the browser
  tagline: Frames generated between frames by a neural network, on WebGPU, from decoded VideoFrames to decoded VideoFrames.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: API reference
      link: /api/
    - theme: alt
      text: The model
      link: /MODEL

features:
  - title: Learned in-between frames
    details: RIFE estimates the motion between two frames and draws the frame at any time between them, as editing suites do for smooth slow motion.
  - title: On the GPU
    details: The model runs on WebGPU through onnxruntime-web, sharing one device with the shaders that feed it, with a WebAssembly fallback everywhere else.
  - title: Free until used
    details: Importing webtween loads nothing. The runtime and the model download only when an interpolator is created.
  - title: In the browser
    details: Nothing leaves the user's machine. Frames come from the application's decoder and go to its encoder.
---
