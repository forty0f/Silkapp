// Three session outcomes (cancelled / partial / full), the explicit plan choice
// for partial sessions, schedule vs performed work, and the progression basis.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import {
  canChangePlanChoice,
  ensureInitialized,
  finishSession,
  getNextSessionInfo,
  PlanChoiceRequiredError,
  saveSet,
  setPlanChoice,
  setsForSession,
  startSession,
  type SetInput,
} from '../db/repo'
import { isPerformedSession, plannedProgress, sessionOutcome } from '../domain/metrics'
import type { Session } from '../domain/types'

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureInitialized()
})

const base = (s: Session, i: number, p: Partial<SetInput> = {}): SetInput => {
  const ex = s.exercises[i]
  return {
    sessionId: s.id,
    exerciseId: ex.exerciseId,
    type: 'working',
    isExtra: false,
    status: 'done',
    weightKg: ex.loaded ? 16 : null,
    reps: ex.unit === 'reps' && !ex.perSide ? ex.repMax : null,
    repsLeft: ex.perSide ? ex.repMax : null,
    repsRight: ex.perSide ? ex.repMax : null,
    durationSec: ex.unit === 'seconds' ? 45 : null,
    rir: 4,
    techniqueOk: true,
    note: '',
    ...p,
  }
}

/** Logs every planned working set of every exercise. */
async function doAll(s: Session) {
  for (let i = 0; i < s.exercises.length; i++) for (let k = 0; k < s.exercises[i].plannedSets; k++) await saveSet(base(s, i))
}

async function fullSession() {
  const s = await startSession()
  await doAll(s)
  await finishSession(s.id)
  return s
}

describe('outcome from the logged sets (no percentage threshold)', () => {
  it('cancelled: no performed working set (warm-ups and skipped sets do not count)', async () => {
    const s = await startSession()
    await saveSet(base(s, 0, { type: 'warmup', rir: null }))
    await saveSet(base(s, 1, { status: 'skipped' }))
    expect(sessionOutcome(s, await setsForSession(s.id))).toBe('cancelled')
  })
  it('full: every planned working set performed (extra sets allowed)', async () => {
    const s = await startSession()
    await doAll(s)
    await saveSet(base(s, 0, { isExtra: true }))
    expect(sessionOutcome(s, await setsForSession(s.id))).toBe('full')
  })
  it('partial: a skipped planned set makes it partial even if an extra set was added', async () => {
    const s = await startSession()
    await doAll(s)
    const sets = await setsForSession(s.id)
    await saveSet({ ...sets.find((x) => x.exerciseId === s.exercises[2].exerciseId)!, status: 'skipped' })
    expect(sessionOutcome(s, await setsForSession(s.id))).toBe('partial')
    expect(plannedProgress(s, await setsForSession(s.id))).toEqual({ done: 11, planned: 12 }) // week 1: 6 × 2
  })
})

describe('finishing', () => {
  it('full session finishes without a question and advances the plan (no planAdvance stored)', async () => {
    const s = await fullSession()
    const stored = (await db.sessions.get(s.id))!
    expect(stored.status).toBe('completed')
    expect('planAdvance' in stored).toBe(false)
    expect((await getNextSessionInfo())!.type).toBe('B')
  })

  it('partial session cannot be finished without an explicit choice', async () => {
    const s = await startSession()
    await saveSet(base(s, 0))
    await expect(finishSession(s.id)).rejects.toBeInstanceOf(PlanChoiceRequiredError)
    expect((await db.sessions.get(s.id))!.status).toBe('in_progress') // nothing changed
  })

  it('partial + "advance": next workout follows the plan', async () => {
    const s = await startSession()
    await saveSet(base(s, 0))
    await finishSession(s.id, 'advance')
    expect((await db.sessions.get(s.id))!.planAdvance).toBe(true)
    const info = (await getNextSessionInfo())!
    expect(info.type).toBe('B')
    expect(info.position).toMatchObject({ week: 1, slot: 2 })
  })

  it('partial + "repeat": next workout is the same type, week, slot, planned sets and RIR', async () => {
    const s = await startSession()
    await saveSet(base(s, 0))
    await finishSession(s.id, 'repeat')
    const info = (await getNextSessionInfo())!
    expect(info.type).toBe('A')
    expect(info.position).toMatchObject({ week: 1, slot: 1 })
    const again = await startSession()
    expect(again.workoutType).toBe('A')
    expect(again.week).toBe(1)
    expect(again.slot).toBe(1)
    expect(again.exercises.map((e) => e.plannedSets)).toEqual(s.exercises.map((e) => e.plannedSets))
    expect(again.targetRir).toEqual(s.targetRir)
  })

  it('repeat extends adaptation by one session; the repeated session still counts as performed work', async () => {
    const s = await startSession()
    await saveSet(base(s, 0))
    await finishSession(s.id, 'repeat')
    expect((await getNextSessionInfo())!.completedCount).toBe(0) // schedule progress
    expect(isPerformedSession((await db.sessions.get(s.id))!, await setsForSession(s.id))).toBe(true) // statistics
  })

  it('cancelled session ignores any choice', async () => {
    const s = await startSession()
    await finishSession(s.id, 'advance')
    const stored = (await db.sessions.get(s.id))!
    expect(stored.status).toBe('cancelled')
    expect(stored.planAdvance).toBeUndefined()
    expect((await getNextSessionInfo())!.type).toBe('A')
  })

  it('finishing twice is harmless', async () => {
    const s = await fullSession()
    await expect(finishSession(s.id)).resolves.toBeDefined()
  })
})

describe('changing the choice later', () => {
  it('allowed for the newest partial session only', async () => {
    const s = await startSession()
    await saveSet(base(s, 0))
    await finishSession(s.id, 'repeat')
    expect(await canChangePlanChoice((await db.sessions.get(s.id))!)).toBe(true)
    await setPlanChoice(s.id, 'advance')
    expect((await getNextSessionInfo())!.type).toBe('B')
    await fullSession() // a newer session exists now
    expect(await canChangePlanChoice((await db.sessions.get(s.id))!)).toBe(false)
    await expect(setPlanChoice(s.id, 'repeat')).rejects.toThrow()
  })
  it('not offered for a full session', async () => {
    const s = await fullSession()
    expect(await canChangePlanChoice((await db.sessions.get(s.id))!)).toBe(false)
  })
})

describe('legacy data: schedule progress separated from performed work', () => {
  it('an empty session stored as completed by an older version keeps moving the plan but is not performed work', async () => {
    const s = await startSession()
    await db.sessions.update(s.id, { status: 'completed', finishedAt: new Date().toISOString() })
    const info = (await getNextSessionInfo())!
    expect(info.completedCount).toBe(1)
    expect(info.type).toBe('B')
    expect(isPerformedSession((await db.sessions.get(s.id))!, [])).toBe(false)
  })
  it('a partial session from an older version (no planAdvance) keeps advancing', async () => {
    const s = await startSession()
    await saveSet(base(s, 0))
    await db.sessions.update(s.id, { status: 'completed', finishedAt: new Date().toISOString() })
    expect((await getNextSessionInfo())!.type).toBe('B')
  })
})

describe('progression basis (per exercise)', () => {
  const pending = (exerciseId: string) => db.suggestions.where('exerciseId').equals(exerciseId).filter((x) => x.status === 'pending').toArray()

  it('a partially done exercise never cancels an earlier proposal', async () => {
    const first = await fullSession() // all sets at the top of the range, RIR 4 → proposals
    const squat = first.exercises[0].exerciseId
    expect(await pending(squat)).toHaveLength(1)
    await fullSession() // B
    const s = await startSession() // A again
    await saveSet(base(s, 0, { reps: 6 })) // 1 of 2 planned squat sets, below range
    await finishSession(s.id, 'advance')
    const p = await pending(squat)
    expect(p).toHaveLength(1)
    expect(p[0].sourceSessionId).toBe(first.id)
  })

  it('an exercise with all planned sets done in a partial session counts for progression', async () => {
    await fullSession()
    await fullSession()
    const s = await startSession() // A, week 1 slot 3
    const squat = s.exercises[0]
    for (let k = 0; k < squat.plannedSets; k++) await saveSet(base(s, 0, { weightKg: 18 }))
    await finishSession(s.id, 'repeat')
    const p = await pending(squat.exerciseId)
    expect(p).toHaveLength(1)
    expect(p[0].sourceSessionId).toBe(s.id)
    expect(p[0].fromWeightKg).toBe(18)
  })

  it('a complete exercise below the range still replaces an older proposal (it is a valid basis)', async () => {
    const first = await fullSession()
    const squat = first.exercises[0].exerciseId
    await fullSession()
    const s = await startSession()
    for (let k = 0; k < s.exercises[0].plannedSets; k++) await saveSet(base(s, 0, { reps: 6 }))
    await finishSession(s.id, 'advance')
    expect(await pending(squat)).toHaveLength(0)
  })
})
