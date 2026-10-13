// Backup format compatibility (format 1 ↔ format 2) and safe import.
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { buildExport, exportFormatFor, restoreFromPayload, validateImport } from '../db/backup'
import { ensureInitialized, getNextSessionInfo, reopenSession } from '../db/repo'
import { advancesPlan } from '../domain/sessionState'

const seed = readFileSync('tests/fixtures/seed.json', 'utf8')
const seed2 = readFileSync('tests/fixtures/seed-format2.json', 'utf8')
const mutate = (text: string, fn: (d: { schemaVersion: number; data: Record<string, Record<string, unknown>[]> }) => void) => {
  const d = JSON.parse(text)
  fn(d)
  return JSON.stringify(d)
}
async function importText(text: string) {
  const r = validateImport(text)
  if (!r.ok) throw new Error(r.errors.join('; '))
  await restoreFromPayload(r.payload)
}

beforeEach(async () => {
  await db.delete()
  await db.open()
  await ensureInitialized()
})

describe('format 2 import', () => {
  it('accepts cancelled sessions and planAdvance', () => {
    const r = validateImport(seed2)
    expect(r.ok).toBe(true)
  })

  it('format-1 files still import unchanged', async () => {
    await importText(seed)
    const exp = await buildExport()
    expect(exp.schemaVersion).toBe(1) // no format-2 content → stays importable by older versions
  })

  it('round trip keeps cancelled status and planAdvance', async () => {
    await importText(seed2)
    const exp = await buildExport()
    expect(exp.schemaVersion).toBe(2)
    const byId = new Map(exp.data.sessions.map((s) => [s.id, s]))
    expect(byId.get('fmt2-cancelled')!.status).toBe('cancelled')
    expect(byId.get('fmt2-partial')!.planAdvance).toBe(false)
    expect(byId.get('fmt2-cancelled')!.planAdvance).toBeUndefined()
  })

  it('plan position: repeat-partial and cancelled sessions do not advance the plan', async () => {
    await importText(seed2)
    const info = (await getNextSessionInfo())!
    // seed: 11 sessions, last A → next B, week 4 slot 3; the two format-2 sessions change nothing
    expect(info.type).toBe('B')
    expect(info.position).toMatchObject({ week: 4, slot: 3 })
  })
})

describe('strict validation', () => {
  it('rejects an unknown status', () => {
    const r = validateImport(mutate(seed2, (d) => (d.data.sessions[0].status = 'paused')))
    expect(r.ok).toBe(false)
  })
  it('rejects a non-boolean planAdvance', () => {
    expect(validateImport(mutate(seed2, (d) => (d.data.sessions[0].planAdvance = 'yes'))).ok).toBe(false)
  })
  it('rejects planAdvance on a cancelled or in-progress session', () => {
    expect(validateImport(mutate(seed2, (d) => (d.data.sessions.find((s) => s.id === 'fmt2-cancelled')!.planAdvance = true))).ok).toBe(false)
  })
  it('rejects a finished session without finishedAt', () => {
    expect(validateImport(mutate(seed2, (d) => (d.data.sessions.find((s) => s.id === 'fmt2-cancelled')!.finishedAt = null))).ok).toBe(false)
  })
  it('rejects format-2 content declared as format 1', () => {
    expect(validateImport(mutate(seed2, (d) => (d.schemaVersion = 1))).ok).toBe(false)
  })
  it('rejects a file from a newer format with a clear message', () => {
    const r = validateImport(mutate(seed2, (d) => (d.schemaVersion = 3)))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toContain('nowszej wersji')
  })
  it('rejects duplicate ids', () => {
    expect(validateImport(mutate(seed, (d) => d.data.sets.push({ ...d.data.sets[0] }))).ok).toBe(false)
  })
})

describe('failed import never damages the current database', () => {
  it('a payload failing inside the write transaction leaves all data as it was', async () => {
    await importText(seed)
    const before = await buildExport()
    const r = validateImport(seed2)
    if (!r.ok) throw new Error('fixture invalid')
    // Force a constraint error in the middle of the restore (duplicate primary key).
    const broken = structuredClone(r.payload)
    broken.data.bodyMetrics.push({ ...broken.data.bodyMetrics[0] })
    await expect(restoreFromPayload(broken)).rejects.toThrow()
    const after = await buildExport()
    expect({ ...after, exportedAt: '' }).toEqual({ ...before, exportedAt: '' })
  })
})

describe('reopen clears the plan choice', () => {
  it('reopening a repeat-partial session removes planAdvance (it is chosen again on finishing)', async () => {
    await importText(seed2)
    await reopenSession('fmt2-partial')
    const s = (await db.sessions.get('fmt2-partial'))!
    expect(s.status).toBe('in_progress')
    expect('planAdvance' in s).toBe(false)
  })
})

describe('helpers', () => {
  it('advancesPlan keeps the original effect of sessions without the field', () => {
    expect(advancesPlan({ status: 'completed' })).toBe(true)
    expect(advancesPlan({ status: 'completed', planAdvance: true })).toBe(true)
    expect(advancesPlan({ status: 'completed', planAdvance: false })).toBe(false)
    expect(advancesPlan({ status: 'cancelled' })).toBe(false)
    expect(advancesPlan({ status: 'in_progress' })).toBe(false)
    expect(advancesPlan({ status: 'completed', deletedAt: '2026-01-01T00:00:00Z' })).toBe(false)
  })
  it('exportFormatFor', () => {
    expect(exportFormatFor([{ status: 'completed' }])).toBe(1)
    expect(exportFormatFor([{ status: 'cancelled' }])).toBe(2)
    expect(exportFormatFor([{ status: 'completed', planAdvance: true }])).toBe(2)
  })
})
