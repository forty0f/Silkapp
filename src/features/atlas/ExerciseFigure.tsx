import { useId } from 'react'
import type { ExerciseId } from '../../domain/types'
import { add, solve, type Pt, type SolvedFigure } from './figure'
import { ART, type ExerciseArt, type Prop } from './poses'

const C = {
  near: '#e6edf7',
  body: '#c4d0e0',
  far: '#6b7c96',
  pad: '#33435c',
  frame: '#22304a',
  db: '#5ea8ff',
  dbDark: '#1d4f8f',
  arrow: '#34d399',
  floor: '#2a3852',
  ghost: '#25334d',
}

function FigureShapes({ fig, art, ghost = false }: { fig: SolvedFigure; art: ExerciseArt; ghost?: boolean }) {
  const color = (layer: string) => (ghost ? C.ghost : layer === 'far' ? C.far : layer === 'body' ? C.body : C.near)
  const byLayer = (layer: string) => {
    const segs = fig.segments.filter((s) => s.layer === layer)
    // Near limbs get a dark outline so they stay readable over the torso.
    const outline = layer === 'near' && !ghost
    return (
      <>
        {outline && segs.map((s, i) => <line key={`o${layer}${i}`} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke="#0d1628" strokeWidth={s.w + 3.5} strokeLinecap="round" />)}
        {segs.map((s, i) => (
          <line key={`${layer}${i}`} x1={s.a[0]} y1={s.a[1]} x2={s.b[0]} y2={s.b[1]} stroke={color(layer)} strokeWidth={s.w} strokeLinecap="round" />
        ))}
      </>
    )
  }
  const dbs = art.dumbbell && !ghost ? (art.singleDumbbell ? fig.hands.slice(0, 1) : fig.hands) : []
  return (
    <g>
      {byLayer('far')}
      {!ghost && art.dumbbell === 'endOn' && dbs.slice(1).map((h, i) => <Dumbbell key={`f${i}`} at={h} far={!fig.torsoPolygon} />)}
      {fig.torsoPolygon && <polygon points={fig.torsoPolygon.map((p) => p.join(',')).join(' ')} fill={color('body')} stroke={color('body')} strokeWidth={6} strokeLinejoin="round" />}
      {byLayer('body')}
      <circle cx={fig.head[0]} cy={fig.head[1]} r={9} fill={color('body')} />
      {byLayer('near')}
      {!ghost && art.dumbbell === 'endOn' && dbs.slice(0, 1).map((h, i) => <Dumbbell key={`n${i}`} at={h} />)}
      {!ghost && art.dumbbell === 'goblet' && <Goblet at={fig.hands[0]} />}
      {!ghost && art.dumbbell === 'hip' && <Dumbbell at={[fig.hip[0], fig.hip[1] - 11]} />}
    </g>
  )
}

function Dumbbell({ at, far = false }: { at: Pt; far?: boolean }) {
  return (
    <g opacity={far ? 0.75 : 1}>
      <circle cx={at[0]} cy={at[1]} r={7.5} fill={far ? C.dbDark : C.db} stroke="#0b1220" strokeWidth={1.5} />
      <circle cx={at[0]} cy={at[1]} r={2.5} fill="#0b1220" opacity={0.6} />
    </g>
  )
}

function Goblet({ at }: { at: Pt }) {
  const [x, y] = at
  return (
    <g>
      <rect x={x - 2} y={y - 12} width={4} height={24} rx={2} fill={C.dbDark} />
      <rect x={x - 8} y={y - 16} width={16} height={7} rx={2.5} fill={C.db} stroke="#0b1220" strokeWidth={1.2} />
      <rect x={x - 8} y={y + 9} width={16} height={7} rx={2.5} fill={C.db} stroke="#0b1220" strokeWidth={1.2} />
    </g>
  )
}

function PropShape({ p }: { p: Prop }) {
  switch (p.kind) {
    case 'flatBench':
      return (
        <g>
          <line x1={p.x1 + 8} y1={p.top + 4} x2={p.x1 + 8} y2={149} stroke={C.frame} strokeWidth={5} />
          <line x1={p.x2 - 8} y1={p.top + 4} x2={p.x2 - 8} y2={149} stroke={C.frame} strokeWidth={5} />
          <rect x={p.x1} y={p.top} width={p.x2 - p.x1} height={8} rx={3} fill={C.pad} />
        </g>
      )
    case 'inclineBench': {
      const end = add(p.back.from, [-Math.cos((p.back.angle * Math.PI) / 180) * p.back.length, -Math.sin((p.back.angle * Math.PI) / 180) * p.back.length])
      return (
        <g>
          <line x1={(p.seat[0] + p.seat[1]) / 2} y1={p.top + 4} x2={(p.seat[0] + p.seat[1]) / 2} y2={149} stroke={C.frame} strokeWidth={5} />
          <line x1={p.back.from[0] - 20} y1={p.back.from[1] - 10} x2={p.back.from[0] - 30} y2={149} stroke={C.frame} strokeWidth={4} />
          <rect x={p.seat[0]} y={p.top} width={p.seat[1] - p.seat[0]} height={8} rx={3} fill={C.pad} />
          <line x1={p.back.from[0]} y1={p.back.from[1]} x2={end[0]} y2={end[1]} stroke={C.pad} strokeWidth={8} strokeLinecap="round" />
        </g>
      )
    }
    case 'proneIncline':
      return (
        <g>
          <line x1={p.from[0] + 14} y1={p.from[1]} x2={p.from[0] + 10} y2={149} stroke={C.frame} strokeWidth={5} />
          <line x1={p.to[0] - 14} y1={p.to[1] + 10} x2={p.to[0] - 8} y2={149} stroke={C.frame} strokeWidth={5} />
          <line x1={p.from[0]} y1={p.from[1]} x2={p.to[0]} y2={p.to[1]} stroke={C.pad} strokeWidth={8} strokeLinecap="round" />
        </g>
      )
    case 'mat':
      return <rect x={p.x1} y={150} width={p.x2 - p.x1} height={3} rx={1.5} fill={C.pad} />
  }
}

function trackPoint(fig: SolvedFigure, track: 'hand' | 'hip'): Pt {
  return track === 'hip' ? fig.hip : fig.hands[0]
}

export function ExerciseFigure({
  exerciseId,
  phase,
  className,
  title,
}: {
  exerciseId: ExerciseId
  phase: 'start' | 'end'
  className?: string
  title?: string
}) {
  const art = ART[exerciseId]
  const arrowId = useId().replace(/:/g, '')
  const start = solve(art.start)
  const end = solve(art.end)
  const fig = phase === 'start' ? start : end
  const [vx, vy, vw, vh] = art.viewBox.split(' ').map(Number)

  let arrow: string | null = null
  if (phase === 'end') {
    const shift = art.arrow.shift ?? [0, 0]
    const s = art.arrow.from ?? add(trackPoint(start, art.arrow.track), shift)
    const e = art.arrow.to ?? add(trackPoint(end, art.arrow.track), shift)
    const mid: Pt = [(s[0] + e[0]) / 2, (s[1] + e[1]) / 2]
    const len = Math.hypot(e[0] - s[0], e[1] - s[1]) || 1
    const n: Pt = [-(e[1] - s[1]) / len, (e[0] - s[0]) / len]
    const ctrl = add(mid, [n[0] * art.arrow.bend, n[1] * art.arrow.bend])
    arrow = `M${s[0].toFixed(1)},${s[1].toFixed(1)} Q${ctrl[0].toFixed(1)},${ctrl[1].toFixed(1)} ${e[0].toFixed(1)},${e[1].toFixed(1)}`
  }

  return (
    <svg viewBox={art.viewBox} className={className} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
      {title && <title>{title}</title>}
      <defs>
        <marker id={arrowId} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={C.arrow} />
        </marker>
      </defs>
      <line x1={vx} y1={151} x2={vx + vw} y2={151} stroke={C.floor} strokeWidth={2} />
      {art.props.map((p, i) => (
        <PropShape key={i} p={p} />
      ))}
      {phase === 'end' && <FigureShapes fig={start} art={art} ghost />}
      <FigureShapes fig={fig} art={art} />
      {arrow && <path d={arrow} fill="none" stroke={C.arrow} strokeWidth={3} strokeLinecap="round" markerEnd={`url(#${arrowId})`} />}
      <rect x={vx} y={vy} width={vw} height={vh} fill="none" />
    </svg>
  )
}
