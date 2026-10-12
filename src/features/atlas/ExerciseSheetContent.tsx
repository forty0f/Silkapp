import { AlertTriangle, ArrowRightLeft, Check, Wind } from 'lucide-react'
import type { ExerciseId } from '../../domain/types'
import { EXERCISES } from '../../domain/exercises'
import { TechniquePanels } from './TechniquePanels'

export function ExerciseSheetContent({ exerciseId }: { exerciseId: ExerciseId }) {
  const ex = EXERCISES[exerciseId]
  return (
    <div className="space-y-4">
      <TechniquePanels exerciseId={exerciseId} />
      <div className="flex flex-wrap gap-1.5">
        {ex.muscles.primary.map((m) => (
          <span key={m} className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-medium text-accent">{m}</span>
        ))}
        {ex.muscles.secondary.map((m) => (
          <span key={m} className="rounded-full bg-surface-3 px-2.5 py-1 text-xs text-muted">{m}</span>
        ))}
      </div>
      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-2xl bg-surface-2 p-3">
          <dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-faint">1 · Pozycja początkowa</dt>
          <dd className="m-0 leading-relaxed">{ex.start}</dd>
        </div>
        <div className="rounded-2xl bg-surface-2 p-3">
          <dt className="mb-1 text-xs font-semibold uppercase tracking-wider text-go/80">2 · Pozycja końcowa</dt>
          <dd className="m-0 leading-relaxed">{ex.end}</dd>
        </div>
      </dl>
      <div className="flex gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
        <ArrowRightLeft size={18} className="mt-0.5 shrink-0 text-go" />
        <p className="m-0 leading-relaxed"><span className="font-semibold">Kierunek ruchu: </span>{ex.direction}</p>
      </div>
      <section>
        <h3 className="mb-2 text-sm font-semibold">3 kluczowe wskazówki</h3>
        <ol className="m-0 list-none space-y-2 p-0">
          {ex.cues.map((c, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-go/15 text-xs font-bold text-go">{i + 1}</span>
              <span className="leading-relaxed">{c}</span>
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3 className="mb-2 text-sm font-semibold">Najczęstsze błędy</h3>
        <ul className="m-0 list-none space-y-2 p-0">
          {ex.mistakes.map((m) => (
            <li key={m} className="flex gap-3 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />
              <span className="leading-relaxed text-muted">{m}</span>
            </li>
          ))}
        </ul>
      </section>
      <div className="flex gap-3 rounded-2xl border border-accent/20 bg-accent/5 p-3 text-sm">
        <Wind size={18} className="mt-0.5 shrink-0 text-accent" />
        <p className="m-0 leading-relaxed"><span className="font-semibold">Oddychanie: </span>{ex.breathing}</p>
      </div>
      <p className="flex items-center gap-2 text-xs text-faint">
        <Check size={14} /> Sprzęt: {ex.equipment}
      </p>
    </div>
  )
}
