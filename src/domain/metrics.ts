import { EXERCISES } from './exercises'
import { doneWorkingSets, setTotalReps, setValue } from './progression'
import type { ExerciseId, Session, SessionExercise, SetEntry } from './types'

/**
 * External-load volume of one set: dumbbell mass × dumbbells used × reps
 * (both sides summed for unilateral work). Timed/bodyweight sets give 0.
 * It is a load-tracking index, not a strength measure, and it excludes body
 * mass (e.g. lunges, hip thrust) — callers must label it accordingly.
 */
export function setLoadVolume(set: SetEntry, ex: Pick<SessionExercise, 'exerciseId' | 'unit' | 'perSide'>): number {
  const dumbbells = EXERCISES[ex.exerciseId]?.dumbbells ?? 1
  if (ex.unit === 'seconds' || dumbbells === 0 || set.weightKg == null) return 0
  return set.weightKg * dumbbells * setTotalReps(set, ex)
}

/**
 * Performed work: a finished session with ≥ 1 performed working set. Drives
 * statistics, history counts and progress — never the plan position (see
 * advancesPlan in sessionState.ts). Legacy empty "completed" sessions are excluded.
 */
export function isPerformedSession(session: Session, sets: SetEntry[]): boolean {
  return session.status === 'completed' && !session.deletedAt && sets.some((s) => s.sessionId === session.id && s.type === 'working' && s.status === 'done')
}

export type SessionOutcome = 'cancelled' | 'partial' | 'full'

/** Performed planned working sets of one exercise (extra sets and skipped ones excluded). */
export function plannedDone(ex: Pick<SessionExercise, 'exerciseId'>, sets: SetEntry[]): number {
  return sets.filter((s) => s.exerciseId === ex.exerciseId && s.type === 'working' && s.status === 'done' && !s.isExtra).length
}

/** All planned working sets of the exercise were performed (skipped sets do not count). */
export function isExerciseComplete(ex: Pick<SessionExercise, 'exerciseId' | 'plannedSets'>, sets: SetEntry[]): boolean {
  return plannedDone(ex, sets) >= ex.plannedSets
}

/**
 * Outcome from the logged sets — no percentage threshold:
 * cancelled = no performed working set; full = every planned working set of every
 * exercise performed; partial = anything in between.
 */
export function sessionOutcome(session: Pick<Session, 'id' | 'exercises'>, sets: SetEntry[]): SessionOutcome {
  const own = sets.filter((s) => s.sessionId === session.id)
  if (!own.some((s) => s.type === 'working' && s.status === 'done')) return 'cancelled'
  return session.exercises.every((ex) => isExerciseComplete(ex, own)) ? 'full' : 'partial'
}

/** Planned working sets performed vs planned, for "9/16" labels. */
export function plannedProgress(session: Pick<Session, 'id' | 'exercises'>, sets: SetEntry[]): { done: number; planned: number } {
  const own = sets.filter((s) => s.sessionId === session.id)
  return session.exercises.reduce((acc, ex) => ({ done: acc.done + Math.min(plannedDone(ex, own), ex.plannedSets), planned: acc.planned + ex.plannedSets }), { done: 0, planned: 0 })
}

/** Gaps longer than this between activity events are treated as a pause, not training time. */
export const PAUSE_GAP_MS = 30 * 60 * 1000

/**
 * Active duration: sum of gaps between consecutive activity events (start, each
 * logged set, finish) that are ≤ 30 min. Excludes long pauses, e.g. a session
 * reopened the next day. Derived on read, so historical sessions are covered
 * without modifying stored data.
 */
export function activeDurationMs(session: Session, sets: SetEntry[]): number | null {
  if (!session.finishedAt) return null
  const events = [session.startedAt, ...sets.filter((s) => s.sessionId === session.id).map((s) => s.createdAt), session.finishedAt]
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b)
  let total = 0
  for (let i = 1; i < events.length; i++) {
    const gap = events[i] - events[i - 1]
    if (gap <= PAUSE_GAP_MS) total += gap
  }
  return total
}

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
  /** External-load volume: Σ dumbbell mass × dumbbells × reps. Not a strength metric. */
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
    volumeKg: working.reduce((acc, s) => acc + setLoadVolume(s, ex), 0),
  }
}

export function exerciseHistory(
  exerciseId: ExerciseId,
  sessions: Session[],
  setsBySession: Map<string, SetEntry[]>,
): ExerciseSessionPoint[] {
  const points: ExerciseSessionPoint[] = []
  for (const s of [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    if (!isPerformedSession(s, setsBySession.get(s.id) ?? [])) continue
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
      reps += setTotalReps(s, ex)
      volumeKg += setLoadVolume(s, ex)
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
    if (!isPerformedSession(s, setsBySession.get(s.id) ?? [])) continue
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
