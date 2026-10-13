import type { RirTarget, SessionExercise, SetEntry } from './types'

/**
 * Performance of one exercise in one session — the unit the progression
 * engine reasons about.
 */
export interface ExercisePerformance {
  sessionId: string
  date: string // ISO
  exercise: Pick<SessionExercise, 'exerciseId' | 'repMin' | 'repMax' | 'unit' | 'perSide' | 'plannedSets' | 'loaded'>
  targetRir: RirTarget
  sets: SetEntry[]
}

export type EvaluationStatus =
  | 'increase' // every required set at the top of the range with adequate RIR → propose +step
  | 'unify' // as above but loads differed between sets → propose using the heaviest load for all sets
  | 'bodyweight-top' // timed/bodyweight exercise at the top of the range → propose a harder variant
  | 'hold' // keep the load and chase reps
  | 'below-range' // most sets below the bottom of the range
  | 'incomplete' // not all required working sets were performed

export interface Evaluation {
  status: EvaluationStatus
  reasons: string[]
  workingWeightKg: number | null
  suggestedWeightKg: number | null
}

/** Working sets that were actually performed, in order. */
export function doneWorkingSets(sets: SetEntry[]): SetEntry[] {
  return sets
    .filter((s) => s.type === 'working' && s.status === 'done' && !s.deletedAt)
    .sort((a, b) => a.setNumber - b.setNumber)
}

/**
 * Reps (or seconds) that count for a set. For unilateral exercises the weaker
 * side decides — a set only reaches the top of the range when both sides do.
 */
export function setValue(set: SetEntry, ex: Pick<SessionExercise, 'unit' | 'perSide'>): number | null {
  if (ex.unit === 'seconds') return set.durationSec
  if (ex.perSide) {
    if (set.repsLeft == null || set.repsRight == null) return null
    return Math.min(set.repsLeft, set.repsRight)
  }
  return set.reps
}

/** Total reps of a set (both sides summed for unilateral work). */
export function setTotalReps(set: SetEntry, ex: Pick<SessionExercise, 'unit' | 'perSide'>): number {
  if (ex.unit === 'seconds') return 0
  if (ex.perSide) return (set.repsLeft ?? 0) + (set.repsRight ?? 0)
  return set.reps ?? 0
}

export function roundToStep(value: number, step = 0.25): number {
  return Math.round(value / step) * step
}

export function evaluatePerformance(perf: ExercisePerformance, weightStepKg: number): Evaluation {
  const { exercise: ex, targetRir } = perf
  const required = ex.plannedSets
  const planned = doneWorkingSets(perf.sets).filter((s) => !s.isExtra)
  const counted = planned.slice(0, required)
  const weights = counted.map((s) => s.weightKg).filter((w): w is number => w != null)
  const maxWeight = weights.length ? Math.max(...weights) : null
  const minWeight = weights.length ? Math.min(...weights) : null
  const unitLabel = ex.unit === 'seconds' ? 's' : 'powt.'

  if (counted.length < required) {
    return {
      status: 'incomplete',
      reasons: [`Wykonano ${counted.length} z ${required} wymaganych serii roboczych — brak podstaw do zmiany ciężaru.`],
      workingWeightKg: maxWeight,
      suggestedWeightKg: null,
    }
  }

  const values = counted.map((s) => setValue(s, ex))
  const missingValue = values.some((v) => v == null)
  const atTop = values.every((v) => v != null && v >= ex.repMax)
  const belowCount = values.filter((v) => v != null && v < ex.repMin).length
  const missingRir = ex.loaded && counted.some((s) => s.rir == null)
  const rirTooLow = counted.filter((s) => s.rir != null && s.rir < targetRir.min)
  const techniqueIssues = counted.filter((s) => !s.techniqueOk)

  const reasons: string[] = []
  if (missingValue) reasons.push('Część serii nie ma zapisanych powtórzeń.')

  if (atTop && !missingValue) {
    if (techniqueIssues.length > 0) {
      reasons.push(`Górny zakres osiągnięty, ale ${techniqueIssues.length} ${plural(techniqueIssues.length, 'seria', 'serie', 'serii')} oznaczono jako niepoprawne technicznie — utrzymaj ciężar.`)
      return { status: 'hold', reasons, workingWeightKg: maxWeight, suggestedWeightKg: null }
    }
    if (!ex.loaded) {
      reasons.push(`Wszystkie serie osiągnęły ${ex.repMax} ${unitLabel}. Rozważ trudniejszy wariant lub dłuższy czas — bez automatycznej zmiany.`)
      return { status: 'bodyweight-top', reasons, workingWeightKg: null, suggestedWeightKg: null }
    }
    if (missingRir) {
      reasons.push('Górny zakres osiągnięty, ale nie we wszystkich seriach zapisano RIR — uzupełnij RIR, aby ocenić gotowość do zwiększenia ciężaru.')
      return { status: 'hold', reasons, workingWeightKg: maxWeight, suggestedWeightKg: null }
    }
    if (rirTooLow.length > 0) {
      reasons.push(`Górny zakres osiągnięty, ale RIR w ${rirTooLow.length} ${plural(rirTooLow.length, 'serii', 'seriach', 'seriach')} był niższy niż zalecany (${targetRir.min}+). Utrzymaj ciężar i powtórz.`)
      return { status: 'hold', reasons, workingWeightKg: maxWeight, suggestedWeightKg: null }
    }
    if (maxWeight == null || minWeight == null) {
      reasons.push('Brak zapisanego ciężaru — nie można zaproponować zmiany.')
      return { status: 'hold', reasons, workingWeightKg: null, suggestedWeightKg: null }
    }
    if (maxWeight !== minWeight) {
      reasons.push(`Wszystkie serie w górnym zakresie, ale z różnym ciężarem (${fmtKg(minWeight)}–${fmtKg(maxWeight)}). Proponowane: wszystkie serie z ${fmtKg(maxWeight)}.`)
      return { status: 'unify', reasons, workingWeightKg: minWeight, suggestedWeightKg: maxWeight }
    }
    const next = roundToStep(maxWeight + weightStepKg)
    reasons.push(`Wszystkie ${required} serie: ${ex.repMax}+ ${unitLabel} przy RIR ≥ ${targetRir.min} i poprawnej technice.`)
    return { status: 'increase', reasons, workingWeightKg: maxWeight, suggestedWeightKg: next }
  }

  if (belowCount > counted.length / 2) {
    reasons.push(`${belowCount} z ${counted.length} serii poniżej dolnej granicy (${ex.repMin} ${unitLabel}). Utrzymaj ciężar lub rozważ jego zmniejszenie.`)
    return { status: 'below-range', reasons, workingWeightKg: maxWeight, suggestedWeightKg: null }
  }

  const remaining = values.filter((v) => v == null || v < ex.repMax).length
  reasons.push(`W zakresie. Utrzymaj ciężar i dąż do ${ex.repMax} ${unitLabel} we wszystkich seriach (brakuje w ${remaining}).`)
  return { status: 'hold', reasons, workingWeightKg: maxWeight, suggestedWeightKg: null }
}

export type Trend = 'first' | 'improved' | 'same' | 'declined' | 'heavier' | 'lighter'

export interface Comparison {
  trend: Trend
  detail: string
}

/**
 * Strength comparison between two performances of the same exercise.
 * Only sets present in both sessions are compared, so adding sets (T1→T4
 * volume ramp) never registers as a strength gain.
 */
export function comparePerformances(curr: ExercisePerformance, prev: ExercisePerformance | null): Comparison {
  if (!prev) return { trend: 'first', detail: 'Pierwsza sesja tego ćwiczenia.' }
  const ex = curr.exercise
  const a = doneWorkingSets(curr.sets)
  const b = doneWorkingSets(prev.sets)
  if (a.length === 0 || b.length === 0) return { trend: 'first', detail: 'Brak porównywalnych serii.' }

  if (ex.loaded) {
    const wa = Math.max(...a.map((s) => s.weightKg ?? 0))
    const wb = Math.max(...b.map((s) => s.weightKg ?? 0))
    if (wa > wb) {
      const ok = a.filter((s) => (s.weightKg ?? 0) === wa).every((s) => (setValue(s, ex) ?? 0) >= ex.repMin)
      return ok
        ? { trend: 'improved', detail: `Większy ciężar: ${fmtKg(wb)} → ${fmtKg(wa)}.` }
        : { trend: 'heavier', detail: `Większy ciężar (${fmtKg(wa)}), ale część serii poniżej zakresu.` }
    }
    if (wa < wb) return { trend: 'lighter', detail: `Mniejszy ciężar: ${fmtKg(wb)} → ${fmtKg(wa)}.` }
  }

  const n = Math.min(a.length, b.length)
  const sum = (arr: SetEntry[]) => arr.slice(0, n).reduce((acc, s) => acc + (setValue(s, ex) ?? 0), 0)
  const sa = sum(a)
  const sb = sum(b)
  const unit = ex.unit === 'seconds' ? 's' : 'powt.'
  if (sa > sb) return { trend: 'improved', detail: `+${sa - sb} ${unit} w ${n} porównywalnych seriach.` }
  if (sa < sb) return { trend: 'declined', detail: `${sa - sb} ${unit} w ${n} porównywalnych seriach.` }
  return { trend: 'same', detail: `Bez zmian w ${n} porównywalnych seriach.` }
}

export function fmtKg(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${Number.isInteger(v) ? v : v.toFixed(2).replace(/0$/, '').replace('.', ',')} kg`
}

function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one
  const d = n % 10
  const t = n % 100
  if (d >= 2 && d <= 4 && (t < 12 || t > 14)) return few
  return many
}
