import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db, isTransientDbError, STORES_V1, SilkDB, withDbRetry } from './db'
import {
  decideSuggestion,
  deleteSet,
  deleteSession,
  ensureInitialized,
  finishSession,
  lastPerformance,
  preferredWeight,
  reopenSession,
  saveSet,
  saveSetDetailed,
  setsForSession,
  startSession,
  updateSettings,
  type SetInput,
} from './repo'
import { buildExport, restoreFromPayload, validateImport } from './backup'
import type { Session } from '../domain/types'

async function reset() {
  await db.delete()
  await db.open()
  await ensureInitialized()
}

function top(session: Session, i: number, p: Partial<SetInput> = {}): SetInput {
  const ex = session.exercises[i]
  return {
    sessionId: session.id, exerciseId: ex.exerciseId, type: 'working', isExtra: false, status: 'done',
    weightKg: ex.loaded ? 16 : null,
    reps: ex.unit === 'reps' && !ex.perSide ? ex.repMax : null,
    repsLeft: ex.perSide ? ex.repMax : null, repsRight: ex.perSide ? ex.repMax : null,
    durationSec: ex.unit === 'seconds' ? ex.repMax : null,
    rir: 4, techniqueOk: true, note: '', ...p,
  }
}

async function complete(p: Partial<SetInput> = {}) {
  const s = await startSession()
  for (let i = 0; i < s.exercises.length; i++) for (let k = 0; k < s.exercises[i].plannedSets; k++) await saveSet(top(s, i, p))
  await finishSession(s.id)
  return s
}

const squatSugs = () => db.suggestions.where('exerciseId').equals('goblet-squat').toArray()

beforeEach(reset)

describe('editing history keeps suggestions consistent', () => {
  it('editing a set below the top of the range withdraws the pending suggestion', async () => {
    const s = await complete()
    expect((await squatSugs()).map((x) => x.status)).toEqual(['pending'])
    const set = (await setsForSession(s.id)).find((x) => x.exerciseId === 'goblet-squat')!
    const res = await saveSetDetailed({ ...set, reps: 10 })
    expect(res.changes.map((c) => c.kind)).toEqual(['withdrawn'])
    expect(await squatSugs()).toEqual([])
  })

  it('editing a set up to the top creates the suggestion', async () => {
    const s = await complete({ reps: 10 })
    expect(await squatSugs()).toEqual([])
    const squat = (await setsForSession(s.id)).filter((x) => x.exerciseId === 'goblet-squat')
    for (const set of squat) await saveSet({ ...set, reps: 12 })
    const sugs = await squatSugs()
    expect(sugs).toHaveLength(1)
    expect(sugs[0]).toMatchObject({ status: 'pending', fromWeightKg: 16, toWeightKg: 18 })
  })

  it('an accepted suggestion invalidated by an edit is withdrawn and the prefill falls back', async () => {
    const s = await complete()
    const sug = (await squatSugs())[0]
    await decideSuggestion(sug.id, true)
    expect(await preferredWeight('goblet-squat', await lastPerformance('goblet-squat'))).toBe(18)
    const set = (await setsForSession(s.id)).find((x) => x.exerciseId === 'goblet-squat')!
    await saveSet({ ...set, techniqueOk: false })
    expect(await squatSugs()).toEqual([])
    expect(await preferredWeight('goblet-squat', await lastPerformance('goblet-squat'))).toBe(16)
  })

  it('changing the load of a decided suggestion re-opens the decision with new values', async () => {
    const s = await complete()
    await decideSuggestion((await squatSugs())[0].id, false)
    for (const set of (await setsForSession(s.id)).filter((x) => x.exerciseId === 'goblet-squat')) await saveSet({ ...set, weightKg: 20 })
    const [sug] = await squatSugs()
    expect(sug).toMatchObject({ status: 'pending', fromWeightKg: 20, toWeightKg: 22, decidedAt: null })
  })

  it('deleting a set of a completed session re-evaluates (incomplete → withdrawn)', async () => {
    const s = await complete()
    const set = (await setsForSession(s.id)).find((x) => x.exerciseId === 'goblet-squat')!
    const changes = await deleteSet(set.id)
    expect(changes.map((c) => c.kind)).toEqual(['withdrawn'])
  })

  it('edits in an older session do not touch the live suggestion of the newer one', async () => {
    const s1 = await complete()
    await complete() // B
    const s3 = await complete() // A again, latest squat
    const latest = await squatSugs()
    expect(latest.filter((x) => x.status === 'pending').map((x) => x.sourceSessionId)).toEqual([s3.id])
    const old = (await setsForSession(s1.id)).find((x) => x.exerciseId === 'goblet-squat')!
    const res = await saveSetDetailed({ ...old, reps: 5 })
    expect(res.changes).toEqual([])
    expect((await squatSugs()).find((x) => x.sourceSessionId === s3.id)?.status).toBe('pending')
  })

  it('deleting the latest session revives the suggestion of the previous performance', async () => {
    await complete()
    await complete()
    const s3 = await complete()
    await deleteSession(s3.id)
    const pending = (await squatSugs()).filter((x) => x.status === 'pending')
    expect(pending).toHaveLength(1)
    expect(pending[0].sourceSessionId).not.toBe(s3.id)
  })

  it('reopen + finish again does not duplicate suggestions', async () => {
    const s = await complete()
    await reopenSession(s.id)
    await finishSession(s.id)
    expect(await squatSugs()).toHaveLength(1)
  })

  it('changing the weight step updates the pending proposal', async () => {
    await complete()
    await updateSettings({ weightStepKg: 2.5 })
    expect((await squatSugs())[0].toWeightKg).toBe(18.5)
  })
})

describe('connection-loss retry', () => {
  it('classifies transient errors', () => {
    expect(isTransientDbError(new Dexie.DatabaseClosedError())).toBe(true)
    expect(isTransientDbError({ name: 'UnknownError', message: 'Connection to Indexed Database server lost. Refresh the page to try again' })).toBe(true)
    expect(isTransientDbError(new Error('Podaj ciężar'))).toBe(false)
    expect(isTransientDbError(new Dexie.ConstraintError())).toBe(false)
  })

  it('reopens the database and retries once', async () => {
    let calls = 0
    const open = vi.spyOn(db, 'open')
    const result = await withDbRetry(async () => {
      calls++
      if (calls === 1) throw new Dexie.DatabaseClosedError()
      return db.sessions.count()
    })
    expect(calls).toBe(2)
    expect(result).toBe(0)
    expect(open).toHaveBeenCalled()
    open.mockRestore()
  })

  it('does not retry validation errors', async () => {
    const fn = vi.fn(async () => {
      throw new Error('Sesja nie istnieje.')
    })
    await expect(withDbRetry(fn)).rejects.toThrow('Sesja nie istnieje.')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('a retried new set is written once (id fixed before the transaction)', async () => {
    const s = await startSession()
    const input = top(s, 0)
    const spy = vi.spyOn(db.sessions, 'update')
    let first = true
    spy.mockImplementation((async (...args: Parameters<typeof db.sessions.update>) => {
      if (first) {
        first = false
        throw new Dexie.DatabaseClosedError()
      }
      spy.mockRestore()
      return db.sessions.update(...args)
    }) as never)
    await saveSet(input)
    expect(await setsForSession(s.id)).toHaveLength(1)
  })
})

describe('schema migration', () => {
  it('upgrading v1 → v2 keeps every record and runs the upgrade', async () => {
    const name = 'silk-migration-test'
    await Dexie.delete(name)
    const v1 = new SilkDB(name)
    await v1.open()
    await v1.sessions.add({ id: 's1', status: 'completed' } as never)
    await v1.sets.add({ id: 'x1', sessionId: 's1', exerciseId: 'goblet-squat', reps: 12 } as never)
    v1.close()

    class V2 extends Dexie {
      constructor() {
        super(name)
        this.version(1).stores(STORES_V1)
        this.version(2)
          .stores({ ...STORES_V1, sets: 'id, sessionId, exerciseId, [sessionId+exerciseId], status' })
          .upgrade((tx) => tx.table('sets').toCollection().modify((s) => { s.migrated = true }))
      }
    }
    const v2 = new V2()
    await v2.open()
    expect(v2.verno).toBe(2)
    expect(await v2.table('sessions').count()).toBe(1)
    expect(await v2.table('sets').get('x1')).toMatchObject({ reps: 12, migrated: true })
    v2.close()
    await Dexie.delete(name)
  })

  it('opening an unchanged schema does not modify data', async () => {
    const s = await complete()
    const before = await buildExport()
    db.close()
    await db.open()
    await ensureInitialized()
    const after = await buildExport()
    expect({ ...after, exportedAt: '' }).toEqual({ ...before, exportedAt: '' })
    expect(after.data.sessions.map((x) => x.id)).toContain(s.id)
  })
})

describe('full backup round-trip (another device)', () => {
  it('export → fresh database → import yields identical data, including an unfinished session', async () => {
    await complete()
    const open = await startSession()
    await saveSet(top(open, 0), { restTimer: { exerciseId: 'goblet-squat', startedAt: 123, durationSec: 120 } })
    await db.bodyMetrics.add({ id: 'b1', date: '2026-10-01', weightKg: 90.2, waistCm: 98.5, note: 'rano', createdAt: open.startedAt, updatedAt: open.startedAt, deletedAt: null })
    const original = await buildExport()
    const json = JSON.stringify(original)

    await db.delete() // "new device": empty database
    await db.open()
    await ensureInitialized()
    const res = validateImport(json)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    await restoreFromPayload(res.payload)

    const restored = await buildExport()
    const norm = (p: typeof original) => {
      const d = structuredClone(p.data)
      for (const k of Object.keys(d) as (keyof typeof d)[]) (d[k] as { id: string }[]).sort((a, b) => a.id.localeCompare(b.id))
      return d
    }
    expect(norm(restored)).toEqual(norm(original))
  })
})

describe('#3 reopenSession keeps suggestions consistent', () => {
  it('reopening withdraws the pending suggestion derived from that session', async () => {
    const s = await complete()
    expect((await squatSugs()).filter((x) => x.status === 'pending')).toHaveLength(1)
    await reopenSession(s.id)
    expect((await squatSugs()).filter((x) => x.sourceSessionId === s.id)).toEqual([])
  })

  it('an accepted suggestion of a reopened session no longer drives the prefill', async () => {
    const s = await complete({ weightKg: 16 })
    await decideSuggestion((await squatSugs())[0].id, true)
    expect(await preferredWeight('goblet-squat', await lastPerformance('goblet-squat'))).toBe(18)
    await reopenSession(s.id)
    expect(await preferredWeight('goblet-squat', await lastPerformance('goblet-squat'))).toBeNull()
  })

  it('reopening restores the suggestion of the previous completed performance', async () => {
    const s1 = await complete()
    await complete() // B
    const s3 = await complete()
    await reopenSession(s3.id)
    const pending = (await squatSugs()).filter((x) => x.status === 'pending')
    expect(pending.map((x) => x.sourceSessionId)).toEqual([s1.id])
  })

  it('finishing again re-evaluates with the edited results', async () => {
    const s = await complete()
    await reopenSession(s.id)
    const set = (await setsForSession(s.id)).find((x) => x.exerciseId === 'goblet-squat')!
    await saveSet({ ...set, reps: 9 })
    await finishSession(s.id)
    expect((await squatSugs()).filter((x) => x.sourceSessionId === s.id)).toEqual([])
  })
})
