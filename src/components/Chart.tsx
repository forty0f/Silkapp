import { useLayoutEffect, useRef, useState } from 'react'
import { cx } from './ui'

// Palette validated (dark surface #111a2c) with the dataviz validator: both pass
// lightness band, chroma, CVD and contrast checks.
export const SERIES = { primary: '#3d8ae8', secondary: '#1fa874' }
const GRID = '#1f2b44'
const SURFACE = '#111a2c'

export interface ChartPoint {
  label: string // x label (short date)
  value: number | null
  /** Extra text shown in the tooltip. */
  detail?: string
}

export interface ChartSeries {
  name: string
  color: string
  points: ChartPoint[]
  style?: 'line' | 'dots'
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.1)
    min -= pad
    max += pad
  }
  const span = max - min
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? 10 * mag
  const start = Math.floor(min / step) * step
  const ticks: number[] = []
  for (let v = start; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000)
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

const fmt = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pl-PL', { maximumFractionDigits: 1 })}k` : v.toLocaleString('pl-PL', { maximumFractionDigits: 1 }))

/**
 * Minimal responsive SVG chart: line (2px, end dot + end label) or columns,
 * with a touch/hover crosshair tooltip and an accessible table view.
 */
export function Chart({
  series,
  kind = 'line',
  unit = '',
  height = 180,
  zeroBased = false,
  ariaLabel,
}: {
  series: ChartSeries[]
  kind?: 'line' | 'bar'
  unit?: string
  height?: number
  zeroBased?: boolean
  ariaLabel: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)

  const hasData = series.some((s) => s.points.some((p) => p.value != null))
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Measure synchronously before the first paint: waiting for the (async)
    // ResizeObserver let the SVG briefly overflow narrow screens.
    setWidth(Math.max(200, Math.floor(el.getBoundingClientRect().width)))
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.floor(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasData])

  const n = Math.max(...series.map((s) => s.points.length), 0)
  const values = series.flatMap((s) => s.points.map((p) => p.value)).filter((v): v is number => v != null)
  if (n === 0 || values.length === 0) return <div className="py-8 text-center text-sm text-faint">Brak danych</div>

  const lo = zeroBased || kind === 'bar' ? 0 : Math.min(...values)
  const ticks = niceTicks(lo, Math.max(...values))
  const yMin = ticks[0]
  const yMax = ticks[ticks.length - 1]
  const pad = { l: 36, r: 40, t: 12, b: 24 }
  const w = width - pad.l - pad.r
  const h = height - pad.t - pad.b
  const band = w / n
  const x = (i: number) => (kind === 'bar' ? pad.l + band * i + band / 2 : n === 1 ? pad.l + w / 2 : pad.l + (w * i) / (n - 1))
  const y = (v: number) => pad.t + h - ((v - yMin) / (yMax - yMin || 1)) * h
  const labels = series[0].points.map((p) => p.label)
  const labelEvery = Math.ceil(n / Math.max(1, Math.floor(w / 56)))

  const onMove = (clientX: number) => {
    const rect = ref.current!.getBoundingClientRect()
    const px = clientX - rect.left
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - px)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    setHover(best)
  }

  const tipLeft = hover != null ? Math.min(Math.max(x(hover) - 70, 0), width - 140) : 0

  return (
    <div>
      <div
        ref={ref}
        className="relative touch-pan-y select-none"
        onPointerMove={(e) => onMove(e.clientX)}
        onPointerDown={(e) => onMove(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
              <text x={pad.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="#6b7c96" className="tnum">
                {fmt(t)}
              </text>
            </g>
          ))}
          {labels.map((l, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={10.5} fill="#6b7c96">
                {i === n - 1 || (n - 1 - i) >= labelEvery * 0.6 ? l : ''}
              </text>
            ) : null,
          )}
          {kind === 'bar' &&
            series[0].points.map((p, i) => {
              if (p.value == null) return null
              const bw = Math.min(24, Math.max(4, band - 2))
              const top = y(p.value)
              const base = y(yMin)
              const r = Math.min(4, bw / 2, base - top)
              const x0 = x(i) - bw / 2
              return (
                <path
                  key={i}
                  d={`M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z`}
                  fill={series[0].color}
                  opacity={hover == null || hover === i ? 1 : 0.55}
                />
              )
            })}
          {kind === 'line' &&
            series.map((s) => {
              const pts = s.points.map((p, i) => (p.value == null ? null : ([x(i), y(p.value)] as const))).filter((p): p is readonly [number, number] => p != null)
              const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
              const last = pts[pts.length - 1]
              const lastVal = [...s.points].reverse().find((p) => p.value != null)?.value
              return (
                <g key={s.name}>
                  {s.style !== 'dots' && series.length === 1 && pts.length > 1 && (
                    <path d={`${d} L${last[0]},${y(yMin)} L${pts[0][0]},${y(yMin)} Z`} fill={s.color} opacity={0.1} />
                  )}
                  {s.style !== 'dots' && <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
                  {(s.style === 'dots' || pts.length <= 20) &&
                    pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={s.style === 'dots' ? 3.5 : 3} fill={s.color} stroke={SURFACE} strokeWidth={2} />)}
                  {last && s.style !== 'dots' && (
                    <>
                      <circle cx={last[0]} cy={last[1]} r={4.5} fill={s.color} stroke={SURFACE} strokeWidth={2} />
                      <text x={last[0] + 8} y={last[1]} dy="0.32em" fontSize={11.5} fontWeight={600} fill="#e8eef8" className="tnum">
                        {lastVal != null ? fmt(lastVal) : ''}
                      </text>
                    </>
                  )}
                </g>
              )
            })}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + h} stroke="#94a3bd" strokeWidth={1} opacity={0.5} />}
          {hover != null &&
            kind === 'line' &&
            series.map((s) => {
              const v = s.points[hover]?.value
              return v == null ? null : <circle key={s.name} cx={x(hover)} cy={y(v)} r={5} fill={s.color} stroke={SURFACE} strokeWidth={2} />
            })}
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute top-0 z-10 w-[140px] rounded-xl border border-line bg-surface-3/95 px-2.5 py-2 text-xs shadow-xl" style={{ left: tipLeft }} role="status">
            <div className="mb-1 text-faint">{labels[hover]}</div>
            {series.map((s) => {
              const p = s.points[hover]
              if (!p || p.value == null) return null
              return (
                <div key={s.name} className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  <span className="tnum font-semibold text-ink">
                    {fmt(p.value)} {unit}
                  </span>
                </div>
              )
            })}
            {series[0].points[hover]?.detail && <div className="tnum mt-1 text-muted">{series[0].points[hover].detail}</div>}
          </div>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {series.length > 1 ? (
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            {series.map((s) => (
              <span key={s.name} className="inline-flex items-center gap-1.5">
                {s.style === 'dots' ? <span className="h-2 w-2 rounded-full" style={{ background: s.color }} /> : <span className="h-0.5 w-3 rounded" style={{ background: s.color }} />}
                {s.name}
              </span>
            ))}
          </div>
        ) : (
          <span />
        )}
        <button type="button" onClick={() => setTable((t) => !t)} className="min-h-11 shrink-0 px-2 text-xs text-accent">
          {table ? 'Ukryj tabelę' : 'Tabela'}
        </button>
      </div>
      {table && (
        <div className={cx('mt-1 max-h-56 overflow-y-auto rounded-xl border border-line')}>
          <table className="tnum w-full text-left text-sm">
            <thead className="sticky top-0 bg-surface-2 text-xs text-faint">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                {series.map((s) => (
                  <th key={s.name} className="px-3 py-2 text-right font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...labels.keys()].reverse().map((i) => (
                <tr key={i} className="border-t border-line/60">
                  <td className="px-3 py-1.5 text-muted">
                    {labels[i]}
                    {series[0].points[i]?.detail && <div className="text-xs text-faint">{series[0].points[i].detail}</div>}
                  </td>
                  {series.map((s) => (
                    <td key={s.name} className="px-3 py-1.5 text-right">
                      {s.points[i]?.value == null ? '—' : `${fmt(s.points[i].value!)} ${unit}`}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
