import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import {
  decideSuggestion,
  deleteSet,
  deleteSession,
  ensureInitialized,
  finishSession,
  getInProgressSession,
  getNextSessionInfo,
  lastPerformance,
  preferredWeight,
  saveSet,
  savePlanVersion,
  setsForSession,
  startSession,
  type SetInput,
} from './repo'
import { buildExport, restoreFromPayload, restoreSnapshot, validateImport } from './backup'
import type { Session } from '../domain/types'

async function reset() {
  await db.delete()
  await db.open()
  await ensureInitialized()
}

function working(session: Session, exerciseIndex: number, p: Partial<SetInput> = {}): SetInput {
  const ex = session.exercises[exerciseIndex]
  return {
    sessionId: session.id,
    exerciseId: ex.exerciseId,
    type: 'working',
    isExtra: false,
    status: 'done',
    weightKg: ex.loaded ? 16 : null,
    reps: ex.unit === 'reps' && !ex.perSide ? ex.repMax : null,
    repsLeft: ex.perSide ? ex.repMax : null,
    repsRight: ex.perSide ? ex.repMax : null,
    durationSec: ex.unit === 'seconds' ? ex.repMax : null,
    rir: 4,
    techniqueOk: true,
    note: '',
    ...p,
  }
}

/** Logs every planned set of a session at the top of the range. */
async function completeFull(session: Session, p: Partial<SetInput> = {}) {
  for (let i = 0; i < session.exercises.length; i++) {
    for (let k = 0; k < session.exercises[i].plannedSets; k++) await saveSet(working(session, i, p))
  }
  return finishSession(session.id)
}

beforeEach(reset)

describe('initialization', () => {
  it('creates a default plan, active program and settings once', async () => {
    await ensureInitialized()
    expect(await db.plans.count()).toBe(1)
    expect(await db.programs.count()).toBe(1)
    expect(await db.settings.count()).toBe(1)
  })
})

describe('session lifecycle', () => {
  it('starts week 1 session 1 with workout A and T1 set counts', async () => {
    const s = await startSession()
    expect(s.workoutType).toBe('A')
    expect([s.week, s.slot, s.phase]).toEqual([1, 1, 'adaptation'])
    expect(s.targetRir).toEqual({ min: 4, max: 4 })
    expect(s.exercises.every((e) => e.plannedSets === 2)).toBe(true)
  })

  it('never creates two sessions in progress — resumes the existing one', async () => {
    const a = await startSession()
    const b = await startSession('B')
    expect(b.id).toBe(a.id)
    expect(await db.sessions.count()).toBe(1)
  })

  it('persists sets immediately and survives a "reload" (new DB connection)', async () => {
    const s = await startSession()
    await saveSet(working(s, 0), { restTimer: { exerciseId: 'goblet-squat', startedAt: 1000, durationSec: 120 } })
    db.close()
    await db.open()
    const resumed = await getInProgressSession()
    expect(resumed?.id).toBe(s.id)
    expect(resumed?.restTimer?.durationSec).toBe(120)
    expect(await setsForSession(s.id)).toHaveLength(1)
  })

  it('numbers sets, edits in place and renumbers after delete', async () => {
    const s = await startSession()
    const a = await saveSet(working(s, 0))
    const b = await saveSet(working(s, 0, { reps: 10 }))
    const w = await saveSet(working(s, 0, { type: 'warmup', reps: 8, weightKg: 8 }))
    expect([a.setNumber, b.setNumber, w.setNumber]).toEqual([1, 2, 1])
    await saveSet({ ...b, reps: 11 })
    expect((await db.sets.get(b.id))?.reps).toBe(11)
    await deleteSet(a.id)
    expect((await db.sets.get(b.id))?.setNumber).toBe(1)
  })

  it('follows A/B alternation and week progression over 13 sessions, then continuation', async () => {
    const seen: string[] = []
    for (let i = 0; i < 13; i++) {
      const s = await startSession()
      seen.push(`${s.week}${s.workoutType}${s.exercises[0].plannedSets}`)
      await completeFull(s)
    }
    expect(seen.slice(0, 12)).toEqual(['1A2', '1B2', '1A2', '2B3', '2A3', '2B3', '3A3', '3B3', '3A3', '4B3', '4A3', '4B3'])
    const info = await getNextSessionInfo()
    expect(info?.completedCount).toBe(13)
    const s14 = await startSession()
    expect(s14.phase).toBe('continuation')
    expect(s14.targetRir).toEqual({ min: 1, max: 2 })
    expect(s14.exercises.map((e) => e.plannedSets)).toEqual([3, 3, 3, 3, 3, 3])
  })

  it('manual override of the workout type keeps the rotation consistent', async () => {
    const s = await startSession('B')
    await completeFull(s)
    expect((await getNextSessionInfo())?.type).toBe('A')
  })

  it('deleting an unfinished session removes its sets', async () => {
    const s = await startSession()
    await saveSet(working(s, 0))
    await deleteSession(s.id)
    expect(await db.sets.count()).toBe(0)
    expect(await getInProgressSession()).toBeUndefined()
  })
})

describe('progression suggestions', () => {
  it('creates pending suggestions only, never changing loads automatically', async () => {
    const s = await startSession()
    const created = await completeFull(s)
    // plank is bodyweight → no load suggestion; the other 5 exercises qualify
    expect(created.map((c) => c.exerciseId)).not.toContain('plank')
    expect(created).toHaveLength(5)
    expect(created.every((c) => c.status === 'pending' && c.toWeightKg === 18)).toBe(true)
    const last = await lastPerformance('goblet-squat')
    expect(await preferredWeight('goblet-squat', last)).toBe(16)
  })

  it('accepted suggestion becomes the prefilled weight; rejected keeps the old one', async () => {
    const s = await startSession()
    const created = await completeFull(s)
    const squat = created.find((c) => c.exerciseId === 'goblet-squat')!
    const press = created.find((c) => c.exerciseId === 'flat-db-press')!
    await decideSuggestion(squat.id, true)
    await decideSuggestion(press.id, false)
    expect(await preferredWeight('goblet-squat', await lastPerformance('goblet-squat'))).toBe(18)
    expect(await preferredWeight('flat-db-press', await lastPerformance('flat-db-press'))).toBe(16)
  })

  it('no suggestion when RIR is below the week target', async () => {
    const s = await startSession()
    const created = await completeFull(s, { rir: 1 })
    expect(created).toHaveLength(0)
  })
})

describe('plan versions', () => {
  it('editing the plan creates a new version; old sessions keep their snapshot', async () => {
    const s1 = await startSession()
    await completeFull(s1)
    const info = await getNextSessionInfo()
    const edited = structuredClone(info!.plan)
    edited.workouts.B[0].setsByWeek = [4, 4, 4, 4]
    edited.workouts.A[0].repMax = 15
    const v2 = await savePlanVersion(edited)
    expect(v2.version).toBe(2)
    const s2 = await startSession()
    expect(s2.planVersion).toBe(2)
    expect(s2.exercises[0].plannedSets).toBe(4)
    const old = await db.sessions.get(s1.id)
    expect(old?.planVersion).toBe(1)
    expect(old?.exercises[0].repMax).toBe(12)
  })
})

describe('backup', () => {
  it('round-trips the full history through export → validate → restore', async () => {
    const s = await startSession()
    await completeFull(s)
    await db.bodyMetrics.add({ id: 'bm1', date: '2026-10-10', weightKg: 88.4, waistCm: 96, note: '', createdAt: s.startedAt, updatedAt: s.startedAt, deletedAt: null })
    const payload = await buildExport()
    const json = JSON.stringify(payload)
    const res = validateImport(json)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.summary.completedSessions).toBe(1)

    await reset()
    expect(await db.sessions.count()).toBe(0)
    await restoreFromPayload(res.payload)
    expect(await db.sessions.count()).toBe(1)
    expect(await db.sets.count()).toBe(payload.data.sets.length)
    expect((await db.bodyMetrics.get('bm1'))?.weightKg).toBe(88.4)
    expect(await db.programs.where('status').equals('active').count()).toBe(1)
  })

  it('keeps an undo snapshot of the data replaced by an import', async () => {
    const s = await startSession()
    await completeFull(s)
    const empty = JSON.stringify({ ...(await buildExport()), data: { ...(await buildExport()).data, sessions: [], sets: [], suggestions: [] } })
    const res = validateImport(empty)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    await restoreFromPayload(res.payload)
    expect(await db.sessions.count()).toBe(0)
    const snap = (await db.snapshots.toArray())[0]
    await restoreSnapshot(snap.id)
    expect(await db.sessions.count()).toBe(1)
  })

  it('rejects invalid files with readable errors', () => {
    expect(validateImport('not json')).toEqual({ ok: false, errors: ['Plik nie jest poprawnym JSON-em.'] })
    const wrongApp = validateImport(JSON.stringify({ app: 'other' }))
    expect(wrongApp.ok).toBe(false)
    const future = validateImport(JSON.stringify({ app: 'silkapp', schemaVersion: 999 }))
    expect(future.ok === false && future.errors[0]).toMatch(/nowszej wersji/)
    const broken = validateImport(JSON.stringify({ app: 'silkapp', schemaVersion: 1, exportedAt: '2026-10-10T00:00:00Z', data: { plans: [{}] } }))
    expect(broken.ok).toBe(false)
  })

  it('detects referential problems (orphan sets)', async () => {
    const s = await startSession()
    await saveSet(working(s, 0))
    const p = await buildExport()
    p.data.sessions = []
    const res = validateImport(JSON.stringify(p))
    expect(res.ok === false && res.errors.join(' ')).toMatch(/nieistniejących sesji/)
  })
})
