import { useEffect, useRef } from 'react'
import { Timer, X } from 'lucide-react'
import type { RestTimer } from '../../domain/types'
import { fmtClock } from '../../lib/format'
import { beep, vibrate } from '../../lib/feedback'
import { useNow } from '../../lib/useNow'
import { cx } from '../../components/ui'

const FIRED_KEY = 'silk-rest-fired'

/** Rest countdown derived from a persisted start timestamp, so it stays correct after backgrounding or reload. */
export function RestTimerBar({
  timer,
  sound,
  vibration,
  onAdjust,
  onDismiss,
}: {
  timer: RestTimer
  sound: boolean
  vibration: boolean
  onAdjust: (deltaSec: number) => void
  onDismiss: () => void
}) {
  const now = useNow(true, 250)
  const endsAt = timer.startedAt + timer.durationSec * 1000
  const remaining = (endsAt - now) / 1000
  const done = remaining <= 0
  const firedRef = useRef(false)

  useEffect(() => {
    if (!done || firedRef.current) return
    firedRef.current = true
    const key = String(timer.startedAt)
    let already = false
    try {
      already = sessionStorage.getItem(FIRED_KEY) === key
      sessionStorage.setItem(FIRED_KEY, key)
    } catch {
      // storage unavailable — cue may repeat after reload, harmless
    }
    // Only cue when the end happened recently (not when reopening long after).
    if (!already && now - endsAt < 5000) {
      if (sound) beep(2)
      if (vibration) vibrate([200, 100, 200])
    }
  }, [done, timer.startedAt, sound, vibration, now, endsAt])

  useEffect(() => {
    firedRef.current = false
  }, [timer.startedAt, timer.durationSec])

  // Auto-hide well after the rest is over.
  useEffect(() => {
    if (remaining < -600) onDismiss()
  }, [remaining, onDismiss])

  const progress = Math.min(1, Math.max(0, 1 - remaining / timer.durationSec))

  return (
    <div className={cx('relative overflow-hidden rounded-2xl border', done ? 'border-go/40 bg-[#0d2620]' : 'border-line bg-surface-2')} data-testid="rest-timer" role="timer" aria-live="off">
      <div className={cx('absolute inset-y-0 left-0', done ? 'bg-go/10' : 'bg-accent/12')} style={{ width: `${progress * 100}%` }} />
      <div className="relative flex items-center gap-2 p-2 pl-3">
        <Timer size={20} className={done ? 'text-go' : 'text-accent'} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-faint">{done ? 'Przerwa zakończona' : 'Przerwa'}</div>
          <div className={cx('tnum text-2xl font-bold leading-tight', done && 'text-go')} data-testid="rest-remaining">
            {done ? `+${fmtClock(-remaining)}` : fmtClock(remaining)}
          </div>
        </div>
        {!done && (
          <>
            <button type="button" onClick={() => onAdjust(-15)} className="tnum min-h-11 min-w-11 rounded-xl bg-surface-3 px-2 text-sm font-medium active:bg-line" aria-label="Skróć przerwę o 15 sekund">
              −15
            </button>
            <button type="button" onClick={() => onAdjust(15)} className="tnum min-h-11 min-w-11 rounded-xl bg-surface-3 px-2 text-sm font-medium active:bg-line" aria-label="Wydłuż przerwę o 15 sekund">
              +15
            </button>
          </>
        )}
        <button type="button" onClick={onDismiss} className="flex h-11 w-11 items-center justify-center rounded-xl text-muted active:bg-surface-3" aria-label="Zamknij timer przerwy">
          <X size={20} />
        </button>
      </div>
    </div>
  )
}
