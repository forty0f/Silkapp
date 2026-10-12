# Silk FBW — prywatny dziennik treningowy FBW A/B (PWA)

Aplikacja do realizacji i monitorowania planu FBW A/B z hantlami i ławką: 3 treningi tygodniowo, 4 tygodnie adaptacji (A/B/A, B/A/B, …), a potem kontynuacja bez utraty historii. Działa offline, bez konta i bez serwera — dane są przechowywane lokalnie w IndexedDB.

## Funkcje

**Trening**
- Ekran główny: program, tydzień i sesja, następny trening A/B z listą ćwiczeń, docelowy RIR, start jednym przyciskiem, data ostatniego treningu, licznik treningów, podsumowanie progresu, pasek okresu adaptacyjnego, przypomnienie o kopii zapasowej.
- Aktywny trening: nawigacja po 6 ćwiczeniach, ilustracja techniki (dotknięcie otwiera kartę atlasu), zakres powtórzeń, liczba serii roboczych dla bieżącego tygodnia, czas przerwy, wynik ostatniej porównywalnej sesji.
- Zapis serii: ciężar (masa 1 hantla), powtórzenia albo czas (plank, ze stoperem), RIR 0–5+, „technika poprawna/do poprawy”, uwagi. Przy ćwiczeniach jednostronnych (wiosłowanie jednorącz, wykroki) osobno lewa i prawa strona.
- Formularz podpowiada wartości (ciężar z poprzedniej serii, zaakceptowanej propozycji lub ostatniej sesji; powtórzenia z odpowiadającej serii ostatnio), więc typowa seria to jedno dotknięcie „Zapisz serię”.
- Każda seria trafia od razu do IndexedDB (transakcja razem z timerem przerwy). Błąd zapisu pokazuje komunikat i nie czyści formularza.
- Timer przerwy liczony ze znacznika czasu startu zapisanego w bazie — działa poprawnie po przejściu do tła i po odświeżeniu strony; ±15 s, sygnał dźwiękowy, opcjonalna blokada wygaszania ekranu (Wake Lock).
- Serie rozgrzewkowe osobno (nie liczą się do objętości ani progresji), pomijanie serii, serie dodatkowe, edycja i usuwanie serii, wstrzymanie i wznowienie treningu, odrzucenie treningu (z potwierdzeniem), ponowne otwarcie ukończonego treningu.

**Plan i progresja**
- Plan FBW A/B dokładnie wg specyfikacji (kolejność, zakresy, serie T1–T4, RIR 4 / 3 / 2–3 / 1–2, potem kontynuacja z serią z T4 i RIR 1–2).
- Tygodnie liczone wg wykonanych sesji (3 na tydzień), więc opuszczony dzień nie przesuwa rampy objętości. Kolejność A/B to naprzemienność — można jednorazowo zamienić trening.
- Edytor planu: zakresy, serie T1–T4 i „dalej”, przerwy, RIR na tydzień. Zapis tworzy nową wersję planu; każdy trening przechowuje kopię planu, z którym był wykonany.
- Algorytm progresji (bez automatycznych zmian): propozycja `+krok` tylko gdy wszystkie wymagane serie robocze osiągnęły górę zakresu (w jednostronnych — słabsza strona), RIR ≥ dolna granica celu tygodnia i technika oznaczona jako poprawna. Różne ciężary w seriach → propozycja ujednolicenia; plank → sugestia trudniejszego wariantu bez liczby. Propozycję akceptujesz lub odrzucasz; zaakceptowana podpowiada ciężar w następnym treningu. Żadnych szacunków ciężaru maksymalnego.
- Krok ciężaru ustawiany w Ustawieniach (0,5–2,5 kg).

**Historia i progres**
- Kalendarz miesięczny (A/B), lista wszystkich sesji, szczegóły z edycją serii i dodawaniem serii.
- Dla każdego ćwiczenia: wykres ciężaru roboczego, średnich powtórzeń przy tym ciężarze (siła) i osobno wykres objętości (kg × powt.) z wyjaśnieniem, że objętość rośnie także od dokładania serii. Porównanie z poprzednią sesją liczy tylko serie obecne w obu sesjach.
- Masa ciała (punkty + średnia z 7 pomiarów) i obwód pasa, z informacją, że spadek masy nie dowodzi utraty wyłącznie tkanki tłuszczowej.
- Podsumowania tygodni kalendarzowych (treningi, serie robocze, objętość). Każdy wykres ma widok tabeli i podgląd wartości po dotknięciu.

**Atlas** — 12 kart: mięśnie główne i pomocnicze, pozycja początkowa i końcowa, kierunek ruchu, 3 wskazówki, najczęstsze błędy, oddychanie, ilustracja dwóch faz ruchu ze strzałką.

**Kopie zapasowe** — eksport całej bazy do JSON (na iPhonie przez arkusz udostępniania → „Zapisz w Plikach”), import z walidacją schematu i spójności, podgląd zawartości i potwierdzenie przed zastąpieniem, automatyczna kopia wewnętrzna stanu sprzed importu (przycisk „Przywróć”), prośba o trwałe przechowywanie, informacja o zajętym miejscu.

## Architektura

| Warstwa | Technologia | Uwagi |
|---|---|---|
| UI | React 19 + TypeScript, Tailwind CSS 4, Lucide | mobile-first, ciemny motyw, safe-area iPhone'a |
| Routing | własny router na `#hash` | działa offline i na dowolnym hostingu statycznym (także w podkatalogu) |
| Dane | IndexedDB przez Dexie 4 (`dexie-react-hooks`) | reaktywne zapytania; React state tylko jako widok |
| Walidacja importu | zod 4 | |
| PWA | vite-plugin-pwa (Workbox, `generateSW`) | precache wszystkich zasobów; aktualizacja na żądanie („Odśwież”) |
| Testy | Vitest (+ fake-indexeddb), Playwright | |

```
src/
  domain/     czysta logika: typy, plan, harmonogram, progresja, metryki, treść atlasu
  db/         Dexie (schemat + wersjonowanie), repozytorium, kopie zapasowe
  features/   ekrany: home, workout, history, progress, atlas, settings
  components/ UI, wykresy, okna potwierdzeń i komunikaty
tests/e2e/    testy Playwright; tests/fixtures/seed.json — realistyczne dane testowe
```

**Wersjonowanie danych.** `db/db.ts` zawiera `SCHEMA_VERSION` i bloki `db.version(n)`. Zmiana schematu = nowy blok z `.upgrade()`; starych bloków się nie zmienia, więc aktualizacja aplikacji migruje dane na miejscu bez kasowania historii. Plik eksportu niesie ten sam numer, a `migratePayload()` podnosi starsze kopie przy imporcie; kopie z nowszej wersji są odrzucane z komunikatem.

**Przygotowanie pod synchronizację (niezaimplementowana).** Wszystkie rekordy mają identyfikatory UUID, `createdAt`/`updatedAt` i pole `deletedAt`; sesje przechowują zamrożoną kopię planu. Dodanie synchronizacji wymaga backendu i zastąpienia twardych usunięć znacznikami `deletedAt` — bez zmiany modelu domenowego.

**Ilustracje techniki.** W projekcie nie było dostarczonych grafik instruktażowych, a zdjęć z internetu nie użyto (prawa autorskie). Ilustracje to schematy SVG rysowane przez parametryczną sylwetkę o stałych proporcjach segmentów; kolana i łokcie wyznacza kinematyka odwrotna. Każda z 24 póz jest sprawdzana automatycznie testem geometrycznym (`src/features/atlas/poses.test.ts`) wobec kryteriów zapisanych na kartach atlasu (kąty stawów, ustawienie segmentów, punkty podparcia). Szczegóły i ograniczenia: [`AUDIT.md`](AUDIT.md#weryfikacja-ilustracji-punkt-5). Pozy nie zostały ocenione przez trenera; nie zastępują nauki techniki. Dostarczone później grafiki można dodać do `public/` i podpiąć w `features/atlas`.

**Odporność danych.** Zapisy idą w transakcjach IndexedDB. Po utracie połączenia z bazą (znany problem iOS po powrocie z tła) transakcja jest jednorazowo ponawiana z tym samym id, więc nie powstają duplikaty. Niezapisany formularz serii jest przechowywany jako szkic. Propozycje progresji są danymi pochodnymi, przeliczanymi po każdej edycji historii.

## Uruchomienie

Wymagany Node.js 20+.

```bash
npm install
npm run dev          # serwer deweloperski: http://localhost:5173
npm run build        # build produkcyjny do dist/
npm run preview      # podgląd builda (z service workerem): http://localhost:4173
```

Kontrola jakości:

```bash
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm test             # testy jednostkowe (Vitest)
npm run test:e2e     # testy E2E w Chromium, 6 szerokości ekranu (wymaga wcześniejszego npm run build)
npm run check        # wszystko powyżej po kolei
npm run preview:lan  # podgląd HTTPS w sieci lokalnej dla iPhone'a (certyfikat w certs/, zob. docs/)
```

Raport audytu i wyniki testów: [`AUDIT.md`](AUDIT.md). Testy E2E działają w Chromium, nie w Safari — testy na iPhonie: [`docs/IOS_MANUAL_CHECKLIST.md`](docs/IOS_MANUAL_CHECKLIST.md).

Pierwsze uruchomienie Playwright lokalnie: `npx playwright install chromium`.

## Instalacja na iPhonie

Service worker (praca offline) i instalacja działają tylko przez **zaufane HTTPS**. Wersję testową bez publikowania uruchomisz według [`docs/IPHONE_HTTPS_TEST.md`](docs/IPHONE_HTTPS_TEST.md) (zalecane: Tailscale Serve; alternatywnie lokalny certyfikat mkcert). Na docelowy prywatny hosting z HTTPS wgrywa się zawartość `dist/` (ścieżki są względne). *Aplikacja nie została nigdzie opublikowana.*

W skrócie: Safari → adres → **Udostępnij → Do ekranu początkowego** → uruchom z ikony, przejdź raz przez wszystkie zakładki online, potem zrób pierwszy eksport (**Ustawienia → Eksportuj dane → Zapisz plik → Zapisz w Plikach**). Dane aplikacji zainstalowanej z ikony są oddzielne od danych strony otwartej w Safari, a każdy adres (origin) ma własną bazę.

## Znane ograniczenia

- Dane są tylko na jednym urządzeniu. Brak synchronizacji iPhone ↔ komputer w tej wersji — przenoszenie przez eksport/import (import zastępuje dane, nie scala).
- Lokalny zapis nie jest kopią zapasową: usunięcie aplikacji, danych witryny lub reset telefonu kasuje historię. iOS może też czyścić dane witryn niezainstalowanych po ok. 7 dniach nieużywania. Regularnie eksportuj JSON.
- Sygnał końca przerwy działa, gdy aplikacja jest na ekranie; iOS nie pozwala PWA grać dźwięku ani wibrować w tle (wibracje nie są obsługiwane w Safari). Po powrocie do aplikacji timer pokazuje poprawny czas.
- Blokada wygaszania ekranu zależy od wsparcia Wake Lock API (iOS 16.4+, w trybie zainstalowanym od iOS 18.4).
- Testy E2E uruchamiane są w Chromium z emulacją ekranów 320–1440 px; silnik WebKit/Safari nie był dostępny. Przed codziennym użyciem przejdź listę `docs/IOS_MANUAL_CHECKLIST.md` na iPhonie.
- Na 320×568 px formularz serii jest poniżej pierwszego ekranu; na 375×667 px wiersz RIR wymaga krótkiego przewinięcia.
- Tydzień programu to 3 wykonane sesje, nie tydzień kalendarzowy; podsumowania tygodniowe w zakładce Progres są kalendarzowe.
