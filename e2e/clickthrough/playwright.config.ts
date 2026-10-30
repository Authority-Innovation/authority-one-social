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
    // Requests made by a service worker skip context.route(), and so would
    // skip the runtime guard.
    serviceWorkers: 'block',
  },
  webServer: process.env.CLICKTHROUGH_NO_SERVER
    ? undefined
    : {
        command: `node node_modules/expo/bin/cli start --web --port ${port}`,
        cwd: `${__dirname}/../..`,
        url: baseURL,
        // Never reuse a server already on the port: it may not be a Dev
        // build, and its runtime calls would go wherever it was built for.
        // Playwright fails the run if the port is taken. With
        // CLICKTHROUGH_NO_SERVER the preflight step reads the served bundle
        // instead, and the runtime guard aborts any non-Dev runtime call.
        reuseExistingServer: false,
        timeout: 10 * 60 * 1000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
})
