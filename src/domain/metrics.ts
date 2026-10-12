import { doneWorkingSets, setTotalReps, setValue } from './progression'
import type { ExerciseId, Session, SessionExercise, SetEntry } from './types'

export interface ExerciseSessionPoint {
  sessionId: string
  date: string
  /** Heaviest working load (one dumbbell). */
  topWeightKg: number | null
  /** Reps (weaker side) of each working set done at the top load. */
  repsAtTop: number[]
  /** Best single set value (reps or seconds). */
  bestValue: number
  /** Sum of counted reps (or seconds) over working sets. */
  totalValue: number
  workingSets: number
  /** Tonnage: Σ load × reps (both sides for unilateral). Not a strength metric. */
  volumeKg: number
}

export function exercisePoint(session: Session, ex: SessionExercise, sets: SetEntry[]): ExerciseSessionPoint | null {
  const working = doneWorkingSets(sets.filter((s) => s.exerciseId === ex.exerciseId))
  if (working.length === 0) return null
  const weights = working.map((s) => s.weightKg).filter((w): w is number => w != null)
  const top = weights.length ? Math.max(...weights) : null
  const values = working.map((s) => setValue(s, ex) ?? 0)
  return {
    sessionId: session.id,
    date: session.finishedAt ?? session.startedAt,
    topWeightKg: top,
    repsAtTop: working.filter((s) => top == null || s.weightKg === top).map((s) => setValue(s, ex) ?? 0),
    bestValue: Math.max(...values),
    totalValue: values.reduce((a, b) => a + b, 0),
    workingSets: working.length,
    volumeKg: working.reduce((acc, s) => acc + (s.weightKg ?? 0) * setTotalReps(s, ex), 0),
  }
}

export function exerciseHistory(
  exerciseId: ExerciseId,
  sessions: Session[],
  setsBySession: Map<string, SetEntry[]>,
): ExerciseSessionPoint[] {
  const points: ExerciseSessionPoint[] = []
  for (const s of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    if (s.status !== 'completed' || s.deletedAt) continue
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId)
    if (!ex) continue
    const p = exercisePoint(s, ex, setsBySession.get(s.id) ?? [])
    if (p) points.push(p)
  }
  return points
}

export function sessionVolume(session: Session, sets: SetEntry[]): { workingSets: number; volumeKg: number; reps: number } {
  let workingSets = 0
  let volumeKg = 0
  let reps = 0
  for (const ex of session.exercises) {
    const w = doneWorkingSets(sets.filter((s) => s.exerciseId === ex.exerciseId))
    workingSets += w.length
    for (const s of w) {
      const r = setTotalReps(s, ex)
      reps += r
      volumeKg += (s.weightKg ?? 0) * r
    }
  }
  return { workingSets, volumeKg, reps }
}

/** Monday-based week key, e.g. "2026-10-12" (date of that Monday, local time). */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - day)
  return d
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export interface WeeklySummary {
  weekKey: string
  sessions: Session[]
  workingSets: number
  volumeKg: number
  reps: number
}

export function weeklySummaries(sessions: Session[], setsBySession: Map<string, SetEntry[]>): WeeklySummary[] {
  const map = new Map<string, WeeklySummary>()
  for (const s of sessions) {
    if (s.status !== 'completed' || s.deletedAt) continue
    const key = toDateKey(weekStart(new Date(s.startedAt)))
    const entry = map.get(key) ?? { weekKey: key, sessions: [], workingSets: 0, volumeKg: 0, reps: 0 }
    const v = sessionVolume(s, setsBySession.get(s.id) ?? [])
    entry.sessions.push(s)
    entry.workingSets += v.workingSets
    entry.volumeKg += v.volumeKg
    entry.reps += v.reps
    map.set(key, entry)
  }
  return [...map.values()].sort((a, b) => b.weekKey.localeCompare(a.weekKey))
}

/** Trailing moving average over the previous `window` entries (inclusive). */
export function movingAverage(values: number[], window: number): number[] {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i - window + 1), i + 1)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  })
}
