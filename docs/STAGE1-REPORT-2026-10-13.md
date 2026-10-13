# Silkapp — Etap 1: naprawa logiki i uproszczenie ekranu treningu

Gałąź: `claude/stage1-logic-ux` (z `main` @ e0c074e). **Nie wdrożono** na `main` ani GitHub Pages — czeka na akceptację.

## 1. Zmiany logiki (Priorytet 1)

| # | Problem (audyt) | Zmiana | Test regresyjny |
|---|---|---|---|
| 1 | D4 — pusty trening liczony jako wykonany, przesuwał rotację A/B i tydzień | Nowy status `cancelled`. Zakończenie bez **żadnej wykonanej serii roboczej** (rozgrzewki i serie pominięte się nie liczą) → `cancelled`: zostaje w historii (oznaczony „anulowany”), nie liczy się do licznika, kalendarza, statystyk, rotacji ani tygodnia. Dialog zakończenia mówi to wprost („Anuluj trening”). Stary „ukończony”, ale pusty trening z poprzedniej wersji też nie jest liczony (wyliczane przy odczycie, dane bez zmian). | `D4 …` (6 testów) |
| | Definicja częściowego ukończenia | **≥ 1 wykonana seria robocza = trening zaliczony** (przesuwa plan). Brakujące serie nie dają propozycji progresji (jak dotąd). Stany: w toku (także przerwany/wstrzymany — wznawialny), zaliczony, anulowany. | `partial completion…` |
| 2 | D9 — porównanie siły ignorowało RIR | Inny ciężar → „inny ciężar” (bez werdyktu), pokazane osobno: ciężar, powtórzenia, RIR. Ten sam ciężar: więcej powtórzeń przy RIR niższym o ≥ 1 → „nieporównywalne”; mniej powtórzeń przy RIR wyższym o ≥ 1 → „nieporównywalne”; te same powtórzenia z RIR ±1 → poprawa/spadek. Brak RIR → nie jest traktowany jako wartość („?”), wynik niejednoznaczny. Brak dowolnego indeksu siły. | `D9 …` (7 testów) |
| 3 | D3 — flaga serii dodatkowej po usunięciu | `deleteSet` przelicza `isExtra` przy przenumerowaniu (seria dodatkowa wchodzi na zwolnione miejsce planowanej). Propozycja ciężaru jest ponownie oceniana po usunięciu i edycji. | `D3 …` (3 testy) |
| 4 | D10 — objętość | „Ciężar × powtórzenia” = masa hantla × **liczba hantli** (0/1/2 wg ćwiczenia) × powtórzenia (obie strony w jednostronnych). Deska wyłączona. Opis: nie obejmuje masy ciała (wykroki, hip thrust), rośnie od samego dodania serii, nie jest miarą siły. Prezentacja w pełnych kg. | ręczne wyliczenia: wyciskanie 16×2×12 = 384, wiosłowanie 16×23 + 18×20 = 728, wykroki 8×2×20 = 320, hip thrust 20×12 = 240, deska 0 |
| 5 | D5 — czas treningu | „Czas aktywny” = suma odstępów ≤ 30 min między startem, kolejnymi seriami i końcem; przerwy dłuższe (np. wznowienie następnego dnia) pomijane. Liczone przy odczycie — historia poprawna bez zmiany danych. | `D5 …` (4 testy) |
| 6 | D6 — walidacja | Ćwiczenie z obciążeniem: ciężar > 0, ≤ 300 kg, maks. 2 miejsca po przecinku (0,01 kg) — **bez wymuszania kroku** (12,34 kg dozwolone, 12,345 nie). Ćwiczenie bez obciążenia: ciężar ignorowany. Powtórzenia/sekundy: całkowite ≥ 1. Masa ciała ≤ 2 miejsca, obwód pasa ≤ 1 miejsce; jednolity format (pas: 1 miejsce po przecinku wszędzie). | `D6 …` (6 testów) |

## 2. Ekran treningu (Priorytet 2) — bez radykalnej przebudowy, ten sam ciemny styl

- Nagłówek: jedna linia („Trening B · T4 · 3/3 · RIR 1–2”) + chipy ćwiczeń (bez zmian funkcji). Usunięty zegar sekundowy (przy okazji: brak przerysowywania ekranu co 1 s).
- Jedna karta ćwiczenia: nazwa (maks. 2 linie), zakres i przerwa w jednej linii, „Ostatnio: …” (podgląd poprzedniego wyniku), potem od razu „Seria X z Y” i pola. Usunięte duplikaty: „Ćwiczenie X z Y”, pigułka liczby serii, wiersz „Teraz/+N zaplanowane”, duża miniatura (zastąpiona ikoną Atlasu 44×44).
- Zapisane serie pod formularzem — pola nie przesuwają się w dół wraz z kolejnymi seriami.
- Rozgrzewka: mały przełącznik „+ rozgrzewka” zamiast przełącznika zakładek. „Pomiń serię” przeniesione z paska akcji do formularza (mniej ryzyka przypadkowego tapnięcia).
- Pasek akcji (sticky): smukły timer (1 wiersz, ~48 px zamiast ~64) + **[‹] [Zapisz serię] [›]** — Poprzednie/Następne zachowane, w zasięgu kciuka, z etykietą nazwy ćwiczenia dla czytników ekranu. Usunięte dolne przyciski i stopka tekstowa.
- RIR opcjonalny, domyślnie nieoceniony (bez zmian). Pola po fokusie są przewijane tak, by nie chowały się pod paskami/klawiaturą. Na ekranach < 375 px węższe przyciski ± i ukryta jednostka „kg” (jest w etykiecie), żeby ciężar się nie ucinał.

### Pomiary: zapis kolejnej serii (zmiana powtórzeń + RIR + zapis), seed z historią, pierwsze ćwiczenie

| Viewport | PRZED bez timera | PRZED z timerem | PO bez timera | PO z timerem |
|---|---|---|---|---|
| 320×568 | ciężar, powt., RIR ukryte — przewinięcie 203 px | wszystko ukryte — 328 px | 0 przewinięć | 0 przewinięć |
| 375×667 | RIR ukryty — 90 px | wszystko ukryte — 215 px | 0 | 0 |
| 390×844 | OK | RIR ukryty — 38 px | 0 | 0 |
| 393×852 (safe-area) | OK | RIR ukryty — 30 px* | 0 | 0 |
| 430×932, 768×1024, 1440×900 | OK | OK | 0 | 0 |

Tapnięcia: bez zmian — 3 (pole powtórzeń → RIR → Zapisz) + wpisanie liczby; różnica to **przewijanie: przed 1 gest (do 328 px) na 320–393 px przy aktywnym timerze, po 0**. Wysokość dolnego paska z timerem: 154 → 123 px.
Wszystkie 6 ćwiczeń z aktywnym timerem: pola ciężaru/powtórzeń/czasu i „Zapisz” widoczne bez przewijania na każdym telefonowym rozmiarze; jedyny wyjątek to **RIR w „Wykroki w tył” przy 320×568** (dwa rzędy pól L/P) — wymaga krótkiego przewinięcia.

\* Pomiar „przed” dla 393×852 nie uwzględniał wcięć (stara wersja używała `env()`, którego Chromium nie emuluje). Wersja „po” czyta wcięcia ze zmiennych CSS `--safe-top/--safe-bottom`, więc test symuluje 59/34 px.

## 3. Ekran główny (Priorytet 3)

- Informacja o tygodniu tylko raz: „Tydzień 4 · sesja 3/3 · adaptacja” w karcie „Następny trening” (wcześniej 3 miejsca: nagłówek, karta, etykiety tygodni). Usunięta etykieta „Program” i wiersz fazy w nagłówku.
- „Rozpocznij trening” bezpośrednio pod nazwą treningu (lista ćwiczeń pod przyciskiem).
- Postęp adaptacji jako cienki pasek 12 segmentów bez wiersza etykiet tygodni.
- Jedna karta „Ostatni trening”: data, typ, liczba zaliczonych, porównanie (poprawa / bez zmian / spadek / inny ciężar-RIR), propozycje, ostatni pomiar. Przypomnienie o kopii zachowane.
- Wysokość strony (seed): 390×844 1,46 → 1,09 ekranu; 320×568 2,33 → 1,77.

## 4. Testy (Priorytet 4)

| Etap | Wynik |
|---|---|
| lint (eslint) | ✅ 0 błędów |
| typecheck (tsc -b) | ✅ |
| unit (vitest) | ✅ 155 passed, 1 skipped (było 138 z diagnostyką) |
| build | ✅ |
| E2E, base `/` (Chromium, 7 viewportów) | ✅ 176 passed, 0 failed, 13 skipped (testy tylko dla Pages oraz test aktualizacji PWA uruchamiany raz) |
| E2E, base `/Silkapp/` (jak GitHub Pages) | ✅ 183 passed, 0 failed, 6 skipped |
| Safari / WebKit / iOS | **NIEPRZETESTOWANE** (brak WebKit w środowisku) |

Nowe E2E (`tests/e2e/ergonomics.spec.ts`, ×7 viewportów): pola i zapis osiągalne bez przewijania (timer wył./wł.), każde z 6 ćwiczeń z timerem, żaden kontrolka nie zostaje trwale pod paskami, RIR nieoceniony, przełączanie ‹ ›, pominięcie i edycja serii, otwarta klawiatura (symulacja zmniejszonym viewportem), bardzo długie nazwy ćwiczeń (bez przepełnienia, nazwa ≤ 2 linie), powrót z tła (zegar przesunięty o 10:30 — timer i niezapisany formularz zachowane), brak chwilowego przepełnienia przy przełączaniu, ekran główny (tydzień wspomniany raz). Nowy projekt `w393-safe` (393×852 z wcięciami 59/34 px). Diagnostyka D1–D10 z gałęzi audytu zamieniona na `src/test/stage1.regression.test.ts`.

## 5. Dane i plan

- **Plan FBW A/B bez zmian**: `src/domain/plan.ts` i `src/domain/schedule.ts` nietknięte (A: przysiad goblet, wyciskanie płasko, wiosłowanie jednorącz, RDL, wznosy bokiem, deska; B: skos, wykroki, wiosłowanie z podparciem, wyciskanie nad głowę, hip thrust, biceps; adaptacja 4 tyg., T1–T4, RIR 4/3/2–3/1–2).
- **Schemat IndexedDB bez zmian** (Dexie, `SCHEMA_VERSION = 1`, brak migracji, brak resetu). Nowy status `cancelled` to tylko nowa wartość pola.
- Test międzywersyjny: dane utworzone w obecnej wersji z `main` (seed + pusty „ukończony” trening + trening w toku z 13,5 kg) otwarte nową wersją na tej samej bazie → **zawartość wszystkich tabel identyczna bajt w bajt**; licznik zaliczonych 12 → 11 (pusty trening przestaje się liczyć), trening w toku wznawia się z serią 13,5 kg.
- Ograniczenie: kopia JSON zawierająca trening `cancelled`, wyeksportowana z nowej wersji, nie zaimportuje się do starej wersji (stary walidator nie zna tej wartości). Kierunek stara → nowa działa.

## 6. Ograniczenia i uwagi

- Safari/WebKit/iOS: **NIEPRZETESTOWANE**. Klawiatura iOS symulowana zmniejszeniem viewportu; zachowanie paska `sticky` z klawiaturą na iPhonie wymaga sprawdzenia ręcznego.
- Próg przerwy 30 min dla „czasu aktywnego” jest heurystyką (bardzo długa przerwa między seriami > 30 min zostanie pominięta).
- Na danych testowych porównanie na ekranie głównym zmieniło się z „5 poprawa” na „1 poprawa · 1 spadek · 4 inny ciężar/RIR” — to zamierzony efekt uczciwszej reguły, nie regresja.
- Pas zapisany wcześniej z 2 miejscami (np. 98,12) wyświetla się zaokrąglony (98,1); zapisana wartość nie jest zmieniana.
- Nie ruszano: liczby zakładek, Atlasu, kroku 2 audytu; brak nowych funkcji i statystyk.
