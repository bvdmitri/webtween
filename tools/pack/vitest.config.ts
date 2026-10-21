import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'pack',
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
