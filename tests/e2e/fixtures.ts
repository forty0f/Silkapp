import { test as base, expect } from '@playwright/test'

/**
 * Safe-area insets of an iPhone 15/16 in portrait (status bar/Dynamic Island 59 px,
 * home indicator 34 px). Chromium reports env(safe-area-inset-*) as 0, so projects
 * named "*-safe" override the app's --safe-* CSS variables instead.
 */
export const SAFE_AREA_CSS = ':root{--safe-top:59px;--safe-bottom:34px}'

export const test = base.extend<{ safeArea: void }>({
  safeArea: [
    async ({ page }, use, info) => {
      if (info.project.name.endsWith('-safe')) {
        await page.addInitScript((css) => {
          const add = () => {
            const el = document.createElement('style')
            el.dataset.test = 'safe-area'
            el.textContent = css
            document.head.appendChild(el)
          }
          if (document.head) add()
          else document.addEventListener('DOMContentLoaded', add)
        }, SAFE_AREA_CSS)
      }
      // Opt-in CPU slowdown (Chromium only) to reproduce timing-dependent failures locally.
      const rate = Number(process.env.E2E_CPU_THROTTLE ?? 0)
      if (rate > 1) {
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Emulation.setCPUThrottlingRate', { rate })
      }
      await use()
    },
    { auto: true },
  ],
})

export { expect }
