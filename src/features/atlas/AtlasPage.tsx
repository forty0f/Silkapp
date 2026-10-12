import { ChevronRight } from 'lucide-react'
import { EXERCISES } from '../../domain/exercises'
import { DEFAULT_WORKOUTS } from '../../domain/plan'
import { navigate } from '../../lib/router'
import { PageHeader } from '../../components/PageHeader'
import { SectionTitle, WorkoutBadge } from '../../components/ui'
import { ExerciseFigure } from './ExerciseFigure'

export function AtlasPage() {
  return (
    <div>
      <PageHeader title="Atlas ćwiczeń" subtitle="Karty techniczne 12 ćwiczeń planu — działają offline." />
      {(['A', 'B'] as const).map((w) => (
        <section key={w}>
          <SectionTitle>Trening {w}</SectionTitle>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {DEFAULT_WORKOUTS[w].map((pe, i) => {
              const ex = EXERCISES[pe.exerciseId]
              return (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => navigate(`/atlas/${ex.id}`)}
                  className="flex min-h-20 items-center gap-3 rounded-2xl border border-line/70 bg-surface p-2 pr-3 text-left active:bg-surface-2"
                >
                  <div className="h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-[#0d1628]">
                    <ExerciseFigure exerciseId={ex.id} phase="end" className="h-full w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs text-faint">
                      <WorkoutBadge type={w} size="sm" /> <span>#{i + 1}</span>
                    </div>
                    <div className="mt-1 truncate font-semibold">{ex.name}</div>
                    <div className="truncate text-sm text-muted">{ex.muscles.primary.join(', ')}</div>
                  </div>
                  <ChevronRight className="shrink-0 text-faint" size={20} />
                </button>
              )
            })}
          </div>
        </section>
      ))}
      <p className="mt-6 px-1 text-xs leading-relaxed text-faint">
        Ilustracje są schematyczne i służą przypomnieniu ustawienia ciała i kierunku ruchu. Nie zastępują nauki techniki z trenerem; przy bólu (innym niż zmęczenie mięśni) przerwij ćwiczenie.
      </p>
    </div>
  )
}
