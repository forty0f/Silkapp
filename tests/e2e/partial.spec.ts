import { expect, test } from './fixtures'
import { trackConsole } from './helpers'
import type { Page } from '@playwright/test'

async function finishFromMenu(page: Page) {
  await page.getByTestId('workout-menu').click()
  await page.getByTestId('menu-finish').click()
}

async function logOneSet(page: Page) {
  await page.getByTestId('input-weight').fill('16')
  await page.getByTestId('input-reps').fill('10')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('set-row')).toHaveCount(1)
}

test('partial workout: "repeat" keeps the same workout and week; label in history; choice can be changed', async ({ page }) => {
  const errors = trackConsole(page)
  await page.goto('./')
  await page.getByTestId('start-workout').click()
  await logOneSet(page)
  await finishFromMenu(page)
  // Cancelling the dialog keeps the workout running
  await page.getByTestId('choice-cancel').click()
  // Back in the (still open) workout menu; the workout is untouched
  await expect(page.getByTestId('menu-finish')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('set-row')).toHaveCount(1)
  await finishFromMenu(page)
  await page.getByTestId('finish-repeat').click()
  await expect(page.getByTestId('summary-title')).toHaveText('Trening A częściowo ukończony')
  await expect(page.getByTestId('plan-choice')).toContainText('powtórzenie A')

  await page.getByTestId('summary-home').click()
  await expect(page.getByTestId('next-type')).toHaveText('Trening A')
  await expect(page.getByTestId('next-position')).toContainText('Tydzień 1 · sesja 1/3')
  await expect(page.getByTestId('repeat-note')).toBeVisible()
  await expect(page.getByTestId('completed-count')).toHaveText('1') // performed work

  await page.goto('./#/history')
  await expect(page.getByTestId('session-label').first()).toHaveText('częściowy 1/12 · powtórzony')
  await page.getByTestId('session-list').locator('button').first().click()
  await page.getByTestId('change-plan-choice').click()
  await page.getByTestId('finish-advance').click()
  await expect(page.getByTestId('plan-choice')).toContainText('według planu')
  await page.goto('./')
  await expect(page.getByTestId('next-type')).toHaveText('Trening B')
  await expect(page.getByTestId('next-position')).toContainText('sesja 2/3')
  expect(errors).toEqual([])
})

test('cancelled workout: no choice asked, plan and counter unchanged', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('start-workout').click()
  await expect(page.getByTestId('save-set')).toBeVisible()
  await finishFromMenu(page)
  await expect(page.getByRole('dialog', { name: 'Anulować trening?' })).toBeVisible()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByTestId('summary-title')).toHaveText('Trening A anulowany')
  await page.getByTestId('summary-home').click()
  await expect(page.getByTestId('next-type')).toHaveText('Trening A')
  await expect(page.getByTestId('completed-count')).toHaveText('0')
  await page.goto('./#/history')
  await expect(page.getByTestId('session-label').first()).toHaveText('anulowany')
})
