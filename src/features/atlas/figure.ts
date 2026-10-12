// Parametric stick-figure geometry for the technique illustrations.
// Segment lengths are fixed, knees/elbows are solved with 2-bone inverse
// kinematics, so every pose keeps realistic proportions.

export type Pt = [number, number]

export const L = { thigh: 38, shin: 36, upperArm: 26, forearm: 24, torso: 44, head: 9, neck: 15 }

/** Unit vector for an absolute segment angle: 0° = down, 90° = forward (+x), 180° = up. */
export function vec(deg: number): Pt {
  const r = (deg * Math.PI) / 180
  return [Math.sin(r), Math.cos(r)]
}

export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]]
export const scale = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k]
export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])

/** Middle joint of a two-segment chain from `a` to `c`. `bend` picks the side. */
export function ik(a: Pt, c: Pt, l1: number, l2: number, bend: 1 | -1): Pt {
  const dx = c[0] - a[0]
  const dy = c[1] - a[1]
  const d = Math.min(Math.max(Math.hypot(dx, dy), Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01)
  const ux = dx / (Math.hypot(dx, dy) || 1)
  const uy = dy / (Math.hypot(dx, dy) || 1)
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(l1 * l1 - along * along, 0))
  return [a[0] + along * ux + bend * h * -uy, a[1] + along * uy + bend * h * ux]
}

/** Clamp an end effector to the chain's reach (keeps limbs at true length). */
export function reach(a: Pt, c: Pt, max: number): Pt {
  const d = dist(a, c)
  if (d <= max) return c
  return add(a, scale([c[0] - a[0], c[1] - a[1]], max / d))
}

export interface SidePose {
  view: 'side'
  hip: Pt
  torso: number
  headTilt?: number
  ankle: Pt
  knee: 1 | -1
  foot?: number
  ankle2?: Pt
  knee2?: 1 | -1
  foot2?: number
  hand: Pt
  elbow: 1 | -1
  hand2?: Pt
  elbow2?: 1 | -1
}

export interface FrontPose {
  view: 'front'
  handL: Pt
  handR: Pt
}

export type Pose = SidePose | FrontPose

export interface Segment {
  a: Pt
  b: Pt
  w: number
  layer: 'far' | 'body' | 'near'
}

export interface SolvedFigure {
  segments: Segment[]
  head: Pt
  hands: Pt[]
  hip: Pt
  shoulder: Pt
  torsoPolygon?: Pt[]
}

export function solve(pose: Pose): SolvedFigure {
  return pose.view === 'side' ? solveSide(pose) : solveFront(pose)
}

function solveSide(p: SidePose): SolvedFigure {
  const shoulder = add(p.hip, scale(vec(p.torso), L.torso))
  const head = add(shoulder, scale(vec(p.torso + (p.headTilt ?? 0)), L.neck))
  const segs: Segment[] = []
  const leg = (ankleIn: Pt, bend: 1 | -1, footAngle: number, layer: Segment['layer']) => {
    const ankle = reach(p.hip, ankleIn, L.thigh + L.shin - 0.01)
    const knee = ik(p.hip, ankle, L.thigh, L.shin, bend)
    segs.push({ a: p.hip, b: knee, w: 11, layer }, { a: knee, b: ankle, w: 9, layer })
    segs.push({ a: ankle, b: add(ankle, scale(vec(footAngle), 12)), w: 6, layer })
  }
  const arm = (handIn: Pt, bend: 1 | -1, layer: Segment['layer']) => {
    const hand = reach(shoulder, handIn, L.upperArm + L.forearm - 0.01)
    const elbow = ik(shoulder, hand, L.upperArm, L.forearm, bend)
    segs.push({ a: shoulder, b: elbow, w: 8, layer }, { a: elbow, b: hand, w: 7, layer })
    return hand
  }
  const hands: Pt[] = []
  if (p.ankle2) leg(p.ankle2, p.knee2 ?? p.knee, p.foot2 ?? p.foot ?? 90, 'far')
  if (p.hand2) hands.push(arm(p.hand2, p.elbow2 ?? p.elbow, 'far'))
  segs.push({ a: p.hip, b: shoulder, w: 15, layer: 'body' })
  segs.push({ a: shoulder, b: add(shoulder, scale(vec(p.torso + (p.headTilt ?? 0)), 6)), w: 7, layer: 'body' })
  leg(p.ankle, p.knee, p.foot ?? 90, 'near')
  hands.unshift(arm(p.hand, p.elbow, 'near'))
  return { segments: segs, head, hands, hip: p.hip, shoulder }
}

function solveFront(p: FrontPose): SolvedFigure {
  const sL: Pt = [86, 36]
  const sR: Pt = [114, 36]
  const segs: Segment[] = []
  for (const [hip, ankle] of [[[93, 80], [92, 147]], [[107, 80], [108, 147]]] as [Pt, Pt][]) {
    const knee: Pt = [(hip[0] + ankle[0]) / 2, (hip[1] + ankle[1]) / 2]
    segs.push({ a: hip, b: knee, w: 11, layer: 'body' }, { a: knee, b: ankle, w: 9, layer: 'body' })
    segs.push({ a: ankle, b: [ankle[0] + (hip[0] < 100 ? -7 : 7), ankle[1] + 1], w: 6, layer: 'body' })
  }
  const hands: Pt[] = []
  for (const [s, h, bend] of [[sL, p.handL, 1], [sR, p.handR, -1]] as [Pt, Pt, 1 | -1][]) {
    const hand = reach(s, h, 49.9)
    const elbow = ik(s, hand, L.upperArm, L.forearm, bend)
    segs.push({ a: s, b: elbow, w: 8, layer: 'near' }, { a: elbow, b: hand, w: 7, layer: 'near' })
    hands.push(hand)
  }
  segs.push({ a: [100, 28], b: [100, 20], w: 7, layer: 'body' })
  return {
    segments: segs,
    head: [100, 15],
    hands,
    hip: [100, 80],
    shoulder: [100, 36],
    torsoPolygon: [[84, 31], [116, 31], [110, 82], [90, 82]],
  }
}
