# Wdrożenie na GitHub Pages

Docelowy adres: **https://forty0f.github.io/Silkapp/**

## Model gałęzi

| Gałąź | Rola |
|---|---|
| `main` | **produkcja** — każdy push (zwykle merge PR) uruchamia `.github/workflows/deploy-pages.yml` i publikuje aplikację |
| inne (np. `claude/fbw-pwa-app`) | rozwój; zmiany trafiają na `main` przez pull request |

Workflow: `npm ci` → lint → typecheck → testy jednostkowe → `configure-pages` → build z `BASE_PATH=/Silkapp/` → kontrola, że zasoby, manifest i service worker są pod tą ścieżką oraz że w buildzie nie ma map źródeł, `.env` ani danych testowych → `upload-pages-artifact` → `deploy-pages`. Deploy uruchamia się tylko wtedy, gdy wszystkie kroki przejdą, i tylko z `main`. Uprawnienia `pages: write` i `id-token: write` ma wyłącznie zadanie deploy. Można też uruchomić workflow ręcznie (workflow_dispatch); z gałęzi innej niż `main` wykona się tylko build bez publikacji.

## Wymagania po stronie GitHub (jednorazowo, ręcznie w ustawieniach)

1. GitHub Pages musi być dostępne dla repozytorium. Na planie **Free** Pages działa tylko dla repozytoriów **publicznych**; repozytorium prywatne wymaga planu płatnego. Strona Pages jest wtedy i tak publicznie dostępna — prywatny dostęp do strony daje dopiero GitHub Enterprise Cloud.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. **Settings → Environments → github-pages → Deployment branches**: tylko `main` (domyślnie tworzone dla gałęzi domyślnej).

## Testy lokalne pod ścieżką /Silkapp/

```bash
npm run build                 # build z bazą względną (dev, E2E)
npm run test:e2e              # E2E w Chromium, 6 szerokości
npm run test:e2e:pages        # te same testy + kontrole Pages pod http://localhost:4174/Silkapp/
```

## Aktualizacja aplikacji

1. Zmiany na gałęzi roboczej → pull request do `main` → merge.
2. GitHub Actions publikuje nową wersję (2–3 min).
3. Na iPhonie: otwórz aplikację z ikony (z internetem), przejdź na ekran inny niż trening i stuknij **„Odśwież”** w monicie. Dane w IndexedDB zostają. Monit nigdy nie przerywa aktywnego treningu.

Zmiana schematu bazy wymaga nowego bloku `db.version(n).upgrade()` (zob. `src/db/db.ts`); starych bloków się nie zmienia.

## Prywatność

- Aplikacja nie wykonuje żadnych zapytań sieciowych z danymi: brak `fetch`/XHR/analityki. Dane treningowe i pomiary są tylko w IndexedDB na telefonie.
- Opublikowany jest wyłącznie kod aplikacji (zawartość `dist/`). Sam kod jest publicznie dostępny pod adresem strony.
- **Wspólne pochodzenie (origin):** wszystkie strony Pages konta (`https://forty0f.github.io/…`) mają ten sam origin, więc dzielą IndexedDB i localStorage. Nie publikuj pod tym kontem innych stron z niezaufanym kodem. Service worker i jego pamięć podręczna są ograniczone do `/Silkapp/`.
- Zmiana nazwy repozytorium zmienia adres, a nowy adres oznacza pustą bazę. Przed taką zmianą zrób eksport.
