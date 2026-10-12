import type { ExerciseId } from '../../domain/types'
import type { Pose, Pt } from './figure'

export type Prop =
  | { kind: 'flatBench'; x1: number; x2: number; top: number }
  | { kind: 'inclineBench'; seat: [number, number]; top: number; back: { from: Pt; angle: number; length: number } }
  | { kind: 'proneIncline'; from: Pt; to: Pt }
  | { kind: 'mat'; x1: number; x2: number }

export type DumbbellStyle = 'endOn' | 'goblet' | 'hip'

export interface ExerciseArt {
  viewBox: string
  start: Pose
  end: Pose
  props: Prop[]
  dumbbell: DumbbellStyle | null
  /** Dumbbells drawn only on the near hand (single-arm work). */
  singleDumbbell?: boolean
  /** Which point the motion arrow follows and how much it curves. */
  arrow: { track: 'hand' | 'hip'; bend: number; shift?: Pt; from?: Pt; to?: Pt }
}

const STAND = { hip: [100, 73] as Pt, torso: 180, ankle: [100, 147] as Pt, ankle2: [95, 147] as Pt, knee: -1 as const }

export const ART: Record<ExerciseId, ExerciseArt> = {
  'goblet-squat': {
    viewBox: '20 0 170 160',
    start: { view: 'side', ...STAND, hand: [113, 33], elbow: 1 },
    end: { view: 'side', hip: [81, 121], torso: 150, ankle: [100, 147], ankle2: [95, 147], knee: -1, hand: [116, 88], elbow: 1 },
    props: [],
    dumbbell: 'goblet',
    arrow: { track: 'hip', bend: -10, shift: [-14, 0] },
  },
  'flat-db-press': {
    viewBox: '10 20 180 140',
    start: { view: 'side', hip: [98, 104], torso: -90, ankle: [142, 147], knee: -1, hand: [57, 56], elbow: 1, hand2: [60, 57] },
    end: { view: 'side', hip: [98, 104], torso: -90, ankle: [142, 147], knee: -1, hand: [72, 97], elbow: 1, hand2: [75, 98] },
    props: [{ kind: 'flatBench', x1: 22, x2: 128, top: 113 }],
    dumbbell: 'endOn',
    arrow: { track: 'hand', bend: 0, shift: [22, 0] },
  },
  'one-arm-row': {
    viewBox: '10 20 180 140',
    start: { view: 'side', hip: [80, 75], torso: 98, ankle: [76, 147], knee: 1, ankle2: [30, 107], knee2: -1, foot2: -90, hand: [125, 117], elbow: 1, hand2: [128, 107], elbow2: 1 },
    end: { view: 'side', hip: [80, 75], torso: 98, ankle: [76, 147], knee: 1, ankle2: [30, 107], knee2: -1, foot2: -90, hand: [103, 80], elbow: 1, hand2: [128, 107], elbow2: 1 },
    props: [{ kind: 'flatBench', x1: 20, x2: 140, top: 113 }],
    dumbbell: 'endOn',
    singleDumbbell: true,
    arrow: { track: 'hand', bend: -12, shift: [14, 6] },
  },
  'romanian-deadlift': {
    viewBox: '20 0 170 160',
    start: { view: 'side', ...STAND, hand: [102, 78.5], elbow: 1, hand2: [100, 78.5] },
    end: { view: 'side', hip: [70, 82], torso: 110, ankle: [100, 147], ankle2: [95, 147], knee: -1, hand: [112, 114], elbow: 1, hand2: [110, 114] },
    props: [],
    dumbbell: 'endOn',
    arrow: { track: 'hip', bend: -6, shift: [-6, -12] },
  },
  'lateral-raise': {
    viewBox: '10 -2 180 160',
    start: { view: 'front', handL: [80, 85], handR: [120, 85] },
    end: { view: 'front', handL: [38, 42], handR: [162, 42] },
    props: [],
    dumbbell: 'endOn',
    arrow: { track: 'hand', bend: 16, shift: [8, 6] },
  },
  plank: {
    viewBox: '10 70 180 90',
    start: { view: 'side', hip: [98.3, 134], torso: 108.5, ankle: [27, 136], knee: -1, foot: -90, hand: [164, 146], elbow: 1 },
    end: { view: 'side', hip: [96.5, 126.7], torso: 98.8, ankle: [23.4, 138], knee: -1, foot: 15, hand: [164, 146], elbow: 1 },
    props: [{ kind: 'mat', x1: 14, x2: 186 }],
    dumbbell: null,
    arrow: { track: 'hip', bend: 0, from: [62, 148], to: [62, 127] },
  },
  'incline-db-press': {
    viewBox: '0 -10 180 170',
    start: { view: 'side', hip: [76, 106], torso: 235, headTilt: 20, ankle: [132, 147], knee: -1, hand: [44, 32], elbow: 1, hand2: [47, 33] },
    end: { view: 'side', hip: [76, 106], torso: 235, headTilt: 20, ankle: [132, 147], knee: -1, hand: [56, 78], elbow: 1, hand2: [59, 79] },
    props: [{ kind: 'inclineBench', seat: [60, 102], top: 114, back: { from: [70, 113], angle: 35, length: 72 } }],
    dumbbell: 'endOn',
    arrow: { track: 'hand', bend: 0, shift: [20, 0] },
  },
  'reverse-lunge': {
    viewBox: '20 0 170 160',
    start: { view: 'side', ...STAND, hand: [101, 78.6], elbow: 1, hand2: [99, 78.6] },
    end: { view: 'side', hip: [82, 106], torso: 172, ankle: [114, 147], knee: -1, ankle2: [44, 141], knee2: -1, foot2: 51, hand: [89, 110], elbow: 1, hand2: [87, 110] },
    props: [],
    dumbbell: 'endOn',
    arrow: { track: 'hip', bend: 6, shift: [-12, 0] },
  },
  'chest-supported-row': {
    viewBox: '10 20 180 140',
    start: { view: 'side', hip: [72, 101.3], torso: 125, ankle: [17, 145], knee: -1, foot: 70, ankle2: [22, 146], knee2: -1, foot2: 60, hand: [110, 124], elbow: 1, hand2: [113, 124] },
    end: { view: 'side', hip: [72, 101.3], torso: 125, ankle: [17, 145], knee: -1, foot: 70, ankle2: [22, 146], knee2: -1, foot2: 60, hand: [85, 92], elbow: 1, hand2: [88, 92] },
    props: [{ kind: 'proneIncline', from: [44, 128], to: [104, 86] }],
    dumbbell: 'endOn',
    arrow: { track: 'hand', bend: -10, shift: [22, 4] },
  },
  'db-overhead-press': {
    viewBox: '20 -32 170 192',
    start: { view: 'side', ...STAND, hand: [109, 30], elbow: 1, hand2: [107, 31] },
    end: { view: 'side', ...STAND, hand: [103, -18], elbow: 1, hand2: [101, -17] },
    props: [],
    dumbbell: 'endOn',
    arrow: { track: 'hand', bend: 0, shift: [20, 0] },
  },
  'db-hip-thrust': {
    viewBox: '0 40 180 120',
    start: { view: 'side', hip: [89.7, 136.3], torso: -130, headTilt: -10, ankle: [138, 147], knee: -1, hand: [92, 124], elbow: 1 },
    end: { view: 'side', hip: [100, 106], torso: -88, headTilt: -28, ankle: [138, 147], knee: -1, hand: [101, 94], elbow: 1 },
    props: [{ kind: 'flatBench', x1: 22, x2: 58, top: 114 }],
    dumbbell: 'hip',
    arrow: { track: 'hip', bend: 0, shift: [16, 0] },
  },
  'db-biceps-curl': {
    viewBox: '20 0 170 160',
    start: { view: 'side', ...STAND, hand: [101, 78.6], elbow: 1, hand2: [99, 78.6] },
    end: { view: 'side', ...STAND, hand: [111, 34], elbow: 1, hand2: [109, 35] },
    props: [],
    dumbbell: 'endOn',
    arrow: { track: 'hand', bend: 14, shift: [12, 0] },
  },
}
