import { describe, expect, it } from 'vitest'
import { createDefaultPlan } from '../../domain/plan'
import { buildSessionExercises } from '../../domain/schedule'
import { perf, set } from '../../test/factories'
import { formatSetValue, normalizeDraft, prefillDraft, validateDraft } from './setDraft'

const plan = createDefaultPlan('p', '2026-10-01T00:00:00Z')
const exA = buildSessionExercises(plan, 'A', { week: 2, phase: 'adaptation' })
const squat = exA[0]
const row = exA[2]
const plank = exA[5]
const rir = { min: 3, max: 3 }

describe('prefillDraft', () => {
  it('first ever set: preferred weight, bottom of range, target RIR', () => {
    const d = prefillDraft({ ex: squat, type: 'working', sessionSets: [], last: null, preferredWeight: null, targetRir: rir })
    expect(d).toMatchObject({ weightKg: null, reps: 8, rir: 3, techniqueOk: true })
  })
  it('uses last session reps for the matching set and the preferred (accepted) weight', () => {
    const last = perf([set({ reps: 11 }), set({ reps: 10 })])
    const d = prefillDraft({ ex: squat, type: 'working', sessionSets: [], last, preferredWeight: 18, targetRir: rir })
    expect(d).toMatchObject({ weightKg: 18, reps: 11 })
  })
  it('copies the previous set of today', () => {
    const today = [set({ sessionId: 'x', weightKg: 20, reps: 9, rir: 2 })]
    const d = prefillDraft({ ex: squat, type: 'working', sessionSets: today, last: null, preferredWeight: 16, targetRir: rir })
    expect(d).toMatchObject({ weightKg: 20, reps: 9, rir: 2 })
  })
  it('warm-up suggests ~50% of the working load and no RIR', () => {
    const d = prefillDraft({ ex: squat, type: 'warmup', sessionSets: [], last: null, preferredWeight: 20, targetRir: rir })
    expect(d).toMatchObject({ weightKg: 10, reps: 8, rir: null })
  })
  it('unilateral and timed exercises use their own fields', () => {
    expect(prefillDraft({ ex: row, type: 'working', sessionSets: [], last: null, preferredWeight: 16, targetRir: rir })).toMatchObject({ reps: null, repsLeft: 8, repsRight: 8 })
    expect(prefillDraft({ ex: plank, type: 'working', sessionSets: [], last: null, preferredWeight: null, targetRir: rir })).toMatchObject({ weightKg: null, durationSec: 30, rir: null })
  })
})

describe('validate / normalize', () => {
  const base = prefillDraft({ ex: squat, type: 'working', sessionSets: [], last: null, preferredWeight: 16, targetRir: rir })
  it('requires weight for loaded exercises and both sides for unilateral', () => {
    expect(validateDraft(squat, { ...base, weightKg: null })).toMatch(/ciężar/)
    expect(validateDraft(squat, base)).toBeNull()
    expect(validateDraft(row, { ...base, repsLeft: 10, repsRight: null })).toMatch(/lewej i prawej/)
    expect(validateDraft(plank, { ...base, durationSec: 0 })).toMatch(/czas/)
  })
  it('skipped sets need no values and are stored empty', () => {
    expect(validateDraft(squat, { ...base, status: 'skipped', weightKg: null })).toBeNull()
    expect(normalizeDraft(squat, { ...base, status: 'skipped' })).toMatchObject({ weightKg: null, reps: null, rir: null })
  })
  it('formats values unambiguously', () => {
    expect(formatSetValue({ status: 'done', weightKg: 16.5, reps: 10, repsLeft: null, repsRight: null, durationSec: null }, squat)).toBe('16,5 kg × 10')
    expect(formatSetValue({ status: 'done', weightKg: 16, reps: null, repsLeft: 10, repsRight: 9, durationSec: null }, row)).toBe('16 kg × L 10 / P 9')
    expect(formatSetValue({ status: 'done', weightKg: null, reps: null, repsLeft: null, repsRight: null, durationSec: 45 }, plank)).toBe('45 s')
  })
})
