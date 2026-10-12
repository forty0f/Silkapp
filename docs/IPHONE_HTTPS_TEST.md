# Wersja testowa na iPhonie przez HTTPS — Tailscale Serve

Zalecana metoda. Nie wymaga instalowania własnego certyfikatu CA na telefonie (Tailscale wystawia zaufany certyfikat Let's Encrypt) ani publikowania aplikacji w internecie. Aplikację serwuje Twój komputer, a dostęp mają tylko urządzenia zalogowane do Twojej sieci Tailscale.

**Kiedy komputer musi być włączony:** tylko przy pierwszej instalacji i przy aktualizacjach. Po instalacji PWA działa z pamięci telefonu, także bez Tailscale i bez internetu. Dane treningowe zawsze zostają na iPhonie.

## 1. Komputer (jednorazowo)

1. Zainstaluj Tailscale ze strony tailscale.com (macOS: aplikacja z App Store lub ze strony; Windows/Linux: instalator) i zaloguj się.
2. **Nadaj komputerowi neutralną nazwę**, zanim włączysz certyfikaty, np. `dom-pc`. Nazwa trafi do publicznego rejestru certyfikatów (Certificate Transparency); zmiana nazwy później zmieni adres aplikacji.
3. W panelu administracyjnym Tailscale → **DNS**: włącz **MagicDNS** i **HTTPS Certificates**.
4. Zbuduj aplikację:
   ```bash
   git clone https://github.com/forty0f/Silkapp && cd Silkapp
   git checkout claude/fbw-pwa-app
   npm install
   npm run build
   ```

## 2. Uruchomienie serwera (przy instalacji i aktualizacjach)

W dwóch terminalach:

```bash
npm run preview                 # serwer lokalny: http://localhost:4173
tailscale serve --bg 4173       # udostępnia go w sieci Tailscale przez HTTPS
tailscale serve status          # pokazuje adres, np. https://dom-pc.tail1234.ts.net
```

Starsze wersje Tailscale mogą wymagać innej składni (`tailscale serve https / http://localhost:4173`); sprawdź `tailscale serve --help`. Wyłączenie udostępniania: `tailscale serve reset`.

Konfiguracja podglądu Vite akceptuje hosty `*.ts.net` (inne są blokowane).

## 3. iPhone (jednorazowo)

1. Zainstaluj aplikację **Tailscale** z App Store, zaloguj się tym samym kontem i włącz połączenie.
2. Otwórz **Safari** (nie Chrome) i wpisz adres z `tailscale serve status`. Kłódka bez ostrzeżeń oznacza, że wszystko jest dobrze.
3. **Udostępnij → Do ekranu początkowego → Dodaj** (nazwa „Silk FBW”).
4. Od teraz otwieraj aplikację **tylko z ikony**. Strona w Safari ma osobne dane.

## 4. Aktualizacje

Komputer: `git pull && npm run build`, a potem `npm run preview` i `tailscale serve --bg 4173`. iPhone: włącz Tailscale, otwórz aplikację, przejdź na ekran inny niż trening i stuknij **„Odśwież”** w monicie o nowej wersji.

## Ważne o danych

- Dane należą do dokładnego adresu, np. `https://dom-pc.tail1234.ts.net`. Zmiana nazwy komputera, nazwy sieci Tailscale albo przejście na inny hosting oznacza nowy, pusty adres. Przed zmianą zrób eksport, a po zmianie import.
- Usunięcie ikony z ekranu początkowego kasuje dane aplikacji. Rób eksport regularnie (przypomnienie co 14 dni).

## Alternatywa: lokalny certyfikat (mkcert)

Jeśli nie chcesz Tailscale: `brew install mkcert nss && mkcert -install`, potem `mkcert -cert-file certs/cert.pem -key-file certs/key.pem <nazwa>.local` i `npm run preview:lan`. Wymaga to jednak zainstalowania i zaufania własnemu CA na iPhonie (**Ustawienia → Ogólne → To urządzenie → Ustawienia zaufania certyfikatów**) oraz usunięcia go po testach.

Po instalacji przejdź listę [`IOS_MANUAL_CHECKLIST.md`](IOS_MANUAL_CHECKLIST.md).
