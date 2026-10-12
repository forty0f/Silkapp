# Ręczne testy na iPhonie (Safari / WebKit)

Te testy **nie zostały wykonane** w automatycznym pipeline (dostępny był tylko Chromium). Wykonaj je na iPhonie z aplikacją uruchomioną **z ikony na ekranie początkowym** (instrukcja: [`IPHONE_HTTPS_TEST.md`](IPHONE_HTTPS_TEST.md)). Wpisz PASS / FAIL i uwagi.

Urządzenie / iOS: ______________ · Data: ______________ · Wersja (Ustawienia, stopka): ______________

| # | Test | Oczekiwany wynik | Wynik |
|---|---|---|---|
| **Instalacja i offline** ||||
| 1 | Dodaj do ekranu początkowego i uruchom z ikony | Pełny ekran bez paska Safari, ikona hantla, nazwa „Silk FBW” | |
| 2 | Tryb samolotowy → zamknij aplikację w przełączniku → uruchom | Aplikacja działa, widoczny pasek „Offline”, można zapisać serię | |
| **Safe-area i układ** ||||
| 3 | Góra ekranu (notch / Dynamic Island) na każdej zakładce | Tytuły i przyciski nie chowają się pod paskiem statusu | |
| 4 | Dół ekranu: pasek zakładek, przycisk „Zapisz serię”, okna dolne | Nic nie nachodzi na wskaźnik Home | |
| 5 | Obrót do poziomu (jeśli blokada wyłączona) | Brak przewijania w poziomie, treść poza wycięciem ekranu | |
| **Klawiatura i formularze** ||||
| 6 | Stuknij pole ciężaru | Klawiatura numeryczna z przecinkiem; ekran **nie przybliża się** | |
| 7 | Wpisz „12,5” i zapisz serię | Seria pokazuje „12,5 kg” (nie 125) | |
| 8 | Pole powtórzeń, notatka, data pomiaru, edytor planu | Właściwa klawiatura, bez przybliżania, pole widoczne nad klawiaturą | |
| 9 | Zamknięcie klawiatury (stuknięcie obok) | Klawiatura znika, wartość zostaje | |
| **Trening, timer, tło** ||||
| 10 | Zapisz serię → wyjdź na ekran główny iPhone'a na ~1 min → wróć | Timer pokazuje czas pomniejszony o czas w tle (nie „zamarznięty”) | |
| 11 | Pozwól przerwie skończyć się przy otwartej aplikacji (dźwięk włączony, przełącznik wyciszenia wyłączony) | Krótki sygnał; pasek „Przerwa zakończona” | |
| 12 | Ekran podczas treningu (opcja „Nie wygaszaj ekranu”) | Ekran nie gaśnie (iOS 16.4+; w trybie zainstalowanym może wymagać iOS 18.4+) | |
| 13 | Wpisz wartości bez zapisu → zamknij aplikację w przełączniku → uruchom → „Wznów” | Zapisane serie są; wpisane wartości przywrócone | |
| 14 | Zostaw aplikację w tle na ≥ 30 min (np. inne aplikacje) → wróć i zapisz serię | Seria się zapisuje (bez błędu IndexedDB) | |
| 15 | Restart telefonu → uruchom aplikację | Historia i trwający trening zachowane | |
| **Kopia zapasowa** ||||
| 16 | Ustawienia → Eksportuj → Zapisz plik | Otwiera się arkusz udostępniania; „Zapisz w Plikach” zapisuje plik `.json` | |
| 17 | Importuj z pliku → wybierz plik z Plików / iCloud Drive | Plik da się wybrać; podgląd liczby treningów; po potwierdzeniu dane przywrócone | |
| 18 | Import na drugim urządzeniu (iPhone → komputer lub odwrotnie) | Ta sama liczba treningów i serii, trwający trening da się wznowić | |
| **Aktualizacja** ||||
| 19 | Nowa wersja na serwerze → otwórz aplikację na ekranie treningu | Brak monitu w trakcie treningu | |
| 20 | Przejdź do Historii → „Odśwież” | Aplikacja się przeładowuje, wersja w stopce Ustawień zmieniona, dane bez zmian | |
| **Wygląd** ||||
| 21 | Atlas: 12 kart, obie fazy | Rysunki czytelne, strzałki ruchu widoczne | |
| 22 | Wykresy w Progresie: dotknięcie punktu, „Tabela” | Podgląd wartości, tabela się otwiera | |
