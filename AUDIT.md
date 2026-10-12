# Audyt jakości i gotowości — Silk FBW

Data: 12.10.2026 · Gałąź: `claude/fbw-pwa-app`

## Środowisko i metoda

| Co | Gdzie uruchomione |
|---|---|
| Testy jednostkowe | Node 22 + Vitest 3, IndexedDB emulowane przez `fake-indexeddb` |
| Testy E2E | **Chromium 141 (Playwright 1.56)** z emulacją ekranu dotykowego i viewportu iPhone'a — **to nie jest Safari/WebKit** |
| Safari / WebKit / iOS | **Nie był dostępny w środowisku.** Żaden test nie został wykonany w WebKit ani na iPhonie. |

Wszystko oznaczone niżej jako **NIE WYKONANO** wymaga przejścia listy [`docs/IOS_MANUAL_CHECKLIST.md`](docs/IOS_MANUAL_CHECKLIST.md) na iPhonie (instrukcja uruchomienia: [`docs/IPHONE_HTTPS_TEST.md`](docs/IPHONE_HTTPS_TEST.md)).

## Wynik pipeline'u (ostatnie uruchomienie)

| Krok | Wynik |
|---|---|
| ESLint | **PASS** (0 błędów, 0 ostrzeżeń) |
| TypeScript (`tsc -b`) | **PASS** |
| Testy jednostkowe | **PASS** — 113/113 (1 pominięty celowo: generator danych testowych) |
| Build produkcyjny + service worker | **PASS** — 184 kB gzip, 16 plików w precache |
| E2E, Chromium, 6 szerokości (320, 375, 390, 430, 768, 1440 px) | **PASS** — 73/73; 5 pominięć celowych (test aktualizacji PWA przebudowuje `dist/`, więc działa tylko raz, w projekcie 1440 px) |
| Stabilność E2E | 2 kolejne pełne przebiegi bez błędów; test edycji historii 18/18 (6 szerokości × 3 powtórzenia) |

## Znalezione problemy i poprawki

| # | Waga | Problem | Poprawka | Dowód |
|---|---|---|---|---|
| 1 | **Krytyczna** | Pole ciężaru gubiło przecinek dziesiętny: wpisanie „13,5” z polskiej klawiatury iOS dawało **135 kg** | Pole liczbowe przechowuje wpisany tekst i parsuje go dopiero na liczbę | Test E2E wpisuje znak po znaku; na starej wersji kodu **failuje** („135”), na nowej przechodzi |
| 2 | Wysoka | Edycja lub usunięcie serii w zakończonym treningu nie aktualizowało propozycji progresji. Zaakceptowana, już nieaktualna propozycja nadal podpowiadała większy ciężar | `reconcileExercise()`: propozycja jest danymi pochodnymi; po każdej zmianie zostaje utworzona, zaktualizowana (wraca do decyzji) albo wycofana. Działa przy edycji, usunięciu serii i treningu, ponownym zakończeniu oraz zmianie kroku ciężaru | 9 testów jednostkowych + E2E (toast „wycofana”, karta znika) |
| 3 | Wysoka (iOS) | Znany problem WebKit: po powrocie aplikacji z tła połączenie z IndexedDB bywa zerwane („Connection to Indexed Database server lost”), więc zapis serii się nie udaje | Jednorazowe ponowne otwarcie bazy i powtórzenie transakcji (`withDbRetry`). Id serii nadawane przed transakcją, więc ponowienie nie tworzy duplikatu | Testy jednostkowe z symulowanym błędem. **Zachowanie na prawdziwym iOS: NIE WYKONANO** |
| 4 | Średnia | Gdy iOS zamknie aplikację w tle, wpisane, ale niezapisane wartości serii znikały | Szkic formularza w `localStorage`: przywracany po ponownym otwarciu, kasowany po zapisie, ważny 12 h | E2E: zamknięcie strony → nowa strona → wartości przywrócone |
| 5 | Średnia (iOS) | Eksport wywoływał arkusz udostępniania dopiero po asynchronicznym zbudowaniu kopii; iOS może wtedy odrzucić `navigator.share()` (brak świeżego gestu) | Eksport dwuetapowy: „Eksportuj” przygotowuje plik, „Zapisz plik” od razu otwiera arkusz/pobieranie | E2E ścieżki pobierania w Chromium. **Arkusz udostępniania iOS: NIE WYKONANO** |
| 6 | Średnia | Monit „Dostępna nowa wersja” mógł pojawić się podczas treningu, a „Odśwież” przeładowywał stronę w trakcie serii | Monit ukryty na ekranie treningu, pokazuje się na innych ekranach | E2E aktualizacji |
| 7 | Średnia | Aktualizacja schematu bazy mogła zostać zablokowana przez drugie otwarte okno starej wersji; po cofnięciu do starszej wersji pojawiał się niezrozumiały błąd | Obsługa `versionchange` (zamknięcie połączenia i przeładowanie) oraz czytelny komunikat przy `VersionError` | Test migracji v1→v2. **Scenariusz z dwoma oknami: NIE WYKONANO** |
| 8 | Średnia | Ilustracje: niepełny wyprost łokci w wyciskaniach (140–156°), ręce nie zwisały pionowo (18–21°) w wiosłowaniach i RDL, stopa poniżej podłogi w wiosłowaniu z podparciem | Poprawione pozy | 36 testów geometrycznych (sekcja niżej) + przegląd zrzutów |
| 9 | Niska | Pola dotykowe < 44 px: przyciski „sm”, przełącznik Robocza/Rozgrzewka, ±15 s, „Tabela”, „Szczegóły” | Minimum 44 px wysokości | E2E mierzy wszystkie widoczne przyciski ekranu treningu na 6 szerokościach |
| 10 | Niska | Na 320–375 px nagłówek ćwiczenia zajmował cały ekran | Zwarty nagłówek; zaplanowane serie zwinięte do jednej linii | Zrzuty ekranu (ograniczenie niżej) |
| 11 | Niska | Licznik czasu treningu wznowionego po wielu godzinach pokazywał np. „1440:00” | Format h:mm:ss powyżej godziny | — |
| 12 | Niska | Szybkie podwójne dotknięcie „Zapisz serię” mogło teoretycznie zapisać serię dwa razy | Blokada w trakcie zapisu | — |

## Wyniki wg punktów audytu

| # | Wymaganie | Chromium / Node (automatycznie) | Safari / iOS |
|---|---|---|---|
| 1 | Brak utraty danych przy aktualizacji PWA, odświeżeniu i ponownym uruchomieniu | **PASS**: aktualizacja v1→v2 z historią i trwającym treningiem, przeładowanie w trakcie sesji, ponowne otwarcie bazy bez zmian danych | **NIE WYKONANO** |
| 2 | Pełny eksport i przywrócenie, także na innym urządzeniu | **PASS**: eksport w profilu A → import w czystym profilu B (inne „urządzenie”) → ponowny eksport identyczny rekord po rekordzie; round-trip w testach jednostkowych | Arkusz „Zapisz w Plikach” i wybór pliku z Plików iOS: **NIE WYKONANO** |
| 3 | Edycja historii aktualizuje sugestie | **PASS** (9 testów jednostkowych + E2E) | Logika jest niezależna od przeglądarki |
| 4 | Standalone iOS: safe-area, klawiatura, formularze, timer w tle | Częściowo: timer liczony z zapisanego znacznika czasu poprawnie po przeładowaniu (**PASS**); wpisywanie liczb z przecinkiem (**PASS**); pola ≥ 16 px, więc iOS nie powinien przybliżać ekranu przy fokusie (przegląd kodu) | Safe-area, klawiatura, tryb standalone, tło: **NIE WYKONANO** |
| 5 | Ilustracje 12 ćwiczeń | **PASS** dla zdefiniowanych kryteriów geometrycznych (24 pozy) — to **nie jest** ocena trenera | Wygląd na ekranie iPhone'a: **NIE WYKONANO** |
| 6 | Zamknięcie podczas treningu i wznowienie | **PASS**: serie, timer przerwy, bieżące ćwiczenie i niezapisany formularz przetrwały zamknięcie strony | Zabicie aplikacji przez iOS: **NIE WYKONANO** |
| 7 | Responsywność 320 / 375 / 390 / 430 / 768 / 1440 px | **PASS**: brak poziomego przewijania na wszystkich ekranach (pusta i pełna historia), przycisk zapisu w zasięgu kciuka, pola dotykowe | Renderowanie WebKit: **NIE WYKONANO** |
| 8 | Aktualizacja kodu, zachowanie historii, migracja bazy | **PASS**: aktualizacja service workera z danymi; migracja v1→v2 zachowuje rekordy i wykonuje `upgrade()`; nowsza kopia odrzucana przy imporcie | **NIE WYKONANO** |
| 9 | Oddzielenie Chromium od WebKit | Ten dokument: żaden wynik WebKit nie jest oznaczony jako zaliczony | — |

## Analiza ryzyka utraty danych

| Scenariusz | Co się dzieje z danymi | Status |
|---|---|---|
| Aktualizacja PWA (nowy service worker) | SW czyści tylko pamięć podręczną plików (Cache Storage); IndexedDB nie jest ruszane | Zweryfikowane w Chromium (E2E) |
| Odświeżenie / przeładowanie w trakcie treningu | Każda seria jest zapisana w transakcji przed pokazaniem; timer i bieżące ćwiczenie są w bazie; niezapisany formularz w szkicu | Zweryfikowane w Chromium |
| Zamknięcie aplikacji / zabicie przez iOS | Jak wyżej | Chromium: zamknięcie strony. Zabicie procesu na iOS: NIE WYKONANO |
| Restart telefonu | IndexedDB jest na dysku | NIE WYKONANO |
| Zmiana schematu w nowej wersji | Nowy blok `version(n).upgrade()`, starych nie zmienia się; test mechanizmu v1→v2 | Zweryfikowane (Node) |
| Dwie wersje otwarte jednocześnie | Stara zamyka połączenie i przeładowuje się | Kod; NIE testowane |
| Brak miejsca / błąd zapisu | Komunikat, formularz zostaje, ponowienie możliwe | Zweryfikowane (E2E z symulowanym błędem) |
| Utrata połączenia IndexedDB po powrocie z tła (iOS) | Automatyczne ponowne otwarcie i powtórzenie | Symulacja w Node; iOS: NIE WYKONANO |
| **Usunięcie aplikacji z ekranu początkowego / „Wyczyść dane witryn” / reset telefonu** | **Dane są tracone** — nie da się temu zapobiec lokalnie | Jedyna ochrona: regularny eksport (przypomnienie co 14 dni) |
| **Zmiana adresu (origin)**, np. z wersji testowej na docelowy hosting albo zmiana IP | Nowy adres = osobna, pusta baza | Przenieś dane eksportem/importem; nie używaj adresu IP jako stałego |
| Strona otwierana w Safari zamiast z ikony | Osobny magazyn danych; Safari może usuwać dane nieużywanych stron po ok. 7 dniach | Używaj wyłącznie ikony |

## Weryfikacja ilustracji (punkt 5)

**Metoda.** Sylwetka ma stałe długości segmentów (uda 38, podudzie 36, tułów 44, ramię 26, przedramię 24 j.). Kolana i łokcie wyznacza kinematyka odwrotna. Test `src/features/atlas/poses.test.ts` sprawdza dla każdej z 24 póz:
- czy długości segmentów są zachowane;
- czy stopy i dłonie faktycznie sięgają zadanych punktów (poza nie jest „naciągnięta”);
- czy żaden staw nie jest poniżej podłogi.

Do tego dochodzą kryteria techniczne wynikające ze wskazówek na kartach atlasu, m.in.:

| Ćwiczenie | Sprawdzane kryteria |
|---|---|
| Przysiad goblet | biodro na/pod wysokością kolana, kolana przed stopami, pięty bez ruchu, pochylenie tułowia 15–45°, barki nad śródstopiem, hantel przy klatce |
| Wyciskanie płasko / skos | wyprost > 160° nad barkiem, na dole przedramię ≤ 15–20° od pionu i łokieć poniżej linii tułowia, oparcie 30–45° i tułów równoległy do oparcia |
| Wiosłowanie jednorącz | plecy ≤ 20° od poziomu, ręka zwisa pionowo, łokieć na końcu nad linią pleców i za barkiem, podpory na ławce |
| Martwy ciąg rumuński | kolano 140–176° (to nie przysiad), kąt biodrowy < 120°, biodra za stopami, hantle poniżej kolan i ≤ 15 j. od nóg |
| Unoszenie bokiem | dłonie na wysokości barków ±8, łokieć 150–179° i nie niżej niż dłoń |
| Plank | linia bark–biodro–kostka > 172°, łokieć pod barkiem, przedramię na podłodze |
| Wykroki w tył | przednia goleń ≤ 15° od pionu, tylne kolano 2–11 j. nad podłogą, tułów ≤ 15° |
| Wiosłowanie z podparciem | oparcie 30–45°, tułów równoległy do oparcia, ręce zwisają pionowo, łokcie kończą za barkami |
| Wyciskanie nad głowę | start: dłonie na wysokości barków i przedramię pionowo; koniec: wyprost > 165° nad barkiem, tułów pionowo |
| Hip thrust | góra: bark–biodro–kolano > 165°, goleń ≤ 10° od pionu, kolano 78–102°; bark na krawędzi ławki jako oś obrotu |
| Uginanie na biceps | łokieć przy tułowiu (≤ 6 j.), zgięcie < 60° na górze, wyprost > 165° na dole |

Wynik: 36/36 PASS, po poprawieniu 7 niedokładności wykrytych tą metodą (pozycja #8 w tabeli problemów).

**Czego ta weryfikacja nie obejmuje:**
- Rysunki to schematy w widoku z boku (unoszenie bokiem z przodu). Nie pokazują rotacji, szerokości chwytu ani ustawienia łokci 45–60° względem tułowia w wyciskaniach — to opisuje tekst karty.
- Wyciskanie nad głowę narysowano na stojąco; wariant siedzący nie jest zilustrowany.
- Pozycja „start” planku to etap ustawienia na kolanach, a nie faza ruchu.
- Pozy **nie zostały ocenione przez wykwalifikowanego trenera ani fizjoterapeutę**. Testy potwierdzają zgodność rysunku z zapisanymi kryteriami, a nie poprawność kryteriów dla Twojego ciała.

## Znane ograniczenia po audycie

- Brak testów w Safari/WebKit i na iPhonie (wszystkie pozycje „NIE WYKONANO” powyżej).
- Na 320×568 px (iPhone SE 1. gen.) formularz serii jest poniżej pierwszego ekranu i trzeba przewinąć. Na 375×667 px wiersz RIR wymaga krótkiego przewinięcia; przycisk „Zapisz serię” jest zawsze widoczny, a RIR podpowiadany.
- Szkic niezapisanego formularza jest w `localStorage`, które iOS może wyczyścić razem z danymi witryny. To wygoda, nie gwarancja; zapisane serie są w IndexedDB.
- Dźwięk końca przerwy nie zagra, gdy aplikacja jest w tle (ograniczenie iOS). Po powrocie czas jest poprawny.
- Synchronizacji między urządzeniami nadal nie ma (poza zakresem); import zastępuje dane.
