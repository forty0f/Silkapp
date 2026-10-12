# Wersja testowa przez HTTPS na iPhonie (bez publikowania)

iOS uruchamia service worker (tryb offline) i pozwala zainstalować PWA tylko na stronie z **zaufanym HTTPS**. Poniżej znajdziesz dwie prywatne metody. Żadna nie publikuje aplikacji w internecie.

> Przed startem przeczytaj „Ważne o danych” na końcu. Dane wersji testowej należą do adresu testowego i nie przejdą same na docelowy adres.

---

## Metoda A (zalecana): lokalny serwer na komputerze + własny certyfikat (mkcert)

Wszystko odbywa się w Twojej sieci Wi-Fi. Opis dla macOS; na Windows/Linux kroki są takie same, różni się tylko instalacja mkcert (`choco install mkcert` / pakiet dystrybucji).

### 1. Komputer: zbuduj aplikację

```bash
git clone https://github.com/forty0f/Silkapp && cd Silkapp
git checkout claude/fbw-pwa-app
npm install
npm run build
```

### 2. Komputer: wygeneruj certyfikat

```bash
brew install mkcert nss
mkcert -install                       # tworzy lokalny urząd certyfikacji (CA)
scutil --get LocalHostName            # np. MacBook-Pro  → adres: MacBook-Pro.local
ipconfig getifaddr en0                # np. 192.168.1.23 (zapasowo)
mkdir -p certs
mkcert -cert-file certs/cert.pem -key-file certs/key.pem MacBook-Pro.local 192.168.1.23 localhost
```

Używaj nazwy `*.local`, a nie adresu IP. IP z routera może się zmienić, a nowy adres oznacza pustą bazę w aplikacji. Katalog `certs/` jest w `.gitignore`.

### 3. Komputer: uruchom serwer HTTPS

```bash
npm run preview:lan
# → https://MacBook-Pro.local:4443
```

Jeśli macOS zapyta o połączenia przychodzące dla `node`, zezwól (tylko sieć prywatna).

### 4. iPhone: zaufaj certyfikatowi testowemu

1. Na komputerze: `open "$(mkcert -CAROOT)"` i prześlij plik **`rootCA.pem`** na iPhone'a przez AirDrop. **Nigdy nie wysyłaj `rootCA-key.pem`.**
2. iPhone: **Ustawienia → Pobrano profil → Zainstaluj**.
3. iPhone: **Ustawienia → Ogólne → To urządzenie → Ustawienia zaufania certyfikatów** → włącz pełne zaufanie dla „mkcert …”.

### 5. iPhone: zainstaluj aplikację

1. iPhone i komputer w tej samej sieci Wi-Fi.
2. Otwórz **Safari**: `https://MacBook-Pro.local:4443`. Kłódka bez ostrzeżeń oznacza, że wszystko jest dobrze.
3. **Udostępnij → Do ekranu początkowego → Dodaj**.
4. Uruchom aplikację z ikony i przejdź raz przez wszystkie zakładki (Trening, Historia, Progres, Atlas, Ustawienia).
5. Sprawdź offline: włącz tryb samolotowy, zamknij aplikację z przełącznika aplikacji i uruchom ją ponownie z ikony. Aplikacja powinna działać, a serwer na komputerze nie jest już potrzebny.

### 6. Aktualizacje wersji testowej

Na komputerze: `git pull && npm run build && npm run preview:lan`. Na iPhonie otwórz aplikację przy włączonym serwerze, wejdź na dowolny ekran poza treningiem i stuknij **„Odśwież”** w monicie o nowej wersji. Dane zostają.

### 7. Sprzątanie po testach

- iPhone: **Ustawienia → Ogólne → VPN i zarządzanie urządzeniami** → usuń profil mkcert.
- Komputer: `mkcert -uninstall`. Usuń `certs/` i katalog z `mkcert -CAROOT`.
- Zaufany lokalny CA pozwala wystawić certyfikat dla dowolnej domeny. Nie zostawiaj go na stałe i nie udostępniaj klucza.

---

## Metoda B: Tailscale Serve (prywatna sieć, prawdziwy certyfikat)

Przydatna, gdy chcesz testować poza domową siecią Wi-Fi. Wymaga darmowego konta Tailscale i aplikacji Tailscale na komputerze i iPhonie. Adres jest dostępny **tylko dla urządzeń z Twojej sieci Tailscale**. Nazwa maszyny trafia jednak do publicznego rejestru certyfikatów (Certificate Transparency).

```bash
npm run build
npm run preview                       # http://localhost:4173
tailscale serve --bg 4173             # → https://<komputer>.<tailnet>.ts.net
```

Na iPhonie (z włączonym Tailscale) otwórz ten adres w Safari i zainstaluj jak w kroku 5 metody A. Wyłączenie: `tailscale serve --https=443 off`.

---

## Czego nie robić bez decyzji

- Tunele typu `ngrok` / `cloudflared` z publicznym adresem udostępniają aplikację każdemu, kto zna link — to w praktyce publikacja.
- Wersja przez `http://192.168.x.x:4173` otworzy się, ale bez trybu offline i bez instalacji jako PWA.

## Ważne o danych

- Dane są przypisane do **dokładnego adresu** (protokół + host + port), np. `https://MacBook-Pro.local:4443`. Inny adres (docelowy hosting, inna nazwa, inny port, adres IP) to osobna, pusta baza.
- Aplikacja zainstalowana na ekranie początkowym ma inne dane niż ta sama strona otwarta w Safari. Używaj ikony.
- Przed przejściem na docelowy adres: **Ustawienia → Eksportuj dane → Zapisz plik → Zapisz w Plikach**, a potem w nowej instalacji **Importuj z pliku**.
- Po testach przejdź listę [`IOS_MANUAL_CHECKLIST.md`](IOS_MANUAL_CHECKLIST.md) i zapisz wyniki.
