import { useState } from 'react'
import { Check, MessageSquare, Pause, Play, X } from 'lucide-react'
import type { SessionExercise } from '../../domain/types'
import { Stepper, cx } from '../../components/ui'
import { useNow } from '../../lib/useNow'
import type { SetDraft } from './setDraft'

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5]

export function RirPicker({ value, onChange, target }: { value: number | null; onChange: (v: number | null) => void; target?: { min: number; max: number } }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs font-medium text-muted">
        <span>RIR — powtórzenia w zapasie</span>
        {target && <span className="text-faint">cel {target.min === target.max ? target.min : `${target.min}–${target.max}`}</span>}
      </div>
      <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label="RIR">
        {RIR_OPTIONS.map((r) => {
          const on = value === r
          const inTarget = target && r >= target.min && r <= target.max
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              data-testid={`rir-${r}`}
              onClick={() => onChange(on ? null : r)}
              className={cx(
                'tnum min-h-12 rounded-xl border text-lg font-semibold',
                on ? 'border-accent bg-accent text-[#06101f]' : inTarget ? 'border-accent/40 bg-accent/10 text-ink' : 'border-line bg-surface-2 text-muted',
              )}
            >
              {r === 5 ? '5+' : r}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Stopwatch({ onStop }: { onStop: (sec: number) => void }) {
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const now = useNow(startedAt != null, 200)
  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0
  return startedAt == null ? (
    <button type="button" onClick={() => setStartedAt(Date.now())} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-go/40 bg-go/10 font-medium text-go">
      <Play size={18} /> Start stopera
    </button>
  ) : (
    <button
      type="button"
      onClick={() => {
        onStop(elapsed)
        setStartedAt(null)
      }}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-go font-semibold text-[#04150e]"
    >
      <Pause size={18} /> Stop · <span className="tnum">{elapsed} s</span>
    </button>
  )
}

export function SetFields({
  ex,
  draft,
  onChange,
  weightStep,
  targetRir,
}: {
  ex: SessionExercise
  draft: SetDraft
  onChange: (d: SetDraft) => void
  weightStep: number
  targetRir?: { min: number; max: number }
}) {
  const [noteOpen, setNoteOpen] = useState(draft.note !== '')
  const set = <K extends keyof SetDraft>(k: K, v: SetDraft[K]) => onChange({ ...draft, [k]: v })
  const repStep = 1

  return (
    <div className="space-y-4">
      {ex.loaded && (
        <div className={cx('grid gap-3', ex.perSide ? 'grid-cols-1' : 'grid-cols-2')}>
          <Stepper label="Ciężar (1 hantel)" unit="kg" decimals value={draft.weightKg} onChange={(v) => set('weightKg', v)} step={weightStep} max={300} testId="input-weight" />
          {!ex.perSide && ex.unit === 'reps' && <Stepper label="Powtórzenia" value={draft.reps} onChange={(v) => set('reps', v)} step={repStep} max={200} testId="input-reps" />}
        </div>
      )}
      {ex.unit === 'reps' && ex.perSide && (
        <div className="grid grid-cols-2 gap-3">
          <Stepper label="Lewa strona" value={draft.repsLeft} onChange={(v) => set('repsLeft', v)} step={repStep} max={200} testId="input-reps-left" />
          <Stepper label="Prawa strona" value={draft.repsRight} onChange={(v) => set('repsRight', v)} step={repStep} max={200} testId="input-reps-right" />
        </div>
      )}
      {!ex.loaded && ex.unit === 'reps' && !ex.perSide && <Stepper label="Powtórzenia" value={draft.reps} onChange={(v) => set('reps', v)} step={1} max={200} testId="input-reps" />}
      {ex.unit === 'seconds' && (
        <div className="grid grid-cols-2 items-end gap-3">
          <Stepper label="Czas" unit="s" value={draft.durationSec} onChange={(v) => set('durationSec', v)} step={5} max={3600} testId="input-duration" />
          <Stopwatch onStop={(s) => set('durationSec', s)} />
        </div>
      )}
      {draft.type === 'working' && ex.unit === 'reps' && <RirPicker value={draft.rir} onChange={(v) => set('rir', v)} target={targetRir} />}
      <div className="flex flex-wrap gap-2">
        {draft.type === 'working' && (
          <button
            type="button"
            onClick={() => set('techniqueOk', !draft.techniqueOk)}
            aria-pressed={draft.techniqueOk}
            data-testid="toggle-technique"
            className={cx(
              'inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium',
              draft.techniqueOk ? 'border-go/40 bg-go/10 text-go' : 'border-warn/50 bg-warn/10 text-warn',
            )}
          >
            {draft.techniqueOk ? <Check size={16} /> : <X size={16} />}
            {draft.techniqueOk ? 'Technika poprawna' : 'Technika do poprawy'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setNoteOpen((o) => !o)}
          className={cx('inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm', noteOpen || draft.note ? 'border-accent/40 text-accent' : 'border-line text-muted')}
        >
          <MessageSquare size={16} /> Uwagi
        </button>
      </div>
      {noteOpen && (
        <textarea
          value={draft.note}
          onChange={(e) => set('note', e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="np. ból nadgarstka, inny chwyt, zmęczenie…"
          className="w-full rounded-2xl border border-line bg-surface-2 p-3 text-base outline-none placeholder:text-faint focus:border-accent"
        />
      )}
    </div>
  )
}
