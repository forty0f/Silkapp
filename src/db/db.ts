import Dexie, { type EntityTable } from 'dexie'
import type { BodyMetric, PlanVersion, Program, Session, SetEntry, Settings, Suggestion } from '../domain/types'

export interface Snapshot {
  id: string
  createdAt: string
  reason: string
  /** Serialized export payload (see backup.ts). */
  payload: string
}

export const DB_NAME = 'silkapp'

/**
 * Bump `SCHEMA_VERSION` together with a new `this.version(n)` block.
 * Dexie keeps older version blocks so existing installs migrate in place;
 * never edit or remove an older block — always add a new one with an
 * `.upgrade()` transform. Export files carry the same number (backup.ts
 * migrates older payloads on import).
 */
export const SCHEMA_VERSION = 1

export class SilkDB extends Dexie {
  plans!: EntityTable<PlanVersion, 'id'>
  programs!: EntityTable<Program, 'id'>
  sessions!: EntityTable<Session, 'id'>
  sets!: EntityTable<SetEntry, 'id'>
  bodyMetrics!: EntityTable<BodyMetric, 'id'>
  suggestions!: EntityTable<Suggestion, 'id'>
  settings!: EntityTable<Settings, 'id'>
  snapshots!: EntityTable<Snapshot, 'id'>

  constructor(name = DB_NAME) {
    super(name)
    this.version(1).stores({
      plans: 'id, version',
      programs: 'id, status',
      sessions: 'id, programId, status, startedAt, [programId+status]',
      sets: 'id, sessionId, exerciseId, [sessionId+exerciseId]',
      bodyMetrics: 'id, date',
      suggestions: 'id, exerciseId, status, sourceSessionId',
      settings: 'id',
      snapshots: 'id, createdAt',
    })
    // Example for the next schema change:
    // this.version(2).stores({ ... }).upgrade(async (tx) => { ... })
  }
}

export const db = new SilkDB()

export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Fallback for non-secure contexts (e.g. testing over plain HTTP on a LAN IP).
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const nowIso = () => new Date().toISOString()
