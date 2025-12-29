import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // Use 'node' for now; consider 'cloudflare:test' with @cloudflare/vitest-pool-workers
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json'],
      include: ['src/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.d.ts',
        'src/test-setup.ts',
        'src/styles.example.ts',
      ],
      // Coverage thresholds
      statements: 80,
      branches: 80,
      functions: 80,
      lines: 80,
    },
    // Setup files to run before each test file
    setupFiles: [],
    // Test timeout
    testTimeout: 10000,
    // Isolate tests between files
    isolate: true,
    // Show verbose output
    reporters: ['default'],
    // Enable fake timers for date/time testing (disabled as it can interfere with Promise mocks)
    useFakeTimers: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
