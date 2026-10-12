import type { PlanExercise, PlanVersion, RirTarget, WorkoutType } from './types'

export const DEFAULT_PLAN_NAME = 'FBW A/B — powrót do treningu'

const ex = (
  exerciseId: PlanExercise['exerciseId'],
  repMin: number,
  repMax: number,
  setsByWeek: [number, number, number, number],
  restSec: number,
  opts: Partial<Pick<PlanExercise, 'unit' | 'perSide' | 'loaded'>> = {},
): PlanExercise => ({
  exerciseId,
  repMin,
  repMax,
  unit: opts.unit ?? 'reps',
  perSide: opts.perSide ?? false,
  loaded: opts.loaded ?? true,
  setsByWeek,
  continuationSets: setsByWeek[3],
  restSec,
})

export const DEFAULT_WORKOUTS: Record<WorkoutType, PlanExercise[]> = {
  A: [
    ex('goblet-squat', 8, 12, [2, 3, 3, 3], 120),
    ex('flat-db-press', 8, 12, [2, 3, 3, 3], 120),
    ex('one-arm-row', 8, 12, [2, 3, 3, 3], 90, { perSide: true }),
    ex('romanian-deadlift', 8, 12, [2, 2, 3, 3], 120),
    ex('lateral-raise', 12, 15, [2, 2, 2, 3], 60),
    ex('plank', 30, 60, [2, 2, 3, 3], 60, { unit: 'seconds', loaded: false }),
  ],
  B: [
    ex('incline-db-press', 8, 12, [2, 3, 3, 3], 120),
    ex('reverse-lunge', 8, 12, [2, 3, 3, 3], 90, { perSide: true }),
    ex('chest-supported-row', 8, 12, [2, 3, 3, 3], 90),
    ex('db-overhead-press', 8, 12, [2, 2, 3, 3], 90),
    ex('db-hip-thrust', 10, 15, [2, 2, 3, 3], 90),
    ex('db-biceps-curl', 10, 15, [2, 2, 2, 3], 60),
  ],
}

export const DEFAULT_RIR_BY_WEEK: RirTarget[] = [
  { min: 4, max: 4 },
  { min: 3, max: 3 },
  { min: 2, max: 3 },
  { min: 1, max: 2 },
]

export const DEFAULT_CONTINUATION_RIR: RirTarget = { min: 1, max: 2 }

export function createDefaultPlan(id: string, nowIso: string): PlanVersion {
  return {
    id,
    version: 1,
    name: DEFAULT_PLAN_NAME,
    note: 'Plan startowy: 4 tygodnie adaptacji, następnie kontynuacja z docelową liczbą serii.',
    adaptationWeeks: 4,
    rirByWeek: DEFAULT_RIR_BY_WEEK.map((r) => ({ ...r })),
    continuationRir: { ...DEFAULT_CONTINUATION_RIR },
    workouts: {
      A: DEFAULT_WORKOUTS.A.map((e) => ({ ...e, setsByWeek: [...e.setsByWeek] as PlanExercise['setsByWeek'] })),
      B: DEFAULT_WORKOUTS.B.map((e) => ({ ...e, setsByWeek: [...e.setsByWeek] as PlanExercise['setsByWeek'] })),
    },
    createdAt: nowIso,
    updatedAt: nowIso,
    deletedAt: null,
  }
}

export function formatRir(r: RirTarget): string {
  return r.min === r.max ? `${r.min}` : `${r.min}–${r.max}`
}

export function formatRange(e: Pick<PlanExercise, 'repMin' | 'repMax' | 'unit' | 'perSide'>): string {
  if (e.unit === 'seconds') return `${e.repMin}–${e.repMax} s`
  return `${e.repMin}–${e.repMax} powt.${e.perSide ? ' / stronę' : ''}`
}

export function formatRest(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s} s`
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')} min`
}
