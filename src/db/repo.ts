import { createDefaultPlan } from '../domain/plan'
import { evaluatePerformance, type ExercisePerformance } from '../domain/progression'
import { buildSessionExercises, nextWorkoutType, positionFor, targetRirFor } from '../domain/schedule'
import type {
  BodyMetric,
  ExerciseId,
  PlanVersion,
  Program,
  RestTimer,
  Session,
  SetEntry,
  Settings,
  Suggestion,
  WorkoutType,
} from '../domain/types'
import { db, nowIso, uuid } from './db'

export const DEFAULT_SETTINGS: Omit<Settings, 'updatedAt'> = {
  id: 'settings',
  weightStepKg: 2,
  soundEnabled: true,
  vibrationEnabled: true,
  keepScreenOn: true,
  lastExportAt: null,
}

/** Creates the default plan, program and settings on first launch. Idempotent. */
export async function ensureInitialized(): Promise<void> {
  await db.transaction('rw', db.plans, db.programs, db.settings, async () => {
    const now = nowIso()
    if (!(await db.settings.get('settings'))) {
      await db.settings.put({ ...DEFAULT_SETTINGS, updatedAt: now })
    }
    const active = await db.programs.where('status').equals('active').first()
    if (active) return
    let plan = await latestPlan()
    if (!plan) {
      plan = createDefaultPlan(uuid(), now)
      await db.plans.add(plan)
    }
    await db.programs.add({
      id: uuid(),
      name: plan.name,
      planId: plan.id,
      startedAt: now,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    })
  })
}

export async function latestPlan(): Promise<PlanVersion | undefined> {
  return db.plans.orderBy('version').last()
}

export async function getActiveProgram(): Promise<Program | undefined> {
  return db.programs.where('status').equals('active').first()
}

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('settings')) ?? { ...DEFAULT_SETTINGS, updatedAt: nowIso() }
}

export async function updateSettings(patch: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'settings', updatedAt: nowIso() })
}

export async function completedSessions(programId: string): Promise<Session[]> {
  const list = await db.sessions.where('[programId+status]').equals([programId, 'completed']).toArray()
  return list.sort((a, b) => a.sessionNumber - b.sessionNumber || a.startedAt.localeCompare(b.startedAt))
}

export async function getInProgressSession(): Promise<Session | undefined> {
  const list = await db.sessions.where('status').equals('in_progress').toArray()
  return list.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
}

export interface NextSessionInfo {
  program: Program
  plan: PlanVersion
  type: WorkoutType
  position: ReturnType<typeof positionFor>
  completedCount: number
  lastCompleted: Session | null
}

export async function getNextSessionInfo(): Promise<NextSessionInfo | null> {
  const program = await getActiveProgram()
  if (!program) return null
  const plan = await db.plans.get(program.planId)
  if (!plan) return null
  const done = await completedSessions(program.id)
  const last = done.at(-1) ?? null
  return {
    program,
    plan,
    type: nextWorkoutType(last?.workoutType ?? null),
    position: positionFor(done.length, plan.adaptationWeeks),
    completedCount: done.length,
    lastCompleted: last,
  }
}

/** Starts a session (or returns the unfinished one, never creating two). */
export async function startSession(override?: WorkoutType): Promise<Session> {
  return db.transaction('rw', db.sessions, db.programs, db.plans, async () => {
    const existing = await getInProgressSession()
    if (existing) return existing
    const info = await getNextSessionInfo()
    if (!info) throw new Error('Brak aktywnego programu.')
    const type = override ?? info.type
    const now = nowIso()
    const session: Session = {
      id: uuid(),
      programId: info.program.id,
      planId: info.plan.id,
      planVersion: info.plan.version,
      workoutType: type,
      sessionNumber: info.position.sessionNumber,
      week: info.position.week,
      slot: info.position.slot,
      phase: info.position.phase,
      targetRir: targetRirFor(info.plan, info.position),
      status: 'in_progress',
      startedAt: now,
      finishedAt: null,
      exercises: buildSessionExercises(info.plan, type, info.position),
      currentExerciseIndex: 0,
      restTimer: null,
      note: '',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await db.sessions.add(session)
    return session
  })
}

export async function updateSession(id: string, patch: Partial<Pick<Session, 'currentExerciseIndex' | 'restTimer' | 'note' | 'exercises'>>): Promise<void> {
  const n = await db.sessions.update(id, { ...patch, updatedAt: nowIso() })
  if (n === 0) throw new Error('Nie znaleziono sesji.')
}

export type SetInput = Omit<SetEntry, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'setNumber'> & {
  id?: string
  setNumber?: number
}

/**
 * Persists a set (insert or update) and optionally starts the rest timer in
 * the same transaction, so a crash can never leave one without the other.
 */
export async function saveSet(input: SetInput, opts: { restTimer?: RestTimer | null } = {}): Promise<SetEntry> {
  return db.transaction('rw', db.sets, db.sessions, async () => {
    const session = await db.sessions.get(input.sessionId)
    if (!session) throw new Error('Sesja nie istnieje.')
    const now = nowIso()
    let entry: SetEntry
    if (input.id) {
      const prev = await db.sets.get(input.id)
      if (!prev) throw new Error('Seria nie istnieje.')
      entry = { ...prev, ...input, id: prev.id, setNumber: input.setNumber ?? prev.setNumber, createdAt: prev.createdAt, updatedAt: now }
    } else {
      const siblings = await db.sets
        .where('[sessionId+exerciseId]')
        .equals([input.sessionId, input.exerciseId])
        .filter((s) => s.type === input.type)
        .toArray()
      const setNumber = input.setNumber ?? siblings.reduce((m, s) => Math.max(m, s.setNumber), 0) + 1
      entry = { ...input, id: uuid(), setNumber, createdAt: now, updatedAt: now, deletedAt: null }
    }
    await db.sets.put(entry)
    const sessionPatch: Partial<Session> = { updatedAt: now }
    if (opts.restTimer !== undefined) sessionPatch.restTimer = opts.restTimer
    await db.sessions.update(session.id, sessionPatch)
    return entry
  })
}

/** Deletes a set and renumbers the remaining ones of the same exercise/type. */
export async function deleteSet(id: string): Promise<void> {
  await db.transaction('rw', db.sets, db.sessions, async () => {
    const set = await db.sets.get(id)
    if (!set) return
    await db.sets.delete(id)
    const rest = (await db.sets.where('[sessionId+exerciseId]').equals([set.sessionId, set.exerciseId]).toArray())
      .filter((s) => s.type === set.type)
      .sort((a, b) => a.setNumber - b.setNumber)
    const now = nowIso()
    for (let i = 0; i < rest.length; i++) {
      if (rest[i].setNumber !== i + 1) await db.sets.update(rest[i].id, { setNumber: i + 1, updatedAt: now })
    }
    await db.sessions.update(set.sessionId, { updatedAt: now })
  })
}

export async function setsForSession(sessionId: string): Promise<SetEntry[]> {
  return db.sets.where('sessionId').equals(sessionId).toArray()
}

/** Last completed performance of an exercise, excluding a given session. */
export async function lastPerformance(exerciseId: ExerciseId, excludeSessionId?: string, beforeIso?: string): Promise<ExercisePerformance | null> {
  const sessions = (await db.sessions.where('status').equals('completed').toArray())
    .filter((s) => s.id !== excludeSessionId && (!beforeIso || s.startedAt < beforeIso) && s.exercises.some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  for (const s of sessions) {
    const sets = await db.sets.where('[sessionId+exerciseId]').equals([s.id, exerciseId]).toArray()
    if (sets.some((x) => x.type === 'working' && x.status === 'done')) {
      const ex = s.exercises.find((e) => e.exerciseId === exerciseId)!
      return { sessionId: s.id, date: s.finishedAt ?? s.startedAt, exercise: ex, targetRir: s.targetRir, sets }
    }
  }
  return null
}

export function performanceFor(session: Session, exerciseId: ExerciseId, sets: SetEntry[]): ExercisePerformance | null {
  const ex = session.exercises.find((e) => e.exerciseId === exerciseId)
  if (!ex) return null
  return {
    sessionId: session.id,
    date: session.finishedAt ?? session.startedAt,
    exercise: ex,
    targetRir: session.targetRir,
    sets: sets.filter((s) => s.exerciseId === exerciseId),
  }
}

/**
 * Completes the session and records load suggestions. Suggestions are never
 * applied automatically — the user accepts or rejects each one.
 */
export async function finishSession(id: string): Promise<Suggestion[]> {
  return db.transaction('rw', db.sessions, db.sets, db.suggestions, db.settings, async () => {
    const session = await db.sessions.get(id)
    if (!session) throw new Error('Sesja nie istnieje.')
    const settings = await getSettings()
    const sets = await setsForSession(id)
    const now = nowIso()
    const created: Suggestion[] = []
    for (const ex of session.exercises) {
      const perf = performanceFor(session, ex.exerciseId, sets)
      if (!perf) continue
      const ev = evaluatePerformance(perf, settings.weightStepKg)
      if ((ev.status === 'increase' || ev.status === 'unify') && ev.workingWeightKg != null && ev.suggestedWeightKg != null) {
        const stale = await db.suggestions.where('exerciseId').equals(ex.exerciseId).filter((s) => s.status === 'pending').toArray()
        await db.suggestions.bulkDelete(stale.map((s) => s.id))
        const sug: Suggestion = {
          id: uuid(),
          exerciseId: ex.exerciseId,
          sourceSessionId: id,
          fromWeightKg: ev.workingWeightKg,
          toWeightKg: ev.suggestedWeightKg,
          status: 'pending',
          decidedAt: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }
        await db.suggestions.add(sug)
        created.push(sug)
      }
    }
    await db.sessions.update(id, { status: 'completed', finishedAt: now, restTimer: null, updatedAt: now })
    return created
  })
}

/** Reopens a completed session (e.g. finished by mistake). */
export async function reopenSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, async () => {
    const other = await getInProgressSession()
    if (other && other.id !== id) throw new Error('Najpierw zakończ lub odrzuć trwający trening.')
    await db.sessions.update(id, { status: 'in_progress', finishedAt: null, updatedAt: nowIso() })
  })
}

export async function deleteSession(id: string): Promise<void> {
  await db.transaction('rw', db.sessions, db.sets, db.suggestions, async () => {
    await db.sets.where('sessionId').equals(id).delete()
    await db.suggestions.where('sourceSessionId').equals(id).delete()
    await db.sessions.delete(id)
  })
}

export async function decideSuggestion(id: string, accept: boolean): Promise<void> {
  const now = nowIso()
  await db.suggestions.update(id, { status: accept ? 'accepted' : 'rejected', decidedAt: now, updatedAt: now })
}

/**
 * Weight to prefill for the next working set: an accepted suggestion newer
 * than the last performance wins, otherwise the last used load.
 */
export async function preferredWeight(exerciseId: ExerciseId, last: ExercisePerformance | null): Promise<number | null> {
  const accepted = (await db.suggestions.where('exerciseId').equals(exerciseId).toArray())
    .filter((s) => s.status === 'accepted' && s.decidedAt)
    .sort((a, b) => b.decidedAt!.localeCompare(a.decidedAt!))[0]
  if (accepted && (!last || accepted.decidedAt! >= last.date || accepted.sourceSessionId === last.sessionId)) {
    return accepted.toWeightKg
  }
  if (!last) return null
  const working = last.sets.filter((s) => s.type === 'working' && s.status === 'done' && s.weightKg != null)
  return working.length ? Math.max(...working.map((s) => s.weightKg!)) : null
}

// ---- Plan editing ---------------------------------------------------------

export async function savePlanVersion(edited: Omit<PlanVersion, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<PlanVersion> {
  return db.transaction('rw', db.plans, db.programs, async () => {
    const latest = await latestPlan()
    const now = nowIso()
    const plan: PlanVersion = {
      ...structuredClone(edited),
      id: uuid(),
      version: (latest?.version ?? 0) + 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await db.plans.add(plan)
    const program = await getActiveProgram()
    if (program) await db.programs.update(program.id, { planId: plan.id, updatedAt: now })
    return plan
  })
}

/** Archives the active program (history stays) and starts a fresh adaptation cycle. */
export async function startNewProgram(name: string): Promise<void> {
  await db.transaction('rw', db.programs, db.plans, db.sessions, async () => {
    if (await getInProgressSession()) throw new Error('Najpierw zakończ lub odrzuć trwający trening.')
    const now = nowIso()
    const current = await getActiveProgram()
    const plan = (current && (await db.plans.get(current.planId))) ?? (await latestPlan())
    if (!plan) throw new Error('Brak planu.')
    if (current) await db.programs.update(current.id, { status: 'archived', updatedAt: now })
    await db.programs.add({ id: uuid(), name, planId: plan.id, startedAt: now, status: 'active', createdAt: now, updatedAt: now, deletedAt: null })
  })
}

// ---- Body metrics ---------------------------------------------------------

export async function saveBodyMetric(input: Omit<BodyMetric, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> & { id?: string }): Promise<void> {
  const now = nowIso()
  if (input.weightKg == null && input.waistCm == null) throw new Error('Podaj masę ciała lub obwód pasa.')
  if (input.id) {
    await db.bodyMetrics.update(input.id, { ...input, updatedAt: now })
  } else {
    await db.bodyMetrics.add({ ...input, id: uuid(), createdAt: now, updatedAt: now, deletedAt: null })
  }
}

export async function deleteBodyMetric(id: string): Promise<void> {
  await db.bodyMetrics.delete(id)
}

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', [db.plans, db.programs, db.sessions, db.sets, db.bodyMetrics, db.suggestions, db.settings, db.snapshots], async () => {
    await Promise.all([db.plans.clear(), db.programs.clear(), db.sessions.clear(), db.sets.clear(), db.bodyMetrics.clear(), db.suggestions.clear(), db.settings.clear(), db.snapshots.clear()])
  })
  await ensureInitialized()
}
