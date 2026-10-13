import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Info, LineChart as LineIcon, Plus, Scale, Trash2 } from 'lucide-react'
import { db } from '../../db/db'
import { deleteBodyMetric, saveBodyMetric } from '../../db/repo'
import { EXERCISES } from '../../domain/exercises'
import { DEFAULT_WORKOUTS } from '../../domain/plan'
import { comparePerformances, fmtKg } from '../../domain/progression'
import { exerciseHistory, movingAverage, toDateKey, weeklySummaries } from '../../domain/metrics'
import type { ExerciseId, Session } from '../../domain/types'
import { fmtDate, fmtNum, fmtShort, fmtVolume, parseDecimal, toDate, todayKey } from '../../lib/format'
import { navigate } from '../../lib/router'
import { PageHeader } from '../../components/PageHeader'
import { Chart, SERIES } from '../../components/Chart'
import { Button, Card, EmptyState, SectionTitle, WorkoutBadge, cx } from '../../components/ui'
import { useFeedback } from '../../components/feedback'
import { useHistoryData, type HistoryData } from '../useHistoryData'
import { TrendIcon } from '../workout/WorkoutSummary'
import { hasMaxDecimals, summarizePerformance } from '../workout/setDraft'

type Tab = 'exercises' | 'body' | 'weeks'

export function ProgressPage() {
  const [tab, setTab] = useState<Tab>('exercises')
  const data = useHistoryData()
  return (
    <div>
      <PageHeader title="Progres" />
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1" role="tablist">
        {(
          [
            ['exercises', 'Ćwiczenia'],
            ['body', 'Ciało'],
            ['weeks', 'Tygodnie'],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cx('min-h-11 rounded-xl text-sm font-medium', tab === k ? 'bg-surface-3 text-ink' : 'text-muted')}>
            {l}
          </button>
        ))}
      </div>
      {!data ? null : tab === 'exercises' ? <ExercisesTab data={data} /> : tab === 'body' ? <BodyTab /> : <WeeksTab data={data} />}
    </div>
  )
}

function ExercisesTab({ data }: { data: HistoryData }) {
  const [exId, setExId] = useState<ExerciseId>('goblet-squat')
  const points = useMemo(() => exerciseHistory(exId, data.completed, data.setsBySession), [exId, data])
  const ex = EXERCISES[exId]
  const sessions = data.completed.filter((s) => s.exercises.some((e) => e.exerciseId === exId))
  const prescription = sessions[0]?.exercises.find((e) => e.exerciseId === exId) ?? [...DEFAULT_WORKOUTS.A, ...DEFAULT_WORKOUTS.B].find((e) => e.exerciseId === exId)!
  const timed = prescription.unit === 'seconds'
  const loaded = prescription.loaded

  if (data.completed.length === 0) {
    return (
      <EmptyState icon={<LineIcon size={26} />} title="Brak danych do wykresów">
        Wykresy pojawią się po pierwszym ukończonym treningu.
      </EmptyState>
    )
  }

  const perfFor = (s: Session) => ({
    sessionId: s.id,
    date: s.startedAt,
    exercise: s.exercises.find((e) => e.exerciseId === exId)!,
    targetRir: s.targetRir,
    sets: (data.setsBySession.get(s.id) ?? []).filter((x) => x.exerciseId === exId),
  })

  const last = points.at(-1)
  const best = points.reduce((m, p) => Math.max(m, p.topWeightKg ?? 0), 0)

  return (
    <div className="pb-4">
      <label className="mt-4 block">
        <span className="sr-only">Ćwiczenie</span>
        <select
          value={exId}
          onChange={(e) => setExId(e.target.value as ExerciseId)}
          className="min-h-12 w-full rounded-2xl border border-line bg-surface px-4 text-base font-semibold outline-none focus:border-accent"
          data-testid="exercise-select"
        >
          {(['A', 'B'] as const).map((w) => (
            <optgroup key={w} label={`Trening ${w}`}>
              {DEFAULT_WORKOUTS[w].map((e) => (
                <option key={e.exerciseId} value={e.exerciseId}>
                  {EXERCISES[e.exerciseId].name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {points.length === 0 ? (
        <EmptyState icon={<LineIcon size={26} />} title={`Brak sesji: ${ex.name}`}>
          To ćwiczenie jest w treningu {ex.workout}. Dane pojawią się po jego wykonaniu.
        </EmptyState>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Card className="p-3">
              <div className="text-[11px] text-faint">{timed ? 'Ostatnio najlepsza' : 'Ciężar roboczy'}</div>
              <div className="tnum mt-0.5 text-lg font-bold">{timed ? `${last?.bestValue ?? '—'} s` : loaded ? fmtKg(last?.topWeightKg) : `${last?.bestValue}`}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] text-faint">{timed ? 'Rekord czasu' : 'Najwyższy ciężar'}</div>
              <div className="tnum mt-0.5 text-lg font-bold">{timed ? `${Math.max(...points.map((p) => p.bestValue))} s` : fmtKg(best)}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] text-faint">Sesje</div>
              <div className="tnum mt-0.5 text-lg font-bold">{points.length}</div>
            </Card>
          </div>

          <SectionTitle>Siła</SectionTitle>
          <Card className="p-3">
            {timed ? (
              <>
                <h3 className="mb-1 text-sm font-semibold">Najdłuższa seria (s)</h3>
                <Chart ariaLabel={`${ex.name}: najdłuższa seria w sekundach`} unit="s" series={[{ name: 'Czas', color: SERIES.primary, points: points.map((p) => ({ label: fmtShort(p.date), value: p.bestValue })) }]} />
              </>
            ) : (
              <>
                <h3 className="mb-1 text-sm font-semibold">Ciężar roboczy — 1 hantel (kg)</h3>
                <Chart
                  ariaLabel={`${ex.name}: ciężar roboczy`}
                  unit="kg"
                  series={[{ name: 'Ciężar', color: SERIES.primary, points: points.map((p) => ({ label: fmtShort(p.date), value: p.topWeightKg, detail: `${p.repsAtTop.join(' · ')} powt.` })) }]}
                />
                <h3 className="mb-1 mt-4 text-sm font-semibold">Średnio powtórzeń na serię przy ciężarze roboczym</h3>
                <Chart
                  ariaLabel={`${ex.name}: powtórzenia przy ciężarze roboczym`}
                  unit="powt."
                  series={[
                    {
                      name: 'Powtórzenia',
                      color: SERIES.primary,
                      points: points.map((p) => ({ label: fmtShort(p.date), value: Math.round((p.repsAtTop.reduce((a, b) => a + b, 0) / Math.max(1, p.repsAtTop.length)) * 10) / 10, detail: p.topWeightKg != null ? fmtKg(p.topWeightKg) : undefined })),
                    },
                  ]}
                />
                {prescription.perSide && <p className="mt-1 text-xs text-faint">Dla ćwiczeń jednostronnych liczy się słabsza strona.</p>}
              </>
            )}
          </Card>

          <SectionTitle>Objętość treningowa</SectionTitle>
          <Card className="p-3">
            <h3 className="mb-1 text-sm font-semibold">{timed ? 'Łączny czas (s)' : loaded ? 'Σ ciężar hantli × liczba hantli × powtórzenia (kg)' : 'Łączne powtórzenia'}</h3>
            <Chart
              kind="bar"
              ariaLabel={`${ex.name}: objętość`}
              unit={timed ? 's' : loaded ? 'kg' : ''}
              series={[{ name: 'Objętość', color: SERIES.secondary, points: points.map((p) => ({ label: fmtShort(p.date), value: timed || !loaded ? p.totalValue : Math.round(p.volumeKg), detail: `${p.workingSets} serii` })) }]}
            />
            <p className="mt-2 flex gap-2 text-xs text-faint">
              <Info size={14} className="mt-px shrink-0" /> {loaded && !timed ? 'Liczone tylko obciążenie zewnętrzne (bez masy ciała). ' : ''}Rośnie też od samego dodania serii (T1 → T4). To nie jest miara siły — siłę pokazują wykresy powyżej.
            </p>
          </Card>

          <SectionTitle>Sesje</SectionTitle>
          <div className="space-y-2">
            {sessions.slice(0, 12).map((s, i) => {
              const prev = sessions[i + 1]
              const cmp = comparePerformances(perfFor(s), prev ? perfFor(prev) : null)
              return (
                <button key={s.id} type="button" onClick={() => navigate(`/history/${s.id}`)} className="flex w-full items-center gap-3 rounded-2xl border border-line/70 bg-surface p-3 text-left active:bg-surface-2">
                  <TrendIcon trend={cmp.trend} />
                  <div className="min-w-0 flex-1">
                    <div className="tnum truncate font-medium">{summarizePerformance(perfFor(s))}</div>
                    <div className="truncate text-xs text-muted">
                      {fmtDate(s.startedAt)} · {cmp.detail}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function BodyTab() {
  const metrics = useLiveQuery(() => db.bodyMetrics.orderBy('date').toArray())
  const { toast, confirm } = useFeedback()
  const [date, setDate] = useState(todayKey())
  const [weight, setWeight] = useState('')
  const [waist, setWaist] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    const w = parseDecimal(weight)
    const p = parseDecimal(waist)
    if (weight && (w == null || w < 25 || w > 350)) return toast('Masa ciała poza zakresem 25–350 kg.', 'error')
    if (w != null && !hasMaxDecimals(w, 2)) return toast('Masa ciała: maksymalnie 2 miejsca po przecinku.', 'error')
    if (waist && (p == null || p < 40 || p > 250)) return toast('Obwód pasa poza zakresem 40–250 cm.', 'error')
    if (p != null && !hasMaxDecimals(p, 1)) return toast('Obwód pasa: maksymalnie 1 miejsce po przecinku (np. 92,5 cm).', 'error')
    if (w == null && p == null) return toast('Podaj masę ciała lub obwód pasa.', 'error')
    setBusy(true)
    try {
      const existing = await db.bodyMetrics.where('date').equals(date).first()
      await saveBodyMetric({ id: existing?.id, date, weightKg: w ?? existing?.weightKg ?? null, waistCm: p ?? existing?.waistCm ?? null, note: existing?.note ?? '' })
      setWeight('')
      setWaist('')
      toast(existing ? 'Pomiar z tego dnia zaktualizowany' : 'Pomiar zapisany', 'success')
    } catch (e) {
      toast(`Nie udało się zapisać pomiaru: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const weights = (metrics ?? []).filter((m) => m.weightKg != null)
  const waists = (metrics ?? []).filter((m) => m.waistCm != null)
  const avg = movingAverage(weights.map((m) => m.weightKg!), 7)

  return (
    <div className="pb-4">
      <Card className="mt-4">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <Scale size={18} className="text-accent" /> Nowy pomiar
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 block">
            <span className="mb-1 block text-xs text-muted">Data</span>
            <input type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value)} className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-3 text-base outline-none focus:border-accent" />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs text-muted">Masa ciała (kg)</span>
            <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="np. 84,6" data-testid="body-weight" className="tnum min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-3 text-base outline-none focus:border-accent" />
          </label>
          <label className="block min-w-0">
            <span className="mb-1 block text-xs text-muted">Obwód pasa (cm)</span>
            <input inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="np. 92" data-testid="body-waist" className="tnum min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-3 text-base outline-none focus:border-accent" />
          </label>
        </div>
        <Button variant="primary" className="mt-3 w-full" onClick={add} disabled={busy} data-testid="body-save">
          <Plus size={18} /> Zapisz pomiar
        </Button>
        <p className="mt-2 text-xs text-faint">Ważenie najlepiej rano, po toalecie, przed jedzeniem. Pas mierz na wysokości pępka, na wydechu.</p>
      </Card>

      <div className="mt-3 flex gap-2 rounded-2xl border border-accent/20 bg-accent/5 p-3 text-xs leading-relaxed text-muted">
        <Info size={16} className="mt-px shrink-0 text-accent" />
        <p className="m-0">
          Masa ciała zmienia się z dnia na dzień o 0,5–2 kg (woda, glikogen, sól, treść jelit). Spadek masy nie oznacza automatycznie utraty wyłącznie tkanki tłuszczowej — patrz na trend tygodniowy razem z obwodem pasa i wynikami siłowymi. Utrzymanie siły przy spadku masy i obwodu
          sugeruje, że tracisz głównie tłuszcz, ale nie jest to pomiar składu ciała.
        </p>
      </div>

      {metrics && metrics.length === 0 && (
        <EmptyState icon={<Scale size={26} />} title="Brak pomiarów">
          Dodaj pierwszy pomiar masy ciała lub obwodu pasa.
        </EmptyState>
      )}

      {weights.length > 0 && (
        <>
          <SectionTitle>Masa ciała (kg)</SectionTitle>
          <Card className="p-3">
            <Chart
              ariaLabel="Masa ciała"
              unit="kg"
              series={[
                { name: 'Pomiar', color: SERIES.primary, style: 'dots', points: weights.map((m) => ({ label: fmtShort(m.date), value: m.weightKg })) },
                { name: 'Średnia z 7 pomiarów', color: SERIES.secondary, points: weights.map((m, i) => ({ label: fmtShort(m.date), value: Math.round(avg[i] * 10) / 10 })) },
              ]}
            />
          </Card>
        </>
      )}
      {waists.length > 0 && (
        <>
          <SectionTitle>Obwód pasa (cm)</SectionTitle>
          <Card className="p-3">
            <Chart ariaLabel="Obwód pasa" unit="cm" series={[{ name: 'Obwód pasa', color: SERIES.primary, points: waists.map((m) => ({ label: fmtShort(m.date), value: m.waistCm })) }]} />
          </Card>
        </>
      )}

      {metrics && metrics.length > 0 && (
        <>
          <SectionTitle>Pomiary</SectionTitle>
          <Card className="p-1">
            <ul className="m-0 list-none p-0">
              {[...metrics].reverse().map((m) => (
                <li key={m.id} className="flex min-h-12 items-center gap-3 border-b border-line/50 px-3 last:border-0">
                  <span className="min-w-0 flex-1 text-sm text-muted">{fmtDate(m.date)}</span>
                  <span className="tnum whitespace-nowrap text-sm">{m.weightKg != null ? `${fmtNum(m.weightKg)} kg` : '—'}</span>
                  <span className="tnum w-20 whitespace-nowrap text-right text-sm">{m.waistCm != null ? `${fmtNum(m.waistCm)} cm` : '—'}</span>
                  <button
                    type="button"
                    aria-label="Usuń pomiar"
                    className="flex h-11 w-11 items-center justify-center rounded-xl text-faint active:bg-surface-2"
                    onClick={async () => {
                      if (await confirm({ title: 'Usunąć pomiar?', body: fmtDate(m.date), confirmLabel: 'Usuń', danger: true })) await deleteBodyMetric(m.id)
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}

function WeeksTab({ data }: { data: HistoryData }) {
  const weeks = useMemo(() => weeklySummaries(data.completed, data.setsBySession), [data])
  if (weeks.length === 0) {
    return (
      <EmptyState icon={<LineIcon size={26} />} title="Brak podsumowań">
        Podsumowania tygodniowe pojawią się po pierwszym treningu.
      </EmptyState>
    )
  }
  const chrono = [...weeks].reverse()
  return (
    <div className="pb-4">
      <SectionTitle>Serie robocze w tygodniu</SectionTitle>
      <Card className="p-3">
        <Chart kind="bar" ariaLabel="Serie robocze w kolejnych tygodniach" series={[{ name: 'Serie', color: SERIES.primary, points: chrono.map((w) => ({ label: fmtShort(w.weekKey), value: w.workingSets, detail: `${w.sessions.length} tren.` })) }]} />
      </Card>
      <SectionTitle>Tygodnie kalendarzowe</SectionTitle>
      <div className="space-y-2">
        {weeks.map((w) => {
          const end = toDate(w.weekKey)
          end.setDate(end.getDate() + 6)
          return (
            <Card key={w.weekKey} className="p-3" data-testid="week-summary">
              <div className="flex items-center justify-between gap-2">
                <div className="font-semibold">
                  {fmtShort(w.weekKey)} – {fmtShort(toDateKey(end))}
                </div>
                <div className="flex gap-1">
                  {[...w.sessions].reverse().map((s) => (
                    <WorkoutBadge key={s.id} type={s.workoutType} size="sm" />
                  ))}
                </div>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
                <div className="rounded-xl bg-surface-2 p-2">
                  <div className="tnum font-bold">{w.sessions.length}/3</div>
                  <div className="text-[11px] text-muted">treningi</div>
                </div>
                <div className="rounded-xl bg-surface-2 p-2">
                  <div className="tnum font-bold">{w.workingSets}</div>
                  <div className="text-[11px] text-muted">serie robocze</div>
                </div>
                <div className="rounded-xl bg-surface-2 p-2">
                  <div className="tnum font-bold">{fmtVolume(w.volumeKg)}</div>
                  <div className="text-[11px] text-muted">ciężar × powt.</div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
