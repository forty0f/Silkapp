import { execSync } from 'node:child_process'
import { expect, test } from '@playwright/test'

// The Pages config overrides this to rebuild its own output directory.
const BUILD = process.env.E2E_BUILD_CMD ?? 'npx vite build'

// Simulates shipping a new app version while the user has history and an
// unfinished workout. Runs once (desktop project) because it rebuilds dist/.
test('PWA update: new version is offered, applied, and all data survives', async ({ page }, info) => {
  test.skip(info.project.name !== 'w1440', 'rebuilds dist/ — run once')
  test.setTimeout(180_000)
  execSync(BUILD, { env: { ...process.env, SILK_BUILD_ID: 'e2e-v1' }, stdio: 'ignore' })

  await page.goto('./')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await page.goto('./#/settings')
  await expect(page.getByTestId('build-id')).toHaveText('e2e-v1')

  // Data under the old version: one finished workout + one in progress.
  await page.goto('./')
  await page.getByTestId('start-workout').click()
  await page.getByTestId('input-weight').fill('14')
  await page.getByTestId('save-set').click()
  await page.getByTestId('workout-menu').click()
  await page.getByTestId('menu-finish').click()
  await page.getByTestId('confirm-ok').click()
  await page.getByTestId('summary-home').click()
  await page.getByTestId('start-workout').click()
  await page.getByTestId('input-weight').fill('12')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('set-row')).toHaveCount(1)

  // Ship v2.
  execSync(BUILD, { env: { ...process.env, SILK_BUILD_ID: 'e2e-v2' }, stdio: 'ignore' })
  await page.reload() // triggers the SW update check
  // The prompt must not interrupt the workout screen…
  await page.waitForTimeout(1500)
  await expect(page.getByText('Dostępna nowa wersja aplikacji')).toHaveCount(0)
  // …but is offered elsewhere.
  await page.goto('./#/history')
  await expect(page.getByText('Dostępna nowa wersja aplikacji')).toBeVisible({ timeout: 15_000 })
  // Tapping "Odśwież" activates the new service worker and reloads the page by itself.
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Odśwież' }).click()])
  await page.goto('./#/settings')
  await page.reload()
  await expect(page.getByTestId('build-id')).toHaveText('e2e-v2')

  await page.goto('./')
  await expect(page.getByTestId('completed-count')).toHaveText('1')
  await page.getByTestId('resume-workout').click()
  await expect(page.getByTestId('set-row')).toHaveCount(1)
  await expect(page.getByTestId('set-row')).toContainText('12 kg')
})
