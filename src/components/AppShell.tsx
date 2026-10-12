import type { ReactNode } from 'react'
import { BookOpen, CalendarDays, Dumbbell, LineChart, Settings, WifiOff } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { navigate, useRoute } from '../lib/router'
import { useOnline } from '../lib/useOnline'
import { Button, cx } from './ui'

const TABS = [
  { path: '/', label: 'Trening', icon: Dumbbell },
  { path: '/history', label: 'Historia', icon: CalendarDays },
  { path: '/progress', label: 'Progres', icon: LineChart },
  { path: '/atlas', label: 'Atlas', icon: BookOpen },
  { path: '/settings', label: 'Ustawienia', icon: Settings },
]

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })
  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 flex justify-center px-4">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-accent/30 bg-surface-2 p-3 shadow-2xl shadow-black/50">
        <p className="min-w-0 flex-1 text-sm">Dostępna nowa wersja aplikacji. Dane treningowe pozostaną bez zmian.</p>
        <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
          Później
        </Button>
        <Button size="sm" variant="primary" onClick={() => void updateServiceWorker(true)}>
          Odśwież
        </Button>
      </div>
    </div>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRoute()
  const online = useOnline()
  const inWorkout = path.startsWith('/workout/')
  const active = (p: string) => (p === '/' ? path === '/' : path.startsWith(p))

  return (
    <div className="min-h-dvh">
      {!online && (
        <div className="pt-safe sticky top-0 z-30 bg-bg/95 backdrop-blur" data-testid="offline-banner">
          <div className="flex items-center justify-center gap-2 py-1.5 text-xs text-warn">
            <WifiOff size={14} /> Offline — aplikacja działa, dane zapisują się na urządzeniu
          </div>
        </div>
      )}
      <main className={cx('px-safe mx-auto w-full max-w-2xl', !online ? 'pt-2' : 'pt-safe', inWorkout ? 'pb-safe' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom))]')}>
        {children}
      </main>
      {!inWorkout && (
        <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-bg/92 backdrop-blur-xl" aria-label="Nawigacja główna">
          <div className="mx-auto flex max-w-2xl">
            {TABS.map((t) => {
              const Icon = t.icon
              const on = active(t.path)
              return (
                <button
                  key={t.path}
                  type="button"
                  onClick={() => navigate(t.path)}
                  aria-current={on ? 'page' : undefined}
                  className={cx('flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium', on ? 'text-accent' : 'text-faint')}
                >
                  <Icon size={22} strokeWidth={on ? 2.4 : 2} />
                  <span className="max-w-full truncate px-0.5">{t.label}</span>
                </button>
              )
            })}
          </div>
        </nav>
      )}
      <UpdatePrompt />
    </div>
  )
}
