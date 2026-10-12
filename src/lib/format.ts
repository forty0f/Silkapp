const dateFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' })
const shortFmt = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short' })
const dayFmt = new Intl.DateTimeFormat('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit' })
const monthFmt = new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' })

/** Parses ISO timestamps and plain "YYYY-MM-DD" keys (as local dates, not UTC). */
export function toDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s)
}

export const fmtDate = (iso: string) => dateFmt.format(toDate(iso))
export const fmtShort = (iso: string) => shortFmt.format(toDate(iso))
export const fmtDay = (iso: string) => dayFmt.format(toDate(iso))
export const fmtTime = (iso: string) => timeFmt.format(toDate(iso))
export const fmtMonth = (d: Date) => {
  const s = monthFmt.format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function daysAgo(iso: string, now = new Date()): number {
  const a = toDate(iso)
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((start(now) - start(a)) / 86_400_000)
}

export function relativeDay(iso: string, now = new Date()): string {
  const d = daysAgo(iso, now)
  if (d <= 0) return 'dziś'
  if (d === 1) return 'wczoraj'
  return `${d} dni temu`
}

export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export function fmtDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${min % 60} min`
}

export function fmtNum(v: number, digits = 1): string {
  return v.toLocaleString('pl-PL', { maximumFractionDigits: digits })
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function parseDecimal(input: string): number | null {
  const t = input.trim().replace(',', '.')
  if (t === '') return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}
