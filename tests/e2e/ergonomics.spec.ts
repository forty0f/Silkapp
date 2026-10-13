import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import { expectNoHorizontalOverflow, importSeed, trackConsole } from './helpers'

/**
 * Is the element fully inside the viewport and actually hit by a tap at its centre
 * (i.e. not hidden under the sticky header, the action bar or the rest timer)?
 */
async function reachable(page: Page, testId: string): Promise<{ inView: boolean; hit: boolean }> {
  return page.getByTestId(testId).first().evaluate((el) => {
    const r = el.getBoundingClientRect()
    const inView = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { inView, hit: !!top && (top === el || el.contains(top)) }
  })
}

async function expectReachable(page: Page, testId: string, label: string) {
  expect(await reachable(page, testId), `${testId} reachable without scrolling (${label})`).toEqual({ inView: true, hit: true })
}

async function startSeeded(page: Page) {
  await importSeed(page)
  await page.goto('./')
  await page.getByTestId('start-workout').click()
  await expect(page.getByTestId('save-set')).toBeVisible()
  await expect(page.getByTestId('input-weight')).not.toHaveValue('')
}

test('weight, reps and save are reachable without scrolling — timer off and on', async ({ page }) => {
  const errors = trackConsole(page)
  await startSeeded(page)
  await expect(page.getByTestId('rest-timer')).toHaveCount(0)
  for (const id of ['input-weight', 'input-reps', 'save-set', 'next-exercise']) await expectReachable(page, id, 'timer off')

  await page.getByTestId('input-reps').fill('10')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('rest-timer')).toBeVisible()
  await expect(page.getByTestId('set-label')).toHaveText(/Seria 2/)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  for (const id of ['input-weight', 'input-reps', 'save-set', 'rest-timer']) await expectReachable(page, id, 'timer on')
  await expectNoHorizontalOverflow(page, 'workout with timer')
  expect(errors).toEqual([])
})

test('every exercise: load and reps/time fields reachable without scrolling while the timer runs', async ({ page }) => {
  await startSeeded(page)
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('rest-timer')).toBeVisible()
  for (let i = 0; i < 6; i++) {
    await page.getByRole('button', { name: new RegExp(`^${i + 1}\\. `) }).click()
    await expect(page.getByTestId('set-label')).toBeVisible()
    for (const id of ['input-weight', 'input-reps', 'input-reps-left', 'input-reps-right', 'input-duration']) {
      if ((await page.getByTestId(id).count()) === 0) continue
      await expectReachable(page, id, `exercise ${i + 1}`)
    }
    await expectReachable(page, 'save-set', `exercise ${i + 1}`)
  }
})

test('no interactive control stays hidden behind the sticky bars (timer on)', async ({ page }) => {
  await startSeeded(page)
  await page.getByTestId('input-reps').fill('10')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('rest-timer')).toBeVisible()
  const hidden = await page.evaluate(async () => {
    const out: string[] = []
    const scope = document.querySelectorAll('[data-testid=exercise-card] button, [data-testid=exercise-card] input, [data-testid=set-list] button')
    for (const el of Array.from(scope) as HTMLElement[]) {
      el.scrollIntoView({ block: 'center' })
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      if (!top || !(top === el || el.contains(top))) out.push(el.getAttribute('aria-label') ?? el.getAttribute('data-testid') ?? el.textContent ?? '?')
    }
    return out
  })
  expect(hidden).toEqual([])
})

test('RIR is optional: saving without rating stores an unrated set', async ({ page }) => {
  await startSeeded(page)
  await expect(page.locator('[role=radio][aria-checked=true]')).toHaveCount(0)
  await page.getByTestId('input-reps').fill('9')
  await page.getByTestId('save-set').click()
  const row = page.getByTestId('set-row').first()
  await expect(row).toContainText('× 9')
  await expect(row).not.toContainText('RIR')
})

test('switching exercises with the action bar arrows, skip and edit', async ({ page }) => {
  const errors = trackConsole(page)
  await startSeeded(page)
  await expect(page.getByTestId('prev-exercise')).toBeDisabled()
  const first = await page.getByTestId('exercise-name').textContent()
  const second = (await page.getByRole('button', { name: /^2\. / }).getAttribute('aria-label'))!.replace(/^2\. /, '').replace(/, \d+ z \d+ serii$/, '')
  await expect(page.getByTestId('next-exercise')).toHaveAttribute('aria-label', `Następne ćwiczenie: ${second}`)
  await page.getByTestId('next-exercise').click()
  await expect(page.getByTestId('exercise-name')).toHaveText(second)
  await expect(page.getByRole('button', { name: /^2\. / })).toHaveAttribute('aria-current', 'step')
  await page.getByTestId('skip-set').click()
  await expect(page.getByTestId('set-row').first()).toContainText('pominięta')
  await page.getByTestId('set-row').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Zamknij' }).click()
  await page.getByTestId('prev-exercise').click()
  await expect(page.getByTestId('exercise-name')).toHaveText(first!)
  for (let i = 0; i < 5; i++) await page.getByTestId('next-exercise').click()
  await expect(page.getByTestId('next-exercise')).toBeDisabled()
  expect(errors).toEqual([])
})

test('open keyboard: focused fields stay visible above the action bar', async ({ page }) => {
  await startSeeded(page)
  await page.getByTestId('input-reps').fill('10')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('rest-timer')).toBeVisible()
  // Approximate the iOS software keyboard by shrinking the layout viewport (~45 %).
  const vp = page.viewportSize()!
  await page.setViewportSize({ width: vp.width, height: Math.round(vp.height * 0.55) })
  for (const id of ['input-weight', 'input-reps']) {
    await page.getByTestId(id).focus()
    await page.waitForTimeout(450)
    const r = await reachable(page, id)
    expect(r, `${id} visible with keyboard open`).toEqual({ inView: true, hit: true })
  }
  await expectReachable(page, 'save-set', 'keyboard open')
})

test('very long exercise names do not push the form off-screen or overflow', async ({ page }) => {
  await startSeeded(page)
  const id = new URL(page.url()).hash.split('/').pop()!
  await page.evaluate(async (sid) => {
    const req = indexedDB.open('silkapp')
    const dbh: IDBDatabase = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result)
      req.onerror = () => rej(req.error)
    })
    const tx = dbh.transaction('sessions', 'readwrite')
    const store = tx.objectStore('sessions')
    const get = store.get(sid)
    await new Promise((r) => (get.onsuccess = r))
    const s = get.result
    s.exercises[0].name = 'Przysiad goblet z bardzo długą nazwą ćwiczenia, która zajmuje kilka linii na wąskim ekranie telefonu'
    s.exercises[1].name = 'Wyciskanieeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    store.put(s)
    await new Promise((r) => (tx.oncomplete = r))
    dbh.close()
  }, id)
  await page.reload()
  for (const i of [0, 1]) {
    await page.getByRole('button', { name: new RegExp(`^${i + 1}\\. `) }).click()
    await expect(page.getByTestId('set-label')).toBeVisible()
    await expectNoHorizontalOverflow(page, `long name ${i + 1}`)
    for (const t of ['input-weight', 'save-set']) await expectReachable(page, t, `long name ${i + 1}`)
    const h = await page.getByTestId('exercise-name').evaluate((el) => el.getBoundingClientRect().height)
    expect(h, 'name is clamped to two lines').toBeLessThanOrEqual(2 * 24 + 4)
  }
})

test('returning from background keeps the timer and the form', async ({ page }) => {
  await page.clock.install()
  await startSeeded(page)
  await page.getByTestId('input-reps').fill('10')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('rest-timer')).toBeVisible()
  await page.getByTestId('input-reps').fill('8')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.fastForward('10:30')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByTestId('rest-remaining')).toHaveText(/^\+/)
  await expect(page.getByTestId('input-reps')).toHaveValue('8')
  await expectReachable(page, 'save-set', 'after background')
})

test('no transient horizontal overflow while switching exercises with the timer running', async ({ page }) => {
  await startSeeded(page)
  await page.getByTestId('input-reps').fill('10')
  await page.getByTestId('save-set').click()
  await expect(page.getByTestId('rest-timer')).toBeVisible()
  const max = await page.evaluate(async () => {
    const samples: number[] = []
    const sample = () => samples.push(document.documentElement.scrollWidth - document.documentElement.clientWidth)
    const obs = new MutationObserver(sample)
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    for (let i = 0; i < 5; i++) {
      ;(document.querySelector('[data-testid=next-exercise]') as HTMLButtonElement).click()
      await new Promise((r) => setTimeout(r, 120))
    }
    obs.disconnect()
    sample()
    return Math.max(...samples)
  })
  expect(max).toBeLessThanOrEqual(0)
})

test('home: start is reachable and week info appears once', async ({ page }) => {
  await importSeed(page)
  await page.goto('./')
  await expectReachable(page, 'start-workout', 'home')
  const weekMentions = await page.locator('main').evaluate((el) => (el.textContent ?? '').match(/[Tt]ydzień \d/g)?.length ?? 0)
  expect(weekMentions).toBe(1)
  await expectNoHorizontalOverflow(page, 'home')
})
