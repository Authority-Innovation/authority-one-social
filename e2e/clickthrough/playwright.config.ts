import {defineConfig} from '@playwright/test'

// run.js has already passed the Dev guard and set these; the config only
// reads them. Run through `pnpm e2e:clickthrough`, not `playwright test`.
const baseURL = process.env.CLICKTHROUGH_BASE_URL || 'http://localhost:19006'
const port = new URL(baseURL).port || '19006'
const channel = process.env.CLICKTHROUGH_BROWSER_CHANNEL || undefined

export default defineConfig({
  testDir: __dirname,
  testMatch: /clickthrough\.pw\.ts$/,
  outputDir: './artifacts/.playwright',
  timeout: 15 * 60 * 1000,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    channel,
    viewport: {width: 1280, height: 900},
    actionTimeout: 30 * 1000,
    navigationTimeout: 60 * 1000,
    // Traces and videos would capture the typed app password.
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: process.env.CLICKTHROUGH_NO_SERVER
    ? undefined
    : {
        command: `node node_modules/expo/bin/cli start --web --port ${port}`,
        cwd: `${__dirname}/../..`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 10 * 60 * 1000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
})
