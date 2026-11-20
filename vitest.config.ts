import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@coco/protocol': path.resolve(__dirname, 'packages/protocol/src/index.ts'),
      '@coco/api-client': path.resolve(__dirname, 'packages/api-client/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
