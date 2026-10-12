import type { ExerciseId } from '../../domain/types'
import { EXERCISES } from '../../domain/exercises'
import { PageHeader } from '../../components/PageHeader'
import { ExerciseSheetContent } from './ExerciseSheetContent'

export function AtlasDetailPage({ exerciseId }: { exerciseId: ExerciseId }) {
  const ex = EXERCISES[exerciseId]
  return (
    <div className="pb-4">
      <PageHeader title={ex.name} subtitle={`Trening ${ex.workout}`} back="/atlas" />
      <ExerciseSheetContent exerciseId={exerciseId} />
    </div>
  )
}
