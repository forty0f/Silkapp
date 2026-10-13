import { createDefaultPlan } from '../domain/plan'
import { evaluatePerformance, type ExercisePerformance } from '../domain/progression'
import { advancesPlan } from '../domain/sessionState'
import { isExerciseComplete, sessionOutcome } from '../domain/metrics'
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
import { db, nowIso, uuid, withDbRetry } from './db'

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
  await withDbRetry(async () => {
    const current = await getSettings()
    await db.settings.put({ ...current, ...patch, id: 'settings', updatedAt: nowIso() })
  })
  // Proposed loads depend on the step.
  if (patch.weightStepKg !== undefined) await reconcileAll()
}

/**
 * Sessions that move the plan (A/B rotation, week, slot) — see advancesPlan().
 * This is schedule progress, not performed work: a legacy empty session keeps
 * its historical plan effect, a repeated partial workout does not advance.
 * Performed work (statistics) is isPerformedSession() in domain/metrics.
 */
export async function planSessions(programId: string): Promise<Session[]> {
  const list = (await db.sessions.where('[programId+status]').equals([programId, 'completed']).toArray()).filter(advancesPlan)
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
  const done = await planSessions(program.id)
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
  return withDbRetry(() => db.transaction('rw', [db.sessions, db.programs, db.plans, db.sets], async () => {
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
  }))
}

export async function updateSession(id: string, patch: Partial<Pick<Session, 'currentExerciseIndex' | 'restTimer' | 'note' | 'exercises'>>): Promise<void> {
  const n = await withDbRetry(() => db.sessions.update(id, { ...patch, updatedAt: nowIso() }))
  if (n === 0) throw new Error('Nie znaleziono sesji.')
}

export type SetInput = Omit<SetEntry, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'setNumber'> & {
  id?: string
  setNumber?: number
}

/**
 * Persists a set (insert or update) and optionally starts the rest timer in
 * the same transaction, so a crash can never leave one without the other.
 * The id is generated before the transaction, so a retried write after a
 * lost IndexedDB connection updates the same record instead of duplicating it.
 * Editing a completed session re-evaluates the dependent load suggestion.
 */
export async function saveSetDetailed(input: SetInput, opts: { restTimer?: RestTimer | null } = {}): Promise<{ set: SetEntry; changes: SuggestionChange[] }> {
  const id = input.id ?? uuid()
  const isNew = !input.id
  return withDbRetry(() =>
    db.transaction('rw', [db.sets, db.sessions, db.suggestions, db.settings], async () => {
      const session = await db.sessions.get(input.sessionId)
      if (!session) throw new Error('Sesja nie istnieje.')
      const now = nowIso()
      const prev = await db.sets.get(id)
      if (!isNew && !prev) throw new Error('Seria nie istnieje.')
      let entry: SetEntry
      if (prev) {
        entry = { ...prev, ...input, id, setNumber: input.setNumber ?? prev.setNumber, createdAt: prev.createdAt, updatedAt: now }
      } else {
        const siblings = await db.sets
          .where('[sessionId+exerciseId]')
          .equals([input.sessionId, input.exerciseId])
          .filter((s) => s.type === input.type)
          .toArray()
        const setNumber = input.setNumber ?? siblings.reduce((m, s) => Math.max(m, s.setNumber), 0) + 1
        entry = { ...input, id, setNumber, createdAt: now, updatedAt: now, deletedAt: null }
      }
      await db.sets.put(entry)
      const sessionPatch: Partial<Session> = { updatedAt: now }
      if (opts.restTimer !== undefined) sessionPatch.restTimer = opts.restTimer
      await db.sessions.update(session.id, sessionPatch)
      const changes = session.status === 'completed' ? await reconcileExercise(entry.exerciseId) : []
      return { set: entry, changes }
    }),
  )
}

export async function saveSet(input: SetInput, opts: { restTimer?: RestTimer | null } = {}): Promise<SetEntry> {
  return (await saveSetDetailed(input, opts)).set
}

/** Deletes a set and renumbers the remaining ones of the same exercise/type. */
export async function deleteSet(id: string): Promise<SuggestionChange[]> {
  return withDbRetry(() =>
    db.transaction('rw', [db.sets, db.sessions, db.suggestions, db.settings], async () => {
      const set = await db.sets.get(id)
      if (!set) return []
      await db.sets.delete(id)
      const rest = (await db.sets.where('[sessionId+exerciseId]').equals([set.sessionId, set.exerciseId]).toArray())
        .filter((s) => s.type === set.type)
        .sort((a, b) => a.setNumber - b.setNumber)
      const now = nowIso()
      const session = await db.sessions.get(set.sessionId)
      const planned = session?.exercises.find((e) => e.exerciseId === set.exerciseId)?.plannedSets
      for (let i = 0; i < rest.length; i++) {
        const setNumber = i + 1
        // Renumbering can move an extra set into a planned slot (and vice versa).
        const isExtra = set.type === 'working' && planned != null ? setNumber > planned : rest[i].isExtra
        if (rest[i].setNumber !== setNumber || rest[i].isExtra !== isExtra) await db.sets.update(rest[i].id, { setNumber, isExtra, updatedAt: now })
      }
      await db.sessions.update(set.sessionId, { updatedAt: now })
      return session?.status === 'completed' ? reconcileExercise(set.exerciseId) : []
    }),
  )
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

export type PlanChoice = 'advance' | 'repeat'

export class PlanChoiceRequiredError extends Error {
  constructor() {
    super('Trening jest częściowo ukończony — wybierz: dalej według planu albo powtórz trening.')
  }
}

/**
 * Finishes the session and reconciles load suggestions (never applied automatically).
 * The outcome comes from the logged sets (see sessionOutcome):
 * - cancelled (no performed working set) → status 'cancelled', never moves the plan;
 * - full → 'completed', moves the plan;
 * - partial → 'completed' and the user's explicit `choice` is required:
 *   'advance' moves the plan, 'repeat' keeps the same workout/week/slot next time.
 */
export async function finishSession(id: string, choice?: PlanChoice): Promise<Suggestion[]> {
  return withDbRetry(() =>
    db.transaction('rw', [db.sessions, db.sets, db.suggestions, db.settings], async () => {
      const session = await db.sessions.get(id)
      if (!session) throw new Error('Sesja nie istnieje.')
      if (session.status !== 'in_progress') return db.suggestions.where('sourceSessionId').equals(id).filter((s) => s.status === 'pending').toArray()
      const now = nowIso()
      const outcome = sessionOutcome(session, await db.sets.where('sessionId').equals(id).toArray())
      if (outcome === 'partial' && !choice) throw new PlanChoiceRequiredError()
      await db.sessions.update(id, {
        status: outcome === 'cancelled' ? 'cancelled' : 'completed',
        // Recorded only for a partial session; full ones advance by default (and stay backup format 1).
        planAdvance: outcome === 'partial' ? choice === 'advance' : undefined,
        finishedAt: now,
        restTimer: null,
        updatedAt: now,
      })
      for (const ex of session.exercises) await reconcileExercise(ex.exerciseId)
      return db.suggestions.where('sourceSessionId').equals(id).filter((s) => s.status === 'pending').toArray()
    }),
  )
}

/**
 * Changes the plan choice of a partially completed session. Allowed only for the
 * newest session while nothing is in progress, so later sessions never change position.
 */
export async function setPlanChoice(id: string, choice: PlanChoice): Promise<void> {
  await withDbRetry(() =>
    db.transaction('rw', [db.sessions, db.sets], async () => {
      const session = await db.sessions.get(id)
      if (!session || session.status !== 'completed') throw new Error('Sesja nie jest ukończona.')
      if (!(await canChangePlanChoice(session))) throw new Error('Wybór można zmienić tylko dla ostatniego treningu.')
      await db.sessions.update(id, { planAdvance: choice === 'advance', updatedAt: nowIso() })
    }),
  )
}

export async function canChangePlanChoice(session: Session): Promise<boolean> {
  if (session.status !== 'completed') return false
  if (sessionOutcome(session, await db.sets.where('sessionId').equals(session.id).toArray()) !== 'partial') return false
  const all = await db.sessions.toArray()
  return !all.some((s) => s.id !== session.id && !s.deletedAt && (s.status === 'in_progress' || s.startedAt > session.startedAt))
}

/**
 * Latest finished performance in which ALL planned working sets of the exercise were
 * performed. Only such a performance can create, keep or withdraw a load suggestion:
 * a partially done exercise (e.g. one set "to try") never cancels an earlier proposal.
 */
export async function lastCompletePerformance(exerciseId: ExerciseId): Promise<ExercisePerformance | null> {
  const sessions = (await db.sessions.where('status').equals('completed').toArray())
    .filter((s) => !s.deletedAt && s.exercises.some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  for (const s of sessions) {
    const sets = await db.sets.where('[sessionId+exerciseId]').equals([s.id, exerciseId]).toArray()
    const ex = s.exercises.find((e) => e.exerciseId === exerciseId)!
    if (ex.plannedSets > 0 && isExerciseComplete(ex, sets)) return { sessionId: s.id, date: s.finishedAt ?? s.startedAt, exercise: ex, targetRir: s.targetRir, sets }
  }
  return null
}

export type SuggestionChange = { exerciseId: ExerciseId; kind: 'created' | 'updated' | 'withdrawn'; suggestion: Suggestion }

/**
 * Brings the load suggestion of one exercise in line with its latest completed
 * performance. Suggestions are derived data: whenever that performance (or the
 * weight step) changes, the suggestion is created, updated or withdrawn.
 * - Only the latest completed performance can carry a live suggestion; pending
 *   suggestions from older sessions are removed.
 * - If the values change, a previous decision no longer applies and the
 *   suggestion returns to "pending".
 * - Decided suggestions of older sessions stay as history.
 * Must be called inside a transaction covering sessions, sets, suggestions, settings.
 */
export async function reconcileExercise(exerciseId: ExerciseId): Promise<SuggestionChange[]> {
  const changes: SuggestionChange[] = []
  const latest = await lastCompletePerformance(exerciseId)
  const all = await db.suggestions.where('exerciseId').equals(exerciseId).toArray()
  const completedIds = new Set((await db.sessions.where('status').equals('completed').primaryKeys()) as string[])
  for (const s of all) {
    // A suggestion whose source session is not completed (reopened or gone) has no valid basis,
    // whatever its status; pending ones from older sessions are superseded.
    const orphaned = !completedIds.has(s.sourceSessionId)
    if (orphaned || (s.status === 'pending' && s.sourceSessionId !== latest?.sessionId)) {
      await db.suggestions.delete(s.id)
      changes.push({ exerciseId, kind: 'withdrawn', suggestion: s })
    }
  }
  if (!latest) return changes
  const settings = await getSettings()
  const ev = evaluatePerformance(latest, settings.weightStepKg)
  const existing = all.find((s) => s.sourceSessionId === latest.sessionId && completedIds.has(s.sourceSessionId))
  const qualifies = (ev.status === 'increase' || ev.status === 'unify') && ev.workingWeightKg != null && ev.suggestedWeightKg != null
  const now = nowIso()
  if (qualifies) {
    if (!existing) {
      const sug: Suggestion = {
        id: uuid(),
        exerciseId,
        sourceSessionId: latest.sessionId,
        fromWeightKg: ev.workingWeightKg!,
        toWeightKg: ev.suggestedWeightKg!,
        status: 'pending',
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      await db.suggestions.add(sug)
      changes.push({ exerciseId, kind: 'created', suggestion: sug })
    } else if (existing.fromWeightKg !== ev.workingWeightKg || existing.toWeightKg !== ev.suggestedWeightKg) {
      const updated: Suggestion = { ...existing, fromWeightKg: ev.workingWeightKg!, toWeightKg: ev.suggestedWeightKg!, status: 'pending', decidedAt: null, updatedAt: now }
      await db.suggestions.put(updated)
      changes.push({ exerciseId, kind: 'updated', suggestion: updated })
    }
  } else if (existing) {
    await db.suggestions.delete(existing.id)
    changes.push({ exerciseId, kind: 'withdrawn', suggestion: existing })
  }
  return changes
}

/** Re-evaluates suggestions of every exercise (e.g. after the weight step changes). */
export async function reconcileAll(): Promise<SuggestionChange[]> {
  return withDbRetry(() =>
    db.transaction('rw', [db.sessions, db.sets, db.suggestions, db.settings], async () => {
      const ids = new Set((await db.sessions.toArray()).flatMap((s) => s.exercises.map((e) => e.exerciseId)))
      const out: SuggestionChange[] = []
      for (const id of ids) out.push(...(await reconcileExercise(id)))
      return out
    }),
  )
}

/** Reopens a completed session (e.g. finished by mistake). */
export async function reopenSession(id: string): Promise<void> {
  await withDbRetry(() =>
    db.transaction('rw', [db.sessions, db.sets, db.suggestions, db.settings], async () => {
      const other = await getInProgressSession()
      if (other && other.id !== id) throw new Error('Najpierw zakończ lub odrzuć trwający trening.')
      const session = await db.sessions.get(id)
      if (!session) throw new Error('Sesja nie istnieje.')
      // planAdvance belongs to a finished session only; it is chosen again on finishing.
      await db.sessions.update(id, { status: 'in_progress', finishedAt: null, planAdvance: undefined, updatedAt: nowIso() })
      // Suggestions derived from this session no longer stand while it is being edited;
      // the previous completed performance becomes the basis again until it is finished.
      for (const ex of session.exercises) await reconcileExercise(ex.exerciseId)
    }),
  )
}

export async function deleteSession(id: string): Promise<void> {
  await withDbRetry(() =>
    db.transaction('rw', [db.sessions, db.sets, db.suggestions, db.settings], async () => {
      const session = await db.sessions.get(id)
      await db.sets.where('sessionId').equals(id).delete()
      await db.suggestions.where('sourceSessionId').equals(id).delete()
      await db.sessions.delete(id)
      // The previous performance may now be the latest one again.
      if (session?.status === 'completed') for (const ex of session.exercises) await reconcileExercise(ex.exerciseId)
    }),
  )
}

export async function decideSuggestion(id: string, accept: boolean): Promise<void> {
  const now = nowIso()
  await withDbRetry(() => db.suggestions.update(id, { status: accept ? 'accepted' : 'rejected', decidedAt: now, updatedAt: now }))
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
  const id = input.id ?? uuid()
  await withDbRetry(async () => {
    const prev = await db.bodyMetrics.get(id)
    await db.bodyMetrics.put({ ...input, id, createdAt: prev?.createdAt ?? now, updatedAt: now, deletedAt: null })
  })
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
