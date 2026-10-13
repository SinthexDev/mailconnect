import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errMsg, type ChannelInput, type Mailbox, type MailboxInput, type Provider, type TestResult } from '../api';
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
  const { m } = useI18n();
  const nav = useNavigate();
  const [providers, setProviders] = useState<Provider[]>([]);
  const [existing, setExisting] = useState<Mailbox | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [email, setEmail] = useState('');
  const [providerId, setProviderId] = useState('');
  const [imap, setImap] = useState<ChState>(emptyCh('993', true));
  const [smtp, setSmtp] = useState<ChState>(emptyCh('587', false));
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
      setExisting(found); setDisplayName(found.displayName); setDescription(found.description); setInstructions(found.instructions); setEmail(found.email); setProviderId(found.providerId || ''); setUserTouched(true);
      setImap(found.imap ? { enabled: true, host: found.imap.host, port: String(found.imap.port), secure: found.imap.secure, username: found.imap.username, password: '' } : emptyCh('993', true));
      setSmtp(found.smtp ? { enabled: true, host: found.smtp.host, port: String(found.smtp.port), secure: found.smtp.secure, username: found.smtp.username, password: '' } : emptyCh('587', false));
      setLoaded(true);
    }).catch((e) => setErr(errMsg(e)));
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
    const body = { displayName: displayName.trim(), description: description.trim(), instructions: instructions.trim(), email: email.trim(), providerId, imap: conv(imap), smtp: conv(smtp) };
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

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{existing ? existing.displayName : m.addTitle}</h1>
          <p className="muted">{m.formLead}</p>
        </div>
      </header>
      <form className="card form wide" onSubmit={save}>
        <div className="grid2">
          <label>{m.displayName}<input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
          <label>{m.email}<input type="email" required value={email} onChange={(e) => changeEmail(e.target.value)} /></label>
          <label className="span2">{m.description}
            <textarea maxLength={500} rows={3} placeholder={m.descriptionPlaceholder} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label className="span2">{m.instructions}
            <textarea maxLength={2000} rows={4} placeholder={m.instructionsPlaceholder} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>
          <label className="span2">{m.provider}
            <select required value={providerId} onChange={(e) => pickProvider(e.target.value)}>
              <option value="" disabled>{m.chooseProvider}</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.region ? ` (${p.region})` : ''}</option>)}
            </select>
          </label>
        </div>
        {provider?.note && <p className="note">{providerNote(provider.id, provider.note)}</p>}
        <ChannelFields label={m.imapLegend} kind="imap" st={imap} set={(p) => { if (p.username !== undefined) setUserTouched(true); setImap((s) => ({ ...s, ...p })); }} hasSaved={!!existing?.imap} />
        <ChannelFields label={m.smtpLegend} kind="smtp" st={smtp} set={(p) => { if (p.username !== undefined) setUserTouched(true); setSmtp((s) => ({ ...s, ...p })); }} hasSaved={!!existing?.smtp} passwordOptional={imap.enabled && (imap.password.length > 0 || !!existing?.imap)} passwordPlaceholder={imap.enabled && (imap.password || !existing?.smtp) ? m.smtpLikeImap : undefined} />
        {result && <ul className="results" aria-live="polite">{line('IMAP', result.imap)}{line('SMTP', result.smtp)}</ul>}
        {err && <p className="error" role="alert">{err}</p>}
        <div className="actions">
          <button type="button" className="btn" disabled={!!busy} onClick={() => void test()}>{busy === 'test' ? m.testing : m.testConnection}</button>
          <button type="submit" className="btn primary" disabled={!!busy}>{busy === 'save' ? m.saving : m.save}</button>
          {id && <button type="button" className="btn danger" disabled={!!busy} onClick={() => void remove()}>{m.remove}</button>}
        </div>
      </form>
    </>
  );
}
