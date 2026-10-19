import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SignatureView } from './SignaturePreviewPage';
import { api, errMsg, type ChannelInput, type Mailbox, type MailboxInput, type MailboxWebhook, type MailSignature, type Provider, type TestResult, type WebhookMethod } from '../api';
import { localizeStored, providerNote } from '../i18n';
import { useI18n } from '../LanguageSwitcher';

interface ChState { enabled: boolean; host: string; port: string; secure: boolean; username: string; password: string }
const emptyCh = (port: string, secure: boolean): ChState => ({ enabled: false, host: '', port, secure, username: '', password: '' });

function ChannelFields({ label, kind, st, set, hasSaved, passwordPlaceholder, passwordOptional }: {
  label: string; kind: 'imap' | 'smtp'; st: ChState; set: (p: Partial<ChState>) => void; hasSaved: boolean;
  passwordPlaceholder?: string; passwordOptional?: boolean;
}) {
  const { m } = useI18n();
  return (
    <fieldset className="channel">
      <legend>{label}</legend>
      <label className="check">
        <input type="checkbox" checked={st.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        {kind === 'imap' ? m.enableImap : m.enableSmtp}
      </label>
      {st.enabled && (
        <div className="grid2">
          <label>{m.server}<input required value={st.host} onChange={(e) => set({ host: e.target.value })} /></label>
          <label>{m.port}<input required type="number" min={1} max={65535} value={st.port} onChange={(e) => set({ port: e.target.value })} /></label>
          <label className="check span2">
            <input type="checkbox" checked={st.secure} onChange={(e) => set({ secure: e.target.checked })} />
            {m.implicitTls(kind === 'imap' ? '993' : '465')}
          </label>
          <label>{m.username}<input required autoComplete="off" value={st.username} onChange={(e) => set({ username: e.target.value })} /></label>
          <label>{m.password}
            <input type="password" autoComplete="new-password" required={!passwordOptional && !hasSaved} placeholder={passwordPlaceholder || (hasSaved ? m.unchanged : '')} value={st.password} onChange={(e) => set({ password: e.target.value })} />
          </label>
        </div>
      )}
    </fieldset>
  );
}

export function MailboxFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { m } = useI18n();
  const nav = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [existing, setExisting] = useState<Mailbox | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [webhooks, setWebhooks] = useState<MailboxWebhook[]>([]);
  const [signatures, setSignatures] = useState<MailSignature[]>([]);
  const [knownFolders, setKnownFolders] = useState<string[]>([]);
  const [webhookDraft, setWebhookDraft] = useState<WebhookDraft | null>(null);
  const [section, setSection] = useState<Section>(params.get('bereich') === 'signaturen' ? 'signatures' : 'general');
  const [previewId, setPreviewId] = useState('');
  const [email, setEmail] = useState('');
  const [providerId, setProviderId] = useState('');
  const [imap, setImap] = useState<ChState>(emptyCh('993', true));
  const [smtp, setSmtp] = useState<ChState>(emptyCh('587', false));
  const [sentFolder, setSentFolder] = useState('');
  const [serverStoresSent, setServerStoresSent] = useState(false);
  const [userTouched, setUserTouched] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<'' | 'test' | 'save' | 'delete'>('');
  const [loaded, setLoaded] = useState(!id);

  useEffect(() => {
    api<{ providers: Provider[] }>('providers').then((r) => setProviders(r.providers)).catch((e) => setErr(errMsg(e)));
  }, []);

  useEffect(() => {
    if (!id) return;
    api<{ mailboxes: Mailbox[] }>('mailboxes').then((r) => {
      const found = r.mailboxes.find((x) => x.id === id);
      if (!found) { setErr(m.mailboxMissing); return; }
      setExisting(found); setDisplayName(found.displayName); setDescription(found.description); setInstructions(found.instructions); setWebhooks((found.webhooks ?? []).map((hook) => ({ ...hook, excludedFolders: hook.excludedFolders ?? [] })));
      const stored = found.signatures ?? [];
      setSignatures(stored);
      setPreviewId((current) => stored.some((item) => item.id === current) ? current : (stored.find((item) => item.isDefault)?.id ?? stored[0]?.id ?? ''));
      setEmail(found.email); setProviderId(found.providerId || ''); setUserTouched(true);
      setImap(found.imap ? { enabled: true, host: found.imap.host, port: String(found.imap.port), secure: found.imap.secure, username: found.imap.username, password: '' } : emptyCh('993', true));
      setSmtp(found.smtp ? { enabled: true, host: found.smtp.host, port: String(found.smtp.port), secure: found.smtp.secure, username: found.smtp.username, password: '' } : emptyCh('587', false));
      setSentFolder(found.sentFolder ?? '');
      setServerStoresSent(Boolean(found.serverStoresSent));
      setLoaded(true);
    }).catch((e) => setErr(errMsg(e)));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let gone = false;
    api<{ folders: { folder: string }[] }>(`mailboxes/${id}/folders`)
      .then((data) => { if (!gone) setKnownFolders(data.folders.map((folder) => folder.folder)); })
      .catch(() => { if (!gone) setKnownFolders([]); });
    return () => { gone = true; };
  }, [id]);

  const provider = useMemo(() => providers.find((p) => p.id === providerId), [providers, providerId]);

  function pickProvider(pid: string) {
    setProviderId(pid);
    const p = providers.find((x) => x.id === pid);
    if (!p) return;
    if (p.imap) setImap((s) => ({ ...s, enabled: true, host: p.imap!.host, port: String(p.imap!.port), secure: p.imap!.secure }));
    if (p.smtp) setSmtp((s) => ({ ...s, enabled: true, host: p.smtp!.host, port: String(p.smtp!.port), secure: p.smtp!.secure }));
  }

  function changeEmail(v: string) {
    setEmail(v);
    if (!userTouched) { setImap((s) => ({ ...s, username: v })); setSmtp((s) => ({ ...s, username: v })); }
  }

  function toInput(): MailboxInput | null {
    const conv = (s: ChState): ChannelInput | null => {
      if (!s.enabled) return null;
      const c: ChannelInput = { host: s.host.trim(), port: Number(s.port), secure: s.secure, username: s.username.trim() || email };
      if (s.password) c.password = s.password;
      return c;
    };
    const body = { displayName: displayName.trim(), description: description.trim(), instructions: instructions.trim(), webhooks, email: email.trim(), providerId, imap: conv(imap), smtp: conv(smtp), sentFolder: sentFolder.trim(), serverStoresSent };
    if (!body.imap && !body.smtp) { setErr(m.needChannel); return null; }
    return body;
  }

  async function test() {
    const body = toInput(); if (!body) return;
    setBusy('test'); setErr(''); setResult(null);
    try {
      setResult(await api<TestResult>(id ? `mailboxes/${id}/test` : 'mailboxes/test', 'POST', body));
    } catch (e) {
      const b = (e as { body?: TestResult }).body;
      if (b && (b.imap || b.smtp)) setResult(b); else setErr(errMsg(e));
    } finally { setBusy(''); }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const body = toInput(); if (!body) return;
    setBusy('save'); setErr('');
    try {
      if (id) await api(`mailboxes/${id}`, 'PATCH', body); else await api('mailboxes', 'POST', body);
      nav('/postfaecher');
    } catch (x) { setErr(errMsg(x)); setBusy(''); }
  }

  async function remove() {
    if (!id || !window.confirm(m.removeConfirm)) return;
    setBusy('delete');
    try { await api(`mailboxes/${id}`, 'DELETE'); nav('/postfaecher'); } catch (x) { setErr(errMsg(x)); setBusy(''); }
  }

  if (!loaded) return <p className="muted">{err || m.loading}</p>;

  const line = (name: string, r?: { ok: boolean; error?: string }) => r && (
    <li className={r.ok ? 'ok' : 'error'}>{name}: {r.ok ? m.connected : (r.error ? localizeStored(r.error) : m.failed)}</li>
  );
  const shown = signatures.find((item) => item.id === previewId) ?? null;

  return (
    <div className="settings-layout">
      <nav className="settings-sub" aria-label={m.settingsNav}>
        <button type="button" role="tab" aria-selected={section === 'general'} onClick={() => setSection('general')}>{m.sectionGeneral}</button>
        <button type="button" role="tab" aria-selected={section === 'connection'} onClick={() => setSection('connection')}>{m.sectionConnection}</button>
        <button type="button" role="tab" aria-selected={section === 'webhooks'} onClick={() => setSection('webhooks')}>{m.sectionWebhooks}</button>
        <button type="button" role="tab" aria-selected={section === 'signatures'} onClick={() => setSection('signatures')}>{m.sectionSignatures}</button>
      </nav>
      <div className="settings-pane">
        <header className="page-head">
          <div>
            <h1>{existing ? existing.displayName : m.addTitle}</h1>
            <p className="muted">{m.formLead}</p>
          </div>
        </header>
        <form className={`card form wide${section === 'signatures' ? ' signature-form' : ''}`} onSubmit={save}>
          <div className="grid2" hidden={section !== 'general'}>
            <label>{m.displayName}<input required maxLength={120} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /><span className="muted small hint">{m.displayNameHint}</span></label>
            <label>{m.email}<input type="email" required value={email} onChange={(e) => changeEmail(e.target.value)} /></label>
            <label className="span2">{m.description}
              <textarea maxLength={500} rows={3} placeholder={m.descriptionPlaceholder} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <label className="span2">{m.instructions}
              <textarea maxLength={2000} rows={4} placeholder={m.instructionsPlaceholder} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
            </label>
          </div>
          <div hidden={section !== 'connection'}>
            <label>{m.provider}
              <select required value={providerId} onChange={(e) => pickProvider(e.target.value)}>
                <option value="" disabled>{m.chooseProvider}</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.region ? ` (${p.region})` : ''}</option>)}
              </select>
            </label>
            {provider?.note && <p className="note">{providerNote(provider.id, provider.note)}</p>}
            <ChannelFields label={m.imapLegend} kind="imap" st={imap} set={(p) => { if (p.username !== undefined) setUserTouched(true); setImap((s) => ({ ...s, ...p })); }} hasSaved={!!existing?.imap} />
            <ChannelFields label={m.smtpLegend} kind="smtp" st={smtp} set={(p) => { if (p.username !== undefined) setUserTouched(true); setSmtp((s) => ({ ...s, ...p })); }} hasSaved={!!existing?.smtp} passwordOptional={imap.enabled && (imap.password.length > 0 || !!existing?.imap)} passwordPlaceholder={imap.enabled && (imap.password || !existing?.smtp) ? m.smtpLikeImap : undefined} />
            {result && <ul className="results" aria-live="polite">{line('IMAP', result.imap)}{line('SMTP', result.smtp)}</ul>}
            <label>{m.sentFolder}
              <input maxLength={400} value={sentFolder} placeholder={m.sentFolderPlaceholder} onChange={(e) => setSentFolder(e.target.value)} />
              <span className="muted small hint">{m.sentFolderHint}</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={serverStoresSent} onChange={(e) => setServerStoresSent(e.target.checked)} />
              {m.serverStoresSent}
            </label>
            <p className="muted small">{m.serverStoresSentHint}</p>
          </div>
          <div className="webhooks" hidden={section !== 'webhooks'}>
            <p className="muted small">{m.webhooksHint}</p>
            <button type="button" className="btn" disabled={webhooks.length >= 5} onClick={() => setWebhookDraft(emptyWebhook())}>+ {m.addWebhook}</button>
            {webhooks.length === 0 ? <p className="muted small">{m.webhookEmpty}</p> : (
              <ul className="rows">
                {webhooks.map((hook, index) => (
                  <li className="row" key={`${hook.method}-${hook.url}-${index}`}>
                    <div className="row-main">
                      <div className="row-title"><span className="status-word">{hook.method}</span><span className="webhook-url">{hook.url}</span></div>
                      {hook.excludedFolders.length > 0 && <p className="muted small">{m.webhookExcludedCount(hook.excludedFolders.length)}</p>}
                    </div>
                    <div className="row-actions">
                      <button type="button" className="btn" onClick={() => setWebhookDraft({ index, ...hook, excludedFolders: hook.excludedFolders ?? [] })}>{m.edit}</button>
                      <button type="button" className="btn danger" onClick={() => {
                        const next = webhooks.filter((_, item) => item !== index);
                        if (!id) { setWebhooks(next); return; }
                        void api<{ mailbox: Mailbox }>(`mailboxes/${id}/webhooks`, 'PATCH', { webhooks: next })
                          .then((saved) => setWebhooks((saved.mailbox.webhooks ?? []).map((item) => ({ ...item, excludedFolders: item.excludedFolders ?? [] }))))
                          .catch((error) => setErr(errMsg(error)));
                      }}>{m.remove}</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="signature-split" hidden={section !== 'signatures'}>
            <div>
              <p className="muted">{id ? m.signaturesLead : m.signaturesAfterSave}</p>
              {id && signatures.length === 0 ? <p className="muted small">{m.signaturesEmpty}</p> : null}
              {id && signatures.length > 0 ? (
                <ul className="signature-list">
                  {signatures.map((signature) => (
                    <li key={signature.id}>
                      <button type="button" className={`signature-card${signature.id === previewId ? ' is-selected' : ''}`} aria-pressed={signature.id === previewId} onClick={() => setPreviewId(signature.id)}>
                        <span className="signature-title">
                          <strong>{signature.title}</strong>
                          {signature.isDefault ? <span className="status-word">{m.signatureDefault}</span> : null}
                          <span className="muted small">{signature.kind === 'html' ? m.signatureHtml : m.signaturePlain}</span>
                        </span>
                        {signature.instructions ? <span className="muted small">{signature.instructions}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <aside className="signature-preview" aria-label={m.signaturePreview}>
              {shown ? (
                <>
                  <header>
                    <p className="muted small">{shown.kind === 'html' ? m.signatureHtml : m.signaturePlain}</p>
                    <h2>{shown.title}</h2>
                  </header>
                  <SignatureView signature={shown} />
                </>
              ) : <p className="muted signature-plain">{m.signaturePick}</p>}
            </aside>
          </div>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="actions">
            {section === 'connection' && <button type="button" className="btn" disabled={!!busy} onClick={() => void test()}>{busy === 'test' ? m.testing : m.testConnection}</button>}
            <button type="submit" className="btn primary" disabled={!!busy}>{busy === 'save' ? m.saving : m.save}</button>
            {id && <button type="button" className="btn danger" disabled={!!busy} onClick={() => void remove()}>{m.remove}</button>}
          </div>
        </form>
      </div>
      {webhookDraft && (
        <WebhookDialog
          draft={webhookDraft}
          folders={knownFolders}
          onChange={setWebhookDraft}
          onCancel={() => setWebhookDraft(null)}
          onApply={async (hook) => {
            const next = webhookDraft.index === null
              ? [...webhooks, hook]
              : webhooks.map((item, index) => index === webhookDraft.index ? hook : item);
            if (!id) {
              setWebhooks(next);
              return;
            }
            const saved = await api<{ mailbox: Mailbox }>(`mailboxes/${id}/webhooks`, 'PATCH', { webhooks: next });
            setWebhooks((saved.mailbox.webhooks ?? []).map((item) => ({ ...item, excludedFolders: item.excludedFolders ?? [] })));
          }}
        />
      )}
    </div>
  );
}

type Section = 'general' | 'connection' | 'webhooks' | 'signatures';

function FolderPicks({ folders, excluded, onToggle }: {
  folders: string[];
  excluded: string[];
  onToggle: (folder: string, included: boolean) => void;
}) {
  const { m } = useI18n();
  const names = [...new Set([...folders, ...excluded])].sort((a, b) => {
    if (a === 'INBOX') return -1;
    if (b === 'INBOX') return 1;
    return a.localeCompare(b, 'de');
  });
  return (
    <div className="webhook-folders-block">
      <span className="webhook-label">{m.webhookFolders}</span>
      <p className="muted small">{m.webhookFoldersHint}</p>
      {names.length === 0 ? <p className="muted small">{m.webhookFoldersEmpty}</p> : (
        <ul className="folder-list">
          {names.map((folder) => {
            const isExcluded = excluded.includes(folder);
            const missing = folders.length > 0 && !folders.includes(folder);
            return (
              <li key={folder}>
                <button
                  type="button"
                  className={`folder-row${isExcluded ? ' is-out' : ''}`}
                  aria-pressed={isExcluded}
                  onClick={() => onToggle(folder, isExcluded)}
                >
                  <span className="folder-x" aria-hidden="true">{isExcluded ? '×' : ''}</span>
                  <span className="folder-name">{folder}{missing ? <span className="muted small"> {m.webhookFolderMissing}</span> : null}</span>
                  <span className="folder-state">{isExcluded ? m.webhookFolderExcluded : m.webhookFolderActive}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

type WebhookDraft = MailboxWebhook & { index: number | null };

function emptyWebhook(): WebhookDraft {
  return { index: null, url: '', method: 'POST', secret: '', header: '', excludedFolders: [] };
}

function WebhookDialog({ draft, folders, onChange, onCancel, onApply }: {
  draft: WebhookDraft;
  folders: string[];
  onChange: (draft: WebhookDraft) => void;
  onCancel: () => void;
  onApply: (hook: MailboxWebhook) => Promise<void>;
}) {
  const { m } = useI18n();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function apply() {
    const url = draft.url.trim();
    const header = draft.header.trim();
    if (!url.startsWith('https://') || url.includes(' ')) { setError(m.webhookBadUrl); return; }
    if (header && !/^[A-Za-z0-9-]{1,64}:\s*\S/.test(header)) { setError(m.webhookBadHeader); return; }
    setSaving(true);
    setError('');
    try {
      await onApply({ url, method: draft.method, secret: draft.secret.trim(), header, excludedFolders: draft.excludedFolders ?? [] });
      onCancel();
    } catch (caught) {
      setError(errMsg(caught));
      setSaving(false);
    }
  }

  return (
    <div className="modal-back">
      <div className="modal webhook-modal" role="dialog" aria-modal="true" aria-labelledby="webhook-title" onKeyDown={(event) => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type !== 'checkbox') { event.preventDefault(); void apply(); } }}>
        <h2 id="webhook-title">{m.webhookTitle}</h2>
        <label>{m.webhookMethod}
          <select value={draft.method} onChange={(e) => onChange({ ...draft, method: e.target.value as WebhookMethod })}>
            <option>POST</option>
            <option>PUT</option>
            <option>PATCH</option>
          </select>
        </label>
        <label>{m.webhookUrl}<input required type="url" autoFocus value={draft.url} placeholder="https://" onChange={(e) => onChange({ ...draft, url: e.target.value })} /></label>
        <label>{m.webhookSecret}<input type="password" autoComplete="new-password" value={draft.secret} onChange={(e) => onChange({ ...draft, secret: e.target.value })} /></label>
        <label>{m.webhookHeader}
          <input value={draft.header} placeholder="Authorization: Bearer …" onChange={(e) => onChange({ ...draft, header: e.target.value })} />
          <span className="muted small hint">{m.webhookHeaderHint}</span>
        </label>
        <FolderPicks
          folders={folders}
          excluded={draft.excludedFolders ?? []}
          onToggle={(folder, included) => {
            const current = draft.excludedFolders ?? [];
            const next = included ? current.filter((item) => item !== folder) : current.includes(folder) ? current : [...current, folder];
            onChange({ ...draft, excludedFolders: next });
          }}
        />
        {error && <p className="error" role="alert">{error}</p>}
        <div className="actions">
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>{m.webhookCancel}</button>
          <button type="button" className="btn primary" onClick={() => void apply()} disabled={saving}>{saving ? m.saving : m.webhookApply}</button>
        </div>
      </div>
    </div>
  );
}
