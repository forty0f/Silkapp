// Geometric verification of the technique illustrations.
// Each exercise is checked against measurable criteria that encode the coaching
// cues written on its atlas card (joint angles, segment orientation, contact
// points). This verifies that the drawings depict those positions; it is not a
// substitute for review by a qualified coach.
import { describe, expect, it } from 'vitest'
import { EXERCISE_IDS } from '../../domain/exercises'
import type { ExerciseId } from '../../domain/types'
import { dist, L, solve, type Pt, type SidePose } from './figure'
import { ART } from './poses'

const deg = (r: number) => (r * 180) / Math.PI
/** Inner angle at b (degrees). */
const angleAt = (a: Pt, b: Pt, c: Pt) => {
  const v1 = [a[0] - b[0], a[1] - b[1]]
  const v2 = [c[0] - b[0], c[1] - b[1]]
  return deg(Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]))))
}
/** Deviation of segment a→b from vertical (0 = vertical). */
const fromVertical = (a: Pt, b: Pt) => deg(Math.atan2(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])))
/** Deviation of segment a→b from horizontal (0 = horizontal). */
const fromHorizontal = (a: Pt, b: Pt) => deg(Math.atan2(Math.abs(b[1] - a[1]), Math.abs(b[0] - a[0])))

const FLOOR = 151
const j = (id: ExerciseId, phase: 'start' | 'end') => solve(ART[id][phase]).joints

describe('all illustrations: anatomical consistency', () => {
  for (const id of EXERCISE_IDS) {
    for (const phase of ['start', 'end'] as const) {
      it(`${id} / ${phase}: segment lengths kept, limbs reach their targets, nothing below the floor`, () => {
        const pose = ART[id][phase]
        const fig = solve(pose)
        for (const p of Object.values(fig.joints)) expect(p[1]).toBeLessThanOrEqual(FLOOR + 0.5)
        if (pose.view === 'side') {
          const sp = pose as SidePose
          const jt = fig.joints
          expect(dist(jt.hip, jt.shoulder)).toBeCloseTo(L.torso, 1)
          expect(dist(jt.hip, jt.knee)).toBeCloseTo(L.thigh, 1)
          expect(dist(jt.knee, jt.ankle)).toBeCloseTo(L.shin, 1)
          expect(dist(jt.shoulder, jt.elbow)).toBeCloseTo(L.upperArm, 1)
          expect(dist(jt.elbow, jt.hand)).toBeCloseTo(L.forearm, 1)
          // Feet and hands actually reach the planted / gripping positions (pose is not over-stretched).
          expect(dist(jt.ankle, sp.ankle)).toBeLessThan(1)
          expect(dist(jt.hand, sp.hand)).toBeLessThan(1.5)
          if (sp.ankle2) expect(dist(jt.ankle2, sp.ankle2)).toBeLessThan(1)
          if (sp.hand2) expect(dist(jt.hand2, sp.hand2)).toBeLessThan(1.5)
        }
      })
    }
  }
})

describe('technique criteria per exercise', () => {
  it('goblet squat: deep squat, knees track forward over the feet, heels down, chest up, DB at the chest', () => {
    const s = j('goblet-squat', 'start')
    const e = j('goblet-squat', 'end')
    expect(angleAt(s.hip, s.knee, s.ankle)).toBeGreaterThan(170)
    expect(e.hip[1]).toBeGreaterThanOrEqual(e.knee[1] - 3) // hip crease at/below knee level
    expect(e.knee[0]).toBeGreaterThan(e.ankle[0]) // knees forward
    expect(dist(e.ankle, s.ankle)).toBeLessThan(0.5) // heels stay planted
    const lean = fromVertical(e.hip, e.shoulder)
    expect(lean).toBeGreaterThan(15)
    expect(lean).toBeLessThan(45)
    expect(dist(e.hand, e.shoulder)).toBeLessThan(25)
    // Balance: shoulders roughly over the mid-foot.
    expect(Math.abs(e.shoulder[0] - (e.ankle[0] + 6))).toBeLessThan(12)
  })

  it('flat DB press: lockout over the shoulder; bottom with vertical forearm and elbow below the torso', () => {
    const s = j('flat-db-press', 'start')
    const e = j('flat-db-press', 'end')
    expect(fromHorizontal(s.hip, s.shoulder)).toBeLessThan(5) // lying flat
    expect(Math.abs(s.hand[0] - s.shoulder[0])).toBeLessThan(10)
    expect(angleAt(s.shoulder, s.elbow, s.hand)).toBeGreaterThan(160)
    expect(fromVertical(e.elbow, e.hand)).toBeLessThan(20)
    expect(e.elbow[1]).toBeGreaterThan(e.shoulder[1])
    expect(e.hand[1]).toBeLessThan(e.elbow[1])
    expect(e.ankle[1]).toBeGreaterThan(144) // feet on the floor
  })

  it('one-arm row: flat back, arm hangs at the start, elbow drives up and back toward the hip', () => {
    const s = j('one-arm-row', 'start')
    const e = j('one-arm-row', 'end')
    expect(fromHorizontal(s.hip, s.shoulder)).toBeLessThan(20)
    expect(fromVertical(s.elbow, s.hand)).toBeLessThan(12)
    expect(angleAt(s.shoulder, s.elbow, s.hand)).toBeGreaterThan(160)
    expect(e.elbow[1]).toBeLessThan(e.shoulder[1] + 3) // elbow at/above the back line
    expect(e.elbow[0]).toBeLessThan(e.shoulder[0]) // pulled back
    expect(e.hand[0]).toBeGreaterThan(e.hip[0])
    expect(e.hand[0]).toBeLessThan(e.shoulder[0]) // DB ends between shoulder and hip
    expect(Math.abs(s.knee2[1] - 108)).toBeLessThan(3) // support knee on the bench
    expect(Math.abs(s.hand2[1] - 107)).toBeLessThan(2) // support hand on the bench
  })

  it('Romanian deadlift: hip hinge with soft knees (not a squat), DBs below the knees close to the legs', () => {
    const s = j('romanian-deadlift', 'start')
    const e = j('romanian-deadlift', 'end')
    expect(fromVertical(s.hip, s.shoulder)).toBeLessThan(3)
    const knee = angleAt(e.hip, e.knee, e.ankle)
    expect(knee).toBeGreaterThan(140)
    expect(knee).toBeLessThan(176)
    expect(angleAt(e.shoulder, e.hip, e.knee)).toBeLessThan(120) // hinge at the hip
    expect(e.hip[0]).toBeLessThan(e.ankle[0] - 15) // hips pushed back
    expect(e.hand[1]).toBeGreaterThan(e.knee[1])
    expect(Math.abs(e.hand[0] - e.ankle[0])).toBeLessThan(15)
    expect(fromVertical(e.elbow, e.hand)).toBeLessThan(10) // arms hang
  })

  it('lateral raise: from the sides to shoulder height, elbows slightly bent and leading', () => {
    const s = j('lateral-raise', 'start')
    const e = j('lateral-raise', 'end')
    expect(s.handL[1]).toBeGreaterThan(75)
    for (const side of ['L', 'R'] as const) {
      expect(Math.abs(e[`hand${side}`][1] - e[`shoulder${side}`][1])).toBeLessThan(8)
      const elbow = angleAt(e[`shoulder${side}`], e[`elbow${side}`], e[`hand${side}`])
      expect(elbow).toBeGreaterThan(150)
      expect(elbow).toBeLessThan(179)
      expect(e[`elbow${side}`][1]).toBeLessThanOrEqual(e[`hand${side}`][1] + 1)
    }
  })

  it('plank: elbows under the shoulders, forearms on the floor, straight shoulder–hip–ankle line', () => {
    const s = j('plank', 'start')
    const e = j('plank', 'end')
    expect(s.knee[1]).toBeGreaterThan(142) // set-up on the knees
    expect(angleAt(e.shoulder, e.hip, e.ankle)).toBeGreaterThan(172)
    expect(Math.abs(e.elbow[0] - e.shoulder[0])).toBeLessThan(3)
    expect(fromHorizontal(e.elbow, e.hand)).toBeLessThan(5)
    expect(e.elbow[1]).toBeGreaterThan(143)
  })

  it('incline DB press: ~30–45° bench, lockout over the shoulders, vertical forearms at the bottom', () => {
    const s = j('incline-db-press', 'start')
    const e = j('incline-db-press', 'end')
    const back = fromHorizontal(s.hip, s.shoulder)
    expect(back).toBeGreaterThanOrEqual(30)
    expect(back).toBeLessThanOrEqual(45)
    const art = ART['incline-db-press'].props[0]
    if (art.kind === 'inclineBench') expect(Math.abs(art.back.angle - back)).toBeLessThan(3) // torso parallel to the pad
    expect(Math.abs(s.hand[0] - s.shoulder[0])).toBeLessThan(10)
    expect(angleAt(s.shoulder, s.elbow, s.hand)).toBeGreaterThan(160)
    expect(fromVertical(e.elbow, e.hand)).toBeLessThan(15)
    expect(e.elbow[1]).toBeGreaterThan(e.shoulder[1])
  })

  it('reverse lunge: vertical front shin, back knee just above the floor, upright torso', () => {
    const s = j('reverse-lunge', 'start')
    const e = j('reverse-lunge', 'end')
    expect(angleAt(s.hip, s.knee, s.ankle)).toBeGreaterThan(170)
    expect(fromVertical(e.knee, e.ankle)).toBeLessThan(15)
    expect(fromHorizontal(e.hip, e.knee)).toBeLessThan(20) // front thigh ~parallel
    expect(e.knee2[1]).toBeGreaterThan(140)
    expect(e.knee2[1]).toBeLessThan(149) // close to, but not on, the floor
    expect(fromVertical(e.hip, e.shoulder)).toBeLessThan(15)
    expect(e.ankle2[0]).toBeLessThan(e.hip[0]) // step went backwards
  })

  it('chest-supported row: torso parallel to a 30–45° pad, arms hang, elbows end behind the shoulders', () => {
    const s = j('chest-supported-row', 'start')
    const e = j('chest-supported-row', 'end')
    const pad = ART['chest-supported-row'].props[0]
    if (pad.kind !== 'proneIncline') throw new Error('pad expected')
    const padAngle = fromHorizontal(pad.from, pad.to)
    expect(padAngle).toBeGreaterThanOrEqual(30)
    expect(padAngle).toBeLessThanOrEqual(45)
    expect(Math.abs(fromHorizontal(s.hip, s.shoulder) - padAngle)).toBeLessThan(5)
    expect(fromVertical(s.elbow, s.hand)).toBeLessThan(10)
    expect(angleAt(s.shoulder, s.elbow, s.hand)).toBeGreaterThan(160)
    expect(e.elbow[0]).toBeLessThan(e.shoulder[0])
    expect(e.elbow[1]).toBeLessThan(e.hand[1])
    expect(s.ankle[1]).toBeGreaterThan(143) // feet on the floor
  })

  it('DB overhead press: DBs at shoulder height with vertical forearms, lockout directly overhead, torso upright', () => {
    const s = j('db-overhead-press', 'start')
    const e = j('db-overhead-press', 'end')
    expect(Math.abs(s.hand[1] - s.shoulder[1])).toBeLessThan(6)
    expect(fromVertical(s.elbow, s.hand)).toBeLessThan(15)
    expect(angleAt(e.shoulder, e.elbow, e.hand)).toBeGreaterThan(165)
    expect(Math.abs(e.hand[0] - e.shoulder[0])).toBeLessThan(8)
    expect(fromVertical(e.hip, e.shoulder)).toBeLessThan(3) // no lumbar lean-back
  })

  it('DB hip thrust: shoulders on the bench, top with shoulder–hip–knee aligned and vertical shins', () => {
    const s = j('db-hip-thrust', 'start')
    const e = j('db-hip-thrust', 'end')
    expect(s.hip[1]).toBeGreaterThan(s.shoulder[1] + 15)
    expect(angleAt(e.shoulder, e.hip, e.knee)).toBeGreaterThan(165)
    expect(fromVertical(e.knee, e.ankle)).toBeLessThan(10)
    const knee = angleAt(e.hip, e.knee, e.ankle)
    expect(knee).toBeGreaterThan(78)
    expect(knee).toBeLessThan(102)
    expect(Math.abs(s.shoulder[1] - 108)).toBeLessThan(4) // upper back at bench height
    expect(dist(s.shoulder, e.shoulder)).toBeLessThan(2) // bench edge is the pivot
  })

  it('biceps curl: elbow stays at the side, full flexion at the top, full extension at the bottom', () => {
    const s = j('db-biceps-curl', 'start')
    const e = j('db-biceps-curl', 'end')
    expect(angleAt(s.shoulder, s.elbow, s.hand)).toBeGreaterThan(165)
    expect(angleAt(e.shoulder, e.elbow, e.hand)).toBeLessThan(60)
    expect(Math.abs(e.elbow[0] - e.shoulder[0])).toBeLessThan(6)
    expect(fromVertical(e.hip, e.shoulder)).toBeLessThan(3)
  })
})
