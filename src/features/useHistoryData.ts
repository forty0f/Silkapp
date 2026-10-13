import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { isPerformedSession } from '../domain/metrics'
import type { Session, SetEntry } from '../domain/types'

export interface HistoryData {
  sessions: Session[]
  /** Counted trainings only: completed with ≥ 1 performed working set (newest first). */
  completed: Session[]
  setsBySession: Map<string, SetEntry[]>
}

/** All sessions + sets, reactive. Small enough for months of 3×/week training. */
export function useHistoryData(): HistoryData | undefined {
  return useLiveQuery(async () => {
    const [sessions, sets] = await Promise.all([db.sessions.toArray(), db.sets.toArray()])
    sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    const setsBySession = new Map<string, SetEntry[]>()
    for (const s of sets) {
      const list = setsBySession.get(s.sessionId)
      if (list) list.push(s)
      else setsBySession.set(s.sessionId, [s])
    }
    return { sessions, completed: sessions.filter((s) => isPerformedSession(s, setsBySession.get(s.id) ?? [])), setsBySession }
  })
}
