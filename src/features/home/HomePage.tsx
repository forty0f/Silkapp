import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ArrowRightLeft, ChevronRight, Play, RotateCcw, ShieldCheck, Trash2, TrendingUp } from 'lucide-react'
import { db } from '../../db/db'
import { deleteSession, getInProgressSession, getNextSessionInfo, getSettings, startSession } from '../../db/repo'
import { formatRange, formatRir } from '../../domain/plan'
import { comparePerformances, type ExercisePerformance } from '../../domain/progression'
import { buildSessionExercises, phaseLabel, targetRirFor, weekPattern } from '../../domain/schedule'
import type { WorkoutType } from '../../domain/types'
import { daysAgo, fmtDate, fmtTime, relativeDay } from '../../lib/format'
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
    const result = { improved: 0, same: 0, declined: 0, first: 0 }
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
      if (t === 'improved' || t === 'heavier') result.improved++
      else if (t === 'declined' || t === 'lighter') result.declined++
      else if (t === 'first') result.first++
      else result.same++
    }
    return result
  })()

  const needsBackup = totalCompleted > 0 && (!settings.lastExportAt || daysAgo(settings.lastExportAt) >= 14)

  return (
    <div className="pb-4">
      <header className="pb-3 pt-5">
        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">Program</div>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight" data-testid="program-name">
          {info.program.name}
        </h1>
        <div className="mt-1 text-sm text-muted">{phaseLabel(position, info.plan.adaptationWeeks)}</div>
      </header>

      {inProgress ? (
        <Card className="border-accent/40 bg-gradient-to-b from-accent/10 to-surface" data-testid="resume-card">
          <div className="flex items-center gap-3">
            <WorkoutBadge type={inProgress.workoutType} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-accent">Trening w toku</div>
              <div className="text-lg font-semibold">Trening {inProgress.workoutType}</div>
              <div className="text-sm text-muted">
                Rozpoczęty {relativeDay(inProgress.startedAt)} o {fmtTime(inProgress.startedAt)} · {history.setsBySession.get(inProgress.id)?.filter((s) => s.type === 'working').length ?? 0}/
                {inProgress.exercises.reduce((a, e) => a + e.plannedSets, 0)} serii
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
        <Card className="bg-gradient-to-b from-surface-2 to-surface p-5" data-testid="next-card">
          <div className="flex items-center gap-4">
            <WorkoutBadge type={type} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-faint">Następny trening</div>
              <div className="text-xl font-bold" data-testid="next-type">
                Trening {type}
              </div>
              <div className="text-sm text-muted">
                Tydzień {position.week} · sesja {position.slot}/3
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-faint">cel RIR</div>
              <div className="tnum text-2xl font-bold text-accent" data-testid="target-rir">
                {formatRir(rir)}
              </div>
            </div>
          </div>
          <ol className="mt-4 space-y-1.5 border-t border-line/60 pt-3">
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
          <Button variant="primary" size="lg" className="mt-4 w-full" onClick={start} disabled={starting} data-testid="start-workout">
            <Play size={20} fill="currentColor" /> Rozpocznij trening
          </Button>
          <button
            type="button"
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 text-sm text-muted"
            onClick={() => setOverride(type === 'A' ? 'B' : 'A')}
          >
            <ArrowRightLeft size={14} /> {override ? `Wróć do planu (trening ${info.type})` : `Zamień na trening ${type === 'A' ? 'B' : 'A'}`}
          </button>
          {override && <p className="text-center text-xs text-warn">Zmiana kolejności — kolejny trening po tym będzie przeciwny ({override === 'A' ? 'B' : 'A'}).</p>}
        </Card>
      )}

      {position.phase === 'adaptation' ? (
        <Card className="mt-3">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Okres adaptacyjny</span>
            <span className="tnum text-muted">
              {adaptationDone}/{adaptationTotal} sesji
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {Array.from({ length: info.plan.adaptationWeeks }, (_, w) => (
              <div key={w}>
                <div className="flex gap-0.5">
                  {[0, 1, 2].map((k) => {
                    const n = w * 3 + k
                    return <span key={k} className={cx('h-2 flex-1 rounded-full', n < adaptationDone ? 'bg-go' : n === adaptationDone ? 'bg-accent/60' : 'bg-surface-3')} />
                  })}
                </div>
                <div className="mt-1 text-center text-[11px] text-faint">
                  T{w + 1} · {weekPattern(w + 1).join('')} · RIR {formatRir(info.plan.rirByWeek[w] ?? info.plan.continuationRir)}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="mt-3 flex items-start gap-3">
          <ShieldCheck size={20} className="mt-0.5 shrink-0 text-go" />
          <p className="text-sm text-muted">
            Okres adaptacyjny zakończony. Kontynuujesz plan z docelową liczbą serii i RIR {formatRir(info.plan.continuationRir)} — cała historia jest zachowana.
          </p>
        </Card>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card className="p-3.5">
          <div className="text-xs text-faint">Ostatni trening</div>
          <div className="mt-1 font-semibold" data-testid="last-workout">
            {lastDone ? fmtDate(lastDone.startedAt) : '—'}
          </div>
          <div className="text-sm text-muted">{lastDone ? `${relativeDay(lastDone.startedAt)} · ${lastDone.workoutType}` : 'brak'}</div>
        </Card>
        <Card className="p-3.5">
          <div className="text-xs text-faint">Wykonane treningi</div>
          <div className="tnum mt-1 text-2xl font-bold" data-testid="completed-count">
            {totalCompleted}
          </div>
        </Card>
      </div>

      <SectionTitle action={<button type="button" className="flex min-h-11 items-center text-sm text-accent" onClick={() => navigate('/progress')}>Szczegóły <ChevronRight size={16} /></button>}>
        Progres
      </SectionTitle>
      <Card data-testid="progress-summary">
        {!trends ? (
          <p className="text-sm text-muted">Po pierwszym ukończonym treningu zobaczysz tu porównanie z poprzednimi sesjami.</p>
        ) : (
          <>
            <p className="text-sm text-muted">Ostatni trening ({lastDone!.workoutType}) vs poprzednie wykonanie każdego ćwiczenia:</p>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-surface-2 p-2">
                <div className="flex items-center justify-center gap-1 text-lg font-bold text-go">
                  <TrendIcon trend="improved" /> {trends.improved}
                </div>
                <div className="text-[11px] text-muted">poprawa</div>
              </div>
              <div className="rounded-xl bg-surface-2 p-2">
                <div className="flex items-center justify-center gap-1 text-lg font-bold">
                  <TrendIcon trend="same" /> {trends.same + trends.first}
                </div>
                <div className="text-[11px] text-muted">bez zmian / nowe</div>
              </div>
              <div className="rounded-xl bg-surface-2 p-2">
                <div className="flex items-center justify-center gap-1 text-lg font-bold text-warn">
                  <TrendIcon trend="declined" /> {trends.declined}
                </div>
                <div className="text-[11px] text-muted">spadek</div>
              </div>
            </div>
          </>
        )}
        {!!pending && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-go/30 bg-go/10 px-3 py-2 text-sm text-go">
            <TrendingUp size={16} /> {pending} {pending === 1 ? 'propozycja' : pending < 5 ? 'propozycje' : 'propozycji'} zwiększenia ciężaru — zdecydujesz w trakcie treningu.
          </div>
        )}
        {lastMetric && (
          <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-3 text-sm">
            <span className="text-muted">Ostatni pomiar ({fmtDate(lastMetric.date)})</span>
            <span className="tnum font-medium">
              {lastMetric.weightKg != null && `${String(lastMetric.weightKg).replace('.', ',')} kg`}
              {lastMetric.weightKg != null && lastMetric.waistCm != null && ' · '}
              {lastMetric.waistCm != null && `pas ${String(lastMetric.waistCm).replace('.', ',')} cm`}
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
