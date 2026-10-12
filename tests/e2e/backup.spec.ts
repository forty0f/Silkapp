import { expect, test } from '@playwright/test'
import { exportViaUi, importSeed } from './helpers'

test('import seed → history, progression suggestion prefill, export round-trip, undo import', async ({ page }) => {
  await importSeed(page)
  await page.goto('./')
  await expect(page.getByTestId('completed-count')).toHaveText('11')
  // 11 done → week 4, session 3; last was A → next is B
  await expect(page.getByTestId('next-type')).toHaveText('Trening B')
  await expect(page.getByTestId('target-rir')).toHaveText('1–2')

  await page.goto('./#/history')
  await expect(page.getByTestId('session-list').locator('li')).toHaveCount(11)

  // Export: file must be valid and contain the same history
  const { json: exported } = await exportViaUi(page)
  expect(exported.app).toBe('silkapp')
  expect(exported.data.sessions).toHaveLength(11)
  await expect(page.getByTestId('last-export')).not.toHaveText('nigdy')

  // Undo the import → back to the empty state
  await page.getByRole('button', { name: 'Przywróć' }).first().click()
  await page.getByTestId('confirm-ok').click()
  await expect(page.getByText('Przywrócono dane sprzed importu')).toBeVisible()
  await page.goto('./')
  await expect(page.getByTestId('completed-count')).toHaveText('0')
})

test('invalid import is rejected and data is untouched', async ({ page }) => {
  await page.goto('./#/settings')
  await page.getByTestId('import-file').setInputFiles({ name: 'zly.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"silkapp","schemaVersion":1,"data":{}}') })
  await expect(page.getByTestId('import-errors')).toContainText('Import odrzucony')
  await page.getByTestId('import-file').setInputFiles({ name: 'tekst.json', mimeType: 'application/json', buffer: Buffer.from('to nie json') })
  await expect(page.getByTestId('import-errors')).toContainText('nie jest poprawnym JSON')
  await page.goto('./')
  await expect(page.getByTestId('next-type')).toHaveText('Trening A')
})
