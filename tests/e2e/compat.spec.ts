import { expect, test } from '@playwright/test'
import { exportViaUi, trackConsole } from './helpers'

// Data written by the version with partial completion (backup format 2):
// a "repeat" partial session and a cancelled session.
test('format-2 data: cancelled and repeat-partial sessions are shown safely and keep the plan', async ({ page }) => {
  const errors = trackConsole(page)
  await page.goto('./#/settings')
  await page.getByTestId('import-file').setInputFiles('tests/fixtures/seed-format2.json')
  await expect(page.getByTestId('import-preview')).toBeVisible()
  await page.getByTestId('confirm-import').click()
  await expect(page.getByText('Dane przywrócone z kopii')).toBeVisible()

  await page.goto('./')
  await expect(page.getByTestId('next-type')).toHaveText('Trening B')
  await expect(page.getByTestId('resume-card')).toHaveCount(0)

  await page.goto('./#/history')
  await expect(page.getByTestId('session-list').getByText('anulowany')).toBeVisible()

  // A cancelled session never opens as an active workout.
  await page.goto('./#/workout/fmt2-cancelled')
  await expect(page.getByTestId('workout-summary')).toBeVisible()
  await expect(page.getByTestId('save-set')).toHaveCount(0)

  const { json } = await exportViaUi(page)
  expect((json as unknown as { schemaVersion: number }).schemaVersion).toBe(2)
  const sessions = json.data.sessions as { id: string; status: string; planAdvance?: boolean }[]
  expect(sessions.find((s) => s.id === 'fmt2-cancelled')!.status).toBe('cancelled')
  expect(sessions.find((s) => s.id === 'fmt2-partial')!.planAdvance).toBe(false)
  expect(errors).toEqual([])
})
