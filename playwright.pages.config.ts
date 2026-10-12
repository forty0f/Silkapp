import { defineConfig } from '@playwright/test'
import base from './playwright.config'

// Runs the whole E2E suite against a build served under /Silkapp/, exactly
// like https://forty0f.github.io/Silkapp/ (GitHub Pages project site).
process.env.E2E_BUILD_CMD = 'BASE_PATH=/Silkapp/ npx vite build --outDir dist-pages'
process.env.E2E_PAGES = '1'

export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://localhost:4174/Silkapp/' },
  webServer: {
    command: 'BASE_PATH=/Silkapp/ npx vite build --outDir dist-pages && BASE_PATH=/Silkapp/ npx vite preview --outDir dist-pages --port 4174 --strictPort',
    url: 'http://localhost:4174/Silkapp/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
