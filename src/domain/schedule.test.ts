import { describe, expect, it } from 'vitest'
import { EXERCISES, EXERCISE_IDS } from './exercises'
import { createDefaultPlan } from './plan'
import { buildSessionExercises, nextWorkoutType, plannedSetsFor, positionFor, targetRirFor, weekPattern } from './schedule'
import type { ExerciseId, WorkoutType } from './types'

const plan = createDefaultPlan('p1', '2026-10-01T00:00:00.000Z')

describe('plan definition', () => {
  it('contains all 12 exercises exactly once, 6 per workout, in the prescribed order', () => {
    expect(plan.workouts.A.map((e) => e.exerciseId)).toEqual([
      'goblet-squat', 'flat-db-press', 'one-arm-row', 'romanian-deadlift', 'lateral-raise', 'plank',
    ])
    expect(plan.workouts.B.map((e) => e.exerciseId)).toEqual([
      'incline-db-press', 'reverse-lunge', 'chest-supported-row', 'db-overhead-press', 'db-hip-thrust', 'db-biceps-curl',
    ])
    const all = [...plan.workouts.A, ...plan.workouts.B].map((e) => e.exerciseId)
    expect(new Set(all).size).toBe(12)
    expect([...all].sort()).toEqual([...EXERCISE_IDS].sort())
  })

  const expected: Record<ExerciseId, { range: [number, number]; sets: number[]; perSide?: boolean; seconds?: boolean }> = {
    'goblet-squat': { range: [8, 12], sets: [2, 3, 3, 3] },
    'flat-db-press': { range: [8, 12], sets: [2, 3, 3, 3] },
    'one-arm-row': { range: [8, 12], sets: [2, 3, 3, 3], perSide: true },
    'romanian-deadlift': { range: [8, 12], sets: [2, 2, 3, 3] },
    'lateral-raise': { range: [12, 15], sets: [2, 2, 2, 3] },
    plank: { range: [30, 60], sets: [2, 2, 3, 3], seconds: true },
    'incline-db-press': { range: [8, 12], sets: [2, 3, 3, 3] },
    'reverse-lunge': { range: [8, 12], sets: [2, 3, 3, 3], perSide: true },
    'chest-supported-row': { range: [8, 12], sets: [2, 3, 3, 3] },
    'db-overhead-press': { range: [8, 12], sets: [2, 2, 3, 3] },
    'db-hip-thrust': { range: [10, 15], sets: [2, 2, 3, 3] },
    'db-biceps-curl': { range: [10, 15], sets: [2, 2, 2, 3] },
  }

  for (const id of EXERCISE_IDS) {
    it(`${EXERCISES[id].name}: range, T1–T4 sets, side/time handling`, () => {
      const e = [...plan.workouts.A, ...plan.workouts.B].find((x) => x.exerciseId === id)!
      const exp = expected[id]
      expect([e.repMin, e.repMax]).toEqual(exp.range)
      for (let w = 1; w <= 4; w++) expect(plannedSetsFor(e, { week: w, phase: 'adaptation' })).toBe(exp.sets[w - 1])
      expect(plannedSetsFor(e, { week: 5, phase: 'continuation' })).toBe(exp.sets[3])
      expect(e.perSide).toBe(!!exp.perSide)
      expect(e.unit).toBe(exp.seconds ? 'seconds' : 'reps')
      expect(EXERCISES[id].workout).toBe(plan.workouts.A.includes(e) ? 'A' : 'B')
    })
  }
})

describe('schedule', () => {
  it('produces A/B/A, B/A/B, A/B/A, B/A/B for the 4 adaptation weeks', () => {
    const types: WorkoutType[] = []
    let last: WorkoutType | null = null
    for (let i = 0; i < 12; i++) {
      last = nextWorkoutType(last)
      types.push(last)
    }
    const weeks = [0, 1, 2, 3].map((w) => types.slice(w * 3, w * 3 + 3).join('/'))
    expect(weeks).toEqual(['A/B/A', 'B/A/B', 'A/B/A', 'B/A/B'])
    expect(weeks).toEqual([1, 2, 3, 4].map((w) => weekPattern(w).join('/')))
  })

  it('maps completed-session count to week/slot/phase', () => {
    expect(positionFor(0, 4)).toEqual({ sessionNumber: 1, week: 1, slot: 1, phase: 'adaptation' })
    expect(positionFor(2, 4)).toMatchObject({ week: 1, slot: 3 })
    expect(positionFor(3, 4)).toMatchObject({ week: 2, slot: 1 })
    expect(positionFor(11, 4)).toMatchObject({ week: 4, slot: 3, phase: 'adaptation' })
    expect(positionFor(12, 4)).toMatchObject({ sessionNumber: 13, week: 5, slot: 1, phase: 'continuation' })
  })

  it('weekly RIR targets: 4, 3, 2–3, 1–2, then 1–2', () => {
    expect([1, 2, 3, 4].map((w) => targetRirFor(plan, { week: w, phase: 'adaptation' }))).toEqual([
      { min: 4, max: 4 }, { min: 3, max: 3 }, { min: 2, max: 3 }, { min: 1, max: 2 },
    ])
    expect(targetRirFor(plan, { week: 9, phase: 'continuation' })).toEqual({ min: 1, max: 2 })
  })

  it('builds a session snapshot with planned sets for the week', () => {
    const w1 = buildSessionExercises(plan, 'A', { week: 1, phase: 'adaptation' })
    expect(w1.map((e) => e.plannedSets)).toEqual([2, 2, 2, 2, 2, 2])
    const w4 = buildSessionExercises(plan, 'B', { week: 4, phase: 'adaptation' })
    expect(w4.map((e) => e.plannedSets)).toEqual([3, 3, 3, 3, 3, 3])
    const w2 = buildSessionExercises(plan, 'A', { week: 2, phase: 'adaptation' })
    expect(w2.map((e) => e.plannedSets)).toEqual([3, 3, 3, 2, 2, 2])
    expect(w2.map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('the snapshot is decoupled from the plan (history keeps its version)', () => {
    const snap = buildSessionExercises(plan, 'A', { week: 1, phase: 'adaptation' })
    plan.workouts.A[0].repMax = 99
    expect(snap[0].repMax).toBe(12)
    plan.workouts.A[0].repMax = 12
  })
})
