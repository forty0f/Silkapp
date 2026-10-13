import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Info, RotateCcw } from 'lucide-react'
import { db } from '../../db/db'
import { getActiveProgram, savePlanVersion } from '../../db/repo'
import { EXERCISES } from '../../domain/exercises'
import { createDefaultPlan } from '../../domain/plan'
import type { PlanExercise, PlanVersion, RirTarget, WorkoutType } from '../../domain/types'
import { navigate } from '../../lib/router'
import { PageHeader } from '../../components/PageHeader'
import { Button, Card, SectionTitle, WorkoutBadge } from '../../components/ui'
import { useFeedback } from '../../components/feedback'

function NumField({ label, value, onChange, min = 0, max = 99, testId }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; testId?: string }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  return (
    <label className="block min-w-0">
      <span className="mb-1 block truncate text-[11px] text-muted">{label}</span>
      <input
        inputMode="numeric"
        value={text}
        data-testid={testId}
        onChange={(e) => {
          setText(e.target.value)
          const v = Number(e.target.value)
          if (e.target.value.trim() !== '' && Number.isInteger(v) && v >= min && v <= max) onChange(v)
        }}
        onBlur={() => setText(String(value))}
        className="tnum min-h-11 w-full rounded-xl border border-line bg-surface-2 px-2 text-center text-base outline-none focus:border-accent"
      />
    </label>
  )
}

function validatePlan(p: PlanVersion): string | null {
  for (const w of ['A', 'B'] as const) {
    for (const e of p.workouts[w]) {
      const n = EXERCISES[e.exerciseId].name
      if (e.repMin < 1 || e.repMax < e.repMin) return `${n}: zakres musi spełniać 1 ≤ min ≤ max.`
      if ([...e.setsByWeek, e.continuationSets].some((s) => s < 0 || s > 10)) return `${n}: liczba serii 0–10.`
      if (e.restSec < 0 || e.restSec > 600) return `${n}: przerwa 0–600 s.`
    }
  }
  for (const r of [...p.rirByWeek, p.continuationRir]) if (r.min > r.max) return 'RIR: wartość „od” nie może być większa niż „do”.'
  if (!p.name.trim()) return 'Podaj nazwę programu.'
  return null
}

export function PlanEditorPage() {
  const current = useLiveQuery(async () => {
    const program = await getActiveProgram()
    return program ? db.plans.get(program.planId) : undefined
  })
  const [draft, setDraft] = useState<PlanVersion | null>(null)
  const { toast, confirm } = useFeedback()

  useEffect(() => {
    if (current && !draft) setDraft(structuredClone(current))
  }, [current, draft])

  if (!draft || !current) return null

  const dirty = JSON.stringify(draft) !== JSON.stringify(current)

  const updateEx = (w: WorkoutType, i: number, patch: Partial<PlanExercise>) =>
    setDraft((d) => {
      if (!d) return d
      const next = structuredClone(d)
      next.workouts[w][i] = { ...next.workouts[w][i], ...patch }
      return next
    })
  const updateRir = (week: number | 'cont', patch: Partial<RirTarget>) =>
    setDraft((d) => {
      if (!d) return d
      const next = structuredClone(d)
      if (week === 'cont') next.continuationRir = { ...next.continuationRir, ...patch }
      else next.rirByWeek[week] = { ...next.rirByWeek[week], ...patch }
      return next
    })

  const save = async () => {
    const err = validatePlan(draft)
    if (err) return toast(err, 'error')
    const ok = await confirm({
      title: 'Zapisać nową wersję planu?',
      body: `Powstanie wersja ${current.version + 1}. Zapisane treningi zachowują plan, z którym zostały wykonane. Trwający trening nie zmieni się.`,
      confirmLabel: 'Zapisz',
    })
    if (!ok) return
    try {
      const { id: _id, version: _v, createdAt: _c, updatedAt: _u, ...rest } = draft
      const saved = await savePlanVersion(rest)
      setDraft(structuredClone(saved))
      toast(`Zapisano plan w wersji ${saved.version}`, 'success')
    } catch (e) {
      toast(`Nie udało się zapisać planu: ${(e as Error).message}`, 'error')
    }
  }

  const resetDefaults = async () => {
    if (!(await confirm({ title: 'Przywrócić plan domyślny?', body: 'Wartości w edytorze wrócą do planu startowego. Zmiana zostanie zapisana dopiero po „Zapisz”.', confirmLabel: 'Przywróć' }))) return
    const def = createDefaultPlan(draft.id, draft.createdAt)
    setDraft({ ...def, id: draft.id, version: draft.version, createdAt: draft.createdAt, updatedAt: draft.updatedAt })
  }

  return (
    <div className="pb-28">
      <PageHeader title="Plan treningowy" subtitle={`Wersja ${current.version}`} back="/settings" />
      <Card>
        <label className="block">
          <span className="mb-1 block text-xs text-muted">Nazwa programu</span>
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={80} className="min-h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-base outline-none focus:border-accent" />
        </label>
        <p className="mt-3 flex gap-2 text-xs text-faint">
          <Info size={14} className="mt-px shrink-0" /> Kolejność ćwiczeń jest stała. Liczby serii to serie robocze; rozgrzewkę dodajesz osobno w trakcie treningu.
        </p>
      </Card>

      <SectionTitle>Docelowy RIR</SectionTitle>
      <Card>
        <div className="grid grid-cols-5 gap-2">
          {draft.rirByWeek.map((r, i) => (
            <div key={i} className="min-w-0">
              <div className="mb-1 text-center text-xs font-semibold">T{i + 1}</div>
              <NumField label="od" value={r.min} max={10} onChange={(v) => updateRir(i, { min: v })} />
              <div className="h-1" />
              <NumField label="do" value={r.max} max={10} onChange={(v) => updateRir(i, { max: v })} />
            </div>
          ))}
          <div className="min-w-0">
            <div className="mb-1 text-center text-xs font-semibold">Dalej</div>
            <NumField label="od" value={draft.continuationRir.min} max={10} onChange={(v) => updateRir('cont', { min: v })} />
            <div className="h-1" />
            <NumField label="do" value={draft.continuationRir.max} max={10} onChange={(v) => updateRir('cont', { max: v })} />
          </div>
        </div>
      </Card>

      {(['A', 'B'] as const).map((w) => (
        <section key={w}>
          <SectionTitle>
            <span className="inline-flex items-center gap-2">
              <WorkoutBadge type={w} size="sm" /> Trening {w}
            </span>
          </SectionTitle>
          <div className="space-y-2">
            {draft.workouts[w].map((e, i) => (
              <Card key={e.exerciseId} className="p-3" data-testid={`plan-ex-${e.exerciseId}`}>
                <div className="mb-2 font-semibold">
                  {i + 1}. {EXERCISES[e.exerciseId].name}
                  {e.perSide && <span className="ml-2 text-xs font-normal text-muted">na stronę</span>}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <NumField label={e.unit === 'seconds' ? 'Min (s)' : 'Powt. min'} value={e.repMin} min={1} max={600} onChange={(v) => updateEx(w, i, { repMin: v })} />
                  <NumField label={e.unit === 'seconds' ? 'Max (s)' : 'Powt. max'} value={e.repMax} min={1} max={600} onChange={(v) => updateEx(w, i, { repMax: v })} />
                  <NumField label="Przerwa (s)" value={e.restSec} max={600} onChange={(v) => updateEx(w, i, { restSec: v })} />
                </div>
                <div className="mt-2 grid grid-cols-5 gap-2">
                  {e.setsByWeek.map((s, k) => (
                    <NumField
                      key={k}
                      label={`T${k + 1}`}
                      value={s}
                      max={10}
                      testId={`sets-${e.exerciseId}-${k + 1}`}
                      onChange={(v) => {
                        const sets = [...e.setsByWeek] as PlanExercise['setsByWeek']
                        sets[k] = v
                        updateEx(w, i, { setsByWeek: sets })
                      }}
                    />
                  ))}
                  <NumField label="Dalej" value={e.continuationSets} max={10} onChange={(v) => updateEx(w, i, { continuationSets: v })} />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <Button variant="ghost" className="mt-4 w-full" onClick={resetDefaults}>
        <RotateCcw size={16} /> Przywróć wartości domyślne
      </Button>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-line/60 bg-bg/95 px-safe py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl gap-3">
          <Button className="flex-1" onClick={() => (dirty ? setDraft(structuredClone(current)) : navigate('/settings'))}>
            {dirty ? 'Odrzuć zmiany' : 'Wróć'}
          </Button>
          <Button variant="primary" className="flex-1" disabled={!dirty} onClick={save} data-testid="save-plan">
            Zapisz plan
          </Button>
        </div>
      </div>
    </div>
  )
}
