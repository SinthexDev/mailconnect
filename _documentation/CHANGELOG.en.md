# MailConnect – Changes

## Version 1.1.24 - 9 October 2026
### The agent token reaches the connector

A client sent the token and still got “Bearer token required”. The Authorization header was dropped on the way.

#### Fixed

- **MCP**: The proxy forwards the Authorization header. The same token also works in the X-Api-Key header. A missing token still says “Bearer-Token erforderlich”. A wrong token now says “Token ungültig”.

---

## Version 1.1.23 - 9 October 2026
### Creating a token shows at once that it is working

Several clicks created several tokens, because the button did not change.

#### Fixed

- **Token**: The button immediately shows a spinning ring and “Creating token …”. Further clicks do not count. Afterwards the page moves to the new secret, and the token appears in the list.

---

## Version 1.1.22 - 9 October 2026
### The token page shows the MCP address

The address appeared only after creating a token. It is always there now, with a short guide.

#### Improvements

- **MCP**: The address can be copied, and below it is the Cursor configuration with a placeholder for the token.
- **Guide**: Three small drawings explain the address, the token, and what the agent can do afterwards.

---

## Version 1.1.21 - 9 October 2026
### Sync can be stopped, and the counts climb

The ring in the button stood still, the bar was gone, and you could not see how many messages and folders were already in.

#### Improvements

- **Stop**: While sync is running the button becomes “Stop”. The ring inside it turns. The index then stays where it is until you start again.
- **Progress**: A bar shows how much of the mailbox is already in the index. Under it you see how many messages of the total, and how many folders of the total, are indexed. The numbers climb as new messages arrive.

---

## Version 1.1.20 - 9 October 2026
### One broken folder no longer stops the whole mailbox

The connection to Sinthex was fine. Three folders with an umlaut in the name cannot be opened, and sync therefore saved nothing.

#### Fixed

- **Sync**: Folders the server will not open are skipped. The rest is indexed.
- **Progress**: A spinner turns in the button while sync is running.

---

## Version 1.1.19 - 9 October 2026
### Sync shows its progress

The mailbox list no longer keeps the old count while messages are still coming in.

#### Improvements

- **Sync**: The count and the bar advance after each batch. The list refreshes every two seconds.

---

## Version 1.1.18 - 9 October 2026
### Agents download attachments

An invoice attached to a message can be listed and fetched as a file by an agent.

#### New features

- **Attachments**: `get_message` names the file, its type, and its size. `get_attachment` returns the file, for example a PDF. Search links the files.

---

## Version 1.1.17 - 9 October 2026
### Invitations explain access

An invitation creates a separate account. The inviter's mailboxes stay with them.

#### Improvements

- **Invitation**: Three small cut-out drawings show the separate account, the separate mailboxes, and the person's own connection.

---

## Version 1.1.16 - 9 October 2026
### Full mailboxes were counted as empty

The server answered the search without sending the message numbers. Sync then closed the folders even though mail was sitting in them.

#### Fixed

- **Sync**: The numbers are requested explicitly. The index keeps reading in one pass until the batch is done or four minutes are up.

---

## Version 1.1.15 - 9 October 2026
### Mailboxes sync again

The index stalled on the first read, because the snippet was fetched while the message list was still open.

#### Fixed

- **Sync**: The messages come first, then the snippet. A dropped connection ends the attempt and starts it again.

---

## Version 1.1.14 - 9 October 2026
### The language switcher matches the other buttons

DE and EN use the same shape as the buttons on the page.

#### Improvements

- **Language**: Navy outline, coral for the active language, the same corners as the other buttons.

---

## Version 1.1.13 - 9 October 2026
### German and English

The interface, the landing page, and the legal pages can be switched.

#### New features

- **Language**: A switcher with a flag, as on sinthex.de, in the colours of this app. The choice stays in the browser.

---

## Version 1.1.12 - 9 October 2026
### Instructions on a mailbox

Each mailbox can carry rules for agents, for example what may be deleted and what may be sent only with approval.

#### New features

- **Instructions**: In the form, in the list, and over MCP on the accounts, in search, when reading, and as a rule before sending.

---

## Version 1.1.11 - 9 October 2026
### An IMAP timeout no longer stops the service

A hanging mail server used to stop the process. The timeout now stays on the mailbox.

#### Fixed

- **Connection**: An IMAP socket timeout no longer stops MailConnect.

---

## Version 1.1.10 - 9 October 2026
### A description on the mailbox

Each mailbox can say what it is for. Agents read that when several accounts are connected.

#### New features

- **Description**: In the form, in the list, and over MCP on `list_mailboxes` and in search hits.

---

## Version 1.1.9 - 9 October 2026
### A calmer landing page

The buttons at the top sit in one row. The way to the mailboxes is the first button when you are signed in.

#### Improvements

- **Landing page**: No lone link between the buttons and the note.

---

## Version 1.1.8 - 9 October 2026
### A clear connection message

A rejected sign-in at the mail server appears in the form, instead of as an internal error.

#### Improvements

- **Mailbox**: When IMAP or SMTP rejects the username or password, the form says so.

---

## Version 1.1.7 - 9 October 2026
### A landing page you can take with you

The landing page links the source, the legal notice, and the privacy page. In the app, the logo leads there.

#### Improvements

- **Navigation**: The item “Erklärung” is gone. A click on MailConnect opens the landing page.
- **Take it with you**: GitHub and the zip are on the landing page. This installation stays private.
- **Legal**: Legal notice and privacy policy.

---

## Version 1.1.6 - 9 October 2026
### SMTP placeholder

The SMTP password field no longer shows the IMAP password.

#### Improvements

- **Placeholder**: The SMTP field says “same as IMAP, if different”. You enter a password only when it differs.

---

## Version 1.1.5 - 9 October 2026
### Encrypted index

The search index lives in the same SQLite file and is encrypted on disk with it.

#### Improvements

- **Database**: SQLCipher with the existing server key. Subject, addresses, and snippets are unreadable in the file. Search still runs in the open service. An existing plaintext file is encrypted on startup.

---

## Version 1.1.4 - 9 October 2026
### Storage on the landing page

The landing page says what is in the database and what of it is encrypted.

#### Improvements

- **Storage**: A SQLite file, AES-256-GCM for mailbox passwords, Argon2id for the sign-in password, plaintext only in the search index while the service is running. MailConnect does not store the whole letter.

---

## Version 1.1.3 - 9 October 2026
### Colours from the drawings

Type and buttons follow the palette of the drawings: ink, coral, and navy on cream.

#### Improvements

- **Palette**: Headings and body text in the line colour, links in muted coral, the main button in the coral block, the second button in navy.

---

## Version 1.1.2 - 9 October 2026
### The SMTP password takes IMAP

When you enter the IMAP password, it appears in the SMTP field as a placeholder. Leaving it empty stores the same password for sending.

#### Improvements

- **SMTP password optional**: A separate SMTP password is needed only when it differs from the IMAP password. Otherwise the IMAP password is used.

---

## Version 1.1.1 - 9 October 2026
### Providers in alphabetical order

The select lists mail providers from A to Z. “Send only” and “Your own server” stay at the end.

#### Improvements

- **Provider list**: The names are sorted alphabetically. The entries for SMTP only and for your own server sit below them.

---

## Version 1.1.0 - 9 October 2026
### The landing page explains what happens here

Before you sign in, MailConnect shows in four drawings what it is for: connect accounts, build the index, give agents only the overview.

#### New features

- **Landing page**: At the address of the app there is a public page with the flow in pictures. Signed-in people jump from there to the mailboxes.
- **Changes**: This list is readable in the app under “Changes”.

---

## Version 1.0.0 - 9 October 2026
### Connect mailboxes, build an index, attach agents

MailConnect stores IMAP and SMTP access encrypted, reads the mail into a search index, and serves the same state through the interface and through MCP.

#### New features

- **Invitation**: The admin creates the first access. Further accounts exist only through an invitation link.
- **Mailboxes**: IMAP, SMTP, or only one of them. Common providers from Germany and Europe fill in server and port. The connection is checked before saving.
- **Index**: After setup, MailConnect reads folders, sender, subject, and a snippet, and searches across them. It fetches the full text only when a message is opened.
- **Agent tokens**: A token allows search, reading, and, when SMTP is set up, sending. The mailbox password stays in the vault.
