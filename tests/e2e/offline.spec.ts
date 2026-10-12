import { expect, test } from '@playwright/test'

test('works offline after first load (service worker) and keeps saving', async ({ page, context }) => {
  await page.goto('./')
  await expect(page.getByTestId('start-workout')).toBeVisible()
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // Ensure the page is controlled by the SW before going offline.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByTestId('offline-banner')).toBeVisible()
  await page.getByTestId('start-workout').click()
  await page.getByTestId('input-weight').fill('12')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('set-row')).toHaveCount(1)
  await page.goto('./#/atlas/db-hip-thrust')
  await expect(page.getByRole('img', { name: /Hip thrust z hantlem — pozycja końcowa/ })).toBeVisible()
  await context.setOffline(false)
})
