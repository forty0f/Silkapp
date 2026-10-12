// Unsaved set-form input survives the app being closed or killed by iOS in the
// background, and switching between exercises. One entry per form (session +
// exercise + set type + set number), so drafts never overwrite each other.
// This is a convenience cache only — logged sets live in IndexedDB.
const KEY = 'silk-set-drafts'
const MAX_AGE_MS = 12 * 60 * 60 * 1000

interface Entry {
  savedAt: number
  draft: unknown
}

function readAll(): Record<string, Entry> {
  try {
    const raw = localStorage.getItem(KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, Entry>) : {}
    const now = Date.now()
    for (const k of Object.keys(all)) if (now - all[k].savedAt > MAX_AGE_MS) delete all[k]
    return all
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, Entry>) {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    // storage unavailable (private mode / quota) — drafts simply aren't kept
  }
}

export function loadDraft<T>(key: string): T | null {
  return (readAll()[key]?.draft as T | undefined) ?? null
}

export function storeDraft<T>(key: string, draft: T) {
  const all = readAll()
  all[key] = { savedAt: Date.now(), draft }
  writeAll(all)
}

/** Removes one form's draft, or all drafts when called without a key. */
export function clearDraft(key?: string) {
  if (!key) return writeAll({})
  const all = readAll()
  delete all[key]
  writeAll(all)
}
