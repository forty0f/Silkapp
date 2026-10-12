import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { RirTarget, SessionExercise, SetEntry } from '../../domain/types'
import { deleteSet, saveSet } from '../../db/repo'
import { Button, Sheet, cx } from '../../components/ui'
import { useFeedback } from '../../components/feedback'
import { SetFields } from './SetFields'
import { draftFromSet, normalizeDraft, validateDraft, type SetDraft } from './setDraft'

export function SetEditSheet({
  set,
  ex,
  weightStep,
  targetRir,
  onClose,
}: {
  set: SetEntry
  ex: SessionExercise
  weightStep: number
  targetRir: RirTarget
  onClose: () => void
}) {
  const [draft, setDraft] = useState<SetDraft>(() => draftFromSet(set))
  const [busy, setBusy] = useState(false)
  const { toast, confirm } = useFeedback()
  const label = set.type === 'warmup' ? `Rozgrzewka ${set.setNumber}` : `Seria ${set.setNumber}${set.isExtra ? ' (dodatkowa)' : ''}`

  const save = async () => {
    const err = validateDraft(ex, draft)
    if (err) return toast(err, 'error')
    setBusy(true)
    try {
      await saveSet({ ...set, ...normalizeDraft(ex, draft) })
      toast('Zmiany zapisane', 'success')
      onClose()
    } catch (e) {
      toast(`Nie udało się zapisać zmian: ${(e as Error).message}. Dane formularza są zachowane — spróbuj ponownie.`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: 'Usunąć serię?', body: `${ex.name} · ${label}. Tej operacji nie można cofnąć.`, confirmLabel: 'Usuń', danger: true }))) return
    try {
      await deleteSet(set.id)
      toast('Seria usunięta', 'info')
      onClose()
    } catch (e) {
      toast(`Nie udało się usunąć serii: ${(e as Error).message}`, 'error')
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Edytuj · ${label}`}
      footer={
        <div className="flex gap-3">
          <Button variant="danger" onClick={remove} aria-label="Usuń serię">
            <Trash2 size={18} />
          </Button>
          <Button className="flex-1" onClick={onClose}>
            Anuluj
          </Button>
          <Button className="flex-1" variant="primary" disabled={busy} onClick={save} data-testid="save-edit">
            Zapisz
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-muted">{ex.name}</p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(['done', 'skipped'] as const).map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => setDraft((d) => ({ ...d, status: st }))}
            className={cx('min-h-11 rounded-xl border text-sm font-medium', draft.status === st ? 'border-accent bg-accent/15 text-accent' : 'border-line text-muted')}
          >
            {st === 'done' ? 'Wykonana' : 'Pominięta'}
          </button>
        ))}
      </div>
      {draft.status === 'done' ? (
        <SetFields ex={ex} draft={draft} onChange={setDraft} weightStep={weightStep} targetRir={set.type === 'working' ? targetRir : undefined} />
      ) : (
        <p className="text-sm text-muted">Seria oznaczona jako pominięta — nie liczy się do objętości ani progresji.</p>
      )}
    </Sheet>
  )
}
