import { defineProject } from 'vitest/config';

// The interpolator tests pack and unpack frames on a GPU
// device, which on CI is Mesa's software Vulkan driver, slower than a real GPU by far.
const GPU_TEST_TIMEOUT_MS = 30_000;

export default defineProject({
  test: {
    name: 'webtween',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: GPU_TEST_TIMEOUT_MS,
    // Opening a GPU device on a runner's software Vulkan can take as long as a test.
    hookTimeout: GPU_TEST_TIMEOUT_MS,
  },
});
