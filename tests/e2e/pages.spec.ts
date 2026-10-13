import { expect, test } from './fixtures'
import { trackConsole } from './helpers'

// Sub-path deployment checks. Only meaningful under playwright.pages.config.ts.
test.skip(!process.env.E2E_PAGES, 'run with playwright.pages.config.ts')

test('served under /Silkapp/: manifest, icons, service worker scope, no 404s or out-of-scope requests', async ({ page, baseURL }) => {
  const errors = trackConsole(page)
  const bad: string[] = []
  const outside: string[] = []
  const origin = new URL(baseURL!).origin
  page.on('response', (r) => {
    if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`)
  })
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.protocol.startsWith('http') && (u.origin !== origin || !u.pathname.startsWith('/Silkapp/'))) outside.push(r.url())
  })

  await page.goto('./')
  await expect(page.getByTestId('start-workout')).toBeVisible()

  // Manifest resolves start_url / scope / id to the sub-path.
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifestUrl = new URL(manifestHref!, page.url()).toString()
  expect(manifestUrl).toBe(`${origin}/Silkapp/manifest.webmanifest`)
  const manifest = await (await page.request.get(manifestUrl)).json()
  const resolve = (v: string) => new URL(v, manifestUrl).toString()
  expect(resolve(manifest.start_url)).toBe(`${origin}/Silkapp/`)
  expect(resolve(manifest.scope)).toBe(`${origin}/Silkapp/`)
  expect(resolve(manifest.id)).toBe(`${origin}/Silkapp/`)
  expect(manifest.display).toBe('standalone')
  const sizes = manifest.icons.map((i: { sizes: string; purpose?: string }) => `${i.sizes}${i.purpose ? `:${i.purpose}` : ''}`)
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512', '512x512:maskable']))
  for (const icon of manifest.icons) expect((await page.request.get(resolve(icon.src))).status()).toBe(200)
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href')
  expect((await page.request.get(new URL(touch!, page.url()).toString())).status()).toBe(200)

  // Service worker is scoped to /Silkapp/ only.
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready
    return { scope: r.scope, script: r.active?.scriptURL }
  })
  expect(reg.scope).toBe(`${origin}/Silkapp/`)
  expect(reg.script).toBe(`${origin}/Silkapp/sw.js`)

  // Every tab and all 12 atlas cards.
  for (const r of ['/history', '/progress', '/atlas', '/settings', '/settings/plan']) {
    await page.goto(`./#${r}`)
    await expect(page.locator('h1').first()).toBeVisible()
  }
  await page.goto('./#/atlas')
  await expect(page.locator('main svg[preserveAspectRatio="xMidYMid meet"]')).toHaveCount(12)
  const ids = ['goblet-squat', 'flat-db-press', 'one-arm-row', 'romanian-deadlift', 'lateral-raise', 'plank', 'incline-db-press', 'reverse-lunge', 'chest-supported-row', 'db-overhead-press', 'db-hip-thrust', 'db-biceps-curl']
  for (const id of ids) {
    await page.goto(`./#/atlas/${id}`)
    await expect(page.getByRole('img', { name: /pozycja początkowa/ })).toBeVisible()
    await expect(page.getByRole('img', { name: /pozycja końcowa/ })).toBeVisible()
  }

  expect(bad).toEqual([])
  expect(outside).toEqual([])
  expect(errors).toEqual([])
})
