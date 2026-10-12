import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { AlertTriangle, ChevronRight, Database, Download, FileUp, HardDrive, ListChecks, RefreshCcw, RotateCcw, ShieldAlert, Undo2 } from 'lucide-react'
import { db, SCHEMA_VERSION } from '../../db/db'
import { buildExport, deliverExportFile, exportFileName, restoreFromPayload, restoreSnapshot, validateImport, type ImportSummary, type ExportPayload } from '../../db/backup'
import { clearAllData, getActiveProgram, getInProgressSession, getSettings, startNewProgram, updateSettings } from '../../db/repo'
import { fmtDate, fmtTime, relativeDay } from '../../lib/format'
import { navigate } from '../../lib/router'
import { PageHeader } from '../../components/PageHeader'
import { Button, Card, SectionTitle, Sheet, Toggle } from '../../components/ui'
import { useFeedback } from '../../components/feedback'

const STEPS = [0.5, 1, 1.25, 2, 2.5]

function useStorageInfo() {
  const [info, setInfo] = useState<{ persisted: boolean | null; usage: number | null; quota: number | null }>({ persisted: null, usage: null, quota: null })
  const refresh = async () => {
    const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null
    const est = await navigator.storage?.estimate?.().catch(() => null)
    setInfo({ persisted, usage: est?.usage ?? null, quota: est?.quota ?? null })
  }
  useEffect(() => {
    void refresh()
  }, [])
  return { info, refresh }
}

export function SettingsPage() {
  const settings = useLiveQuery(getSettings)
  const program = useLiveQuery(getActiveProgram)
  const plan = useLiveQuery(async () => (program ? db.plans.get(program.planId) : undefined), [program?.planId])
  const snapshots = useLiveQuery(() => db.snapshots.orderBy('createdAt').reverse().toArray())
  const counts = useLiveQuery(async () => ({ sessions: await db.sessions.count(), sets: await db.sets.count(), metrics: await db.bodyMetrics.count() }))
  const { info, refresh } = useStorageInfo()
  const { toast, confirm } = useFeedback()
  const fileRef = useRef<HTMLInputElement>(null)
  const [pendingImport, setPendingImport] = useState<{ payload: ExportPayload; summary: ImportSummary; fileName: string } | null>(null)
  const [importErrors, setImportErrors] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)

  if (!settings) return null

  const doExport = async () => {
    setBusy(true)
    try {
      const payload = await buildExport()
      const result = await deliverExportFile(JSON.stringify(payload, null, 1), exportFileName())
      if (result !== 'cancelled') {
        await updateSettings({ lastExportAt: new Date().toISOString() })
        toast(result === 'shared' ? 'Kopia przekazana — wybierz „Zapisz w Plikach”, aby ją zachować.' : 'Plik kopii zapasowej pobrany.', 'success')
      }
    } catch (e) {
      toast(`Eksport nie powiódł się: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setImportErrors(null)
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('Plik jest zbyt duży (ponad 50 MB).')
      const text = await file.text()
      const res = validateImport(text)
      if (!res.ok) setImportErrors(res.errors)
      else setPendingImport({ payload: res.payload, summary: res.summary, fileName: file.name })
    } catch (e) {
      setImportErrors([`Nie udało się odczytać pliku: ${(e as Error).message}`])
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const doImport = async () => {
    if (!pendingImport) return
    setBusy(true)
    try {
      await restoreFromPayload(pendingImport.payload)
      setPendingImport(null)
      toast('Dane przywrócone z kopii. Poprzedni stan zachowano jako kopię wewnętrzną (możesz cofnąć import).', 'success')
    } catch (e) {
      toast(`Import nie powiódł się — dane nie zostały zmienione: ${(e as Error).message}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const undoImport = async (id: string) => {
    if (!(await confirm({ title: 'Przywrócić stan sprzed importu?', body: 'Obecne dane zostaną zastąpione stanem zapisanym przed ostatnim importem.', confirmLabel: 'Przywróć' }))) return
    try {
      await restoreSnapshot(id)
      toast('Przywrócono dane sprzed importu', 'success')
    } catch (e) {
      toast(`Nie udało się przywrócić: ${(e as Error).message}`, 'error')
    }
  }

  const newCycle = async () => {
    if (await getInProgressSession()) return toast('Najpierw zakończ lub odrzuć trwający trening.', 'error')
    const ok = await confirm({
      title: 'Rozpocząć nowy cykl adaptacyjny?',
      body: 'Obecny program zostanie zarchiwizowany (cała historia zostaje). Licznik tygodni wraca do T1 z liczbą serii 2/3/3/3 i RIR 4→1–2. Przydatne np. po kilkutygodniowej przerwie.',
      confirmLabel: 'Nowy cykl',
    })
    if (!ok) return
    await startNewProgram(plan?.name ?? 'FBW A/B')
    toast('Rozpoczęto nowy cykl', 'success')
    navigate('/')
  }

  const wipe = async () => {
    const ok1 = await confirm({ title: 'Usunąć WSZYSTKIE dane?', body: 'Treningi, serie, pomiary i ustawienia zostaną trwale usunięte z tego urządzenia. Najpierw wykonaj eksport kopii zapasowej.', confirmLabel: 'Dalej', danger: true })
    if (!ok1) return
    const ok2 = await confirm({ title: 'Na pewno?', body: `Zostanie usuniętych ${counts?.sessions ?? 0} treningów i ${counts?.sets ?? 0} serii. Tej operacji nie można cofnąć.`, confirmLabel: 'Usuń wszystko', danger: true })
    if (!ok2) return
    await clearAllData()
    toast('Wszystkie dane usunięte', 'info')
    navigate('/')
  }

  const mb = (b: number | null) => (b == null ? '—' : `${(b / 1024 / 1024).toLocaleString('pl-PL', { maximumFractionDigits: 1 })} MB`)

  return (
    <div className="pb-4">
      <PageHeader title="Ustawienia" />

      <SectionTitle>Plan treningowy</SectionTitle>
      <Card className="p-1">
        <button type="button" onClick={() => navigate('/settings/plan')} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left active:bg-surface-2" data-testid="open-plan-editor">
          <ListChecks size={20} className="text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Edytuj plan</span>
            <span className="block truncate text-sm text-muted">
              {plan ? `${plan.name} · wersja ${plan.version}` : '…'}
            </span>
          </span>
          <ChevronRight size={18} className="text-faint" />
        </button>
        <button type="button" onClick={newCycle} className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left active:bg-surface-2">
          <RefreshCcw size={20} className="text-muted" />
          <span className="min-w-0 flex-1">
            <span className="block font-medium">Nowy cykl adaptacyjny</span>
            <span className="block text-sm text-muted">{program ? `Obecny od ${fmtDate(program.startedAt)}` : ''}</span>
          </span>
        </button>
      </Card>

      <SectionTitle>Trening</SectionTitle>
      <Card>
        <div className="mb-1 text-sm font-medium">Krok zmiany ciężaru (1 hantel)</div>
        <p className="mb-2 text-xs text-muted">Używany w przyciskach +/− i w propozycjach progresji. Ustaw zgodnie z możliwościami swoich hantli.</p>
        <div className="grid grid-cols-5 gap-1.5">
          {STEPS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => void updateSettings({ weightStepKg: s })}
              aria-pressed={settings.weightStepKg === s}
              className={`tnum min-h-11 rounded-xl border text-sm font-semibold ${settings.weightStepKg === s ? 'border-accent bg-accent text-[#06101f]' : 'border-line bg-surface-2 text-muted'}`}
            >
              {String(s).replace('.', ',')}
            </button>
          ))}
        </div>
        <div className="mt-3 divide-y divide-line/60">
          <Toggle checked={settings.soundEnabled} onChange={(v) => void updateSettings({ soundEnabled: v })} label="Dźwięk końca przerwy" description="Krótki sygnał, gdy aplikacja jest otwarta." />
          <Toggle checked={settings.vibrationEnabled} onChange={(v) => void updateSettings({ vibrationEnabled: v })} label="Wibracja" description="Na iPhonie przeglądarka nie obsługuje wibracji." />
          <Toggle checked={settings.keepScreenOn} onChange={(v) => void updateSettings({ keepScreenOn: v })} label="Nie wygaszaj ekranu podczas treningu" />
        </div>
      </Card>

      <SectionTitle>Kopia zapasowa</SectionTitle>
      <Card>
        <div className="flex gap-3 rounded-2xl border border-warn/30 bg-warn/10 p-3 text-sm">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warn" />
          <p className="m-0 text-muted">
            Dane są zapisane <span className="text-ink">tylko na tym urządzeniu</span>, w pamięci przeglądarki. To nie jest kopia zapasowa — usunięcie aplikacji lub danych witryny, reset telefonu albo czyszczenie pamięci przez system usuwa historię. Regularnie eksportuj plik JSON i przechowuj go
            np. w iCloud Drive.
          </p>
        </div>
        <div className="mt-3 text-sm text-muted">
          Ostatni eksport: <span className="text-ink" data-testid="last-export">{settings.lastExportAt ? `${fmtDate(settings.lastExportAt)} (${relativeDay(settings.lastExportAt)})` : 'nigdy'}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="primary" onClick={doExport} disabled={busy} data-testid="export">
            <Download size={18} /> Eksportuj dane (JSON)
          </Button>
          <Button onClick={() => fileRef.current?.click()} disabled={busy} data-testid="import">
            <FileUp size={18} /> Importuj z pliku
          </Button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" data-testid="import-file" onChange={(e) => void onFile(e.target.files?.[0])} />
        {importErrors && (
          <div className="mt-3 rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm" role="alert" data-testid="import-errors">
            <div className="mb-1 flex items-center gap-2 font-semibold text-danger">
              <AlertTriangle size={16} /> Import odrzucony — dane nie zostały zmienione
            </div>
            <ul className="m-0 list-disc space-y-0.5 pl-5 text-muted">
              {importErrors.map((e, i) => (
                <li key={i} className="break-words">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}
        {snapshots && snapshots.length > 0 && (
          <div className="mt-3 space-y-2">
            {snapshots.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-2xl bg-surface-2 p-2.5 pl-3 text-sm">
                <Undo2 size={16} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1 text-muted">
                  {s.reason}: {fmtDate(s.createdAt)}, {fmtTime(s.createdAt)}
                </span>
                <Button size="sm" onClick={() => undoImport(s.id)}>
                  Przywróć
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <SectionTitle>Pamięć urządzenia</SectionTitle>
      <Card>
        <div className="flex items-start gap-3 text-sm">
          <HardDrive size={18} className="mt-0.5 shrink-0 text-muted" />
          <div className="min-w-0 flex-1 space-y-1">
            <div>
              Trwałe przechowywanie:{' '}
              <span className={info.persisted ? 'text-go' : 'text-warn'}>{info.persisted == null ? 'nieznane' : info.persisted ? 'przyznane' : 'nieprzyznane'}</span>
            </div>
            <div className="text-muted">
              Zajęte: {mb(info.usage)} {info.quota ? `z ${mb(info.quota)}` : ''}
            </div>
            <div className="text-muted">
              Rekordy: {counts?.sessions ?? 0} treningów, {counts?.sets ?? 0} serii, {counts?.metrics ?? 0} pomiarów
            </div>
            <p className="text-xs text-faint">Na iPhonie dodaj aplikację do ekranu początkowego — Safari może usuwać dane stron otwieranych tylko w przeglądarce po ok. 7 dniach nieużywania.</p>
          </div>
        </div>
        <Button
          size="sm"
          className="mt-3"
          onClick={async () => {
            const ok = await navigator.storage?.persist?.().catch(() => false)
            await refresh()
            toast(ok ? 'Przeglądarka przyznała trwałe przechowywanie' : 'Przeglądarka nie przyznała trwałego przechowywania — rób regularne eksporty', ok ? 'success' : 'info')
          }}
        >
          <Database size={16} /> Poproś o trwałe przechowywanie
        </Button>
      </Card>

      <SectionTitle>Strefa niebezpieczna</SectionTitle>
      <Card>
        <Button variant="danger" className="w-full" onClick={wipe}>
          <RotateCcw size={16} /> Usuń wszystkie dane
        </Button>
      </Card>

      <p className="mt-6 text-center text-xs text-faint">
        Silk FBW {__APP_VERSION__} · schemat danych v{SCHEMA_VERSION} · działa offline, bez konta i bez wysyłania danych.
      </p>

      <Sheet
        open={!!pendingImport}
        onClose={() => setPendingImport(null)}
        title="Przywrócić dane z kopii?"
        footer={
          <div className="flex gap-3">
            <Button className="flex-1" onClick={() => setPendingImport(null)}>
              Anuluj
            </Button>
            <Button variant="danger" className="flex-1" onClick={doImport} disabled={busy} data-testid="confirm-import">
              Zastąp dane
            </Button>
          </div>
        }
      >
        {pendingImport && (
          <div className="space-y-3 text-sm" data-testid="import-preview">
            <p className="text-muted">
              Plik <span className="break-all text-ink">{pendingImport.fileName}</span> przeszedł walidację.
            </p>
            <ul className="m-0 list-none space-y-1 rounded-2xl bg-surface-2 p-3">
              <li>Utworzony: {fmtDate(pendingImport.summary.exportedAt)}, {fmtTime(pendingImport.summary.exportedAt)}</li>
              <li>
                Treningi: {pendingImport.summary.completedSessions} ukończonych ({pendingImport.summary.sessions} łącznie)
              </li>
              <li>Serie: {pendingImport.summary.sets}</li>
              <li>Pomiary ciała: {pendingImport.summary.bodyMetrics}</li>
              <li>Wersje planu: {pendingImport.summary.plans}</li>
            </ul>
            <p className="flex gap-2 text-warn">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" /> Wszystkie obecne dane ({counts?.sessions ?? 0} treningów) zostaną zastąpione. Obecny stan zostanie zachowany jako kopia wewnętrzna, którą możesz przywrócić.
            </p>
          </div>
        )}
      </Sheet>
    </div>
  )
}
