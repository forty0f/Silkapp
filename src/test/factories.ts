import type { SetEntry } from '../domain/types'
import type { ExercisePerformance } from '../domain/progression'

let n = 0
export function set(p: Partial<SetEntry> = {}): SetEntry {
  n++
  return {
    id: `set-${n}`,
    sessionId: 's1',
    exerciseId: 'goblet-squat',
    type: 'working',
    setNumber: n,
    isExtra: false,
    status: 'done',
    weightKg: 16,
    reps: 12,
    repsLeft: null,
    repsRight: null,
    durationSec: null,
    rir: 3,
    techniqueOk: true,
    note: '',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    deletedAt: null,
    ...p,
  }
}

export function perf(sets: SetEntry[], p: Partial<ExercisePerformance['exercise']> = {}, targetMin = 2): ExercisePerformance {
  return {
    sessionId: 's1',
    date: '2026-10-01T10:00:00.000Z',
    exercise: { exerciseId: 'goblet-squat', repMin: 8, repMax: 12, unit: 'reps', perSide: false, plannedSets: 3, loaded: true, ...p },
    targetRir: { min: targetMin, max: targetMin + 1 },
    sets: sets.map((s, i) => ({ ...s, setNumber: i + 1 })),
  }
}
