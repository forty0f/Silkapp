import { expect, test } from '@playwright/test'
import { trackConsole } from './helpers'

test('full workout: log, rest timer, reload/resume, edit, skip, warm-up, extra set, finish', async ({ page }) => {
  const errors = trackConsole(page)
  await page.goto('./')

  // Empty state
  await expect(page.getByTestId('next-type')).toHaveText('Trening A')
  await expect(page.getByTestId('target-rir')).toHaveText('4')
  await expect(page.getByTestId('completed-count')).toHaveText('0')
  await expect(page.getByTestId('last-workout')).toHaveText('—')

  // One tap to start
  await page.getByTestId('start-workout').click()
  await expect(page.getByTestId('exercise-name')).toHaveText('Przysiad goblet')
  await expect(page.getByTestId('set-label')).toHaveText('Seria 1 z 2')
  await expect(page.getByTestId('last-performance')).toContainText('Pierwsza sesja')

  // Warm-up set (separate from working sets)
  await page.getByTestId('type-warmup').click()
  await page.getByTestId('input-weight').fill('8')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('set-list').getByText('R1')).toBeVisible()
  await page.getByTestId('type-working').click()

  // Working set 1
  await page.getByTestId('input-weight').fill('16')
  await page.getByTestId('input-reps').fill('10')
  await page.getByTestId('rir-4').click()
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('rest-timer')).toBeVisible()
  await expect(page.getByTestId('set-label')).toHaveText('Seria 2 z 2')
  // Weight carried over to the next set
  await expect(page.getByTestId('input-weight')).toHaveValue('16')

  // Reload mid-session → data and timer survive
  await page.reload()
  await expect(page.getByTestId('exercise-name')).toHaveText('Przysiad goblet')
  await expect(page.getByTestId('set-row')).toHaveCount(2)
  await expect(page.getByTestId('rest-timer')).toBeVisible()
  // Countdown is derived from the persisted start timestamp, so it keeps running across reloads.
  await expect(page.getByTestId('rest-remaining')).toHaveText(/^1:5\d$/, { timeout: 5000 })

  // Leave and resume from home
  await page.goto('./')
  await expect(page.getByTestId('resume-card')).toBeVisible()
  await page.getByTestId('resume-workout').click()
  await expect(page.getByTestId('exercise-name')).toHaveText('Przysiad goblet')

  // Edit set 1: 10 → 11 reps
  await page.getByTestId('set-row').nth(1).click()
  await page.getByRole('dialog').getByTestId('input-reps').fill('11')
  await page.getByTestId('save-edit').click()
  await expect(page.getByTestId('set-row').nth(1)).toContainText('16 kg × 11')

  // Set 2 completes the exercise → auto-advance
  await page.getByTestId('input-reps').fill('12')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('exercise-name')).toHaveText('Wyciskanie hantli na płasko')

  // Skip one set of bench press, do the other
  await page.getByTestId('input-weight').fill('14')
  await page.getByTestId('skip-set').click()
  await expect(page.getByTestId('set-row').first()).toContainText('pominięta')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('exercise-name')).toHaveText('Wiosłowanie jednorącz')

  // Unilateral: explicit left/right
  await page.getByTestId('input-weight').fill('16')
  await page.getByTestId('input-reps-left').fill('10')
  await page.getByTestId('input-reps-right').fill('9')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('set-row').first()).toContainText('L 10 / P 9')

  // Extra set: go back to squat and add a third working set
  await page.getByRole('button', { name: /^1\. Przysiad goblet/ }).click()
  await expect(page.getByTestId('set-label')).toHaveText('Seria dodatkowa 3')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('set-list').getByText('+3')).toBeVisible()

  // Finish early from the menu (incomplete sets are confirmed)
  await page.getByTestId('workout-menu').click()
  await page.getByTestId('menu-finish').click()
  await expect(page.getByRole('dialog', { name: 'Zakończyć trening?' })).toContainText('Zapisano')
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId('workout-summary')).toBeVisible()
  await expect(page.getByText('Trening A ukończony')).toBeVisible()

  await page.getByTestId('summary-home').click()
  await expect(page.getByTestId('completed-count')).toHaveText('1')
  await expect(page.getByTestId('next-type')).toHaveText('Trening B')

  // History detail shows the saved sets
  await page.goto('./#/history')
  await page.getByTestId('session-list').locator('button').first().click()
  await expect(page.getByTestId('detail-set').first()).toBeVisible()
  await expect(page.getByTestId('detail-exercise').first()).toContainText('16 kg × 11')

  expect(errors).toEqual([])
})

test('save error keeps the form and shows a message; retry succeeds', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('start-workout').click()
  await page.getByTestId('input-weight').fill('20')
  await page.getByTestId('input-reps').fill('9')

  await page.evaluate(() => {
    const w = window as unknown as { __orig: unknown }
    w.__orig = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function () {
      throw new DOMException('Simulated quota error', 'QuotaExceededError')
    }
  })
  await page.getByTestId('save-set').click()
  await expect(page.getByRole('alert')).toContainText('Nie udało się zapisać serii')
  await expect(page.getByTestId('input-weight')).toHaveValue('20')
  await expect(page.getByTestId('input-reps')).toHaveValue('9')
  await expect(page.getByTestId('set-row')).toHaveCount(0)

  await page.evaluate(() => {
    IDBObjectStore.prototype.put = (window as unknown as { __orig: typeof IDBObjectStore.prototype.put }).__orig
  })
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('set-row')).toHaveCount(1)
  await expect(page.getByTestId('set-row')).toContainText('20 kg × 9')
})

test('discarding an unfinished workout requires confirmation', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('start-workout').click()
  await page.getByTestId('input-weight').fill('10')
  await page.getByTestId('save-set').click()
  await page.getByTestId('workout-menu').click()
  await page.getByTestId('menu-discard').click()
  await page.getByRole('button', { name: 'Anuluj' }).click()
  await expect(page.getByTestId('exercise-name')).toBeVisible()
  await page.getByTestId('menu-discard').click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId('next-card')).toBeVisible()
  await expect(page.getByTestId('completed-count')).toHaveText('0')
})
