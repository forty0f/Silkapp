import { z } from 'zod'
import { EXERCISE_IDS } from '../domain/exercises'
import type { ExerciseId } from '../domain/types'
import { db, nowIso, uuid } from './db'
import { ensureInitialized } from './repo'

export const APP_ID = 'silkapp'

/**
 * Backup file format (independent of the IndexedDB schema version, which stays 1).
 * 1 — original format.
 * 2 — sessions may be `cancelled` and may carry `planAdvance` (partial completion).
 * A file is written as 1 whenever its content fits format 1, so it stays
 * importable into older app versions; otherwise as 2, which older versions
 * reject with a clear "newer version" message instead of a validation error.
 */
export const EXPORT_FORMAT_VERSION = 2

export function exportFormatFor(sessions: { status: string; planAdvance?: boolean }[]): 1 | 2 {
  return sessions.some((s) => s.status === 'cancelled' || s.planAdvance !== undefined) ? 2 : 1
}

const iso = z.string().min(10)
const nullableIso = iso.nullable().optional()
const exerciseId = z.enum(EXERCISE_IDS as [ExerciseId, ...ExerciseId[]])
const rir = z.object({ min: z.number().min(0).max(10), max: z.number().min(0).max(10) })
const syncMeta = { id: z.string().min(1), createdAt: iso, updatedAt: iso, deletedAt: nullableIso }

const planExercise = z.object({
  exerciseId,
  repMin: z.number().int().min(1),
  repMax: z.number().int().min(1),
  unit: z.enum(['reps', 'seconds']),
  perSide: z.boolean(),
  setsByWeek: z.tuple([z.number().int().min(0), z.number().int().min(0), z.number().int().min(0), z.number().int().min(0)]),
  continuationSets: z.number().int().min(0),
  restSec: z.number().int().min(0),
  loaded: z.boolean(),
})

const plan = z.object({
  ...syncMeta,
  version: z.number().int().min(1),
  name: z.string(),
  note: z.string(),
  adaptationWeeks: z.number().int().min(0),
  rirByWeek: z.array(rir),
  continuationRir: rir,
  workouts: z.object({ A: z.array(planExercise), B: z.array(planExercise) }),
})

const program = z.object({ ...syncMeta, name: z.string(), planId: z.string(), startedAt: iso, status: z.enum(['active', 'archived']) })

const sessionExercise = planExercise.extend({ name: z.string(), order: z.number().int(), plannedSets: z.number().int().min(0) })

const session = z.object({
  ...syncMeta,
  programId: z.string(),
  planId: z.string(),
  planVersion: z.number().int(),
  workoutType: z.enum(['A', 'B']),
  sessionNumber: z.number().int().min(1),
  week: z.number().int().min(1),
  slot: z.number().int().min(1),
  phase: z.enum(['adaptation', 'continuation']),
  targetRir: rir,
  // Explicit list — an unknown status is rejected, never guessed.
  status: z.enum(['in_progress', 'completed', 'cancelled']),
  startedAt: iso,
  finishedAt: iso.nullable(),
  exercises: z.array(sessionExercise),
  currentExerciseIndex: z.number().int().min(0),
  restTimer: z.object({ exerciseId, startedAt: z.number(), durationSec: z.number() }).nullable(),
  note: z.string(),
  planAdvance: z.boolean().optional(),
})

const num = z.number().finite().nullable()
const setEntry = z.object({
  ...syncMeta,
  sessionId: z.string(),
  exerciseId,
  type: z.enum(['warmup', 'working']),
  setNumber: z.number().int().min(1),
  isExtra: z.boolean(),
  status: z.enum(['done', 'skipped']),
  weightKg: num,
  reps: num,
  repsLeft: num,
  repsRight: num,
  durationSec: num,
  rir: num,
  techniqueOk: z.boolean(),
  note: z.string(),
})

const bodyMetric = z.object({
  ...syncMeta,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightKg: num,
  waistCm: num,
  note: z.string(),
})

const suggestion = z.object({
  ...syncMeta,
  exerciseId,
  sourceSessionId: z.string(),
  fromWeightKg: z.number(),
  toWeightKg: z.number(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  decidedAt: iso.nullable(),
})

const settings = z.object({
  id: z.literal('settings'),
  weightStepKg: z.number().positive(),
  soundEnabled: z.boolean(),
  vibrationEnabled: z.boolean(),
  keepScreenOn: z.boolean(),
  lastExportAt: iso.nullable(),
  updatedAt: iso,
})

export const exportSchema = z.object({
  app: z.literal(APP_ID),
  schemaVersion: z.number().int().min(1),
  exportedAt: iso,
  data: z.object({
    plans: z.array(plan),
    programs: z.array(program),
    sessions: z.array(session),
    sets: z.array(setEntry),
    bodyMetrics: z.array(bodyMetric),
    suggestions: z.array(suggestion),
    settings: z.array(settings),
  }),
})

export type ExportPayload = z.infer<typeof exportSchema>

export async function buildExport(): Promise<ExportPayload> {
  return db.transaction('r', [db.plans, db.programs, db.sessions, db.sets, db.bodyMetrics, db.suggestions, db.settings], async () => ({
    app: APP_ID,
    schemaVersion: exportFormatFor(await db.sessions.toArray()),
    exportedAt: nowIso(),
    data: {
      plans: await db.plans.toArray(),
      programs: await db.programs.toArray(),
      sessions: await db.sessions.toArray(),
      sets: await db.sets.toArray(),
      bodyMetrics: await db.bodyMetrics.toArray(),
      suggestions: await db.suggestions.toArray(),
      settings: await db.settings.toArray(),
    },
  }))
}

export function exportFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `silkapp-kopia-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}.json`
}

/** Upgrades payloads produced by older app versions. Add steps as schema evolves. */
export function migratePayload(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const obj = raw as { schemaVersion?: unknown }
  // v1 is the first released format — nothing to migrate yet.
  // if (obj.schemaVersion === 1) { ...transform...; obj.schemaVersion = 2 }
  return obj
}

export type ValidationResult =
  | { ok: true; payload: ExportPayload; summary: ImportSummary }
  | { ok: false; errors: string[] }

export interface ImportSummary {
  exportedAt: string
  sessions: number
  completedSessions: number
  sets: number
  bodyMetrics: number
  plans: number
}

export function validateImport(text: string): ValidationResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['Plik nie jest poprawnym JSON-em.'] }
  }
  if (!raw || typeof raw !== 'object' || (raw as { app?: unknown }).app !== APP_ID) {
    return { ok: false, errors: ['To nie jest kopia zapasowa tej aplikacji (brak znacznika "silkapp").'] }
  }
  const version = (raw as { schemaVersion?: unknown }).schemaVersion
  if (typeof version === 'number' && version > EXPORT_FORMAT_VERSION) {
    return { ok: false, errors: [`Kopia pochodzi z nowszej wersji aplikacji (schemat ${version}, obsługiwany ${EXPORT_FORMAT_VERSION}). Zaktualizuj aplikację.`] }
  }
  const parsed = exportSchema.safeParse(migratePayload(raw))
  if (!parsed.success) {
    const errors = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    if (parsed.error.issues.length > 8) errors.push(`…oraz ${parsed.error.issues.length - 8} innych błędów.`)
    return { ok: false, errors }
  }
  const p = parsed.data
  const integrity = checkIntegrity(p)
  if (integrity.length) return { ok: false, errors: integrity }
  return {
    ok: true,
    payload: p,
    summary: {
      exportedAt: p.exportedAt,
      sessions: p.data.sessions.length,
      completedSessions: p.data.sessions.filter((s) => s.status === 'completed').length,
      sets: p.data.sets.length,
      bodyMetrics: p.data.bodyMetrics.length,
      plans: p.data.plans.length,
    },
  }
}

function checkIntegrity(p: ExportPayload): string[] {
  const errors: string[] = []
  const sessionIds = new Set(p.data.sessions.map((s) => s.id))
  for (const [name, rows] of Object.entries(p.data)) {
    const ids = (rows as { id: string }[]).map((r) => r.id)
    if (new Set(ids).size !== ids.length) errors.push(`Powtórzone identyfikatory w „${name}”.`)
  }
  if (p.schemaVersion < 2 && exportFormatFor(p.data.sessions) === 2) errors.push('Kopia w formacie 1 zawiera dane formatu 2 (status „cancelled” lub planAdvance).')
  for (const s of p.data.sessions) {
    if (s.status !== 'in_progress' && !s.finishedAt) errors.push(`Sesja ${s.id}: zakończona bez daty zakończenia.`)
    if (s.status === 'in_progress' && s.finishedAt) errors.push(`Sesja ${s.id}: w toku, a ma datę zakończenia.`)
    if (s.planAdvance !== undefined && s.status !== 'completed') errors.push(`Sesja ${s.id}: wybór planu (planAdvance) dozwolony tylko dla ukończonej sesji.`)
  }
  const orphanSets = p.data.sets.filter((s) => !sessionIds.has(s.sessionId)).length
  if (orphanSets) errors.push(`${orphanSets} serii odwołuje się do nieistniejących sesji.`)
  if (p.data.programs.filter((x) => x.status === 'active').length > 1) errors.push('Więcej niż jeden aktywny program.')
  if (p.data.sessions.filter((s) => s.status === 'in_progress').length > 1) errors.push('Więcej niż jedna niedokończona sesja.')
  const planIds = new Set(p.data.plans.map((x) => x.id))
  if (p.data.programs.some((x) => !planIds.has(x.planId))) errors.push('Program odwołuje się do nieistniejącego planu.')
  return errors.length > 8 ? [...errors.slice(0, 8), `…oraz ${errors.length - 8} innych błędów.`] : errors
}

const SNAPSHOT_LIMIT = 3

/**
 * Replaces all data with the payload. The current data is first stored as an
 * internal snapshot so the import can be undone.
 */
export async function restoreFromPayload(payload: ExportPayload): Promise<void> {
  const current = await buildExport()
  const tables = [db.plans, db.programs, db.sessions, db.sets, db.bodyMetrics, db.suggestions, db.settings, db.snapshots]
  await db.transaction('rw', tables, async () => {
    await db.snapshots.add({ id: uuid(), createdAt: nowIso(), reason: 'Przed importem kopii', payload: JSON.stringify(current) })
    const snaps = await db.snapshots.orderBy('createdAt').toArray()
    if (snaps.length > SNAPSHOT_LIMIT) await db.snapshots.bulkDelete(snaps.slice(0, snaps.length - SNAPSHOT_LIMIT).map((s) => s.id))
    await Promise.all([db.plans.clear(), db.programs.clear(), db.sessions.clear(), db.sets.clear(), db.bodyMetrics.clear(), db.suggestions.clear(), db.settings.clear()])
    const d = payload.data
    await db.plans.bulkAdd(d.plans)
    await db.programs.bulkAdd(d.programs)
    await db.sessions.bulkAdd(d.sessions)
    await db.sets.bulkAdd(d.sets)
    await db.bodyMetrics.bulkAdd(d.bodyMetrics)
    await db.suggestions.bulkAdd(d.suggestions)
    await db.settings.bulkAdd(d.settings)
  })
  await ensureInitialized()
}

export async function restoreSnapshot(id: string): Promise<void> {
  const snap = await db.snapshots.get(id)
  if (!snap) throw new Error('Nie znaleziono kopii wewnętrznej.')
  const result = validateImport(snap.payload)
  if (!result.ok) throw new Error(result.errors.join(' '))
  await restoreFromPayload(result.payload)
  await db.snapshots.delete(id)
}

/**
 * Offers the backup file to the user. On iOS the share sheet ("Zapisz w
 * Plikach") is the reliable path; elsewhere a regular download is used.
 */
export async function deliverExportFile(json: string, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = new Blob([json], { type: 'application/json' })
  const file = typeof File !== 'undefined' ? new File([blob], fileName, { type: 'application/json' }) : null
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  const isTouch = window.matchMedia?.('(pointer: coarse)').matches
  if (file && isTouch && nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: 'Kopia Silk FBW' })
      return 'shared'
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return 'cancelled'
      // fall through to a regular download
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
