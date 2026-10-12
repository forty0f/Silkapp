import type { ExerciseId } from '../../domain/types'
import { EXERCISES } from '../../domain/exercises'
import { cx } from '../../components/ui'
import { ExerciseFigure } from './ExerciseFigure'

/** Two-phase illustration: start position and end position with motion arrow. */
export function TechniquePanels({ exerciseId, compact = false }: { exerciseId: ExerciseId; compact?: boolean }) {
  const name = EXERCISES[exerciseId].name
  return (
    <div className="grid grid-cols-2 gap-2">
      {(['start', 'end'] as const).map((phase) => (
        <figure key={phase} className="m-0 overflow-hidden rounded-2xl border border-line/60 bg-[#0d1628]">
          <ExerciseFigure exerciseId={exerciseId} phase={phase} title={`${name} — ${phase === 'start' ? 'pozycja początkowa' : 'pozycja końcowa'}`} className={cx('block w-full', compact ? 'h-28' : 'h-40 sm:h-48')} />
          <figcaption className={cx('border-t border-line/50 px-2.5 py-1.5 text-faint', compact ? 'text-[11px]' : 'text-xs')}>
            <span className={phase === 'start' ? 'text-muted' : 'text-go'}>{phase === 'start' ? '1 · Start' : '2 · Koniec'}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  )
}
