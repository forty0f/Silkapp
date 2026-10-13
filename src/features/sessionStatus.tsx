import { useLiveQuery } from 'dexie-react-hooks'
import { canChangePlanChoice, setPlanChoice, type PlanChoice } from '../db/repo'
import { isPerformedSession, plannedProgress, sessionOutcome } from '../domain/metrics'
import type { Session, SetEntry } from '../domain/types'
import { Button } from '../components/ui'
import { useFeedback } from '../components/feedback'

export interface SessionLabel {
  text: string
  tone: 'green' | 'blue' | 'amber' | 'neutral'
  /** Not performed work — shown muted and left out of statistics. */
  muted: boolean
  kind: 'in_progress' | 'full' | 'partial' | 'cancelled' | 'empty'
}

/** One wording for every screen. "empty" = stored as completed by an older version without any performed set. */
export function sessionLabel(session: Session, sets: SetEntry[]): SessionLabel {
  if (session.status === 'in_progress') return { text: 'w toku', tone: 'amber', muted: false, kind: 'in_progress' }
  if (session.status === 'cancelled') return { text: 'anulowany', tone: 'neutral', muted: true, kind: 'cancelled' }
  if (!isPerformedSession(session, sets)) return { text: 'pusty — bez wykonanych serii', tone: 'neutral', muted: true, kind: 'empty' }
  if (sessionOutcome(session, sets) === 'full') return { text: 'ukończony', tone: 'green', muted: false, kind: 'full' }
  const { done, planned } = plannedProgress(session, sets)
  return { text: `częściowy ${done}/${planned}${session.planAdvance === false ? ' · powtórzony' : ''}`, tone: 'blue', muted: false, kind: 'partial' }
}

/** Plan effect of a partial session, with a change option for the newest one. */
export function PlanChoiceRow({ session }: { session: Session }) {
  const { choose, toast } = useFeedback()
  const canChange = useLiveQuery(() => canChangePlanChoice(session), [session])
  const other = session.workoutType === 'A' ? 'B' : 'A'
  const repeat = session.planAdvance === false
  const change = async () => {
    const picked = await choose({
      title: 'Następny trening',
      body: 'Wybierz, co ma być następnym treningiem po tym częściowo ukończonym.',
      choices: [
        { label: `Dalej według planu — następny ${other}`, value: 'advance', testId: 'finish-advance' },
        { label: `Powtórz trening ${session.workoutType}`, value: 'repeat', testId: 'finish-repeat' },
      ],
    })
    if (!picked) return
    try {
      await setPlanChoice(session.id, picked as PlanChoice)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-line/70 bg-surface px-3 py-1.5 text-sm" data-testid="plan-choice">
      <span className="text-muted">
        Następny trening: <span className="font-medium text-ink">{repeat ? `powtórzenie ${session.workoutType}` : `według planu`}</span>
      </span>
      {canChange && (
        <Button size="sm" variant="ghost" onClick={change} data-testid="change-plan-choice">
          Zmień
        </Button>
      )}
    </div>
  )
}
