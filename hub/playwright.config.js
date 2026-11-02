import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:4179', trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: {
    // Exercise the shipped bundle; dev dependency re-optimization must not
    // reload React underneath a browser test or a slow-route fixture.
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4179 --strictPort',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: false,
    env: { VITE_USE_MOCK: '0', VITE_API_BASE_URL: '/api' },
  },
})
