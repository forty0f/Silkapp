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
    // Chromium with iPhone-like viewports/touch. This is NOT Safari/WebKit — see AUDIT.md.
    { name: 'w320', use: { ...devices['iPhone SE'], viewport: { width: 320, height: 568 }, browserName: 'chromium' } },
    { name: 'w375', use: { ...devices['iPhone SE'], viewport: { width: 375, height: 667 }, browserName: 'chromium' } },
    { name: 'w390', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, browserName: 'chromium' } },
    { name: 'w430', use: { ...devices['iPhone 15 Pro Max'], viewport: { width: 430, height: 932 }, browserName: 'chromium' } },
    { name: 'w768', use: { ...devices['iPad Mini'], viewport: { width: 768, height: 1024 }, browserName: 'chromium' } },
    { name: 'w1440', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
  ],
})
