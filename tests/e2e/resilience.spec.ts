import { expect, test } from '@playwright/test'
import { exportViaUi, importSeed, trackConsole } from './helpers'

test('closing the app mid-workout keeps logged sets, the rest timer and the unsaved form (incl. decimal comma)', async ({ context, page }) => {
  await page.goto('./')
  await page.getByTestId('start-workout').click()
  await page.getByTestId('input-weight').fill('16')
  await page.getByTestId('input-reps').fill('10')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('rest-timer')).toBeVisible()

  // Type the next set character by character, as on the iOS decimal keypad, without saving.
  const weight = page.getByTestId('input-weight')
  await weight.click()
  await weight.pressSequentially('13,5')
  await expect(weight).toHaveValue('13,5')
  await page.getByTestId('input-reps').fill('9')

  // "Close" the app: the page goes away entirely, a new one is opened later.
  await page.close()
  const again = await context.newPage()
  await again.goto('./')
  await expect(again.getByTestId('resume-card')).toBeVisible()
  await again.getByTestId('resume-workout').click()
  await expect(again.getByTestId('set-row')).toHaveCount(1)
  await expect(again.getByTestId('rest-timer')).toBeVisible()
  await expect(again.getByTestId('input-weight')).toHaveValue('13,5')
  await expect(again.getByTestId('input-reps')).toHaveValue('9')
  await again.getByTestId('save-set').click()
  // Second planned set (week 1) completes the exercise → moves on to the next one.
  await expect(again.getByTestId('exercise-name')).toHaveText('Wyciskanie hantli na płasko')
  await again.getByRole('button', { name: /^1\. Przysiad goblet/ }).click()
  await expect(again.getByTestId('set-row').nth(1)).toContainText('13,5 kg × 9')

  // The draft was cleared after saving — the extra-set form shows the normal prefill.
  await again.reload()
  await expect(again.getByTestId('set-label')).toHaveText('Seria dodatkowa 3')
  await expect(again.getByTestId('input-weight')).toHaveValue('13,5')
  await expect(again.getByTestId('input-reps')).toHaveValue('9')
})

test('backup restores the full history on another device (separate browser profile)', async ({ browser, page }) => {
  await importSeed(page)
  // add an unfinished workout on the "phone"
  await page.goto('./')
  await page.getByTestId('start-workout').click()
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('set-row')).toHaveCount(1)
  const { path, json } = await exportViaUi(page)
  expect(json.data.sessions).toHaveLength(12)

  const other = await browser.newContext() // empty storage = another device
  const p2 = await other.newPage()
  const errors = trackConsole(p2)
  await p2.goto('./')
  await expect(p2.getByTestId('completed-count')).toHaveText('0')
  await p2.goto('./#/settings')
  await p2.getByTestId('import-file').setInputFiles(path)
  await expect(p2.getByTestId('import-preview')).toContainText('Treningi: 11 ukończonych (12 łącznie)')
  await p2.getByTestId('confirm-import').click()
  await expect(p2.getByText('Dane przywrócone z kopii')).toBeVisible()

  await p2.goto('./')
  await expect(p2.getByTestId('completed-count')).toHaveText('11')
  await p2.getByTestId('resume-workout').click()
  await expect(p2.getByTestId('set-row')).toHaveCount(1)
  await p2.goto('./#/progress')
  await p2.getByRole('tab', { name: 'Ciało' }).click()
  await expect(p2.getByText('Masa ciała (kg)', { exact: false }).first()).toBeVisible()

  // Re-export from the second device equals the original data.
  const { json: again } = await exportViaUi(p2)
  for (const k of ['plans', 'programs', 'sessions', 'sets', 'bodyMetrics', 'suggestions'] as const) {
    const sort = (a: unknown[]) => [...(a as { id: string }[])].sort((x, y) => x.id.localeCompare(y.id))
    expect(sort(again.data[k]), k).toEqual(sort(json.data[k]))
  }
  expect(errors).toEqual([])
  await other.close()
})

test('editing a historical set updates the dependent suggestion in the UI', async ({ page }) => {
  await importSeed(page)
  await page.goto('./#/history')
  // newest session is A (7 Oct) — find a session with a pending suggestion and break it
  await page.getByTestId('session-list').locator('button').first().click()
  const cards = page.getByTestId('detail-exercise')
  const withSug = cards.filter({ has: page.getByTestId('suggestion') })
  await expect(withSug.first()).toBeVisible() // the seed's newest session carries suggestions
  const name = (await withSug.first().locator('.font-semibold').first().textContent())!
  const card = cards.filter({ hasText: name })
  await card.getByTestId('detail-set').last().click()
  const reps = page.getByRole('dialog').getByTestId('input-reps')
  if (await reps.count()) await reps.fill('3')
  else await page.getByRole('dialog').getByTestId('input-reps-left').fill('3')
  await page.getByTestId('save-edit').click()
  await expect(page.getByRole('status').filter({ hasText: 'wycofana' })).toBeVisible()
  await expect(card.getByTestId('suggestion')).toHaveCount(0)
})

test('active-workout controls meet touch-target sizes', async ({ page }, info) => {
  await importSeed(page)
  await page.goto('./')
  await page.getByTestId('start-workout').click()
  await page.getByTestId('save-set').click() // shows the rest timer controls too
  const small = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ label: b.getAttribute('aria-label') ?? b.textContent?.trim().slice(0, 24), r: b.getBoundingClientRect() }))
      .filter(({ r }) => r.height < 44 || r.width < 40)
      .map(({ label, r }) => `${label} ${Math.round(r.width)}x${Math.round(r.height)}`),
  )
  expect(small, `small targets on ${info.project.name}`).toEqual([])
})

test('RIR starts unassessed for every set (target is shown, not pre-selected)', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('start-workout').click()
  const checked = page.locator('[role="radiogroup"][aria-label="RIR"] [aria-checked="true"]')
  await expect(checked).toHaveCount(0)
  await page.getByTestId('input-weight').fill('16')
  await page.getByTestId('rir-3').click()
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('set-row')).toContainText('RIR 3')
  // Next set: RIR from the previous set is not carried over.
  await expect(checked).toHaveCount(0)
  await page.getByTestId('save-set').click() // saving without RIR is allowed ("nieoceniony")
  await page.getByRole('button', { name: /^1\. Przysiad goblet/ }).click()
  await expect(page.getByTestId('set-row').nth(1)).not.toContainText('RIR')
})

test('switching exercises keeps each unsaved form', async ({ page }) => {
  await page.goto('./')
  await page.getByTestId('start-workout').click()
  await page.getByTestId('input-weight').fill('14')
  await page.getByTestId('input-reps').fill('11')
  await page.getByTestId('rir-2').click()

  await page.getByRole('button', { name: /^2\. Wyciskanie hantli na płasko/ }).click()
  await expect(page.getByTestId('exercise-name')).toHaveText('Wyciskanie hantli na płasko')
  await page.getByTestId('input-weight').fill('12')
  await page.getByTestId('input-reps').fill('9')

  await page.getByRole('button', { name: /^1\. Przysiad goblet/ }).click()
  await expect(page.getByTestId('input-weight')).toHaveValue('14')
  await expect(page.getByTestId('input-reps')).toHaveValue('11')
  await expect(page.getByTestId('rir-2')).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('button', { name: /^2\. Wyciskanie hantli na płasko/ }).click()
  await expect(page.getByTestId('input-weight')).toHaveValue('12')
  await expect(page.getByTestId('input-reps')).toHaveValue('9')

  // Survives a reload too.
  await page.reload()
  await expect(page.getByTestId('input-weight')).toHaveValue('12')
})
