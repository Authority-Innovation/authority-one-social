import {defineConfig} from '@playwright/test'

// The runtime guard's browser tests. Local fixture server only, no web build,
// no credential. `pnpm e2e:clickthrough:guard`.
export default defineConfig({
  testDir: __dirname,
  testMatch: /guard\.pw\.ts$/,
  outputDir: '../artifacts/.playwright-guard',
  timeout: 60 * 1000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    channel: process.env.CLICKTHROUGH_BROWSER_CHANNEL || 'msedge',
    serviceWorkers: 'block',
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
})
