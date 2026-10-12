import { exerciseName } from './exercises'
import type { Phase, PlanExercise, PlanVersion, RirTarget, SessionExercise, WorkoutType } from './types'

export const SESSIONS_PER_WEEK = 3

export interface SessionPosition {
  /** 1-based number of the session in the program. */
  sessionNumber: number
  week: number
  slot: number
  phase: Phase
}

/**
 * Training weeks are counted in completed sessions (3 per week), not calendar
 * weeks, so a missed day never shifts the adaptation volume ramp.
 */
export function positionFor(completedCount: number, adaptationWeeks: number): SessionPosition {
  const index = Math.max(0, completedCount)
  const week = Math.floor(index / SESSIONS_PER_WEEK) + 1
  return {
    sessionNumber: index + 1,
    week,
    slot: (index % SESSIONS_PER_WEEK) + 1,
    phase: week <= adaptationWeeks ? 'adaptation' : 'continuation',
  }
}

/**
 * Weeks ABA / BAB / ABA / BAB are exactly strict alternation, so the next
 * workout is simply the opposite of the last completed one. This also keeps
 * the rotation correct after a manual override.
 */
export function nextWorkoutType(lastCompleted: WorkoutType | null): WorkoutType {
  if (lastCompleted === null) return 'A'
  return lastCompleted === 'A' ? 'B' : 'A'
}

/** Canonical pattern of a week, used for display ("A / B / A"). */
export function weekPattern(week: number): WorkoutType[] {
  return week % 2 === 1 ? ['A', 'B', 'A'] : ['B', 'A', 'B']
}

export function plannedSetsFor(exercise: PlanExercise, position: Pick<SessionPosition, 'week' | 'phase'>): number {
  if (position.phase === 'continuation') return exercise.continuationSets
  const idx = Math.min(Math.max(position.week, 1), exercise.setsByWeek.length) - 1
  return exercise.setsByWeek[idx]
}

export function targetRirFor(plan: PlanVersion, position: Pick<SessionPosition, 'week' | 'phase'>): RirTarget {
  if (position.phase === 'continuation') return { ...plan.continuationRir }
  const idx = Math.min(Math.max(position.week, 1), plan.rirByWeek.length) - 1
  return { ...plan.rirByWeek[idx] }
}

export function buildSessionExercises(
  plan: PlanVersion,
  type: WorkoutType,
  position: Pick<SessionPosition, 'week' | 'phase'>,
): SessionExercise[] {
  return plan.workouts[type].map((e, i) => ({
    ...e,
    setsByWeek: [...e.setsByWeek] as PlanExercise['setsByWeek'],
    name: exerciseName(e.exerciseId),
    order: i + 1,
    plannedSets: plannedSetsFor(e, position),
  }))
}

export function phaseLabel(p: SessionPosition, adaptationWeeks: number): string {
  return p.phase === 'adaptation' ? `Adaptacja · tydzień ${p.week}/${adaptationWeeks}` : `Kontynuacja · tydzień ${p.week}`
}
