import { describe, expect, it } from 'vitest'
import { comparePerformances, evaluatePerformance, fmtKg, roundToStep } from './progression'
import { perf, set } from '../test/factories'

const STEP = 2

describe('evaluatePerformance', () => {
  it('suggests +step when all required sets hit the top with adequate RIR and technique', () => {
    const ev = evaluatePerformance(perf([set(), set(), set()]), STEP)
    expect(ev.status).toBe('increase')
    expect(ev.workingWeightKg).toBe(16)
    expect(ev.suggestedWeightKg).toBe(18)
  })

  it('uses the configured weight step', () => {
    expect(evaluatePerformance(perf([set(), set(), set()]), 2.5).suggestedWeightKg).toBe(18.5)
    expect(evaluatePerformance(perf([set({ weightKg: 7 }), set({ weightKg: 7 }), set({ weightKg: 7 })]), 1).suggestedWeightKg).toBe(8)
  })

  it('does not suggest when one set misses the top of the range', () => {
    const ev = evaluatePerformance(perf([set(), set(), set({ reps: 11 })]), STEP)
    expect(ev.status).toBe('hold')
    expect(ev.suggestedWeightKg).toBeNull()
  })

  it('does not suggest when RIR is below the weekly target', () => {
    const ev = evaluatePerformance(perf([set(), set({ rir: 1 }), set()], {}, 2), STEP)
    expect(ev.status).toBe('hold')
    expect(ev.reasons[0]).toMatch(/RIR/)
  })

  it('treats missing RIR as not ready', () => {
    const ev = evaluatePerformance(perf([set(), set({ rir: null }), set()]), STEP)
    expect(ev.status).toBe('hold')
  })

  it('does not suggest when technique was flagged', () => {
    const ev = evaluatePerformance(perf([set(), set({ techniqueOk: false }), set()]), STEP)
    expect(ev.status).toBe('hold')
    expect(ev.reasons[0]).toMatch(/technicznie/)
  })

  it('requires all planned sets — skipped sets block the suggestion', () => {
    const ev = evaluatePerformance(perf([set(), set(), set({ status: 'skipped' })]), STEP)
    expect(ev.status).toBe('incomplete')
  })

  it('ignores warm-up sets and extra sets when judging required sets', () => {
    const ev = evaluatePerformance(
      perf([set({ type: 'warmup', reps: 5, weightKg: 8, rir: 6 }), set(), set(), set(), set({ isExtra: true, reps: 6, rir: 0 })]),
      STEP,
    )
    expect(ev.status).toBe('increase')
  })

  it('respects the per-week planned set count (T1 = 2 sets)', () => {
    const ev = evaluatePerformance(perf([set(), set()], { plannedSets: 2 }), STEP)
    expect(ev.status).toBe('increase')
  })

  it('unilateral: the weaker side must reach the top', () => {
    const uni = { perSide: true }
    const s = (l: number, r: number) => set({ reps: null, repsLeft: l, repsRight: r })
    expect(evaluatePerformance(perf([s(12, 12), s(12, 12), s(12, 12)], uni), STEP).status).toBe('increase')
    expect(evaluatePerformance(perf([s(12, 12), s(12, 11), s(12, 12)], uni), STEP).status).toBe('hold')
  })

  it('proposes unifying loads when sets used different weights', () => {
    const ev = evaluatePerformance(perf([set({ weightKg: 14 }), set({ weightKg: 16 }), set({ weightKg: 16 })]), STEP)
    expect(ev.status).toBe('unify')
    expect(ev.suggestedWeightKg).toBe(16)
  })

  it('flags most sets below the range', () => {
    const ev = evaluatePerformance(perf([set({ reps: 6 }), set({ reps: 7 }), set({ reps: 9 })]), STEP)
    expect(ev.status).toBe('below-range')
    expect(ev.suggestedWeightKg).toBeNull()
  })

  it('timed bodyweight exercise (plank) never yields a load number', () => {
    const plank = { unit: 'seconds' as const, repMin: 30, repMax: 60, loaded: false }
    const s = (d: number) => set({ reps: null, weightKg: null, durationSec: d, rir: null })
    const top = evaluatePerformance(perf([s(60), s(62), s(60)], plank), STEP)
    expect(top.status).toBe('bodyweight-top')
    expect(top.suggestedWeightKg).toBeNull()
    expect(evaluatePerformance(perf([s(45), s(40), s(60)], plank), STEP).status).toBe('hold')
  })

  it('never produces arbitrary values — suggestion is always last load + step', () => {
    for (const w of [2, 4.5, 10, 22.5, 30]) {
      const ev = evaluatePerformance(perf([set({ weightKg: w }), set({ weightKg: w }), set({ weightKg: w })]), STEP)
      expect(ev.suggestedWeightKg).toBe(w + STEP)
    }
  })
})

describe('comparePerformances', () => {
  it('first session', () => {
    expect(comparePerformances(perf([set()]), null).trend).toBe('first')
  })

  it('more reps at same weight = improved', () => {
    const prev = perf([set({ reps: 10 }), set({ reps: 9 })])
    const curr = perf([set({ reps: 11 }), set({ reps: 10 })])
    expect(comparePerformances(curr, prev).trend).toBe('improved')
  })

  it('extra sets alone are not a strength gain (only common sets compared)', () => {
    const prev = perf([set({ reps: 10 }), set({ reps: 10 })], { plannedSets: 2 })
    const curr = perf([set({ reps: 10 }), set({ reps: 10 }), set({ reps: 10 })])
    expect(comparePerformances(curr, prev).trend).toBe('same')
  })

  it('a different load is never auto-labelled as strength gain or loss', () => {
    const up = comparePerformances(perf([set({ weightKg: 18, reps: 8 })]), perf([set({ weightKg: 16, reps: 12 })]))
    expect(up.trend).toBe('load-changed')
    expect(up.detail).toContain('16 kg → 18 kg')
    expect(up.detail).toContain('12 → 8')
    expect(comparePerformances(perf([set({ weightKg: 14 })]), perf([set({ weightKg: 16 })])).trend).toBe('load-changed')
    expect(comparePerformances(perf([set({ reps: 9 })]), perf([set({ reps: 11 })])).trend).toBe('declined')
  })
})

describe('helpers', () => {
  it('rounds and formats', () => {
    expect(roundToStep(16.3)).toBe(16.25)
    expect(fmtKg(16)).toBe('16 kg')
    expect(fmtKg(16.5)).toBe('16,5 kg')
    expect(fmtKg(null)).toBe('—')
  })
})
