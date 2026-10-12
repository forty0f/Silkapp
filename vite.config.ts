/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { existsSync, readFileSync } from 'node:fs'

// Optional local HTTPS for testing on an iPhone (see docs/IPHONE_HTTPS_TEST.md).
const certDir = process.env.SILK_CERT_DIR ?? 'certs'
const https =
  process.env.SILK_HTTPS === '1' && existsSync(`${certDir}/cert.pem`) && existsSync(`${certDir}/key.pem`)
    ? { cert: readFileSync(`${certDir}/cert.pem`), key: readFileSync(`${certDir}/key.pem`) }
    : undefined

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  // Relative base keeps the build portable (any static host / sub-path).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(process.env.SILK_BUILD_ID ?? new Date().toISOString().slice(0, 16)),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: './',
        name: 'Silk — trening FBW A/B',
        short_name: 'Silk FBW',
        description: 'Prywatny dziennik treningowy FBW A/B działający offline.',
        lang: 'pl',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b1220',
        theme_color: '#0b1220',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 800 },
  preview: {
    https,
    // Allow private test access: Tailscale (*.ts.net) and Bonjour LAN names (*.local).
    allowedHosts: ['.ts.net', '.local'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
})
