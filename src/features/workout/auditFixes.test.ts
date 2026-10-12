// Regression tests for the independent audit findings (#1, #2, #4).
import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultPlan } from '../../domain/plan'
import { buildSessionExercises } from '../../domain/schedule'
import { perf, set } from '../../test/factories'
import { clearDraft, loadDraft, storeDraft } from '../../lib/draftStore'
import { prefillDraft, validateDraft } from './setDraft'

const plan = createDefaultPlan('p', '2026-10-01T00:00:00Z')
const exA = buildSessionExercises(plan, 'A', { week: 3, phase: 'adaptation' })
const [squat, , row] = exA
const plank = exA[5]

describe('#1 RIR is never pre-assessed', () => {
  it('first set of an exercise starts with RIR not assessed (not the weekly target)', () => {
    expect(prefillDraft({ ex: squat, type: 'working', sessionSets: [], last: null, preferredWeight: 16 }).rir).toBeNull()
  })
  it('the next set does not inherit the previous set RIR', () => {
    const today = [set({ sessionId: 'x', rir: 3 })]
    expect(prefillDraft({ ex: squat, type: 'working', sessionSets: today, last: perf([set({ rir: 2 })]), preferredWeight: 16 }).rir).toBeNull()
  })
})

describe('#2 validateDraft', () => {
  const ok = { ...prefillDraft({ ex: squat, type: 'working', sessionSets: [], last: null, preferredWeight: 16 }), reps: 10 }
  it('reps must be positive integers', () => {
    expect(validateDraft(squat, ok)).toBeNull()
    expect(validateDraft(squat, { ...ok, reps: 0 })).not.toBeNull()
    expect(validateDraft(squat, { ...ok, reps: 10.5 })).not.toBeNull()
    expect(validateDraft(squat, { ...ok, reps: -3 })).not.toBeNull()
    expect(validateDraft(squat, { ...ok, reps: 201 })).not.toBeNull()
  })
  it('unilateral: both sides positive integers', () => {
    const d = { ...ok, reps: null, repsLeft: 10, repsRight: 10 }
    expect(validateDraft(row, d)).toBeNull()
    expect(validateDraft(row, { ...d, repsRight: 0 })).not.toBeNull()
    expect(validateDraft(row, { ...d, repsLeft: 9.5 })).not.toBeNull()
  })
  it('duration must be a positive integer', () => {
    const d = { ...ok, weightKg: null, reps: null, durationSec: 45 }
    expect(validateDraft(plank, d)).toBeNull()
    expect(validateDraft(plank, { ...d, durationSec: 30.5 })).not.toBeNull()
    expect(validateDraft(plank, { ...d, durationSec: 0 })).not.toBeNull()
  })
  it('RIR: not assessed or an integer in 0–10', () => {
    expect(validateDraft(squat, { ...ok, rir: null })).toBeNull()
    for (const r of [0, 3, 5, 10]) expect(validateDraft(squat, { ...ok, rir: r })).toBeNull()
    for (const r of [-1, 11, 2.5, Number.NaN]) expect(validateDraft(squat, { ...ok, rir: r })).not.toBeNull()
  })
})

describe('#4 drafts of different exercises do not overwrite each other', () => {
  beforeEach(() => {
    const mem = new Map<string, string>()
    globalThis.localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
      key: () => null,
      length: 0,
    } as Storage
  })
  it('keeps one draft per form key; clearing one keeps the others', () => {
    storeDraft('s|goblet-squat|working|2', { reps: 9 })
    storeDraft('s|flat-db-press|working|1', { reps: 7 })
    expect(loadDraft('s|goblet-squat|working|2')).toEqual({ reps: 9 })
    expect(loadDraft('s|flat-db-press|working|1')).toEqual({ reps: 7 })
    clearDraft('s|goblet-squat|working|2')
    expect(loadDraft('s|goblet-squat|working|2')).toBeNull()
    expect(loadDraft('s|flat-db-press|working|1')).toEqual({ reps: 7 })
    clearDraft()
    expect(loadDraft('s|flat-db-press|working|1')).toBeNull()
  })
})
