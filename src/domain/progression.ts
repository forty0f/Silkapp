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

/**
 * first        — no earlier performance
 * improved     — same load; more reps (or same reps with clearly more reserve) and effort not clearly higher
 * same         — same load and reps; no clear change in effort
 * declined     — same load; fewer reps (or same reps with clearly less reserve) and effort not clearly lower
 * load-changed — top load differs; reported neutrally (load, reps and RIR shown separately)
 * unclear      — results not comparable (reps and effort moved in opposite directions, or RIR not rated)
 */
export type Trend = 'first' | 'improved' | 'same' | 'declined' | 'load-changed' | 'unclear'

export interface Comparison {
  trend: Trend
  detail: string
}

/** "Clearly" = average RIR change of at least one rep per compared set (RIR is an estimate). */
const RIR_CLEAR_CHANGE = 1

const fmtList = (vals: (number | string | null)[]) => vals.map((v) => (v == null ? '?' : String(v).replace('.', ','))).join('·')

function repsLabel(s: SetEntry, ex: Pick<SessionExercise, 'unit' | 'perSide'>): string {
  if (ex.unit === 'seconds') return `${s.durationSec ?? '?'}s`
  if (ex.perSide) return `${s.repsLeft ?? '?'}/${s.repsRight ?? '?'}`
  return `${s.reps ?? '?'}`
}

/**
 * Compares two performances of the same exercise without building any
 * composite "strength score": load, reps and RIR are judged separately and
 * only like-for-like sets (same top load, same set positions) are compared.
 * Adding sets (T1→T4 volume ramp) never registers as a strength gain.
 */
export function comparePerformances(curr: ExercisePerformance, prev: ExercisePerformance | null): Comparison {
  if (!prev) return { trend: 'first', detail: 'Pierwsza sesja tego ćwiczenia.' }
  const ex = curr.exercise
  const a = doneWorkingSets(curr.sets)
  const b = doneWorkingSets(prev.sets)
  if (a.length === 0 || b.length === 0) return { trend: 'unclear', detail: 'Brak porównywalnych serii.' }

  const reps = (arr: SetEntry[]) => fmtList(arr.map((s) => repsLabel(s, ex)))
  const rirs = (arr: SetEntry[]) => fmtList(arr.map((s) => s.rir))

  if (ex.loaded) {
    const wa = Math.max(...a.map((s) => s.weightKg ?? 0))
    const wb = Math.max(...b.map((s) => s.weightKg ?? 0))
    if (wa !== wb) {
      return {
        trend: 'load-changed',
        detail: `Ciężar ${fmtKg(wb)} → ${fmtKg(wa)} · powt. ${reps(b)} → ${reps(a)} · RIR ${rirs(b)} → ${rirs(a)}`,
      }
    }
  }

  const n = Math.min(a.length, b.length)
  const ca = a.slice(0, n)
  const cb = b.slice(0, n)
  const sum = (arr: SetEntry[]) => arr.reduce((acc, s) => acc + (setValue(s, ex) ?? 0), 0)
  const dReps = sum(ca) - sum(cb)
  const loadTxt = ex.loaded ? `${fmtKg(Math.max(...a.map((s) => s.weightKg ?? 0)))} · ` : ''
  const base = `${loadTxt}${ex.unit === 'seconds' ? 'czas' : 'powt.'} ${reps(cb)} → ${reps(ca)}`

  if (ex.unit === 'seconds') {
    // Timed holds have no RIR; seconds are directly comparable.
    if (dReps > 0) return { trend: 'improved', detail: `${base} (+${dReps} s)` }
    if (dReps < 0) return { trend: 'declined', detail: `${base} (${dReps} s)` }
    return { trend: 'same', detail: base }
  }

  const rirRated = [...ca, ...cb].every((s) => s.rir != null)
  const rirTxt = ` · RIR ${rirs(cb)} → ${rirs(ca)}`
  if (!rirRated) {
    if (dReps === 0) return { trend: 'same', detail: `${base}${rirTxt} — RIR nieoceniony, wysiłku nie porównano` }
    return { trend: 'unclear', detail: `${base}${rirTxt} — bez oceny RIR nie da się stwierdzić zmiany siły` }
  }
  const dRirAvg = (ca.reduce((x, s) => x + s.rir!, 0) - cb.reduce((x, s) => x + s.rir!, 0)) / n
  const lessReserve = dRirAvg <= -RIR_CLEAR_CHANGE
  const moreReserve = dRirAvg >= RIR_CLEAR_CHANGE
  if (dReps > 0) {
    return lessReserve
      ? { trend: 'unclear', detail: `${base}${rirTxt} — więcej powtórzeń przy wyraźnie mniejszym zapasie; nieporównywalne` }
      : { trend: 'improved', detail: `${base}${rirTxt}` }
  }
  if (dReps < 0) {
    return moreReserve
      ? { trend: 'unclear', detail: `${base}${rirTxt} — mniej powtórzeń przy wyraźnie większym zapasie; nieporównywalne` }
      : { trend: 'declined', detail: `${base}${rirTxt}` }
  }
  if (moreReserve) return { trend: 'improved', detail: `${base}${rirTxt} — te same powtórzenia z większym zapasem` }
  if (lessReserve) return { trend: 'declined', detail: `${base}${rirTxt} — te same powtórzenia z mniejszym zapasem` }
  return { trend: 'same', detail: `${base}${rirTxt}` }
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
