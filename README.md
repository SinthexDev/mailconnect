# MailConnect

MailConnect verbindet IMAP- und SMTP-Konten mit einem lokalen Suchindex und einer MCP-Schnittstelle. Agenten können den Index durchsuchen, Nachrichten vom Server laden, markieren, verschieben, kopieren und löschen, Ordner verwalten und, wenn SMTP eingerichtet ist, senden.

Die Registrierung ist nur mit Einladung möglich. Der erste Admin entsteht über die Bootstrap-CLI. Die öffentliche Startseite erklärt den Ablauf, die Versionsliste liegt in [`_documentation/CHANGELOG.md`](_documentation/CHANGELOG.md).

## Sicherheit

- Datenbankdatei inklusive Index: SQLCipher, Schlüssel ist `MAILCONNECT_MASTER_KEY` (32 Bytes, nur in der Umgebung). Eine ältere Klartext-Datei wird beim Start verschlüsselt.
- Passwörter der Benutzer: Argon2id
- IMAP-/SMTP-Geheimnisse: AES-256-GCM mit demselben Schlüssel
- API-Tokens und Sitzungen: nur als SHA-256-Hash, das Geheimnis wird einmal angezeigt
- Transport zu den Mailservern: TLS 1.2+ (implizit oder STARTTLS)
- `.env`, SQLite-Dateien und Schlüssel gehören nicht ins Git

Ohne `MAILCONNECT_MASTER_KEY` lassen sich gespeicherte Postfach-Passwörter nicht wieder entschlüsseln. Den Schlüssel sichern, nicht rotieren ohne Neuverschlüsselung.

## Lokaler Start

```bash
cp .env.example .env
# Schlüssel erzeugen und in .env eintragen
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

npm install
npm run build
export $(grep -v '^#' .env | xargs)
node release/server.cjs bootstrap-admin
node release/server.cjs
```

`MAILCONNECT_ADMIN_EMAIL` und `MAILCONNECT_ADMIN_PASSWORD` (mindestens 12 Zeichen) müssen für den Bootstrap gesetzt sein. Entwicklung ohne Release-Build: `npm run dev` startet API und Oberfläche. Die Oberfläche liegt unter `/mailconnect/`.

## Postfächer und Index

Ein Konto braucht IMAP, SMTP oder beides. SMTP-only Konten werden nicht indiziert.

Nach dem Speichern eines IMAP-Kontos liest ein Worker Ordner und neue UIDs ein. Im Index liegen Metadaten, Flags und ein Textausschnitt (etwa 500 Zeichen), plus Volltextsuche über SQLite FTS5. Die Datenbankdatei ist verschlüsselt; die Suche läuft im Prozess, der sie geöffnet hat. Der vollständige Body wird erst beim Öffnen per IMAP geladen. Der Abgleich läuft direkt nach dem Anlegen und danach etwa alle zwei Minuten. Schlägt ein Server fehl, wartet der Worker mit wachsendem Abstand (höchstens 30 Minuten).

Die Anbieterliste in `data/providers/de-eu.json` füllt Host und Port für verbreitete Dienste in Deutschland und Europa vor. Zugangsdaten trägst du selbst ein. Gmail, Microsoft, Yahoo und iCloud brauchen in der Regel ein App-Passwort. Proton Mail Bridge funktioniert nur auf demselben Rechner wie MailConnect.

## MCP

Endpunkt: `APP_BASE_URL` + `/mcp`, zum Beispiel `https://example.com/mailconnect/mcp`.

Authentifizierung: `Authorization: Bearer <token>`. Den Token legst du in der Oberfläche unter „Agent-Tokens“ an.

Werkzeuge:

- `list_mailboxes` (mit Beschreibung und Handlungsanweisungen für Agenten)
- `get_index_stats`
- `list_folders` (mit `parent` nur die direkten Unterordner, leerer `parent` nur die oberste Ebene)
- `list_imap_folders` (dieselbe Auswahl, direkt vom Server)
- `folder_status`
- `create_folder`, `rename_folder`, `delete_folder`, `set_folder_subscription`
- `search_messages` (optional nach Markierung, zum Beispiel `\Flagged`)
- `search_imap`
- `get_message` (Text, Button-Links aus dem HTML, Anhänge mit Dateiname und Teil-ID)
- `get_attachment` (lädt die Datei, zum Beispiel eine PDF-Rechnung)
- `set_message_flags`, `move_messages`, `copy_messages`, `delete_messages`
- `append_message` (RFC822 bis 28 MB)
- `send_email` (Absendername ist der Anzeigename des Postfachs, optional `fromName` mit höchstens 100 Zeichen; Anhänge als Base64, höchstens 10 Dateien, zusammen 20 MB; danach dieselbe Nachricht im Ordner Gesendet, steuerbar mit `saveToSent`)
- `sync_mailbox` (stößt den Abgleich an, ohne mailboxId für alle eigenen Postfächer)
- `list_mailbox_webhooks`, `set_mailbox_webhooks` (Adresse, Methode, Schlüssel und Header; die Liste ersetzt die bisherige)
- `set_webhook_folders` (pro Webhook die Ordner, die ihn nicht auslösen; leer heißt alle Ordner)
- `list_mailbox_signatures`, `save_mailbox_signature`, `delete_mailbox_signature` (eine Standard-Signatur und weitere, Typ plain oder html, Titel und Handlungsanweisungen)

Beispiel für Cursor:

```json
{
  "mcpServers": {
    "mailconnect": {
      "url": "https://example.com/mailconnect/mcp",
      "headers": {
        "Authorization": "Bearer DEIN_TOKEN"
      }
    }
  }
}
```

## Selbst hosten

Die Anwendung hört auf `127.0.0.1` und einem Port (`PORT`, Standard 3911). Davor gehört ein TLS-Reverse-Proxy. Beispiele stehen in `deploy/apache-mailconnect.conf.example` und `deploy/nginx-mailconnect.conf.example`.

Pflichtvariablen stehen in `.env.example`. `APP_BASE_PATH` muss zum öffentlichen Pfad passen, zum Beispiel `/mailconnect`.

Für ein Deployment per SSH kopierst du `deploy/deploy.env.example` nach `deploy/deploy.env` und trägst Host, Zielverzeichnis, Node-Pfad und öffentliche Adresse ein. Die Datei bleibt lokal und wird nicht committet. `scripts/deploy.sh` baut dann das Release, kopiert es in `<Zielverzeichnis>/app`, legt beim ersten Mal `.env` und den Admin an und lässt `deploy/ensure.sh` per Cron den Prozess neu starten. `deploy/sync.sh` prüft jede Minute die Postfächer. Ein bereits eingelesenes Konto schaut nur nach neuen Nachrichtennummern. Der Node-Prozess liegt außerhalb des Document-Roots. Lässt sich die vHost-Konfiguration nicht ändern, übernimmt der PHP-Weiterleiter in `deploy/public` die Weitergabe an den lokalen Port; dafür trägst du `DEPLOY_PUBLIC_ROOT` ein. Am Postfach lassen sich bis zu fünf https-Webhooks hinterlegen, jeweils mit Methode, Schlüssel und Header, in der Oberfläche oder über `set_mailbox_webhooks`. Die feuern, wenn nach dem ersten Einlesen neue Post ankommt.

## Tests

```bash
npm test
```

## Lizenz

MIT, siehe [LICENSE](LICENSE).
