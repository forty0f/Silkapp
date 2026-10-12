import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

// The cloud container ships Chromium at a fixed path; locally Playwright's own browser is used.
const localChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const launchOptions = existsSync(localChromium) ? { executablePath: localChromium } : {}

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/',
    trace: 'retain-on-failure',
    launchOptions,
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'iphone-se-320', use: { ...devices['iPhone SE'], viewport: { width: 320, height: 640 }, browserName: 'chromium' } },
    { name: 'iphone-15-393', use: { ...devices['iPhone 15'], browserName: 'chromium' } },
    { name: 'iphone-pro-max-430', use: { ...devices['iPhone 15 Pro Max'], viewport: { width: 430, height: 932 }, browserName: 'chromium' } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } },
  ],
})
