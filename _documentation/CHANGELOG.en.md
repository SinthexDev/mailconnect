# MailConnect – Changes

## Version 1.2.0 - 29 October 2026
### Audit and monitoring for agents

It was not traceable which agent did what. Several agents behind one token (for example Grok Bot) could not be told apart.

#### New features

- **Audit log**: Every MCP call is recorded with time, token, agent, tool, mailbox, affected mails, input, returned data (data flow), duration and result. Sent mails are logged with recipients, subject, text, attachment names and message ID. Passwords, webhook secrets and attachment contents are never stored.
- **Agent name required**: Every tool has an `agent` parameter. Alternatively the agent identifies itself with the `X-Agent-Name` header. Without a name the call is rejected and logged as denied (can be disabled with `MAILCONNECT_REQUIRE_AGENT_NAME=0`). `X-Agent-Run-Id` optionally groups a run.
- **Several agents per token**: The Agents view shows calls, errors, mails sent, deletions and tools used per token and agent.
- **More sources**: Sign-in, tokens, mailboxes, reading and sending in the UI, failed token authentication, MCP handshakes and webhook deliveries with the reported mails.
- **UI and API**: New Audit page with filters (agent, token, type, status, mailbox, period, full text), detail view, JSON or CSV export (`/api/audit`, `/api/audit/agents`, `/api/audit/export`).
- **Tamper protection**: Entries are hash-chained. Administrators verify the chain with “Verify integrity” (`/api/audit/verify`).

---

## Version 1.1.46 - 28 October 2026
### Sign in with a username

Sign-in only accepted the email address. A short login name was missing.

#### New features

- **Account**: Under Account you can set a username (3–32 characters). Sign-in accepts the email or that name. Saving it empty clears it.

---

## Version 1.1.45 - 27 October 2026
### Priority for the recipient

`flags` only marked the Sent copy. Recipients never saw high priority.

#### New features

- **Sending**: `priority` with `high`, `normal` or `low` sets `X-Priority`, `X-MSMail-Priority` and `Importance` on the outbound mail. `high` is urgency for the recipient; `flags` remains the IMAP mark on Sent only.

---

## Version 1.1.44 - 27 October 2026
### Flags when sending

The Sent copy only got `\\Seen`. A priority flag (`\\Flagged`) could not be set at send time.

#### Improvements

- **Sending**: `send_email` and the API accept optional `flags`, for example `\\Flagged` or `prio`. The Sent copy always has `\\Seen` plus those marks. When `flags` are set, the copy is stored even if the server keeps Sent itself. `\\Draft` and `\\Deleted` are not allowed when sending.
- **Flags**: The aliases `prio`, `priority`, `important` and `starred` map to `\\Flagged`. After sending, `set_message_flags` still works.

---

## Version 1.1.43 - 20 October 2026
### The signature preview sits on the right

The preview opened its own tab and had no way back.

#### Improvements

- **Signatures**: A click on an entry shows the text beside it, plain text and HTML. The separate page keeps a link back to the mailbox signatures.

---

## Version 1.1.42 - 19 October 2026
### Signatures for agents

Signatures used to live only in the mail text an agent had to write itself. There was no place to store or view them.

#### New features

- **Signatures**: One default signature per mailbox and up to 50 more. Each has a title, the type plain text or HTML, the text, and instructions. Agents create them with `save_mailbox_signature`, read them with `list_mailbox_signatures`, and remove them with `delete_mailbox_signature`.
- **View**: In the mailbox, under Signatures, “View” opens the text in a new tab. HTML is rendered without running scripts. Plain text keeps its line breaks.

---

## Version 1.1.41 - 19 October 2026
### Sent storage can be controlled

The copy after sending was always on, without a switch and without a folder name of its own. The reply still said `saved`. `append_message` accepted only 1 MB.

#### Improvements

- **Sending**: `saveToSent` controls the copy. The default is on, unless the mailbox says the server stores it. The stored message is the same bytes that were sent, with `\\Seen`. The reply includes `sentFolder`, `sentUid`, `savedToSent` and, on failure, `saveError`. Sending still succeeds when only storing fails.
- **Mailbox**: A custom Sent folder and the switch “The server stores Sent itself”, in the interface under Connection.
- **Messages**: `append_message` accepts an RFC822 message up to 28 MB. Replace an existing copy by deleting it with `delete_messages` and appending the complete message.

---

## Version 1.1.40 - 19 October 2026
### Sent mail is stored in the Sent folder

A mail sent through MCP only left via SMTP. It was not in the mailbox afterwards.

#### Improvements

- **Sending**: After sending, MailConnect stores the mail in the Sent folder and in the index. If that folder is missing, Sent is created. The reply includes `sentFolder` and `saved`.

---

## Version 1.1.39 - 18 October 2026
### Folder selection speaks of exclusions

The folder list in the webhook window used checkmarks for “included”.

#### Improvements

- **Webhook**: Each row shows an × for excluded. Without an × the folder is active. The hint text speaks of exclusions. Excluded folders are struck through.

---

## Version 1.1.38 - 18 October 2026
### Folders belong to one webhook

The folder list sat on the mailbox page and applied to every webhook.

#### Improvements

- **Webhook**: Which folders stay quiet is set in that webhook’s window. Without a check it says “excluded”.
- **Mailbox**: Next to the main menu are the sections General, Connection and Webhooks.
- **MCP**: `set_webhook_folders` applies to one webhook, identified by its address.

---

## Version 1.1.37 - 18 October 2026
### Webhooks can be turned off per folder

New mail fired the webhook in every folder.

#### Improvements

- **Folders**: On a mailbox every folder starts checked. Removing a check excludes that folder. Subfolders stay separate entries.
- **MCP**: `set_webhook_folders` sets this list. `list_mailbox_webhooks` shows it as `excludedFolders`.

---

## Version 1.1.36 - 18 October 2026
### The agent stores webhooks itself

Webhooks could only be saved in the interface.

#### Improvements

- **MCP**: `set_mailbox_webhooks` replaces the webhooks of a mailbox. `list_mailbox_webhooks` shows address, method and header. The key is only reported as set or not.

---

## Version 1.1.35 - 18 October 2026
### The webhook stays saved

The button in the window kept the webhook only on the page. After leaving, it was gone.

#### Fixed

- **Webhook**: Save writes the webhook to the mailbox immediately. Remove does the same.

---

## Version 1.1.34 - 18 October 2026
### Provider notes no longer look like errors

The username note under the provider was coral and read like an error message.

#### Improvements

- **Note**: Calm navy, smaller text. Errors stay red.

---

## Version 1.1.33 - 18 October 2026
### The webhook button sits under the text

The plus button stood to the right of the heading and pressed against the sentence below.

#### Fixed

- **Webhook**: Heading, explanation, and button are stacked, with space between them.

---

## Version 1.1.32 - 18 October 2026
### Webhooks with method, key, and header

A webhook was only an address and always went out as POST. Cursor also needs the key and the Authorization header.

#### Improvements

- **Webhook**: The plus button opens a window. It holds the method (POST, PUT, or PATCH), address, key, and header. The key is sent as Bearer unless the header already sets Authorization.

---

## Version 1.1.31 - 18 October 2026
### Check every minute, and webhooks for new mail

Sync ran only inside the process, about every two minutes. A bot learned about new mail only when it looked.

#### New features

- **Cron**: Every minute a cron run starts the check. A mailbox that is already indexed only looks for new message numbers. The first large pass still runs in the background.
- **Webhooks**: A mailbox can store up to five https addresses. After the first indexing pass, new mail makes MailConnect call them with sender, subject, and index id. The first pass does not report the old mail.

---

## Version 1.1.30 - 18 October 2026
### The agent can start a sync

New mail sometimes did not reach the index on its own. The agent could not reliably start the sync.

#### Improvements

- **Sync**: `sync_mailbox` starts the sync. Without a mailbox it covers every account that is not stopped. A named mailbox starts again even after a stop. The reply includes the current progress. A later search sees the new mail once that pass has fetched it.

---

## Version 1.1.29 - 17 October 2026
### The sender name comes from the mailbox

Sending showed only the address. A name such as “Vanessa | Sinthex” was missing.

#### New features

- **Sender**: The mailbox display name is placed in front of the address when mail goes out. `fromName` overrides it for a single mail, at most 100 characters.

---

## Version 1.1.28 - 17 October 2026
### The version number is in the application

The signed-in interface did not show which version is running.

#### Improvements

- **Version**: The version number sits under the name in the sidebar. It opens the changelog.

---

## Version 1.1.27 - 17 October 2026
### The agent can send attachments

A mail went out as text only. Files such as a mockup or a zip did not go with it.

#### New features

- **Sending**: `send_email` accepts up to 10 attachments as Base64. Together they may not exceed 20 MB. The reply includes `messageId` and `attachmentCount`.

---

## Version 1.1.26 - 15 October 2026
### Button links reach the agent

A password-reset mail often keeps the link only in the HTML button. The agent saw the sentence, but not the address.

#### Fixed

- **Reading**: `get_message` returns `links` with the target and the label. When the address is missing from the plain text, it is appended. Search shows it as a link under the message.

---

## Version 1.1.25 - 15 October 2026
### The agent works inside the mailbox

Search, reading, and sending were already there. Deleting, moving, flagging, and the folders themselves only worked on the mail server.

#### New features

- **Messages**: `delete_messages` deletes mail, `move_messages` and `copy_messages` put it in another folder. `set_message_flags` sets, adds, or removes marks such as seen or flagged. `append_message` stores a message in a folder, for example Drafts.
- **Folders**: `list_folders` and `list_imap_folders` can list only the direct subfolders. Creating, renaming, deleting, and subscribing each have a tool. `folder_status` reports the count and the unseen messages.
- **Search**: `search_messages` filters by a flag. `search_imap` searches on the server and returns UIDs.
- **Index**: After the change, folder, UID, and flags in the search index match the server.

---

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
