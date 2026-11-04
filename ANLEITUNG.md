# Anleitung: So kommt eure Einladung online

Alles ist gratis. Du brauchst zwei Konten: **Supabase** (die Datenbank) und **GitHub** (dort liegt die Webseite). Rechne mit etwa 30–45 Minuten.

1. [Supabase-Projekt erstellen und Datenbank einrichten](#schritt-1-supabase-projekt-erstellen-und-datenbank-einrichten)
2. [Gast-Code und Adresse einrichten](#schritt-2-gast-code-und-adresse-einrichten)
3. [URL und Key in config.js eintragen](#schritt-3-url-und-key-in-configjs-eintragen)
4. [Lokal testen](#schritt-4-lokal-testen-mit-live-server)
5. [Auf GitHub hochladen und GitHub Pages einschalten](#schritt-5-auf-github-hochladen-und-github-pages-einschalten)
6. [Anmeldungen und Snacks anschauen](#schritt-6-anmeldungen-und-snacks-anschauen)

---

## Was ist was?

| Datei | Wozu |
|---|---|
| `index.html` | Die Einladung: alle Texte und der Aufbau. Texte kannst du hier direkt ändern. |
| `style.css` | Das Aussehen: Farben, Schriften, Schlüssel, Lichterkette. |
| `app.js` | Die Logik: Login, Anmeldung, Snack-Liste, Meldungen. |
| `config.js` | Deine Verbindung zu Supabase – hier trägst du 2 Werte ein. |
| `supabase/setup.sql` | Baut die Datenbank samt Sicherheitsregeln. |
| `.github/workflows/wachhalten.yml` | Hält das Gratis-Projekt wach (läuft von selbst). |
| `og-image.jpg`, `favicon.svg` | Vorschaubild für WhatsApp und Symbol im Browser-Tab. |

## So funktioniert die Sicherheit

- Gäste öffnen den Link und geben euren **Code** ein. Supabase prüft ihn auf dem Server – im Code der Webseite steht er nirgends.
- Erst nach dem Login gibt die Datenbank **Adresse** und **Snack-Liste** heraus.
- Gäste können sich eintragen, die **Gästeliste aber nicht lesen**. Wer was mitbringt, seht nur ihr.
- Über die Webseite lässt sich nichts löschen oder ändern. Ein Snack kann nur übernommen werden, solange er frei ist – klicken zwei gleichzeitig, bekommt ihn nur der Erste.
- Ehrlich gesagt: Die Seite selbst (Datum, Texte, Design) ist auf GitHub öffentlich einsehbar. Geschützt sind Adresse, Gästeliste und Snacks – und genau die liegen hinter dem Code.

---

## Schritt 1: Supabase-Projekt erstellen und Datenbank einrichten

1. Öffne **https://supabase.com** → **Start your project** und melde dich an (am einfachsten mit **Continue with GitHub**).
2. Klick auf **New project** und fülle aus:
   - **Project name:** z. B. `einweihung`
   - **Database Password:** auf **Generate a password** klicken und das Passwort sicher aufbewahren (für die Webseite brauchst du es nicht).
   - **Region:** etwas in Europa, z. B. Zürich oder Frankfurt.
   - Alles andere so lassen, wie es ist → **Create new project**. Nach 1–2 Minuten ist das Projekt bereit.
3. Links im Menü **SQL Editor** öffnen → **New query** (oder das **+**).
4. In VS Code die Datei `supabase/setup.sql` öffnen, alles markieren (**Ctrl+A**), kopieren (**Ctrl+C**) und im SQL Editor einfügen (**Ctrl+V**).
5. Unten rechts auf **Run** klicken. Falls Supabase warnt, die Abfrage enthalte „destructive operations“, bestätige mit **Run this query** – das liegt nur an den Zeilen, die alte Regeln ersetzen.
6. Unten erscheint **Success. No rows returned**. 🎉

> Du kannst `setup.sql` jederzeit nochmals ausführen – es geht nichts kaputt, und die Start-Snacks werden nicht doppelt angelegt.

## Schritt 2: Gast-Code und Adresse einrichten

### 2a) Das gemeinsame Gast-Konto anlegen

Alle Gäste loggen sich mit demselben Code ein. Für Supabase ist das ein einziges Benutzerkonto.

1. Links **Authentication** → **Users** → **Add user** → **Create new user**.
2. **Email:** `gast@example.com` – genau so. Es werden keine Mails verschickt; die Adresse muss nur gleich sein wie in `config.js` und `setup.sql`.
3. **Password:** euer Party-Code.
4. **Auto Confirm User** angehakt lassen → **Create user**.

**Tipps für den Code**
- Mindestens 8 Zeichen und keine Umlaute (die sind auf manchen Handys mühsam).
- Nichts, was Fremde leicht erraten: Nachname plus Jahreszahl errät jeder, der euch kennt. Besser zwei, drei Wörter mit einer Zahl, z. B. `Punsch-Kerze-58`.
- Code später ändern? Gast-Konto löschen (rechts in der Zeile **⋯ → Delete user**) und mit neuem Code neu anlegen. Danach müssen alle den neuen Code eingeben.

> Lehnt Supabase `gast@example.com` ab, nimm eine andere Adresse (sie muss nicht existieren, nur wie eine E-Mail aussehen) und trag sie an **zwei** Stellen ein: in `config.js` bei `guestEmail` und in `supabase/setup.sql` in Abschnitt 1. Danach `setup.sql` nochmals ausführen.

### 2b) Selbst-Registrierung ausschalten (wichtig!)

Sonst könnte sich jemand mit etwas Technikwissen ein eigenes Konto anlegen. Die Datenbank würde fremde Konten zwar ohnehin abweisen – doppelt hält besser.

1. Links **Authentication** → **Sign In / Providers** (bei älteren Versionen: **Providers** oder **Settings**).
2. **Allow new users to sign up** ausschalten → **Save**.

### 2c) Adresse eintragen

Die Adresse steht absichtlich in **keiner** Datei, denn die Dateien sind auf GitHub öffentlich.

1. Links **Table Editor** → Tabelle **party_info**.
2. In der einzigen Zeile auf das Feld **address** doppelklicken und eure Adresse eintragen, z. B. `Musterstrasse 1, 8000 Zürich`. Das Komma wird auf der Seite zum Zeilenumbruch.
3. Optional ins Feld **note** einen Hinweis schreiben, z. B. `2. Stock, bitte bei «Name» klingeln`.
4. Mit **Save** speichern.

Gäste sehen die Adresse erst nach dem Login, mit einem Knopf **Route planen** (öffnet Google Maps).

**Optional – eine kleine Überraschung:** Was im Feld **surprise** steht, erscheint nach dem Login als Karte „Psst … noch etwas“ mit einem Schlüsselbund. Die erste Zeile wird zur Überschrift, der Rest zum Text. Bleibt das Feld leer, gibt es keine Karte. Auch dieser Text steht in keiner öffentlichen Datei.

## Schritt 3: URL und Key in config.js eintragen

1. In Supabase oben auf **Connect** klicken – oder links unten **⚙ Project Settings** → **API Keys**.
2. Kopiere diese zwei Werte:
   - **Project URL**, sieht so aus: `https://abcdefghijklmnop.supabase.co`
   - **Publishable key**, beginnt mit `sb_publishable_…`
     (Siehst du stattdessen einen **anon public**-Key, der mit `eyJ…` anfängt: Der funktioniert genauso.)
3. In VS Code `config.js` öffnen und die Platzhalter ersetzen. Die Anführungszeichen bleiben stehen:
   ```js
   supabaseUrl: "https://abcdefghijklmnop.supabase.co",
   supabaseKey: "sb_publishable_xxxxxxxxxxxxxxxxxxxx",
   ```
4. Speichern (**Ctrl+S**).

**Warum darf dieser Key öffentlich sein?**
Der Publishable Key (früher „anon key“) ist wie eine Hausnummer: Er sagt nur, *wo* eure Datenbank steht. Was man dort darf, bestimmen die Regeln aus `setup.sql` (Row Level Security) – und ohne Gast-Code darf man gar nichts. Genau für Webseiten ist dieser Key gemacht.

⚠️ **Niemals** in eine Datei oder ins Internet: den **Secret key** (`sb_secret_…`) bzw. den alten **service_role**-Key und das Datenbank-Passwort. Die haben volle Rechte – für diese Seite brauchst du sie nicht.

## Schritt 4: Lokal testen (mit Live Server)

Live Server ist in deinem VS Code schon installiert.

1. Im Explorer von VS Code Rechtsklick auf `index.html` → **Open with Live Server**. Der Browser öffnet `http://127.0.0.1:5500`.
2. Probier alles einmal aus:
   - Code eingeben → der Schlüssel dreht sich, die Einladung erscheint, die Adresse steht drin.
   - Dich zur Probe anmelden.
   - Einen Snack antippen und übernehmen.
   - Die Seite in einem zweiten Fenster öffnen (z. B. Inkognito, **Ctrl+Shift+N**) und dort einloggen: Übernimmst du im einen Fenster einen Snack, verschwindet er im anderen von selbst.
3. Danach die Testeinträge in Supabase löschen (siehe Schritt 6), sonst stehst du doppelt auf der Liste.

> **Vorschau ohne Supabase:** Solange in `config.js` noch Platzhalter stehen, läuft die Seite im Vorschau-Modus. Du kommst mit einem beliebigen Code rein, und nichts wird gespeichert. Mit `index.html#vorschau` springst du direkt zur Einladung.

**Auf dem Handy testen (optional):** PC und Handy im selben WLAN → am PC im Terminal `ipconfig` eintippen und die **IPv4-Adresse** ablesen (z. B. `192.168.1.23`) → auf dem Handy `http://192.168.1.23:5500` öffnen. Fragt Windows, ob es Verbindungen erlauben soll: für private Netzwerke erlauben.

## Schritt 5: Auf GitHub hochladen und GitHub Pages einschalten

Wichtig: Für Gratis-GitHub-Pages muss das Repository **öffentlich** sein. Darum stehen Adresse und Code nirgends in den Dateien.

### 5a) Hochladen

**Variante A – direkt aus VS Code (empfohlen)**
1. Links das Symbol **Source Control** (oder **Ctrl+Shift+G**) → **Publish to GitHub**.
   Fragt VS Code, ob es sich bei GitHub anmelden darf: **Allow** und im Browser bestätigen.
2. Wähle **Publish to GitHub public repository** und gib als Namen `einweihung` ein.
3. Alle Dateien angehakt lassen → **OK**. Fertig – unten rechts erscheint ein Link zum Repository.

**Variante B – im Browser**
1. **https://github.com/new** öffnen → Name `einweihung`, **Public** → **Create repository**.
2. Auf der neuen Seite **uploading an existing file** anklicken.
3. Den **Inhalt** des Projektordners ins Fenster ziehen (alle Dateien und die Ordner `supabase` und `.github`) → **Commit changes**.
   Falls der Ordner `.github` nicht mitkommt: nicht schlimm, dann fehlt nur der automatische Wachhalter.

### 5b) GitHub Pages einschalten

1. Im Repository oben **Settings** → links **Pages**.
2. Bei **Source** *Deploy from a branch* wählen, bei **Branch** `main` und `/ (root)` → **Save**.
3. Nach 1–2 Minuten ist die Seite online unter
   **https://yannickluca.github.io/einweihung/**
   (der Link erscheint auch oben auf der Pages-Seite).

### 5c) WhatsApp-Vorschau prüfen

In `index.html` (Zeile mit `og:image`) steht bereits `https://yannickluca.github.io/einweihung/og-image.jpg`. Heisst dein Repository anders, passe dort `einweihung` an.
Schick dir dann den Link selbst per WhatsApp: Es sollte ein Kärtchen mit dem goldenen Schlüssel erscheinen. WhatsApp merkt sich Vorschauen eine Weile – teste also erst, wenn alles fertig ist.

### Später etwas ändern?

Datei in VS Code ändern und speichern → **Source Control** → kurze Nachricht eintippen (z. B. „Text angepasst“) → **Commit** → **Sync Changes**. Nach etwa einer Minute ist die Änderung online.

## Schritt 6: Anmeldungen und Snacks anschauen

Alles im Supabase-Dashboard unter **Table Editor**:

- **guests:** alle Anmeldungen mit Name, Anzahl Personen, Nachricht und Zeitpunkt.
- **snacks:** In der Spalte **claimed_by** steht, wer was mitbringt. Leer heisst: noch frei.

**Wie viele Leute kommen?** Im **SQL Editor** → **New query**:

```sql
select count(*) as anmeldungen, sum(persons) as personen from guests;
```

**Korrigieren** (direkt im Table Editor):
- Snack wieder freigeben: bei **claimed_by** und **claimed_at** den Inhalt löschen (auf `NULL` setzen) → Save.
- Doppelte Anmeldung löschen: Zeile anhaken → **Delete**.
- Neuen Snack auf die Liste setzen: **Insert → Insert row**, nur **name** ausfüllen → Save.

---

## Gut zu wissen

- **Gratis-Projekte schlafen ein:** Supabase pausiert Gratis-Projekte nach 7 Tagen ohne Aktivität. Dafür gibt es `.github/workflows/wachhalten.yml`: GitHub stupst Supabase alle 3 Tage kurz an. Ob das klappt, siehst du im Repository unter **Actions** – dort kannst du es mit **Run workflow** auch von Hand starten. Schickt dir GitHub eine Mail, dass „Supabase wachhalten“ fehlgeschlagen ist, schau ins Supabase-Dashboard: Bei einem pausierten Projekt reicht ein Klick auf **Restore project**.
- **Einmal einloggen reicht:** Gäste bleiben auf ihrem Handy eingeloggt. „Abmelden“ unten auf der Seite meldet nur das eigene Gerät ab.
- **Suchmaschinen:** Die Seite bittet Google & Co., sie nicht aufzunehmen.
- **Hinweise im Security Advisor:** Zeigt Supabase unter **Advisors** Warnungen zu `claim_snack` oder `add_snack` („security definer“), ist das so gewollt: Diese zwei Funktionen prüfen selbst, ob jemand Gast ist, und erlauben nur genau ihre eine Aufgabe.
- **Nach der Party:** Repository löschen (Settings → ganz unten **Delete this repository**) und das Supabase-Projekt löschen (Project Settings → General → **Delete project**). Dann ist alles weg.
