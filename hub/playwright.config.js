import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test',
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure',
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    env: { VITE_USE_MOCK: '0', VITE_API_BASE_URL: '/api' },
  },
})
