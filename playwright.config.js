// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/ci',
  timeout:  30_000,
  expect:   { timeout: 10_000 },

  // Fail immediately on .only — prevents accidental focused tests in CI.
  forbidOnly: !!process.env.CI,

  // Zero retries — flaky is a bug, not a retry candidate.
  retries: 0,

  // Sequential: only one browser context at a time.
  workers: 1,

  // list reporter for local dev; github reporter adds PR annotations in Actions.
  reporter: [['list'], ['github']],

  use: {
    baseURL:    'http://127.0.0.1:3000',
    headless:   true,
    screenshot: 'off',
    video:      'off',
    trace:      'off',
  },

  projects: [
    {
      name: 'chromium',
      use:  { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    // Zero-dependency static server built on Node.js built-ins.
    command:             'node tests/ci/serve.js',
    url:                 'http://127.0.0.1:3000',
    // Reuse a running server locally; always start fresh in CI.
    reuseExistingServer: !process.env.CI,
    timeout:             30_000,
  },
});
