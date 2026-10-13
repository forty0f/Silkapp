import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, RotateCcw, StickyNote, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import { deleteSession, getSettings, reopenSession, saveSet } from '../../db/repo'
import { formatRange, formatRir } from '../../domain/plan'
import { activeDurationMs, isCountedSession, sessionVolume } from '../../domain/metrics'
import type { SessionExercise, SetEntry } from '../../domain/types'
import { fmtDay, fmtDuration, fmtTime, fmtVolume } from '../../lib/format'
import { navigate } from '../../lib/router'
import { PageHeader } from '../../components/PageHeader'
import { Button, Card, Pill, cx } from '../../components/ui'
import { useFeedback } from '../../components/feedback'
import { SetEditSheet } from '../workout/SetEditSheet'
import { formatSetValue } from '../workout/setDraft'
import { SuggestionCard } from '../workout/WorkoutSummary'

export function SessionDetailPage({ sessionId }: { sessionId: string }) {
  const session = useLiveQuery(() => db.sessions.get(sessionId), [sessionId], null)
  const sets = useLiveQuery(() => db.sets.where('sessionId').equals(sessionId).toArray(), [sessionId])
  const suggestions = useLiveQuery(() => db.suggestions.where('sourceSessionId').equals(sessionId).toArray(), [sessionId])
  const settings = useLiveQuery(getSettings)
  const [editing, setEditing] = useState<{ set: SetEntry; ex: SessionExercise } | null>(null)
  const { toast, confirm } = useFeedback()

  if (session === null || !sets || !settings) return null
  if (!session) {
    return (
      <div>
        <PageHeader title="Nie znaleziono" back="/history" />
        <p className="text-muted">Ta sesja nie istnieje.</p>
      </div>
    )
  }

  const v = sessionVolume(session, sets)
  const dur = activeDurationMs(session, sets)
  const status = session.status === 'in_progress' ? { tone: 'amber' as const, text: 'w toku' } : isCountedSession(session, sets) ? { tone: 'green' as const, text: 'ukończony' } : { tone: 'neutral' as const, text: 'anulowany — nie zaliczony' }

  const remove = async () => {
    if (!(await confirm({ title: 'Usunąć trening z historii?', body: `${fmtDay(session.startedAt)} · trening ${session.workoutType} · ${sets.length} serii. Tej operacji nie można cofnąć (chyba że masz kopię zapasową).`, confirmLabel: 'Usuń trening', danger: true }))) return
    await deleteSession(session.id)
    toast('Trening usunięty', 'info')
    navigate('/history', { replace: true })
  }

  const reopen = async () => {
    try {
      await reopenSession(session.id)
      navigate(`/workout/${session.id}`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }

  const addSet = async (ex: SessionExercise) => {
    const working = sets.filter((s) => s.exerciseId === ex.exerciseId && s.type === 'working')
    const prev = working.at(-1)
    try {
      const created = await saveSet({
        sessionId: session.id,
        exerciseId: ex.exerciseId,
        type: 'working',
        isExtra: working.length >= ex.plannedSets,
        status: 'done',
        weightKg: ex.loaded ? (prev?.weightKg ?? null) : null,
        reps: ex.unit === 'reps' && !ex.perSide ? (prev?.reps ?? ex.repMin) : null,
        repsLeft: ex.perSide ? (prev?.repsLeft ?? ex.repMin) : null,
        repsRight: ex.perSide ? (prev?.repsRight ?? ex.repMin) : null,
        durationSec: ex.unit === 'seconds' ? (prev?.durationSec ?? ex.repMin) : null,
        rir: ex.unit === 'reps' ? (prev?.rir ?? null) : null,
        techniqueOk: true,
        note: '',
      })
      setEditing({ set: created, ex })
    } catch (e) {
      toast(`Nie udało się dodać serii: ${(e as Error).message}`, 'error')
    }
  }

  return (
    <div className="pb-4">
      <PageHeader
        title={`Trening ${session.workoutType}`}
        subtitle={`${fmtDay(session.startedAt)}, ${fmtTime(session.startedAt)} · tydzień ${session.week}, sesja ${session.slot}/3`}
        back="/history"
      />
      <div className="flex flex-wrap gap-1.5">
        <Pill tone={status.tone}>{status.text}</Pill>
        <Pill>RIR {formatRir(session.targetRir)}</Pill>
        <Pill>{session.phase === 'adaptation' ? 'adaptacja' : 'kontynuacja'}</Pill>
        <Pill>plan v{session.planVersion}</Pill>
        {dur != null && <Pill>{fmtDuration(dur)} aktywnie</Pill>}
        <Pill>
          {v.workingSets} serii{v.volumeKg > 0 ? ` · ${fmtVolume(v.volumeKg)} (ciężar × powt.)` : ''}
        </Pill>
      </div>
      {session.note && (
        <Card className="mt-3 flex gap-2 p-3 text-sm">
          <StickyNote size={16} className="mt-0.5 shrink-0 text-faint" />
          {session.note}
        </Card>
      )}

      <div className="mt-4 space-y-3">
        {session.exercises.map((ex) => {
          const mine = sets.filter((s) => s.exerciseId === ex.exerciseId).sort((a, b) => (a.type === b.type ? a.setNumber - b.setNumber : a.type === 'warmup' ? -1 : 1))
          const sug = suggestions?.find((s) => s.exerciseId === ex.exerciseId)
          return (
            <Card key={ex.exerciseId} className="p-3" data-testid="detail-exercise">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-faint">#{ex.order}</div>
                  <div className="font-semibold">{ex.name}</div>
                  <div className="text-xs text-muted">
                    {ex.plannedSets} × {formatRange(ex)}
                  </div>
                </div>
                <button type="button" onClick={() => addSet(ex)} className="flex min-h-11 items-center gap-1 rounded-xl px-2 text-sm text-accent active:bg-surface-2" aria-label={`Dodaj serię: ${ex.name}`}>
                  <Plus size={16} /> Seria
                </button>
              </div>
              {mine.length === 0 ? (
                <p className="mt-2 text-sm text-faint">Brak zapisanych serii.</p>
              ) : (
                <ul className="m-0 mt-2 list-none space-y-0.5 p-0">
                  {mine.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => setEditing({ set: s, ex })} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left text-sm active:bg-surface-2" data-testid="detail-set">
                        <span className={cx('tnum w-8 font-semibold', s.type === 'warmup' ? 'text-warn' : s.status === 'skipped' ? 'text-faint' : 'text-go')}>
                          {s.type === 'warmup' ? `R${s.setNumber}` : s.isExtra ? `+${s.setNumber}` : s.setNumber}
                        </span>
                        <span className={cx('tnum min-w-0 flex-1 truncate', s.status === 'skipped' && 'text-faint line-through')}>{formatSetValue(s, ex)}</span>
                        {s.rir != null && s.status === 'done' && <span className="tnum text-muted">RIR {s.rir}</span>}
                        {!s.techniqueOk && <span className="text-xs text-warn">technika</span>}
                        {s.note && <StickyNote size={14} className="text-faint" />}
                      </button>
                      {s.note && <p className="mb-1 ml-13 text-xs text-faint">{s.note}</p>}
                    </li>
                  ))}
                </ul>
              )}
              {sug && (
                <div className="mt-2">
                  <SuggestionCard s={sug} />
                </div>
              )}
            </Card>
          )
        })}
      </div>
      <p className="mt-3 px-1 text-xs text-faint">Dotknij serii, aby ją poprawić. Zmiany zapisują się od razu. Propozycje progresji wyliczane są w chwili zakończenia treningu.</p>

      <div className="mt-6 flex gap-2">
        {session.status !== 'in_progress' ? (
          <Button className="flex-1" onClick={reopen}>
            <RotateCcw size={16} /> Wznów trening
          </Button>
        ) : (
          <Button variant="primary" className="flex-1" onClick={() => navigate(`/workout/${session.id}`)}>
            <RotateCcw size={16} /> Kontynuuj
          </Button>
        )}
        <Button variant="danger" className="flex-1" onClick={remove}>
          <Trash2 size={16} /> Usuń
        </Button>
      </div>

      {editing && <SetEditSheet set={editing.set} ex={editing.ex} weightStep={settings.weightStepKg} targetRir={session.targetRir} onClose={() => setEditing(null)} />}
    </div>
  )
}
