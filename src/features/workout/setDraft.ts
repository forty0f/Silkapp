import type { ExercisePerformance } from '../../domain/progression'
import type { RirTarget, SessionExercise, SetEntry, SetStatus, SetType } from '../../domain/types'

export interface SetDraft {
  type: SetType
  status: SetStatus
  weightKg: number | null
  reps: number | null
  repsLeft: number | null
  repsRight: number | null
  durationSec: number | null
  rir: number | null
  techniqueOk: boolean
  note: string
}

export function draftFromSet(s: SetEntry): SetDraft {
  return {
    type: s.type,
    status: s.status,
    weightKg: s.weightKg,
    reps: s.reps,
    repsLeft: s.repsLeft,
    repsRight: s.repsRight,
    durationSec: s.durationSec,
    rir: s.rir,
    techniqueOk: s.techniqueOk,
    note: s.note,
  }
}

const sorted = (sets: SetEntry[], type: SetType) => sets.filter((s) => s.type === type).sort((a, b) => a.setNumber - b.setNumber)

/**
 * Prefills the next set so a typical set needs one tap: same load as the
 * previous set today, otherwise the preferred load (accepted suggestion or
 * last session), and reps from the matching set of the last session.
 */
export function prefillDraft(args: {
  ex: SessionExercise
  type: SetType
  sessionSets: SetEntry[]
  last: ExercisePerformance | null
  preferredWeight: number | null
  targetRir: RirTarget
}): SetDraft {
  const { ex, type, sessionSets, last, preferredWeight, targetRir } = args
  const mine = sessionSets.filter((s) => s.exerciseId === ex.exerciseId)
  const base: SetDraft = { type, status: 'done', weightKg: null, reps: null, repsLeft: null, repsRight: null, durationSec: null, rir: null, techniqueOk: true, note: '' }

  if (type === 'warmup') {
    const prevW = sorted(mine, 'warmup').at(-1)
    const w = preferredWeight != null && ex.loaded ? Math.max(1, Math.round(preferredWeight * 0.5)) : null
    return {
      ...base,
      weightKg: ex.loaded ? (prevW?.weightKg ?? w) : null,
      reps: ex.unit === 'reps' && !ex.perSide ? (prevW?.reps ?? 8) : null,
      repsLeft: ex.perSide ? (prevW?.repsLeft ?? 8) : null,
      repsRight: ex.perSide ? (prevW?.repsRight ?? 8) : null,
      durationSec: ex.unit === 'seconds' ? (prevW?.durationSec ?? 20) : null,
    }
  }

  const done = sorted(mine, 'working').filter((s) => s.status === 'done')
  const prev = done.at(-1)
  const nextNumber = sorted(mine, 'working').length + 1
  const lastSets = last ? sorted(last.sets, 'working').filter((s) => s.status === 'done') : []
  const ref = prev ?? lastSets[nextNumber - 1] ?? lastSets.at(-1)

  return {
    ...base,
    weightKg: ex.loaded ? (prev?.weightKg ?? preferredWeight ?? null) : null,
    reps: ex.unit === 'reps' && !ex.perSide ? (ref?.reps ?? ex.repMin) : null,
    repsLeft: ex.perSide ? (ref?.repsLeft ?? ex.repMin) : null,
    repsRight: ex.perSide ? (ref?.repsRight ?? ex.repMin) : null,
    durationSec: ex.unit === 'seconds' ? (ref?.durationSec ?? ex.repMin) : null,
    rir: ex.unit === 'seconds' ? null : (prev?.rir ?? targetRir.max),
  }
}

export function validateDraft(ex: SessionExercise, d: SetDraft): string | null {
  if (d.status === 'skipped') return null
  const intOk = (v: number | null, max: number) => v != null && Number.isFinite(v) && v >= 0 && v <= max
  if (ex.loaded && d.weightKg == null) return 'Podaj ciężar (masa jednego hantla).'
  if (d.weightKg != null && (d.weightKg < 0 || d.weightKg > 300)) return 'Ciężar poza zakresem 0–300 kg.'
  if (ex.unit === 'seconds') return intOk(d.durationSec, 3600) && d.durationSec! > 0 ? null : 'Podaj czas w sekundach.'
  if (ex.perSide) {
    if (!intOk(d.repsLeft, 200) || !intOk(d.repsRight, 200)) return 'Podaj powtórzenia dla lewej i prawej strony.'
    return null
  }
  return intOk(d.reps, 200) ? null : 'Podaj liczbę powtórzeń.'
}

/** Clears fields that do not apply to the exercise before saving. */
export function normalizeDraft(ex: SessionExercise, d: SetDraft): SetDraft {
  if (d.status === 'skipped') {
    return { ...d, weightKg: null, reps: null, repsLeft: null, repsRight: null, durationSec: null, rir: null }
  }
  return {
    ...d,
    weightKg: ex.loaded ? d.weightKg : null,
    reps: ex.unit === 'reps' && !ex.perSide ? d.reps : null,
    repsLeft: ex.unit === 'reps' && ex.perSide ? d.repsLeft : null,
    repsRight: ex.unit === 'reps' && ex.perSide ? d.repsRight : null,
    durationSec: ex.unit === 'seconds' ? d.durationSec : null,
    rir: d.type === 'warmup' ? null : d.rir,
    note: d.note.trim(),
  }
}

export function formatSetValue(s: Pick<SetEntry, 'status' | 'weightKg' | 'reps' | 'repsLeft' | 'repsRight' | 'durationSec'>, ex: Pick<SessionExercise, 'unit' | 'perSide' | 'loaded'>): string {
  if (s.status === 'skipped') return 'pominięta'
  const w = ex.loaded && s.weightKg != null ? `${String(s.weightKg).replace('.', ',')} kg × ` : ''
  if (ex.unit === 'seconds') return `${s.durationSec ?? '–'} s`
  if (ex.perSide) return `${w}L ${s.repsLeft ?? '–'} / P ${s.repsRight ?? '–'}`
  return `${w}${s.reps ?? '–'}`
}

/** Compact one-line summary of a past performance, e.g. "16 kg × 12 · 12 · 11". */
export function summarizePerformance(perf: ExercisePerformance): string {
  const ex = perf.exercise
  const sets = sorted(perf.sets, 'working').filter((s) => s.status === 'done')
  if (!sets.length) return '—'
  const sameWeight = sets.every((s) => s.weightKg === sets[0].weightKg)
  const val = (s: SetEntry) => (ex.unit === 'seconds' ? `${s.durationSec}s` : ex.perSide ? `${s.repsLeft}/${s.repsRight}` : `${s.reps}`)
  if (ex.loaded && sameWeight) return `${String(sets[0].weightKg).replace('.', ',')} kg × ${sets.map(val).join(' · ')}`
  if (!ex.loaded) return sets.map(val).join(' · ')
  return sets.map((s) => `${String(s.weightKg).replace('.', ',')}×${val(s)}`).join(' · ')
}
