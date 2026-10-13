import { useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { activeDurationMs, sessionVolume, toDateKey } from '../../domain/metrics'
import type { Session } from '../../domain/types'
import { fmtDay, fmtDuration, fmtMonth, fmtTime, fmtVolume } from '../../lib/format'
import { navigate } from '../../lib/router'
import { PageHeader } from '../../components/PageHeader'
import { Card, EmptyState, Pill, SectionTitle, WorkoutBadge, cx } from '../../components/ui'
import { useHistoryData } from '../useHistoryData'

const WEEKDAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd']

function Calendar({ sessions }: { sessions: Session[] }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const byDay = useMemo(() => {
    const m = new Map<string, Session[]>()
    for (const s of sessions) {
      if (s.status === 'cancelled') continue
      const k = toDateKey(new Date(s.startedAt))
      m.set(k, [...(m.get(k) ?? []), s])
    }
    return m
  }, [sessions])

  const offset = (cursor.getDay() + 6) % 7
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, i) => {
    const day = i - offset + 1
    return day >= 1 && day <= days ? new Date(cursor.getFullYear(), cursor.getMonth(), day) : null
  })
  const today = toDateKey(new Date())
  const monthCount = sessions.filter((s) => {
    const d = new Date(s.startedAt)
    return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth() && s.status !== 'in_progress'
  }).length

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" aria-label="Poprzedni miesiąc" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className="flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-surface-2">
          <ChevronLeft size={22} />
        </button>
        <div className="text-center">
          <div className="font-semibold">{fmtMonth(cursor)}</div>
          <div className="text-xs text-muted">{monthCount} treningów</div>
        </div>
        <button type="button" aria-label="Następny miesiąc" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className="flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-surface-2">
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-faint">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" data-testid="calendar">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const k = toDateKey(d)
          const list = byDay.get(k) ?? []
          const s = list[0]
          return (
            <button
              key={i}
              type="button"
              disabled={!s}
              onClick={() => s && navigate(s.status === 'in_progress' ? `/workout/${s.id}` : `/history/${s.id}`)}
              aria-label={s ? `${d.getDate()}: trening ${list.map((x) => x.workoutType).join(', ')}` : undefined}
              className={cx(
                'tnum relative flex aspect-square min-h-10 flex-col items-center justify-center rounded-xl text-sm',
                s ? (s.workoutType === 'A' ? 'bg-accent/20 font-bold text-accent' : 'bg-go/20 font-bold text-go') : 'text-muted',
                s?.status === 'in_progress' && 'ring-1 ring-warn',
                k === today && !s && 'ring-1 ring-line',
              )}
            >
              {d.getDate()}
              {s && <span className="text-[9px] font-semibold leading-none">{list.map((x) => x.workoutType).join('')}</span>}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex justify-center gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded bg-accent/60" /> Trening A
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded bg-go/60" /> Trening B
        </span>
      </div>
    </Card>
  )
}

export function HistoryPage() {
  const data = useHistoryData()
  if (!data) return null
  const counted = new Set(data.completed.map((s) => s.id))
  return (
    <div className="pb-4">
      <PageHeader title="Historia" subtitle={`${data.completed.length} ukończonych treningów`} />
      {/* Calendar shows counted trainings and the one in progress; cancelled/empty ones stay in the list only. */}
      <Calendar sessions={data.sessions.filter((s) => s.status === 'in_progress' || counted.has(s.id))} />
      <SectionTitle>Wszystkie sesje</SectionTitle>
      {data.sessions.length === 0 ? (
        <EmptyState icon={<CalendarDays size={26} />} title="Historia jest pusta">
          Tu pojawią się zapisane treningi. Rozpocznij pierwszy trening na ekranie „Trening”.
        </EmptyState>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0" data-testid="session-list">
          {data.sessions.map((s) => {
            const sets = data.setsBySession.get(s.id) ?? []
            const v = sessionVolume(s, sets)
            const dur = activeDurationMs(s, sets)
            const notCounted = s.status !== 'in_progress' && !counted.has(s.id)
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => navigate(s.status === 'in_progress' ? `/workout/${s.id}` : `/history/${s.id}`)}
                  className={cx('flex w-full items-center gap-3 rounded-2xl border border-line/70 bg-surface p-3 text-left active:bg-surface-2', notCounted && 'opacity-60')}
                >
                  <WorkoutBadge type={s.workoutType} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{fmtDay(s.startedAt)}</span>
                      {s.status === 'in_progress' && <Pill tone="amber">w toku</Pill>}
                      {notCounted && <Pill>anulowany</Pill>}
                    </div>
                    <div className="tnum truncate text-sm text-muted">
                      T{s.week}/{s.slot} · {v.workingSets} serii{v.volumeKg > 0 ? ` · ${fmtVolume(v.volumeKg)}` : ''}{dur != null ? ` · ${fmtDuration(dur)}` : ` · od ${fmtTime(s.startedAt)}`}
                    </div>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-faint" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
