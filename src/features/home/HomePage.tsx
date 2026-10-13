import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowRightLeft, ChevronRight, Play, RotateCcw, ShieldCheck, Trash2, TrendingUp } from 'lucide-react'
import { db } from '../../db/db'
import { deleteSession, getInProgressSession, getNextSessionInfo, getSettings, startSession } from '../../db/repo'
import { formatRange, formatRir } from '../../domain/plan'
import { comparePerformances, type ExercisePerformance } from '../../domain/progression'
import { buildSessionExercises, targetRirFor } from '../../domain/schedule'
import type { WorkoutType } from '../../domain/types'
import { daysAgo, fmtDate, fmtNum, fmtTime, relativeDay } from '../../lib/format'
import { navigate } from '../../lib/router'
import { Button, Card, SectionTitle, WorkoutBadge, cx } from '../../components/ui'
import { useFeedback } from '../../components/feedback'
import { useHistoryData } from '../useHistoryData'
import { TrendIcon } from '../workout/WorkoutSummary'

export function HomePage() {
  const info = useLiveQuery(getNextSessionInfo)
  const inProgress = useLiveQuery(async () => (await getInProgressSession()) ?? null)
  const settings = useLiveQuery(getSettings)
  const history = useHistoryData()
  const pending = useLiveQuery(() => db.suggestions.where('status').equals('pending').count())
  const lastMetric = useLiveQuery(async () => (await db.bodyMetrics.orderBy('date').reverse().first()) ?? null)
  const [override, setOverride] = useState<WorkoutType | null>(null)
  const [starting, setStarting] = useState(false)
  const { toast, confirm } = useFeedback()

  if (!info || inProgress === undefined || !history || !settings) return <div className="min-h-dvh" aria-busy="true" />

  const type = override ?? info.type
  const position = info.position
  const exercises = buildSessionExercises(info.plan, type, position)
  const rir = targetRirFor(info.plan, position)
  const totalCompleted = history.completed.length
  const lastDone = history.completed[0] ?? null
  const adaptationTotal = info.plan.adaptationWeeks * 3
  const adaptationDone = Math.min(info.completedCount, adaptationTotal)

  const start = async () => {
    setStarting(true)
    try {
      const s = await startSession(override ?? undefined)
      navigate(`/workout/${s.id}`)
    } catch (e) {
      toast(`Nie udało się rozpocząć treningu: ${(e as Error).message}`, 'error')
      setStarting(false)
    }
  }

  const discard = async () => {
    if (!inProgress) return
    const n = history.setsBySession.get(inProgress.id)?.length ?? 0
    if (!(await confirm({ title: 'Odrzucić niedokończony trening?', body: `Trening ${inProgress.workoutType} z ${n} zapisanymi seriami zostanie trwale usunięty.`, confirmLabel: 'Odrzuć', danger: true }))) return
    await deleteSession(inProgress.id)
    toast('Trening odrzucony', 'info')
  }

  // Strength trend of the latest session vs. the previous performance of each exercise.
  const trends = (() => {
    if (!lastDone) return null
    const result = { improved: 0, same: 0, declined: 0, other: 0 }
    const sets = history.setsBySession.get(lastDone.id) ?? []
    for (const ex of lastDone.exercises) {
      const prevSession = history.completed.find((s) => s.startedAt < lastDone.startedAt && s.exercises.some((e) => e.exerciseId === ex.exerciseId))
      const perf = (sid: string, se: typeof lastDone): ExercisePerformance => ({
        sessionId: sid,
        date: se.startedAt,
        exercise: se.exercises.find((e) => e.exerciseId === ex.exerciseId)!,
        targetRir: se.targetRir,
        sets: (history.setsBySession.get(sid) ?? []).filter((s) => s.exerciseId === ex.exerciseId),
      })
      const curr = { ...perf(lastDone.id, lastDone), sets: sets.filter((s) => s.exerciseId === ex.exerciseId) }
      const t = comparePerformances(curr, prevSession ? perf(prevSession.id, prevSession) : null).trend
      if (t === 'improved') result.improved++
      else if (t === 'declined') result.declined++
      else if (t === 'same' || t === 'first') result.same++
      else result.other++
    }
    return result
  })()

  const needsBackup = totalCompleted > 0 && (!settings.lastExportAt || daysAgo(settings.lastExportAt) >= 14)
  const phaseText = position.phase === 'adaptation' ? 'adaptacja' : 'kontynuacja'

  return (
    <div className="pb-4">
      <header className="pb-3 pt-4">
        <h1 className="text-xl font-bold tracking-tight" data-testid="program-name">
          {info.program.name}
        </h1>
      </header>

      {inProgress ? (
        <Card className="border-accent/40 bg-gradient-to-b from-accent/10 to-surface" data-testid="resume-card">
          <div className="flex items-center gap-3">
            <WorkoutBadge type={inProgress.workoutType} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-accent">Trening w toku</div>
              <div className="text-lg font-semibold">Trening {inProgress.workoutType}</div>
              <div className="text-sm text-muted">
                Tydzień {inProgress.week} · sesja {inProgress.slot}/3 · od {relativeDay(inProgress.startedAt)} {fmtTime(inProgress.startedAt)} ·{' '}
                {history.setsBySession.get(inProgress.id)?.filter((s) => s.type === 'working').length ?? 0}/{inProgress.exercises.reduce((a, e) => a + e.plannedSets, 0)} serii
              </div>
            </div>
          </div>
          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={() => navigate(`/workout/${inProgress.id}`)} data-testid="resume-workout">
            <RotateCcw size={20} /> Wznów trening
          </Button>
          <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={discard}>
            <Trash2 size={16} /> Odrzuć niedokończony trening
          </Button>
        </Card>
      ) : (
        <Card className="bg-gradient-to-b from-surface-2 to-surface p-4" data-testid="next-card">
          <div className="flex items-center gap-3">
            <WorkoutBadge type={type} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-faint">Następny trening</div>
              <div className="text-xl font-bold" data-testid="next-type">
                Trening {type}
              </div>
              <div className="text-sm text-muted" data-testid="next-position">
                Tydzień {position.week} · sesja {position.slot}/3 · {phaseText}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-faint">cel RIR</div>
              <div className="tnum text-2xl font-bold text-accent" data-testid="target-rir">
                {formatRir(rir)}
              </div>
            </div>
          </div>
          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={start} disabled={starting} data-testid="start-workout">
            <Play size={20} fill="currentColor" /> Rozpocznij trening
          </Button>
          <ol className="mt-3 space-y-1.5 border-t border-line/60 pt-3">
            {exercises.map((e) => (
              <li key={e.exerciseId} className="flex items-baseline gap-2 text-sm">
                <span className="tnum w-4 text-faint">{e.order}</span>
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                <span className="tnum shrink-0 text-muted">
                  {e.plannedSets} × {formatRange(e).replace(' powt.', '').replace(' / stronę', '/str.')}
                </span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            className="mt-1 flex min-h-11 w-full items-center justify-center gap-2 text-sm text-muted"
            onClick={() => setOverride(type === 'A' ? 'B' : 'A')}
          >
            <ArrowRightLeft size={14} /> {override ? `Wróć do planu (trening ${info.type})` : `Zamień na trening ${type === 'A' ? 'B' : 'A'}`}
          </button>
          {override && <p className="text-center text-xs text-warn">Zmiana kolejności — kolejny trening po tym będzie przeciwny ({override === 'A' ? 'B' : 'A'}).</p>}
        </Card>
      )}

      {position.phase === 'adaptation' ? (
        <div className="mt-3 px-1" data-testid="adaptation-progress">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
            <span>Okres adaptacyjny ({info.plan.adaptationWeeks} tyg.)</span>
            <span className="tnum">
              {adaptationDone}/{adaptationTotal} sesji
            </span>
          </div>
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${info.plan.adaptationWeeks}, minmax(0, 1fr))` }} aria-hidden="true">
            {Array.from({ length: info.plan.adaptationWeeks }, (_, w) => (
              <div key={w} className="flex gap-0.5">
                {[0, 1, 2].map((k) => {
                  const n = w * 3 + k
                  return <span key={k} className={cx('h-1.5 flex-1 rounded-full', n < adaptationDone ? 'bg-go' : n === adaptationDone ? 'bg-accent/60' : 'bg-surface-3')} />
                })}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <Card className="mt-3 flex items-start gap-3 p-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-go" />
          <p className="text-sm text-muted">
            Okres adaptacyjny zakończony. Kontynuujesz plan z docelową liczbą serii i RIR {formatRir(info.plan.continuationRir)} — cała historia jest zachowana.
          </p>
        </Card>
      )}

      <SectionTitle action={<button type="button" className="flex min-h-11 items-center text-sm text-accent" onClick={() => navigate('/progress')}>Progres <ChevronRight size={16} /></button>}>
        Ostatni trening
      </SectionTitle>
      <Card className="p-3.5" data-testid="progress-summary">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <span className="font-semibold" data-testid="last-workout">
              {lastDone ? fmtDate(lastDone.startedAt) : '—'}
            </span>
            {lastDone && <span className="text-sm text-muted"> · {relativeDay(lastDone.startedAt)} · {lastDone.workoutType}</span>}
          </div>
          <div className="shrink-0 text-sm text-muted">
            <span className="tnum font-bold text-ink" data-testid="completed-count">
              {totalCompleted}
            </span>{' '}
            zaliczonych
          </div>
        </div>
        {!trends ? (
          <p className="mt-2 text-sm text-muted">Po pierwszym ukończonym treningu zobaczysz tu porównanie z poprzednimi sesjami.</p>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" aria-label="Porównanie z poprzednim wykonaniem każdego ćwiczenia">
            <span className="flex items-center gap-1 text-go">
              <TrendIcon trend="improved" /> <span className="tnum font-semibold">{trends.improved}</span> poprawa
            </span>
            <span className="flex items-center gap-1 text-muted">
              <TrendIcon trend="same" /> <span className="tnum font-semibold">{trends.same}</span> bez zmian
            </span>
            <span className="flex items-center gap-1 text-warn">
              <TrendIcon trend="declined" /> <span className="tnum font-semibold">{trends.declined}</span> spadek
            </span>
            {trends.other > 0 && (
              <span className="flex items-center gap-1 text-faint">
                <TrendIcon trend="unclear" /> <span className="tnum font-semibold">{trends.other}</span> inny ciężar / RIR
              </span>
            )}
          </div>
        )}
        {!!pending && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-go/30 bg-go/10 px-3 py-2 text-sm text-go">
            <TrendingUp size={16} /> {pending} {pending === 1 ? 'propozycja' : pending < 5 ? 'propozycje' : 'propozycji'} zwiększenia ciężaru — zdecydujesz w trakcie treningu.
          </div>
        )}
        {lastMetric && (
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3 text-sm">
            <span className="text-muted">Pomiar {fmtDate(lastMetric.date)}</span>
            <span className="tnum font-medium" data-testid="last-metric">
              {lastMetric.weightKg != null && `${fmtNum(lastMetric.weightKg, 2)} kg`}
              {lastMetric.weightKg != null && lastMetric.waistCm != null && ' · '}
              {lastMetric.waistCm != null && `pas ${fmtNum(lastMetric.waistCm, 1)} cm`}
            </span>
          </div>
        )}
      </Card>

      {needsBackup && (
        <button type="button" onClick={() => navigate('/settings')} className="mt-3 flex w-full items-start gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-3 text-left text-sm">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-warn" />
          <span>
            <span className="font-semibold text-warn">Zrób kopię zapasową.</span>{' '}
            <span className="text-muted">
              {settings.lastExportAt ? `Ostatni eksport ${relativeDay(settings.lastExportAt)}.` : 'Nie wykonano jeszcze eksportu.'} Dane są tylko na tym urządzeniu.
            </span>
          </span>
        </button>
      )}

      {history.completed.length === 0 && !inProgress && (
        <p className="mt-6 px-2 text-center text-sm text-faint">
          Pierwszy tydzień to nauka ruchu: zostaw ok. 4 powtórzenia w zapasie i dobierz ciężar zachowawczo. Technikę każdego ćwiczenia znajdziesz w zakładce <button type="button" className="text-accent underline" onClick={() => navigate('/atlas')}>Atlas</button>.
        </p>
      )}
    </div>
  )
}
