export type Messages = {
  navMain: string;
  mailboxes: string;
  search: string;
  tokens: string;
  invites: string;
  account: string;
  logout: string;
  navPages: string;
  changes: string;
  login: string;
  source: string;
  download: string;
  imprint: string;
  privacy: string;
  footerNote: string;
  langLabel: string;
  heroTitle: string;
  heroLead: string;
  toMailboxes: string;
  sourceGithub: string;
  sourceShort: string;
  downloadZip: string;
  privateInstall: string;
  altHero: string;
  altPlug: string;
  altIndex: string;
  altAgent: string;
  plugTitle: string;
  plugBody: string;
  indexTitle: string;
  indexBody: string;
  agentTitle: string;
  agentBody: string;
  takeTitle: string;
  takeBody1: string;
  takeBody2: string;
  openRepo: string;
  fileTitle: string;
  fileP1: string;
  fileP2: string;
  fileP3: string;
  changelogTitle: string;
  changelogLead: string;
  imprintTitle: string;
  imprintProvider: string;
  imprintCountry: string;
  imprintDirector: string;
  imprintInstallTitle: string;
  imprintInstall: string;
  imprintDispute: string;
  imprintDisputeBody: string;
  privacyTitle: string;
  privacyWho: string;
  privacyAboutTitle: string;
  privacyAbout: string;
  privacyVisitTitle: string;
  privacyVisit: string;
  privacyAccountTitle: string;
  privacyAccount: string;
  privacyKeep: string;
  privacyRightsTitle: string;
  privacyRights: string;
  authLead: string;
  loginTitle: string;
  loginLead: string;
  email: string;
  password: string;
  signingIn: string;
  signIn: string;
  joinTitle: string;
  joinLead: string;
  missingToken: string;
  passwordHint: string;
  creatingAccount: string;
  createAccount: string;
  passwordTooShort: string;
  homeTitle: string;
  addMailbox: string;
  loadingMailboxes: string;
  emptyMailboxes: string;
  connectFirst: string;
  instructionsPrefix: string;
  indexedLine: (count: string, when: string) => string;
  smtpOnly: string;
  syncNow: string;
  syncingNow: string;
  stopSync: string;
  counting: string;
  progressLine: (indexed: string, total: string, done: string, folders: string, when: string) => string;
  edit: string;
  indexing: string;
  statusIdle: string;
  statusPaused: string;
  statusSyncing: string;
  statusError: string;
  statusSendOnly: string;
  statsLine: (messages: string, count: number, errors: number, last: string) => string;
  searchTitle: string;
  searchLead: string;
  query: string;
  mailbox: string;
  allMailboxes: string;
  searching: string;
  searchBtn: string;
  noMessages: string;
  noSubject: string;
  attachment: string;
  attachmentsHeading: string;
  message: string;
  close: string;
  from: string;
  to: string;
  date: string;
  htmlOnly: string;
  emptyBody: string;
  loadingMessage: (subject: string) => string;
  searchPrompt: string;
  tokensTitle: string;
  tokensLead: string;
  mcpStepUrlTitle: string;
  mcpStepUrlBody: string;
  mcpStepTokenTitle: string;
  mcpStepTokenBody: string;
  mcpStepUseTitle: string;
  mcpStepUseBody: string;
  mcpUrlTitle: string;
  mcpUrlBody: string;
  copyUrl: string;
  tokenStandIn: string;
  tokenName: string;
  tokenPlaceholder: string;
  createToken: string;
  creatingToken: string;
  copyTokenTitle: string;
  copyTokenLead: string;
  cursorHint: string;
  copyConfig: string;
  hide: string;
  noTokens: string;
  revoked: string;
  active: string;
  tokenMeta: (created: string, used: string) => string;
  revoke: string;
  revokeConfirm: string;
  invitesTitle: string;
  invitesLead: string;
  inviteOwnTitle: string;
  inviteOwnBody: string;
  inviteApartTitle: string;
  inviteApartBody: string;
  invitePlugTitle: string;
  invitePlugBody: string;
  emailOptional: string;
  validHours: string;
  createInvite: string;
  inviteLink: string;
  inviteOnce: string;
  copyLink: string;
  noInvites: string;
  openInvite: string;
  accepted: string;
  expired: string;
  open: string;
  inviteMeta: (created: string, until: string) => string;
  accountTitle: string;
  signedInAs: (email: string) => string;
  changePassword: string;
  currentPassword: string;
  newPassword: string;
  passwordChanged: string;
  newPasswordTooShort: string;
  addTitle: string;
  formLead: string;
  displayName: string;
  description: string;
  descriptionPlaceholder: string;
  instructions: string;
  instructionsPlaceholder: string;
  provider: string;
  chooseProvider: string;
  imapLegend: string;
  smtpLegend: string;
  enableImap: string;
  enableSmtp: string;
  server: string;
  port: string;
  implicitTls: (port: string) => string;
  username: string;
  unchanged: string;
  smtpLikeImap: string;
  testConnection: string;
  testing: string;
  connected: string;
  failed: string;
  save: string;
  saving: string;
  remove: string;
  loading: string;
  mailboxMissing: string;
  needChannel: string;
  removeConfirm: string;
  never: string;
};

export const de: Messages = {
  navMain: 'Hauptnavigation',
  mailboxes: 'Postfächer',
  search: 'Suche',
  tokens: 'Agent-Tokens',
  invites: 'Einladungen',
  account: 'Konto',
  logout: 'Abmelden',
  navPages: 'Seiten',
  changes: 'Änderungen',
  login: 'Anmelden',
  source: 'Quellcode',
  download: 'Download',
  imprint: 'Impressum',
  privacy: 'Datenschutz',
  footerNote: 'MailConnect unter MIT. Diese Installation betreibt die Sinthex Holding UG (haftungsbeschränkt).',
  langLabel: 'Sprache',
  heroTitle: 'Die Post erklärt sich nicht von allein.',
  heroLead: 'MailConnect hängt IMAP und SMTP an, liest die Briefe in einen Index und gibt Agenten die Übersicht. Das Passwort bleibt im Tresor.',
  toMailboxes: 'Zu den Postfächern',
  sourceGithub: 'Quellcode auf GitHub',
  sourceShort: 'Quellcode',
  downloadZip: 'Als Zip laden',
  privateInstall: 'Diese Adresse ist die eigene Installation. Konten für andere gibt es hier nicht.',
  altHero: 'Eine Linie sitzt auf einem großen Briefumschlag.',
  altPlug: 'Eine Person verbindet zwei Umschläge mit je einem Kabel.',
  altIndex: 'Jemand liest ruhig, während ein Stapel Briefe daneben wartet.',
  altAgent: 'Eine große Figur hält einen geschlossenen Kasten, eine kleine betrachtet einen einzelnen Brief.',
  plugTitle: 'Ein Stecker, oder zwei.',
  plugBody: 'IMAP zum Lesen, SMTP zum Senden. Beides darf sein, nur eines auch. Bevor etwas gespeichert wird, klopft MailConnect beim Server an und hört, ob jemand öffnet.',
  indexTitle: 'Erst sortieren, dann fragen.',
  indexBody: 'Kaum steht das Konto, fängt der Index an. Ordner, Absender, Betreff, ein kurzer Schnipsel. Den ganzen Brief holt erst, wer ihn wirklich aufmacht.',
  agentTitle: 'Der Agent bekommt die Karteikarte.',
  agentBody: 'Über MCP sucht er im Index, lässt sich eine Mail zeigen und verschickt, wenn SMTP da ist, auch eine. Den Schlüssel zum Postfach sieht er nicht.',
  takeTitle: 'Nimm es mit.',
  takeBody1: 'MailConnect ist dafür gedacht, auf dem eigenen Server zu laufen. Diese Installation hier bleibt bei Sinthex.',
  takeBody2: 'Der Quellcode steht unter der MIT-Lizenz auf GitHub, dazu der Stand von main als Zip. Schlüssel, Datenbank und Postfächer legst du bei dir an. Die Schritte stehen in der README im Repository.',
  openRepo: 'Repository öffnen',
  fileTitle: 'Eine Datei auf dem Server.',
  fileP1: 'Die Datenbank ist eine SQLite-Datei. Konten, Postfächer und der Index liegen darin, sonst nirgends. Die Datei selbst ist verschlüsselt. Ohne den Schlüssel des Servers bleibt auch der Index unlesbar.',
  fileP2: 'Die Passwörter der Postfächer stehen zusätzlich als AES-256-GCM darin. Der Schlüssel dafür liegt nur in der Umgebung des Servers. Dein Anmeldepasswort wird mit Argon2id gehasht. Sitzung und API-Schlüssel speichert MailConnect nur als Hash.',
  fileP3: 'Die Suche läuft im laufenden Dienst, der die Datei mit diesem Schlüssel öffnet. Den ganzen Brief holt MailConnect erst vom Mailserver, wenn jemand ihn aufmacht.',
  changelogTitle: 'Änderungen',
  changelogLead: 'Was an MailConnect dazugekommen ist, in der Reihenfolge der Versionen.',
  imprintTitle: 'Impressum',
  imprintProvider: 'Anbieterin',
  imprintCountry: 'Deutschland',
  imprintDirector: 'Geschäftsführer: Nikolai Sinthern',
  imprintInstallTitle: 'Diese Installation',
  imprintInstall: 'MailConnect unter dieser Adresse ist die eigene Installation der Anbieterin. Es ist kein Angebot, hier ein Konto anzulegen. Den Quellcode gibt es unter der MIT-Lizenz auf GitHub.',
  imprintDispute: 'Streitbeilegung',
  imprintDisputeBody: 'Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung bereit: https://ec.europa.eu/consumers/odr/. Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.',
  privacyTitle: 'Datenschutz',
  privacyWho: 'Verantwortliche Stelle',
  privacyAboutTitle: 'Worum es hier geht',
  privacyAbout: 'Diese Installation von MailConnect ist privat. Es gibt keine öffentliche Registrierung. Wer die Software nutzen will, lädt den Quellcode und betreibt sie selbst.',
  privacyVisitTitle: 'Beim Besuch der Seiten',
  privacyVisit: 'Der Server speichert in Logdateien die üblichen technischen Angaben: IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browsertyp. Das passiert, damit die Seite ausgeliefert werden kann und Störungen nachvollziehbar bleiben. Grundlage ist Artikel 6 Absatz 1 Buchstabe f DSGVO. Schriftarten kommen vom eigenen Server. Es gibt kein Tracking und keine Werbe-Cookies.',
  privacyAccountTitle: 'Wenn ein Konto angemeldet ist',
  privacyAccount: 'Für die Anmeldung liegen E-Mail-Adresse und ein Argon2id-Hash des Passworts vor. Die Sitzung steckt in einem Cookie namens mc_session, nur für den Server lesbar, auf dieser Website beschränkt. Postfach-Passwörter liegen verschlüsselt in der Datenbank. Der Suchindex enthält Ordner, Betreff, Adressen und einen kurzen Textausschnitt. Den ganzen Brief holt MailConnect erst vom jeweiligen Mailserver, wenn jemand ihn öffnet. API-Schlüssel werden nur als Hash gespeichert.',
  privacyKeep: 'Diese Daten dienen dem Betrieb der eigenen Installation. Sie werden gelöscht, wenn das Konto oder das Postfach gelöscht wird. Server-Logs löscht der Hoster nach seiner üblichen Frist.',
  privacyRightsTitle: 'Deine Rechte',
  privacyRights: 'Du kannst Auskunft, Berichtigung und Löschung verlangen, die Verarbeitung einschränken lassen und dich bei einer Aufsichtsbehörde beschweren. Zuständig ist der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Rheinland-Pfalz. Schreiben an hi@sinthex.de reicht.',
  authLead: 'Verbinde deine IMAP- und SMTP-Postfächer, baue einen durchsuchbaren Index auf und gib Agenten gezielten Zugriff über MCP.',
  loginTitle: 'Anmelden',
  loginLead: 'Melde dich mit deinem MailConnect-Konto an.',
  email: 'E-Mail',
  password: 'Passwort',
  signingIn: 'Anmelden …',
  signIn: 'Anmelden',
  joinTitle: 'Einladung annehmen',
  joinLead: 'Damit entsteht dein eigenes Konto, mit deinen eigenen Postfächern.',
  missingToken: 'Der Einladungslink enthält keinen Token.',
  passwordHint: 'Passwort (mind. 12 Zeichen)',
  creatingAccount: 'Konto wird angelegt …',
  createAccount: 'Konto anlegen',
  passwordTooShort: 'Das Passwort braucht mindestens 12 Zeichen.',
  homeTitle: 'Postfächer',
  addMailbox: 'Postfach hinzufügen',
  loadingMailboxes: 'Lade Postfächer …',
  emptyMailboxes: 'Noch kein Postfach verbunden, damit MailConnect einen Index für deine Agenten aufbauen kann.',
  connectFirst: 'Erstes Postfach verbinden',
  instructionsPrefix: 'Anweisungen',
  indexedLine: (count, when) => `${count} indiziert · zuletzt ${when}`,
  smtpOnly: 'Kein IMAP, nur Versand',
  syncNow: 'Jetzt synchronisieren',
  syncingNow: 'Synchronisiert …',
  stopSync: 'Stoppen',
  counting: 'Ordner und Mails werden gezählt',
  progressLine: (indexed, total, done, folders, when) => `${indexed} von ${total} Mails · ${done} von ${folders} Ordnern · zuletzt ${when}`,
  edit: 'Bearbeiten',
  indexing: 'Index wird aufgebaut',
  statusIdle: 'Bereit',
  statusPaused: 'Pausiert',
  statusSyncing: 'Synchronisiert',
  statusError: 'Fehler',
  statusSendOnly: 'Nur Versand',
  statsLine: (messages, count, errors, last) =>
    `${messages} Nachrichten im Index, ${count} ${count === 1 ? 'Postfach' : 'Postfächer'}${errors > 0 ? `, ${errors} mit Fehler` : ''}. Letzter Abgleich: ${last}.`,
  searchTitle: 'Suche',
  searchLead: 'Durchsucht den lokalen Index aller verbundenen Postfächer.',
  query: 'Suchbegriff',
  mailbox: 'Postfach',
  allMailboxes: 'Alle',
  searching: 'Suche …',
  searchBtn: 'Suchen',
  noMessages: 'Keine Nachrichten gefunden.',
  noSubject: '(ohne Betreff)',
  attachment: 'Anhang',
  attachmentsHeading: 'Anhänge',
  message: 'Nachricht',
  close: 'Schließen',
  from: 'Von',
  to: 'An',
  date: 'Datum',
  htmlOnly: 'Diese Nachricht enthält nur HTML-Inhalt.',
  emptyBody: '(leer)',
  loadingMessage: (subject) => `${subject} wird geladen …`,
  searchPrompt: 'Gib einen Suchbegriff ein, um den Index zu durchsuchen.',
  tokensTitle: 'Agent-Tokens',
  tokensLead: 'Mit einem Token greift ein MCP-Client wie Cursor auf Suche und Versand deiner Postfächer zu.',
  mcpStepUrlTitle: 'Die Adresse',
  mcpStepUrlBody: 'Jeder Agent benutzt dieselbe URL. Kopiere sie in die MCP-Konfiguration von Cursor.',
  mcpStepTokenTitle: 'Ein Token',
  mcpStepTokenBody: 'Das Token gehört zu einem Agenten und wird nur einmal angezeigt. Im Header steht es hinter Bearer.',
  mcpStepUseTitle: 'Danach liest er mit',
  mcpStepUseBody: 'Der Agent sucht im Index, öffnet eine Mail und kann senden, wenn SMTP eingerichtet ist. Das Passwort des Postfachs sieht er nicht.',
  mcpUrlTitle: 'MCP-Adresse',
  mcpUrlBody: 'Diese Adresse bleibt gleich. Dazu kommt der Header Authorization: Bearer und das Token. Derselbe Token geht auch als X-Api-Key, falls ein Proxy den Authorization-Header schluckt.',
  copyUrl: 'Adresse kopieren',
  tokenStandIn: 'DEIN_TOKEN',
  tokenName: 'Name des Tokens',
  tokenPlaceholder: 'z. B. Cursor auf dem Laptop',
  createToken: 'Token erstellen',
  creatingToken: 'Token wird erstellt …',
  copyTokenTitle: 'Token jetzt kopieren',
  copyTokenLead: 'Das Geheimnis wird nur dieses eine Mal angezeigt.',
  cursorHint: 'Trage in der Cursor-MCP-Konfiguration diese URL und diesen Header ein:',
  copyConfig: 'Konfiguration kopieren',
  hide: 'Ausblenden',
  noTokens: 'Noch kein Token vorhanden. Erstelle eines, um einen Agenten zu verbinden.',
  revoked: 'Widerrufen',
  active: 'Aktiv',
  tokenMeta: (created, used) => `Erstellt ${created} · zuletzt genutzt ${used}`,
  revoke: 'Widerrufen',
  revokeConfirm: 'Token widerrufen? Verbundene Agenten verlieren sofort den Zugriff.',
  invitesTitle: 'Einladungen',
  invitesLead: 'Eine Einladung öffnet ein eigenes Konto. Deine Postfächer bleiben bei dir.',
  inviteOwnTitle: 'Eigenes Konto',
  inviteOwnBody: 'Der Link gilt einmal. Wer ihn annimmt, legt E-Mail und Passwort für ein neues Konto fest.',
  inviteApartTitle: 'Getrennte Postfächer',
  inviteApartBody: 'Deine Postfächer, die Suche und die Agent-Tokens bleiben an dein Konto gebunden. Der neue Nutzer arbeitet nur mit seinem eigenen.',
  invitePlugTitle: 'Eigene Verbindung',
  invitePlugBody: 'Danach verbindet die Person ihre eigenen Postfächer. Daran hängen auch ihre Agenten.',
  emailOptional: 'E-Mail (optional)',
  validHours: 'Gültig (Stunden)',
  createInvite: 'Einladung erstellen',
  inviteLink: 'Einladungslink',
  inviteOnce: 'Wird nur jetzt angezeigt. Gib ihn sicher weiter.',
  copyLink: 'Link kopieren',
  noInvites: 'Es gibt noch keine Einladungen.',
  openInvite: 'Offene Einladung',
  accepted: 'Angenommen',
  expired: 'Abgelaufen',
  open: 'Offen',
  inviteMeta: (created, until) => `Erstellt ${created} · gültig bis ${until}`,
  accountTitle: 'Konto',
  signedInAs: (email) => `Angemeldet als ${email}.`,
  changePassword: 'Passwort ändern',
  currentPassword: 'Aktuelles Passwort',
  newPassword: 'Neues Passwort (mind. 12 Zeichen)',
  passwordChanged: 'Passwort geändert.',
  newPasswordTooShort: 'Das neue Passwort braucht mindestens 12 Zeichen.',
  addTitle: 'Postfach hinzufügen',
  formLead: 'IMAP baut den Suchindex auf, SMTP erlaubt Agenten das Senden. Zugangsdaten werden verschlüsselt gespeichert.',
  displayName: 'Anzeigename',
  description: 'Beschreibung für Agenten',
  descriptionPlaceholder: 'Wofür dieses Postfach da ist, zum Beispiel Rechnungen oder Support.',
  instructions: 'Handlungsanweisungen',
  instructionsPlaceholder: 'Zum Beispiel: Spam darf gelöscht werden. E-Mails an Kunden nur nach Zustimmung eines Menschen senden.',
  provider: 'Anbieter',
  chooseProvider: 'Anbieter wählen',
  imapLegend: 'Eingang (IMAP)',
  smtpLegend: 'Ausgang (SMTP)',
  enableImap: 'IMAP aktivieren (Index und Suche)',
  enableSmtp: 'SMTP aktivieren (Versand)',
  server: 'Server',
  port: 'Port',
  implicitTls: (port) => `Implizites TLS (${port}); aus = STARTTLS`,
  username: 'Benutzername',
  unchanged: 'unverändert',
  smtpLikeImap: 'wie IMAP, falls abweichend',
  testConnection: 'Verbindung testen',
  testing: 'Teste …',
  connected: 'Verbindung erfolgreich',
  failed: 'fehlgeschlagen',
  save: 'Speichern',
  saving: 'Speichere …',
  remove: 'Entfernen',
  loading: 'Lade …',
  mailboxMissing: 'Postfach nicht gefunden.',
  needChannel: 'Aktiviere mindestens IMAP oder SMTP.',
  removeConfirm: 'Postfach und zugehörigen Index wirklich entfernen?',
  never: 'noch nie',
};

export const en: Messages = {
  navMain: 'Main',
  mailboxes: 'Mailboxes',
  search: 'Search',
  tokens: 'Agent tokens',
  invites: 'Invitations',
  account: 'Account',
  logout: 'Sign out',
  navPages: 'Pages',
  changes: 'Changes',
  login: 'Sign in',
  source: 'Source',
  download: 'Download',
  imprint: 'Legal notice',
  privacy: 'Privacy',
  footerNote: 'MailConnect is MIT-licensed. This installation is run by Sinthex Holding UG (haftungsbeschränkt).',
  langLabel: 'Language',
  heroTitle: 'The mail does not explain itself.',
  heroLead: 'MailConnect connects IMAP and SMTP, reads the letters into an index, and gives agents the overview. The password stays in the vault.',
  toMailboxes: 'Go to mailboxes',
  sourceGithub: 'Source on GitHub',
  sourceShort: 'Source',
  downloadZip: 'Download as zip',
  privateInstall: 'This address is our own installation. There are no accounts for anyone else here.',
  altHero: 'A line sits on a large envelope.',
  altPlug: 'A person connects two envelopes, each with a cable.',
  altIndex: 'Someone reads quietly while a stack of letters waits beside them.',
  altAgent: 'A large figure holds a closed box, a small one looks at a single letter.',
  plugTitle: 'One plug, or two.',
  plugBody: 'IMAP for reading, SMTP for sending. Both are fine, and so is only one. Before anything is stored, MailConnect knocks on the server and listens for an answer.',
  indexTitle: 'Sort first, then ask.',
  indexBody: 'As soon as the account is there, the index starts. Folders, sender, subject, a short snippet. The whole letter is fetched only by whoever actually opens it.',
  agentTitle: 'The agent gets the index card.',
  agentBody: 'Over MCP it searches the index, can open a mail, and can send one when SMTP is set up. It never sees the key to the mailbox.',
  takeTitle: 'Take it with you.',
  takeBody1: 'MailConnect is meant to run on your own server. This installation stays with Sinthex.',
  takeBody2: 'The source is on GitHub under the MIT license, and the main branch is also there as a zip. You create the keys, the database, and the mailboxes yourself. The steps are in the README in the repository.',
  openRepo: 'Open repository',
  fileTitle: 'One file on the server.',
  fileP1: 'The database is a SQLite file. Accounts, mailboxes, and the index live in it, and nowhere else. The file itself is encrypted. Without the server key, the index stays unreadable too.',
  fileP2: 'Mailbox passwords are stored inside it as AES-256-GCM as well. That key lives only in the server environment. Your sign-in password is hashed with Argon2id. MailConnect stores sessions and API keys only as hashes.',
  fileP3: 'Search runs in the service that has opened the file with this key. MailConnect fetches the whole letter from the mail server only when someone opens it.',
  changelogTitle: 'Changes',
  changelogLead: 'What has been added to MailConnect, version by version.',
  imprintTitle: 'Legal notice',
  imprintProvider: 'Provider',
  imprintCountry: 'Germany',
  imprintDirector: 'Managing director: Nikolai Sinthern',
  imprintInstallTitle: 'This installation',
  imprintInstall: 'MailConnect at this address is the provider’s own installation. It is not an offer to open an account here. The source code is on GitHub under the MIT license.',
  imprintDispute: 'Dispute resolution',
  imprintDisputeBody: 'The European Commission provides a platform for online dispute resolution: https://ec.europa.eu/consumers/odr/. We are neither willing nor obliged to take part in dispute resolution before a consumer arbitration board.',
  privacyTitle: 'Privacy',
  privacyWho: 'Controller',
  privacyAboutTitle: 'What this is',
  privacyAbout: 'This installation of MailConnect is private. There is no public registration. Anyone who wants to use the software downloads the source and runs it themselves.',
  privacyVisitTitle: 'When you visit the pages',
  privacyVisit: 'The server stores the usual technical details in log files: IP address, time, requested address, browser type. That happens so the page can be delivered and faults can be traced. The basis is Article 6(1)(f) GDPR. Fonts come from this server. There is no tracking and there are no advertising cookies.',
  privacyAccountTitle: 'When an account is signed in',
  privacyAccount: 'Sign-in stores an email address and an Argon2id hash of the password. The session sits in a cookie named mc_session, readable only by the server and limited to this site. Mailbox passwords are encrypted in the database. The search index holds folders, subject, addresses, and a short snippet. MailConnect fetches the whole letter from the mail server only when someone opens it. API keys are stored only as hashes.',
  privacyKeep: 'This data is used to run our own installation. It is deleted when the account or the mailbox is deleted. The host deletes server logs on its usual schedule.',
  privacyRightsTitle: 'Your rights',
  privacyRights: 'You can request access, correction, and deletion, ask for processing to be restricted, and complain to a supervisory authority. The authority is the state commissioner for data protection and freedom of information of Rhineland-Palatinate. A message to hi@sinthex.de is enough.',
  authLead: 'Connect your IMAP and SMTP mailboxes, build a searchable index, and give agents precise access over MCP.',
  loginTitle: 'Sign in',
  loginLead: 'Sign in with your MailConnect account.',
  email: 'Email',
  password: 'Password',
  signingIn: 'Signing in …',
  signIn: 'Sign in',
  joinTitle: 'Accept invitation',
  joinLead: 'This creates your own account, with your own mailboxes.',
  missingToken: 'The invitation link has no token.',
  passwordHint: 'Password (at least 12 characters)',
  creatingAccount: 'Creating account …',
  createAccount: 'Create account',
  passwordTooShort: 'The password needs at least 12 characters.',
  homeTitle: 'Mailboxes',
  addMailbox: 'Add mailbox',
  loadingMailboxes: 'Loading mailboxes …',
  emptyMailboxes: 'No mailbox is connected yet, so MailConnect can build an index for your agents.',
  connectFirst: 'Connect the first mailbox',
  instructionsPrefix: 'Instructions',
  indexedLine: (count, when) => `${count} indexed · last ${when}`,
  smtpOnly: 'No IMAP, send only',
  syncNow: 'Sync now',
  syncingNow: 'Syncing …',
  stopSync: 'Stop',
  counting: 'Counting folders and mail',
  progressLine: (indexed, total, done, folders, when) => `${indexed} of ${total} messages · ${done} of ${folders} folders · last ${when}`,
  edit: 'Edit',
  indexing: 'Index is being built',
  statusIdle: 'Ready',
  statusPaused: 'Paused',
  statusSyncing: 'Syncing',
  statusError: 'Error',
  statusSendOnly: 'Send only',
  statsLine: (messages, count, errors, last) =>
    `${messages} messages in the index, ${count} ${count === 1 ? 'mailbox' : 'mailboxes'}${errors > 0 ? `, ${errors} with errors` : ''}. Last sync: ${last}.`,
  searchTitle: 'Search',
  searchLead: 'Searches the local index of every connected mailbox.',
  query: 'Search term',
  mailbox: 'Mailbox',
  allMailboxes: 'All',
  searching: 'Searching …',
  searchBtn: 'Search',
  noMessages: 'No messages found.',
  noSubject: '(no subject)',
  attachment: 'Attachment',
  attachmentsHeading: 'Attachments',
  message: 'Message',
  close: 'Close',
  from: 'From',
  to: 'To',
  date: 'Date',
  htmlOnly: 'This message contains only HTML.',
  emptyBody: '(empty)',
  loadingMessage: (subject) => `Loading ${subject} …`,
  searchPrompt: 'Enter a search term to look through the index.',
  tokensTitle: 'Agent tokens',
  tokensLead: 'A token lets an MCP client such as Cursor search and send through your mailboxes.',
  mcpStepUrlTitle: 'The address',
  mcpStepUrlBody: 'Every agent uses the same URL. Copy it into Cursor’s MCP configuration.',
  mcpStepTokenTitle: 'A token',
  mcpStepTokenBody: 'The token belongs to one agent and is shown only once. In the header it follows Bearer.',
  mcpStepUseTitle: 'Then it can read',
  mcpStepUseBody: 'The agent searches the index, opens a mail, and can send when SMTP is set up. It never sees the mailbox password.',
  mcpUrlTitle: 'MCP address',
  mcpUrlBody: 'This address stays the same. Add the header Authorization: Bearer and the token. The same token also works as X-Api-Key if a proxy drops the Authorization header.',
  copyUrl: 'Copy address',
  tokenStandIn: 'YOUR_TOKEN',
  tokenName: 'Token name',
  tokenPlaceholder: 'for example Cursor on the laptop',
  createToken: 'Create token',
  creatingToken: 'Creating token …',
  copyTokenTitle: 'Copy the token now',
  copyTokenLead: 'The secret is shown only this once.',
  cursorHint: 'Put this URL and this header in the Cursor MCP configuration:',
  copyConfig: 'Copy configuration',
  hide: 'Hide',
  noTokens: 'There is no token yet. Create one to connect an agent.',
  revoked: 'Revoked',
  active: 'Active',
  tokenMeta: (created, used) => `Created ${created} · last used ${used}`,
  revoke: 'Revoke',
  revokeConfirm: 'Revoke this token? Connected agents lose access immediately.',
  invitesTitle: 'Invitations',
  invitesLead: 'An invitation opens a separate account. Your mailboxes stay with you.',
  inviteOwnTitle: 'Their own account',
  inviteOwnBody: 'The link works once. Whoever accepts it chooses an email and a password for a new account.',
  inviteApartTitle: 'Separate mailboxes',
  inviteApartBody: 'Your mailboxes, search, and agent tokens stay on your account. The new user works only with their own.',
  invitePlugTitle: 'Their own connection',
  invitePlugBody: 'Afterwards they connect their own mailboxes. Their agents use those.',
  emailOptional: 'Email (optional)',
  validHours: 'Valid (hours)',
  createInvite: 'Create invitation',
  inviteLink: 'Invitation link',
  inviteOnce: 'Shown only now. Pass it on securely.',
  copyLink: 'Copy link',
  noInvites: 'There are no invitations yet.',
  openInvite: 'Open invitation',
  accepted: 'Accepted',
  expired: 'Expired',
  open: 'Open',
  inviteMeta: (created, until) => `Created ${created} · valid until ${until}`,
  accountTitle: 'Account',
  signedInAs: (email) => `Signed in as ${email}.`,
  changePassword: 'Change password',
  currentPassword: 'Current password',
  newPassword: 'New password (at least 12 characters)',
  passwordChanged: 'Password changed.',
  newPasswordTooShort: 'The new password needs at least 12 characters.',
  addTitle: 'Add mailbox',
  formLead: 'IMAP builds the search index. SMTP lets agents send. Credentials are stored encrypted.',
  displayName: 'Display name',
  description: 'Description for agents',
  descriptionPlaceholder: 'What this mailbox is for, for example invoices or support.',
  instructions: 'Instructions',
  instructionsPlaceholder: 'For example: spam may be deleted. Email to customers may be sent only with a person’s approval.',
  provider: 'Provider',
  chooseProvider: 'Choose a provider',
  imapLegend: 'Incoming (IMAP)',
  smtpLegend: 'Outgoing (SMTP)',
  enableImap: 'Enable IMAP (index and search)',
  enableSmtp: 'Enable SMTP (sending)',
  server: 'Server',
  port: 'Port',
  implicitTls: (port) => `Implicit TLS (${port}); off = STARTTLS`,
  username: 'Username',
  unchanged: 'unchanged',
  smtpLikeImap: 'same as IMAP, if different',
  testConnection: 'Test connection',
  testing: 'Testing …',
  connected: 'Connection succeeded',
  failed: 'failed',
  save: 'Save',
  saving: 'Saving …',
  remove: 'Remove',
  loading: 'Loading …',
  mailboxMissing: 'Mailbox not found.',
  needChannel: 'Enable IMAP or SMTP, or both.',
  removeConfirm: 'Remove this mailbox and its index?',
  never: 'never',
};
