import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { navigate } from '../lib/router'

export function PageHeader({ title, subtitle, back, action }: { title: string; subtitle?: ReactNode; back?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start gap-2 pb-2 pt-4">
      {back && (
        <button type="button" aria-label="Wstecz" onClick={() => navigate(back)} className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted active:bg-surface-2">
          <ChevronLeft size={26} />
        </button>
      )}
      <div className="min-w-0 flex-1 pt-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
      </div>
      {action}
    </header>
  )
}
