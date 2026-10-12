import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { FeedbackProvider } from './components/feedback'
import { AppShell } from './components/AppShell'
import { ensureInitialized } from './db/repo'
import { match, useRoute } from './lib/router'
import { HomePage } from './features/home/HomePage'
import { WorkoutPage } from './features/workout/WorkoutPage'
import { HistoryPage } from './features/history/HistoryPage'
import { SessionDetailPage } from './features/history/SessionDetailPage'
import { ProgressPage } from './features/progress/ProgressPage'
import { AtlasPage } from './features/atlas/AtlasPage'
import { AtlasDetailPage } from './features/atlas/AtlasDetailPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { PlanEditorPage } from './features/settings/PlanEditorPage'
import type { ExerciseId } from './domain/types'
import { EXERCISES } from './domain/exercises'

function Router() {
  const path = useRoute()
  let m: Record<string, string> | null
  if ((m = match('/workout/:id', path))) return <WorkoutPage sessionId={m.id} />
  if ((m = match('/history/:id', path))) return <SessionDetailPage sessionId={m.id} />
  if (match('/history', path)) return <HistoryPage />
  if (match('/progress', path)) return <ProgressPage />
  if ((m = match('/atlas/:id', path)) && m.id in EXERCISES) return <AtlasDetailPage exerciseId={m.id as ExerciseId} />
  if (match('/atlas', path)) return <AtlasPage />
  if (match('/settings/plan', path)) return <PlanEditorPage />
  if (match('/settings', path)) return <SettingsPage />
  return <HomePage />
}

export function App() {
  const [state, setState] = useState<'loading' | 'ready' | { error: string }>('loading')

  useEffect(() => {
    ensureInitialized()
      .then(() => setState('ready'))
      .catch((e: unknown) => {
        const err = e as { name?: string; message?: string }
        if (err?.name === 'VersionError') {
          setState({ error: 'Baza danych na tym urządzeniu pochodzi z nowszej wersji aplikacji. Zamknij aplikację całkowicie i uruchom ją ponownie, aby wczytać aktualną wersję. Dane nie zostały zmienione.' })
        } else setState({ error: err?.message ?? String(e) })
      })
  }, [])

  if (state === 'loading') return <div className="min-h-dvh bg-bg" aria-busy="true" />
  if (typeof state === 'object') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <AlertTriangle className="text-danger" size={36} />
        <h1 className="text-xl font-semibold">Nie można otworzyć lokalnej bazy danych</h1>
        <p className="text-muted">
          Aplikacja przechowuje treningi w IndexedDB przeglądarki. Sprawdź, czy nie używasz trybu prywatnego i czy przeglądarka ma wolne miejsce.
        </p>
        <p className="text-xs text-faint">{state.error}</p>
      </div>
    )
  }
  return (
    <FeedbackProvider>
      <AppShell>
        <Router />
      </AppShell>
    </FeedbackProvider>
  )
}
