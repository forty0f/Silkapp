import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { Button, Sheet, cx } from './ui'

type ToastTone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  text: string
}

interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  /**
   * Alternative actions instead of the single confirm button. None is preselected;
   * choose() resolves with the chosen value (or null when cancelled).
   */
  choices?: { label: string; value: string; testId?: string }[]
}

type ChoiceOptions = ConfirmOptions & { choices: NonNullable<ConfirmOptions['choices']> }

interface FeedbackApi {
  toast: (text: string, tone?: ToastTone) => void
  confirm: (o: ConfirmOptions) => Promise<boolean>
  choose: (o: ChoiceOptions) => Promise<string | null>
}

const Ctx = createContext<FeedbackApi | null>(null)

export function useFeedback(): FeedbackApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('FeedbackProvider missing')
  return v
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean | string) => void) | null>(null)
  const seq = useRef(0)

  const toast = useCallback((text: string, tone: ToastTone = 'info') => {
    const id = ++seq.current
    setToasts((t) => [...t.slice(-2), { id, tone, text }])
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3200)
  }, [])

  const confirm = useCallback((o: ConfirmOptions) => {
    resolver.current?.(false)
    setDialog(o)
    return new Promise<boolean>((resolve) => {
      resolver.current = (v) => resolve(v === true)
    })
  }, [])

  const choose = useCallback((o: ChoiceOptions) => {
    resolver.current?.(false)
    setDialog(o)
    return new Promise<string | null>((resolve) => {
      resolver.current = (v) => resolve(typeof v === 'string' ? v : null)
    })
  }, [])

  const close = (v: boolean | string) => {
    resolver.current?.(v)
    resolver.current = null
    setDialog(null)
  }

  const api = useMemo(() => ({ toast, confirm, choose }), [toast, confirm, choose])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,var(--safe-top))]" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cx(
              'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-2xl shadow-black/40',
              t.tone === 'error' && 'border-danger/40 bg-[#2a1416] text-[#fecaca]',
              t.tone === 'success' && 'border-go/30 bg-[#0d2620] text-[#bbf7d0]',
              t.tone === 'info' && 'border-line bg-surface-2 text-ink',
            )}
          >
            {t.tone === 'error' ? <AlertTriangle size={18} className="mt-0.5 shrink-0" /> : t.tone === 'success' ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <Info size={18} className="mt-0.5 shrink-0" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      <Sheet
        open={!!dialog}
        onClose={() => close(false)}
        title={dialog?.title ?? ''}
        footer={
          dialog?.choices ? (
            <div className="space-y-2">
              {dialog.choices.map((c) => (
                <Button key={c.value} variant="primary" className="w-full" onClick={() => close(c.value)} data-testid={c.testId}>
                  {c.label}
                </Button>
              ))}
              <Button className="w-full" onClick={() => close(false)} data-testid="choice-cancel">
                {dialog.cancelLabel ?? 'Anuluj'}
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button className="flex-1" onClick={() => close(false)}>
                {dialog?.cancelLabel ?? 'Anuluj'}
              </Button>
              <Button className="flex-1" variant={dialog?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-testid="confirm-ok">
                {dialog?.confirmLabel ?? 'Potwierdź'}
              </Button>
            </div>
          )
        }
      >
        <div className="text-muted">{dialog?.body}</div>
      </Sheet>
    </Ctx.Provider>
  )
}
