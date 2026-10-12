// Unsaved set-form input survives the app being closed or killed by iOS in the
// background. This is a convenience cache only — logged sets live in IndexedDB.
const KEY = 'silk-set-draft'
const MAX_AGE_MS = 12 * 60 * 60 * 1000

interface Stored<T> {
  key: string
  savedAt: number
  draft: T
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as Stored<T>
    if (s.key !== key || Date.now() - s.savedAt > MAX_AGE_MS) return null
    return s.draft
  } catch {
    return null
  }
}

export function storeDraft<T>(key: string, draft: T) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ key, savedAt: Date.now(), draft } satisfies Stored<T>))
  } catch {
    // storage unavailable (private mode / quota) — draft simply isn't kept
  }
}

export function clearDraft(key?: string) {
  try {
    if (!key) return localStorage.removeItem(KEY)
    const raw = localStorage.getItem(KEY)
    if (raw && (JSON.parse(raw) as Stored<unknown>).key === key) localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
