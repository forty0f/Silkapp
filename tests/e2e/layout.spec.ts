import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, importSeed, trackConsole } from './helpers'

const ROUTES = ['/', '/history', '/progress', '/atlas', '/atlas/one-arm-row', '/settings', '/settings/plan']

test('empty state: every screen renders without overflow or console errors', async ({ page }) => {
  const errors = trackConsole(page)
  for (const r of ROUTES) {
    await page.goto(`./#${r}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1').first()).toBeVisible()
    await expectNoHorizontalOverflow(page, r)
  }
  await page.goto('./#/history')
  await expect(page.getByText('Historia jest pusta')).toBeVisible()
  expect(errors).toEqual([])
})

test('with history: screens, charts and active workout fit the viewport', async ({ page }, info) => {
  const errors = trackConsole(page)
  await importSeed(page)
  for (const r of ROUTES) {
    await page.goto(`./#${r}`)
    await page.waitForTimeout(200)
    await expectNoHorizontalOverflow(page, r)
  }
  for (const tab of ['Ciało', 'Tygodnie']) {
    await page.goto('./#/progress')
    await page.getByRole('tab', { name: tab }).click()
    await expectNoHorizontalOverflow(page, `progress/${tab}`)
  }
  await page.goto('./#/history')
  await page.getByTestId('session-list').locator('button').first().click()
  await expectNoHorizontalOverflow(page, 'session detail')

  await page.goto('./')
  await page.getByTestId('start-workout').click()
  await expect(page.getByTestId('exercise-name')).toBeVisible()
  // Accepted suggestion from the seed prefills the heavier load
  await expect(page.getByTestId('input-weight')).not.toHaveValue('')
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: new RegExp(`^${i + 1}\\. `) }).click()
    await expect(page.getByText(`Ćwiczenie ${i + 1} z 6`)).toBeVisible()
    // Wait until the exercise's form (and its save button) has mounted.
    await expect(page.getByTestId('set-label')).toBeVisible()
    await expectNoHorizontalOverflow(page, `workout exercise ${i + 1}`)
  }
  // Primary action is within the viewport (thumb zone)
  await expect(page.getByTestId('save-set')).toBeVisible()
  const box = await page.getByTestId('save-set').boundingBox()
  const vh = page.viewportSize()!.height
  expect(box!.y + box!.height).toBeLessThanOrEqual(vh)
  expect(box!.height).toBeGreaterThanOrEqual(44)
  await page.screenshot({ path: `test-results/screens/workout-${info.project.name}.png` })
  expect(errors).toEqual([])
})
