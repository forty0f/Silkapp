import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowRight, ArrowUp, CheckCircle2, Minus, RotateCcw, TrendingUp } from 'lucide-react'
import { db } from '../../db/db'
import { decideSuggestion, getSettings, lastPerformance, performanceFor, reopenSession } from '../../db/repo'
import { comparePerformances, evaluatePerformance, fmtKg, type Comparison, type Evaluation } from '../../domain/progression'
import { sessionVolume } from '../../domain/metrics'
import type { Session, SetEntry, Suggestion } from '../../domain/types'
import { fmtDay, fmtDuration, fmtNum } from '../../lib/format'
import { navigate } from '../../lib/router'
import { Button, Card, Pill, SectionTitle, cx } from '../../components/ui'
import { useFeedback } from '../../components/feedback'
import { summarizePerformance } from './setDraft'

export function TrendIcon({ trend }: { trend: Comparison['trend'] }) {
  if (trend === 'improved') return <ArrowUp size={16} className="text-go" aria-label="poprawa" />
  if (trend === 'declined' || trend === 'lighter') return <ArrowDown size={16} className="text-warn" aria-label="spadek" />
  if (trend === 'heavier') return <ArrowUp size={16} className="text-accent" aria-label="większy ciężar" />
  if (trend === 'first') return <ArrowRight size={16} className="text-faint" aria-label="pierwsza sesja" />
  return <Minus size={16} className="text-muted" aria-label="bez zmian" />
}

const STATUS_LABEL: Record<Evaluation['status'], { text: string; tone: 'green' | 'blue' | 'amber' | 'neutral' }> = {
  increase: { text: 'gotowe do zwiększenia', tone: 'green' },
  unify: { text: 'ujednolić ciężar', tone: 'green' },
  'bodyweight-top': { text: 'górny zakres', tone: 'green' },
  hold: { text: 'utrzymaj ciężar', tone: 'blue' },
  'below-range': { text: 'poniżej zakresu', tone: 'amber' },
  incomplete: { text: 'niepełne serie', tone: 'neutral' },
}

export function SuggestionCard({ s }: { s: Suggestion }) {
  const { toast } = useFeedback()
  const decided = s.status !== 'pending'
  return (
    <div className={cx('rounded-2xl border p-3', decided ? 'border-line bg-surface-2' : 'border-go/30 bg-go/5')} data-testid="suggestion">
      <div className="flex items-center gap-2 text-sm">
        <TrendingUp size={16} className="text-go" />
        <span className="tnum font-semibold">
          {fmtKg(s.fromWeightKg)} → {fmtKg(s.toWeightKg)}
        </span>
        {decided && <Pill tone={s.status === 'accepted' ? 'green' : 'neutral'}>{s.status === 'accepted' ? 'zaakceptowano' : 'odrzucono'}</Pill>}
      </div>
      {!decided && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="go" className="flex-1" data-testid="accept-suggestion" onClick={() => void decideSuggestion(s.id, true).then(() => toast('Nowy ciężar zostanie podpowiedziany w następnym treningu', 'success'))}>
            Akceptuj
          </Button>
          <Button size="sm" className="flex-1" data-testid="reject-suggestion" onClick={() => void decideSuggestion(s.id, false)}>
            Odrzuć
          </Button>
        </div>
      )}
    </div>
  )
}

export function WorkoutSummary({ session, sets }: { session: Session; sets: SetEntry[] }) {
  const { toast, confirm } = useFeedback()
  const data = useLiveQuery(async () => {
    const settings = await getSettings()
    const suggestions = await db.suggestions.where('sourceSessionId').equals(session.id).toArray()
    const rows = await Promise.all(
      session.exercises.map(async (ex) => {
        const perf = performanceFor(session, ex.exerciseId, sets)!
        const prev = await lastPerformance(ex.exerciseId, session.id, session.startedAt)
        return {
          ex,
          perf,
          evaluation: evaluatePerformance(perf, settings.weightStepKg),
          comparison: comparePerformances(perf, prev),
          suggestion: suggestions.find((s) => s.exerciseId === ex.exerciseId) ?? null,
        }
      }),
    )
    return rows
  }, [session, sets])

  const vol = sessionVolume(session, sets)
  const duration = session.finishedAt ? new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime() : 0

  const reopen = async () => {
    if (!(await confirm({ title: 'Wznowić ten trening?', body: 'Trening wróci do stanu „w toku” — możesz dopisać lub poprawić serie i zakończyć go ponownie.', confirmLabel: 'Wznów' }))) return
    try {
      await reopenSession(session.id)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  return (
    <div className="pb-8 pt-[max(1rem,env(safe-area-inset-top))]" data-testid="workout-summary">
      <div className="flex flex-col items-center pb-2 pt-4 text-center">
        <CheckCircle2 size={44} className="text-go" />
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Trening {session.workoutType} ukończony</h1>
        <p className="text-sm text-muted">
          {fmtDay(session.startedAt)} · tydzień {session.week}, sesja {session.slot}/3
        </p>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Card className="p-3">
          <div className="tnum text-xl font-bold">{fmtDuration(duration)}</div>
          <div className="text-xs text-muted">czas</div>
        </Card>
        <Card className="p-3">
          <div className="tnum text-xl font-bold">{vol.workingSets}</div>
          <div className="text-xs text-muted">serie robocze</div>
        </Card>
        <Card className="p-3">
          <div className="tnum text-xl font-bold">{fmtNum(vol.volumeKg / 1000, 2)} t</div>
          <div className="text-xs text-muted">objętość*</div>
        </Card>
      </div>

      <SectionTitle>Ocena ćwiczeń</SectionTitle>
      <div className="space-y-2">
        {data?.map(({ ex, perf, evaluation, comparison, suggestion }) => (
          <Card key={ex.exerciseId} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold">{ex.name}</div>
                <div className="tnum text-sm text-muted">{summarizePerformance(perf)}</div>
              </div>
              <Pill tone={STATUS_LABEL[evaluation.status].tone}>{STATUS_LABEL[evaluation.status].text}</Pill>
            </div>
            <div className="mt-2 flex items-start gap-2 text-sm">
              <TrendIcon trend={comparison.trend} />
              <span className="text-muted">{comparison.detail}</span>
            </div>
            <p className="mt-1 text-sm text-faint">{evaluation.reasons[0]}</p>
            {suggestion && (
              <div className="mt-2">
                <SuggestionCard s={suggestion} />
              </div>
            )}
          </Card>
        ))}
      </div>
      <p className="mt-3 px-1 text-xs text-faint">
        * Objętość (kg × powtórzenia) rośnie także od samego dodania serii w kolejnych tygodniach — nie jest miarą siły. Siłę oceniaj po ciężarze i powtórzeniach w porównywalnych seriach (strzałki powyżej).
      </p>

      <div className="mt-6 space-y-2">
        <Button variant="primary" size="lg" className="w-full" onClick={() => navigate('/')} data-testid="summary-home">
          Gotowe
        </Button>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => navigate(`/history/${session.id}`)}>
            Edytuj serie
          </Button>
          <Button className="flex-1" onClick={reopen}>
            <RotateCcw size={16} /> Wznów
          </Button>
        </div>
      </div>
    </div>
  )
}
