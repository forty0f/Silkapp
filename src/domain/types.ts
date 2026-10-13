// Core domain model. Every persisted record carries a string UUID, `updatedAt`
// and an optional `deletedAt` tombstone so a future multi-device sync can
// merge records without schema changes.

export type WorkoutType = 'A' | 'B'
export type ExerciseUnit = 'reps' | 'seconds'
export type Phase = 'adaptation' | 'continuation'

export type ExerciseId =
  | 'goblet-squat'
  | 'flat-db-press'
  | 'one-arm-row'
  | 'romanian-deadlift'
  | 'lateral-raise'
  | 'plank'
  | 'incline-db-press'
  | 'reverse-lunge'
  | 'chest-supported-row'
  | 'db-overhead-press'
  | 'db-hip-thrust'
  | 'db-biceps-curl'

export interface SyncMeta {
  id: string
  createdAt: string // ISO
  updatedAt: string // ISO
  deletedAt?: string | null
}

export interface RirTarget {
  min: number
  max: number
}

/** Prescription of a single exercise inside a plan version. */
export interface PlanExercise {
  exerciseId: ExerciseId
  repMin: number
  repMax: number
  unit: ExerciseUnit
  /** Reps counted per side (left and right logged separately). */
  perSide: boolean
  /** Working sets for adaptation weeks 1..4 (T1..T4). */
  setsByWeek: [number, number, number, number]
  /** Working sets after the adaptation block. */
  continuationSets: number
  restSec: number
  /** Whether the load is dumbbell weight (false for bodyweight plank). */
  loaded: boolean
}

/** Immutable plan version. Editing the plan creates a new version. */
export interface PlanVersion extends SyncMeta {
  version: number
  name: string
  note: string
  adaptationWeeks: number
  rirByWeek: RirTarget[] // index 0 = week 1
  continuationRir: RirTarget
  workouts: Record<WorkoutType, PlanExercise[]>
}

export interface Program extends SyncMeta {
  name: string
  planId: string
  startedAt: string
  status: 'active' | 'archived'
}

/** Snapshot of the prescription used in a session (frozen at start). */
export interface SessionExercise extends PlanExercise {
  name: string
  order: number
  plannedSets: number
}

/**
 * in_progress — started (also when left/paused; resumable)
 * completed   — finished with at least one performed working set; counts toward the plan
 * cancelled   — finished without any performed working set; kept in history, never counted
 */
export type SessionStatus = 'in_progress' | 'completed' | 'cancelled'

export interface RestTimer {
  exerciseId: ExerciseId
  startedAt: number // epoch ms
  durationSec: number
}

export interface Session extends SyncMeta {
  programId: string
  planId: string
  planVersion: number
  workoutType: WorkoutType
  /** 1-based index of this session in the program. */
  sessionNumber: number
  week: number
  slot: number // 1..3 within the training week
  phase: Phase
  targetRir: RirTarget
  status: SessionStatus
  startedAt: string
  finishedAt: string | null
  exercises: SessionExercise[]
  currentExerciseIndex: number
  restTimer: RestTimer | null
  note: string
}

export type SetType = 'warmup' | 'working'
export type SetStatus = 'done' | 'skipped'

export interface SetEntry extends SyncMeta {
  sessionId: string
  exerciseId: ExerciseId
  type: SetType
  /** Order within the exercise+type (1-based). */
  setNumber: number
  /** Working set added beyond the planned count. */
  isExtra: boolean
  status: SetStatus
  /** Weight of ONE dumbbell in kg (null for bodyweight). */
  weightKg: number | null
  /** Bilateral reps. */
  reps: number | null
  /** Unilateral reps. */
  repsLeft: number | null
  repsRight: number | null
  /** Timed sets (plank). */
  durationSec: number | null
  rir: number | null
  techniqueOk: boolean
  note: string
}

export interface BodyMetric extends SyncMeta {
  date: string // YYYY-MM-DD
  weightKg: number | null
  waistCm: number | null
  note: string
}

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected'

export interface Suggestion extends SyncMeta {
  exerciseId: ExerciseId
  sourceSessionId: string
  fromWeightKg: number
  toWeightKg: number
  status: SuggestionStatus
  decidedAt: string | null
}

export interface Settings {
  id: 'settings'
  weightStepKg: number
  soundEnabled: boolean
  vibrationEnabled: boolean
  keepScreenOn: boolean
  lastExportAt: string | null
  updatedAt: string
}
