// Generates tests/fixtures/seed.json (realistic multi-week history) through the
// real repository code. Run with: GEN_SEED=1 npx vitest run src/test/seed.gen.test.ts
import { writeFileSync } from 'node:fs'
import { it } from 'vitest'
import { db } from '../db/db'
import { buildExport } from '../db/backup'
import { decideSuggestion, ensureInitialized, finishSession, saveSet, startSession } from '../db/repo'

it.skipIf(!process.env.GEN_SEED)('generate seed', async () => {
  await db.delete()
  await db.open()
  await ensureInitialized()
  const base: Record<string, number> = {
    'goblet-squat': 14, 'flat-db-press': 14, 'one-arm-row': 16, 'romanian-deadlift': 16, 'lateral-raise': 5, plank: 0,
    'incline-db-press': 12, 'reverse-lunge': 8, 'chest-supported-row': 12, 'db-overhead-press': 10, 'db-hip-thrust': 18, 'db-biceps-curl': 8,
  }
  const start = new Date(2026, 8, 14, 18, 0) // Mon 14 Sep 2026
  const dayOffsets = [0, 2, 4]
  for (let i = 0; i < 11; i++) {
    const s = await startSession()
    const when = new Date(start)
    when.setDate(start.getDate() + Math.floor(i / 3) * 7 + dayOffsets[i % 3])
    for (const ex of s.exercises) {
      const w = base[ex.exerciseId]
      for (let k = 0; k < ex.plannedSets; k++) {
        const r = Math.min(ex.repMax, ex.repMin + 1 + Math.floor(i / 2) + (k === ex.plannedSets - 1 ? -1 : 0))
        await saveSet({
          sessionId: s.id, exerciseId: ex.exerciseId, type: 'working', isExtra: false, status: 'done',
          weightKg: ex.loaded ? w : null,
          reps: ex.unit === 'reps' && !ex.perSide ? r : null,
          repsLeft: ex.perSide ? r : null, repsRight: ex.perSide ? Math.max(ex.repMin, r - (k % 2)) : null,
          durationSec: ex.unit === 'seconds' ? 35 + i * 3 + k * 2 : null,
          rir: ex.unit === 'reps' ? Math.max(s.targetRir.min, s.targetRir.max) : null, techniqueOk: true, note: '',
        })
      }
    }
    const sugs = await finishSession(s.id)
    for (const sug of sugs) {
      await decideSuggestion(sug.id, true)
      base[sug.exerciseId] = sug.toWeightKg
    }
    const finished = new Date(when.getTime() + 52 * 60000)
    await db.sessions.update(s.id, { startedAt: when.toISOString(), finishedAt: finished.toISOString(), createdAt: when.toISOString(), updatedAt: finished.toISOString() })
  }
  for (let d = 0; d < 26; d += 2) {
    const date = new Date(start)
    date.setDate(start.getDate() + d)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    await db.bodyMetrics.add({ id: `bm-${d}`, date: key, weightKg: Math.round((92.4 - d * 0.09 + Math.sin(d) * 0.5) * 10) / 10, waistCm: d % 6 === 0 ? 101 - d * 0.12 : null, note: '', createdAt: date.toISOString(), updatedAt: date.toISOString(), deletedAt: null })
  }
  writeFileSync('tests/fixtures/seed.json', JSON.stringify(await buildExport(), null, 1))
}, 30000)
