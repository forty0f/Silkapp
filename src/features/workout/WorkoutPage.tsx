import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BookOpen, Check, ChevronLeft, ChevronRight, Flag, History, LogOut, MoreHorizontal, StickyNote, Trash2, TrendingUp } from 'lucide-react'
import { db } from '../../db/db'
import { decideSuggestion, deleteSession, finishSession, getSettings, lastPerformance, preferredWeight, saveSet, updateSession, updateSettings } from '../../db/repo'
import type { Session, SessionExercise, SetEntry, SetType } from '../../domain/types'
import { formatRange, formatRest, formatRir } from '../../domain/plan'
import { fmtKg } from '../../domain/progression'
import { fmtClock, relativeDay } from '../../lib/format'
import { navigate } from '../../lib/router'
import { unlockAudio } from '../../lib/feedback'
import { useNow } from '../../lib/useNow'
import { useWakeLock } from '../../lib/useWakeLock'
import { Button, Card, Pill, Sheet, Toggle, WorkoutBadge, cx } from '../../components/ui'
import { useFeedback } from '../../components/feedback'
import { ExerciseFigure } from '../atlas/ExerciseFigure'
import { ExerciseSheetContent } from '../atlas/ExerciseSheetContent'
import { RestTimerBar } from './RestTimerBar'
import { SetEditSheet } from './SetEditSheet'
import { SetFields } from './SetFields'
import { formatSetValue, normalizeDraft, prefillDraft, summarizePerformance, validateDraft, type SetDraft } from './setDraft'
import { WorkoutSummary } from './WorkoutSummary'

let persistRequested = false
function requestPersistence() {
  if (persistRequested) return
  persistRequested = true
  void navigator.storage?.persist?.().catch(() => {})
}

export function WorkoutPage({ sessionId }: { sessionId: string }) {
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId], null)
  const sets = useLiveQuery(() => db.sets.where('sessionId').equals(sessionId).toArray(), [sessionId])
  const settings = useLiveQuery(getSettings)

  if (session === null || !sets || !settings) return <div className="min-h-dvh" aria-busy="true" />
  if (!session) {
    return (
      <div className="py-16 text-center">
        <p className="mb-4 text-muted">Ten trening nie istnieje (mógł zostać usunięty).</p>
        <Button variant="primary" onClick={() => navigate('/')}>
          Wróć
        </Button>
      </div>
    )
  }
  if (session.status === 'completed') return <WorkoutSummary session={session} sets={sets} />
  return <ActiveWorkout session={session} sets={sets} settings={settings} />
}

function exerciseProgress(ex: SessionExercise, sets: SetEntry[]) {
  const working = sets.filter((s) => s.exerciseId === ex.exerciseId && s.type === 'working')
  return { logged: Math.min(working.length, ex.plannedSets), planned: ex.plannedSets, complete: working.length >= ex.plannedSets }
}

function ActiveWorkout({ session, sets, settings }: { session: Session; sets: SetEntry[]; settings: Awaited<ReturnType<typeof getSettings>> }) {
  const { toast, confirm } = useFeedback()
  const [menuOpen, setMenuOpen] = useState(false)
  const [atlasFor, setAtlasFor] = useState<SessionExercise | null>(null)
  useWakeLock(settings.keepScreenOn)
  const now = useNow(true, 1000)

  const idx = Math.min(session.currentExerciseIndex, session.exercises.length - 1)
  const ex = session.exercises[idx]
  const progress = session.exercises.map((e) => exerciseProgress(e, sets))
  const totalPlanned = progress.reduce((a, p) => a + p.planned, 0)
  const totalLogged = progress.reduce((a, p) => a + p.logged, 0)
  const allDone = progress.every((p) => p.complete)

  const goTo = useCallback(
    async (i: number) => {
      try {
        await updateSession(session.id, { currentExerciseIndex: i })
        window.scrollTo({ top: 0 })
      } catch (e) {
        toast(`Błąd zapisu: ${(e as Error).message}`, 'error')
      }
    },
    [session.id, toast],
  )

  const finish = async () => {
    const missing = totalPlanned - totalLogged
    const ok = await confirm({
      title: 'Zakończyć trening?',
      body:
        missing > 0
          ? `Zapisano ${totalLogged} z ${totalPlanned} zaplanowanych serii roboczych. Brakujące serie nie zostaną uwzględnione w ocenie progresji.`
          : 'Wszystkie zaplanowane serie są zapisane. Po zakończeniu zobaczysz podsumowanie i propozycje progresji.',
      confirmLabel: 'Zakończ',
    })
    if (!ok) return
    try {
      await finishSession(session.id)
      setMenuOpen(false)
    } catch (e) {
      toast(`Nie udało się zakończyć treningu: ${(e as Error).message}`, 'error')
    }
  }

  const discard = async () => {
    const ok = await confirm({
      title: 'Odrzucić ten trening?',
      body: `Zostanie trwale usunięty razem z ${sets.length} zapisanymi seriami. Jeśli chcesz tylko przerwać, użyj „Wstrzymaj i wyjdź”.`,
      confirmLabel: 'Odrzuć trening',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteSession(session.id)
      navigate('/', { replace: true })
    } catch (e) {
      toast(`Nie udało się usunąć: ${(e as Error).message}`, 'error')
    }
  }

  const dismissTimer = useCallback(() => {
    void updateSession(session.id, { restTimer: null }).catch(() => {})
  }, [session.id])

  return (
    <div className="pb-4">
      <header className="sticky top-0 z-20 -mx-4 border-b border-line/60 bg-bg/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Wstrzymaj i wyjdź" onClick={() => navigate('/')} className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-2">
            <ChevronLeft size={26} />
          </button>
          <WorkoutBadge type={session.workoutType} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold leading-tight">Trening {session.workoutType}</div>
            <div className="truncate text-xs text-muted">
              Tydz. {session.week} · {session.slot}/3 · <span className="text-accent">RIR {formatRir(session.targetRir)}</span>
            </div>
          </div>
          <div className="tnum text-right text-sm text-muted" aria-label="Czas treningu">
            {fmtClock((now - new Date(session.startedAt).getTime()) / 1000)}
          </div>
          <button type="button" aria-label="Menu treningu" onClick={() => setMenuOpen(true)} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-surface-2" data-testid="workout-menu">
            <MoreHorizontal size={24} />
          </button>
        </div>
        <nav className="mt-2 grid grid-cols-6 gap-1.5" aria-label="Ćwiczenia">
          {session.exercises.map((e, i) => {
            const p = progress[i]
            return (
              <button
                key={e.exerciseId}
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === idx ? 'step' : undefined}
                aria-label={`${i + 1}. ${e.name}, ${p.logged} z ${p.planned} serii`}
                className={cx(
                  'relative flex min-h-11 flex-col items-center justify-center rounded-xl border text-sm font-semibold',
                  i === idx ? 'border-accent bg-accent/15 text-accent' : p.complete ? 'border-go/30 bg-go/10 text-go' : 'border-line bg-surface text-muted',
                )}
              >
                {p.complete && i !== idx ? <Check size={16} /> : i + 1}
                <span className="absolute inset-x-2 bottom-1 flex gap-0.5">
                  {Array.from({ length: p.planned }, (_, k) => (
                    <span key={k} className={cx('h-0.5 flex-1 rounded-full', k < p.logged ? 'bg-current' : 'bg-line')} />
                  ))}
                </span>
              </button>
            )
          })}
        </nav>
      </header>

      <ExercisePanel key={ex.exerciseId} session={session} ex={ex} index={idx} sets={sets} settings={settings} onOpenAtlas={() => setAtlasFor(ex)} onAdvance={() => idx < session.exercises.length - 1 && goTo(idx + 1)} />

      <div className="mt-4 flex gap-3">
        <Button className="flex-1" disabled={idx === 0} onClick={() => goTo(idx - 1)}>
          <ChevronLeft size={18} /> Poprzednie
        </Button>
        <Button className="flex-1" disabled={idx === session.exercises.length - 1} onClick={() => goTo(idx + 1)}>
          Następne <ChevronRight size={18} />
        </Button>
      </div>

      <div className="mt-6 text-center text-xs text-faint">
        Serie robocze: {totalLogged}/{totalPlanned}. Każda seria zapisuje się od razu na urządzeniu.
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-4 space-y-2 border-t border-line/60 bg-bg/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl" id="workout-actions">
        {session.restTimer && (
          <RestTimerBar
            timer={session.restTimer}
            sound={settings.soundEnabled}
            vibration={settings.vibrationEnabled}
            onAdjust={(d) => {
              const t = session.restTimer!
              void updateSession(session.id, { restTimer: { ...t, durationSec: Math.max(5, t.durationSec + d) } })
            }}
            onDismiss={dismissTimer}
          />
        )}
        {allDone && (
          <Button variant="go" size="lg" className="w-full" onClick={finish} data-testid="finish-workout">
            <Flag size={20} /> Zakończ trening
          </Button>
        )}
        <div id="set-action-slot" />
      </div>

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Trening">
        <div className="space-y-2 pb-2">
          <Button variant="go" className="w-full justify-start" onClick={finish} data-testid="menu-finish">
            <Flag size={18} /> Zakończ trening
          </Button>
          <Button className="w-full justify-start" onClick={() => navigate('/')}>
            <LogOut size={18} /> Wstrzymaj i wyjdź (wrócisz później)
          </Button>
          <NoteEditor session={session} />
          <div className="rounded-2xl bg-surface-2 px-4">
            <Toggle checked={settings.keepScreenOn} onChange={(v) => void updateSettings({ keepScreenOn: v })} label="Nie wygaszaj ekranu" description="Działa, jeśli przeglądarka obsługuje Wake Lock." />
          </div>
          <Button variant="danger" className="w-full justify-start" onClick={discard} data-testid="menu-discard">
            <Trash2 size={18} /> Odrzuć trening
          </Button>
        </div>
      </Sheet>

      <Sheet open={!!atlasFor} onClose={() => setAtlasFor(null)} title={atlasFor?.name ?? ''}>
        {atlasFor && <ExerciseSheetContent exerciseId={atlasFor.exerciseId} />}
      </Sheet>
    </div>
  )
}

function NoteEditor({ session }: { session: Session }) {
  const [note, setNote] = useState(session.note)
  const { toast } = useFeedback()
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <label className="mb-2 flex items-center gap-2 text-sm text-muted">
        <StickyNote size={16} /> Notatka do treningu
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note !== session.note && void updateSession(session.id, { note }).catch((e: Error) => toast(`Błąd zapisu notatki: ${e.message}`, 'error'))}
        rows={2}
        maxLength={1000}
        placeholder="samopoczucie, sen, ból…"
        className="w-full rounded-xl border border-line bg-surface p-2.5 text-base outline-none focus:border-accent"
      />
    </div>
  )
}

function ExercisePanel({
  session,
  ex,
  index,
  sets,
  settings,
  onOpenAtlas,
  onAdvance,
}: {
  session: Session
  ex: SessionExercise
  index: number
  sets: SetEntry[]
  settings: Awaited<ReturnType<typeof getSettings>>
  onOpenAtlas: () => void
  onAdvance: () => void
}) {
  const { toast } = useFeedback()
  const [type, setType] = useState<SetType>('working')
  const [editing, setEditing] = useState<SetEntry | null>(null)
  // Last values typed in the form; fills gaps after a skipped set.
  const [carry, setCarry] = useState<SetDraft | null>(null)

  const ctx = useLiveQuery(async () => {
    const last = await lastPerformance(ex.exerciseId, session.id)
    const preferred = await preferredWeight(ex.exerciseId, last)
    const pending = (await db.suggestions.where('exerciseId').equals(ex.exerciseId).toArray()).find((s) => s.status === 'pending')
    return { last, preferred, pending: pending ?? null }
  }, [ex.exerciseId, session.id])

  const mine = useMemo(() => sets.filter((s) => s.exerciseId === ex.exerciseId), [sets, ex.exerciseId])
  const warmups = mine.filter((s) => s.type === 'warmup').sort((a, b) => a.setNumber - b.setNumber)
  const working = mine.filter((s) => s.type === 'working').sort((a, b) => a.setNumber - b.setNumber)
  const nextNumber = (type === 'working' ? working.length : warmups.length) + 1
  const isExtra = type === 'working' && working.length >= ex.plannedSets

  return (
    <div className="mt-3 space-y-3">
      <Card className="p-3">
        <div className="flex gap-3">
          <button type="button" onClick={onOpenAtlas} className="relative h-20 w-24 shrink-0 overflow-hidden min-[375px]:h-24 min-[375px]:w-28 rounded-xl border border-line/60 bg-[#0d1628]" aria-label={`Technika: ${ex.name}`}>
            <ExerciseFigure exerciseId={ex.exerciseId} phase="end" className="h-full w-full" />
            <span className="absolute bottom-1 right-1 rounded-md bg-bg/80 p-1 text-accent">
              <BookOpen size={14} />
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-faint">
              Ćwiczenie {index + 1} z {session.exercises.length}
            </div>
            <h1 className="text-xl font-bold leading-tight tracking-tight" data-testid="exercise-name">
              {ex.name}
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill tone="blue">{formatRange(ex)}</Pill>
              <Pill>
                {ex.plannedSets} {ex.plannedSets === 1 ? 'seria' : ex.plannedSets < 5 ? 'serie' : 'serii'}
              </Pill>
              <Pill>przerwa {formatRest(ex.restSec)}</Pill>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm" data-testid="last-performance">
          <History size={16} className="mt-0.5 shrink-0 text-faint" />
          {ctx === undefined ? (
            <span className="text-faint">Wczytywanie…</span>
          ) : ctx.last ? (
            <span className="min-w-0">
              <span className="text-faint">Ostatnio ({relativeDay(ctx.last.date)}): </span>
              <span className="tnum font-medium">{summarizePerformance(ctx.last)}</span>
            </span>
          ) : (
            <span className="text-faint">Pierwsza sesja tego ćwiczenia — dobierz ciężar zachowawczo (RIR {formatRir(session.targetRir)}).</span>
          )}
        </div>
        {ctx?.pending && (
          <div className="mt-2 rounded-xl border border-go/30 bg-go/10 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-go">
              <TrendingUp size={16} /> Propozycja: {fmtKg(ctx.pending.fromWeightKg)} → {fmtKg(ctx.pending.toWeightKg)}
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="go" className="flex-1" onClick={() => void decideSuggestion(ctx.pending!.id, true).then(() => toast(`Ciężar ${fmtKg(ctx.pending!.toWeightKg)} ustawiony dla kolejnych serii`, 'success'))}>
                Akceptuj
              </Button>
              <Button size="sm" className="flex-1" onClick={() => void decideSuggestion(ctx.pending!.id, false)}>
                Zostaw {fmtKg(ctx.pending.fromWeightKg)}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card className="p-2">
        <ul className="m-0 list-none space-y-1 p-0" data-testid="set-list">
          {warmups.map((s) => (
            <SetRow key={s.id} label={`R${s.setNumber}`} warm s={s} ex={ex} onClick={() => setEditing(s)} />
          ))}
          {working.map((s) => (
            <SetRow key={s.id} label={s.isExtra ? `+${s.setNumber}` : String(s.setNumber)} s={s} ex={ex} onClick={() => setEditing(s)} />
          ))}
          {Array.from({ length: Math.max(0, ex.plannedSets - working.length) }, (_, k) => {
            const n = working.length + k + 1
            const current = k === 0 && type === 'working'
            return (
              <li key={`p${n}`} className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm', current ? 'border border-dashed border-accent/50 text-accent' : 'text-faint')}>
                <span className="tnum w-7 font-semibold">{n}</span>
                <span>{current ? 'Teraz' : 'Zaplanowana'}</span>
              </li>
            )
          })}
        </ul>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="grid grid-cols-2 rounded-xl bg-surface-2 p-1 text-sm" role="tablist">
            {(['working', 'warmup'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={type === t}
                onClick={() => setType(t)}
                data-testid={`type-${t}`}
                className={cx('min-h-9 rounded-lg px-3 font-medium', type === t ? 'bg-surface-3 text-ink' : 'text-muted')}
              >
                {t === 'working' ? 'Robocza' : 'Rozgrzewka'}
              </button>
            ))}
          </div>
          <div className="text-right text-sm font-semibold" data-testid="set-label">
            {type === 'warmup' ? `Rozgrzewka ${nextNumber}` : isExtra ? `Seria dodatkowa ${nextNumber}` : `Seria ${nextNumber} z ${ex.plannedSets}`}
          </div>
        </div>
        {type === 'warmup' && <p className="-mt-1 mb-3 text-xs text-muted">Serie rozgrzewkowe nie liczą się do objętości ani progresji. Typowo 1–2 serie: ~50% ×8, ~75% ×4.</p>}
        {ctx === undefined ? (
          <div className="h-48" aria-busy="true" />
        ) : (
          <SetForm
            key={`${type}-${nextNumber}-${ctx.preferred ?? 'x'}`}
            session={session}
            ex={ex}
            type={type}
            isExtra={isExtra}
            initial={withCarry(prefillDraft({ ex, type, sessionSets: sets, last: ctx.last, preferredWeight: ctx.preferred, targetRir: session.targetRir }), type === carry?.type ? carry : null)}
            weightStep={settings.weightStepKg}
            onSaved={(completedExercise, used) => {
              setCarry(used)
              if (type === 'warmup') return
              if (completedExercise) onAdvance()
            }}
            workingCount={working.length}
          />
        )}
      </Card>

      {editing && <SetEditSheet set={editing} ex={ex} weightStep={settings.weightStepKg} targetRir={session.targetRir} onClose={() => setEditing(null)} />}
    </div>
  )
}

function withCarry(d: SetDraft, carry: SetDraft | null): SetDraft {
  if (!carry) return d
  return {
    ...d,
    weightKg: d.weightKg ?? carry.weightKg,
    reps: d.reps ?? carry.reps,
    repsLeft: d.repsLeft ?? carry.repsLeft,
    repsRight: d.repsRight ?? carry.repsRight,
    durationSec: d.durationSec ?? carry.durationSec,
  }
}

function SetRow({ s, ex, label, warm = false, onClick }: { s: SetEntry; ex: SessionExercise; label: string; warm?: boolean; onClick: () => void }) {
  const skipped = s.status === 'skipped'
  return (
    <li>
      <button type="button" onClick={onClick} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left active:bg-surface-2" data-testid="set-row">
        <span className={cx('tnum w-7 font-semibold', warm ? 'text-warn' : skipped ? 'text-faint' : 'text-go')}>{label}</span>
        <span className={cx('tnum min-w-0 flex-1 truncate', skipped && 'text-faint line-through')}>{formatSetValue(s, ex)}</span>
        {s.type === 'working' && s.rir != null && !skipped && <span className="tnum text-sm text-muted">RIR {s.rir}</span>}
        {!s.techniqueOk && !skipped && <span className="text-xs text-warn">technika</span>}
        {s.note && <StickyNote size={14} className="text-faint" />}
        {!skipped && <Check size={18} className={warm ? 'text-warn' : 'text-go'} />}
      </button>
    </li>
  )
}

function SetForm({
  session,
  ex,
  type,
  isExtra,
  initial,
  weightStep,
  workingCount,
  onSaved,
}: {
  session: Session
  ex: SessionExercise
  type: SetType
  isExtra: boolean
  initial: SetDraft
  weightStep: number
  workingCount: number
  onSaved: (completedExercise: boolean, used: SetDraft) => void
}) {
  const [draft, setDraft] = useState<SetDraft>(initial)
  const [busy, setBusy] = useState(false)
  const { toast } = useFeedback()

  const persist = async (status: 'done' | 'skipped') => {
    const d = { ...draft, status, type }
    const err = validateDraft(ex, d)
    if (err) return toast(err, 'error')
    unlockAudio()
    setBusy(true)
    try {
      const rest = type === 'working' ? ex.restSec : 60
      await saveSet(
        { ...normalizeDraft(ex, d), sessionId: session.id, exerciseId: ex.exerciseId, isExtra: type === 'working' && isExtra },
        { restTimer: status === 'done' ? { exerciseId: ex.exerciseId, startedAt: Date.now(), durationSec: rest } : undefined },
      )
      requestPersistence()
      const completed = type === 'working' && !isExtra && workingCount + 1 >= ex.plannedSets
      onSaved(completed, d)
      if (completed) toast(`${ex.name}: zaplanowane serie wykonane`, 'success')
    } catch (e) {
      toast(`Nie udało się zapisać serii: ${(e as Error).message}. Dane w formularzu zostały zachowane — spróbuj ponownie.`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const label = type === 'warmup' ? 'Zapisz rozgrzewkę' : isExtra ? 'Zapisz serię dodatkową' : 'Zapisz serię'

  return (
    <>
      <SetFields ex={ex} draft={draft} onChange={setDraft} weightStep={weightStep} targetRir={type === 'working' ? session.targetRir : undefined} />
      <SaveBar>
        <div className="flex gap-2">
          {type === 'working' && !isExtra && (
            <Button className="shrink-0" disabled={busy} onClick={() => persist('skipped')} data-testid="skip-set">
              Pomiń
            </Button>
          )}
          <Button variant="primary" size="lg" className="flex-1" disabled={busy} onClick={() => persist('done')} data-testid="save-set">
            <Check size={22} /> {label}
          </Button>
        </div>
      </SaveBar>
    </>
  )
}

/** Renders the primary action into the sticky bottom bar (thumb zone). */
function SaveBar({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  useEffect(() => setSlot(document.getElementById('set-action-slot')), [])
  return slot ? createPortal(children, slot) : null
}
