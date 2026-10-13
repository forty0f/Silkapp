# Silkapp — trzy stany treningu, zgodność kopii (R1/R2) i plan publikacji

Stan na gałęziach (nic nie jest opublikowane na `main` ani GitHub Pages):

| Wydanie | Gałąź | Zawartość |
|---|---|---|
| **R1** — zgodność | `claude/r1-compat` (od `main` @ `e0c074e`) | tylko obsługa danych i kopii zapisanych przez R2; zachowanie produkcji bez zmian |
| **R2** — pełny etap 1 | `claude/stage1-logic-ux` (zawiera R1 przez merge) | etap 1 + trzy stany treningu + wybór „dalej / powtórz” |

## 1. Trzy stany treningu (R2)

Stan wynika z zapisanych serii, bez progu procentowego:

| Stan | Definicja | Plan (A/B, tydzień, sesja) | Statystyki / „wykonane” |
|---|---|---|---|
| **Anulowany** | 0 wykonanych serii roboczych (rozgrzewki i serie pominięte się nie liczą) | nie przesuwa | nie |
| **Częściowo ukończony** | ≥ 1 wykonana seria robocza, ale nie wszystkie zaplanowane | według **świadomego wyboru** | tak (to realna praca) |
| **W pełni ukończony** | wszystkie zaplanowane serie robocze wszystkich ćwiczeń wykonane (serie dodatkowe dozwolone) | przesuwa | tak |

- **Wybór przy treningu częściowym:** okno „Trening częściowo ukończony” z dwoma równorzędnymi przyciskami, żaden nie jest zaznaczony: „Dalej według planu — następny B” i „Powtórz trening A”, plus „Wróć do treningu”. Bez wyboru trening nie zostanie zakończony (`finishSession` odrzuca brak wyboru).
- **„Powtórz”:** następny trening ma ten sam typ, tydzień, sesję, liczbę serii i RIR, więc adaptacja wydłuża się o jedną sesję. Na ekranie głównym pojawia się notka „Powtórzenie — poprzedni trening A był częściowy”.
- **Zmiana decyzji:** przycisk „Zmień” w podsumowaniu i szczegółach sesji, tylko dla najnowszego treningu, gdy nic nie jest w toku. Starsze sesje nie mogą przesunąć pozycji późniejszych.
- **Zapis:** pole `planAdvance` (true/false) zapisywane wyłącznie dla treningu częściowego. Treningi pełne i anulowane go nie mają, więc kopia zostaje w formacie 1, dopóki nie pojawi się trening częściowy lub anulowany.

**Postęp harmonogramu oddzielony od wykonanej pracy:**
- **Pozycja w planie** (`advancesPlan`): ukończony i nie „powtórz”. Sesje bez pola, czyli wszystkie dane z poprzednich wersji, zachowują swój historyczny wpływ, także stare puste treningi.
- **Wykonana praca** (`isPerformedSession`): ukończony i ≥ 1 wykonana seria robocza. Od tego zależą licznik „wykonanych”, kalendarz, statystyki, wykresy, tygodnie i „ostatni trening”.
- **Stary pusty trening** zachowuje miejsce w planie, ale w historii jest wyszarzony z etykietą „pusty — bez wykonanych serii” i nie wchodzi do statystyk.
- **Ekran główny:** licznik pokazuje „N wykonanych”, a pasek adaptacji „x/12 sesji planu”.

**Progresja (per ćwiczenie):**
- Podstawą propozycji jest ostatnie wykonanie, w którym **wszystkie zaplanowane serie danego ćwiczenia** zostały wykonane (`lastCompletePerformance`).
- Ćwiczenie zrobione częściowo nigdy nie wycofuje wcześniejszej propozycji.
- Ćwiczenie z kompletem serii w treningu częściowym jest normalnie oceniane i może dać propozycję.
- Kompletne wykonanie poniżej zakresu nadal zastępuje starszą propozycję, bo jest ważną podstawą.

**Etykiety w historii** (jednolite na wszystkich ekranach): „w toku”, „częściowy 9/16”, „częściowy 9/16 · powtórzony”, „anulowany”, „pusty — bez wykonanych serii”. Trening pełny nie ma etykiety na liście, w szczegółach jest „ukończony”.

## 2. Zgodność kopii i wycofanie

**Format kopii** (niezależny od schematu IndexedDB, który pozostaje w wersji 1, bez migracji):
- **Format 1:** oryginalny.
- **Format 2:** sesje mogą mieć status `cancelled` i pole `planAdvance`.
- Eksport wybiera format 1, gdy dane się w nim mieszczą. Wtedy plik nadal zaimportuje się do obecnej produkcji.

**Walidacja w R1 i R2** (ścisła, bez akceptowania dowolnych wartości):
- Status tylko z listy `in_progress | completed | cancelled`; nieznany jest odrzucany.
- `planAdvance` musi być wartością logiczną i jest dozwolone tylko przy sesji ukończonej.
- Sesja zakończona musi mieć datę zakończenia, a sesja w toku nie może jej mieć.
- Plik w formacie 1 z treściami formatu 2 jest odrzucany.
- Powtórzone identyfikatory są odrzucane.
- Format nowszy niż 2 dostaje komunikat „Kopia pochodzi z nowszej wersji…”.
- **Import nigdy nie niszczy bazy przy błędzie:**
  - walidacja odbywa się przed zapisem;
  - zapis to jedna transakcja, więc błąd w trakcie (np. konflikt klucza) cofa całość;
  - przed importem tworzona jest wewnętrzna kopia „Przed importem kopii”.
  - Test jednostkowy wymusza błąd w środku zapisu i sprawdza, że dane są identyczne jak przed importem.

**R1 obsługuje dane R2:**
- Rozumie `cancelled` i `planAdvance`; pozycja w planie respektuje „powtórz”.
- Zakończona sesja (także anulowana) nigdy nie otwiera się jako aktywny trening.
- Anulowane sesje mają w historii etykietę „anulowany” i nie trafiają do kalendarza.
- Otwarcie sesji „powtórzonej” do edycji (Wznów) usuwa jej wybór; zostanie wybrany ponownie przy zakończeniu.

### Test na jednej bazie IndexedDB (prawdziwe buildy, Chromium)

Kolejne kroki: produkcja `e0c074e` → R1 → R2 → wycofanie do R1 → powrót do R2. W każdym kroku skrypt sprawdzał, że strona naprawdę działa na oczekiwanym buildzie.

| # | Kontrola | Wynik |
|---|---|---|
| 1 | Produkcja: seed + pusty trening + trening częściowy → plan „B, tydz. 5, sesja 2” | — |
| 2 | R1: ten sam plan; otwarcie nie zmienia bazy | ✅ ✅ |
| 3 | R2: ten sam plan (stary pusty trening zachowuje wpływ — brak przesunięcia); otwarcie nie zmienia bazy | ✅ ✅ |
| 4 | R2: etykiety „pusty”, „częściowy 1/18” dla danych z produkcji | ✅ ✅ |
| 5 | R2: anulowany → plan bez zmian; częściowy + „powtórz” → bez zmian; częściowy + „dalej” → plan idzie dalej | ✅ ✅ ✅ |
| 6 | R2: eksport w formacie 2 | ✅ |
| 7 | Wycofanie do R1: plan identyczny jak w R2; anulowany otwiera się jako podsumowanie; etykieta „anulowany”; odczyt nie zmienia bazy | ✅ ✅ ✅ ✅ |
| 8 | R1 importuje eksport R2; dane identyczne (sesje z `planAdvance`, serie, propozycje); plan bez zmian; eksport R1 zachowuje format 2 | ✅ ✅ ✅ ✅ |
| 9 | Obecna produkcja odrzuca eksport R2 komunikatem „Kopia pochodzi z nowszej wersji (schemat 2, obsługiwany 1)”; baza nietknięta | ✅ ✅ |
| 10 | Powrót do R2: plan bez zmian; R2 importuje eksport R1; dane identyczne jak przed wycofaniem | ✅ ✅ ✅ |

Razem **25/25 kontroli zaliczonych**.

Uwaga do wcześniejszej analizy: tamten skrypt nawigował w obrębie tej samej strony (zmiana tylko `#…`). Po podmianie serwera część kroków mogła więc działać na kodzie poprzedniej wersji. Obecny skrypt wymusza pełne przeładowanie i weryfikuje działający build. Wniosek o produkcji (anulowana sesja otwiera się w niej jako aktywna) wynika bezpośrednio z kodu `e0c074e`: `status === 'completed'` → podsumowanie, w innym razie formularz. Dlatego **wycofanie poniżej R1 nie jest zalecane**.

## 3. UX

- Uproszczenia ekranu treningu z etapu 1 są zachowane bez zmian.
- Zachowania klawiatury nie zmieniano. Wyniki symulacji Chromium (model z pomniejszonym viewportem i geometryczny model iOS) są w poprzednim raporcie.
- **Rzeczywisty iOS/Safari/WebKit: NIEPRZETESTOWANE.** Lista kontrolna do ręcznego testu jest w sekcji 5.
- Nowe elementy interfejsu ograniczono do minimum: okno wyboru (istniejący arkusz dialogowy), jeden wiersz „Następny trening: … [Zmień]” przy treningu częściowym, etykiety w historii, notka o powtórzeniu na ekranie głównym.

## 4. Testy

| | R1 (`claude/r1-compat`) | R2 (`claude/stage1-logic-ux`) |
|---|---|---|
| lint, typecheck, build | ✅ | ✅ |
| unit (vitest) | ✅ 139 passed, 1 skipped | ✅ 187 passed, 1 skipped |
| E2E Chromium, base `/` | ✅ 97 passed, 0 failed (6 viewportów) | ✅ 197 passed, 0 failed (7 viewportów, w tym 393×852 z safe-area) |
| E2E Chromium, base `/Silkapp/` | ✅ 103 passed, 0 failed | ✅ 204 passed, 0 failed |
| Test międzywersyjny (sekcja 2) | ✅ 25/25 | ✅ 25/25 |
| Safari / WebKit / iOS | NIEPRZETESTOWANE | NIEPRZETESTOWANE |

Nowe testy:
- `src/test/compat.test.ts` (R1 i R2): format 2, ścisła walidacja, nieudany import nie zmienia bazy, „Wznów” czyści wybór.
- `src/test/partial.test.ts` (R2): trzy stany, wymagany wybór, powtórz/dalej, zmiana decyzji tylko dla najnowszego, dane z poprzednich wersji, reguła progresji per ćwiczenie.
- `tests/e2e/compat.spec.ts`: dane formatu 2 w UI.
- `tests/e2e/partial.spec.ts`: ścieżki „powtórz”, „zmień”, „anuluj dialog” i trening anulowany.
- Fixture `tests/fixtures/seed-format2.json`.

Plan FBW A/B (`src/domain/plan.ts`, `src/domain/schedule.ts`) jest bez zmian w obu wydaniach. Schemat IndexedDB jest bez zmian (wersja 1); dane użytkownika nie są modyfikowane przy aktualizacji (sprawdzone bajt w bajt).

## 5. Plan publikacji (wymaga Twojej zgody na każdy krok z ★)

**Przygotowanie**
1. Na iPhonie, w obecnej wersji: Ustawienia → Eksport kopii. Zachowaj plik w Plikach jako punkt powrotu (format 1).

**R1**
2. ★ Zgoda na R1 → fast-forward lub merge `claude/r1-compat` do `main`. Push uruchamia workflow: lint, typecheck, unit, build, E2E i dopiero potem deploy na Pages.
3. Weryfikacja online:
   - workflow zielony;
   - Ustawienia → numer builda zmieniony;
   - historia i licznik bez zmian;
   - eksport nadal w formacie 1 (dane bez nowych stanów).
4. Na iPhonie: odśwież aplikację (baner „Dostępna nowa wersja” → Odśwież); dane i plan bez zmian.

**R2**
5. ★ Zgoda na R2 → merge `claude/stage1-logic-ux` do `main` (zawiera już R1). Workflow jak wyżej.
6. Weryfikacja online:
   - plan (następny trening, tydzień, sesja) taki sam jak przed aktualizacją;
   - stare puste treningi oznaczone „pusty”;
   - licznik „wykonanych” może być niższy o liczbę pustych treningów — to zamierzone.
7. Na iPhonie: ręczny test z listy (zapis serii z klawiatury, wykroki L/P, timer z klawiaturą, blokada telefonu w przerwie, obrót ekranu, zakończenie treningu częściowego z wyborem).

**Wycofanie (jeśli potrzebne)**
- ★ Revert na `main` do commita R1 (nie do `e0c074e`). R1 czyta bazę i kopie z R2, więc nic nie trzeba robić z danymi.
- Nie usuwać aplikacji z ekranu iPhone'a i nie czyścić danych witryny (na iOS to kasuje IndexedDB).
- Po ponownym wdrożeniu R2 dane wracają bez importu, bo baza jest ta sama.

Nic z powyższego nie zostało wykonane. Czekam na akceptację.

Pominięte testy: test aktualizacji PWA uruchamia się tylko w jednym projekcie (przebudowuje `dist`), a testy ścieżki `/Silkapp/` tylko w konfiguracji Pages.
