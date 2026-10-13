// Stage 1 regression tests for the findings confirmed by the 2026-10-13 audit
// (D1–D10). Every expected number below was calculated by hand.
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import {
  deleteSet,
  ensureInitialized,
  finishSession,
  getNextSessionInfo,
  reopenSession,
  saveSet,
  saveSetDetailed,
  setsForSession,
  startSession,
  type SetInput,
} from '../db/repo'
import { activeDurationMs, exerciseHistory, exercisePoint, isPerformedSession, PAUSE_GAP_MS, sessionVolume, setLoadVolume, weeklySummaries } from '../domain/metrics'
import { comparePerformances, evaluatePerformance } from '../domain/progression'
import { hasMaxDecimals, validateDraft } from '../features/workout/setDraft'
import { perf, set } from './factories'
import type { Session, SessionExercise } from '../domain/types'

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
    reps: ex.unit === 'reps' && !ex.perSide ? 12 : null,
    repsLeft: ex.perSide ? 12 : null,
    repsRight: ex.perSide ? 12 : null,
    durationSec: ex.unit === 'seconds' ? 45 : null,
    rir: 4,
    techniqueOk: true,
    note: '',
    ...p,
  }
}

/** Completes `n` sessions, each with one performed working set. */
async function completeSessions(n: number) {
  for (let k = 0; k < n; k++) {
    const s = await startSession()
    await saveSet(base(s, 0))
    await finishSession(s.id, 'advance')
  }
}

describe('D4 empty / partial workouts', () => {
  it('a workout finished without any performed working set is cancelled and does not count', async () => {
    const s = await startSession()
    await finishSession(s.id, 'advance')
    expect((await db.sessions.get(s.id))!.status).toBe('cancelled')
    const info = (await getNextSessionInfo())!
    expect(info.completedCount).toBe(0)
    expect(info.type).toBe('A') // rotation unchanged
    expect(info.position).toMatchObject({ week: 1, slot: 1 }) // adaptation week unchanged
  })

  it('warm-ups or skipped sets alone do not make a workout count', async () => {
    const s = await startSession()
    await saveSet(base(s, 0, { type: 'warmup', rir: null }))
    await saveSet(base(s, 1, { status: 'skipped' }))
    await finishSession(s.id, 'advance')
    expect((await db.sessions.get(s.id))!.status).toBe('cancelled')
    expect((await getNextSessionInfo())!.completedCount).toBe(0)
  })

  it('partial completion with "advance": completed, performed work, plan moves on', async () => {
    const s = await startSession()
    await saveSet(base(s, 0))
    await finishSession(s.id, 'advance')
    expect((await db.sessions.get(s.id))!.status).toBe('completed')
    const info = (await getNextSessionInfo())!
    expect(info.completedCount).toBe(1)
    expect(info.type).toBe('B')
    expect(info.position).toMatchObject({ week: 1, slot: 2 })
  })

  it('a cancelled workout between real ones does not disturb A/B order', async () => {
    await completeSessions(1) // A
    const empty = await startSession() // B, abandoned
    expect(empty.workoutType).toBe('B')
    await finishSession(empty.id, 'advance')
    const next = await startSession()
    expect(next.workoutType).toBe('B')
    expect(next.slot).toBe(2)
  })

  it('a legacy "completed" session with no sets keeps its plan effect but is not performed work', async () => {
    const s = await startSession()
    await db.sessions.update(s.id, { status: 'completed', finishedAt: new Date().toISOString() })
    const info = (await getNextSessionInfo())!
    expect(info.completedCount).toBe(1) // schedule progress unchanged by the update
    expect(info.type).toBe('B')
    expect(isPerformedSession((await db.sessions.get(s.id))!, [])).toBe(false) // not shown as performed
  })

  it('reopening a cancelled workout and adding a set makes it count', async () => {
    const s = await startSession()
    await finishSession(s.id, 'advance')
    await reopenSession(s.id)
    await saveSet(base(s, 0))
    await finishSession(s.id, 'advance')
    expect((await db.sessions.get(s.id))!.status).toBe('completed')
    expect((await getNextSessionInfo())!.completedCount).toBe(1)
  })
})

describe('D3 extra-set flag after deleting / editing', () => {
  it('3 planned + 1 extra, delete planned #2 → the extra moves into the planned slot', async () => {
    await completeSessions(3) // week 1 done → week 2 (3 planned sets)
    const s = await startSession()
    const sq = s.exercises[0]
    expect(sq.plannedSets).toBe(3)
    await saveSet(base(s, 0, { reps: 12 }))
    const b = await saveSet(base(s, 0, { reps: 12 }))
    await saveSet(base(s, 0, { reps: 12 }))
    await saveSet(base(s, 0, { reps: 12, isExtra: true }))
    await deleteSet(b.id)
    const sets = (await setsForSession(s.id)).filter((x) => x.exerciseId === sq.exerciseId).sort((x, y) => x.setNumber - y.setNumber)
    expect(sets.map((x) => [x.setNumber, x.isExtra])).toEqual([
      [1, false],
      [2, false],
      [3, false],
    ])
    const ev = evaluatePerformance({ sessionId: s.id, date: s.startedAt, exercise: sq, targetRir: s.targetRir, sets }, 2)
    expect(ev.status).toBe('increase')
  })

  it('suggestion of a completed session follows deletes: kept when the extra fills the slot, withdrawn when sets go missing', async () => {
    await completeSessions(3)
    const s = await startSession()
    const ids = []
    for (let k = 0; k < 3; k++) ids.push((await saveSet(base(s, 0, { reps: 12 }))).id)
    const extra = await saveSet(base(s, 0, { reps: 12, isExtra: true }))
    await finishSession(s.id, 'advance')
    const pending = () => db.suggestions.where('sourceSessionId').equals(s.id).filter((x) => x.exerciseId === s.exercises[0].exerciseId && x.status === 'pending').count()
    expect(await pending()).toBe(1)
    await deleteSet(ids[1]) // extra becomes planned #3 → still 3 at the top
    expect(await pending()).toBe(1)
    await deleteSet(extra.id) // only 2 of 3 planned left → no basis for an increase
    expect(await pending()).toBe(0)
  })

  it('editing a planned set of a completed session down below the range withdraws the suggestion', async () => {
    await completeSessions(3)
    const s = await startSession()
    const sets = []
    for (let k = 0; k < 3; k++) sets.push(await saveSet(base(s, 0, { reps: 12 })))
    await finishSession(s.id, 'advance')
    const { changes } = await saveSetDetailed({ ...sets[0], reps: 9 })
    expect(changes.some((c) => c.kind === 'withdrawn')).toBe(true)
  })
})

describe('D9 strength comparison respects RIR', () => {
  const cmp = (curr: Parameters<typeof set>[0][], prev: Parameters<typeof set>[0][]) => comparePerformances(perf(curr.map(set)), perf(prev.map(set))).trend
  it('more reps at much lower RIR is not an automatic gain', () => {
    expect(cmp([{ reps: 11, rir: 0 }], [{ reps: 10, rir: 3 }])).toBe('unclear')
  })
  it('more reps with RIR within 1 is a gain', () => {
    expect(cmp([{ reps: 11, rir: 2 }], [{ reps: 10, rir: 2 }])).toBe('improved')
    expect(cmp([{ reps: 11, rir: 2 }], [{ reps: 10, rir: 2.5 }])).toBe('improved')
  })
  it('same reps with clearly more / less reserve', () => {
    expect(cmp([{ reps: 10, rir: 3 }], [{ reps: 10, rir: 1 }])).toBe('improved')
    expect(cmp([{ reps: 10, rir: 1 }], [{ reps: 10, rir: 3 }])).toBe('declined')
  })
  it('fewer reps with clearly more reserve is not called a decline', () => {
    expect(cmp([{ reps: 9, rir: 4 }], [{ reps: 11, rir: 1 }])).toBe('unclear')
    expect(cmp([{ reps: 9, rir: 1 }], [{ reps: 11, rir: 1 }])).toBe('declined')
  })
  it('unrated RIR is never treated as a real value', () => {
    expect(cmp([{ reps: 12, rir: null }], [{ reps: 10, rir: 2 }])).toBe('unclear')
    expect(cmp([{ reps: 10, rir: null }], [{ reps: 10, rir: 2 }])).toBe('same')
    const c = comparePerformances(perf([set({ reps: 12, rir: null })]), perf([set({ reps: 10, rir: 2 })]))
    expect(c.detail).toContain('?') // shown as unknown, not as 0
  })
  it('different load → weight, reps and RIR shown separately, no strength verdict', () => {
    const c = comparePerformances(perf([set({ weightKg: 18, reps: 8, rir: 2 })]), perf([set({ weightKg: 16, reps: 12, rir: 2 })]))
    expect(c.trend).toBe('load-changed')
    expect(c.detail).toBe('Ciężar 16 kg → 18 kg · powt. 12 → 8 · RIR 2 → 2')
  })
  it('timed holds compare seconds directly', () => {
    const plank = { exerciseId: 'plank' as const, unit: 'seconds' as const, loaded: false }
    expect(comparePerformances(perf([set({ weightKg: null, reps: null, durationSec: 50, rir: null })], plank), perf([set({ weightKg: null, reps: null, durationSec: 45, rir: null })], plank)).trend).toBe('improved')
  })
})

describe('D1/D10 external-load volume (hand calculations)', () => {
  it('counts the number of dumbbells, both sides of unilateral work, and excludes plank and warm-ups', async () => {
    const s = await startSession() // workout A week 1: squat, flat press, one-arm row, RDL, lateral raise, plank
    await saveSet(base(s, 0, { type: 'warmup', weightKg: 8, reps: 8, rir: null })) // excluded
    await saveSet(base(s, 0, { reps: 12 })) // goblet: 1 DB → 16×12 = 192
    await saveSet(base(s, 0, { reps: 10 })) //                16×10 = 160
    await saveSet(base(s, 1, { reps: 12 })) // bench: 2 DB → 16×2×12 = 384
    await saveSet(base(s, 2, { repsLeft: 12, repsRight: 11 })) // row: 1 DB, both sides → 16×23 = 368
    await saveSet(base(s, 2, { weightKg: 18, repsLeft: 10, repsRight: 10 })) //            18×20 = 360
    await saveSet(base(s, 5, { durationSec: 45 })) // plank → 0
    const sets = await setsForSession(s.id)
    const v = sessionVolume(s, sets)
    expect(v.volumeKg).toBe(192 + 160 + 384 + 368 + 360) // 1464
    expect(v.reps).toBe(12 + 10 + 12 + 23 + 20) // 77
    expect(v.workingSets).toBe(6)
    expect(exercisePoint(s, s.exercises[1], sets)!.volumeKg).toBe(384)
    expect(exercisePoint(s, s.exercises[5], sets)!.volumeKg).toBe(0)
    const row = exercisePoint(s, s.exercises[2], sets)!
    expect(row.topWeightKg).toBe(18)
    expect(row.repsAtTop).toEqual([10])
  })

  it('reverse lunge: two dumbbells, both legs → 8 kg × 2 × (10 + 10) = 320 kg (body mass not included)', () => {
    const ex = { exerciseId: 'reverse-lunge', unit: 'reps', perSide: true } as Pick<SessionExercise, 'exerciseId' | 'unit' | 'perSide'>
    expect(setLoadVolume(set({ exerciseId: 'reverse-lunge', weightKg: 8, reps: null, repsLeft: 10, repsRight: 10 }), ex)).toBe(320)
  })

  it('hip thrust uses one dumbbell → 20 kg × 12 = 240 kg', () => {
    const ex = { exerciseId: 'db-hip-thrust', unit: 'reps', perSide: false } as Pick<SessionExercise, 'exerciseId' | 'unit' | 'perSide'>
    expect(setLoadVolume(set({ exerciseId: 'db-hip-thrust', weightKg: 20, reps: 12 }), ex)).toBe(240)
  })
})

describe('D5 active duration', () => {
  it('a reopened session does not count the overnight pause', async () => {
    const t0 = Date.parse('2026-10-10T17:00:00.000Z')
    const at = (min: number) => new Date(t0 + min * 60_000).toISOString()
    const s = { id: 's', status: 'completed', startedAt: at(0), finishedAt: at(24 * 60 + 10), deletedAt: null } as unknown as Session
    const sets = [set({ sessionId: 's', createdAt: at(5) }), set({ sessionId: "s", createdAt: at(30) }), set({ sessionId: 's', createdAt: at(24 * 60 + 5) })]
    // gaps: 5 + 25 + (pause, excluded) + 5 = 35 min
    expect(activeDurationMs(s, sets)! / 60_000).toBe(35)
  })

  it('normal uninterrupted session equals finish − start', () => {
    const s = { id: 's', status: 'completed', startedAt: '2026-10-10T17:00:00.000Z', finishedAt: '2026-10-10T17:50:00.000Z' } as unknown as Session
    const sets = [set({ sessionId: 's', createdAt: '2026-10-10T17:20:00.000Z' }), set({ sessionId: 's', createdAt: '2026-10-10T17:45:00.000Z' })]
    expect(activeDurationMs(s, sets)! / 60_000).toBe(50)
  })

  it('a gap of exactly 30 min still counts, longer does not', () => {
    const s = { id: 's', status: 'completed', startedAt: '2026-10-10T17:00:00.000Z', finishedAt: new Date(Date.parse('2026-10-10T17:00:00.000Z') + PAUSE_GAP_MS).toISOString() } as unknown as Session
    expect(activeDurationMs(s, [])).toBe(PAUSE_GAP_MS)
    const s2 = { ...s, finishedAt: new Date(Date.parse(s.startedAt) + PAUSE_GAP_MS + 1).toISOString() } as Session
    expect(activeDurationMs(s2, [])).toBe(0)
  })

  it('stored data is not modified — derived on read', async () => {
    const s = await startSession()
    await saveSet(base(s, 0))
    await finishSession(s.id, 'advance')
    const before = await db.sessions.get(s.id)
    activeDurationMs(before!, await setsForSession(s.id))
    expect(await db.sessions.get(s.id)).toEqual(before)
  })
})

describe('D6 input validation', () => {
  const d = { type: 'working' as const, status: 'done' as const, weightKg: 16, reps: 10, repsLeft: null, repsRight: null, durationSec: null, rir: null, techniqueOk: true, note: '' }
  const loaded = { exerciseId: 'goblet-squat', repMin: 8, repMax: 12, unit: 'reps', perSide: false, loaded: true, setsByWeek: [2, 3, 3, 3], continuationSets: 3, restSec: 120, name: 'x', order: 1, plannedSets: 3 } as unknown as SessionExercise
  const plank = { ...loaded, exerciseId: 'plank', unit: 'seconds', loaded: false } as unknown as SessionExercise
  it('rejects 0 kg and negative weight for a loaded exercise', () => {
    expect(validateDraft(loaded, { ...d, weightKg: 0 })).not.toBeNull()
    expect(validateDraft(loaded, { ...d, weightKg: -2 })).not.toBeNull()
  })
  it('allows any real dumbbell mass up to 0.01 kg — no forced 0.5 step', () => {
    for (const w of [12.5, 11.34, 2.27, 0.01, 300]) expect(validateDraft(loaded, { ...d, weightKg: w })).toBeNull()
    expect(validateDraft(loaded, { ...d, weightKg: 12.345 })).not.toBeNull()
    expect(validateDraft(loaded, { ...d, weightKg: 300.01 })).not.toBeNull()
  })
  it('rejects zero / negative reps and seconds', () => {
    expect(validateDraft(loaded, { ...d, reps: 0 })).not.toBeNull()
    expect(validateDraft(plank, { ...d, weightKg: null, reps: null, durationSec: 0 })).not.toBeNull()
  })
  it('unloaded exercise: weight is not required', () => {
    expect(validateDraft(plank, { ...d, weightKg: null, reps: null, durationSec: 45 })).toBeNull()
  })
  it('unrated RIR (null) is valid', () => {
    expect(validateDraft(loaded, { ...d, rir: null })).toBeNull()
  })
  it('hasMaxDecimals is tolerant to float noise', () => {
    expect(hasMaxDecimals(0.1 + 0.2, 2)).toBe(true)
    expect(hasMaxDecimals(92.5, 1)).toBe(true)
    expect(hasMaxDecimals(92.55, 1)).toBe(false)
  })
})

describe('D7 calendar weeks use local time (TZ=Europe/Warsaw)', () => {
  it('a Sunday 23:30 local session belongs to the week that started on Monday before it', () => {
    const sunLate = new Date(2026, 9, 11, 23, 30)
    const s = { id: 'x', status: 'completed', startedAt: sunLate.toISOString(), exercises: [], deletedAt: null } as unknown as Session
    expect(weeklySummaries([s], new Map([['x', [set({ sessionId: 'x' })]]]))[0].weekKey).toBe('2026-10-05')
  })
})

describe('history and summaries skip sessions that do not count', () => {
  it('exerciseHistory and weeklySummaries ignore cancelled sessions', async () => {
    await completeSessions(1)
    const empty = await startSession()
    await finishSession(empty.id, 'advance')
    const sessions = await db.sessions.toArray()
    const map = new Map<string, Awaited<ReturnType<typeof setsForSession>>>()
    for (const x of sessions) map.set(x.id, await setsForSession(x.id))
    expect(exerciseHistory('goblet-squat', sessions, map)).toHaveLength(1)
    expect(weeklySummaries(sessions, map).reduce((a, w) => a + w.sessions.length, 0)).toBe(1)
  })
})
