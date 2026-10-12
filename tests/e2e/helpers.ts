import { expect, type Page } from '@playwright/test'

export function trackConsole(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

export async function expectNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `horizontal overflow on ${label}`).toBeLessThanOrEqual(0)
}

export async function importSeed(page: Page) {
  await page.goto('./#/settings')
  await page.getByTestId('import-file').setInputFiles('tests/fixtures/seed.json')
  await expect(page.getByTestId('import-preview')).toBeVisible()
  await page.getByTestId('confirm-import').click()
  await expect(page.getByText('Dane przywrócone z kopii')).toBeVisible()
}

/** Two-step export (prepare → save) as on iOS; returns the parsed file and its path. */
export async function exportViaUi(page: Page): Promise<{ path: string; json: { app: string; data: Record<string, unknown[]> } }> {
  await page.goto('./#/settings')
  await page.getByTestId('export').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByTestId('deliver-export').click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^silkapp-kopia-\d{4}-\d{2}-\d{2}-\d{4}\.json$/)
  const path = (await download.path())!
  const { readFileSync } = await import('node:fs')
  return { path, json: JSON.parse(readFileSync(path, 'utf8')) }
}
