# MailConnect – Änderungen

## Version 1.1.43 - 20. Oktober 2026
### Signaturvorschau steht rechts

Die Vorschau öffnete einen eigenen Tab ohne Weg zurück.

#### Verbesserungen

- **Signaturen**: Ein Klick auf einen Eintrag zeigt den Text rechts daneben, Plain Text und HTML. Die eigene Seite behält einen Link zurück zu den Signaturen des Postfachs.

---

## Version 1.1.42 - 19. Oktober 2026
### Signaturen für Agents

Signaturen lagen bisher nur im Mailtext, den ein Agent selbst schreiben musste. Es gab keinen Ort, sie zu hinterlegen oder anzusehen.

#### Neue Funktionen

- **Signaturen**: Pro Postfach eine Standard-Signatur und bis zu 50 weitere. Jede hat einen Titel, den Typ Plain Text oder HTML, den Text und Handlungsanweisungen. Agents legen sie mit `save_mailbox_signature` an, lesen sie mit `list_mailbox_signatures` und entfernen sie mit `delete_mailbox_signature`.
- **Ansehen**: Im Postfach unter Signaturen öffnet „Ansehen“ den Text in einem neuen Tab. HTML wird dargestellt, ohne Skripte auszuführen. Plain Text bleibt Zeilenumbruch für Zeilenumbruch.

---

## Version 1.1.41 - 19. Oktober 2026
### Gesendet lässt sich steuern

Die Kopie nach dem Senden lag immer an, ohne Schalter und ohne eigenen Ordnernamen. Die Antwort hieß noch `saved`. `append_message` nahm nur 1 MB an.

#### Verbesserungen

- **Versand**: `saveToSent` steuert die Kopie. Standard ist an, außer das Postfach sagt, der Server speichert selbst. Die abgelegte Nachricht sind dieselben Bytes wie beim Versand, mit `\\Seen`. Die Antwort nennt `sentFolder`, `sentUid`, `savedToSent` und bei einem Fehler `saveError`. Der Versand bleibt gültig, wenn nur das Ablegen scheitert.
- **Postfach**: Eigener Gesendet-Ordner und der Schalter „Der Server speichert Gesendet selbst“, in der Oberfläche unter Verbindung.
- **Nachrichten**: `append_message` nimmt eine RFC822-Nachricht bis 28 MB an. Eine vorhandene Kopie ersetzt man, indem man sie mit `delete_messages` löscht und die vollständige Nachricht neu ablegt.

---

## Version 1.1.40 - 19. Oktober 2026
### Gesendete Mails landen im Ordner Gesendet

Eine Mail über MCP ging nur über SMTP raus. Im Postfach war sie danach nicht zu sehen.

#### Verbesserungen

- **Versand**: Nach dem Senden legt MailConnect die Mail im Ordner Gesendet ab und in den Index. Fehlt der Ordner, wird Sent angelegt. Die Antwort nennt `sentFolder` und `saved`.

---

## Version 1.1.39 - 18. Oktober 2026
### Ordner-Auswahl spricht von Ausschlüssen

Die Ordnerliste im Webhook-Fenster benutzte Häkchen für „enthalten“.

#### Verbesserungen

- **Webhook**: Jede Zeile zeigt ein × für ausgeschlossen. Ohne × ist der Ordner aktiv. Der Hinweistext spricht von Ausschlüssen. Ausgeschlossene Ordner sind durchgestrichen.

---

## Version 1.1.38 - 18. Oktober 2026
### Ordner gehören zum einzelnen Webhook

Die Ordnerliste stand auf der Postfachseite, für alle Webhooks gleich.

#### Verbesserungen

- **Webhook**: Welche Ordner still bleiben, stellt man im Fenster des jeweiligen Webhooks ein. Ohne Haken steht dort „ausgeschlossen“.
- **Postfach**: Neben dem Hauptmenü liegen die Bereiche Allgemein, Verbindung und Webhooks.
- **MCP**: `set_webhook_folders` gilt für einen Webhook, erkannt an seiner Adresse.

---

## Version 1.1.37 - 18. Oktober 2026
### Webhooks lassen sich pro Ordner ausschalten

Neue Post hat in jedem Ordner den Webhook ausgelöst.

#### Verbesserungen

- **Ordner**: Am Postfach sind alle Ordner angehakt. Ein Haken weniger nimmt den Ordner aus. Unterordner bleiben eigene Einträge.
- **MCP**: `set_webhook_folders` setzt diese Liste. `list_mailbox_webhooks` zeigt sie als `excludedFolders`.

---

## Version 1.1.36 - 18. Oktober 2026
### Der Agent trägt Webhooks selbst ein

Webhooks ließen sich nur in der Oberfläche speichern.

#### Verbesserungen

- **MCP**: `set_mailbox_webhooks` ersetzt die Webhooks eines Postfachs. `list_mailbox_webhooks` zeigt Adresse, Methode und Header, den Schlüssel nur als gesetzt oder nicht.

---

## Version 1.1.35 - 18. Oktober 2026
### Der Webhook bleibt gespeichert

Der Knopf im Fenster hat den Webhook nur in der Seite gehalten. Nach dem Verlassen war er weg.

#### Behoben

- **Webhook**: Speichern schreibt den Webhook sofort ans Postfach. Entfernen ebenfalls.

---

## Version 1.1.34 - 18. Oktober 2026
### Anbieter-Hinweise sehen nicht mehr wie Fehler aus

Der Hinweis zum Benutzernamen stand in Koralle unter dem Anbieter und wirkte wie eine Fehlermeldung.

#### Verbesserungen

- **Hinweis**: Ruhiges Marineblau, kleinere Schrift. Fehler bleiben rot.

---

## Version 1.1.33 - 18. Oktober 2026
### Der Webhook-Knopf sitzt unter dem Text

Der Plus-Knopf stand rechts neben der Überschrift und klebte am Satz darunter.

#### Behoben

- **Webhook**: Überschrift, Erklärung und Knopf stehen untereinander, mit Abstand dazwischen.

---

## Version 1.1.32 - 18. Oktober 2026
### Webhooks mit Methode, Schlüssel und Header

Ein Webhook war nur eine Adresse und ging immer als POST hinaus. Cursor braucht dazu den Schlüssel und den Authorization-Header.

#### Verbesserungen

- **Webhook**: Über den Plus-Knopf öffnet sich ein Fenster. Dort stehen Methode (POST, PUT oder PATCH), Adresse, Schlüssel und Header. Der Schlüssel geht als Bearer mit, solange der Header keinen eigenen Authorization-Wert setzt.

---

## Version 1.1.31 - 18. Oktober 2026
### Jede Minute prüfen, und Webhooks bei neuer Post

Der Abgleich lief nur im Prozess, etwa alle zwei Minuten. Ein Bot erfuhr von neuer Post erst, wenn er selbst nachsah.

#### Neue Features

- **Cron**: Jede Minute stößt ein Cron-Lauf die Prüfung an. Ein Postfach, das schon eingelesen ist, schaut nur nach neuen Nachrichtennummern. Der erste große Lauf bleibt wie bisher im Hintergrund.
- **Webhooks**: Am Postfach stehen bis zu fünf https-Adressen. Kommt nach dem ersten Einlesen neue Post an, ruft MailConnect sie mit Absender, Betreff und Index-ID auf. Der erste Lauf meldet die alten Mails nicht.

---

## Version 1.1.30 - 18. Oktober 2026
### Der Agent stößt den Abgleich an

Neue Mails kamen manchmal nicht von allein im Index an. Der Agent konnte den Abgleich nicht zuverlässig starten.

#### Verbesserungen

- **Abgleich**: `sync_mailbox` startet den Abgleich. Ohne Postfach gilt das für alle eigenen Konten, die nicht gestoppt sind. Ein genanntes Postfach läuft auch nach Stoppen wieder an. Die Antwort nennt den Stand. Die Suche danach sieht die neuen Mails, sobald der Lauf sie geholt hat.

---

## Version 1.1.29 - 17. Oktober 2026
### Der Absendername kommt aus dem Postfach

Beim Versand stand nur die Adresse. Ein Name wie „Vanessa | Sinthex“ fehlte.

#### Neue Features

- **Absender**: Der Anzeigename des Postfachs steht beim Senden vor der Adresse. `fromName` überschreibt ihn für eine einzelne Mail, höchstens 100 Zeichen.

---

## Version 1.1.28 - 17. Oktober 2026
### Die Versionsnummer steht in der Anwendung

In der angemeldeten Oberfläche war nicht zu sehen, welche Version läuft.

#### Verbesserungen

- **Version**: Unter dem Namen in der Seitenleiste steht die Versionsnummer. Sie führt zur Änderungsliste.

---

## Version 1.1.27 - 17. Oktober 2026
### Der Agent verschickt Anhänge

Eine Mail ging nur als Text hinaus. Dateien wie ein Mockup oder eine ZIP kamen nicht mit.

#### Neue Features

- **Versand**: `send_email` nimmt bis zu 10 Anhänge als Base64. Zusammen dürfen sie 20 MB nicht überschreiten. Die Antwort nennt `messageId` und `attachmentCount`.

---

## Version 1.1.26 - 15. Oktober 2026
### Button-Links kommen beim Agenten an

Eine Mail zum Zurücksetzen des Passworts hat den Link oft nur im HTML-Button. Der Agent sah den Satz, aber nicht die Adresse.

#### Behoben

- **Lesen**: `get_message` liefert `links` mit dem Ziel und der Beschriftung. Steht die Adresse nicht im reinen Text, hängt sie unten am Text an. In der Suche steht sie als Link unter der Nachricht.

---

## Version 1.1.25 - 15. Oktober 2026
### Der Agent arbeitet im Postfach

Suchen, Lesen und Senden gingen schon. Löschen, Verschieben, Markieren und die Ordner selbst gingen nur am Mailserver.

#### Neue Features

- **Nachrichten**: `delete_messages` löscht Mails, `move_messages` und `copy_messages` legen sie in einen anderen Ordner. `set_message_flags` setzt, ergänzt oder entfernt Markierungen wie gelesen oder wichtig. `append_message` legt eine Mail in einen Ordner, zum Beispiel Entwürfe.
- **Ordner**: `list_folders` und `list_imap_folders` listen auf Wunsch nur die direkten Unterordner. Anlegen, Umbenennen, Löschen und Abonnieren hat eigene Werkzeuge. `folder_status` nennt Anzahl und ungelesene Nachrichten.
- **Suche**: `search_messages` filtert nach einer Markierung. `search_imap` sucht direkt auf dem Server und liefert UIDs.
- **Index**: Nach dem Eingriff stimmen Ordner, UID und Markierungen im Suchindex mit dem Server überein.

---

## Version 1.1.24 - 9. Oktober 2026
### Der Agent-Token kommt am Connector an

Ein Client hat den Token geschickt und bekam trotzdem „Bearer-Token erforderlich“. Der Authorization-Header blieb unterwegs hängen.

#### Behoben

- **MCP**: Der Proxy reicht den Authorization-Header weiter. Derselbe Token gilt auch im Header X-Api-Key. Fehlt der Token, bleibt die Meldung „Bearer-Token erforderlich“. Ein falscher Token heißt jetzt „Token ungültig“.

---

## Version 1.1.23 - 9. Oktober 2026
### Token erstellen zeigt sofort, dass es läuft

Mehrere Klicks legten mehrere Token an, weil der Button sich nicht verändert hat.

#### Behoben

- **Token**: Der Knopf zeigt sofort einen drehenden Kreis und „Token wird erstellt …“. Weitere Klicks zählen nicht mit. Danach springt die Seite zum neuen Geheimnis, und der Token steht in der Liste.

---

## Version 1.1.22 - 9. Oktober 2026
### Die Token-Seite zeigt die MCP-Adresse

Die Adresse stand nur nach dem Erstellen eines Tokens. Jetzt liegt sie immer da, mit einer kurzen Anleitung.

#### Verbesserungen

- **MCP**: Die Adresse lässt sich kopieren, darunter steht die Cursor-Konfiguration mit einem Platzhalter für das Token.
- **Anleitung**: Drei kleine Zeichnungen erklären Adresse, Token und was der Agent danach tun kann.

---

## Version 1.1.21 - 9. Oktober 2026
### Der Abgleich lässt sich stoppen und zählt mit

Der Kreis im Button stand still, der Balken war weg, und man sah nicht, wie viele Mails und Ordner schon drin sind.

#### Verbesserungen

- **Stoppen**: Während der Synchronisation wird der Button zu „Stoppen“. Der Kreis darin dreht sich. Danach bleibt der Stand stehen, bis du wieder startest.
- **Fortschritt**: Ein Balken zeigt, wie viel vom Postfach schon im Index ist. Darunter steht, wie viele Mails von allen und wie viele Ordner von allen schon eingelesen sind. Die Zahlen steigen mit, während neue Nachrichten ankommen.

---

## Version 1.1.20 - 9. Oktober 2026
### Ein kaputter Ordner stoppt nicht mehr das ganze Postfach

Die Verbindung zu Sinthex war in Ordnung. Drei Ordner mit Umlaut im Namen lassen sich nicht öffnen, und der Abgleich hat deshalb gar nichts gespeichert.

#### Behoben

- **Abgleich**: Ordner, die der Server nicht öffnet, werden übersprungen. Der Rest wird eingelesen.
- **Fortschritt**: Im Button dreht sich ein Kreis, solange synchronisiert wird.

---

## Version 1.1.19 - 9. Oktober 2026
### Der Abgleich zeigt den Fortschritt

Die Postfachliste bleibt nicht auf dem alten Zähler stehen, während Nachrichten dazukommen.

#### Verbesserungen

- **Abgleich**: Anzahl und Balken laufen nach jedem Stapel mit. Die Liste holt den Stand alle zwei Sekunden.

---

## Version 1.1.18 - 9. Oktober 2026
### Agenten laden Anhänge

Eine Rechnung im Anhang lässt sich vom Agenten auflisten und als Datei holen.

#### Neue Features

- **Anhänge**: `get_message` nennt Dateiname, Art und Größe. `get_attachment` liefert die Datei, zum Beispiel ein PDF. In der Suche sind die Dateien verlinkt.

---

## Version 1.1.17 - 9. Oktober 2026
### Einladungen erklären den Zugriff

Eine Einladung legt ein eigenes Konto an. Die Postfächer des Einladenden bleiben bei ihm.

#### Verbesserungen

- **Einladung**: Drei kleine, freigestellte Zeichnungen zeigen das eigene Konto, die getrennten Postfächer und die eigene Verbindung.

---

## Version 1.1.16 - 9. Oktober 2026
### Volle Postfächer wurden als leer gezählt

Der Server hat auf die Suche geantwortet, ohne die Nachrichtennummern mitzuschicken. Der Abgleich hat die Ordner deshalb abgeschlossen, obwohl Mails darin lagen.

#### Behoben

- **Abgleich**: Die Nummern werden ausdrücklich angefordert. Der Index liest in einem Durchgang weiter, bis der Stapel durch ist oder vier Minuten um sind.

---

## Version 1.1.15 - 9. Oktober 2026
### Postfächer synchronisieren wieder

Der Index ist beim ersten Einlesen stehen geblieben, weil der Textausschnitt geholt wurde, während die Liste noch offen war.

#### Behoben

- **Abgleich**: Erst die Nachrichten der Reihe, danach der Ausschnitt. Eine abgebrochene Verbindung beendet den Versuch und startet ihn neu.

---

## Version 1.1.14 - 9. Oktober 2026
### Sprachumschalter wie die übrigen Knöpfe

DE und EN haben dieselbe Form wie die Buttons der Seite.

#### Verbesserungen

- **Sprache**: Marineblauer Rand, Koralle für die aktive Sprache, Ecken wie bei den anderen Knöpfen.

---

## Version 1.1.13 - 9. Oktober 2026
### Deutsch und Englisch

Die Oberfläche, die Startseite und die Rechtstexte lassen sich umschalten.

#### Neue Features

- **Sprache**: Umschalter mit Flagge, wie auf sinthex.de, in den Farben der Anwendung. Die Wahl bleibt im Browser gespeichert.

---

## Version 1.1.12 - 9. Oktober 2026
### Handlungsanweisungen am Postfach

Jedes Postfach kann Regeln für Agenten tragen, zum Beispiel was gelöscht werden darf und was nur nach Zustimmung versendet wird.

#### Neue Features

- **Handlungsanweisungen**: Im Formular, in der Liste und über MCP bei den Konten, in der Suche, beim Lesen und als Vorgabe vor dem Senden.

---

## Version 1.1.11 - 9. Oktober 2026
### IMAP-Timeout beendet den Dienst nicht mehr

Ein hängender Mailserver hat den Prozess beendet. Der Timeout bleibt im Postfach stehen.

#### Behoben

- **Verbindung**: Ein Socket-Timeout von IMAP beendet MailConnect nicht mehr.

---

## Version 1.1.10 - 9. Oktober 2026
### Beschreibung am Postfach

Jedes Postfach kann sagen, wofür es da ist. Agenten lesen das, wenn mehrere Konten verbunden sind.

#### Neue Features

- **Beschreibung**: Im Formular, in der Liste und über MCP bei `list_mailboxes` und in Suchtreffern.

---

## Version 1.1.9 - 9. Oktober 2026
### Ruhigere Startseite

Die Knöpfe oben stehen in einer Reihe. Der Weg zu den Postfächern ist der erste Knopf, wenn du angemeldet bist.

#### Verbesserungen

- **Startseite**: Kein einzelner Link mehr zwischen den Knöpfen und dem Hinweis.

---

## Version 1.1.8 - 9. Oktober 2026
### Klare Verbindungsmeldung

Eine abgelehnte Anmeldung am Mailserver erscheint im Formular, statt als interner Fehler.

#### Verbesserungen

- **Postfach**: Wenn IMAP oder SMTP Benutzername oder Passwort ablehnt, steht das so im Formular.

---

## Version 1.1.7 - 9. Oktober 2026
### Startseite fürs Mitnehmen

Die Startseite verlinkt den Quellcode, Impressum und Datenschutz. In der Anwendung führt das Logo dorthin.

#### Verbesserungen

- **Navigation**: Der Punkt Erklärung ist weg. Ein Klick auf MailConnect öffnet die Startseite.
- **Mitnehmen**: GitHub und Zip liegen auf der Startseite. Diese Installation bleibt privat.
- **Rechtliches**: Impressum und Datenschutzerklärung.

---

## Version 1.1.6 - 9. Oktober 2026
### SMTP-Platzhalter

Das SMTP-Passwortfeld zeigt das IMAP-Passwort nicht mehr an.

#### Verbesserungen

- **Platzhalter**: Im SMTP-Feld steht „wie IMAP, falls abweichend“. Ein eigenes Passwort trägst du nur ein, wenn es abweicht.

---

## Version 1.1.5 - 9. Oktober 2026
### Verschlüsselter Index

Der Suchindex liegt in derselben SQLite-Datei und ist auf der Platte mitverschlüsselt.

#### Verbesserungen

- **Datenbank**: SQLCipher mit dem bestehenden Serverschlüssel. Betreff, Adressen und Schnipsel sind in der Datei unlesbar. Die Suche läuft weiter im geöffneten Dienst. Eine vorhandene Klartext-Datei wird beim Start verschlüsselt.

---

## Version 1.1.4 - 9. Oktober 2026
### Speicherung auf der Startseite

Die Startseite sagt, was in der Datenbank liegt und was davon verschlüsselt ist.

#### Verbesserungen

- **Ablage**: SQLite-Datei, AES-256-GCM für Postfach-Passwörter, Argon2id für das Anmeldepasswort, Klartext nur im Suchindex. Den ganzen Brief speichert MailConnect nicht.

---

## Version 1.1.3 - 9. Oktober 2026
### Farben wie in den Bildern

Schrift und Buttons folgen der Palette der Zeichnungen: Tinte, Koralle und Marineblau auf Creme.

#### Verbesserungen

- **Palette**: Überschriften und Fließtext in der Linienfarbe, Links in gedämpfter Koralle, der Hauptbutton im Korallenblock, der zweite Button in Marineblau.

---

## Version 1.1.2 - 9. Oktober 2026
### SMTP-Passwort übernimmt IMAP

Wenn du das IMAP-Passwort einträgst, erscheint es im SMTP-Feld als Platzhalter. Leer lassen speichert dasselbe Passwort für den Versand.

#### Verbesserungen

- **SMTP-Passwort optional**: Ein eigenes SMTP-Passwort ist nur nötig, wenn es vom IMAP-Passwort abweicht. Sonst wird das IMAP-Passwort verwendet.

---

## Version 1.1.1 - 9. Oktober 2026
### Anbieter in alphabetischer Reihenfolge

Im Auswahlfeld stehen die Mail-Anbieter von A bis Z. „Nur Versand“ und „Eigener Server“ bleiben am Ende.

#### Verbesserungen

- **Anbieterliste**: Die Namen sind alphabetisch sortiert. Die Einträge nur für SMTP und für einen eigenen Server stehen darunter.

---

## Version 1.1.0 - 9. Oktober 2026
### Die Startseite erklärt, was hier passiert

Bevor du dich anmeldest, zeigt MailConnect in vier Zeichnungen, wofür es da ist: Konten anschließen, den Index aufbauen, Agenten nur die Übersicht geben.

#### Neue Features

- **Startseite**: Unter der Adresse der Anwendung liegt eine öffentliche Seite mit dem Ablauf in Bildern. Angemeldete Personen springen von dort zu den Postfächern.
- **Änderungen**: Diese Liste ist in der Anwendung unter „Änderungen“ lesbar.

---

## Version 1.0.0 - 9. Oktober 2026
### Postfächer anbinden, Index bauen, Agenten anschließen

MailConnect speichert IMAP- und SMTP-Zugänge verschlüsselt, liest die Post in einen Suchindex und stellt denselben Stand über die Oberfläche und über MCP bereit.

#### Neue Features

- **Einladung**: Den ersten Zugang legt der Admin an. Weitere Konten entstehen nur über einen Einladungslink.
- **Postfächer**: IMAP, SMTP oder nur eines davon. Verbreitete Anbieter aus Deutschland und Europa füllen Server und Port vor. Vor dem Speichern wird die Verbindung geprüft.
- **Index**: Nach dem Einrichten liest MailConnect Ordner, Absender, Betreff und einen Textausschnitt ein und sucht darüber. Den vollen Text holt es erst beim Öffnen.
- **Agent-Tokens**: Ein Token erlaubt Suche, Lesen und, wenn SMTP eingerichtet ist, Versand. Das Postfach-Passwort bleibt im Tresor.
