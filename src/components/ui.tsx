import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Minus, Plus, X } from 'lucide-react'

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'go'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-[#06101f] hover:bg-accent-strong active:bg-accent-strong font-semibold',
  go: 'bg-go text-[#04150e] active:brightness-95 font-semibold',
  secondary: 'bg-surface-3 text-ink hover:bg-line active:bg-line',
  ghost: 'bg-transparent text-muted hover:text-ink active:bg-surface-2',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25 active:bg-danger/25',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'min-h-11 px-3 text-sm rounded-xl', md: 'min-h-12 px-4 rounded-2xl', lg: 'min-h-14 px-5 text-lg rounded-2xl' }
  return (
    <button
      type="button"
      className={cx(
        'inline-flex select-none items-center justify-center gap-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-[var(--radius-card)] border border-line/70 bg-surface p-4', className)} {...rest}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 mt-6 flex items-center justify-between gap-2 px-1">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-faint">{children}</h2>
      {action}
    </div>
  )
}

export function Pill({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-3 text-muted',
    blue: 'bg-accent/15 text-accent',
    green: 'bg-go/15 text-go',
    amber: 'bg-warn/15 text-warn',
    red: 'bg-danger/15 text-danger',
  }
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium', tones[tone], className)}>{children}</span>
}

export function WorkoutBadge({ type, size = 'md' }: { type: 'A' | 'B'; size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'h-7 w-7 text-sm', md: 'h-10 w-10 text-lg', lg: 'h-14 w-14 text-2xl' }[size]
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-xl font-bold', s, type === 'A' ? 'bg-accent/15 text-accent' : 'bg-go/15 text-go')}>
      {type}
    </span>
  )
}

const toText = (v: number | null) => (v == null ? '' : String(v).replace('.', ','))
const parseText = (t: string): number | null | undefined => {
  const n = t.replace(',', '.').trim()
  if (n === '') return null
  const v = Number(n)
  return Number.isFinite(v) ? v : undefined
}

/**
 * Text-backed numeric input: keeps what the user typed (e.g. "12," while
 * entering 12,5 on the Polish iOS keypad) and only reports parsed numbers.
 */
function NumberText({ value, onChange, min, max, decimals, label, testId }: { value: number | null; onChange: (v: number | null) => void; min: number; max: number; decimals: boolean; label: string; testId?: string }) {
  const [text, setText] = useState(() => toText(value))
  // Re-sync when the value changes from outside (+/- buttons, prefill).
  const [synced, setSynced] = useState(value)
  if (value !== synced) {
    setSynced(value)
    if (parseText(text) !== value) setText(toText(value))
  }
  return (
    <input
      data-testid={testId}
      aria-label={label}
      inputMode={decimals ? 'decimal' : 'numeric'}
      enterKeyHint="done"
      autoComplete="off"
      className="tnum w-full min-w-0 bg-transparent text-center text-xl font-semibold outline-none min-[375px]:text-2xl"
      value={text}
      placeholder="–"
      onChange={(e) => {
        const raw = decimals ? e.target.value.replace(/[^\d.,]/g, '') : e.target.value.replace(/\D/g, '')
        setText(raw)
        const v = parseText(raw)
        if (v === undefined) return
        const clamped = v == null ? null : Math.min(max, Math.max(min, v))
        setSynced(clamped)
        onChange(clamped)
      }}
      onBlur={() => setText(toText(value))}
      onFocus={(e) => e.target.select()}
    />
  )
}

/** Large +/- number control tuned for one-handed use with sweaty fingers. */
export function Stepper({
  label,
  value,
  onChange,
  step,
  min = 0,
  max = 999,
  unit,
  decimals = false,
  testId,
}: {
  label: string
  value: number | null
  onChange: (v: number | null) => void
  step: number
  min?: number
  max?: number
  unit?: string
  decimals?: boolean
  testId?: string
}) {
  const bump = (d: number) => {
    const base = value ?? 0
    const next = Math.min(max, Math.max(min, Math.round((base + d) * 100) / 100))
    onChange(next)
  }
  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 text-xs font-medium text-muted">{label}</div>
      <div className="flex items-stretch overflow-hidden rounded-2xl border border-line bg-surface-2">
        <button type="button" aria-label={`${label}: mniej`} className="flex w-10 shrink-0 min-[375px]:w-12 items-center justify-center text-muted active:bg-surface-3" onClick={() => bump(-step)}>
          <Minus size={20} />
        </button>
        <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1 py-2">
          <NumberText value={value} onChange={onChange} min={min} max={max} decimals={decimals} label={label} testId={testId} />
          {unit && <span className="shrink-0 pr-1 text-xs text-faint max-[374px]:hidden">{unit}</span>}
        </div>
        <button type="button" aria-label={`${label}: więcej`} className="flex w-10 shrink-0 min-[375px]:w-12 items-center justify-center text-muted active:bg-surface-3" onClick={() => bump(step)}>
          <Plus size={20} />
        </button>
      </div>
    </div>
  )
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-line bg-surface outline-none sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" aria-label="Zamknij" onClick={onClose} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-surface-2">
            <X size={22} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{children}</div>
        {footer && <div className="border-t border-line/60 px-5 pb-[max(1rem,var(--safe-bottom))] pt-3">{footer}</div>}
        {!footer && <div className="pb-[var(--safe-bottom)]" />}
      </div>
    </div>
  )
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 text-faint">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      {children && <div className="mt-1 max-w-xs text-sm text-muted">{children}</div>}
    </div>
  )
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-2">
      <span className="min-w-0">
        <span className="block">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </span>
      <span className="relative inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-8 w-13 rounded-full bg-surface-3 transition-colors peer-checked:bg-go" />
        <span className="absolute left-1 top-1 h-6 w-6 rounded-full bg-ink transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}
